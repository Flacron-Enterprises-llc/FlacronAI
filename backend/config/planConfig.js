// Phase 44 (Central Plan Configuration & Atomic Photo-Capacity Enforcement).
//
// Single Firestore-backed source of truth for per-tier limits, replacing the
// two independent hardcoded values this repo previously had: tiers.js's
// `reportsPerMonth` (5/50/200/unlimited) and reports.js's flat, single
// `MAX_PHOTOS = 100` constant shared by every tier. See PHASES.md Phase 44
// for the full spec this module implements.
//
// Storage: one document, `planConfig/active`. Deliberately a single doc (not
// one-doc-per-plan) so a read is always one consistent snapshot -- no risk of
// observing plan A's just-written new limit alongside plan B's stale one
// mid-way through a multi-doc write.
//
// Caching: a short in-process TTL cache (default 60s, `PLAN_CONFIG_CACHE_TTL_MS`)
// so the hot path (every photo upload) doesn't re-read Firestore per request,
// PLUS an explicit `invalidatePlanConfigCache()` that any writer (`setPlanConfig`
// here; a future Phase 48 admin UI) calls after a successful write -- so a
// config change takes effect on the very next read, not after the TTL lapses.
//
// Safe-fallback contract (never fail closed into "unlimited", and never
// silently EXPAND Starter): if the document is missing, malformed, unreadable,
// or on an unsupported schema version, every read function returns
// FALLBACK_CONFIG. FALLBACK_CONFIG *is* the accepted steady-state mapping
// (Starter 25 / Professional 100 / Agency 250 / Enterprise unlimited) -- a
// normal deployment with no `planConfig/active` doc yet (or a temporarily
// unreadable one) enforces the real accepted limits, not the old flat-100
// behavior. `reportsPerMonth` is unchanged by this file (tiers.js's original
// per-tier values), matching Phase 44's own "don't change unrelated
// entitlements" boundary.
//
// The OLD flat-100-for-every-tier behavior still exists, as
// LEGACY_ROLLBACK_CONFIG -- but it is never returned automatically. It is
// only ever applied by deliberately calling `applyLegacyRollbackConfig()`
// (or writing LEGACY_ROLLBACK_CONFIG to `planConfig/active` yourself), an
// explicit incident-response action, not something a missing/malformed
// config can trigger on its own.
//
// A valid, authoritative `planConfig/active` Firestore document always wins
// over both built-in constants -- seed it via `setPlanConfig`/
// `scripts/seedPlanConfig.js` (not run by this correction; see that file).

const COLLECTION = 'planConfig';
const DOC_ID = 'active';
const SCHEMA_VERSION = 1;
// `|| 60_000` would silently ignore a deliberate `PLAN_CONFIG_CACHE_TTL_MS=0`
// (disable caching) since 0 is falsy -- checked explicitly instead.
const envCacheTtl = Number(process.env.PLAN_CONFIG_CACHE_TTL_MS);
const DEFAULT_CACHE_TTL_MS = Number.isFinite(envCacheTtl) && envCacheTtl >= 0 ? envCacheTtl : 60_000;

// Explicit unlimited representation -- never a magic number (e.g. -1) so a
// missing/zero/negative value can never be silently misread as unlimited.
const UNLIMITED = 'unlimited';

// Canonical plan ids. MUST match tiers.js's TIER_ORDER exactly -- PlanConfig
// never invents its own tier vocabulary. (Not imported from tiers.js to avoid
// a require() cycle: tiers.js itself reads this module for live limits.)
const PLAN_IDS = ['starter', 'professional', 'agency', 'enterprise'];

const stripAnnualSuffix = (tierName) => String(tierName || '').replace('_annual', '') || 'starter';

// The change-request's actual target values -- exported so a one-time seed
// script/test/future Phase 48 admin UI has a single source for "what
// production should actually contain", never re-typed by hand elsewhere.
// addOnPackSizes/addOnPackPrices are explicit PLACEHOLDER/test values per
// Phase 44's scope note -- Phase 45 fills real, client-confirmed prices;
// nothing here is a commercial commitment. This is what a seed writes to
// `planConfig/active`, AND (as FALLBACK_CONFIG below) what every read
// function returns automatically when Firestore has no valid config yet.
const RECOMMENDED_DEFAULT_CONFIG = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  plans: Object.freeze({
    starter: Object.freeze({ reportsPerMonth: 5, basePhotoLimit: 25 }),
    professional: Object.freeze({ reportsPerMonth: 50, basePhotoLimit: 100 }),
    agency: Object.freeze({ reportsPerMonth: 200, basePhotoLimit: 250 }),
    enterprise: Object.freeze({ reportsPerMonth: UNLIMITED, basePhotoLimit: UNLIMITED }),
  }),
  addOnsEnabled: false, // Phase 45 flips this on once Stripe packs are real
  addOnPackSizes: [25, 50, 100], // placeholder sizes pending Phase 45/client confirmation
  addOnPackPrices: {}, // placeholder -- Phase 45 fills real Stripe-confirmed prices
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  maxFileSizeBytes: 10 * 1024 * 1024,
  watermarkPolicyEnabled: true,
  status: 'active',
});

// Automatic built-in fallback -- see header comment. Same accepted mapping as
// RECOMMENDED_DEFAULT_CONFIG (kept as a distinct frozen constant/status so
// "this is what a read silently defaulted to" is programmatically
// distinguishable from "this is what got seeded to Firestore" if ever
// inspected/logged).
const FALLBACK_CONFIG = Object.freeze({ ...RECOMMENDED_DEFAULT_CONFIG, status: 'built_in_default' });

// Pre-Phase-44-correction behavior (flat 100-photo cap for every tier). NEVER
// returned automatically by any read path -- only reachable by deliberately
// calling `applyLegacyRollbackConfig()` (or writing this object to
// `planConfig/active` directly), an explicit incident-response action.
const LEGACY_ROLLBACK_CONFIG = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  plans: Object.freeze({
    starter: Object.freeze({ reportsPerMonth: 5, basePhotoLimit: 100 }),
    professional: Object.freeze({ reportsPerMonth: 50, basePhotoLimit: 100 }),
    agency: Object.freeze({ reportsPerMonth: 200, basePhotoLimit: 100 }),
    enterprise: Object.freeze({ reportsPerMonth: UNLIMITED, basePhotoLimit: 100 }),
  }),
  addOnsEnabled: false,
  addOnPackSizes: [],
  addOnPackPrices: {},
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  maxFileSizeBytes: 10 * 1024 * 1024,
  watermarkPolicyEnabled: true,
  status: 'legacy_rollback',
});

let cache = null; // { result, expiresAt }

const isNonNegativeInteger = (v) => Number.isInteger(v) && v >= 0;
const isPositiveIntegerOrUnlimited = (v) => v === UNLIMITED || isNonNegativeInteger(v);

// Validation -- Phase 44 task 2. Returns { valid, errors }. Never mutates
// `raw`. Deliberately strict: any single defect anywhere in the document
// fails the WHOLE document (never a partial/mixed-trust config), which is
// what makes the safe-fallback contract above trustworthy.
const validatePlanConfig = (raw) => {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, errors: ['config is not an object'] };
  }
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion: ${JSON.stringify(raw.schemaVersion)} (expected ${SCHEMA_VERSION})`);
  }
  if (!raw.plans || typeof raw.plans !== 'object' || Array.isArray(raw.plans)) {
    errors.push('missing or invalid plans object');
  } else {
    const keys = Object.keys(raw.plans);
    const unknown = keys.filter((k) => !PLAN_IDS.includes(k));
    if (unknown.length) errors.push(`unrecognized plan id(s): ${unknown.join(', ')}`);
    const missing = PLAN_IDS.filter((k) => !keys.includes(k));
    if (missing.length) errors.push(`missing plan id(s): ${missing.join(', ')}`);
    // Object keys are unique by construction (a JS object literal cannot
    // hold two "starter" keys), so "no duplicate plans" is guaranteed by this
    // shape -- still validate every recognized plan's own fields.
    for (const id of keys) {
      if (!PLAN_IDS.includes(id)) continue;
      const plan = raw.plans[id];
      if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
        errors.push(`plan "${id}" is not an object`);
        continue;
      }
      if (!isPositiveIntegerOrUnlimited(plan.reportsPerMonth)) {
        errors.push(`plan "${id}".reportsPerMonth must be a non-negative integer or "${UNLIMITED}" (got ${JSON.stringify(plan.reportsPerMonth)})`);
      }
      if (!isPositiveIntegerOrUnlimited(plan.basePhotoLimit)) {
        errors.push(`plan "${id}".basePhotoLimit must be a non-negative integer or "${UNLIMITED}" (got ${JSON.stringify(plan.basePhotoLimit)})`);
      }
    }
  }
  if (typeof raw.addOnsEnabled !== 'boolean') errors.push('addOnsEnabled must be a boolean');
  if (!Array.isArray(raw.allowedMimeTypes) || raw.allowedMimeTypes.length === 0 || !raw.allowedMimeTypes.every((m) => typeof m === 'string' && m.length > 0)) {
    errors.push('allowedMimeTypes must be a non-empty array of non-empty strings');
  }
  if (!Number.isInteger(raw.maxFileSizeBytes) || raw.maxFileSizeBytes <= 0) {
    errors.push('maxFileSizeBytes must be a positive integer');
  }
  if (raw.addOnPackSizes !== undefined) {
    if (!Array.isArray(raw.addOnPackSizes) || !raw.addOnPackSizes.every((n) => isNonNegativeInteger(n) && n > 0)) {
      errors.push('addOnPackSizes must be an array of positive integers');
    }
  }
  if (raw.addOnPackPrices && typeof raw.addOnPackPrices === 'object' && !Array.isArray(raw.addOnPackPrices)) {
    for (const [k, v] of Object.entries(raw.addOnPackPrices)) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        errors.push(`addOnPackPrices.${k} must be a non-negative finite number`);
      }
    }
  } else if (raw.addOnPackPrices !== undefined) {
    errors.push('addOnPackPrices must be an object');
  }
  return { valid: errors.length === 0, errors };
};

const invalidatePlanConfigCache = () => {
  cache = null;
};

const readRawPlanConfig = async (db) => {
  const snap = await db.collection(COLLECTION).doc(DOC_ID).get();
  if (!snap.exists) return null;
  return snap.data();
};

// Returns { config, source, errors } -- `source` is 'firestore' | 'fallback'.
// Cached in-process for `ttlMs` (default DEFAULT_CACHE_TTL_MS); pass
// `forceRefresh: true` to bypass (used by tests and right after a write, even
// though setPlanConfig already invalidates the cache itself).
const getPlanConfig = async (db, { now = () => Date.now(), ttlMs = DEFAULT_CACHE_TTL_MS, forceRefresh = false } = {}) => {
  if (!forceRefresh && cache && cache.expiresAt > now()) return cache.result;

  let result;
  try {
    const raw = await readRawPlanConfig(db);
    if (!raw) {
      result = { config: FALLBACK_CONFIG, source: 'fallback', errors: ['planConfig/active document does not exist'] };
    } else {
      const { valid, errors } = validatePlanConfig(raw);
      result = valid
        ? { config: raw, source: 'firestore', errors: [] }
        : { config: FALLBACK_CONFIG, source: 'fallback', errors };
    }
  } catch (err) {
    result = { config: FALLBACK_CONFIG, source: 'fallback', errors: [`read failed: ${err.message}`] };
  }

  cache = { result, expiresAt: now() + ttlMs };
  return result;
};

// Validated write path. Used by seed scripts/tests today; Phase 48's admin
// UI puts a form in front of this SAME function (via planConfigAdmin.js's
// allowlisted merge), never a second write path with its own (possibly
// weaker) validation.
//
// `revision` (Phase 48): a plain integer counter, computed from whatever is
// currently stored (0 if no doc/no numeric revision yet -- an old
// pre-Phase-48 doc is treated as revision 0, never rejected). This function
// stays deliberately non-transactional (plain get+set, matching its
// pre-Phase-48 shape) so the narrow single-collection fake Firestore already
// used by this file's own tests keeps working unmodified -- Phase 48's admin
// write path (planConfigAdmin.js) accepts the small race window this implies
// (a real concurrent double-write) as an acceptable tradeoff given the
// single-admin-email model this codebase already documents elsewhere.
const setPlanConfig = async (db, nextConfig, { updatedBy = null, now = () => new Date() } = {}) => {
  const { valid, errors } = validatePlanConfig(nextConfig);
  if (!valid) {
    const err = new Error(`Invalid PlanConfig: ${errors.join('; ')}`);
    err.code = 'INVALID_PLAN_CONFIG';
    err.errors = errors;
    throw err;
  }
  const existing = await readRawPlanConfig(db);
  const currentRevision = existing && Number.isInteger(existing.revision) ? existing.revision : 0;
  const doc = {
    ...nextConfig,
    revision: currentRevision + 1,
    createdAt: existing && existing.createdAt ? existing.createdAt : now().toISOString(),
    updatedAt: now().toISOString(),
    updatedBy,
  };
  await db.collection(COLLECTION).doc(DOC_ID).set(doc);
  invalidatePlanConfigCache();
  return doc;
};

// Resolves one plan's limits out of an already-loaded config. Unknown plan
// ids fall back to 'starter' (mirrors tiers.js's getTier default).
const getPlanLimits = (config, planId) => {
  const id = PLAN_IDS.includes(planId) ? planId : 'starter';
  return (config && config.plans && config.plans[id]) || FALLBACK_CONFIG.plans.starter;
};

// Pure resolver (Phase 44 task 4): effectiveCapacity = basePlanCapacity +
// verifiedReportAddOnCapacity. `verifiedAddOnCapacity` MUST already be
// server-verified (Phase 45's job) -- this function only ever adds whatever
// number it is given; it never reads or trusts a client-supplied add-on
// value itself. Unlimited stays unlimited regardless of any add-on.
const resolveEffectivePhotoCapacity = ({ basePhotoLimit, verifiedAddOnCapacity = 0 }) => {
  if (basePhotoLimit === UNLIMITED) return { capacity: Infinity, unlimited: true };
  const base = isNonNegativeInteger(basePhotoLimit) ? basePhotoLimit : FALLBACK_CONFIG.plans.starter.basePhotoLimit;
  const addOn = Number.isFinite(verifiedAddOnCapacity) && verifiedAddOnCapacity > 0 ? Math.floor(verifiedAddOnCapacity) : 0;
  return { capacity: base + addOn, unlimited: false };
};

// Explicit, deliberate rollback tool (Phase 44 correction, task 2/6) -- the
// ONLY sanctioned way LEGACY_ROLLBACK_CONFIG (flat 100) reaches
// `planConfig/active`. Never called automatically by any read path or by
// `setPlanConfig` itself; an operator/incident-responder calls this by name
// (or runs `scripts/seedPlanConfig.js --legacy-rollback`).
const applyLegacyRollbackConfig = (db, opts) => setPlanConfig(db, LEGACY_ROLLBACK_CONFIG, opts);

// Convenience one-call resolver combining the above for a given user tier --
// this is what route handlers actually call. `verifiedAddOnCapacity` defaults
// to 0 (Phase 45 not built yet); a caller with real, server-verified add-on
// data may pass it explicitly, but it is NEVER read from `raw`/the client.
const resolvePlanContext = async (db, tierName, { verifiedAddOnCapacity = 0, ...configOpts } = {}) => {
  const planId = PLAN_IDS.includes(stripAnnualSuffix(tierName)) ? stripAnnualSuffix(tierName) : 'starter';
  const { config, source, errors } = await getPlanConfig(db, configOpts);
  const limits = getPlanLimits(config, planId);
  const { capacity, unlimited } = resolveEffectivePhotoCapacity({ basePhotoLimit: limits.basePhotoLimit, verifiedAddOnCapacity });
  const reportsPerMonth = limits.reportsPerMonth === UNLIMITED ? -1 : limits.reportsPerMonth; // -1 keeps tiers.js's own existing sentinel contract for canGenerate()
  return {
    planId,
    basePhotoLimit: limits.basePhotoLimit,
    verifiedAddOnCapacity,
    capacity,
    unlimited,
    reportsPerMonth,
    configSource: source,
    configErrors: errors,
  };
};

module.exports = {
  SCHEMA_VERSION,
  PLAN_IDS,
  UNLIMITED,
  FALLBACK_CONFIG,
  RECOMMENDED_DEFAULT_CONFIG,
  LEGACY_ROLLBACK_CONFIG,
  DEFAULT_CACHE_TTL_MS,
  validatePlanConfig,
  getPlanConfig,
  setPlanConfig,
  applyLegacyRollbackConfig,
  getPlanLimits,
  resolveEffectivePhotoCapacity,
  resolvePlanContext,
  invalidatePlanConfigCache,
  stripAnnualSuffix,
};
