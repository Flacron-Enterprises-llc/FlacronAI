const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPricingRequest, generateStructuredPricing } = require('../config/openai');

// Phase 43. Tests backend/config/openai.js's adapter mechanics WITHOUT ever
// calling the real OpenAI API: `buildPricingRequest` is a pure function
// (tested directly, no client at all); `generateStructuredPricing` is
// tested via its `client` override param (test-only DI seam, see that
// function's own header comment) with a fake `chat.completions.create` --
// never the real SDK/network.

test('buildPricingRequest wires model/schema/messages correctly', () => {
  const schema = { type: 'object', properties: {}, required: [], additionalProperties: false };
  const req = buildPricingRequest({
    systemPrompt: 'sys',
    userPrompt: 'user',
    jsonSchema: schema,
    schemaName: 'my_schema',
    maxOutputTokens: 1234,
    model: 'gpt-4o-mini',
  });
  assert.equal(req.model, 'gpt-4o-mini');
  assert.equal(req.max_tokens, 1234);
  assert.deepEqual(req.messages, [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'user' },
  ]);
  assert.equal(req.response_format.type, 'json_schema');
  assert.equal(req.response_format.json_schema.name, 'my_schema');
  assert.equal(req.response_format.json_schema.strict, true);
  assert.equal(req.response_format.json_schema.schema, schema);
});

test('buildPricingRequest omits the system message when none is given', () => {
  const req = buildPricingRequest({ userPrompt: 'user', jsonSchema: {} });
  assert.deepEqual(req.messages, [{ role: 'user', content: 'user' }]);
});

test('buildPricingRequest falls back to the default model/schema name/token cap', () => {
  const req = buildPricingRequest({ userPrompt: 'user', jsonSchema: {} });
  assert.equal(req.model, 'gpt-4o-mini');
  assert.equal(req.response_format.json_schema.name, 'pricing_suggestions');
  assert.equal(req.max_tokens, 2000);
});

const fakeClient = (createImpl) => ({ chat: { completions: { create: createImpl } } });

test('generateStructuredPricing returns the parsed JSON body on a valid response', async () => {
  const client = fakeClient(async (request, opts) => {
    assert.equal(request.model, 'gpt-4o-mini');
    assert.equal(opts.timeout, 5000);
    return {
      choices: [
        { finish_reason: 'stop', message: { content: JSON.stringify({ items: [{ a: 1 }] }) } },
      ],
      usage: { total_tokens: 42 },
      model: 'gpt-4o-mini-2024-07-18',
    };
  });
  const result = await generateStructuredPricing({
    userPrompt: 'x',
    jsonSchema: {},
    timeoutMs: 5000,
    client,
  });
  assert.deepEqual(result.parsed, { items: [{ a: 1 }] });
  assert.equal(result.usage.total_tokens, 42);
  assert.equal(result.model, 'gpt-4o-mini-2024-07-18');
});

test('generateStructuredPricing rejects non-JSON content as PRICING_MALFORMED_RESPONSE', async () => {
  const client = fakeClient(async () => ({
    choices: [{ finish_reason: 'stop', message: { content: 'not json {' } }],
  }));
  await assert.rejects(
    () => generateStructuredPricing({ userPrompt: 'x', jsonSchema: {}, client }),
    (err) => {
      assert.equal(err.code, 'PRICING_MALFORMED_RESPONSE');
      return true;
    }
  );
});

test('generateStructuredPricing rejects empty content as PRICING_MALFORMED_RESPONSE', async () => {
  const client = fakeClient(async () => ({
    choices: [{ finish_reason: 'stop', message: { content: '' } }],
  }));
  await assert.rejects(
    () => generateStructuredPricing({ userPrompt: 'x', jsonSchema: {}, client }),
    { code: 'PRICING_MALFORMED_RESPONSE' }
  );
});

test('generateStructuredPricing rejects a truncated (finish_reason: length) response as PRICING_MALFORMED_RESPONSE', async () => {
  const client = fakeClient(async () => ({
    choices: [{ finish_reason: 'length', message: { content: '{}' } }],
  }));
  await assert.rejects(
    () => generateStructuredPricing({ userPrompt: 'x', jsonSchema: {}, client }),
    { code: 'PRICING_MALFORMED_RESPONSE' }
  );
});

test('generateStructuredPricing maps a 429 SDK error to PRICING_RATE_LIMITED and never leaks the raw error message', async () => {
  const client = fakeClient(async () => {
    const err = new Error(
      'You exceeded your current quota, please check your plan and billing details.'
    );
    err.status = 429;
    err.headers = { 'retry-after': '3' };
    throw err;
  });
  await assert.rejects(
    () => generateStructuredPricing({ userPrompt: 'x', jsonSchema: {}, client }),
    (err) => {
      assert.equal(err.code, 'PRICING_RATE_LIMITED');
      assert.equal(err.retryAfterMs, 3000);
      assert.equal(err.transient, true);
      assert.doesNotMatch(
        err.message,
        /quota|billing/i,
        'the raw provider error message must never be forwarded verbatim'
      );
      return true;
    }
  );
});

test('generateStructuredPricing maps a 401 SDK error to PRICING_AUTH_FAILED, non-transient, generic message', async () => {
  const client = fakeClient(async () => {
    const err = new Error('Incorrect API key provided: sk-secret-value-should-never-leak');
    err.status = 401;
    throw err;
  });
  await assert.rejects(
    () => generateStructuredPricing({ userPrompt: 'x', jsonSchema: {}, client }),
    (err) => {
      assert.equal(err.code, 'PRICING_AUTH_FAILED');
      assert.equal(err.transient, false);
      assert.doesNotMatch(
        err.message,
        /sk-secret-value-should-never-leak/,
        'a leaked API key string must never reach a thrown error message'
      );
      return true;
    }
  );
});

test('generateStructuredPricing maps a 5xx SDK error to PRICING_TIMEOUT (transient, retried the same as a real timeout)', async () => {
  const client = fakeClient(async () => {
    const err = new Error('internal server error');
    err.status = 503;
    throw err;
  });
  await assert.rejects(
    () => generateStructuredPricing({ userPrompt: 'x', jsonSchema: {}, client }),
    (err) => {
      assert.equal(err.code, 'PRICING_TIMEOUT');
      assert.equal(err.transient, true);
      return true;
    }
  );
});

test('generateStructuredPricing maps a 402 SDK error to PRICING_QUOTA_EXCEEDED (non-retryable)', async () => {
  const client = fakeClient(async () => {
    const err = new Error('payment required');
    err.status = 402;
    throw err;
  });
  await assert.rejects(
    () => generateStructuredPricing({ userPrompt: 'x', jsonSchema: {}, client }),
    (err) => {
      assert.equal(err.code, 'PRICING_QUOTA_EXCEEDED');
      assert.equal(err.transient, false);
      return true;
    }
  );
});

test('generateStructuredPricing throws PRICING_PROVIDER_UNAVAILABLE when no client is available (no key configured) and never crashes', async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(() => generateStructuredPricing({ userPrompt: 'x', jsonSchema: {} }), {
      code: 'PRICING_PROVIDER_UNAVAILABLE',
    });
  } finally {
    if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
  }
});

test('generateStructuredPricing surfaces cancellation as PRICING_CANCELLED', async () => {
  const controller = new AbortController();
  const client = fakeClient(async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  });
  controller.abort();
  await assert.rejects(
    () =>
      generateStructuredPricing({
        userPrompt: 'x',
        jsonSchema: {},
        client,
        signal: controller.signal,
      }),
    { code: 'PRICING_CANCELLED' }
  );
});
