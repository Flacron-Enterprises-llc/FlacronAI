// Phase 46 (Property Intelligence: Address Normalization & Google Integration).
// Provider-independent normalized address/location schema, per-field
// {value, source, verificationStatus, userOverride} wrapping, and pure
// validation helpers. Nothing here talks to Google or any network --
// provider-specific response shapes stop at the adapter boundary
// (backend/services/addressProviders/*), which hand THIS module plain
// values to wrap.
const { isFiniteNumber } = require('./canonicalEstimate');

const SCHEMA_VERSION = 1;

const SOURCE = {
  MANUAL_ENTRY: 'manual_entry',
  SUGGESTED: 'suggested',
  PROVIDER_SELECTED: 'provider_selected',
  PROVIDER_NORMALIZED: 'provider_normalized',
  USER_OVERRIDDEN: 'user_overridden',
  LEGACY: 'legacy_manual',
  UNAVAILABLE: 'unavailable',
};

const VERIFICATION_STATUS = {
  UNVERIFIED: 'unverified',
  PROVIDER_NORMALIZED: 'provider_normalized',
  USER_CONFIRMED: 'user_confirmed',
  UNAVAILABLE: 'unavailable',
  AMBIGUOUS: 'ambiguous',
  STALE: 'stale_recheck_required',
};

const PROFILE_STATUS = {
  UNCONFIRMED: 'unconfirmed',
  CONFIRMED: 'confirmed',
  STALE: 'stale',
};

// The full set of per-field keys a PropertyProfile tracks. Kept as a single
// list so every place that needs to iterate "all fields" (wrapping,
// stripping, legacy synthesis, stale-marking) stays in sync by construction.
const FIELD_KEYS = [
  'formattedAddress',
  'addressLine1',
  'addressLine2',
  'streetNumber',
  'route',
  'neighborhood',
  'city',
  'county',
  'state',
  'stateCode',
  'postalCode',
  'postalCodeSuffix',
  'country',
  'countryCode',
  'latitude',
  'longitude',
  'placeId',
];

const makeField = (value, source, verificationStatus, userOverride = false) => ({
  value: value === undefined ? null : value,
  source: source || SOURCE.UNAVAILABLE,
  verificationStatus: verificationStatus || VERIFICATION_STATUS.UNAVAILABLE,
  userOverride: !!userOverride,
});

const emptyField = () => makeField(null, SOURCE.UNAVAILABLE, VERIFICATION_STATUS.UNAVAILABLE, false);

// Wraps a flat { key: rawValue } map (as produced by a provider adapter's
// normalizeAddress) into { key: Field } using one shared source/status for
// every field that has a non-null value; missing/blank values become
// editable-blank UNAVAILABLE fields rather than invented data.
const wrapValuesAsFields = (values, { source, verificationStatus, userOverride = false } = {}) => {
  const fields = {};
  for (const key of FIELD_KEYS) {
    const raw = values ? values[key] : undefined;
    const hasValue = raw !== undefined && raw !== null && raw !== '';
    fields[key] = hasValue
      ? makeField(raw, source, verificationStatus, userOverride)
      : emptyField();
  }
  return fields;
};

const isValidLatitude = (lat) => isFiniteNumber(lat) && lat >= -90 && lat <= 90;
const isValidLongitude = (lng) => isFiniteNumber(lng) && lng >= -180 && lng <= 180;

// Strips an untrusted lat/lng pair down to null when out of range/non-finite
// rather than throwing -- an invalid coordinate is treated the same as a
// missing one (editable blank), never silently clamped/guessed.
const sanitizeCoordinates = (latitude, longitude) => ({
  latitude: isValidLatitude(latitude) ? Number(latitude) : null,
  longitude: isValidLongitude(longitude) ? Number(longitude) : null,
});

// Phase 47 handoff (out of scope for Phase 46 itself, which never calls
// RealtyAPI): a normalized ISO-3166-1 alpha-2 country code of "US" is the
// only thing that makes a report property-lookup-eligible. Anything else --
// including a blank/unresolved country -- is simply ineligible, never
// invalid; a non-US report is a perfectly valid report.
const computePropertyLookupEligibility = (countryCode) =>
  String(countryCode || '').trim().toUpperCase() === 'US';

// Builds a fresh, all-manual PropertyProfile from the wizard's existing
// plain-string fields (propertyStreet/City/State/Zip/propertyAddress) --
// the always-available fallback path, independent of Google.
const buildManualPropertyProfile = ({
  original,
  addressLine1,
  city,
  state,
  postalCode,
  country,
  countryCode,
} = {}) => {
  const fields = wrapValuesAsFields(
    { addressLine1, city, state, postalCode, country, countryCode, formattedAddress: original },
    { source: SOURCE.MANUAL_ENTRY, verificationStatus: VERIFICATION_STATUS.UNVERIFIED, userOverride: true }
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    original: original || '',
    fields,
    status: PROFILE_STATUS.UNCONFIRMED,
    propertyLookupEligible: computePropertyLookupEligibility(countryCode),
    normalizedAt: null,
    confirmedAt: null,
    confirmedBy: null,
  };
};

// Non-destructive, read-only synthesis for a pre-Phase-46 report that has
// none of this schema -- never written back to Firestore by this function;
// the caller decides whether/when to persist (only on explicit user save).
// Never claims Google verification for data that was always plain text.
const buildLegacyPropertyProfileView = (report = {}) => {
  const original = report.propertyAddress || '';
  const fields = wrapValuesAsFields(
    {
      formattedAddress: original,
      addressLine1: report.propertyStreet || '',
      city: report.propertyCity || '',
      state: report.propertyState || '',
      postalCode: report.propertyZip || '',
    },
    { source: SOURCE.LEGACY, verificationStatus: VERIFICATION_STATUS.UNAVAILABLE, userOverride: false }
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    original,
    fields,
    status: PROFILE_STATUS.UNCONFIRMED,
    propertyLookupEligible: false,
    normalizedAt: null,
    confirmedAt: null,
    confirmedBy: null,
    legacy: true,
  };
};

// Marks every PROVIDER_-sourced field stale (recheck-required) after the
// user edits the address again post-confirmation -- user-entered/overridden
// fields are left untouched, matching "never silently overwrite a
// user-confirmed value" and "changing an address marks provider-derived
// fields stale, not the whole record invalid".
const markProviderFieldsStale = (profile) => {
  if (!profile || !profile.fields) return profile;
  const fields = {};
  for (const key of FIELD_KEYS) {
    const f = profile.fields[key] || emptyField();
    fields[key] =
      f.source === SOURCE.PROVIDER_NORMALIZED || f.source === SOURCE.PROVIDER_SELECTED
        ? { ...f, verificationStatus: VERIFICATION_STATUS.STALE }
        : f;
  }
  return { ...profile, fields, status: PROFILE_STATUS.STALE };
};

module.exports = {
  SCHEMA_VERSION,
  SOURCE,
  VERIFICATION_STATUS,
  PROFILE_STATUS,
  FIELD_KEYS,
  makeField,
  emptyField,
  wrapValuesAsFields,
  isValidLatitude,
  isValidLongitude,
  sanitizeCoordinates,
  computePropertyLookupEligibility,
  buildManualPropertyProfile,
  buildLegacyPropertyProfileView,
  markProviderFieldsStale,
};
