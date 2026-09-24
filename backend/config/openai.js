const OpenAI = require('openai');
require('dotenv').config();

// Phase 43 (OpenAI Preliminary Pricing Service) -- a server-only, narrowly
// scoped adapter used EXCLUSIVELY by backend/services/pricingProviders/
// openaiPricingProvider.js for preliminary line-item cost suggestions. This
// is intentionally never imported by aiService.js's report-narrative/vision
// pipeline (Claude/watsonx stays the only provider there, per the
// 2026-07-18 OpenAI-removal decision recorded in CLAUDE.md) -- see PHASES.md
// Phase 43's "Reason this phase is required" note: that removal was a
// provider-strategy choice for narrative/vision generation, not a ban on a
// new, isolated adapter for a different purpose. Modeled directly on
// config/anthropic.js's shape (lazy client, never throws at require-time,
// warns + returns null when unconfigured).
//
// Model: gpt-4o-mini (default) -- a real, Chat Completions structured-output
// ("response_format: json_schema", strict mode) -capable model, chosen for
// low per-call cost appropriate to a "preliminary/editable" suggestion
// rather than an authoritative figure. Configurable via OPENAI_MODEL so the
// client can trade quality vs. cost without a code change (same pattern as
// ANTHROPIC_MODEL).
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 20000;
const MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS) || 2000;

let client;
const getClient = () => {
  if (client) return client;
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY not set — preliminary pricing unavailable');
    return null;
  }
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: TIMEOUT_MS });
  return client;
};

// Pure request-object builder -- no network call, fully unit-testable
// without a client/key/network. `jsonSchema` is a plain JSON-Schema object
// (caller-owned shape); `schemaName` must satisfy OpenAI's a-zA-Z0-9_-,
// <=64-char constraint. `strict: true` is always set -- Structured Outputs'
// strict mode is what makes the response schema-guaranteed rather than
// merely schema-requested.
const buildPricingRequest = ({
  systemPrompt,
  userPrompt,
  jsonSchema,
  schemaName,
  maxOutputTokens,
  model,
}) => ({
  model: model || MODEL,
  max_tokens: maxOutputTokens || MAX_OUTPUT_TOKENS,
  messages: [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: userPrompt },
  ],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: schemaName || 'pricing_suggestions',
      schema: jsonSchema,
      strict: true,
    },
  },
});

// Maps a raw OpenAI SDK error into one of pricingService's categorized error
// codes. NEVER lets the raw SDK error message/stack/headers escape this
// function to a caller that might surface it to an HTTP response or a
// report -- full detail is logged server-side only (no API key/auth header
// is ever part of `err.message`/`err.status`, so this logging is safe).
const categorize = (err) => {
  const status = err?.status;
  const retryAfterHeader =
    (typeof err?.headers?.get === 'function'
      ? err.headers.get('retry-after')
      : err?.headers?.['retry-after']) || undefined;
  const retryAfterMs =
    retryAfterHeader && Number.isFinite(Number(retryAfterHeader))
      ? Number(retryAfterHeader) * 1000
      : undefined;

  let code = 'PRICING_MALFORMED_RESPONSE';
  if (err?.name === 'APIConnectionTimeoutError' || err?.code === 'ETIMEDOUT') {
    code = 'PRICING_TIMEOUT';
  } else if (status === 429) {
    code = 'PRICING_RATE_LIMITED';
  } else if (
    status === 402 ||
    (status === 403 && /quota|billing|insufficient/i.test(err?.message || ''))
  ) {
    code = 'PRICING_QUOTA_EXCEEDED';
  } else if (status === 401 || status === 403) {
    code = 'PRICING_AUTH_FAILED';
  } else if (typeof status === 'number' && status >= 500) {
    code = 'PRICING_TIMEOUT'; // upstream 5xx treated as transient, same retry/backoff path as a real timeout
  }

  console.error(
    `OpenAI pricing request failed (server-side only, code=${code}, status=${status ?? 'n/a'}):`,
    err?.message || err
  );

  const wrapped = new Error('The pricing provider could not complete this request.');
  wrapped.code = code;
  wrapped.retryAfterMs = retryAfterMs;
  wrapped.transient = code === 'PRICING_TIMEOUT' || code === 'PRICING_RATE_LIMITED';
  return wrapped;
};

// Calls the Chat Completions API with a structured-output JSON schema and
// returns the parsed JSON body. Throws a categorized error (see categorize
// above) on any transport/auth/rate-limit failure, and a
// `PRICING_MALFORMED_RESPONSE`-coded error on empty/truncated/non-JSON
// content -- callers never need to guard against an unhandled rejection
// type they don't recognize.
// `client` is an optional injected override (test-only seam -- production
// callers never pass it, so `getClient()` -- the real, lazily-constructed
// SDK client -- is always what's used at runtime). This mirrors this
// codebase's existing DI convention for stubbing an SDK boundary in tests
// (see image-analysis-batching.test.js's `callVisionApi` injection into
// aiService.analyzeImages) without ever making a real network call.
const generateStructuredPricing = async ({
  systemPrompt,
  userPrompt,
  jsonSchema,
  schemaName,
  maxOutputTokens,
  timeoutMs,
  signal,
  client: injectedClient,
}) => {
  const c = injectedClient || getClient();
  if (!c) {
    const err = new Error('OpenAI not configured (OPENAI_API_KEY missing)');
    err.code = 'PRICING_PROVIDER_UNAVAILABLE';
    throw err;
  }

  const request = buildPricingRequest({
    systemPrompt,
    userPrompt,
    jsonSchema,
    schemaName,
    maxOutputTokens,
  });

  let resp;
  try {
    resp = await c.chat.completions.create(request, {
      ...(timeoutMs ? { timeout: timeoutMs } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') {
      const cancelled = new Error('Pricing request cancelled');
      cancelled.code = 'PRICING_CANCELLED';
      throw cancelled;
    }
    throw categorize(err);
  }

  const choice = resp?.choices?.[0];
  if (choice?.finish_reason === 'length') {
    const err = new Error('OpenAI response was truncated before completion');
    err.code = 'PRICING_MALFORMED_RESPONSE';
    throw err;
  }
  const raw = choice?.message?.content;
  if (!raw || typeof raw !== 'string') {
    const err = new Error('OpenAI returned empty content');
    err.code = 'PRICING_MALFORMED_RESPONSE';
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const err = new Error('OpenAI response was not valid JSON');
    err.code = 'PRICING_MALFORMED_RESPONSE';
    throw err;
  }
  return { parsed, usage: resp.usage || null, model: resp.model || MODEL };
};

const checkHealth = async () => {
  const c = getClient();
  if (!c) return false;
  try {
    await c.models.retrieve(MODEL);
    return true;
  } catch {
    return false;
  }
};

module.exports = {
  getClient,
  buildPricingRequest,
  generateStructuredPricing,
  checkHealth,
  MODEL,
  TIMEOUT_MS,
  MAX_OUTPUT_TOKENS,
};
