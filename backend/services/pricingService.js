// Phase 43 (OpenAI Preliminary Pricing Service). Provider-agnostic
// orchestration layer: request validation, cache lookup/write, bounded
// retry with backoff, strict output validation, and server-side total
// computation. Reuses backend/utils/canonicalEstimate.js's own primitives
// (UNIT_VOCABULARY/isValidCurrency/validateMoney/isFiniteNumber/MAX_QTY)
// rather than re-defining money/unit rules, per the phase's own instruction
// not to reinvent that validation.
//
// Golden Rule #2/#4 (load-bearing design decision): structural/scope fields
// of a line item -- room, damageType, repairAction, description, material,
// quantity, unit -- are ALWAYS taken from the caller's own request, NEVER
// from the AI provider's response. The provider is only ever asked to
// suggest materialUnitCost/laborUnitCost/equipmentUnitCost/confidence/
// assumptions(/trade/category as a classification convenience, same as
// Phase 8's existing AI photo-category classification precedent) for a
// scope the USER already defined. This makes "AI never invents what is
// being repaired, only price components for what the user said is being
// repaired" a structural property of this module, not just a prompt
// instruction. `unitPrice`/`lineTotal` are likewise ALWAYS computed here
// from the validated components -- any "total"-shaped field a provider
// response might contain is never even read.
//
// A generated proposal is NEVER persisted by this module -- it is returned
// to the route as a plain object; only the existing, unmodified
// canonicalEstimateStore.upsertCanonicalEstimate (via the existing PUT
// /:id/canonical-estimate route) ever writes a report's estimate, and it
// alone enforces REPORT_FINALIZED and server-recomputes every dollar
// figure. This module's own REPORT_FINALIZED check (in the route, before
// this module is even called) exists only to block *generating* a new
// proposal against a finalized report -- it changes nothing about how a
// proposal is applied/saved.
const crypto = require('crypto');
const { Timestamp } = require('../config/firebase');
const { computePricingFingerprint } = require('../utils/pricingFingerprint');
const { getPricingProvider } = require('./pricingProviders/registry');
const openaiConfig = require('../config/openai');
const {
  UNIT_VOCABULARY,
  isValidCurrency,
  validateMoney,
  isFiniteNumber,
  MAX_QTY,
} = require('../utils/canonicalEstimate');
// Phase 43 trust-boundary correction (2026-09-19). This module now ALSO
// persists a short-lived, server-side proposal record for every generated
// proposal (createPricingProposal) and reads the estimate's current
// revision (getCanonicalEstimate) to stamp the proposal's `baseRevision` --
// see pricingProposalStore.js's header comment for why this is a separate
// collection from `pricingSuggestionsCache` above. Requiring
// canonicalEstimateStore.js here (a Phase 41 module) introduces no cycle:
// that module requires only canonicalEstimate.js and pricingProposalStore.js,
// neither of which ever requires this file back.
const { createPricingProposal } = require('../utils/pricingProposalStore');
const { getCanonicalEstimate } = require('../utils/canonicalEstimateStore');

// Mirrors canonicalEstimate.js's own CONFIDENCE_LEVELS (not exported from
// that module -- see this phase's own instruction to keep changes to
// canonicalEstimate.js to the two named, additive edits only, so this is a
// deliberate, harmless duplication of a 3-value constant rather than
// widening that file's public surface).
const CONFIDENCE_LEVELS = new Set(['low', 'medium', 'high']);

const CACHE_COLLECTION = 'pricingSuggestionsCache';
const SCHEMA_VERSION = 1; // pricing-suggestion request/response schema version (independent of canonicalEstimate's own schemaVersion)

const MAX_ITEMS_PER_REQUEST = Number(process.env.PRICING_MAX_ITEMS_PER_REQUEST) || 25;
const MAX_RETRIES = Number(process.env.PRICING_MAX_RETRIES) || 2;
const RETRY_BASE_MS = Number(process.env.PRICING_RETRY_BASE_MS) || 500;
const CACHE_TTL_DAYS = Number(process.env.PRICING_CACHE_TTL_DAYS) || 30;

// Same length caps canonicalEstimate.js's own validateLineItems uses, so a
// proposal item is never accidentally more permissive than what the
// canonical estimate would itself accept.
const CAP = {
  room: 100,
  damageType: 100,
  repairAction: 60,
  description: 300,
  material: 150,
  tradeOrCategory: 60,
  assumptions: 500,
};

const cleanString = (v, maxLen) =>
  String(v ?? '')
    .trim()
    .slice(0, maxLen);

const makeError = (message, code, extra) =>
  Object.assign(new Error(message), { code }, extra || {});

// --- request validation --------------------------------------------------

const validateRequestItem = (raw, index) => {
  const row = raw && typeof raw === 'object' ? raw : {};
  const label = `items[${index}]`;

  const targetLineItemId = row.targetLineItemId ? cleanString(row.targetLineItemId, 60) : null;
  const room = cleanString(row.room, CAP.room);
  const damageType = cleanString(row.damageType, CAP.damageType);
  const repairAction = cleanString(row.repairAction, CAP.repairAction);
  const description = cleanString(row.description, CAP.description);
  const material = cleanString(row.material, CAP.material);
  const trade = cleanString(row.trade, CAP.tradeOrCategory);
  const category = cleanString(row.category, CAP.tradeOrCategory);

  if (!room) return { error: `${label}: room is required`, field: `${label}.room` };
  if (!description)
    return { error: `${label}: description is required`, field: `${label}.description` };

  const quantity = Number(row.quantity);
  if (!isFiniteNumber(quantity) || quantity <= 0 || quantity > MAX_QTY) {
    return {
      error: `${label}: quantity must be a positive finite number no greater than ${MAX_QTY}`,
      field: `${label}.quantity`,
    };
  }

  const unit = cleanString(row.unit, 10).toUpperCase();
  if (!UNIT_VOCABULARY.has(unit)) {
    return {
      error: `${label}: unit "${row.unit}" is not a supported unit (${[...UNIT_VOCABULARY].join(', ')})`,
      field: `${label}.unit`,
    };
  }

  const requestId = `req_${index}_${crypto.randomBytes(4).toString('hex')}`;
  return {
    value: {
      requestId,
      targetLineItemId,
      room,
      damageType,
      repairAction,
      description,
      material,
      trade,
      category,
      quantity,
      unit,
    },
  };
};

// Validates the whole POST body. Returns either `{ value }` or
// `{ error, code, field }` -- the route maps the latter straight to a 400
// VALIDATION_ERROR / 429 PRICING_LIMIT_EXCEEDED response. Missing/invalid
// regional input is reported with the SPECIFIC missing field (never a
// generic "bad request") per this phase's own error-taxonomy requirement.
const validatePricingRequestBody = (body) => {
  const b = body && typeof body === 'object' ? body : {};

  const country = cleanString(b.locationContext?.country, 60);
  if (!country) {
    return {
      error: 'locationContext.country is required to generate preliminary pricing',
      code: 'VALIDATION_ERROR',
      field: 'locationContext.country',
    };
  }
  const locationContext = {
    country,
    state: cleanString(b.locationContext?.state, 60),
    city: cleanString(b.locationContext?.city, 100),
    postalCode: cleanString(b.locationContext?.postalCode, 20),
  };

  const currencyRaw = cleanString(b.currency, 3).toUpperCase() || 'USD';
  if (!isValidCurrency(currencyRaw)) {
    return {
      error: `currency must be a 3-letter ISO 4217 code (received "${b.currency}")`,
      code: 'VALIDATION_ERROR',
      field: 'currency',
    };
  }

  const pricingDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.pricingDate || ''))
    ? b.pricingDate
    : new Date().toISOString().slice(0, 10);

  const rawItems = Array.isArray(b.items) ? b.items : [];
  if (rawItems.length === 0) {
    return {
      error: 'At least one item is required to generate preliminary pricing',
      code: 'VALIDATION_ERROR',
      field: 'items',
    };
  }
  if (rawItems.length > MAX_ITEMS_PER_REQUEST) {
    return {
      error: `At most ${MAX_ITEMS_PER_REQUEST} items may be priced in a single request`,
      code: 'PRICING_LIMIT_EXCEEDED',
      field: 'items',
    };
  }

  const items = [];
  for (let i = 0; i < rawItems.length; i++) {
    const { value, error, field } = validateRequestItem(rawItems[i], i);
    if (error) return { error, code: 'VALIDATION_ERROR', field };
    items.push(value);
  }

  return {
    value: {
      locationContext,
      currency: currencyRaw,
      pricingDate,
      items,
      regenerate: b.regenerate === true,
    },
  };
};

// --- provider-response validation ----------------------------------------

// Validates ONE raw item the provider returned against the SAME money/
// currency primitives canonicalEstimate.js's own line-item validation uses.
// Unexpected/extra fields on `raw` are stripped by construction -- only the
// named fields below are ever read off it. Returns `{ value }` or
// `{ error }` (never throws) so the caller can skip a single bad item
// without failing the whole batch.
const validateProviderItem = (raw, requestById, expectedCurrency) => {
  const row = raw && typeof raw === 'object' ? raw : {};
  const requestId = cleanString(row.requestId, 80);
  const request = requestById.get(requestId);
  if (!request) return { error: `Provider returned a suggestion for an unrecognized requestId` };

  const trade = cleanString(row.trade, CAP.tradeOrCategory) || request.trade;
  const category = cleanString(row.category, CAP.tradeOrCategory) || request.category || trade;
  if (!category)
    return { error: `Provider suggestion for "${requestId}" is missing both trade and category` };

  const { value: materialUnitCost, error: matErr } = validateMoney(
    row.materialUnitCost,
    'materialUnitCost'
  );
  if (matErr) return { error: `Provider suggestion for "${requestId}": ${matErr}` };
  const { value: laborUnitCost, error: laborErr } = validateMoney(
    row.laborUnitCost,
    'laborUnitCost'
  );
  if (laborErr) return { error: `Provider suggestion for "${requestId}": ${laborErr}` };
  const { value: equipmentUnitCost, error: equipErr } = validateMoney(
    row.equipmentUnitCost,
    'equipmentUnitCost'
  );
  if (equipErr) return { error: `Provider suggestion for "${requestId}": ${equipErr}` };

  const currency = cleanString(row.currency, 3).toUpperCase();
  if (!isValidCurrency(currency))
    return { error: `Provider suggestion for "${requestId}" returned an invalid currency` };
  if (currency !== expectedCurrency) {
    // Reject (never silently convert) -- see this phase's explicit
    // "currency matches the estimate's own currency exactly" requirement.
    return {
      error: `Provider suggestion for "${requestId}" returned currency ${currency}, expected ${expectedCurrency} -- discarded, not converted`,
    };
  }

  const confidence = CONFIDENCE_LEVELS.has(row.confidence) ? row.confidence : 'medium';
  const assumptions = cleanString(row.assumptions, CAP.assumptions);

  return {
    value: {
      requestId,
      trade,
      category,
      materialUnitCost,
      laborUnitCost,
      equipmentUnitCost,
      currency,
      confidence,
      assumptions,
    },
  };
};

// --- caching ---------------------------------------------------------------

const cacheDocRef = (db, fingerprint) => db.collection(CACHE_COLLECTION).doc(fingerprint);

// A cache doc holds ONLY generic, fingerprint-derived content -- no
// reportId/userId/PII (see pricingFingerprint.js's header comment). Expired
// entries are treated as a miss (never served), never deleted here (a
// periodic sweep is an ops concern outside this phase's scope).
const getCachedItem = async (db, fingerprint) => {
  const snap = await cacheDocRef(db, fingerprint).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data?.expiresAt || toEpochMs(data.expiresAt) < Date.now()) return null;
  return data.item;
};

// `expiresAt` is written as a Firestore Timestamp (not an ISO string) so the
// TTL policy on pricingSuggestionsCache.expiresAt can actually delete expired
// docs -- Firestore TTL ignores non-Timestamp fields. Reads accept both, so
// any legacy ISO-string entries are still honoured until they expire.
const toEpochMs = (value) => {
  if (!value) return NaN;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime();
};

const setCachedItem = async (db, fingerprint, item) => {
  const now = new Date();
  const expiresAt = Timestamp.fromDate(new Date(now.getTime() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000));
  await cacheDocRef(db, fingerprint).set({
    fingerprint,
    item,
    generatedAt: now.toISOString(),
    expiresAt,
  });
};

// --- provider call with bounded retry ---------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Only ever retries a TRANSIENT failure (timeout/5xx/429, `.transient ===
// true` -- set by config/openai.js's categorize()); a validation/auth/
// malformed-response failure is re-thrown immediately on the first attempt.
// Honors a provider-reported Retry-After (`.retryAfterMs`) by waiting at
// least that long even if it exceeds the computed exponential backoff.
const callProviderWithRetry = async (provider, normalizedInput, { timeoutMs, signal }) => {
  let attempt = 0;
  for (;;) {
    if (signal?.aborted) throw makeError('Pricing request cancelled', 'PRICING_CANCELLED');
    try {
      return await provider.generatePricing(normalizedInput, { timeoutMs, signal });
    } catch (err) {
      if (signal?.aborted || err?.code === 'PRICING_CANCELLED') {
        throw makeError('Pricing request cancelled', 'PRICING_CANCELLED');
      }
      const transient = err?.transient === true;
      if (!transient || attempt >= MAX_RETRIES) throw err;
      const backoffMs = RETRY_BASE_MS * 2 ** attempt;
      const waitMs = err?.retryAfterMs ? Math.max(backoffMs, err.retryAfterMs) : backoffMs;
      await sleep(waitMs);
      attempt += 1;
    }
  }
};

// --- server-side total computation ----------------------------------------

// The ONLY place a proposal item's unitPrice/lineTotal are computed --
// always from the just-validated components, never from anything the
// provider claims as a total (the provider is never even asked for one --
// see openaiPricingProvider.js's schema).
const buildProposalItem = (request, validated, providerModel, pricingDate) => {
  const materialUnitCostCents = Math.round(validated.materialUnitCost * 100);
  const laborUnitCostCents = Math.round(validated.laborUnitCost * 100);
  const equipmentUnitCostCents = Math.round(validated.equipmentUnitCost * 100);
  const unitPriceCents = materialUnitCostCents + laborUnitCostCents + equipmentUnitCostCents;
  const lineTotalCents = Math.round(request.quantity * unitPriceCents);
  return {
    // Phase 43 trust-boundary correction (2026-09-19): renamed from
    // `proposalItemId` -- this is now the OPAQUE, single-use handle a
    // client accepts and later references (via `appliedProposal
    // .acceptedSuggestionIds`) to apply this exact suggestion, matching the
    // server-side `pricingProposals/{proposalId}.items.{suggestionId}`
    // record this same value is stored under (pricingProposalStore.js).
    suggestionId: `sug_${crypto.randomBytes(6).toString('hex')}`,
    targetLineItemId: request.targetLineItemId || null,
    room: request.room,
    trade: validated.trade,
    category: validated.category,
    damageType: request.damageType,
    repairAction: request.repairAction,
    description: request.description,
    material: request.material,
    quantity: request.quantity,
    unit: request.unit,
    materialUnitCost: materialUnitCostCents / 100,
    laborUnitCost: laborUnitCostCents / 100,
    equipmentUnitCost: equipmentUnitCostCents / 100,
    unitPrice: unitPriceCents / 100,
    lineTotal: lineTotalCents / 100,
    assumptions: validated.assumptions,
    confidence: validated.confidence,
    currency: validated.currency,
    pricingSource: 'ai_suggested',
    pricingDate,
    // Phase 43 trust-boundary correction (2026-09-19): `providerModel` stays
    // on this FULL/internal item (persisted into the server-side proposal
    // record by createPricingProposal below) but is now stripped by
    // generatePricingProposal before anything is returned to the HTTP
    // client -- a raw provider/model name was never rendered to a user, but
    // it was previously also never necessary to expose to the client AT
    // ALL, since the client no longer echoes it back on apply/save (the
    // server now injects it itself from this same trusted record). See
    // pricingProposalStore.js / canonicalEstimate.js's validateLineItems.
    providerModel: {
      provider: providerModel.provider,
      model: providerModel.model,
      promptVersion: providerModel.promptVersion,
    },
  };
};

// --- orchestration entry point ---------------------------------------------

// Generates a pricing proposal AND (Phase 43 trust-boundary correction,
// 2026-09-19) persists a short-lived, server-side proposal record for it
// (pricingProposalStore.js) -- the ONLY place a later apply/save can source
// trusted providerModel/cost-component values from. The canonical estimate
// itself is still never touched here (that remains exclusively
// canonicalEstimateStore.upsertCanonicalEstimate's job, via the unmodified
// PUT /:id/canonical-estimate route). `reportId`/`requestedByUid` are
// required -- they scope the persisted proposal to exactly the report/user
// that may later apply it. Throws a categorized error (`.code`) the route
// maps to its documented HTTP status; never throws an uncategorized error
// for a provider/validation failure. `signal` (an AbortSignal, optional)
// cancels both the cache lookup loop and the in-flight provider call as
// soon as it fires.
const generatePricingProposal = async (db, { reportId, requestedByUid, body, signal } = {}) => {
  if (!reportId) {
    throw makeError(
      'generatePricingProposal requires reportId to persist a proposal record',
      'PRICING_INTERNAL_ERROR'
    );
  }

  const provider = getPricingProvider();
  if (!provider || !openaiConfig.getClient()) {
    throw makeError(
      'Preliminary pricing is not currently available.',
      'PRICING_PROVIDER_UNAVAILABLE'
    );
  }

  const { value: parsed, error, code, field } = validatePricingRequestBody(body);
  if (error) throw makeError(error, code, { field });
  const { locationContext, currency, pricingDate, items, regenerate } = parsed;

  const requestById = new Map(items.map((it) => [it.requestId, it]));
  const fingerprintByRequestId = new Map(
    items.map((it) => [
      it.requestId,
      computePricingFingerprint({
        country: locationContext.country,
        state: locationContext.state,
        city: locationContext.city,
        postalCode: locationContext.postalCode,
        room: it.room,
        damageType: it.damageType,
        repairAction: it.repairAction,
        material: it.material,
        quantity: it.quantity,
        unit: it.unit,
        currency,
        pricingDate,
        provider: provider.PROVIDER_NAME,
        model: openaiConfig.MODEL,
        promptVersion: provider.PROMPT_VERSION,
        schemaVersion: SCHEMA_VERSION,
      }),
    ])
  );

  const resolvedItems = [];
  const toGenerate = [];
  let anyHit = false;
  let anyMiss = false;

  if (!regenerate) {
    for (const it of items) {
      if (signal?.aborted) throw makeError('Pricing request cancelled', 'PRICING_CANCELLED');
      const cached = await getCachedItem(db, fingerprintByRequestId.get(it.requestId));
      if (cached) {
        anyHit = true;
        resolvedItems.push(
          buildProposalItem(
            it,
            cached,
            {
              provider: provider.PROVIDER_NAME,
              model: openaiConfig.MODEL,
              promptVersion: provider.PROMPT_VERSION,
            },
            pricingDate
          )
        );
      } else {
        anyMiss = true;
        toGenerate.push(it);
      }
    }
  } else {
    toGenerate.push(...items);
    anyMiss = true;
  }

  if (toGenerate.length > 0) {
    if (signal?.aborted) throw makeError('Pricing request cancelled', 'PRICING_CANCELLED');

    const normalizedInput = {
      locationContext,
      currency,
      pricingDate,
      items: toGenerate.map((it) => ({
        requestId: it.requestId,
        room: it.room,
        damageType: it.damageType,
        repairAction: it.repairAction,
        description: it.description,
        material: it.material,
        quantity: it.quantity,
        unit: it.unit,
        trade: it.trade,
        category: it.category,
      })),
    };

    const raw = await callProviderWithRetry(provider, normalizedInput, {
      timeoutMs: openaiConfig.TIMEOUT_MS,
      signal,
    });

    for (const rawItem of raw.items || []) {
      const { value: validated } = validateProviderItem(rawItem, requestById, currency);
      if (!validated) continue; // malformed/invalid item -- skipped, not fatal to the whole batch
      const request = requestById.get(validated.requestId);
      // `raw.meta` defensively defaults to the provider we already resolved
      // above -- a provider is contractually required to return
      // `{items, meta}` (see registry.js's header comment), but this keeps
      // an ill-behaved/future provider from crashing the whole request
      // over a missing metadata object rather than a categorized error.
      const meta = raw.meta || {
        provider: provider.PROVIDER_NAME,
        model: openaiConfig.MODEL,
        promptVersion: provider.PROMPT_VERSION,
      };
      resolvedItems.push(buildProposalItem(request, validated, meta, pricingDate));
      await setCachedItem(db, fingerprintByRequestId.get(validated.requestId), {
        trade: validated.trade,
        category: validated.category,
        materialUnitCost: validated.materialUnitCost,
        laborUnitCost: validated.laborUnitCost,
        equipmentUnitCost: validated.equipmentUnitCost,
        assumptions: validated.assumptions,
        confidence: validated.confidence,
        currency: validated.currency,
      });
    }

    if (resolvedItems.length === 0) {
      throw makeError(
        'The pricing provider did not return any usable suggestions.',
        'PRICING_MALFORMED_RESPONSE'
      );
    }
  }

  // Phase 43 trust-boundary correction (2026-09-19). `resolvedItems` (each
  // carrying a real `providerModel`) is the FULL, trusted record -- persist
  // it verbatim as the proposal's own server-side record, keyed by this
  // report's current revision (so a later apply against a since-changed
  // estimate is rejected as REVISION_CONFLICT, not silently applied against
  // stale assumptions). The PUBLIC response strips `providerModel` from
  // every item -- a client never receives raw provider/model text, and
  // (unlike before this correction) never needs to, since it no longer
  // echoes providerModel back on save; the server re-derives it itself from
  // this exact stored record via `appliedProposal`.
  const currentEstimate = await getCanonicalEstimate(db, reportId);
  const { proposalId } = await createPricingProposal(db, {
    reportId,
    requestedByUid: requestedByUid || null,
    baseRevision: currentEstimate?.revision || 0,
    locationContext,
    currency,
    pricingDate,
    items: resolvedItems,
  });

  const publicItems = resolvedItems.map(({ providerModel: _providerModel, ...publicItem }) => publicItem);

  return {
    proposalId,
    items: publicItems,
    cacheStatus: anyHit && anyMiss ? 'mixed' : anyHit ? 'hit' : 'miss',
    pricingDate,
  };
};

module.exports = {
  MAX_ITEMS_PER_REQUEST,
  MAX_RETRIES,
  RETRY_BASE_MS,
  CACHE_TTL_DAYS,
  CACHE_COLLECTION,
  validatePricingRequestBody,
  validateProviderItem,
  buildProposalItem,
  callProviderWithRetry,
  getCachedItem,
  setCachedItem,
  generatePricingProposal,
};
