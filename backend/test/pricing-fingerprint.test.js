const test = require('node:test');
const assert = require('node:assert/strict');
const { computePricingFingerprint, truncateToMonthWindow } = require('../utils/pricingFingerprint');

// Phase 43. Pure fingerprint-function tests: determinism, sensitivity, and
// -- the load-bearing privacy property -- that no PII/reportId/userId field
// is ever part of the hashed input (only generic, locale + repair-scope
// fields are), which is what makes a `pricingSuggestionsCache/{fingerprint}`
// document safe to reuse across different reports/users by construction.

const baseInput = () => ({
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
  provider: 'openai',
  model: 'gpt-4o-mini',
  promptVersion: 'v1',
  schemaVersion: 1,
});

test('same input always produces the same fingerprint (determinism)', () => {
  const a = computePricingFingerprint(baseInput());
  const b = computePricingFingerprint(baseInput());
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/, 'sha256 hex digest');
});

test('key order does not affect the fingerprint', () => {
  const input = baseInput();
  const reordered = Object.fromEntries(Object.entries(input).reverse());
  assert.equal(computePricingFingerprint(input), computePricingFingerprint(reordered));
});

test('case/whitespace-insensitive normalization does not affect the fingerprint', () => {
  const a = computePricingFingerprint(baseInput());
  const b = computePricingFingerprint({
    ...baseInput(),
    country: ' us ',
    unit: ' sf ',
    currency: 'usd',
  });
  assert.equal(a, b);
});

const FIELDS_THAT_MUST_CHANGE_THE_HASH = [
  ['country', 'CA'],
  ['state', 'CA'],
  ['city', 'Dallas'],
  ['postalCode', '90001'],
  ['room', 'Kitchen'],
  ['damageType', 'Fire'],
  ['repairAction', 'Repair'],
  ['material', 'Tile'],
  ['quantity', 20],
  ['unit', 'LF'],
  ['currency', 'CAD'],
  ['provider', 'claude'],
  ['model', 'other-model'],
  ['promptVersion', 'v2'],
  ['schemaVersion', 2],
];

for (const [field, newValue] of FIELDS_THAT_MUST_CHANGE_THE_HASH) {
  test(`changing "${field}" changes the fingerprint (sensitivity)`, () => {
    const a = computePricingFingerprint(baseInput());
    const b = computePricingFingerprint({ ...baseInput(), [field]: newValue });
    assert.notEqual(a, b);
  });
}

test('pricingDate is truncated to a month window -- two dates in the same month produce the same fingerprint', () => {
  const a = computePricingFingerprint({ ...baseInput(), pricingDate: '2026-09-01' });
  const b = computePricingFingerprint({ ...baseInput(), pricingDate: '2026-09-30' });
  assert.equal(a, b);
});

test('pricingDate in a different month changes the fingerprint', () => {
  const a = computePricingFingerprint({ ...baseInput(), pricingDate: '2026-09-30' });
  const b = computePricingFingerprint({ ...baseInput(), pricingDate: '2026-10-01' });
  assert.notEqual(a, b);
});

test('truncateToMonthWindow rejects a malformed date rather than hashing garbage', () => {
  assert.equal(truncateToMonthWindow('not-a-date'), null);
  assert.equal(truncateToMonthWindow(''), null);
  assert.equal(truncateToMonthWindow(undefined), null);
  assert.equal(truncateToMonthWindow('2026-09-19'), '2026-09');
});

test('no PII / reportId / userId field is ever part of the fingerprint input contract', () => {
  // A deliberately over-supplied input including fields that must NEVER
  // affect the hash (they aren't even read by computePricingFingerprint).
  const withExtraSensitiveFields = {
    ...baseInput(),
    reportId: 'report-should-not-matter',
    userId: 'user-should-not-matter',
    insuredName: 'Jane Homeowner',
    insuredEmail: 'jane@example.com',
    policyNumber: 'POL-12345',
    claimNumber: 'CLM-98765',
    streetAddress: '123 Main St',
  };
  assert.equal(
    computePricingFingerprint(withExtraSensitiveFields),
    computePricingFingerprint(baseInput()),
    'sensitive/identifying fields must never influence the fingerprint even if accidentally passed in'
  );
});
