const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Phase 48 (Pricing Page, Admin Configuration UI & Cross-Surface
// Consistency). Pure/integration tests for planConfigAdmin.js -- the
// allowlisted admin write path Phase 44's own planConfig.js doesn't have.
process.env.PLAN_CONFIG_CACHE_TTL_MS = '0';

const {
  validatePatchShape,
  mergeAllowedPatch,
  getAdminPlanConfigView,
  updatePlanConfigFields,
  rollbackToLegacyPlanConfig,
  getPlanConfigHistory,
  PlanConfigConflictError,
  PlanConfigPatchInvalidError,
} = require('../config/planConfigAdmin');
const { RECOMMENDED_DEFAULT_CONFIG, UNLIMITED, invalidatePlanConfigCache } = require('../config/planConfig');

test.beforeEach(() => invalidatePlanConfigCache());

// A minimal Firestore-like adapter over FakeFirestore's generic
// collection/doc API, matching planConfig.js's own expected shape
// (`db.collection('planConfig').doc('active').get()/.set()`), plus
// `orderBy().limit().get()` for the history collection (FakeFirestore
// already supports both).
const makeDb = () => new FakeFirestore();

const seedActiveConfig = async (db, config) => {
  await db.collection('planConfig').doc('active').set(config);
};

// ── validatePatchShape / mergeAllowedPatch (pure) ───────────────────────

test('validatePatchShape accepts an allowlisted patch', () => {
  const { valid, errors } = validatePatchShape({ plans: { starter: { basePhotoLimit: 30 } }, addOnsEnabled: true });
  assert.equal(valid, true, JSON.stringify(errors));
});

test('validatePatchShape rejects reportsPerMonth entirely -- not an allowlisted field', () => {
  const { valid, errors } = validatePatchShape({ plans: { starter: { reportsPerMonth: 999 } } });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('basePhotoLimit is admin-editable')));
});

test('validatePatchShape rejects an unrecognized top-level field', () => {
  const { valid, errors } = validatePatchShape({ maxFileSizeBytes: 1 });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('unrecognized field')));
});

test('validatePatchShape rejects an unrecognized/duplicate-shaped tier id', () => {
  const { valid, errors } = validatePatchShape({ plans: { gold: { basePhotoLimit: 10 } } });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('unrecognized plan id')));
});

test('validatePatchShape rejects a negative/non-integer basePhotoLimit', () => {
  assert.equal(validatePatchShape({ plans: { starter: { basePhotoLimit: -1 } } }).valid, false);
  assert.equal(validatePatchShape({ plans: { starter: { basePhotoLimit: 12.5 } } }).valid, false);
});

test('validatePatchShape accepts the explicit "unlimited" string for basePhotoLimit', () => {
  assert.equal(validatePatchShape({ plans: { agency: { basePhotoLimit: UNLIMITED } } }).valid, true);
});

test('validatePatchShape rejects a displayLabels entry that is empty or too long', () => {
  assert.equal(validatePatchShape({ displayLabels: { starter: '' } }).valid, false);
  assert.equal(validatePatchShape({ displayLabels: { starter: 'x'.repeat(200) } }).valid, false);
});

test('mergeAllowedPatch: only touches allowlisted fields, preserves everything else (reportsPerMonth, allowedMimeTypes, addOnPackSizes...) exactly', () => {
  const merged = mergeAllowedPatch(RECOMMENDED_DEFAULT_CONFIG, { plans: { starter: { basePhotoLimit: 30 } }, addOnsEnabled: true });
  assert.equal(merged.plans.starter.basePhotoLimit, 30);
  assert.equal(merged.plans.starter.reportsPerMonth, RECOMMENDED_DEFAULT_CONFIG.plans.starter.reportsPerMonth, 'reportsPerMonth untouched');
  assert.equal(merged.plans.professional.basePhotoLimit, RECOMMENDED_DEFAULT_CONFIG.plans.professional.basePhotoLimit, 'other tiers untouched');
  assert.deepEqual(merged.allowedMimeTypes, RECOMMENDED_DEFAULT_CONFIG.allowedMimeTypes);
  assert.equal(merged.maxFileSizeBytes, RECOMMENDED_DEFAULT_CONFIG.maxFileSizeBytes);
  assert.equal(merged.addOnsEnabled, true);
});

test('mergeAllowedPatch: explicit unlimited handling for a plan\'s basePhotoLimit', () => {
  const merged = mergeAllowedPatch(RECOMMENDED_DEFAULT_CONFIG, { plans: { agency: { basePhotoLimit: UNLIMITED } } });
  assert.equal(merged.plans.agency.basePhotoLimit, UNLIMITED);
});

test('mergeAllowedPatch: escapes HTML in displayLabels (safe rendering, no injection)', () => {
  const merged = mergeAllowedPatch(RECOMMENDED_DEFAULT_CONFIG, { displayLabels: { starter: '<script>alert(1)</script>' } });
  assert.equal(merged.displayLabels.starter.includes('<script>'), false);
  assert.ok(merged.displayLabels.starter.includes('&lt;script&gt;'));
});

// ── getAdminPlanConfigView ───────────────────────────────────────────────

test('getAdminPlanConfigView: built-in fallback when no doc exists -- revision 0, source "fallback", accepted mapping', async () => {
  const db = makeDb();
  const view = await getAdminPlanConfigView(db);
  assert.equal(view.source, 'fallback');
  assert.equal(view.revision, 0);
  assert.equal(view.config.plans.starter.basePhotoLimit, 25);
  assert.equal(view.isLegacyRollback, false);
});

test('getAdminPlanConfigView: default display labels come from tiers.js\'s TIERS[*].name when no override is set', async () => {
  const db = makeDb();
  const view = await getAdminPlanConfigView(db);
  assert.equal(view.displayLabels.starter, 'Starter');
  assert.equal(view.displayLabels.enterprise, 'Enterprise');
});

// ── updatePlanConfigFields: happy path, validation, conflict, history ──

test('updatePlanConfigFields: happy path seeds from the built-in fallback on a first-ever write, bumps revision to 1, requires changeSummary', async () => {
  const db = makeDb();
  const result = await updatePlanConfigFields(db, { plans: { starter: { basePhotoLimit: 30 } } }, { updatedBy: 'admin@example.com', changeSummary: 'raise starter limit' });
  assert.equal(result.config.plans.starter.basePhotoLimit, 30);
  assert.equal(result.config.revision, 1);
  assert.equal(result.config.status, 'active');
  assert.equal(result.config.updatedBy, 'admin@example.com');
});

test('updatePlanConfigFields: rejects a missing changeSummary', async () => {
  const db = makeDb();
  await assert.rejects(
    () => updatePlanConfigFields(db, { addOnsEnabled: true }, { updatedBy: 'admin@example.com', changeSummary: '' }),
    (err) => err instanceof PlanConfigPatchInvalidError
  );
});

test('updatePlanConfigFields: rejects a malformed patch (negative limit) -- existing active config remains in effect (no partial publication)', async () => {
  const db = makeDb();
  await seedActiveConfig(db, RECOMMENDED_DEFAULT_CONFIG);
  await assert.rejects(
    () => updatePlanConfigFields(db, { plans: { starter: { basePhotoLimit: -5 } } }, { updatedBy: 'admin@example.com', changeSummary: 'bad' }),
    (err) => err instanceof PlanConfigPatchInvalidError
  );
  const doc = (await db.collection('planConfig').doc('active').get()).data();
  assert.deepEqual(doc, RECOMMENDED_DEFAULT_CONFIG, 'the invalid write never landed -- prior active config untouched');
});

test('updatePlanConfigFields: optimistic concurrency -- a stale expectedRevision is rejected with PLAN_CONFIG_CONFLICT, config unchanged', async () => {
  const db = makeDb();
  const first = await updatePlanConfigFields(db, { addOnsEnabled: true }, { updatedBy: 'admin-1', changeSummary: 'enable add-ons' });
  assert.equal(first.config.revision, 1);

  await assert.rejects(
    () => updatePlanConfigFields(db, { addOnsEnabled: false }, { updatedBy: 'admin-2', changeSummary: 'stale attempt', expectedRevision: 0 }),
    (err) => err instanceof PlanConfigConflictError && err.currentRevision === 1
  );
  const doc = (await db.collection('planConfig').doc('active').get()).data();
  assert.equal(doc.addOnsEnabled, true, 'the conflicting write never landed');
});

test('updatePlanConfigFields: a correct expectedRevision succeeds and advances the revision atomically', async () => {
  const db = makeDb();
  const first = await updatePlanConfigFields(db, { addOnsEnabled: true }, { updatedBy: 'admin-1', changeSummary: 'enable' });
  const second = await updatePlanConfigFields(db, { addOnsEnabled: false }, { updatedBy: 'admin-1', changeSummary: 'disable', expectedRevision: first.config.revision });
  assert.equal(second.config.revision, 2);
  assert.equal(second.config.addOnsEnabled, false);
});

test('updatePlanConfigFields: never accepts reportsPerMonth even if smuggled into the plans patch', async () => {
  const db = makeDb();
  await assert.rejects(
    () => updatePlanConfigFields(db, { plans: { starter: { reportsPerMonth: 999, basePhotoLimit: 25 } } }, { updatedBy: 'admin-1', changeSummary: 'try to smuggle' }),
    (err) => err instanceof PlanConfigPatchInvalidError
  );
});

test('updatePlanConfigFields: records a history snapshot of the PREVIOUS config on every real update (not on the very first seed from fallback)', async () => {
  const db = makeDb();
  await updatePlanConfigFields(db, { addOnsEnabled: true }, { updatedBy: 'admin-1', changeSummary: 'first write' });
  let history = await getPlanConfigHistory(db);
  assert.equal(history.length, 0, 'nothing to snapshot yet -- the fallback has no prior Firestore doc');

  await updatePlanConfigFields(db, { addOnsEnabled: false }, { updatedBy: 'admin-1', changeSummary: 'second write' });
  history = await getPlanConfigHistory(db);
  assert.equal(history.length, 1);
  assert.equal(history[0].snapshot.addOnsEnabled, true, 'snapshot captured the value BEFORE this write');
  assert.equal(history[0].changeSummary, 'second write');
  assert.equal(history[0].updatedBy, 'admin-1');
});

// ── rollbackToLegacyPlanConfig: explicit-only ───────────────────────────

test('rollbackToLegacyPlanConfig: applies the flat-100 profile only when explicitly called, requires changeSummary, is history-tracked', async () => {
  const db = makeDb();
  await updatePlanConfigFields(db, { addOnsEnabled: true }, { updatedBy: 'admin-1', changeSummary: 'seed' });
  const result = await rollbackToLegacyPlanConfig(db, { updatedBy: 'admin-1', changeSummary: 'incident response: rollback' });
  assert.equal(result.config.status, 'legacy_rollback');
  assert.equal(result.config.plans.starter.basePhotoLimit, 100);
  assert.equal(result.config.plans.agency.basePhotoLimit, 100, 'flat 100 for every tier, per the legacy profile');
  const history = await getPlanConfigHistory(db);
  assert.equal(history.length, 1);
});

test('rollbackToLegacyPlanConfig: rejects without a changeSummary (never a silent/accidental rollback)', async () => {
  const db = makeDb();
  await assert.rejects(() => rollbackToLegacyPlanConfig(db, { updatedBy: 'admin-1', changeSummary: '' }));
});

test('rollbackToLegacyPlanConfig respects optimistic concurrency too', async () => {
  const db = makeDb();
  const first = await updatePlanConfigFields(db, { addOnsEnabled: true }, { updatedBy: 'admin-1', changeSummary: 'seed' });
  await assert.rejects(
    () => rollbackToLegacyPlanConfig(db, { updatedBy: 'admin-1', changeSummary: 'rollback', expectedRevision: first.config.revision + 5 }),
    (err) => err instanceof PlanConfigConflictError
  );
});

test('a normal (non-rollback) patch can never reach the legacy_rollback status', async () => {
  const db = makeDb();
  const result = await updatePlanConfigFields(db, { plans: { starter: { basePhotoLimit: 26 } } }, { updatedBy: 'admin-1', changeSummary: 'normal edit' });
  assert.equal(result.config.status, 'active');
});
