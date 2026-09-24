const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeFirestore } = require('./helpers/fakeFirestore');
const {
  createAddressNormalization,
  resolveAddressNormalization,
} = require('../utils/addressNormalizationStore');

// Phase 46. The trust-boundary store: a client can only ever hand back a
// TOKEN for a normalization the server itself already computed and stored
// -- never the values themselves as "verified".

test('create then resolve returns the exact server-stored values, scoped to the requesting uid', async () => {
  const db = new FakeFirestore();
  const { token, expiresAt } = await createAddressNormalization(db, {
    requestedByUid: 'uid-1',
    original: '1425 Maple St',
    normalizedValues: { city: 'Austin', countryCode: 'US' },
    ambiguous: false,
  });
  assert.match(token, /^an_[0-9a-f]{24}$/);
  assert.ok(new Date(expiresAt).getTime() > Date.now());

  const record = await resolveAddressNormalization(db, { token, requestedByUid: 'uid-1' });
  assert.deepEqual(record.normalizedValues, { city: 'Austin', countryCode: 'US' });
});

test('a different uid cannot resolve someone else\'s normalization (forbidden, not silently allowed)', async () => {
  const db = new FakeFirestore();
  const { token } = await createAddressNormalization(db, {
    requestedByUid: 'uid-owner',
    normalizedValues: { city: 'Austin' },
  });
  await assert.rejects(
    () => resolveAddressNormalization(db, { token, requestedByUid: 'uid-attacker' }),
    (err) => err.code === 'ADDRESS_NORMALIZATION_FORBIDDEN'
  );
});

test('an unknown/forged token is rejected as not found -- a client cannot fabricate a trusted normalization', async () => {
  const db = new FakeFirestore();
  await assert.rejects(
    () => resolveAddressNormalization(db, { token: 'an_totally_made_up', requestedByUid: 'uid-1' }),
    (err) => err.code === 'ADDRESS_NORMALIZATION_NOT_FOUND'
  );
});

test('a blank token is rejected as not found', async () => {
  const db = new FakeFirestore();
  await assert.rejects(
    () => resolveAddressNormalization(db, { token: '', requestedByUid: 'uid-1' }),
    (err) => err.code === 'ADDRESS_NORMALIZATION_NOT_FOUND'
  );
});

test('an expired normalization is rejected', async () => {
  const db = new FakeFirestore();
  const prevTtl = process.env.ADDRESS_NORMALIZATION_TTL_MINUTES;
  process.env.ADDRESS_NORMALIZATION_TTL_MINUTES = '-1'; // already expired at creation
  // Re-require to pick up the new TTL (module reads env at load time).
  delete require.cache[require.resolve('../utils/addressNormalizationStore')];
  const store = require('../utils/addressNormalizationStore');
  const { token } = await store.createAddressNormalization(db, { requestedByUid: 'uid-1', normalizedValues: {} });
  await assert.rejects(
    () => store.resolveAddressNormalization(db, { token, requestedByUid: 'uid-1' }),
    (err) => err.code === 'ADDRESS_NORMALIZATION_EXPIRED'
  );
  if (prevTtl === undefined) delete process.env.ADDRESS_NORMALIZATION_TTL_MINUTES;
  else process.env.ADDRESS_NORMALIZATION_TTL_MINUTES = prevTtl;
  delete require.cache[require.resolve('../utils/addressNormalizationStore')];
});
