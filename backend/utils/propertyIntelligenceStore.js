// Phase 47 (Property Intelligence: RealtyAPI U.S. Adapter & Report
// Integration). Two small, separate concerns, both mirroring existing
// established patterns rather than inventing new ones:
//
// 1. The "trusted lookup result" -- a short-lived, report/user-scoped
//    record (`reports/{reportId}/propertyLookups/{lookupId}`) a client
//    presents a `lookupId` handle for to have its provider-derived fields
//    trusted on apply. Mirrors backend/utils/addressNormalizationStore.js's
//    trust-boundary pattern (re-usable until expiry, not single-consume --
//    a user may reopen the review step without changing anything, or go
//    back to manual entry, either of which legitimately re-reads the same
//    record). A REPORT subcollection (not top-level like
//    addressNormalizations) because, unlike address normalization, a
//    property-intelligence lookup only ever happens against an EXISTING
//    report's already-confirmed address (see PHASES.md Phase 47's
//    eligibility rules) -- there is no pre-report-creation case to support.
//
// 2. A minimal, OPTIONAL shared cache
//    (`propertyIntelligenceCache/{addressFingerprint}`) keyed by
//    propertyIntelligenceFingerprint.js's non-PII address fingerprint --
//    mirrors pricingService.js's own getCachedItem/setCachedItem shape
//    exactly. Ownership data is EXCLUDED from this shared doc (see
//    propertyIntelligence.js's CACHE_EXCLUDED_FIELD_KEYS) since it is the
//    one field here with a real per-person privacy dimension; every other
//    field is generic parcel/structure data about a physical address, safe
//    to reuse across different reports/users who happen to look up the
//    same real address.
const crypto = require('crypto');
const { Timestamp } = require('../config/firebase');
const { FIELD_KEYS, CACHE_EXCLUDED_FIELD_KEYS } = require('./propertyIntelligence');

const LOOKUP_SUBCOLLECTION = 'propertyLookups';
const CACHE_COLLECTION = 'propertyIntelligenceCache';

const LOOKUP_TTL_MINUTES = Number(process.env.PROPERTY_INTELLIGENCE_LOOKUP_TTL_MINUTES) || 30;
const CACHE_TTL_DAYS = Number(process.env.PROPERTY_INTELLIGENCE_CACHE_TTL_DAYS) || 30;

const makeError = (message, code, extra) => Object.assign(new Error(message), { code }, extra || {});

const toEpochMs = (value) => {
  if (!value) return NaN;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime();
};

const lookupRefFor = (db, reportId, lookupId) =>
  db.collection('reports').doc(reportId).collection(LOOKUP_SUBCOLLECTION).doc(lookupId);

// `normalizedFields` is the trusted, ALREADY-validated `{key: Field}` map
// (propertyIntelligence.js's normalizeProviderFields output) -- never
// client-supplied. `addressFingerprint` lets a later apply/recheck detect
// whether the linked address has since changed (staleness).
const createPropertyLookup = async (
  db,
  { reportId, requestedByUid, status, fields, providerRecordId, providerEffectiveDate, addressFingerprint, disclaimers }
) => {
  const lookupId = `pl_${crypto.randomBytes(12).toString('hex')}`;
  const now = new Date();
  const expiresAtDate = new Date(now.getTime() + LOOKUP_TTL_MINUTES * 60 * 1000);

  await lookupRefFor(db, reportId, lookupId).set({
    lookupId,
    reportId,
    requestedByUid: requestedByUid || null,
    status,
    fields: fields || {},
    providerRecordId: providerRecordId || null,
    providerEffectiveDate: providerEffectiveDate || null,
    addressFingerprint: addressFingerprint || null,
    disclaimers: disclaimers || [],
    createdAt: now.toISOString(),
    expiresAt: Timestamp.fromDate(expiresAtDate),
  });

  return { lookupId, expiresAt: expiresAtDate.toISOString() };
};

// Reads (never mutates) a lookup record. Enforces: exists, not expired,
// owned by the same uid that requested it, AND scoped to the same report
// (structurally guaranteed by the subcollection path, checked again here as
// defense in depth, same as addressNormalizationStore.js's precedent).
const resolvePropertyLookup = async (db, { reportId, lookupId, requestedByUid }) => {
  const cleanId = String(lookupId || '').trim();
  if (!cleanId) {
    throw makeError('lookupId is required.', 'PROPERTY_LOOKUP_NOT_FOUND');
  }
  const snap = await lookupRefFor(db, reportId, cleanId).get();
  if (!snap.exists) {
    throw makeError('This property lookup was not found or has expired. Please request a new lookup.', 'PROPERTY_LOOKUP_NOT_FOUND');
  }
  const data = snap.data();
  if (data.reportId !== reportId) {
    throw makeError('This property lookup was not found or has expired. Please request a new lookup.', 'PROPERTY_LOOKUP_NOT_FOUND');
  }
  if (data.requestedByUid !== requestedByUid) {
    throw makeError('You do not have permission to use this property lookup.', 'PROPERTY_LOOKUP_FORBIDDEN');
  }
  if (!data.expiresAt || toEpochMs(data.expiresAt) < Date.now()) {
    throw makeError('This property lookup has expired. Please request a new lookup.', 'PROPERTY_LOOKUP_EXPIRED');
  }
  return data;
};

// --- shared, non-PII cache (see header comment) -------------------------

const cacheDocRef = (db, fingerprint) => db.collection(CACHE_COLLECTION).doc(fingerprint);

const stripCacheExcludedFields = (values) => {
  const clean = { ...values };
  for (const key of CACHE_EXCLUDED_FIELD_KEYS) delete clean[key];
  return clean;
};

const getCachedPropertyValues = async (db, fingerprint) => {
  const snap = await cacheDocRef(db, fingerprint).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data?.expiresAt || new Date(data.expiresAt).getTime() < Date.now()) return null;
  return data.values || null;
};

// `rawValues` is the flat provider-normalized values map BEFORE field
// wrapping -- ownership is stripped before it is ever written to this
// shared doc, regardless of what the caller passes in (belt-and-suspenders:
// the caller already strips it too, in propertyIntelligenceService.js).
const setCachedPropertyValues = async (db, fingerprint, rawValues, { providerRecordId, providerEffectiveDate } = {}) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await cacheDocRef(db, fingerprint).set({
    fingerprint,
    values: stripCacheExcludedFields(rawValues || {}),
    providerRecordId: providerRecordId || null,
    providerEffectiveDate: providerEffectiveDate || null,
    generatedAt: now.toISOString(),
    expiresAt,
  });
};

module.exports = {
  LOOKUP_SUBCOLLECTION,
  CACHE_COLLECTION,
  LOOKUP_TTL_MINUTES,
  CACHE_TTL_DAYS,
  FIELD_KEYS,
  createPropertyLookup,
  resolvePropertyLookup,
  getCachedPropertyValues,
  setCachedPropertyValues,
  stripCacheExcludedFields,
};
