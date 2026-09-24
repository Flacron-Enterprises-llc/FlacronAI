const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CATALOGUE,
  validateCatalogue,
  resolveActivePack,
  resolveStripeMode,
  getPackPriceId,
  getPublicCatalogue,
} = require('../config/photoAddOnPacks');

// Phase 45 (Stripe Report-Specific Photo Add-Ons). Pure, dependency-free
// tests for the trusted pack catalogue -- see PHASES.md Phase 45's
// "AUTHORITATIVE CLIENT CONFIRMATION" for the exact confirmed values.

test('catalogue: exact confirmed packs and prices (client-confirmed, do not change without re-confirmation)', () => {
  const byId = Object.fromEntries(CATALOGUE.map((p) => [p.id, p]));
  assert.equal(byId.photos_25.capacity, 25);
  assert.equal(byId.photos_25.amountCents, 499);
  assert.equal(byId.photos_50.capacity, 50);
  assert.equal(byId.photos_50.amountCents, 799);
  assert.equal(byId.photos_100.capacity, 100);
  assert.equal(byId.photos_100.amountCents, 1299);
  assert.equal(byId.photos_250.capacity, 250);
  assert.equal(byId.photos_250.amountCents, 2499);
  for (const pack of CATALOGUE) assert.equal(pack.currency, 'usd');
});

test('catalogue: validates as a whole (unique ids, positive integers, active flags)', () => {
  const { valid, errors } = validateCatalogue(CATALOGUE);
  assert.equal(valid, true, JSON.stringify(errors));
});

test('catalogue: rejects a duplicate pack id', () => {
  const bad = [...CATALOGUE, { ...CATALOGUE[0] }];
  const { valid, errors } = validateCatalogue(bad);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('duplicate pack id')));
});

test('catalogue: rejects a non-positive or non-integer capacity/amount', () => {
  const bad1 = CATALOGUE.map((p) => (p.id === 'photos_25' ? { ...p, capacity: 0 } : p));
  assert.equal(validateCatalogue(bad1).valid, false);
  const bad2 = CATALOGUE.map((p) => (p.id === 'photos_25' ? { ...p, capacity: 25.5 } : p));
  assert.equal(validateCatalogue(bad2).valid, false);
  const bad3 = CATALOGUE.map((p) => (p.id === 'photos_50' ? { ...p, amountCents: -1 } : p));
  assert.equal(validateCatalogue(bad3).valid, false);
});

test('catalogue: resolveActivePack rejects unknown and inactive packs identically (no enumeration oracle)', () => {
  assert.equal(resolveActivePack('nonexistent-pack'), null);
  const withInactive = CATALOGUE.map((p) => (p.id === 'photos_25' ? { ...p, active: false } : p));
  assert.equal(resolveActivePack('photos_25', withInactive), null);
  assert.notEqual(resolveActivePack('photos_50', withInactive), null);
});

test('resolveStripeMode: defaults to test whenever the key is missing/malformed, never silently live', () => {
  assert.equal(resolveStripeMode(undefined), 'test');
  assert.equal(resolveStripeMode(''), 'test');
  assert.equal(resolveStripeMode('sk_test_abc123'), 'test');
  assert.equal(resolveStripeMode('not-a-real-key'), 'test');
  assert.equal(resolveStripeMode('sk_live_abc123'), 'live');
});

test('getPackPriceId: test and live Price IDs are never mixed', () => {
  const pack = { stripePriceId: { test: 'price_test_123', live: 'price_live_456' } };
  assert.equal(getPackPriceId(pack, 'test'), 'price_test_123');
  assert.equal(getPackPriceId(pack, 'live'), 'price_live_456');
});

test('getPackPriceId: an unconfigured slot resolves to null, never a fabricated default', () => {
  const pack = { stripePriceId: { test: null, live: null } };
  assert.equal(getPackPriceId(pack, 'test'), null);
  assert.equal(getPackPriceId(pack, 'live'), null);
  // The real, shipped catalogue has no Stripe access yet -- every slot must
  // be empty right now, never a fabricated `price_xxx`-looking default.
  for (const p of CATALOGUE) {
    assert.equal(p.stripePriceId.test, null, `${p.id}.test must be unset until Stripe access is granted`);
    assert.equal(p.stripePriceId.live, null, `${p.id}.live must be unset until Stripe access is granted`);
  }
});

test('getPublicCatalogue: sanitized shape never leaks Price IDs or internal-only fields', () => {
  const pub = getPublicCatalogue();
  assert.equal(pub.length, 4);
  for (const p of pub) {
    assert.equal('stripePriceId' in p, false);
    assert.ok(['id', 'label', 'capacity', 'amountCents', 'currency', 'active'].every((k) => k in p));
  }
});

test('getPublicCatalogue: only active packs are listed', () => {
  const withInactive = CATALOGUE.map((p) => (p.id === 'photos_25' ? { ...p, active: false } : p));
  const pub = getPublicCatalogue(withInactive);
  assert.equal(pub.some((p) => p.id === 'photos_25'), false);
  assert.equal(pub.length, 3);
});
