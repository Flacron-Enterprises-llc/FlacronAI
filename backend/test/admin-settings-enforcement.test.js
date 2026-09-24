const test = require('node:test');
const assert = require('node:assert/strict');

// Admin plan-settings audit: every setting the admin UI can change must be
// one the running system actually enforces, and a setting with no enforced
// behavior (watermarkPolicyEnabled) must not be writable at all.
const { FakeFirestore } = require('./helpers/fakeFirestore');
const {
  ADMIN_EDITABLE_KEYS,
  validatePatchShape,
  mergeAllowedPatch,
  updatePlanConfigFields,
  PlanConfigPatchInvalidError,
} = require('../config/planConfigAdmin');
const {
  RECOMMENDED_DEFAULT_CONFIG,
  resolvePlanContext,
  getPlanConfig,
  invalidatePlanConfigCache,
} = require('../config/planConfig');
const { resolveWatermarkPolicy } = require('../utils/watermarkPolicy');

const makeSeededDb = () => {
  invalidatePlanConfigCache();
  const db = new FakeFirestore();
  db.store.set('planConfig/active', {
    version: 1,
    data: JSON.parse(JSON.stringify({ ...RECOMMENDED_DEFAULT_CONFIG, status: 'active', revision: 1 })),
  });
  return db;
};
const opts = { updatedBy: 'admin@example.com', changeSummary: 'audit test', expectedRevision: 1 };

test('admin-editable settings are exactly the enforced ones', () => {
  assert.deepEqual([...ADMIN_EDITABLE_KEYS].sort(), ['addOnsEnabled', 'displayLabels', 'plans']);
});

test('watermarkPolicyEnabled (no enforced behavior) is rejected by the admin patch validator', () => {
  for (const value of [true, false]) {
    const res = validatePatchShape({ watermarkPolicyEnabled: value });
    assert.equal(res.valid, false);
    assert.match(res.errors.join(' '), /unrecognized field\(s\): watermarkPolicyEnabled/);
  }
});

test('updatePlanConfigFields refuses a watermarkPolicyEnabled write and leaves the stored value untouched', async () => {
  const db = makeSeededDb();
  await assert.rejects(
    () => updatePlanConfigFields(db, { watermarkPolicyEnabled: false }, opts),
    (err) => err instanceof PlanConfigPatchInvalidError
  );
  const { config } = await getPlanConfig(db, { forceRefresh: true });
  assert.equal(config.watermarkPolicyEnabled, true);
});

test('mergeAllowedPatch never copies watermarkPolicyEnabled even if handed one directly', () => {
  const merged = mergeAllowedPatch({ ...RECOMMENDED_DEFAULT_CONFIG, watermarkPolicyEnabled: true }, { watermarkPolicyEnabled: false });
  assert.equal(merged.watermarkPolicyEnabled, true);
});

test('watermark decisions never depend on PlanConfig: DRAFT always applies to un-reviewed reports', () => {
  // resolveWatermarkPolicy only takes review status + the tier flag; there is
  // no PlanConfig input that could switch the mandatory DRAFT mark off.
  for (const tierWatermark of [true, false]) {
    assert.equal(resolveWatermarkPolicy({ reportStatus: 'draft', tierWatermark }).kind, 'draft');
  }
});

test('enforced: an admin basePhotoLimit change is what photo capacity resolves to', async () => {
  const db = makeSeededDb();
  await updatePlanConfigFields(db, { plans: { starter: { basePhotoLimit: 7 } } }, opts);
  invalidatePlanConfigCache();
  const ctx = await resolvePlanContext(db, 'starter', { forceRefresh: true });
  assert.equal(ctx.basePhotoLimit, 7);
  assert.equal(ctx.capacity, 7);
  const pro = await resolvePlanContext(db, 'professional', { forceRefresh: true });
  assert.equal(pro.basePhotoLimit, RECOMMENDED_DEFAULT_CONFIG.plans.professional.basePhotoLimit, 'other plans untouched');
});

test('enforced: an admin "unlimited" basePhotoLimit resolves to unlimited capacity', async () => {
  const db = makeSeededDb();
  await updatePlanConfigFields(db, { plans: { agency: { basePhotoLimit: 'unlimited' } } }, opts);
  const ctx = await resolvePlanContext(db, 'agency', { forceRefresh: true });
  assert.equal(ctx.unlimited, true);
});

test('enforced: addOnsEnabled and displayLabels written by an admin are what the live config returns', async () => {
  const db = makeSeededDb();
  await updatePlanConfigFields(db, { addOnsEnabled: true, displayLabels: { starter: 'Free' } }, opts);
  const { config } = await getPlanConfig(db, { forceRefresh: true });
  assert.equal(config.addOnsEnabled, true);
  assert.equal(config.displayLabels.starter, 'Free');
});
