// Phase 47 (Property Intelligence: RealtyAPI U.S. Adapter & Report
// Integration). Pure, dependency-free (Node's built-in `crypto` only)
// fingerprint used to key the shared `propertyIntelligenceCache` collection
// and to detect a stale lookup after the linked address changes. Mirrors
// backend/utils/pricingFingerprint.js's own conventions exactly.
//
// Hashes ONLY the normalized, non-PII address components a lookup was
// performed against (plus provider/schema identity) -- no reportId, no
// userId, no claimant/photo/narrative content. Two different reports
// looking up the SAME physical U.S. address legitimately share a cache
// entry; nothing sensitive is in the hash to leak between them.
const crypto = require('crypto');

const norm = (v, { upper = false } = {}) => {
  const s = String(v ?? '').trim();
  return upper ? s.toUpperCase() : s.toLowerCase();
};

const computePropertyAddressFingerprint = ({
  addressLine1,
  city,
  state,
  postalCode,
  countryCode,
  provider,
  schemaVersion,
} = {}) => {
  const normalized = {
    addressLine1: norm(addressLine1),
    city: norm(city),
    state: norm(state, { upper: true }),
    postalCode: norm(postalCode, { upper: true }),
    countryCode: norm(countryCode, { upper: true }),
    provider: norm(provider),
    schemaVersion: Number.isFinite(Number(schemaVersion)) ? Number(schemaVersion) : 1,
  };
  const json = JSON.stringify(normalized, Object.keys(normalized).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
};

module.exports = { computePropertyAddressFingerprint };
