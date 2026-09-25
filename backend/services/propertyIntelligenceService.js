// Phase 47 (Property Intelligence: RealtyAPI U.S. Adapter & Report
// Integration). Orchestration layer between the routes
// (backend/routes/reports.js) and the provider registry/lookup store.
// Nothing here is RealtyAPI-specific -- swapping the configured provider
// (propertyIntelligenceProviders/registry.js) changes nothing on this
// module's public surface, and today the registered provider always fails
// safe with PROPERTY_PROVIDER_NOT_CONFIGURED (see realtyApiProvider.js).
const { getPropertyIntelligenceProvider } = require('./propertyIntelligenceProviders/registry');
const { computePropertyAddressFingerprint } = require('../utils/propertyIntelligenceFingerprint');
const {
  createPropertyLookup,
  resolvePropertyLookup,
  getCachedPropertyValues,
  setCachedPropertyValues,
} = require('../utils/propertyIntelligenceStore');
const {
  FIELD_KEYS,
  SOURCE,
  VERIFICATION_STATUS,
  LOOKUP_STATUS,
  SCHEMA_VERSION,
  makeField,
  emptyField,
  normalizeProviderFields,
  validateFieldValue,
  buildEmptyPropertyIntelligence,
  markPropertyIntelligenceStale,
} = require('../utils/propertyIntelligence');

const makeError = (message, code, extra) => Object.assign(new Error(message), { code }, extra || {});

const DISCLAIMER =
  'Property data shown here is informational public-record data from a third-party source. Availability and freshness vary by jurisdiction and are not guaranteed current. It is not a coverage determination, appraisal, title report, flood certification, or legal verification, and does not replace the licensed adjuster\'s own review.';

// Sanitized, frontend-facing status -- never a raw provider/product name,
// key, base URL, or plan detail. `enabled`/`configured` are deliberately
// separate: `configured` is kept conservatively `false` here regardless of
// server env, not because the transport is unimplemented (it now is --
// see realtyApiProvider.js and backend/services/integrationStatusService.js
// for the actual technical readiness signal, which IS env-driven) but
// because this specific endpoint currently has no frontend caller
// (`frontend/src/services/api.js`'s `getPropertyIntelligenceConfig` is
// unused) and Phase 47 still has two open external items -- a RealtyAPI
// ToS/data-retention written confirmation and production (ECS) key
// activation -- before this feature should present itself as available to
// end users. Revisit once either the caller is wired up or those close.
const getPublicConfig = () => ({
  enabled: true,
  configured: false,
  schemaVersion: SCHEMA_VERSION,
  supportedCountryCodes: ['US'],
  capabilities: ['parcel_lookup', 'building_attributes', 'tax_assessment', 'flood_hazard'],
});

// Reads ONLY the minimal address fields a lookup needs off Phase 46's
// PropertyProfile -- never full report content, never claimant/policy/
// payment/photo data (see PHASES.md Phase 47's "Never send" list).
const buildProviderRequestInput = (propertyProfile) => {
  const f = propertyProfile?.fields || {};
  return {
    addressLine1: f.addressLine1?.value || '',
    city: f.city?.value || '',
    state: f.stateCode?.value || f.state?.value || '',
    postalCode: f.postalCode?.value || '',
    countryCode: f.countryCode?.value || '',
    latitude: f.latitude?.value ?? null,
    longitude: f.longitude?.value ?? null,
  };
};

// Eligibility per PHASES.md Phase 47 handoff rules: the address must be
// USER-CONFIRMED (Phase 46's `status === 'confirmed'`) and the country must
// be US. Anything else is a safe, non-error "not eligible" state -- never
// blocks report creation, never throws.
const computeEligibility = (propertyProfile) => {
  if (!propertyProfile || propertyProfile.status !== 'confirmed') {
    return { eligible: false, reason: 'address_not_confirmed' };
  }
  if (!propertyProfile.propertyLookupEligible) {
    return { eligible: false, reason: 'country_not_supported' };
  }
  const input = buildProviderRequestInput(propertyProfile);
  if (!input.addressLine1 || !input.city || !input.postalCode) {
    return { eligible: false, reason: 'incomplete_address' };
  }
  return { eligible: true, reason: null };
};

const currentFingerprint = (propertyProfile) => {
  const input = buildProviderRequestInput(propertyProfile);
  return computePropertyAddressFingerprint({ ...input, provider: 'property_intelligence', schemaVersion: SCHEMA_VERSION });
};

// Requests (or serves from cache) property intelligence for an existing
// report's confirmed U.S. address. Returns a plain result object for every
// NORMAL outcome (not_eligible/no_match/ambiguous/partial/full) -- the route
// maps these straight to a 200 response, per the phase's own "never an
// error blocking report creation" requirement. Throws a categorized error
// ONLY for a genuine operational failure (provider not configured,
// timeout, malformed response, transient upstream error) -- the route maps
// those to their documented HTTP status.
//
// Any error that escapes is tagged with `err.stage` (the step that was
// running) so the route can log WHERE a lookup failed without logging the
// address or any property data.
const requestPropertyIntelligence = async (db, options = {}) => {
  const stageRef = { stage: 'eligibility' };
  try {
    return await runPropertyIntelligenceLookup(db, options, stageRef);
  } catch (err) {
    if (err && typeof err === 'object' && !err.stage) err.stage = stageRef.stage;
    throw err;
  }
};

const runPropertyIntelligenceLookup = async (db, { reportId, propertyProfile, requestedByUid, recheck, signal } = {}, stageRef) => {
  const eligibility = computeEligibility(propertyProfile);
  if (!eligibility.eligible) {
    return { status: LOOKUP_STATUS.NOT_ELIGIBLE, reason: eligibility.reason, intelligence: buildEmptyPropertyIntelligence() };
  }

  const provider = getPropertyIntelligenceProvider();
  if (!provider) {
    throw makeError('Property data lookup is not currently available.', 'PROPERTY_PROVIDER_NOT_CONFIGURED');
  }

  const fingerprint = currentFingerprint(propertyProfile);
  const input = buildProviderRequestInput(propertyProfile);

  let rawValues = null;
  let cacheHit = false;
  if (!recheck) {
    stageRef.stage = 'cache_read';
    rawValues = await getCachedPropertyValues(db, fingerprint);
    cacheHit = !!rawValues;
  }

  let ambiguous = false;
  let providerRecordId = null;
  let providerEffectiveDate = null;

  if (!rawValues) {
    let raw;
    stageRef.stage = 'provider_call';
    try {
      raw = await provider.lookupProperty(input, { timeoutMs: undefined, signal });
    } catch (err) {
      if (err.code === 'PROPERTY_NO_MATCH') {
        return { status: LOOKUP_STATUS.NO_MATCH, intelligence: buildEmptyPropertyIntelligence() };
      }
      throw err;
    }
    if (raw?.ambiguous) {
      ambiguous = true;
    } else {
      stageRef.stage = 'normalize';
      rawValues = provider.normalizePropertyResult(raw);
      providerRecordId = rawValues.providerRecordId || null;
      providerEffectiveDate = rawValues.providerEffectiveDate || null;
      stageRef.stage = 'cache_write';
      await setCachedPropertyValues(db, fingerprint, rawValues, { providerRecordId, providerEffectiveDate });
    }
  }

  if (ambiguous) {
    return { status: LOOKUP_STATUS.AMBIGUOUS, intelligence: buildEmptyPropertyIntelligence() };
  }

  stageRef.stage = 'field_validation';
  const fields = normalizeProviderFields(rawValues);
  const populatedCount = FIELD_KEYS.filter((k) => fields[k].value !== null).length;
  const status = populatedCount === 0 ? LOOKUP_STATUS.NO_MATCH : populatedCount === FIELD_KEYS.length ? LOOKUP_STATUS.FULL : LOOKUP_STATUS.PARTIAL;

  stageRef.stage = 'lookup_persist';
  const { lookupId, expiresAt } = await createPropertyLookup(db, {
    reportId,
    requestedByUid,
    status,
    fields,
    providerRecordId,
    providerEffectiveDate,
    addressFingerprint: fingerprint,
    disclaimers: [DISCLAIMER],
  });

  return {
    status,
    lookupId,
    expiresAt,
    cacheHit,
    fields,
    providerRecordId,
    providerEffectiveDate,
    addressFingerprint: fingerprint,
    disclaimers: [DISCLAIMER],
  };
};

// Applies selected/edited property-intelligence fields onto the report's
// existing `propertyProfile.propertyIntelligence`. `mode: 'manual'` trusts
// nothing but the caller's own overrides. `mode: 'provider_confirmed'`
// requires a valid, owned, unexpired lookupId; only keys listed in
// `selectedKeys` are taken from that trusted record (a client accepts
// fields individually or all at once -- never an implicit "accept
// everything"), and `overrides` on top of that are the only way a value
// differs from what the server actually looked up.
//
// Golden rule enforced here: an existing field the user already owns
// (`userOverride: true`) is carried forward untouched unless THIS SAME call
// explicitly re-overrides that exact key -- a fresh lookup or a partial
// accept can never silently clobber it. Idempotent by construction: calling
// this again with the same lookupId/selectedKeys/overrides against the same
// existingIntelligence produces the same result (no consumption bookkeeping
// to make a repeat call behave differently).
const applyPropertyIntelligence = async (
  db,
  { reportId, existingIntelligence, mode, lookupId, selectedKeys, overrides, requestedByUid, addressFingerprint }
) => {
  const cleanMode = mode === 'manual' ? 'manual' : 'provider_confirmed';
  const overrideEntries = overrides && typeof overrides === 'object' ? overrides : {};
  const overrideKeys = new Set(Object.keys(overrideEntries).filter((k) => FIELD_KEYS.includes(k)));
  const selectedKeySet = new Set(
    (Array.isArray(selectedKeys) ? selectedKeys : []).filter((k) => FIELD_KEYS.includes(k))
  );

  let trustedFields = null;
  let providerRecordId = existingIntelligence?.providerRecordId || null;
  let providerEffectiveDate = existingIntelligence?.providerEffectiveDate || null;
  let lookupTimestamp = existingIntelligence?.lookupTimestamp || null;
  let fingerprint = existingIntelligence?.addressFingerprint || addressFingerprint || null;

  if (cleanMode === 'provider_confirmed') {
    const record = await resolvePropertyLookup(db, { reportId, lookupId, requestedByUid });
    trustedFields = record.fields || {};
    providerRecordId = record.providerRecordId || null;
    providerEffectiveDate = record.providerEffectiveDate || null;
    lookupTimestamp = record.createdAt || null;
    fingerprint = record.addressFingerprint || fingerprint;
  }

  const fields = {};
  for (const key of FIELD_KEYS) {
    const existing = existingIntelligence?.fields?.[key];
    const userOwnsUntouched = existing?.userOverride && !overrideKeys.has(key);
    if (userOwnsUntouched) {
      fields[key] = existing;
      continue;
    }

    const overridden = overrideKeys.has(key);
    if (overridden) {
      const clean = validateFieldValue(key, overrideEntries[key]);
      fields[key] = clean !== null ? makeField(clean, SOURCE.USER_OVERRIDDEN, VERIFICATION_STATUS.USER_CONFIRMED, true) : emptyField();
      continue;
    }

    if (cleanMode === 'manual') {
      // Manual mode with no override for this key -- keep whatever existed
      // (never silently blank a field the caller didn't touch).
      fields[key] = existing || emptyField();
      continue;
    }

    // provider_confirmed mode: only apply a trusted value for a key the
    // user explicitly SELECTED to accept -- an unselected key keeps its
    // prior value untouched (this is "user applies selected fields only").
    if (!selectedKeySet.has(key)) {
      fields[key] = existing || emptyField();
      continue;
    }
    const trusted = trustedFields[key];
    fields[key] = trusted && trusted.value !== null
      ? makeField(trusted.value, SOURCE.THIRD_PARTY, VERIFICATION_STATUS.USER_CONFIRMED, false)
      : existing || emptyField();
  }

  const anyConfirmed = FIELD_KEYS.some((k) => fields[k].verificationStatus === VERIFICATION_STATUS.USER_CONFIRMED);

  return {
    schemaVersion: SCHEMA_VERSION,
    status: anyConfirmed ? LOOKUP_STATUS.CONFIRMED : (existingIntelligence?.status || LOOKUP_STATUS.UNAVAILABLE),
    countryEligible: true,
    fields,
    providerRecordId,
    providerEffectiveDate,
    lookupTimestamp,
    addressFingerprint: fingerprint,
    confirmedAt: anyConfirmed ? new Date().toISOString() : existingIntelligence?.confirmedAt || null,
    confirmedBy: anyConfirmed ? requestedByUid : existingIntelligence?.confirmedBy || null,
    disclaimers: [DISCLAIMER],
  };
};

// Called by PUT /:id/property-profile whenever the ADDRESS itself changes --
// marks any existing propertyIntelligence stale rather than deleting it
// (the same "changed address makes prior provider-derived data stale, not
// invalid" rule addressNormalization.js already applies to the address
// fields themselves).
const staleIfAddressChanged = (existingIntelligence, newPropertyProfile) => {
  if (!existingIntelligence || existingIntelligence.status === LOOKUP_STATUS.UNAVAILABLE) return existingIntelligence;
  const newFingerprint = currentFingerprint(newPropertyProfile);
  if (!existingIntelligence.addressFingerprint || existingIntelligence.addressFingerprint === newFingerprint) {
    return existingIntelligence;
  }
  return markPropertyIntelligenceStale(existingIntelligence);
};

module.exports = {
  DISCLAIMER,
  getPublicConfig,
  buildProviderRequestInput,
  computeEligibility,
  requestPropertyIntelligence,
  applyPropertyIntelligence,
  staleIfAddressChanged,
};
