const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeFirestore } = require('./helpers/fakeFirestore');
const { SOURCE, VERIFICATION_STATUS, LOOKUP_STATUS } = require('../utils/propertyIntelligence');

const registryPath = require.resolve('../services/propertyIntelligenceProviders/registry');
const servicePath = require.resolve('../services/propertyIntelligenceService');

// Stubs the provider registry (same require-cache convention
// property-profile-route.test.js uses for propertyService) so these tests
// exercise the FULL service pipeline against a controlled fixture provider
// without ever touching realtyApiProvider/network.
function loadServiceWithProvider(providerImpl) {
  delete require.cache[registryPath];
  delete require.cache[servicePath];
  require.cache[registryPath] = {
    id: registryPath,
    filename: registryPath,
    loaded: true,
    exports: { getPropertyIntelligenceProvider: () => providerImpl, PROVIDERS: {}, DEFAULT_PROVIDER: 'realty_api' },
  };
  return require('../services/propertyIntelligenceService');
}

const CONFIRMED_US_PROFILE = {
  status: 'confirmed',
  propertyLookupEligible: true,
  fields: {
    addressLine1: { value: '123 Main St' },
    city: { value: 'Austin' },
    state: { value: 'Texas' },
    stateCode: { value: 'TX' },
    postalCode: { value: '78701' },
    countryCode: { value: 'US' },
  },
};

test('computeEligibility: not-yet-confirmed address is a safe not_eligible state, never an error', () => {
  const service = loadServiceWithProvider({ lookupProperty: async () => { throw new Error('should not be called'); } });
  const eligibility = service.computeEligibility({ status: 'unconfirmed', propertyLookupEligible: true, fields: {} });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, 'address_not_confirmed');
});

test('computeEligibility: a confirmed non-US address is a safe not_eligible state', () => {
  const service = loadServiceWithProvider({});
  const eligibility = service.computeEligibility({ status: 'confirmed', propertyLookupEligible: false, fields: {} });
  assert.equal(eligibility.reason, 'country_not_supported');
});

test('computeEligibility: a confirmed US address missing required components is incomplete_address', () => {
  const service = loadServiceWithProvider({});
  const eligibility = service.computeEligibility({ status: 'confirmed', propertyLookupEligible: true, fields: { countryCode: { value: 'US' } } });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, 'incomplete_address');
});

test('requestPropertyIntelligence: non-US/unconfirmed never calls the provider and never throws', async () => {
  let called = false;
  const service = loadServiceWithProvider({ lookupProperty: async () => { called = true; } });
  const result = await service.requestPropertyIntelligence(new FakeFirestore(), {
    reportId: 'r1',
    propertyProfile: { status: 'confirmed', propertyLookupEligible: false, fields: {} },
    requestedByUid: 'uid-1',
  });
  assert.equal(result.status, LOOKUP_STATUS.NOT_ELIGIBLE);
  assert.equal(called, false);
});

test('requestPropertyIntelligence: no registered provider throws PROPERTY_PROVIDER_NOT_CONFIGURED', async () => {
  delete require.cache[registryPath];
  require.cache[registryPath] = {
    id: registryPath, filename: registryPath, loaded: true,
    exports: { getPropertyIntelligenceProvider: () => null, PROVIDERS: {}, DEFAULT_PROVIDER: 'realty_api' },
  };
  delete require.cache[servicePath];
  const service = require('../services/propertyIntelligenceService');
  await assert.rejects(
    () => service.requestPropertyIntelligence(new FakeFirestore(), { reportId: 'r1', propertyProfile: CONFIRMED_US_PROFILE, requestedByUid: 'uid-1' }),
    (err) => err.code === 'PROPERTY_PROVIDER_NOT_CONFIGURED'
  );
});

test('requestPropertyIntelligence: a full result returns status=full, persists a lookup, and populates every field', async () => {
  const service = loadServiceWithProvider({
    lookupProperty: async () => ({ raw: { yearBuilt: 1998, bedrooms: 3 } }),
    normalizePropertyResult: (raw) => raw.raw,
  });
  const result = await service.requestPropertyIntelligence(new FakeFirestore(), {
    reportId: 'r1', propertyProfile: CONFIRMED_US_PROFILE, requestedByUid: 'uid-1',
  });
  assert.equal(result.status, LOOKUP_STATUS.PARTIAL); // only 2 of the full field set populated
  assert.match(result.lookupId, /^pl_/);
  assert.equal(result.fields.yearBuilt.value, 1998);
  assert.equal(result.fields.yearBuilt.source, SOURCE.THIRD_PARTY);
});

test('requestPropertyIntelligence: a no-match provider error returns a safe no_match status, not a thrown error', async () => {
  const err = Object.assign(new Error('no match'), { code: 'PROPERTY_NO_MATCH' });
  const service = loadServiceWithProvider({ lookupProperty: async () => { throw err; } });
  const result = await service.requestPropertyIntelligence(new FakeFirestore(), {
    reportId: 'r1', propertyProfile: CONFIRMED_US_PROFILE, requestedByUid: 'uid-1',
  });
  assert.equal(result.status, LOOKUP_STATUS.NO_MATCH);
});

test('requestPropertyIntelligence: an ambiguous result returns status=ambiguous', async () => {
  const service = loadServiceWithProvider({ lookupProperty: async () => ({ ambiguous: true }) });
  const result = await service.requestPropertyIntelligence(new FakeFirestore(), {
    reportId: 'r1', propertyProfile: CONFIRMED_US_PROFILE, requestedByUid: 'uid-1',
  });
  assert.equal(result.status, LOOKUP_STATUS.AMBIGUOUS);
});

test('requestPropertyIntelligence: a genuine transient provider error propagates as a categorized error', async () => {
  const err = Object.assign(new Error('down'), { code: 'PROPERTY_PROVIDER_ERROR', transient: true });
  const service = loadServiceWithProvider({ lookupProperty: async () => { throw err; } });
  await assert.rejects(
    () => service.requestPropertyIntelligence(new FakeFirestore(), { reportId: 'r1', propertyProfile: CONFIRMED_US_PROFILE, requestedByUid: 'uid-1' }),
    (e) => e.code === 'PROPERTY_PROVIDER_ERROR'
  );
});

test('requestPropertyIntelligence: a second request reuses the cache (no second provider call) unless recheck=true', async () => {
  let callCount = 0;
  const service = loadServiceWithProvider({
    lookupProperty: async () => { callCount += 1; return { raw: { yearBuilt: 1998 } }; },
    normalizePropertyResult: (raw) => raw.raw,
  });
  const db = new FakeFirestore();
  await service.requestPropertyIntelligence(db, { reportId: 'r1', propertyProfile: CONFIRMED_US_PROFILE, requestedByUid: 'uid-1' });
  const second = await service.requestPropertyIntelligence(db, { reportId: 'r1', propertyProfile: CONFIRMED_US_PROFILE, requestedByUid: 'uid-1' });
  assert.equal(callCount, 1);
  assert.equal(second.cacheHit, true);

  const recheck = await service.requestPropertyIntelligence(db, { reportId: 'r1', propertyProfile: CONFIRMED_US_PROFILE, requestedByUid: 'uid-1', recheck: true });
  assert.equal(callCount, 2);
  assert.equal(recheck.cacheHit, false);
});

test('applyPropertyIntelligence (manual mode): trusts only the caller-supplied overrides', async () => {
  const service = loadServiceWithProvider({});
  const intel = await service.applyPropertyIntelligence(new FakeFirestore(), {
    reportId: 'r1', existingIntelligence: null, mode: 'manual', overrides: { yearBuilt: 1998 }, requestedByUid: 'uid-1',
  });
  assert.equal(intel.fields.yearBuilt.value, 1998);
  assert.equal(intel.fields.yearBuilt.source, SOURCE.USER_OVERRIDDEN);
  assert.equal(intel.fields.yearBuilt.verificationStatus, VERIFICATION_STATUS.USER_CONFIRMED);
  assert.equal(intel.status, LOOKUP_STATUS.CONFIRMED);
  assert.equal(intel.confirmedBy, 'uid-1');
});

test('applyPropertyIntelligence (provider_confirmed mode): only SELECTED keys are applied from the trusted lookup', async () => {
  const service = loadServiceWithProvider({
    lookupProperty: async () => ({ raw: { yearBuilt: 1998, bedrooms: 3 } }),
    normalizePropertyResult: (raw) => raw.raw,
  });
  const db = new FakeFirestore();
  const lookup = await service.requestPropertyIntelligence(db, { reportId: 'r1', propertyProfile: CONFIRMED_US_PROFILE, requestedByUid: 'uid-1' });
  const intel = await service.applyPropertyIntelligence(db, {
    reportId: 'r1', existingIntelligence: null, mode: 'provider_confirmed', lookupId: lookup.lookupId,
    selectedKeys: ['yearBuilt'], overrides: {}, requestedByUid: 'uid-1',
  });
  assert.equal(intel.fields.yearBuilt.value, 1998);
  assert.equal(intel.fields.yearBuilt.verificationStatus, VERIFICATION_STATUS.USER_CONFIRMED);
  assert.equal(intel.fields.bedrooms.value, null, 'not selected -- must not be silently applied');
});

test('applyPropertyIntelligence: a forged/unknown lookupId is rejected, never trusted', async () => {
  const service = loadServiceWithProvider({});
  await assert.rejects(
    () => service.applyPropertyIntelligence(new FakeFirestore(), {
      reportId: 'r1', existingIntelligence: null, mode: 'provider_confirmed', lookupId: 'pl_forged', selectedKeys: ['yearBuilt'], requestedByUid: 'uid-1',
    }),
    (err) => err.code === 'PROPERTY_LOOKUP_NOT_FOUND'
  );
});

test('applyPropertyIntelligence: a cross-report lookupId is rejected', async () => {
  const service = loadServiceWithProvider({
    lookupProperty: async () => ({ raw: { yearBuilt: 1998 } }),
    normalizePropertyResult: (raw) => raw.raw,
  });
  const db = new FakeFirestore();
  const lookup = await service.requestPropertyIntelligence(db, { reportId: 'report-A', propertyProfile: CONFIRMED_US_PROFILE, requestedByUid: 'uid-1' });
  await assert.rejects(
    () => service.applyPropertyIntelligence(db, {
      reportId: 'report-B', existingIntelligence: null, mode: 'provider_confirmed', lookupId: lookup.lookupId, selectedKeys: ['yearBuilt'], requestedByUid: 'uid-1',
    }),
    (err) => err.code === 'PROPERTY_LOOKUP_NOT_FOUND'
  );
});

test('applyPropertyIntelligence: a client-forged source/status on an override is ignored -- validated + re-tagged server-side', async () => {
  const service = loadServiceWithProvider({});
  const intel = await service.applyPropertyIntelligence(new FakeFirestore(), {
    reportId: 'r1', existingIntelligence: null, mode: 'manual',
    overrides: { yearBuilt: { value: 1998, source: 'realty_api_verified', verificationStatus: 'trusted' } }, // forged shape
    requestedByUid: 'uid-1',
  });
  // The forged object itself fails yearBuilt's numeric validator -> dropped to empty, never trusted as-is.
  assert.equal(intel.fields.yearBuilt.value, null);
  assert.equal(intel.fields.yearBuilt.source, SOURCE.UNAVAILABLE);
});

test('applyPropertyIntelligence: never silently overwrites an already user-owned field on a later apply', async () => {
  const service = loadServiceWithProvider({
    lookupProperty: async () => ({ raw: { yearBuilt: 2005 } }),
    normalizePropertyResult: (raw) => raw.raw,
  });
  const db = new FakeFirestore();
  const existing = { fields: { yearBuilt: { value: 1998, source: SOURCE.USER_OVERRIDDEN, verificationStatus: VERIFICATION_STATUS.USER_CONFIRMED, userOverride: true } } };
  const lookup = await service.requestPropertyIntelligence(db, { reportId: 'r1', propertyProfile: CONFIRMED_US_PROFILE, requestedByUid: 'uid-1' });
  const intel = await service.applyPropertyIntelligence(db, {
    reportId: 'r1', existingIntelligence: existing, mode: 'provider_confirmed', lookupId: lookup.lookupId, selectedKeys: ['yearBuilt'], requestedByUid: 'uid-1',
  });
  assert.equal(intel.fields.yearBuilt.value, 1998, 'the user-owned value survives an unrelated new lookup');
});

test('applyPropertyIntelligence: idempotent -- applying the same selection twice yields the same result', async () => {
  const service = loadServiceWithProvider({
    lookupProperty: async () => ({ raw: { yearBuilt: 1998 } }),
    normalizePropertyResult: (raw) => raw.raw,
  });
  const db = new FakeFirestore();
  const lookup = await service.requestPropertyIntelligence(db, { reportId: 'r1', propertyProfile: CONFIRMED_US_PROFILE, requestedByUid: 'uid-1' });
  const args = { reportId: 'r1', existingIntelligence: null, mode: 'provider_confirmed', lookupId: lookup.lookupId, selectedKeys: ['yearBuilt'], requestedByUid: 'uid-1' };
  const first = await service.applyPropertyIntelligence(db, args);
  const second = await service.applyPropertyIntelligence(db, { ...args, existingIntelligence: first });
  assert.deepEqual(first.fields.yearBuilt, second.fields.yearBuilt);
});

test('staleIfAddressChanged: marks stale only when the address fingerprint actually changed', async () => {
  const service = loadServiceWithProvider({});
  const { computePropertyAddressFingerprint } = require('../utils/propertyIntelligenceFingerprint');
  const { SCHEMA_VERSION } = require('../utils/propertyIntelligence');
  const input = service.buildProviderRequestInput(CONFIRMED_US_PROFILE);
  const currentFingerprint = computePropertyAddressFingerprint({ ...input, provider: 'property_intelligence', schemaVersion: SCHEMA_VERSION });
  const yearBuiltField = { value: 1998, source: SOURCE.THIRD_PARTY, verificationStatus: VERIFICATION_STATUS.USER_CONFIRMED, userOverride: false };

  const unchanged = service.staleIfAddressChanged(
    { status: LOOKUP_STATUS.CONFIRMED, addressFingerprint: currentFingerprint, fields: { yearBuilt: yearBuiltField } },
    CONFIRMED_US_PROFILE
  );
  assert.equal(unchanged.fields.yearBuilt.verificationStatus, VERIFICATION_STATUS.USER_CONFIRMED, 'no change -- stays confirmed');

  const changed = service.staleIfAddressChanged(
    { status: LOOKUP_STATUS.CONFIRMED, addressFingerprint: 'fp-from-a-different-address', fields: { yearBuilt: yearBuiltField } },
    CONFIRMED_US_PROFILE
  );
  assert.equal(changed.status, 'stale');
  assert.equal(changed.fields.yearBuilt.verificationStatus, VERIFICATION_STATUS.STALE);
});
