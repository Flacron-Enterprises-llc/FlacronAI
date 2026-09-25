// Phase 47 (Property Intelligence: RealtyAPI U.S. Adapter & Report
// Integration). The RealtyAPI adapter boundary.
//
// `PropertyDataProvider` contract (documented here, same convention as
// backend/services/pricingProviders/registry.js's own contract comment):
//   PROVIDER_NAME: string
//   async lookupProperty(normalizedAddress, options) -> raw provider result
//     normalizedAddress: { addressLine1, city, state, postalCode,
//       countryCode, latitude, longitude } -- ONLY these minimal fields,
//       never claimant/policy/claim-narrative/photo/payment/auth data (see
//       propertyIntelligenceService.js's buildProviderRequestInput, the one
//       place this object is assembled).
//     options: { timeoutMs, signal }
//   normalizePropertyResult(rawProviderResult) -> a flat `{ key: rawValue }`
//     map matching backend/utils/propertyIntelligence.js's FIELD_KEYS --
//     the ONLY place a raw RealtyAPI response shape would ever be read.
//
// CONTRACT STATUS (2026-09-22 live-validation session): the REQUEST side is
// confirmed directly from RealtyAPI's own OpenAPI spec
// (`realtor.realtyapi.io/openapi.json`) and docs -- product "Realtor", base
// URL `https://realtor.realtyapi.io`, endpoint `GET /details/byaddress`
// (query param `address`, header `x-realtyapi-key`; the docs advertise 2
// credits/call, but 3 real calls this session each cost 1 -- see PHASES.md)
// -- and `lookupProperty` below is built directly from that confirmed
// contract, never guessed. The 200 response BODY schema was genuinely
// undocumented by RealtyAPI (their own OpenAPI spec leaves it as `{}`); a
// later same-day session resolved it with 3 further real, controlled calls
// and `normalizePropertyResult` below IS NOW IMPLEMENTED against that
// evidence (see that function's own comment for the exact field-by-field
// mapping and what remains permanently unmappable) -- it never maps a
// guessed key name.
const realtyApiConfig = require('../../config/realtyApi');

const PROVIDER_NAME = 'realty_api';
const DETAILS_BY_ADDRESS_PATH = '/details/byaddress';

const makeError = (message, code, extra) =>
  Object.assign(new Error(message), { code }, extra || {});

// Same "only send what's needed" shape as googleAddressProvider.js's
// GEOCODE_FIELDS comment -- RealtyAPI's one query param wants a single
// "street, city, state zip" string, not the individual components.
const buildAddressQuery = (normalizedAddress) => {
  const a = normalizedAddress || {};
  const street = String(a.addressLine1 || '').trim();
  const city = String(a.city || '').trim();
  const state = String(a.state || '').trim();
  const postalCode = String(a.postalCode || '').trim();
  const cityStateZip = [city, [state, postalCode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return [street, cityStateZip].filter(Boolean).join(', ');
};

// Maps RealtyAPI's confirmed status-code/error taxonomy (docs/status-codes,
// OpenAPI components/responses) onto this codebase's PROPERTY_* code
// convention -- same pattern as addressProviders/googleAddressProvider.js's
// categorizeGeocodeStatus. 401/403 are configuration/account problems (key
// invalid or lacks permission) and are deliberately NOT surfaced as
// "no match"/"bad input" to the client -- they map to a generic
// unavailable/permission-denied status, same as ADDRESS_PERMISSION_DENIED's
// precedent, so a misconfigured key never gets mistaken for "this address
// has no data."
const categorizeStatus = (status, body) => {
  const retryAfter = Number.isFinite(body?.retryAfter) ? body.retryAfter : undefined;
  switch (status) {
    case 400:
      return makeError('Invalid property lookup request.', 'PROPERTY_INVALID_INPUT');
    case 401:
      return makeError(
        'Property data lookup is not currently configured.',
        'PROPERTY_PROVIDER_UNAVAILABLE'
      );
    case 402:
      return makeError('Property data lookup quota exceeded.', 'PROPERTY_QUOTA_EXCEEDED', {
        transient: true,
      });
    case 403:
      return makeError('Property data lookup permission denied.', 'PROPERTY_PERMISSION_DENIED');
    case 404:
      return makeError('No property record found for this address.', 'PROPERTY_NO_MATCH');
    case 429:
      return makeError('Property data lookup rate limit exceeded.', 'PROPERTY_RATE_LIMITED', {
        transient: true,
        retryAfter,
      });
    default:
      if (status >= 500) {
        return makeError(
          'The property data provider is temporarily unavailable.',
          'PROPERTY_PROVIDER_ERROR',
          { transient: true }
        );
      }
      return makeError(
        'The property data provider returned an unusable response.',
        'PROPERTY_MALFORMED_RESPONSE'
      );
  }
};

// Builds the authenticated GET /details/byaddress request (base URL +
// endpoint path + x-realtyapi-key header, all sourced from
// config/realtyApi.js -- no hostname/path is hardcoded outside this one
// function), retries transient failures up to REALTY_API_MAX_RETRIES times
// (timeouts, network errors, 5xx -- never 4xx, which are never retryable),
// and categorizes any non-2xx status via `categorizeStatus`. `fetchImpl` is
// an injected seam (tests always inject a stub; production never passes it,
// so the real global `fetch` -- Node 18+ -- is used), same DI pattern as
// addressProviders/googleAddressProvider.js's `getPlaceDetails`.
const lookupProperty = async (
  normalizedAddress,
  { timeoutMs, signal, fetchImpl = fetch, attempt = 0 } = {}
) => {
  if (!realtyApiConfig.isConfigured()) {
    throw makeError(
      'Property data lookup is not currently configured.',
      'PROPERTY_PROVIDER_NOT_CONFIGURED'
    );
  }

  const addressQuery = buildAddressQuery(normalizedAddress);
  if (!addressQuery) {
    throw makeError(
      'A complete address is required for a property lookup.',
      'PROPERTY_INVALID_INPUT'
    );
  }

  const url = new URL(DETAILS_BY_ADDRESS_PATH, realtyApiConfig.getBaseUrl());
  url.searchParams.set('address', addressQuery);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || realtyApiConfig.TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onExternalAbort);

  const retryIfAllowed = () =>
    attempt < realtyApiConfig.MAX_RETRIES
      ? lookupProperty(normalizedAddress, { timeoutMs, signal, fetchImpl, attempt: attempt + 1 })
      : null;

  let resp;
  try {
    resp = await fetchImpl(url.toString(), {
      headers: { 'x-realtyapi-key': realtyApiConfig.getApiKey() },
      signal: controller.signal,
    });
  } catch (err) {
    if (signal?.aborted) {
      throw makeError('Property lookup cancelled.', 'PROPERTY_CANCELLED');
    }
    if (err?.name === 'AbortError') {
      const retried = retryIfAllowed();
      if (retried) return retried;
      throw makeError('The property data provider timed out.', 'PROPERTY_TIMEOUT');
    }
    // Never let the raw network error (which could embed the URL, and
    // therefore the key, in some environments' stack traces) escape --
    // log server-side only, without the URL/key.
    console.error('RealtyAPI request failed (server-side only):', err?.message || err);
    const retried = retryIfAllowed();
    if (retried) return retried;
    throw makeError(
      'The property data provider is temporarily unavailable.',
      'PROPERTY_PROVIDER_ERROR',
      { transient: true }
    );
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }

  let body = null;
  try {
    body = await resp.json();
  } catch {
    // leave body as null -- handled by the malformed-response check below
  }

  if (!resp.ok) {
    if (resp.status >= 500) {
      const retried = retryIfAllowed();
      if (retried) return retried;
    }
    // `providerStatus` is for server-side diagnostics only (the route logs
    // it, never returns it) -- the response body is not attached.
    throw Object.assign(categorizeStatus(resp.status, body), { providerStatus: resp.status });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw makeError(
      'The property data provider returned an unusable response.',
      'PROPERTY_MALFORMED_RESPONSE'
    );
  }
  // CONFIRMED BY LIVE EVIDENCE (2026-09-22 controlled validation, 3 real
  // calls): a no-match is NOT a non-2xx status -- RealtyAPI returns HTTP 200
  // with `{message, source, detail: {}}` (an empty `detail`) even though
  // `message` happens to embed the literal text "404: address not found" as
  // a human-readable string, not a real status code. Checking for an empty
  // `detail` is the reliable, structural signal (never string-matching
  // `message`, which is documented nowhere and could change wording).
  if (!body.detail || typeof body.detail !== 'object' || Object.keys(body.detail).length === 0) {
    throw makeError('No property record found for this address.', 'PROPERTY_NO_MATCH');
  }

  // True multi-candidate ambiguity was never observed in this session's live
  // calls -- RealtyAPI's own docs say the street line is disambiguated by
  // city/state/zip INTERNALLY (server-side), never returned to the caller as
  // a candidate list. `ambiguous` is kept in the returned shape only to
  // satisfy the documented PropertyDataProvider contract (registry.js) and
  // stays permanently false for this provider based on real evidence -- not
  // a guessed "future-proofing" branch.
  return { raw: body, ambiguous: false };
};

// The single place RealtyAPI's raw /details/byaddress JSON body shape is
// read (mirrors googleAddressProvider.js's normalizeAddress -- "provider-
// specific response shapes stop at the adapter boundary" is a structural
// property, not just a convention).
//
// FIELD MAPPING, EVIDENCE-BASED (2026-09-22 controlled live-validation
// session, 3 real calls against 2 different real US properties of different
// types/states -- see PHASES.md Phase 47's live-validation log): RealtyAPI's
// OpenAPI spec leaves the response body undocumented, so every key read
// below was directly observed, by name, in a real response body -- none is
// guessed. Two real, independent shapes fed this mapping, and the top-level
// schema + `details_sections` category/label naming were identical across
// both, giving reasonable confidence the shape is stable rather than
// per-property incidental.
//
// The real response is `{ message, source, detail: {...} }` -- structured
// building/lot/tax facts live directly on `detail`/`detail.details`/
// `detail.tax_history`, but several change-request fields (roof, exterior
// construction, foundation, garage type, parcel/APN) are NOT separate
// top-level keys -- Realtor.com only exposes them as free-text
// "Label: Value" bullet lines inside `detail.details_sections[].text`
// (grouped by `category`, e.g. "Building and Construction"), so those are
// parsed out of that text below. Fields with NO evidence anywhere in either
// real response are intentionally left unmapped (they fall through to
// propertyIntelligence.js's normal "editable blank," never a guess):
//   - ownerOnRecord: this product never returns an owner-of-record identity
//     field (consistent with Realtor.com's own public listing pages, which
//     show agent/broker contact only, never the owner's name).
//   - footprintAreaValue/footprintAreaUnit: no distinct building-footprint
//     geometry field exists -- "Total Area Sqft"/"Total Square Feet Living"
//     in the bullets equal `detail.details.sqft` (living area), not a
//     separate footprint.
const parseDetailsSections = (sections) => {
  const byCategory = {};
  for (const section of Array.isArray(sections) ? sections : []) {
    if (!section || typeof section.category !== 'string' || !Array.isArray(section.text)) continue;
    const bullets = {};
    for (const line of section.text) {
      if (typeof line !== 'string') continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const label = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (label && value && !(label in bullets)) bullets[label] = value; // first occurrence wins
    }
    byCategory[section.category] = bullets;
  }
  return byCategory;
};

const num = (v) => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
// `detail.details.baths` was observed as a STRING, sometimes with a
// trailing "+" (e.g. "7.5+") -- parseFloat (unlike Number()) stops at the
// first non-numeric character instead of returning NaN for the whole value.
const numLoose = (v) => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
};
const str = (v) => (v === null || v === undefined || v === '' ? undefined : String(v));

// Picks the tax_history entry for the highest `year` (observed as up to 19
// entries, not guaranteed sorted) -- the current/most-recent assessment and
// tax figure, not just array index 0.
const latestTaxHistoryEntry = (taxHistory) => {
  if (!Array.isArray(taxHistory) || taxHistory.length === 0) return null;
  return taxHistory.reduce((best, entry) => {
    const y = num(entry?.year) ?? -Infinity;
    const bestY = best ? (num(best.year) ?? -Infinity) : -Infinity;
    return y > bestY ? entry : best;
  }, null);
};

const normalizePropertyResult = (rawProviderResult) => {
  const raw = rawProviderResult?.raw;
  const d = raw?.detail;
  if (!d || typeof d !== 'object') {
    throw makeError('Malformed provider response.', 'PROPERTY_MALFORMED_RESPONSE');
  }
  const details = d.details && typeof d.details === 'object' ? d.details : {};
  const bullets = parseDetailsSections(d.details_sections);
  const construction = bullets['Building and Construction'] || {};
  const garageInfo = bullets['Garage and Parking'] || {};
  const hvac = bullets['Heating and Cooling'] || {};
  const otherInfo = bullets['Other Property Info'] || {};
  const latestTax = latestTaxHistoryEntry(d.tax_history);
  const flood = d.local?.flood && typeof d.local.flood === 'object' ? d.local.flood : {};

  const assessedValue = num(latestTax?.assessment?.total);
  const propertyTaxAnnual = num(latestTax?.tax);
  const lastSalePrice = num(d.last_sold_price);

  return {
    parcelNumber: str(otherInfo['Parcel Number']),
    propertyType: str(details.type),
    yearBuilt: num(details.year_built),
    livingAreaValue: num(details.sqft),
    livingAreaUnit: num(details.sqft) !== undefined ? 'sqft' : undefined,
    lotSizeValue: num(details.lot_sqft),
    lotSizeUnit: num(details.lot_sqft) !== undefined ? 'sqft' : undefined,
    bedrooms: num(details.beds),
    bathrooms: numLoose(details.baths),
    stories: num(details.stories),
    garageType: str(garageInfo['Parking Features']),
    garageSpaces: num(details.garage),
    roofType: str(construction['Roof']),
    exteriorConstruction: str(construction['Construction Materials']),
    foundationType: str(construction['Foundation Details']),
    // `detail.details.heating`/`cooling` were consistently null in every
    // real response observed -- the bullet text is the only source that
    // ever had a value, so it is used directly rather than as a fallback.
    heatingType: str(hvac['Heating Features']),
    coolingType: str(hvac['Cooling Features']),
    assessedValue,
    assessedValueCurrency: assessedValue !== undefined ? 'USD' : undefined,
    propertyTaxAnnual,
    propertyTaxCurrency: propertyTaxAnnual !== undefined ? 'USD' : undefined,
    lastSaleDate: str(d.last_sold_date),
    lastSalePrice,
    lastSalePriceCurrency: lastSalePrice !== undefined ? 'USD' : undefined,
    floodZone: str(Array.isArray(flood.fema_zone) ? flood.fema_zone[0] : undefined),
    hazardSummary: str(flood.flood_trend_paragraph),
    providerRecordId: str(d.property_id),
    providerEffectiveDate: str(d.last_update_date),
  };
};

module.exports = {
  PROVIDER_NAME,
  buildAddressQuery,
  categorizeStatus,
  lookupProperty,
  normalizePropertyResult,
};
