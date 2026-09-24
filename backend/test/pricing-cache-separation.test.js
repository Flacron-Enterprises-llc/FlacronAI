const test = require('node:test');
const assert = require('node:assert/strict');

// Regression tests for the shared pricingSuggestionsCache key: repair-action
// separation, normalization, blank-value cache skipping, Timestamp expiry
// and backward compatibility of existing keys. Env must be set BEFORE
// requiring pricingService.js (read once at module load).
process.env.PRICING_RETRY_BASE_MS = '5';
process.env.PRICING_MAX_RETRIES = '0';
process.env.PRICING_CACHE_TTL_DAYS = '30';
// Placeholder only -- every test installs a fake provider; no network call.
process.env.OPENAI_API_KEY = 'test-only-placeholder-not-a-real-key';

const { FakeFirestore } = require('./helpers/fakeFirestore');
const registry = require('../services/pricingProviders/registry');
const pricingService = require('../services/pricingService');
const openaiConfig = require('../config/openai');
const { Timestamp } = require('../config/firebase');
const {
  computePricingFingerprint,
  normalizeRepairAction,
  isCacheableRepairAction,
} = require('../utils/pricingFingerprint');

const CACHE = 'pricingSuggestionsCache';
const generate = (db, body) =>
  pricingService.generatePricingProposal(db, { reportId: 'report-1', requestedByUid: 'uid-1', body });

function installFakeProvider() {
  const key = 'faketest';
  const calls = [];
  registry.PROVIDERS[key] = {
    PROVIDER_NAME: key,
    PROMPT_VERSION: 'v1',
    generatePricing: async (input) => {
      calls.push(input);
      return {
        items: input.items.map((it) => ({
          requestId: it.requestId,
          trade: 'General',
          category: 'General',
          // Price varies by repair action so a wrongly shared cache entry is visible.
          materialUnitCost: /paint/i.test(it.repairAction || '') ? 1 : 9,
          laborUnitCost: 2,
          equipmentUnitCost: 0,
          currency: 'USD',
          confidence: 'medium',
          assumptions: 'test',
        })),
        meta: { provider: key, model: 'fake-model', promptVersion: 'v1', usage: null },
      };
    },
  };
  const prev = process.env.PRICING_PROVIDER;
  process.env.PRICING_PROVIDER = key;
  const restore = () => {
    delete registry.PROVIDERS[key];
    if (prev === undefined) delete process.env.PRICING_PROVIDER;
    else process.env.PRICING_PROVIDER = prev;
  };
  return { calls, restore };
}

const item = (overrides = {}) => ({
  targetLineItemId: 'li-1',
  room: 'Kitchen',
  damageType: '',
  repairAction: 'Replace',
  description: 'Replace cabinets',
  material: '',
  quantity: 20,
  unit: 'SF',
  ...overrides,
});

const body = (items) => ({
  locationContext: { country: 'US', state: 'TX', city: 'Austin', postalCode: '78701' },
  currency: 'USD',
  pricingDate: '2026-09-19',
  items,
});

const fpInput = (overrides = {}) => ({
  country: 'US',
  state: 'TX',
  city: 'Austin',
  postalCode: '78701',
  room: 'Kitchen',
  damageType: 'Water',
  repairAction: 'Replace',
  material: 'Drywall',
  quantity: 20,
  unit: 'SF',
  currency: 'USD',
  pricingDate: '2026-09-15',
  provider: 'openai',
  model: 'gpt-4o-mini',
  promptVersion: 'v1',
  schemaVersion: 1,
  ...overrides,
});

const serviceFingerprint = (repairAction) =>
  computePricingFingerprint({
    country: 'US',
    state: 'TX',
    city: 'Austin',
    postalCode: '78701',
    room: 'Kitchen',
    damageType: '',
    repairAction,
    material: '',
    quantity: 20,
    unit: 'SF',
    currency: 'USD',
    pricingDate: '2026-09-19',
    provider: 'faketest',
    model: openaiConfig.MODEL,
    promptVersion: 'v1',
    schemaVersion: 1,
  });

// ---- pure fingerprint / normalization -------------------------------------

test('backward compatibility: existing single-spaced keys hash exactly as before this change', () => {
  // Values captured from the pre-change implementation.
  assert.equal(
    computePricingFingerprint(fpInput()),
    '834f9a8329c4ac09b5027f820ef6abed20cc3f19bb8343b6650fdf424545df58'
  );
  assert.equal(
    computePricingFingerprint(fpInput({ repairAction: 'Detach & Reset' })),
    '99310ae1cd0ecd3fe4fbf1f5b3edfd82eb1258a290c6ec3b540db747a9305ef1'
  );
});

test('different repair actions produce different keys for an otherwise identical job', () => {
  const a = computePricingFingerprint(fpInput({ repairAction: 'Replace' }));
  const b = computePricingFingerprint(fpInput({ repairAction: 'Paint' }));
  assert.notEqual(a, b);
});

test('repair action normalization: case, surrounding/inner whitespace and Unicode width collapse to one key', () => {
  const canonical = computePricingFingerprint(fpInput({ repairAction: 'detach & reset' }));
  for (const variant of ['Detach & Reset', '  DETACH & RESET  ', 'Detach   &\tReset', 'Detach & Reset', 'Ｄｅｔａｃｈ ＆ Ｒｅｓｅｔ']) {
    assert.equal(computePricingFingerprint(fpInput({ repairAction: variant })), canonical, variant);
  }
  assert.equal(normalizeRepairAction('  Tear   Out '), 'tear out');
});

test('free-text description is never part of the key', () => {
  const base = computePricingFingerprint(fpInput());
  assert.equal(computePricingFingerprint({ ...fpInput(), description: 'John Smith, 12 Main St, water in kitchen' }), base);
});

test('isCacheableRepairAction is false for blank/unavailable values and true for real ones', () => {
  for (const blank of [undefined, null, '', '   ', '\t\n', ' ']) {
    assert.equal(isCacheableRepairAction(blank), false, JSON.stringify(blank));
  }
  assert.equal(isCacheableRepairAction('Replace'), true);
  assert.equal(isCacheableRepairAction(' paint '), true);
});

// ---- service-level cache behaviour ----------------------------------------

test('two jobs differing only by repair action are priced and cached separately (no cross-serving)', async () => {
  const { calls, restore } = installFakeProvider();
  try {
    const db = new FakeFirestore();
    await generate(db, body([item({ repairAction: 'Replace' })]));
    const second = await generate(db, body([item({ repairAction: 'Paint', description: 'Paint ceiling' })]));
    assert.equal(calls.length, 2, 'the Paint job must not be served the Replace job\'s cached price');
    assert.equal(second.cacheStatus, 'miss');
    const snap = await db.collection(CACHE).get();
    assert.equal(snap.docs.length, 2);
  } finally {
    restore();
  }
});

test('a normalized variant of the same repair action is a cache hit', async () => {
  const { calls, restore } = installFakeProvider();
  try {
    const db = new FakeFirestore();
    await generate(db, body([item({ repairAction: 'Replace' })]));
    const second = await generate(db, body([item({ repairAction: '  REPLACE  ' })]));
    assert.equal(calls.length, 1);
    assert.equal(second.cacheStatus, 'hit');
  } finally {
    restore();
  }
});

test('blank repair action: shared cache is skipped entirely (no write, no read)', async () => {
  const { calls, restore } = installFakeProvider();
  try {
    const db = new FakeFirestore();
    const first = await generate(db, body([item({ repairAction: '   ' })]));
    assert.equal(first.items.length, 1, 'still priced -- manual/AI flow keeps working');
    assert.equal((await db.collection(CACHE).get()).docs.length, 0, 'nothing written to the shared cache');

    // Even if a doc exists under the key a blank action WOULD have produced, it is never read.
    await db.collection(CACHE).doc(serviceFingerprint('')).set({
      fingerprint: serviceFingerprint(''),
      item: { trade: 'Wrong', category: 'Wrong', materialUnitCost: 999, laborUnitCost: 999, equipmentUnitCost: 0, currency: 'USD', confidence: 'high', assumptions: 'poisoned' },
      generatedAt: new Date().toISOString(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 86400000)),
    });
    const second = await generate(db, body([item({ repairAction: '' })]));
    assert.equal(calls.length, 2, 'blank action always goes to the provider');
    assert.notEqual(second.cacheStatus, 'hit');
  } finally {
    restore();
  }
});

test('mixed batch: cacheable items are cached, blank-action items are not', async () => {
  const { restore } = installFakeProvider();
  try {
    const db = new FakeFirestore();
    await generate(db, body([item({ targetLineItemId: 'li-1', repairAction: 'Replace' }), item({ targetLineItemId: 'li-2', repairAction: '' })]));
    const docs = (await db.collection(CACHE).get()).docs;
    assert.equal(docs.length, 1);
    assert.equal(docs[0].id, serviceFingerprint('Replace'));
  } finally {
    restore();
  }
});

test('Timestamp expiry: past Timestamp is a miss, future Timestamp is a hit', async () => {
  const { calls, restore } = installFakeProvider();
  try {
    const db = new FakeFirestore();
    await generate(db, body([item()]));
    const ref = db.collection(CACHE).doc(serviceFingerprint('Replace'));
    const data = (await ref.get()).data();
    assert.ok(data.expiresAt instanceof Timestamp);

    const hit = await generate(db, body([item()]));
    assert.equal(hit.cacheStatus, 'hit');
    assert.equal(calls.length, 1);

    await ref.set({ ...data, expiresAt: Timestamp.fromDate(new Date(Date.now() - 1000)) });
    const miss = await generate(db, body([item()]));
    assert.equal(miss.cacheStatus, 'miss');
    assert.equal(calls.length, 2);
  } finally {
    restore();
  }
});

test('backward compatibility: a legacy ISO-string expiresAt entry is still honoured until it expires', async () => {
  const { calls, restore } = installFakeProvider();
  try {
    const db = new FakeFirestore();
    const fp = serviceFingerprint('Replace');
    await db.collection(CACHE).doc(fp).set({
      fingerprint: fp,
      item: { trade: 'General', category: 'General', materialUnitCost: 9, laborUnitCost: 2, equipmentUnitCost: 0, currency: 'USD', confidence: 'medium', assumptions: 'legacy' },
      generatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const res = await generate(db, body([item()]));
    assert.equal(res.cacheStatus, 'hit');
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});
