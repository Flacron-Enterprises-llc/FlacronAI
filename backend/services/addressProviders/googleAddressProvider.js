// Phase 46 (Property Intelligence: Address Normalization & Google Integration).
// Google adapter implementing the AddressProvider contract (documented here,
// same convention as pricingProviders/registry.js's own contract comment):
//
//   PROVIDER_NAME: string
//   async getPlaceDetails(placeId, { signal }) -> raw Google Geocoding
//     "place_id lookup" result (server-restricted key; confirms/standardizes
//     whatever the browser-key autocomplete widget returned, before it is
//     ever trusted -- see PHASES.md Phase 46 task 2). Throws a categorized
//     Error (`.code` one of the ADDRESS_* codes below) on failure.
//   normalizeAddress(rawGoogleResult) -> plain, provider-shape-free values
//     object matching addressNormalization.js's FIELD_KEYS -- the ONLY
//     place Google's `address_components` array shape is read. Callers
//     (propertyService.js) wrap this into {value, source, verificationStatus,
//     userOverride} Fields themselves; this module never does that wrapping,
//     keeping "provider-specific response shapes stop at the adapter
//     boundary" a structural property, not just a convention.
//
// Autocomplete suggestions are fetched directly by the BROWSER using the
// browser-restricted key (frontend/src/config/googleMaps.js) -- this
// backend adapter deliberately has no getAutocompleteSuggestions bound to a
// live network call; it exists only as a documented contract shape for a
// future backend-proxied provider (see registry.js), keeping the interface
// name the wider spec asks for without adding a redundant, extra-billed
// server round trip for the (already client-side) suggestion list.
const googlePlaces = require('../../config/googlePlaces');

const PROVIDER_NAME = 'google';

const makeError = (message, code, extra) => Object.assign(new Error(message), { code }, extra || {});

// Field masking (data minimization): only request what normalizeAddress
// actually reads below -- never the full Geocoding payload.
const GEOCODE_FIELDS = ['address_components', 'formatted_address', 'geometry', 'place_id'];

const categorizeGeocodeStatus = (status, errorMessage) => {
  switch (status) {
    case 'ZERO_RESULTS':
      return makeError('No matching place found for this selection.', 'ADDRESS_NO_MATCH');
    case 'OVER_QUERY_LIMIT':
      return makeError('Address lookup quota exceeded.', 'ADDRESS_QUOTA_EXCEEDED');
    case 'REQUEST_DENIED':
      return /billing/i.test(errorMessage || '')
        ? makeError('Address lookup billing is disabled.', 'ADDRESS_BILLING_DISABLED')
        : makeError('Address lookup permission denied.', 'ADDRESS_PERMISSION_DENIED');
    case 'INVALID_REQUEST':
      return makeError('Invalid address lookup request.', 'ADDRESS_INVALID_INPUT');
    default:
      return makeError('The address provider returned an unusable response.', 'ADDRESS_MALFORMED_RESPONSE');
  }
};

// Calls the Geocoding API's place_id-lookup mode with the SERVER key --
// this is the "resolve/validate through the trusted server boundary" step;
// a client-supplied placeId is never itself treated as verified. `fetchImpl`
// is an injected seam (tests always inject a stub; production never passes
// it, so the real global `fetch` -- Node 18+ -- is used), same DI pattern as
// config/openai.js's `client` param.
const getPlaceDetails = async (placeId, { signal, fetchImpl = fetch, timeoutMs } = {}) => {
  const key = googlePlaces.getServerKey();
  if (!key) {
    throw makeError('Google address lookup is not configured.', 'ADDRESS_PROVIDER_UNAVAILABLE');
  }
  const cleanPlaceId = String(placeId || '').trim();
  if (!cleanPlaceId) {
    throw makeError('placeId is required.', 'ADDRESS_INVALID_INPUT', { field: 'placeId' });
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('place_id', cleanPlaceId);
  url.searchParams.set('fields', GEOCODE_FIELDS.join(','));
  url.searchParams.set('key', key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || googlePlaces.SERVER_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onExternalAbort);

  let resp;
  try {
    resp = await fetchImpl(url.toString(), { signal: controller.signal });
  } catch (err) {
    if (signal?.aborted) {
      throw makeError('Address lookup cancelled.', 'ADDRESS_CANCELLED');
    }
    if (err?.name === 'AbortError') {
      throw makeError('The address provider timed out.', 'ADDRESS_TIMEOUT');
    }
    // Never let the raw network error (which could embed the URL, and
    // therefore the key, in some environments' stack traces) escape --
    // log server-side only, without the URL/key.
    console.error('Google Geocoding request failed (server-side only):', err?.message || err);
    throw makeError('The address provider is temporarily unavailable.', 'ADDRESS_NETWORK_ERROR', { transient: true });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }

  if (!resp.ok && resp.status >= 500) {
    throw makeError('The address provider is temporarily unavailable.', 'ADDRESS_PROVIDER_ERROR', { transient: true });
  }

  let body;
  try {
    body = await resp.json();
  } catch {
    throw makeError('The address provider returned an unusable response.', 'ADDRESS_MALFORMED_RESPONSE');
  }

  if (body?.status !== 'OK') {
    throw categorizeGeocodeStatus(body?.status, body?.error_message);
  }
  const results = Array.isArray(body.results) ? body.results : [];
  if (results.length === 0) {
    throw makeError('No matching place found for this selection.', 'ADDRESS_NO_MATCH');
  }
  if (results.length > 1) {
    // Ambiguous is surfaced as data (caller decides), not thrown -- a
    // place_id lookup returning >1 result is rare but must require explicit
    // user review rather than an auto-best-guess.
    return { raw: results[0], ambiguous: true, candidateCount: results.length };
  }
  return { raw: results[0], ambiguous: false, candidateCount: 1 };
};

// Pulls one address_components entry's long_name for the first matching
// type, or '' if absent -- missing values stay editable blanks, never
// invented. `types` may list multiple Google types in priority order (e.g.
// sublocality variants, or postal_town as a locality fallback for UK/IE).
const componentValue = (components, types, { short = false } = {}) => {
  for (const type of types) {
    const match = (components || []).find((c) => Array.isArray(c.types) && c.types.includes(type));
    if (match) return (short ? match.short_name : match.long_name) || '';
  }
  return '';
};

// The single place Google's address_components shape is interpreted.
// Deliberately does NOT assume a US city/state/ZIP structure: `city` falls
// back through locality -> postal_town (UK) -> sublocality variants, `state`
// is administrative_area_level_1 (works for provinces too), `county` is
// administrative_area_level_2 where the country has one.
const normalizeAddress = (rawGoogleResult) => {
  if (!rawGoogleResult || !rawGoogleResult.raw) {
    throw makeError('Malformed provider response.', 'ADDRESS_MALFORMED_RESPONSE');
  }
  const r = rawGoogleResult.raw;
  const components = r.address_components || [];

  const streetNumber = componentValue(components, ['street_number']);
  const route = componentValue(components, ['route']);
  const addressLine1 = [streetNumber, route].filter(Boolean).join(' ').trim();

  const lat = r.geometry?.location?.lat;
  const lng = r.geometry?.location?.lng;

  return {
    formattedAddress: r.formatted_address || '',
    addressLine1,
    addressLine2: componentValue(components, ['subpremise']),
    streetNumber,
    route,
    neighborhood: componentValue(components, ['neighborhood', 'sublocality', 'sublocality_level_1']),
    city: componentValue(components, ['locality', 'postal_town', 'sublocality']),
    county: componentValue(components, ['administrative_area_level_2']),
    state: componentValue(components, ['administrative_area_level_1']),
    stateCode: componentValue(components, ['administrative_area_level_1'], { short: true }),
    postalCode: componentValue(components, ['postal_code']),
    postalCodeSuffix: componentValue(components, ['postal_code_suffix']),
    country: componentValue(components, ['country']),
    countryCode: componentValue(components, ['country'], { short: true }),
    latitude: typeof lat === 'number' ? lat : null,
    longitude: typeof lng === 'number' ? lng : null,
    placeId: r.place_id || '',
  };
};

module.exports = {
  PROVIDER_NAME,
  getPlaceDetails,
  normalizeAddress,
};
