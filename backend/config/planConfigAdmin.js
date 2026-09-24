// Phase 48 (Pricing Page, Admin Configuration UI & Cross-Surface
// Consistency). Extends Phase 44's PlanConfig write path (planConfig.js)
// with the admin-facing pieces Phase 44 deliberately left out: an
// allowlisted patch/merge (so an admin write can never touch
// reportsPerMonth or any other unrelated entitlement), optimistic
// concurrency, and a history snapshot -- WITHOUT modifying
// planConfig.js's own read/write shape (still a single plain get+set on
// `planConfig/active`, no transaction), so plan-config.test.js's existing
// narrow single-collection fake Firestore keeps passing unmodified.
//
// History lives in its own collection (`planConfigHistory`) written by
// THIS module only -- planConfig.js itself never touches it, so Phase 44's
// own tests never need to know it exists.
const {
  getPlanConfig,
  setPlanConfig,
  validatePlanConfig,
  applyLegacyRollbackConfig,
  invalidatePlanConfigCache,
  PLAN_IDS,
  UNLIMITED,
} = require('./planConfig');
const { TIERS } = require('./tiers');

const HISTORY_COLLECTION = 'planConfigHistory';
const MAX_LABEL_LENGTH = 60;
const MAX_CHANGE_SUMMARY_LENGTH = 500;

// Escapes the handful of characters that matter for safe display in an HTML
// context -- displayLabels/changeSummary are free-text admin input that may
// end up rendered directly in the frontend (pricing page / admin UI).
const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const isPositiveIntegerOrUnlimited = (v) => v === UNLIMITED || (Number.isInteger(v) && v >= 0);

// Everything an admin write is allowed to touch. Deliberately excludes
// reportsPerMonth, allowedMimeTypes, maxFileSizeBytes, addOnPackSizes,
// addOnPackPrices, schemaVersion, status -- those are either Phase
// 44-owned entitlements this change request explicitly leaves untouched, or
// internal bookkeeping this module manages itself.
//
// Each key here is one the running system actually enforces:
// plans.*.basePhotoLimit (photo-capacity routes via resolvePlanContext),
// addOnsEnabled (photo-pack catalogue + checkout in routes/payment.js) and
// displayLabels (public-plan-config `label`, shown on the FAQ).
// `watermarkPolicyEnabled` is deliberately NOT admin-editable: nothing reads
// it (utils/watermarkPolicy.js decides from review status + tier) and its
// "off" meaning is undefined -- it must never be able to suppress the
// mandatory DRAFT watermark. It stays in the stored schema for compatibility.
const ADMIN_EDITABLE_KEYS = Object.freeze(['plans', 'addOnsEnabled', 'displayLabels']);

const validatePatchShape = (patch) => {
  const errors = [];
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { valid: false, errors: ['patch must be an object'] };
  }
  const allowedKeys = ADMIN_EDITABLE_KEYS;
  const unknown = Object.keys(patch).filter((k) => !allowedKeys.includes(k));
  if (unknown.length) errors.push(`unrecognized field(s): ${unknown.join(', ')} (allowed: ${allowedKeys.join(', ')})`);

  if (patch.plans !== undefined) {
    if (typeof patch.plans !== 'object' || Array.isArray(patch.plans)) {
      errors.push('plans must be an object');
    } else {
      const unknownPlans = Object.keys(patch.plans).filter((k) => !PLAN_IDS.includes(k));
      if (unknownPlans.length) errors.push(`unrecognized plan id(s) in patch: ${unknownPlans.join(', ')}`);
      for (const [id, fields] of Object.entries(patch.plans)) {
        if (!PLAN_IDS.includes(id)) continue;
        if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
          errors.push(`plans.${id} must be an object`);
          continue;
        }
        const fieldKeys = Object.keys(fields);
        const unknownFields = fieldKeys.filter((k) => k !== 'basePhotoLimit');
        if (unknownFields.length) errors.push(`plans.${id}: only basePhotoLimit is admin-editable (got ${unknownFields.join(', ')})`);
        if (fields.basePhotoLimit !== undefined && !isPositiveIntegerOrUnlimited(fields.basePhotoLimit)) {
          errors.push(`plans.${id}.basePhotoLimit must be a non-negative integer or "${UNLIMITED}" (got ${JSON.stringify(fields.basePhotoLimit)})`);
        }
      }
    }
  }
  if (patch.addOnsEnabled !== undefined && typeof patch.addOnsEnabled !== 'boolean') {
    errors.push('addOnsEnabled must be a boolean');
  }
  if (patch.displayLabels !== undefined) {
    if (typeof patch.displayLabels !== 'object' || Array.isArray(patch.displayLabels)) {
      errors.push('displayLabels must be an object');
    } else {
      const unknownPlans = Object.keys(patch.displayLabels).filter((k) => !PLAN_IDS.includes(k));
      if (unknownPlans.length) errors.push(`unrecognized plan id(s) in displayLabels: ${unknownPlans.join(', ')}`);
      for (const [id, label] of Object.entries(patch.displayLabels)) {
        if (!PLAN_IDS.includes(id)) continue;
        if (typeof label !== 'string' || !label.trim() || label.length > MAX_LABEL_LENGTH) {
          errors.push(`displayLabels.${id} must be a non-empty string of at most ${MAX_LABEL_LENGTH} characters`);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
};

// Pure merge -- never mutates `current`. Sanitizes free-text (displayLabels)
// via escapeHtml before it ever reaches storage.
const mergeAllowedPatch = (current, patch) => {
  const merged = {
    ...current,
    plans: { ...current.plans },
    displayLabels: { ...(current.displayLabels || {}) },
  };
  if (patch.plans) {
    for (const [id, fields] of Object.entries(patch.plans)) {
      if (!PLAN_IDS.includes(id) || fields.basePhotoLimit === undefined) continue;
      merged.plans[id] = { ...merged.plans[id], basePhotoLimit: fields.basePhotoLimit };
    }
  }
  if (patch.addOnsEnabled !== undefined) merged.addOnsEnabled = patch.addOnsEnabled;
  if (patch.displayLabels) {
    for (const [id, label] of Object.entries(patch.displayLabels)) {
      if (!PLAN_IDS.includes(id)) continue;
      merged.displayLabels[id] = escapeHtml(label.trim());
    }
  }
  merged.status = 'active'; // an admin write always produces a genuinely-active, Firestore-backed config
  return merged;
};

class PlanConfigConflictError extends Error {
  constructor(currentRevision) {
    super(`PlanConfig has changed since you loaded it (current revision ${currentRevision}) -- reload and retry.`);
    this.code = 'PLAN_CONFIG_CONFLICT';
    this.currentRevision = currentRevision;
  }
}

class PlanConfigPatchInvalidError extends Error {
  constructor(errors) {
    super(`Invalid PlanConfig patch: ${errors.join('; ')}`);
    this.code = 'INVALID_PLAN_CONFIG_PATCH';
    this.errors = errors;
  }
}

// Admin GET view -- the config plus the metadata the UI needs to render
// version/source/last-updated (all already non-sensitive: PlanConfig never
// held secrets, and updatedBy is an admin email, safe for an admin-only
// response).
const getAdminPlanConfigView = async (db) => {
  const { config, source, errors } = await getPlanConfig(db, { forceRefresh: true });
  const revision = Number.isInteger(config.revision) ? config.revision : 0;
  const displayLabels = { ...Object.fromEntries(PLAN_IDS.map((id) => [id, TIERS[id]?.name || id])), ...(config.displayLabels || {}) };
  return {
    config,
    displayLabels,
    revision,
    source, // 'firestore' | 'fallback'
    configErrors: errors,
    updatedAt: config.updatedAt || null,
    updatedBy: config.updatedBy || null,
    isLegacyRollback: config.status === 'legacy_rollback',
  };
};

// Writes a snapshot of the PREVIOUS doc into planConfigHistory before a new
// value takes effect -- best-effort (a history-write failure must never
// block the actual config update, matching auditLogService's own contract).
const recordHistorySnapshot = async (db, { previousDoc, changeSummary, updatedBy, now }) => {
  try {
    await db.collection(HISTORY_COLLECTION).doc().set({
      snapshot: previousDoc || null,
      revisionAtSnapshot: previousDoc && Number.isInteger(previousDoc.revision) ? previousDoc.revision : 0,
      changeSummary: changeSummary || null,
      updatedBy: updatedBy || null,
      archivedAt: now().toISOString(),
    });
  } catch (err) {
    console.error('planConfigHistory write failed:', err.message);
  }
};

// The one write path Phase 48's admin UI calls. `expectedRevision` (optional
// -- omit only for a first-ever seed with no prior doc) enforces optimistic
// concurrency: a stale editor gets a PLAN_CONFIG_CONFLICT, never a silent
// overwrite. On ANY failure (invalid patch, conflict, or validation failure
// of the merged result) the previously active config is left completely
// untouched -- no partial publication.
const updatePlanConfigFields = async (
  db,
  patch,
  { updatedBy = null, changeSummary, expectedRevision, now = () => new Date() } = {}
) => {
  if (!changeSummary || typeof changeSummary !== 'string' || !changeSummary.trim()) {
    throw new PlanConfigPatchInvalidError(['changeSummary is required']);
  }
  if (changeSummary.length > MAX_CHANGE_SUMMARY_LENGTH) {
    throw new PlanConfigPatchInvalidError([`changeSummary must be at most ${MAX_CHANGE_SUMMARY_LENGTH} characters`]);
  }
  const shape = validatePatchShape(patch);
  if (!shape.valid) throw new PlanConfigPatchInvalidError(shape.errors);

  const { config: current, source } = await getPlanConfig(db, { forceRefresh: true });
  const currentRevision = Number.isInteger(current.revision) ? current.revision : 0;
  if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
    throw new PlanConfigConflictError(currentRevision);
  }

  const merged = mergeAllowedPatch(current, patch);
  const { valid, errors } = validatePlanConfig(merged);
  if (!valid) throw new PlanConfigPatchInvalidError(errors);

  const safeChangeSummary = escapeHtml(changeSummary.trim());
  // Only snapshot a real prior doc -- a fallback (no doc existed yet) has
  // nothing to preserve.
  if (source === 'firestore') {
    await recordHistorySnapshot(db, { previousDoc: current, changeSummary: safeChangeSummary, updatedBy, now });
  }
  const written = await setPlanConfig(db, merged, { updatedBy, now });
  return { config: written, changeSummary: safeChangeSummary };
};

// Explicit, deliberate legacy-rollback action (never reachable from
// `updatePlanConfigFields`'s allowlisted patch). Same conflict/history
// contract as above.
const rollbackToLegacyPlanConfig = async (db, { updatedBy = null, changeSummary, expectedRevision, now = () => new Date() } = {}) => {
  if (!changeSummary || typeof changeSummary !== 'string' || !changeSummary.trim()) {
    throw new PlanConfigPatchInvalidError(['changeSummary is required to roll back to the legacy flat-100 profile']);
  }
  const { config: current, source } = await getPlanConfig(db, { forceRefresh: true });
  const currentRevision = Number.isInteger(current.revision) ? current.revision : 0;
  if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
    throw new PlanConfigConflictError(currentRevision);
  }
  const safeChangeSummary = escapeHtml(changeSummary.trim());
  if (source === 'firestore') {
    await recordHistorySnapshot(db, { previousDoc: current, changeSummary: safeChangeSummary, updatedBy, now });
  }
  const written = await applyLegacyRollbackConfig(db, { updatedBy, now });
  return { config: written, changeSummary: safeChangeSummary };
};

const getPlanConfigHistory = async (db, { limit = 20 } = {}) => {
  const snap = await db.collection(HISTORY_COLLECTION).orderBy('archivedAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

module.exports = {
  HISTORY_COLLECTION,
  MAX_LABEL_LENGTH,
  MAX_CHANGE_SUMMARY_LENGTH,
  PlanConfigConflictError,
  PlanConfigPatchInvalidError,
  ADMIN_EDITABLE_KEYS,
  validatePatchShape,
  mergeAllowedPatch,
  getAdminPlanConfigView,
  updatePlanConfigFields,
  rollbackToLegacyPlanConfig,
  getPlanConfigHistory,
  invalidatePlanConfigCache,
};
