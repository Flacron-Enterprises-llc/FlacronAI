// Phase 47 (Property Intelligence: RealtyAPI U.S. Adapter & Report
// Integration). Frontend-side mirror of
// backend/utils/propertyIntelligence.js's schema constants (same
// backend/frontend constant-duplication precedent as
// frontend/src/utils/propertyProfile.js vs. its own backend counterpart)
// plus pure, network-free helpers. No component in this file talks to an
// API -- persistence/lookup calls live in reportsAPI
// (frontend/src/services/api.js).

export const SCHEMA_VERSION = 1;

export const SOURCE = {
  THIRD_PARTY: 'Third-Party Property Data',
  MANUAL_ENTRY: 'manual_entry',
  USER_OVERRIDDEN: 'user_overridden',
  UNAVAILABLE: 'unavailable',
};

export const VERIFICATION_STATUS = {
  UNVERIFIED: 'unverified',
  PROVIDER_SUPPLIED: 'provider_supplied',
  USER_CONFIRMED: 'user_confirmed',
  UNAVAILABLE: 'unavailable',
  STALE: 'stale_recheck_required',
};

export const LOOKUP_STATUS = {
  NOT_ELIGIBLE: 'not_eligible',
  UNAVAILABLE: 'unavailable',
  PENDING: 'pending',
  FULL: 'full',
  PARTIAL: 'partial',
  NO_MATCH: 'no_match',
  AMBIGUOUS: 'ambiguous',
  ERROR: 'error',
  CONFIRMED: 'confirmed',
  STALE: 'stale',
};

// Display labels + optional unit/currency companion field, in display order.
// Mirrors backend/utils/propertyIntelligenceContent.js's LABELS exactly, so
// the desktop preview and the review UI show the same field set.
export const FIELD_GROUPS = [
  { key: 'parcelNumber', label: 'Parcel / APN' },
  { key: 'propertyType', label: 'Property Type' },
  { key: 'yearBuilt', label: 'Year Built' },
  { key: 'livingAreaValue', label: 'Living Area', unitKey: 'livingAreaUnit' },
  { key: 'lotSizeValue', label: 'Lot Size', unitKey: 'lotSizeUnit' },
  { key: 'bedrooms', label: 'Bedrooms' },
  { key: 'bathrooms', label: 'Bathrooms' },
  { key: 'stories', label: 'Stories' },
  { key: 'garageType', label: 'Garage Type' },
  { key: 'garageSpaces', label: 'Garage Spaces' },
  { key: 'roofType', label: 'Roof Type' },
  { key: 'exteriorConstruction', label: 'Exterior Construction' },
  { key: 'foundationType', label: 'Foundation' },
  { key: 'heatingType', label: 'Heating' },
  { key: 'coolingType', label: 'Cooling' },
  { key: 'assessedValue', label: 'Assessed Value', currencyKey: 'assessedValueCurrency' },
  { key: 'propertyTaxAnnual', label: 'Annual Property Tax', currencyKey: 'propertyTaxCurrency' },
  { key: 'lastSaleDate', label: 'Last Sale Date' },
  { key: 'lastSalePrice', label: 'Last Sale Price', currencyKey: 'lastSalePriceCurrency' },
  { key: 'ownerOnRecord', label: 'Owner on Record (Public Records)' },
  { key: 'floodZone', label: 'Flood Zone' },
  { key: 'hazardSummary', label: 'Hazard Summary' },
  { key: 'footprintAreaValue', label: 'Building Footprint', unitKey: 'footprintAreaUnit' },
];

export const FIELD_KEYS = FIELD_GROUPS.map((g) => g.key);

const emptyField = () => ({ value: null, source: SOURCE.UNAVAILABLE, verificationStatus: VERIFICATION_STATUS.UNAVAILABLE, userOverride: false });

export const buildEmptyPropertyIntelligence = () => {
  const fields = {};
  FIELD_KEYS.forEach((key) => { fields[key] = emptyField(); });
  return {
    schemaVersion: SCHEMA_VERSION,
    status: LOOKUP_STATUS.UNAVAILABLE,
    countryEligible: false,
    fields,
    providerRecordId: null,
    providerEffectiveDate: null,
    lookupTimestamp: null,
    addressFingerprint: null,
    confirmedAt: null,
    confirmedBy: null,
    disclaimers: [],
  };
};

// Mirrors backend/services/propertyIntelligenceService.js's own
// computeEligibility -- a confirmed US PropertyProfile (Phase 46) with the
// minimum address components present. Never throws; a non-eligible profile
// is a normal, expected state, not an error.
export const computePropertyIntelligenceEligibility = (propertyProfile) => {
  if (!propertyProfile || propertyProfile.status !== 'confirmed') {
    return { eligible: false, reason: 'address_not_confirmed' };
  }
  if (!propertyProfile.propertyLookupEligible) {
    return { eligible: false, reason: 'country_not_supported' };
  }
  const f = propertyProfile.fields || {};
  if (!f.addressLine1?.value || !f.city?.value || !f.postalCode?.value) {
    return { eligible: false, reason: 'incomplete_address' };
  }
  return { eligible: true, reason: null };
};

export const isFieldConfirmed = (field) => field?.verificationStatus === VERIFICATION_STATUS.USER_CONFIRMED;

// True when any THIRD_PARTY-sourced field is flagged stale (the linked
// address changed since this lookup was last confirmed).
export const hasStalePropertyIntelligence = (intel) =>
  Object.values(intel?.fields || {}).some((f) => f?.verificationStatus === VERIFICATION_STATUS.STALE);
