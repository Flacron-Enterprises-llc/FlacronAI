const test = require('node:test');
const assert = require('node:assert/strict');
const { getAddressProvider, DEFAULT_PROVIDER } = require('../services/addressProviders/registry');

// Phase 46. Provider selection is purely server-env-driven -- never a
// client-suppliable value (the routes/propertyService never read a
// "provider" field from req.body at all, so there's nothing to test there;
// this covers the registry's own selection logic).

test('defaults to google when ADDRESS_PROVIDER is unset', () => {
  const prev = process.env.ADDRESS_PROVIDER;
  delete process.env.ADDRESS_PROVIDER;
  const provider = getAddressProvider();
  assert.equal(DEFAULT_PROVIDER, 'google');
  assert.equal(provider.PROVIDER_NAME, 'google');
  if (prev !== undefined) process.env.ADDRESS_PROVIDER = prev;
});

test('an unknown provider name resolves to null (never throws, never falls back to an unintended provider)', () => {
  const prev = process.env.ADDRESS_PROVIDER;
  process.env.ADDRESS_PROVIDER = 'not-a-real-provider';
  assert.equal(getAddressProvider(), null);
  if (prev === undefined) delete process.env.ADDRESS_PROVIDER;
  else process.env.ADDRESS_PROVIDER = prev;
});
