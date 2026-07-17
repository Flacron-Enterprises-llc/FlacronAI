const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  TIERS,
  TIER_ORDER,
  getTier,
  isAtLeastTier,
  canGenerate,
  getBaseTier,
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
