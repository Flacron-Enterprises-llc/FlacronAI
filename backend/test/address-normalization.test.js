const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FIELD_KEYS,
  SOURCE,
  VERIFICATION_STATUS,
  PROFILE_STATUS,
  makeField,
  wrapValuesAsFields,
  isValidLatitude,
  isValidLongitude,
  sanitizeCoordinates,
  computePropertyLookupEligibility,
  buildManualPropertyProfile,
  buildLegacyPropertyProfileView,
  markProviderFieldsStale,
} = require('../utils/addressNormalization');

// Phase 46. Pure schema/mapping tests -- the provider-independent contract
// itself, independent of any Google-specific shape.

test('wrapValuesAsFields: present values get the given source/status; missing values become editable blanks, never invented', () => {
  const fields = wrapValuesAsFields(
    { city: 'Austin', state: '' },
    { source: SOURCE.PROVIDER_NORMALIZED, verificationStatus: VERIFICATION_STATUS.PROVIDER_NORMALIZED }
  );
  assert.equal(fields.city.value, 'Austin');
  assert.equal(fields.city.source, SOURCE.PROVIDER_NORMALIZED);
  assert.equal(fields.state.value, null);
  assert.equal(fields.state.source, SOURCE.UNAVAILABLE);
  assert.equal(fields.state.verificationStatus, VERIFICATION_STATUS.UNAVAILABLE);
  // Every declared FIELD_KEYS entry is present, even ones never passed in.
  for (const key of FIELD_KEYS) assert.ok(key in fields);
});

test('coordinate validation: finite, in-range only', () => {
  assert.equal(isValidLatitude(30.2672), true);
  assert.equal(isValidLatitude(90), true);
  assert.equal(isValidLatitude(-90), true);
  assert.equal(isValidLatitude(90.0001), false);
  assert.equal(isValidLatitude(NaN), false);
  assert.equal(isValidLatitude('30.2672'), false, 'a string is not a finite number');
  assert.equal(isValidLongitude(-97.7431), true);
  assert.equal(isValidLongitude(180), true);
  assert.equal(isValidLongitude(-180.5), false);
});

test('sanitizeCoordinates drops an out-of-range pair to null rather than clamping/guessing', () => {
  assert.deepEqual(sanitizeCoordinates(30.2672, -97.7431), { latitude: 30.2672, longitude: -97.7431 });
  assert.deepEqual(sanitizeCoordinates(999, -97.7431), { latitude: null, longitude: -97.7431 });
  assert.deepEqual(sanitizeCoordinates(undefined, undefined), { latitude: null, longitude: null });
});

test('propertyLookupEligible is true only for US, case-insensitively, and false (not invalid) otherwise', () => {
  assert.equal(computePropertyLookupEligibility('US'), true);
  assert.equal(computePropertyLookupEligibility('us'), true);
  assert.equal(computePropertyLookupEligibility('CA'), false);
  assert.equal(computePropertyLookupEligibility('GB'), false);
  assert.equal(computePropertyLookupEligibility(''), false);
  assert.equal(computePropertyLookupEligibility(undefined), false);
});

test('buildManualPropertyProfile marks every field manual/unverified/user-owned', () => {
  const profile = buildManualPropertyProfile({
    original: '1425 Maple Street, Austin, TX 78701',
    addressLine1: '1425 Maple Street',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'United States',
    countryCode: 'US',
  });
  assert.equal(profile.status, PROFILE_STATUS.UNCONFIRMED);
  assert.equal(profile.propertyLookupEligible, true);
  assert.equal(profile.fields.city.source, SOURCE.MANUAL_ENTRY);
  assert.equal(profile.fields.city.verificationStatus, VERIFICATION_STATUS.UNVERIFIED);
  assert.equal(profile.fields.city.userOverride, true);
});

test('buildLegacyPropertyProfileView never claims Google verification for old plain-text fields, and is non-destructive (read-only, no report mutation)', () => {
  const legacyReport = {
    propertyAddress: '892 Oakwood Drive, Dallas, TX 75201',
    propertyStreet: '892 Oakwood Drive',
    propertyCity: 'Dallas',
    propertyState: 'TX',
    propertyZip: '75201',
  };
  const view = buildLegacyPropertyProfileView(legacyReport);
  assert.equal(view.legacy, true);
  assert.equal(view.status, PROFILE_STATUS.UNCONFIRMED);
  assert.equal(view.propertyLookupEligible, false, 'legacy data never claims eligibility it was never derived for');
  assert.equal(view.fields.city.source, SOURCE.LEGACY);
  assert.equal(view.fields.city.verificationStatus, VERIFICATION_STATUS.UNAVAILABLE);
  assert.deepEqual(legacyReport, {
    propertyAddress: '892 Oakwood Drive, Dallas, TX 75201',
    propertyStreet: '892 Oakwood Drive',
    propertyCity: 'Dallas',
    propertyState: 'TX',
    propertyZip: '75201',
  }, 'the input report object itself is never mutated');
});

test('buildLegacyPropertyProfileView on a report with NO address fields at all still returns a valid, all-blank profile', () => {
  const view = buildLegacyPropertyProfileView({});
  assert.equal(view.original, '');
  assert.equal(view.fields.city.value, null);
  assert.equal(view.propertyLookupEligible, false);
});

test('markProviderFieldsStale flips only provider-sourced fields to stale, leaves user-owned fields untouched', () => {
  const profile = {
    status: PROFILE_STATUS.CONFIRMED,
    fields: {
      ...wrapValuesAsFields({}, {}),
      city: makeField('Austin', SOURCE.PROVIDER_NORMALIZED, VERIFICATION_STATUS.USER_CONFIRMED, false),
      addressLine2: makeField('Unit 4B', SOURCE.USER_OVERRIDDEN, VERIFICATION_STATUS.USER_CONFIRMED, true),
    },
  };
  const stale = markProviderFieldsStale(profile);
  assert.equal(stale.status, PROFILE_STATUS.STALE);
  assert.equal(stale.fields.city.verificationStatus, VERIFICATION_STATUS.STALE);
  assert.equal(stale.fields.addressLine2.verificationStatus, VERIFICATION_STATUS.USER_CONFIRMED, 'a user-overridden field is never marked stale by a provider refresh');
});
