// Phase 47 (Property Intelligence: RealtyAPI U.S. Adapter & Report
// Integration). Provider-independent, additive schema for detailed U.S.
// property/parcel data -- lives at `report.propertyProfile.propertyIntelligence`,
// a SIBLING of Phase 46's `propertyProfile.fields` (address), not a
// replacement or a second PropertyProfile. Deliberately its own field-key
// list/namespace rather than appended to addressNormalization.js's
// FIELD_KEYS: those are address/geocoding components (Phase 46's concern),
// these are building/parcel/tax/hazard/ownership attributes (a conceptually
// distinct provider, RealtyAPI, feeding a conceptually distinct set of
// facts) -- keeping them separate means this phase never has to touch
// Phase 46's schema/validation at all (zero regression risk to a phase
// already marked Implementation Complete).
//
// Every field is wrapped the same {value, source, verificationStatus,
// userOverride} shape Phase 46 established. No field is ever fabricated:
// an unavailable/invalid optional value becomes an editable blank
// (UNAVAILABLE), never a guessed number/string.
const { isFiniteNumber, validateMoney, isValidCurrency } = require('./canonicalEstimate');

const SCHEMA_VERSION = 1;

const SOURCE = {
  THIRD_PARTY: 'Third-Party Property Data', // exact tag PHASES.md Phase 47 task 1 specifies
  MANUAL_ENTRY: 'manual_entry',
  USER_OVERRIDDEN: 'user_overridden',
  UNAVAILABLE: 'unavailable',
};

const VERIFICATION_STATUS = {
  UNVERIFIED: 'unverified',
  PROVIDER_SUPPLIED: 'provider_supplied',
  USER_CONFIRMED: 'user_confirmed',
  UNAVAILABLE: 'unavailable',
  STALE: 'stale_recheck_required',
};

// Overall per-report lookup status (distinct from PROFILE_STATUS in
// addressNormalization.js, which is about the ADDRESS, not the building data
// this module tracks).
const LOOKUP_STATUS = {
  NOT_ELIGIBLE: 'not_eligible', // non-US or address not yet confirmed -- never an error
  UNAVAILABLE: 'unavailable', // eligible but no lookup performed yet
  PENDING: 'pending',
  FULL: 'full',
  PARTIAL: 'partial',
  NO_MATCH: 'no_match',
  AMBIGUOUS: 'ambiguous',
  ERROR: 'error',
  CONFIRMED: 'confirmed',
  STALE: 'stale',
};

// The full RealtyAPI-sourced field set (PHASES.md Phase 47 field list).
// city/state/postalCode/county/latitude/longitude are intentionally NOT
// duplicated here -- those already live on Phase 46's address `fields`;
// this module only adds facts Phase 46 never had.
const FIELD_KEYS = [
  'parcelNumber',
  'propertyType',
  'yearBuilt',
  'livingAreaValue',
  'livingAreaUnit',
  'lotSizeValue',
  'lotSizeUnit',
  'bedrooms',
  'bathrooms',
  'stories',
  'garageType',
  'garageSpaces',
  'roofType',
  'exteriorConstruction',
  'foundationType',
  'heatingType',
  'coolingType',
  'assessedValue',
  'assessedValueCurrency',
  'propertyTaxAnnual',
  'propertyTaxCurrency',
  'lastSaleDate',
  'lastSalePrice',
  'lastSalePriceCurrency',
  'ownerOnRecord',
  'floodZone',
  'hazardSummary',
  'footprintAreaValue',
  'footprintAreaUnit',
];

// Fields that never belong in a cross-report/cross-user SHARED cache doc
// (ownership is the one field here with a real per-person privacy concern;
// everything else is generic parcel/structure data about a physical address,
// not a person). See propertyIntelligenceStore.js's cache functions.
const CACHE_EXCLUDED_FIELD_KEYS = new Set(['ownerOnRecord']);

const AREA_UNITS = new Set(['sqft', 'sqm']);
const LOT_UNITS = new Set(['sqft', 'sqm', 'acres']);

const makeField = (value, source, verificationStatus, userOverride = false) => ({
  value: value === undefined ? null : value,
  source: source || SOURCE.UNAVAILABLE,
  verificationStatus: verificationStatus || VERIFICATION_STATUS.UNAVAILABLE,
  userOverride: !!userOverride,
});

const emptyField = () => makeField(null, SOURCE.UNAVAILABLE, VERIFICATION_STATUS.UNAVAILABLE, false);

const cleanText = (v, maxLen) => String(v ?? '').trim().slice(0, maxLen);

// --- per-field validators ---------------------------------------------
// Each returns the sanitized value, or `null` (never throws) -- an invalid
// OPTIONAL field is simply dropped to an editable blank, never coerced into
// an apparently-verified value and never discarding the rest of the result.

const validateParcelNumber = (v) => {
  const s = cleanText(v, 60);
  return s && /^[A-Za-z0-9\-./# ]+$/.test(s) ? s : null;
};

const validateEnumText = (v, maxLen = 60) => {
  const s = cleanText(v, maxLen);
  return s || null;
};

const CURRENT_YEAR = () => new Date().getFullYear();
const validateYearBuilt = (v) => {
  const n = Number(v);
  return isFiniteNumber(n) && Number.isInteger(n) && n >= 1600 && n <= CURRENT_YEAR() + 1 ? n : null;
};

const validateAreaValue = (v) => {
  const n = Number(v);
  return isFiniteNumber(n) && n >= 0 && n <= 10_000_000 ? n : null;
};

const validateUnit = (v, allowed) => {
  const s = cleanText(v, 10).toLowerCase();
  return allowed.has(s) ? s : null;
};

// bedrooms/bathrooms/stories/garageSpaces -- bathrooms may be fractional
// (2.5 baths), everything else must be a non-negative integer.
const validateCount = (v, { allowFraction = false, max = 100 } = {}) => {
  const n = Number(v);
  if (!isFiniteNumber(n) || n < 0 || n > max) return null;
  if (!allowFraction && !Number.isInteger(n)) return null;
  if (allowFraction && Math.round(n * 2) !== n * 2) return null; // only .0/.5 steps
  return n;
};

const validateMoneyField = (v) => {
  const { value, error } = validateMoney(v, 'amount', { allowNegative: false });
  return error ? null : value;
};

const validateCurrencyField = (v) => {
  const s = cleanText(v, 3).toUpperCase();
  return isValidCurrency(s) ? s : null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validateDateField = (v) => {
  const s = String(v || '');
  if (!DATE_RE.test(s)) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) && t <= Date.now() ? s : null;
};

// Sanitized, length-capped, single-line -- ownership/public-record text is
// never rendered as-is without this pass (strips newlines that could be
// mistaken for markdown structure downstream, same concern
// canonicalEstimateContent.js's sanitizeForMarkdown documents).
const sanitizeOwnershipText = (v) => {
  const s = String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/\|/g, '/').trim().slice(0, 200);
  return s || null;
};

const sanitizeSummaryText = (v, maxLen = 300) => {
  const s = String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/\|/g, '/').trim().slice(0, maxLen);
  return s || null;
};

// Footprint/map geometry guard (task: "collection/object depth and payload
// limits" + "footprint/map geometry size and shape validation"). This phase
// never receives real geometry (no live provider call exists), but the
// guard is real and unit-tested so a future adapter can reuse it unchanged.
const MAX_FOOTPRINT_JSON_LENGTH = 20_000;
const MAX_FOOTPRINT_DEPTH = 6;
const jsonDepth = (value, depth = 0) => {
  if (depth > MAX_FOOTPRINT_DEPTH) return depth;
  if (!value || typeof value !== 'object') return depth;
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.reduce((max, child) => Math.max(max, jsonDepth(child, depth + 1)), depth);
};
const isValidFootprintGeometry = (geometry) => {
  if (geometry === null || geometry === undefined) return true; // absent is fine
  let json;
  try {
    json = JSON.stringify(geometry);
  } catch {
    return false;
  }
  if (json.length > MAX_FOOTPRINT_JSON_LENGTH) return false;
  if (jsonDepth(geometry) > MAX_FOOTPRINT_DEPTH) return false;
  return true;
};

// --- field-key -> validator dispatch table -----------------------------
// Each validator takes the RAW value for that key from an already-flat
// provider/manual values object and returns a sanitized value or null.
const FIELD_VALIDATORS = {
  parcelNumber: validateParcelNumber,
  propertyType: (v) => validateEnumText(v, 60),
  yearBuilt: validateYearBuilt,
  livingAreaValue: validateAreaValue,
  livingAreaUnit: (v) => validateUnit(v, AREA_UNITS),
  lotSizeValue: validateAreaValue,
  lotSizeUnit: (v) => validateUnit(v, LOT_UNITS),
  bedrooms: (v) => validateCount(v, { max: 50 }),
  bathrooms: (v) => validateCount(v, { allowFraction: true, max: 50 }),
  stories: (v) => validateCount(v, { max: 20 }),
  garageType: (v) => validateEnumText(v, 60),
  garageSpaces: (v) => validateCount(v, { max: 20 }),
  roofType: (v) => validateEnumText(v, 80),
  exteriorConstruction: (v) => validateEnumText(v, 80),
  foundationType: (v) => validateEnumText(v, 80),
  heatingType: (v) => validateEnumText(v, 80),
  coolingType: (v) => validateEnumText(v, 80),
  assessedValue: validateMoneyField,
  assessedValueCurrency: validateCurrencyField,
  propertyTaxAnnual: validateMoneyField,
  propertyTaxCurrency: validateCurrencyField,
  lastSaleDate: validateDateField,
  lastSalePrice: validateMoneyField,
  lastSalePriceCurrency: validateCurrencyField,
  ownerOnRecord: sanitizeOwnershipText,
  floodZone: (v) => validateEnumText(v, 40),
  hazardSummary: (v) => sanitizeSummaryText(v, 300),
  footprintAreaValue: validateAreaValue,
  footprintAreaUnit: (v) => validateUnit(v, AREA_UNITS),
};

// Wraps + validates a flat `{ key: rawValue }` map (as a provider adapter's
// normalizePropertyResult produces) into `{ key: Field }`. Never throws for
// a single bad/unexpected field -- an unrecognized key is silently ignored
// (not merged), an invalid value for a known key becomes an editable blank.
// This is the ONE place raw provider values are trusted enough to become
// `source: THIRD_PARTY` fields -- callers never call FIELD_VALIDATORS
// directly on unwrapped client input.
const normalizeProviderFields = (rawValues) => {
  const values = rawValues && typeof rawValues === 'object' ? rawValues : {};
  const fields = {};
  for (const key of FIELD_KEYS) {
    const validate = FIELD_VALIDATORS[key];
    const raw = values[key];
    const hasValue = raw !== undefined && raw !== null && raw !== '';
    const clean = hasValue ? validate(raw) : null;
    fields[key] = clean !== null
      ? makeField(clean, SOURCE.THIRD_PARTY, VERIFICATION_STATUS.PROVIDER_SUPPLIED, false)
      : emptyField();
  }
  return fields;
};

// Same wrapping, but for a manual/override values map (user-typed input) --
// still runs each value through the SAME validator (never a less-strict
// path for user input than provider input), tagged as manual/overridden by
// the caller (propertyIntelligenceService decides SOURCE.MANUAL_ENTRY vs
// SOURCE.USER_OVERRIDDEN based on whether a provider-supplied value existed).
const validateFieldValue = (key, raw) => {
  const validate = FIELD_VALIDATORS[key];
  if (!validate) return null;
  const hasValue = raw !== undefined && raw !== null && raw !== '';
  return hasValue ? validate(raw) : null;
};

const buildEmptyPropertyIntelligence = () => {
  const fields = {};
  for (const key of FIELD_KEYS) fields[key] = emptyField();
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

// Marks every THIRD_PARTY-sourced field stale after the linked address
// changes -- user-entered/overridden fields are left untouched, mirroring
// addressNormalization.js's markProviderFieldsStale exactly.
const markPropertyIntelligenceStale = (intel) => {
  if (!intel || !intel.fields) return intel;
  const fields = {};
  for (const key of FIELD_KEYS) {
    const f = intel.fields[key] || emptyField();
    fields[key] = f.source === SOURCE.THIRD_PARTY ? { ...f, verificationStatus: VERIFICATION_STATUS.STALE } : f;
  }
  return { ...intel, fields, status: LOOKUP_STATUS.STALE };
};

module.exports = {
  SCHEMA_VERSION,
  SOURCE,
  VERIFICATION_STATUS,
  LOOKUP_STATUS,
  FIELD_KEYS,
  CACHE_EXCLUDED_FIELD_KEYS,
  AREA_UNITS,
  LOT_UNITS,
  makeField,
  emptyField,
  isValidFootprintGeometry,
  MAX_FOOTPRINT_JSON_LENGTH,
  MAX_FOOTPRINT_DEPTH,
  FIELD_VALIDATORS,
  normalizeProviderFields,
  validateFieldValue,
  buildEmptyPropertyIntelligence,
  markPropertyIntelligenceStale,
};
