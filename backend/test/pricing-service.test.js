const test = require('node:test');
const assert = require('node:assert/strict');

// Fast, deterministic retry/backoff timing for this file only -- must be
// set BEFORE requiring pricingService.js, since it reads these once at
// module load. `node --test` isolates each test file's module cache, so
// this never leaks into other test files.
process.env.PRICING_RETRY_BASE_MS = '5';
process.env.PRICING_MAX_RETRIES = '2';
process.env.PRICING_MAX_ITEMS_PER_REQUEST = '25';
process.env.PRICING_CACHE_TTL_DAYS = '30';
// A placeholder, never-transmitted string -- only present so
// pricingService's `openaiConfig.getClient()` availability check passes.
// Every test in this file installs a FAKE provider (see installFakeProvider
// below) that never touches the real OpenAI SDK/network.
process.env.OPENAI_API_KEY = 'test-only-placeholder-not-a-real-key';

const { FakeFirestore } = require('./helpers/fakeFirestore');
const registry = require('../services/pricingProviders/registry');
const pricingService = require('../services/pricingService');
const { Timestamp } = require('../config/firebase');

// Trust-boundary correction (2026-09-19): generatePricingProposal now
// requires `reportId`/`requestedByUid` to persist its server-side proposal
// record (pricingProposalStore.js) -- every call site in this file goes
// through this thin wrapper instead of repeating those two fields
// everywhere, keeping the rest of each test focused on what it actually
// exercises (request validation / provider-response handling / caching /
// retry, all unchanged by this correction).
const REPORT_ID = 'report-1';
const REQUESTED_BY_UID = 'test-uid';
const generate = (db, opts = {}) =>
  pricingService.generatePricingProposal(db, { reportId: REPORT_ID, requestedByUid: REQUESTED_BY_UID, ...opts });

// Installs a fake provider under a dedicated registry key + points
// PRICING_PROVIDER at it -- this is the SAME extensibility seam a real
// future claudePricingProvider.js would use (server-env-config provider
// selection only, never a client-supplied choice), so using it for a test
// double is not a special-cased hack. Cleans up after itself.
function installFakeProvider(generatePricing) {
  const key = 'faketest';
  registry.PROVIDERS[key] = { PROVIDER_NAME: key, PROMPT_VERSION: 'v1', generatePricing };
  const prevProvider = process.env.PRICING_PROVIDER;
  process.env.PRICING_PROVIDER = key;
  return () => {
    delete registry.PROVIDERS[key];
    if (prevProvider === undefined) delete process.env.PRICING_PROVIDER;
    else process.env.PRICING_PROVIDER = prevProvider;
  };
}

const baseBody = (overrides = {}) => ({
  locationContext: { country: 'US', state: 'TX', city: 'Austin', postalCode: '78701' },
  currency: 'USD',
  pricingDate: '2026-09-19',
  items: [
    {
      targetLineItemId: 'li-1',
      room: 'Living Room',
      damageType: 'Water',
      repairAction: 'Replace',
      description: 'Replace water-damaged drywall',
      material: 'Drywall',
      quantity: 10,
      unit: 'SF',
    },
  ],
  ...overrides,
});

const goodProviderResponse = (input) => ({
  items: input.items.map((it) => ({
    requestId: it.requestId,
    trade: 'Drywall',
    category: 'Drywall',
    materialUnitCost: 2.5,
    laborUnitCost: 3,
    equipmentUnitCost: 0,
    currency: 'USD',
    confidence: 'medium',
    assumptions: 'Standard 1/2in drywall.',
    total: 999999, // a fake "total" the provider should never be trusted for
  })),
  meta: { provider: 'faketest', model: 'fake-model', promptVersion: 'v1', usage: null },
});

// NOTE: this specific test MUST run before any other test in this file --
// config/openai.js's getClient() lazily caches its client on first
// successful construction (same pattern as config/anthropic.js), so once
// any other test has triggered it with the placeholder key set above, a
// later `delete process.env.OPENAI_API_KEY` no longer makes getClient()
// return null. Running it first (module-fresh, before any cache exists) is
// what makes this a faithful test of "no key configured" rather than
// "key was previously configured, then removed at runtime".
test('PRICING_PROVIDER_UNAVAILABLE when OPENAI_API_KEY is unset -- route still resolves cleanly, never crashes', async () => {
  const restore = installFakeProvider(async (input) => goodProviderResponse(input));
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const db = new FakeFirestore();
    await assert.rejects(() => generate(db, { body: baseBody() }), {
      code: 'PRICING_PROVIDER_UNAVAILABLE',
    });
  } finally {
    process.env.OPENAI_API_KEY = originalKey;
    restore();
  }
});

// ---- request validation ---------------------------------------------------

test('VALIDATION_ERROR: missing locationContext.country', async () => {
  const restore = installFakeProvider(async (input) => goodProviderResponse(input));
  try {
    const db = new FakeFirestore();
    await assert.rejects(
      () => generate(db, { body: baseBody({ locationContext: {} }) }),
      (err) => {
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.equal(err.field, 'locationContext.country');
        return true;
      }
    );
  } finally {
    restore();
  }
});

test('VALIDATION_ERROR: empty items array', async () => {
  const restore = installFakeProvider(async (input) => goodProviderResponse(input));
  try {
    const db = new FakeFirestore();
    await assert.rejects(
      () => generate(db, { body: baseBody({ items: [] }) }),
      { code: 'VALIDATION_ERROR' }
    );
  } finally {
    restore();
  }
});

test('VALIDATION_ERROR: unsupported unit', async () => {
  const restore = installFakeProvider(async (input) => goodProviderResponse(input));
  try {
    const db = new FakeFirestore();
    const body = baseBody();
    body.items[0].unit = 'NOT_A_UNIT';
    await assert.rejects(() => generate(db, { body }), {
      code: 'VALIDATION_ERROR',
    });
  } finally {
    restore();
  }
});

test('PRICING_LIMIT_EXCEEDED: more than MAX_ITEMS_PER_REQUEST items', async () => {
  const restore = installFakeProvider(async (input) => goodProviderResponse(input));
  try {
    const db = new FakeFirestore();
    const items = Array.from({ length: 26 }, (_, i) => ({
      ...baseBody().items[0],
      targetLineItemId: `li-${i}`,
    }));
    await assert.rejects(
      () => generate(db, { body: baseBody({ items }) }),
      { code: 'PRICING_LIMIT_EXCEEDED' }
    );
  } finally {
    restore();
  }
});

test('a manipulated client-submitted provider/model/prompt field in the request body is ignored, and the PUBLIC response never carries providerModel at all', async () => {
  let sawNormalizedInput;
  const restore = installFakeProvider(async (input) => {
    sawNormalizedInput = input;
    return goodProviderResponse(input);
  });
  try {
    const db = new FakeFirestore();
    const body = baseBody({
      provider: 'attacker-chosen-provider',
      model: 'attacker-chosen-model',
      prompt: 'attacker override',
    });
    const result = await generate(db, { body });
    // Trust-boundary correction (2026-09-19): the PUBLIC response never
    // includes providerModel any more (see the dedicated "providerModel is
    // never present in the public response" test below for the full
    // assertion) -- what THIS test still needs to prove is that a
    // client-supplied provider/model override never reaches the provider
    // call itself.
    assert.ok(!('providerModel' in result.items[0]));
    assert.ok(
      !('provider' in sawNormalizedInput),
      'the normalized input sent to the provider never carries a client override'
    );
  } finally {
    restore();
  }
});

// ---- server-recomputed totals / golden-rule properties ---------------------

test('server-recomputed totals: the provider-supplied fake "total" is discarded; unitPrice/lineTotal come only from quantity * (material+labor+equipment)', async () => {
  const restore = installFakeProvider(async (input) => goodProviderResponse(input));
  try {
    const db = new FakeFirestore();
    const result = await generate(db, { body: baseBody() });
    const item = result.items[0];
    assert.equal(item.materialUnitCost, 2.5);
    assert.equal(item.laborUnitCost, 3);
    assert.equal(item.equipmentUnitCost, 0);
    assert.equal(item.unitPrice, 5.5);
    assert.equal(
      item.lineTotal,
      55,
      "10 qty * 5.5 unitPrice = 55, never the provider's fake 999999 total"
    );
    assert.equal(item.pricingSource, 'ai_suggested');
  } finally {
    restore();
  }
});

test('the pricing service never touches tax/O&P/permits/general conditions/manual adjustments fields', async () => {
  const restore = installFakeProvider(async (input) => goodProviderResponse(input));
  try {
    const db = new FakeFirestore();
    const result = await generate(db, { body: baseBody() });
    for (const forbiddenKey of [
      'taxRatePercent',
      'overheadProfitPercent',
      'permits',
      'generalConditions',
      'manualAdjustments',
      'taxable',
    ]) {
      assert.ok(
        !(forbiddenKey in result.items[0]),
        `proposal item must never contain "${forbiddenKey}"`
      );
      assert.ok(
        !(forbiddenKey in result),
        `top-level response must never contain "${forbiddenKey}"`
      );
    }
  } finally {
    restore();
  }
});

test('the request context (room/damageType/repairAction/description/material/quantity/unit) is always taken from the request, never invented by the provider', async () => {
  const restore = installFakeProvider(async (input) => ({
    items: input.items.map((it) => ({
      requestId: it.requestId,
      trade: 'Drywall',
      category: 'Drywall',
      materialUnitCost: 1,
      laborUnitCost: 1,
      equipmentUnitCost: 0,
      currency: 'USD',
      confidence: 'high',
      assumptions: 'x',
      // A misbehaving/compromised provider trying to smuggle a different scope.
      room: 'Attacker Room',
      quantity: 999999,
      unit: 'LS',
      description: 'attacker-controlled description',
    })),
  }));
  try {
    const db = new FakeFirestore();
    const result = await generate(db, { body: baseBody() });
    const item = result.items[0];
    assert.equal(item.room, 'Living Room');
    assert.equal(item.quantity, 10);
    assert.equal(item.unit, 'SF');
    assert.equal(item.description, 'Replace water-damaged drywall');
  } finally {
    restore();
  }
});

// ---- malformed / invalid provider response handling ------------------------

test('a raw item with an unrecognized requestId is skipped, not fatal to the whole batch', async () => {
  const restore = installFakeProvider(async (input) => ({
    items: [
      {
        requestId: 'not-a-real-request-id',
        trade: 'x',
        category: 'x',
        materialUnitCost: 1,
        laborUnitCost: 0,
        equipmentUnitCost: 0,
        currency: 'USD',
        confidence: 'low',
        assumptions: '',
      },
      ...goodProviderResponse(input).items,
    ],
  }));
  try {
    const db = new FakeFirestore();
    const result = await generate(db, { body: baseBody() });
    assert.equal(
      result.items.length,
      1,
      'exactly one valid item survives; the unrecognized one is silently skipped'
    );
  } finally {
    restore();
  }
});

test('when EVERY item is malformed, the whole call fails with PRICING_MALFORMED_RESPONSE (never crashes, never returns an empty success)', async () => {
  const restore = installFakeProvider(async () => ({ items: [{ requestId: 'unknown' }] }));
  try {
    const db = new FakeFirestore();
    await assert.rejects(() => generate(db, { body: baseBody() }), {
      code: 'PRICING_MALFORMED_RESPONSE',
    });
  } finally {
    restore();
  }
});

test('negative money is rejected (item skipped)', async () => {
  const restore = installFakeProvider(async (input) => ({
    items: [{ ...goodProviderResponse(input).items[0], materialUnitCost: -5 }],
  }));
  try {
    const db = new FakeFirestore();
    await assert.rejects(() => generate(db, { body: baseBody() }), {
      code: 'PRICING_MALFORMED_RESPONSE',
    });
  } finally {
    restore();
  }
});

test('non-finite money is rejected (item skipped)', async () => {
  const restore = installFakeProvider(async (input) => ({
    items: [{ ...goodProviderResponse(input).items[0], laborUnitCost: Infinity }],
  }));
  try {
    const db = new FakeFirestore();
    await assert.rejects(() => generate(db, { body: baseBody() }), {
      code: 'PRICING_MALFORMED_RESPONSE',
    });
  } finally {
    restore();
  }
});

test('excessive money (over MAX_MONEY) is rejected (item skipped)', async () => {
  const restore = installFakeProvider(async (input) => ({
    items: [{ ...goodProviderResponse(input).items[0], equipmentUnitCost: 999_999_999 }],
  }));
  try {
    const db = new FakeFirestore();
    await assert.rejects(() => generate(db, { body: baseBody() }), {
      code: 'PRICING_MALFORMED_RESPONSE',
    });
  } finally {
    restore();
  }
});

test('currency mismatch (provider returns a currency different from the request) is rejected, never silently converted', async () => {
  const restore = installFakeProvider(async (input) => ({
    items: [{ ...goodProviderResponse(input).items[0], currency: 'EUR' }],
  }));
  try {
    const db = new FakeFirestore();
    await assert.rejects(() => generate(db, { body: baseBody() }), {
      code: 'PRICING_MALFORMED_RESPONSE',
    });
  } finally {
    restore();
  }
});

test('unexpected/extra fields on the raw provider item are stripped, never trusted through', async () => {
  const restore = installFakeProvider(async (input) => ({
    items: [
      {
        ...goodProviderResponse(input).items[0],
        unitPrice: 1,
        lineTotal: 1,
        adminOverride: true,
        __proto__polluted: true,
      },
    ],
  }));
  try {
    const db = new FakeFirestore();
    const result = await generate(db, { body: baseBody() });
    assert.ok(!('adminOverride' in result.items[0]));
    // unitPrice/lineTotal in the output are the SERVER-COMPUTED values, not
    // whatever bogus values a compromised provider response tried to set.
    assert.equal(result.items[0].unitPrice, 5.5);
  } finally {
    restore();
  }
});

// ---- providerModel placement (trust-boundary correction, 2026-09-19) ----
//
// Previously, `providerModel` was returned directly to the client as a
// per-item field (never rendered by the UI, but still present in the raw
// HTTP response body -- inspectable via devtools, and the very value the
// old, now-fixed `buildCanonicalEstimatePayload` echoed straight back into
// the save request). It now lives ONLY in the server-side proposal record
// (pricingProposalStore.js); the public response never carries it at all.

test('the PUBLIC response never includes proposalId+items+cacheStatus+pricingDate with no providerModel field anywhere', async () => {
  const restore = installFakeProvider(async (input) => goodProviderResponse(input));
  try {
    const db = new FakeFirestore();
    const result = await generate(db, { body: baseBody() });
    assert.deepEqual(
      Object.keys(result).sort(),
      ['cacheStatus', 'items', 'pricingDate', 'proposalId'].sort(),
      'top-level response has no provider/model field'
    );
    assert.ok(!('providerModel' in result.items[0]), 'a proposal item never carries providerModel to the client');
    assert.ok(result.proposalId, 'a real, opaque proposalId is returned so the client can reference it later');
    assert.ok(result.items[0].suggestionId, 'each item carries its own opaque suggestionId');
  } finally {
    restore();
  }
});

test('the TRUSTED providerModel is persisted server-side in the pricingProposals record, keyed by each suggestionId', async () => {
  const restore = installFakeProvider(async (input) => goodProviderResponse(input));
  try {
    const db = new FakeFirestore();
    const result = await generate(db, { body: baseBody() });
    const proposalSnap = await db
      .collection('reports')
      .doc(REPORT_ID)
      .collection('pricingProposals')
      .doc(result.proposalId)
      .get();
    assert.ok(proposalSnap.exists);
    const stored = proposalSnap.data();
    assert.equal(stored.reportId, REPORT_ID);
    assert.equal(stored.requestedByUid, REQUESTED_BY_UID);
    assert.equal(stored.baseRevision, 0, 'no canonical estimate exists yet for this report -- defaults to revision 0');
    const storedItem = stored.items[result.items[0].suggestionId];
    assert.deepEqual(storedItem.providerModel, { provider: 'faketest', model: 'fake-model', promptVersion: 'v1' });
    assert.equal(storedItem.consumed, false);
  } finally {
    restore();
  }
});

// ---- caching ----------------------------------------------------------------

test('cache miss then hit: a second identical request never calls the provider again', async () => {
  let calls = 0;
  const restore = installFakeProvider(async (input) => {
    calls += 1;
    return goodProviderResponse(input);
  });
  try {
    const db = new FakeFirestore();
    const first = await generate(db, { body: baseBody() });
    assert.equal(first.cacheStatus, 'miss');
    assert.equal(calls, 1);

    const second = await generate(db, { body: baseBody() });
    assert.equal(second.cacheStatus, 'hit');
    assert.equal(calls, 1, 'provider was not called again on a cache hit');
    assert.equal(second.items[0].lineTotal, 55);
  } finally {
    restore();
  }
});

test('regenerate:true always bypasses the cache, even when a fresh entry exists', async () => {
  let calls = 0;
  const restore = installFakeProvider(async (input) => {
    calls += 1;
    return goodProviderResponse(input);
  });
  try {
    const db = new FakeFirestore();
    await generate(db, { body: baseBody() });
    assert.equal(calls, 1);
    const second = await generate(db, {
      body: baseBody({ regenerate: true }),
    });
    assert.equal(calls, 2);
    assert.equal(second.cacheStatus, 'miss');
  } finally {
    restore();
  }
});

test('an expired cache entry is treated as a miss and regenerated', async () => {
  let calls = 0;
  const restore = installFakeProvider(async (input) => {
    calls += 1;
    return goodProviderResponse(input);
  });
  try {
    const db = new FakeFirestore();
    await generate(db, { body: baseBody() });
    assert.equal(calls, 1);

    // Reach into the cache doc and force it into the past.
    const { computePricingFingerprint } = require('../utils/pricingFingerprint');
    const fp = computePricingFingerprint({
      country: 'US',
      state: 'TX',
      city: 'Austin',
      postalCode: '78701',
      room: 'Living Room',
      damageType: 'Water',
      repairAction: 'Replace',
      material: 'Drywall',
      quantity: 10,
      unit: 'SF',
      currency: 'USD',
      pricingDate: '2026-09-19',
      provider: 'faketest',
      model: require('../config/openai').MODEL,
      promptVersion: 'v1',
      schemaVersion: 1,
    });
    const ref = db.collection('pricingSuggestionsCache').doc(fp);
    const snap = await ref.get();
    await ref.set({ ...snap.data(), expiresAt: new Date(Date.now() - 1000).toISOString() });

    const second = await generate(db, { body: baseBody() });
    assert.equal(calls, 2, 'expired cache entry triggers regeneration');
    assert.equal(second.cacheStatus, 'miss');
  } finally {
    restore();
  }
});

test('a cache document contains only generic fingerprint-derived content -- no reportId/userId/PII fields', async () => {
  const restore = installFakeProvider(async (input) => goodProviderResponse(input));
  try {
    const db = new FakeFirestore();
    await generate(db, { body: baseBody() });
    const snap = await db.collection('pricingSuggestionsCache').get();
    assert.equal(snap.docs.length, 1);
    const data = snap.docs[0].data();
    const keys = JSON.stringify(data).toLowerCase();
    for (const forbidden of [
      'reportid',
      'userid',
      'uid',
      'insured',
      'claimnumber',
      'policynumber',
    ]) {
      assert.ok(!keys.includes(forbidden), `cache doc must never contain "${forbidden}"`);
    }
    assert.deepEqual(
      Object.keys(data).sort(),
      ['expiresAt', 'fingerprint', 'generatedAt', 'item'].sort()
    );
    // Firestore TTL (pricingSuggestionsCache.expiresAt) only acts on
    // Timestamp fields -- an ISO string would never be auto-deleted.
    assert.ok(data.expiresAt instanceof Timestamp, 'expiresAt must be a Firestore Timestamp');
    assert.ok(data.expiresAt.toDate().getTime() > Date.now());
  } finally {
    restore();
  }
});

test('fingerprint determinism: identical requests across two separate FakeFirestore instances produce identical fingerprints (same cache key)', async () => {
  const restore = installFakeProvider(async (input) => goodProviderResponse(input));
  try {
    const db1 = new FakeFirestore();
    const db2 = new FakeFirestore();
    await generate(db1, { body: baseBody() });
    await generate(db2, { body: baseBody() });
    const snap1 = await db1.collection('pricingSuggestionsCache').get();
    const snap2 = await db2.collection('pricingSuggestionsCache').get();
    assert.equal(snap1.docs[0].id, snap2.docs[0].id);
  } finally {
    restore();
  }
});

// ---- retry / timeout / rate-limit / cancellation ---------------------------

test('bounded transient retry: a PRICING_TIMEOUT failure is retried up to PRICING_MAX_RETRIES times, then succeeds', async () => {
  let calls = 0;
  const restore = installFakeProvider(async (input) => {
    calls += 1;
    if (calls <= 2) {
      const err = new Error('timeout');
      err.code = 'PRICING_TIMEOUT';
      err.transient = true;
      throw err;
    }
    return goodProviderResponse(input);
  });
  try {
    const db = new FakeFirestore();
    const result = await generate(db, { body: baseBody() });
    assert.equal(calls, 3, '2 failures + 1 success = 3 calls (MAX_RETRIES=2)');
    assert.equal(result.items.length, 1);
  } finally {
    restore();
  }
});

test('retry is exhausted (calls = 1 + MAX_RETRIES) and the categorized error still propagates when every attempt is transient', async () => {
  let calls = 0;
  const restore = installFakeProvider(async () => {
    calls += 1;
    const err = new Error('still timing out');
    err.code = 'PRICING_TIMEOUT';
    err.transient = true;
    throw err;
  });
  try {
    const db = new FakeFirestore();
    await assert.rejects(() => generate(db, { body: baseBody() }), {
      code: 'PRICING_TIMEOUT',
    });
    assert.equal(calls, 3);
  } finally {
    restore();
  }
});

test('a non-transient failure (auth/validation-shaped) is never retried', async () => {
  let calls = 0;
  const restore = installFakeProvider(async () => {
    calls += 1;
    const err = new Error('bad key');
    err.code = 'PRICING_AUTH_FAILED';
    err.transient = false;
    throw err;
  });
  try {
    const db = new FakeFirestore();
    await assert.rejects(() => generate(db, { body: baseBody() }), {
      code: 'PRICING_AUTH_FAILED',
    });
    assert.equal(calls, 1, 'no retry for a non-transient failure');
  } finally {
    restore();
  }
});

test('Retry-After (retryAfterMs) is honored -- the retry waits at least that long', async () => {
  let calls = 0;
  const timestamps = [];
  const restore = installFakeProvider(async (input) => {
    timestamps.push(Date.now());
    calls += 1;
    if (calls === 1) {
      const err = new Error('rate limited');
      err.code = 'PRICING_RATE_LIMITED';
      err.transient = true;
      err.retryAfterMs = 50; // larger than the 5ms base backoff configured for this file
      throw err;
    }
    return goodProviderResponse(input);
  });
  try {
    const db = new FakeFirestore();
    await generate(db, { body: baseBody() });
    assert.equal(calls, 2);
    assert.ok(
      timestamps[1] - timestamps[0] >= 45,
      `retry waited at least ~retryAfterMs (saw ${timestamps[1] - timestamps[0]}ms)`
    );
  } finally {
    restore();
  }
});

test('cancellation: an already-aborted signal short-circuits before any provider call', async () => {
  let calls = 0;
  const restore = installFakeProvider(async (input) => {
    calls += 1;
    return goodProviderResponse(input);
  });
  try {
    const db = new FakeFirestore();
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      () =>
        generate(db, { body: baseBody(), signal: controller.signal }),
      { code: 'PRICING_CANCELLED' }
    );
    assert.equal(calls, 0, 'the provider is never called once the request is already cancelled');
  } finally {
    restore();
  }
});

// ---- regeneration doesn't duplicate --------------------------------------

test('regenerating the same request twice returns the same targetLineItemId mapping both times (no duplication introduced at this layer)', async () => {
  const restore = installFakeProvider(async (input) => goodProviderResponse(input));
  try {
    const db = new FakeFirestore();
    const first = await generate(db, { body: baseBody() });
    const second = await generate(db, {
      body: baseBody({ regenerate: true }),
    });
    assert.equal(first.items[0].targetLineItemId, 'li-1');
    assert.equal(second.items[0].targetLineItemId, 'li-1');
    assert.equal(first.items.length, 1);
    assert.equal(second.items.length, 1);
  } finally {
    restore();
  }
});
