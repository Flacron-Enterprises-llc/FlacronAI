const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  TIERS,
  TIER_ORDER,
  getTier,
  isAtLeastTier,
  canGenerate,
  getBaseTier,
  getTierKeyFromStripePriceId,
  getEffectiveTier,
  canGenerateAsync,
} = require('../config/tiers');
const { invalidatePlanConfigCache, RECOMMENDED_DEFAULT_CONFIG } = require('../config/planConfig');

test('plan limits match the documented offer (5/50/200/unlimited)', () => {
  assert.equal(TIERS.starter.reportsPerMonth, 5);
  assert.equal(TIERS.professional.reportsPerMonth, 50);
  assert.equal(TIERS.agency.reportsPerMonth, 200);
  assert.equal(TIERS.enterprise.reportsPerMonth, -1);
});

test('getTier falls back to starter for unknown/missing tier', () => {
  assert.equal(getTier('nonsense').name, 'Starter');
  assert.equal(getTier(undefined).name, 'Starter');
});

test('isAtLeastTier respects tier order', () => {
  assert.equal(isAtLeastTier('agency', 'professional'), true);
  assert.equal(isAtLeastTier('starter', 'agency'), false);
  assert.equal(isAtLeastTier('enterprise', 'enterprise'), true);
  assert.equal(isAtLeastTier(undefined, 'starter'), true); // defaults to starter
});

test('canGenerate enforces monthly report limits server-side', () => {
  assert.equal(canGenerate('starter', 4), true);
  assert.equal(canGenerate('starter', 5), false); // at limit → blocked
  assert.equal(canGenerate('professional', 49), true);
  assert.equal(canGenerate('professional', 50), false);
  assert.equal(canGenerate('enterprise', 999999), true); // unlimited
  assert.equal(canGenerate('unknown-tier', 5), false); // unknown treated as starter
});

test('getBaseTier strips _annual suffix', () => {
  assert.equal(getBaseTier('professional_annual'), 'professional');
  assert.equal(getBaseTier('agency'), 'agency');
  assert.equal(getBaseTier(''), 'starter');
  assert.equal(getBaseTier(null), 'starter');
});

test('every tier in TIER_ORDER exists in TIERS', () => {
  for (const name of TIER_ORDER) {
    assert.ok(TIERS[name], `missing tier config: ${name}`);
  }
});

test('Stripe price IDs resolve back to the correct monthly or annual tier key', () => {
  const previousMonthly = process.env.STRIPE_PRICE_AGENCY;
  const previousAnnual = process.env.STRIPE_PRICE_AGENCY_ANNUAL;
  process.env.STRIPE_PRICE_AGENCY = 'price_agency_monthly_test';
  process.env.STRIPE_PRICE_AGENCY_ANNUAL = 'price_agency_annual_test';

  assert.equal(getTierKeyFromStripePriceId('price_agency_monthly_test'), 'agency');
  assert.equal(getTierKeyFromStripePriceId('price_agency_annual_test'), 'agency_annual');
  assert.equal(getTierKeyFromStripePriceId('price_unknown'), null);

  if (previousMonthly === undefined) delete process.env.STRIPE_PRICE_AGENCY;
  else process.env.STRIPE_PRICE_AGENCY = previousMonthly;
  if (previousAnnual === undefined) delete process.env.STRIPE_PRICE_AGENCY_ANNUAL;
  else process.env.STRIPE_PRICE_AGENCY_ANNUAL = previousAnnual;
});

// ── Phase 44 (Central Plan Configuration): getEffectiveTier/canGenerateAsync ──
// live-read PlanConfig for reportsPerMonth instead of this file's own static
// TIERS object -- getTier()/canGenerate() above are UNCHANGED and still used
// as-is by every pre-Phase-44 caller/test above this point.

class SingleDocFakeDb {
  constructor(doc = null) { this.doc = doc; }
  collection(name) {
    if (name !== 'planConfig') throw new Error(`unexpected collection ${name}`);
    return { doc: () => ({ get: async () => ({ exists: !!this.doc, data: () => this.doc }) }) };
  }
}

test('getEffectiveTier falls back to this file\'s own static reportsPerMonth when PlanConfig is absent (safe-fallback, not a behavior change for today)', async () => {
  invalidatePlanConfigCache();
  const db = new SingleDocFakeDb(null);
  const tier = await getEffectiveTier(db, 'professional');
  assert.equal(tier.reportsPerMonth, 50, 'matches TIERS.professional.reportsPerMonth exactly');
  assert.equal(tier.name, 'Professional', 'every other static field is still present');
});

test('getEffectiveTier reads the LIVE PlanConfig value once populated, overriding this file\'s static reportsPerMonth', async () => {
  invalidatePlanConfigCache();
  const configured = { ...RECOMMENDED_DEFAULT_CONFIG, plans: { ...RECOMMENDED_DEFAULT_CONFIG.plans, professional: { reportsPerMonth: 75, basePhotoLimit: 100 } } };
  const db = new SingleDocFakeDb(configured);
  const tier = await getEffectiveTier(db, 'professional');
  assert.equal(tier.reportsPerMonth, 75, 'live PlanConfig value wins, not the static 50');
});

test('getEffectiveTier resolves enterprise\'s "unlimited" back to canGenerate()\'s existing -1 sentinel contract', async () => {
  invalidatePlanConfigCache();
  const db = new SingleDocFakeDb(RECOMMENDED_DEFAULT_CONFIG);
  const tier = await getEffectiveTier(db, 'enterprise');
  assert.equal(tier.reportsPerMonth, -1);
});

test('canGenerateAsync enforces the LIVE monthly limit, mirroring canGenerate()\'s own semantics', async () => {
  invalidatePlanConfigCache();
  const configured = { ...RECOMMENDED_DEFAULT_CONFIG, plans: { ...RECOMMENDED_DEFAULT_CONFIG.plans, starter: { reportsPerMonth: 2, basePhotoLimit: 25 } } };
  const db = new SingleDocFakeDb(configured);
  assert.equal(await canGenerateAsync(db, 'starter', 1), true);
  assert.equal(await canGenerateAsync(db, 'starter', 2), false, 'at the live-configured limit -> blocked');
  assert.equal(await canGenerateAsync(db, 'enterprise', 999999), true);
});

test('canGenerateAsync never throws and never fails closed into unlimited when the read itself throws', async () => {
  invalidatePlanConfigCache();
  const db = { collection: () => ({ doc: () => ({ get: async () => { throw new Error('down'); } }) }) };
  assert.equal(await canGenerateAsync(db, 'starter', 4), true);
  assert.equal(await canGenerateAsync(db, 'starter', 5), false, 'falls back to the static 5-report limit, never unlimited');
});
