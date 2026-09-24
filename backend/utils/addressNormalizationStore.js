// Phase 46 (Property Intelligence: Address Normalization & Google Integration).
// Server-side, short-lived "normalization" record -- the opaque handle
// (`normalizationToken`) a PUT /:id/property-profile call must present to
// have its provider-derived fields trusted. Mirrors
// backend/utils/pricingProposalStore.js's trust-boundary pattern exactly:
// the client never gets to hand the server a "verified" address -- it can
// only hand back a token for a normalization THIS SERVER already computed
// (via the Geocoding place_id lookup, server key). A top-level collection
// (not a report subcollection) because normalization can happen BEFORE a
// report exists (the wizard's property step, ahead of report creation).
const crypto = require('crypto');
const { Timestamp } = require('../config/firebase');

const COLLECTION = 'addressNormalizations';
const TTL_MINUTES = Number(process.env.ADDRESS_NORMALIZATION_TTL_MINUTES) || 15;

const makeError = (message, code, extra) => Object.assign(new Error(message), { code }, extra || {});

const toEpochMs = (value) => {
  if (!value) return NaN;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime();
};

// `normalizedValues` is the plain, already-provider-normalized values object
// (addressNormalization.js FIELD_KEYS shape) -- never client-supplied.
const createAddressNormalization = async (db, { requestedByUid, original, normalizedValues, ambiguous }) => {
  const token = `an_${crypto.randomBytes(12).toString('hex')}`;
  const now = new Date();
  const expiresAtDate = new Date(now.getTime() + TTL_MINUTES * 60 * 1000);

  await db
    .collection(COLLECTION)
    .doc(token)
    .set({
      token,
      requestedByUid: requestedByUid || null,
      original: original || '',
      normalizedValues: normalizedValues || {},
      ambiguous: !!ambiguous,
      createdAt: now.toISOString(),
      expiresAt: Timestamp.fromDate(expiresAtDate),
      consumed: false,
    });

  return { token, expiresAt: expiresAtDate.toISOString() };
};

// Reads (never mutates) a normalization record for use by PUT
// /:id/property-profile. Enforces: exists, not expired, owned by the same
// uid that requested it. Does NOT mark it consumed -- unlike a pricing
// proposal (which gates a one-time dollar figure), a normalization may
// legitimately be re-applied (e.g. the user reopens the review step without
// changing anything) or discarded if the user goes back to manual entry.
const resolveAddressNormalization = async (db, { token, requestedByUid }) => {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) {
    throw makeError('normalizationToken is required.', 'ADDRESS_NORMALIZATION_NOT_FOUND');
  }
  const snap = await db.collection(COLLECTION).doc(cleanToken).get();
  if (!snap.exists) {
    throw makeError('This address lookup has expired. Please look it up again.', 'ADDRESS_NORMALIZATION_NOT_FOUND');
  }
  const data = snap.data();
  if (data.requestedByUid !== requestedByUid) {
    throw makeError('You do not have permission to use this address lookup.', 'ADDRESS_NORMALIZATION_FORBIDDEN');
  }
  if (!data.expiresAt || toEpochMs(data.expiresAt) < Date.now()) {
    throw makeError('This address lookup has expired. Please look it up again.', 'ADDRESS_NORMALIZATION_EXPIRED');
  }
  return data;
};

module.exports = { COLLECTION, TTL_MINUTES, createAddressNormalization, resolveAddressNormalization };
