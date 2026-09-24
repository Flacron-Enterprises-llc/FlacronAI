const test = require('node:test');
const assert = require('node:assert/strict');
const { computePropertyAddressFingerprint } = require('../utils/propertyIntelligenceFingerprint');

test('computePropertyAddressFingerprint is deterministic for the same normalized input', () => {
  const a = computePropertyAddressFingerprint({ addressLine1: '123 Main St', city: 'Austin', state: 'TX', postalCode: '78701', countryCode: 'US', provider: 'p', schemaVersion: 1 });
  const b = computePropertyAddressFingerprint({ addressLine1: '123 Main St', city: 'Austin', state: 'TX', postalCode: '78701', countryCode: 'US', provider: 'p', schemaVersion: 1 });
  assert.equal(a, b);
});

test('computePropertyAddressFingerprint is case/whitespace-insensitive', () => {
  const a = computePropertyAddressFingerprint({ addressLine1: '123 Main St', city: 'austin', state: 'tx', postalCode: '78701', countryCode: 'us' });
  const b = computePropertyAddressFingerprint({ addressLine1: '  123 main st ', city: 'Austin', state: 'TX', postalCode: '78701', countryCode: 'US' });
  assert.equal(a, b);
});

test('computePropertyAddressFingerprint changes when the address actually changes', () => {
  const a = computePropertyAddressFingerprint({ addressLine1: '123 Main St', city: 'Austin', state: 'TX', postalCode: '78701', countryCode: 'US' });
  const b = computePropertyAddressFingerprint({ addressLine1: '456 Main St', city: 'Austin', state: 'TX', postalCode: '78701', countryCode: 'US' });
  assert.notEqual(a, b);
});

test('computePropertyAddressFingerprint never includes reportId/userId-shaped keys', () => {
  const fp = computePropertyAddressFingerprint({ addressLine1: '123 Main St', city: 'Austin', state: 'TX', postalCode: '78701', countryCode: 'US' });
  assert.match(fp, /^[a-f0-9]{64}$/); // pure sha256 hex, not a JSON blob with any identifiers
});
