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
} = require('../config/tiers');

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
