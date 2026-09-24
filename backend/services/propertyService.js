// Phase 46 (Property Intelligence: Address Normalization & Google Integration).
// Orchestration layer between the routes (backend/routes/reports.js) and the
// provider registry/normalization store. Nothing here is Google-specific --
// swapping the configured provider (backend/services/addressProviders/
// registry.js) changes nothing on this module's public surface.
const { getAddressProvider } = require('./addressProviders/registry');
const {
  FIELD_KEYS,
  makeField,
  emptyField,
  wrapValuesAsFields,
  sanitizeCoordinates,
  computePropertyLookupEligibility,
  SOURCE,
  VERIFICATION_STATUS,
  PROFILE_STATUS,
  SCHEMA_VERSION,
} = require('../utils/addressNormalization');
const { createAddressNormalization, resolveAddressNormalization } = require('../utils/addressNormalizationStore');
const googlePlaces = require('../config/googlePlaces');

const makeError = (message, code, extra) => Object.assign(new Error(message), { code }, extra || {});

// Sanitized, frontend-facing status -- never the server key, never raw
// provider/project identifiers, never billing data.
const getPublicConfig = () => ({
  enabled: googlePlaces.isFeatureEnabled(),
  browserAutocompleteConfigured: googlePlaces.isBrowserAutocompleteConfigured(),
  serverNormalizationConfigured: googlePlaces.isServerGeocodingConfigured(),
  schemaVersion: SCHEMA_VERSION,
  capabilities: ['autocomplete', 'normalize', 'country_detection', 'geocode'],
});

// Resolves a browser-selected placeId into a trusted, normalized address
// via the server-restricted key, and persists a short-lived normalization
// record so PUT /:id/property-profile can later prove the fields it's
// asked to trust actually came from this server call (see
// addressNormalizationStore.js's header comment).
const normalizePlace = async (db, { placeId, original, requestedByUid, signal }) => {
  if (!googlePlaces.isServerGeocodingConfigured()) {
    throw makeError('Address lookup is not currently available.', 'ADDRESS_PROVIDER_UNAVAILABLE');
  }
  const cleanPlaceId = String(placeId || '').trim();
  if (!cleanPlaceId) {
    throw makeError('placeId is required.', 'ADDRESS_INVALID_INPUT', { field: 'placeId' });
  }

  const provider = getAddressProvider();
  if (!provider) {
    throw makeError('Address lookup is not currently available.', 'ADDRESS_PROVIDER_UNAVAILABLE');
  }

  const raw = await provider.getPlaceDetails(cleanPlaceId, { signal });
  const values = provider.normalizeAddress(raw);
  const coords = sanitizeCoordinates(values.latitude, values.longitude);
  const normalizedValues = { ...values, ...coords };

  const { token, expiresAt } = await createAddressNormalization(db, {
    requestedByUid,
    original: original || '',
    normalizedValues,
    ambiguous: !!raw.ambiguous,
  });

  const verificationStatus = raw.ambiguous ? VERIFICATION_STATUS.AMBIGUOUS : VERIFICATION_STATUS.PROVIDER_NORMALIZED;
  const fields = wrapValuesAsFields(normalizedValues, {
    source: SOURCE.PROVIDER_NORMALIZED,
    verificationStatus,
    userOverride: false,
  });

  return {
    normalizationToken: token,
    expiresAt,
    ambiguous: !!raw.ambiguous,
    profile: {
      schemaVersion: SCHEMA_VERSION,
      original: original || '',
      fields,
      status: PROFILE_STATUS.UNCONFIRMED,
      propertyLookupEligible: computePropertyLookupEligibility(normalizedValues.countryCode),
      normalizedAt: new Date().toISOString(),
      confirmedAt: null,
      confirmedBy: null,
    },
  };
};

// Builds the PropertyProfile to persist for PUT /:id/property-profile.
// `mode: 'manual'` trusts nothing but the caller's own overrides (never a
// provider token). `mode: 'provider_confirmed'` requires a valid, owned,
// unexpired normalizationToken -- the trusted values come from the SERVER-
// STORED normalization record (addressNormalizationStore), never from
// anything the client claims those values to be; `overrides` on top of that
// are the only way a field's value differs from what the server originally
// normalized, and each such field is explicitly marked USER_OVERRIDDEN.
//
// Golden rule enforced here: an existing field the user already owns
// (`userOverride: true`) is carried forward untouched unless THIS SAME call
// explicitly re-overrides that exact key -- a fresh provider lookup can
// never silently clobber it.
const buildConfirmedPropertyProfile = async (
  db,
  { existingProfile, mode, normalizationToken, original, overrides, requestedByUid }
) => {
  const cleanMode = mode === 'manual' ? 'manual' : 'provider_confirmed';
  const overrideEntries = overrides && typeof overrides === 'object' ? overrides : {};
  const overrideKeys = new Set(Object.keys(overrideEntries).filter((k) => FIELD_KEYS.includes(k)));

  let baseValues = {};
  if (cleanMode === 'provider_confirmed') {
    const record = await resolveAddressNormalization(db, { token: normalizationToken, requestedByUid });
    baseValues = { ...record.normalizedValues };
  }

  const fields = {};
  for (const key of FIELD_KEYS) {
    const existing = existingProfile?.fields?.[key];
    const userOwnsUntouched = existing?.userOverride && !overrideKeys.has(key);
    if (userOwnsUntouched) {
      fields[key] = existing;
      continue;
    }

    const overridden = overrideKeys.has(key);
    const raw = overridden ? overrideEntries[key] : baseValues[key];
    const hasValue = raw !== undefined && raw !== null && String(raw).trim() !== '';
    if (!hasValue) {
      fields[key] = emptyField();
      continue;
    }

    if (cleanMode === 'manual') {
      fields[key] = makeField(raw, SOURCE.MANUAL_ENTRY, VERIFICATION_STATUS.USER_CONFIRMED, true);
    } else if (overridden) {
      fields[key] = makeField(raw, SOURCE.USER_OVERRIDDEN, VERIFICATION_STATUS.USER_CONFIRMED, true);
    } else {
      fields[key] = makeField(raw, SOURCE.PROVIDER_NORMALIZED, VERIFICATION_STATUS.USER_CONFIRMED, false);
    }
  }

  const coords = sanitizeCoordinates(fields.latitude?.value, fields.longitude?.value);
  fields.latitude = fields.latitude?.value != null && coords.latitude === null ? emptyField() : fields.latitude;
  fields.longitude = fields.longitude?.value != null && coords.longitude === null ? emptyField() : fields.longitude;

  return {
    schemaVersion: SCHEMA_VERSION,
    original: original !== undefined ? String(original || '') : existingProfile?.original || '',
    fields,
    status: PROFILE_STATUS.CONFIRMED,
    propertyLookupEligible: computePropertyLookupEligibility(fields.countryCode?.value),
    normalizedAt: cleanMode === 'provider_confirmed' ? new Date().toISOString() : existingProfile?.normalizedAt || null,
    confirmedAt: new Date().toISOString(),
    confirmedBy: requestedByUid,
  };
};

module.exports = { getPublicConfig, normalizePlace, buildConfirmedPropertyProfile };
