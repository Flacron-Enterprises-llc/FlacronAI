const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeFirestore } = require('./helpers/fakeFirestore');
const propertyService = require('../services/propertyService');
const { SOURCE, VERIFICATION_STATUS, PROFILE_STATUS } = require('../utils/addressNormalization');

const withEnv = (vars, fn) => async () => {
  const prev = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  Object.assign(process.env, vars);
  try {
    await fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
};

test('getPublicConfig never returns a server key, unrestricted key, or any raw env value -- only booleans/enums', () => {
  process.env.GOOGLE_MAPS_SERVER_KEY = 'super-secret-should-never-leak';
  process.env.ADDRESS_LOOKUP_ENABLED = 'true';
  const config = propertyService.getPublicConfig();
  const serialized = JSON.stringify(config);
  assert.equal(serialized.includes('super-secret-should-never-leak'), false);
  assert.equal(typeof config.enabled, 'boolean');
  assert.equal(typeof config.browserAutocompleteConfigured, 'boolean');
  assert.equal(typeof config.serverNormalizationConfigured, 'boolean');
  assert.ok(!('serverKey' in config));
  assert.ok(!('projectId' in config));
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
});

test('getPublicConfig reports serverNormalizationConfigured=false with no key set', () => {
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  assert.equal(propertyService.getPublicConfig().serverNormalizationConfigured, false);
});

test(
  'normalizePlace throws ADDRESS_PROVIDER_UNAVAILABLE with no server key -- report creation is never blocked by this',
  withEnv({ GOOGLE_MAPS_SERVER_KEY: '' }, async () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    await assert.rejects(
      () => propertyService.normalizePlace(new FakeFirestore(), { placeId: 'p1', requestedByUid: 'uid-1' }),
      (err) => err.code === 'ADDRESS_PROVIDER_UNAVAILABLE'
    );
  })
);

test(
  'normalizePlace: happy path wraps provider values as PROVIDER_NORMALIZED fields and persists a normalization token',
  withEnv({ GOOGLE_MAPS_SERVER_KEY: 'fake-key', ADDRESS_PROVIDER: 'google' }, async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            formatted_address: '1425 Maple St, Austin, TX 78701, USA',
            address_components: [
              { long_name: '1425', short_name: '1425', types: ['street_number'] },
              { long_name: 'Maple Street', short_name: 'Maple St', types: ['route'] },
              { long_name: 'Austin', short_name: 'Austin', types: ['locality'] },
              { long_name: 'Texas', short_name: 'TX', types: ['administrative_area_level_1'] },
              { long_name: '78701', short_name: '78701', types: ['postal_code'] },
              { long_name: 'United States', short_name: 'US', types: ['country'] },
            ],
            geometry: { location: { lat: 30.2672, lng: -97.7431 } },
            place_id: 'place-1',
          },
        ],
      }),
    });
    try {
      const db = new FakeFirestore();
      const result = await propertyService.normalizePlace(db, { placeId: 'place-1', original: '1425 maple', requestedByUid: 'uid-1' });
      assert.match(result.normalizationToken, /^an_/);
      assert.equal(result.ambiguous, false);
      assert.equal(result.profile.status, PROFILE_STATUS.UNCONFIRMED);
      assert.equal(result.profile.propertyLookupEligible, true);
      assert.equal(result.profile.fields.city.value, 'Austin');
      assert.equal(result.profile.fields.city.source, SOURCE.PROVIDER_NORMALIZED);
      assert.equal(result.profile.fields.city.verificationStatus, VERIFICATION_STATUS.PROVIDER_NORMALIZED);
    } finally {
      global.fetch = originalFetch;
    }
  })
);

test(
  'buildConfirmedPropertyProfile (manual mode) trusts only the caller-supplied overrides, never a provider token',
  async () => {
    const db = new FakeFirestore();
    const profile = await propertyService.buildConfirmedPropertyProfile(db, {
      existingProfile: null,
      mode: 'manual',
      original: '892 Oakwood Drive, Dallas, TX 75201',
      overrides: { addressLine1: '892 Oakwood Drive', city: 'Dallas', state: 'TX', postalCode: '75201', countryCode: 'US' },
      requestedByUid: 'uid-1',
    });
    assert.equal(profile.status, PROFILE_STATUS.CONFIRMED);
    assert.equal(profile.fields.city.source, SOURCE.MANUAL_ENTRY);
    assert.equal(profile.fields.city.verificationStatus, VERIFICATION_STATUS.USER_CONFIRMED);
    assert.equal(profile.propertyLookupEligible, true);
    assert.equal(profile.confirmedBy, 'uid-1');
  }
);

test('buildConfirmedPropertyProfile (provider_confirmed mode) requires a VALID token -- a forged/unknown token is rejected, never trusted', async () => {
  const db = new FakeFirestore();
  await assert.rejects(
    () =>
      propertyService.buildConfirmedPropertyProfile(db, {
        existingProfile: null,
        mode: 'provider_confirmed',
        normalizationToken: 'an_forged_by_client',
        requestedByUid: 'uid-1',
      }),
    (err) => err.code === 'ADDRESS_NORMALIZATION_NOT_FOUND'
  );
});

test('buildConfirmedPropertyProfile (provider_confirmed mode): unedited fields become source=PROVIDER_NORMALIZED/USER_CONFIRMED, edited fields become USER_OVERRIDDEN', async () => {
  const db = new FakeFirestore();
  const { createAddressNormalization } = require('../utils/addressNormalizationStore');
  const { token } = await createAddressNormalization(db, {
    requestedByUid: 'uid-1',
    normalizedValues: { city: 'Austin', state: 'Texas', stateCode: 'TX', postalCode: '78701', countryCode: 'US' },
  });
  const profile = await propertyService.buildConfirmedPropertyProfile(db, {
    existingProfile: null,
    mode: 'provider_confirmed',
    normalizationToken: token,
    overrides: { postalCode: '78702' }, // user corrected the unit/zip during review
    requestedByUid: 'uid-1',
  });
  assert.equal(profile.fields.city.source, SOURCE.PROVIDER_NORMALIZED);
  assert.equal(profile.fields.city.userOverride, false);
  assert.equal(profile.fields.postalCode.value, '78702');
  assert.equal(profile.fields.postalCode.source, SOURCE.USER_OVERRIDDEN);
  assert.equal(profile.fields.postalCode.userOverride, true);
});

test('buildConfirmedPropertyProfile never silently overwrites an already user-owned field on a later re-confirm unless explicitly re-overridden', async () => {
  const db = new FakeFirestore();
  const { createAddressNormalization } = require('../utils/addressNormalizationStore');
  const existingProfile = {
    fields: {
      addressLine2: { value: 'Unit 9C', source: SOURCE.USER_OVERRIDDEN, verificationStatus: VERIFICATION_STATUS.USER_CONFIRMED, userOverride: true },
    },
  };
  const { token } = await createAddressNormalization(db, {
    requestedByUid: 'uid-1',
    normalizedValues: { city: 'Austin', addressLine2: '' }, // a fresh lookup that says nothing about the unit
  });
  const profile = await propertyService.buildConfirmedPropertyProfile(db, {
    existingProfile,
    mode: 'provider_confirmed',
    normalizationToken: token,
    requestedByUid: 'uid-1',
  });
  assert.equal(profile.fields.addressLine2.value, 'Unit 9C', 'the user-owned unit number survives an unrelated re-lookup');
  assert.equal(profile.fields.addressLine2.userOverride, true);
});

test('buildConfirmedPropertyProfile: an out-of-range coordinate from a token is dropped to an empty field, never persisted as trusted', async () => {
  const db = new FakeFirestore();
  const { createAddressNormalization } = require('../utils/addressNormalizationStore');
  const { token } = await createAddressNormalization(db, {
    requestedByUid: 'uid-1',
    normalizedValues: { latitude: 999, longitude: -97.7 },
  });
  const profile = await propertyService.buildConfirmedPropertyProfile(db, {
    existingProfile: null,
    mode: 'provider_confirmed',
    normalizationToken: token,
    requestedByUid: 'uid-1',
  });
  assert.equal(profile.fields.latitude.value, null);
  assert.equal(profile.fields.longitude.value, -97.7);
});
