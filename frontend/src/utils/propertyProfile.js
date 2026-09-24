// Phase 46 (Property Intelligence: Address Normalization & Google Integration).
// Frontend-side mirror of backend/utils/addressNormalization.js's schema
// constants (kept in sync by convention, same as this repo's existing
// backend/frontend constant-duplication precedent -- e.g.
// canonicalEstimate.js's UNIT_VOCABULARY vs. its frontend counterpart) plus
// pure, network-free helpers: Phase 43 regional-input mapping, Phase 47
// eligibility, legacy-report fallback, and a stale-field checker. No
// component in this file talks to an API.

export const SCHEMA_VERSION = 1;

export const SOURCE = {
  MANUAL_ENTRY: 'manual_entry',
  SUGGESTED: 'suggested',
  PROVIDER_SELECTED: 'provider_selected',
  PROVIDER_NORMALIZED: 'provider_normalized',
  USER_OVERRIDDEN: 'user_overridden',
  LEGACY: 'legacy_manual',
  UNAVAILABLE: 'unavailable',
};

export const VERIFICATION_STATUS = {
  UNVERIFIED: 'unverified',
  PROVIDER_NORMALIZED: 'provider_normalized',
  USER_CONFIRMED: 'user_confirmed',
  UNAVAILABLE: 'unavailable',
  AMBIGUOUS: 'ambiguous',
  STALE: 'stale_recheck_required',
};

export const PROFILE_STATUS = {
  UNCONFIRMED: 'unconfirmed',
  CONFIRMED: 'confirmed',
  STALE: 'stale',
};

export const FIELD_KEYS = [
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

const emptyField = () => ({ value: null, source: SOURCE.UNAVAILABLE, verificationStatus: VERIFICATION_STATUS.UNAVAILABLE, userOverride: false });

// Same non-destructive, read-only synthesis as the backend's
// buildLegacyPropertyProfileView -- used as a client-side fallback for a
// report fetched before this schema existed if, for any reason, the server
// response didn't already include one (the backend always attaches one now,
// see GET /:id, but this keeps the frontend independently correct).
export const buildLegacyPropertyProfileView = (report = {}) => {
  const original = report.propertyAddress || '';
  const values = {
    formattedAddress: original,
    addressLine1: report.propertyStreet || '',
    city: report.propertyCity || '',
    state: report.propertyState || '',
    postalCode: report.propertyZip || '',
  };
  const fields = {};
  FIELD_KEYS.forEach((key) => {
    const raw = values[key];
    fields[key] = raw
      ? { value: raw, source: SOURCE.LEGACY, verificationStatus: VERIFICATION_STATUS.UNAVAILABLE, userOverride: false }
      : emptyField();
  });
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

export const isPropertyLookupEligible = (countryCode) =>
  String(countryCode || '').trim().toUpperCase() === 'US';

// Phase 43 regional-input handoff: maps a confirmed/manual PropertyProfile
// into the exact { country, state, city, postalCode } shape
// pricingSuggestions.buildPriceSuggestionsRequestPayload already accepts
// (backend/services/pricingService.js's `locationContext`). Deliberately
// includes ONLY these four generic fields -- no PII, no claimant/report
// content, no lat/long, no provider raw payload. Returns null when the
// profile isn't confirmed, so callers fall back to the existing manual
// pricing-location inputs unchanged.
export const mapPropertyProfileToLocationContext = (profile) => {
  if (!profile || profile.status !== PROFILE_STATUS.CONFIRMED) return null;
  const f = profile.fields || {};
  const country = f.countryCode?.value || f.country?.value || '';
  if (!country) return null;
  return {
    country,
    state: f.stateCode?.value || f.state?.value || '',
    city: f.city?.value || '',
    postalCode: f.postalCode?.value || '',
    confirmed: true,
    locationFingerprint: computeLocationFingerprint(profile),
  };
};

// A short, stable fingerprint of the fields that actually feed pricing --
// changes only when country/state/city/postalCode change, so a caller can
// invalidate a pricing cache/fingerprint keyed off it WITHOUT treating an
// unrelated propertyProfile edit (e.g. correcting the unit number) as a
// pricing-relevant change.
export const computeLocationFingerprint = (profile) => {
  if (!profile) return '';
  const f = profile.fields || {};
  const parts = [
    (f.countryCode?.value || f.country?.value || '').toUpperCase(),
    (f.stateCode?.value || f.state?.value || '').toUpperCase(),
    (f.city?.value || '').toLowerCase(),
    (f.postalCode?.value || '').toUpperCase(),
  ];
  return parts.join('|');
};

// Phase 47 handoff: a clean, minimal contract the future RealtyAPI adapter
// consumes -- never calls it, never invents property data.
export const buildPropertyLookupHandoff = (profile) => {
  const eligible = isPropertyLookupEligible(profile?.fields?.countryCode?.value);
  return {
    propertyLookupEligible: eligible,
    countryCode: profile?.fields?.countryCode?.value || null,
    confirmed: profile?.status === PROFILE_STATUS.CONFIRMED,
  };
};

// True when any provider-derived field is flagged stale (a confirmed
// address was edited/re-looked-up and needs the user's attention again).
export const hasStaleFields = (profile) =>
  Object.values(profile?.fields || {}).some((f) => f?.verificationStatus === VERIFICATION_STATUS.STALE);
