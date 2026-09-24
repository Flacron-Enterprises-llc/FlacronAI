// Phase 43 (OpenAI Preliminary Pricing Service). Pure, dependency-free
// (Node's built-in `crypto` only) fingerprint function used to key the
// Firestore `pricingSuggestionsCache` collection.
//
// Deliberately hashes ONLY normalized, non-PII, non-report-specific,
// non-user-specific fields -- no reportId, no userId, no insured name/claim
// number/address street line, no photos, no narrative text. This is what
// makes a cache document safe to reuse across DIFFERENT reports/users by
// construction: two unrelated reports pricing "Replace drywall, Living
// Room, 10 SF, TX" in the same calendar month legitimately produce the same
// fingerprint and may legitimately share a cached suggestion -- there is
// nothing sensitive to leak between them because nothing sensitive ever
// went into the hash.
//
// `pricingDate` is truncated to a MONTH WINDOW (`YYYY-MM`) rather than
// hashed verbatim -- a suggestion generated on any day within the same
// month is treated as the same cache entry, which is both a reasonable
// pricing-volatility assumption and a stronger anonymity boundary than a
// day-level key would be.
const crypto = require('crypto');

const truncateToMonthWindow = (isoDateLike) => {
  const s = String(isoDateLike || '').slice(0, 7); // "YYYY-MM-DD" -> "YYYY-MM"
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
};

const norm = (v, { upper = false } = {}) => {
  const s = String(v ?? '').trim();
  return upper ? s.toUpperCase() : s.toLowerCase();
};

// `repairAction` is the field that distinguishes otherwise-identical jobs
// ("replace" vs "paint" the same 20 SF in the same kitchen), so it gets a
// stricter normalization than `norm`: Unicode NFKC, lowercase, and every
// whitespace run collapsed to one space. A plain single-spaced value
// normalizes exactly as `norm` did, so existing cache keys are unchanged.
const normalizeRepairAction = (v) =>
  String(v ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// The shared, cross-user cache is only safe to use when the item carries a
// non-blank repair action -- without it, two different jobs with the same
// room/quantity/unit would collide on one key. Free-text `description` is
// deliberately NOT a substitute (it may contain personal details and is
// never hashed). Callers skip both cache read and write when this is false.
const isCacheableRepairAction = (v) => normalizeRepairAction(v) !== '';

// Every field here is intentionally generic/normalizable -- see header
// comment. `Object.keys(normalized).sort()` is passed to JSON.stringify as
// an explicit allow-list AND to force a deterministic key order regardless
// of how the caller happened to pass fields in, so the same logical input
// always serializes identically before hashing.
const computePricingFingerprint = ({
  country,
  state,
  city,
  postalCode,
  room,
  damageType,
  repairAction,
  material,
  quantity,
  unit,
  currency,
  pricingDate,
  provider,
  model,
  promptVersion,
  schemaVersion,
} = {}) => {
  const normalized = {
    country: norm(country, { upper: true }),
    state: norm(state, { upper: true }),
    city: norm(city),
    postalCode: norm(postalCode, { upper: true }),
    room: norm(room),
    damageType: norm(damageType),
    repairAction: normalizeRepairAction(repairAction),
    material: norm(material),
    quantity: Number.isFinite(Number(quantity)) ? Number(quantity) : 0,
    unit: norm(unit, { upper: true }),
    currency: norm(currency, { upper: true }),
    pricingDateWindow: truncateToMonthWindow(pricingDate) || '',
    provider: norm(provider),
    model: norm(model),
    promptVersion: norm(promptVersion),
    schemaVersion: Number.isFinite(Number(schemaVersion)) ? Number(schemaVersion) : 1,
  };
  const json = JSON.stringify(normalized, Object.keys(normalized).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
};

module.exports = {
  computePricingFingerprint,
  truncateToMonthWindow,
  normalizeRepairAction,
  isCacheableRepairAction,
};
