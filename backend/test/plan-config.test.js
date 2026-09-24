const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validatePlanConfig,
  getPlanConfig,
  setPlanConfig,
  applyLegacyRollbackConfig,
  getPlanLimits,
  resolveEffectivePhotoCapacity,
  resolvePlanContext,
  invalidatePlanConfigCache,
  FALLBACK_CONFIG,
  RECOMMENDED_DEFAULT_CONFIG,
  LEGACY_ROLLBACK_CONFIG,
  UNLIMITED,
  PLAN_IDS,
  SCHEMA_VERSION,
} = require('../config/planConfig');

// Minimal fake Firestore -- a single doc at planConfig/active, no
// transactions needed (PlanConfig reads/writes a single document, not a
// contended array like the photo-capacity routes).
class SingleDocFakeDb {
  constructor(initial = null) {
    this.doc = initial ? { ...initial } : null;
    this.getCalls = 0;
  }
  collection(name) {
    if (name !== 'planConfig') throw new Error(`unexpected collection ${name}`);
    const self = this;
    return {
      doc: () => ({
        get: async () => {
          self.getCalls += 1;
          return { exists: !!self.doc, data: () => self.doc };
        },
        set: async (data) => {
          self.doc = data;
        },
      }),
    };
  }
}

test.beforeEach(() => invalidatePlanConfigCache());

// ── validatePlanConfig ──────────────────────────────────────────────────

test('validatePlanConfig accepts the recommended default config', () => {
  const { valid, errors } = validatePlanConfig(RECOMMENDED_DEFAULT_CONFIG);
  assert.equal(valid, true, JSON.stringify(errors));
});

test('validatePlanConfig accepts the fallback config too', () => {
  const { valid } = validatePlanConfig(FALLBACK_CONFIG);
  assert.equal(valid, true);
});

test('validatePlanConfig rejects an unrecognized plan id', () => {
  const bad = { ...RECOMMENDED_DEFAULT_CONFIG, plans: { ...RECOMMENDED_DEFAULT_CONFIG.plans, gold: { reportsPerMonth: 10, basePhotoLimit: 10 } } };
  const { valid, errors } = validatePlanConfig(bad);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('unrecognized plan id')));
});

test('validatePlanConfig rejects a missing plan id', () => {
  const { starter: _starter, ...rest } = RECOMMENDED_DEFAULT_CONFIG.plans;
  const bad = { ...RECOMMENDED_DEFAULT_CONFIG, plans: rest };
  const { valid, errors } = validatePlanConfig(bad);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('missing plan id')));
});

test('validatePlanConfig rejects a negative basePhotoLimit', () => {
  const bad = { ...RECOMMENDED_DEFAULT_CONFIG, plans: { ...RECOMMENDED_DEFAULT_CONFIG.plans, starter: { reportsPerMonth: 5, basePhotoLimit: -1 } } };
  assert.equal(validatePlanConfig(bad).valid, false);
});

test('validatePlanConfig rejects a non-integer (fractional) limit', () => {
  const bad = { ...RECOMMENDED_DEFAULT_CONFIG, plans: { ...RECOMMENDED_DEFAULT_CONFIG.plans, starter: { reportsPerMonth: 5, basePhotoLimit: 25.5 } } };
  assert.equal(validatePlanConfig(bad).valid, false);
});

test('validatePlanConfig rejects a string-number instead of a real number ("25" !== 25) -- no NaN/string-number ambiguity', () => {
  const bad = { ...RECOMMENDED_DEFAULT_CONFIG, plans: { ...RECOMMENDED_DEFAULT_CONFIG.plans, starter: { reportsPerMonth: 5, basePhotoLimit: '25' } } };
  assert.equal(validatePlanConfig(bad).valid, false);
});

test('validatePlanConfig rejects NaN outright', () => {
  const bad = { ...RECOMMENDED_DEFAULT_CONFIG, plans: { ...RECOMMENDED_DEFAULT_CONFIG.plans, starter: { reportsPerMonth: 5, basePhotoLimit: NaN } } };
  assert.equal(validatePlanConfig(bad).valid, false);
});

test('validatePlanConfig accepts the explicit "unlimited" string, never a magic number like -1', () => {
  const ok = { ...RECOMMENDED_DEFAULT_CONFIG, plans: { ...RECOMMENDED_DEFAULT_CONFIG.plans, starter: { reportsPerMonth: 5, basePhotoLimit: UNLIMITED } } };
  assert.equal(validatePlanConfig(ok).valid, true);
  const bad = { ...RECOMMENDED_DEFAULT_CONFIG, plans: { ...RECOMMENDED_DEFAULT_CONFIG.plans, starter: { reportsPerMonth: 5, basePhotoLimit: -1 } } };
  assert.equal(validatePlanConfig(bad).valid, false, '-1 is never treated as unlimited');
});

test('validatePlanConfig rejects an unsupported schemaVersion', () => {
  const bad = { ...RECOMMENDED_DEFAULT_CONFIG, schemaVersion: 999 };
  assert.equal(validatePlanConfig(bad).valid, false);
});

test('validatePlanConfig rejects invalid MIME/size constraints', () => {
  assert.equal(validatePlanConfig({ ...RECOMMENDED_DEFAULT_CONFIG, allowedMimeTypes: [] }).valid, false);
  assert.equal(validatePlanConfig({ ...RECOMMENDED_DEFAULT_CONFIG, maxFileSizeBytes: 0 }).valid, false);
  assert.equal(validatePlanConfig({ ...RECOMMENDED_DEFAULT_CONFIG, maxFileSizeBytes: -5 }).valid, false);
});

test('validatePlanConfig rejects a negative addOnPackPrices entry', () => {
  const bad = { ...RECOMMENDED_DEFAULT_CONFIG, addOnPackPrices: { pack25: -5 } };
  assert.equal(validatePlanConfig(bad).valid, false);
});

test('validatePlanConfig: no duplicate plans is guaranteed by the object shape itself (a JS object cannot hold two "starter" keys)', () => {
  // Constructing this is itself proof: the second `starter:` key below simply
  // overwrites the first at parse time, so there both is and can only ever
  // be one -- validated normally, which passes.
  const cfg = { ...RECOMMENDED_DEFAULT_CONFIG, plans: { ...RECOMMENDED_DEFAULT_CONFIG.plans, starter: { reportsPerMonth: 5, basePhotoLimit: 25 } } };
  assert.equal(Object.keys(cfg.plans).filter((k) => k === 'starter').length, 1);
  assert.equal(validatePlanConfig(cfg).valid, true);
});

// ── getPlanConfig: fallback / caching / invalidation ────────────────────

test('getPlanConfig falls back to FALLBACK_CONFIG when the document does not exist -- resolves to the ACCEPTED mapping (25/100/250/unlimited), never the old flat-100 behavior, and never fails closed into unlimited', async () => {
  const db = new SingleDocFakeDb(null);
  const { config, source, errors } = await getPlanConfig(db);
  assert.equal(source, 'fallback');
  assert.equal(config, FALLBACK_CONFIG);
  assert.equal(config.plans.starter.basePhotoLimit, 25, 'a normal deployment with no seeded doc yet must enforce Starter=25, not the legacy flat 100');
  assert.equal(config.plans.professional.basePhotoLimit, 100);
  assert.equal(config.plans.agency.basePhotoLimit, 250);
  assert.equal(config.plans.enterprise.basePhotoLimit, UNLIMITED);
  assert.ok(errors.length > 0);
});

test('getPlanConfig falls back when the stored document is malformed (fails validation) -- to the accepted mapping, never expanding Starter or granting unlimited', async () => {
  const db = new SingleDocFakeDb({ schemaVersion: 1, plans: { starter: { reportsPerMonth: 5, basePhotoLimit: -5 } } });
  const { config, source } = await getPlanConfig(db);
  assert.equal(source, 'fallback');
  assert.equal(config, FALLBACK_CONFIG);
  assert.equal(config.plans.starter.basePhotoLimit, 25);
});

test('getPlanConfig falls back (never throws) when the underlying read itself throws -- to the accepted mapping', async () => {
  const db = { collection: () => ({ doc: () => ({ get: async () => { throw new Error('firestore is down'); } }) }) };
  const { config, source, errors } = await getPlanConfig(db);
  assert.equal(source, 'fallback');
  assert.equal(config, FALLBACK_CONFIG);
  assert.equal(config.plans.starter.basePhotoLimit, 25);
  assert.ok(errors[0].includes('read failed'));
});

test('getPlanConfig falls back to the accepted mapping on an unsupported schemaVersion, never trusting an unversioned/future/past document\'s limits', async () => {
  const db = new SingleDocFakeDb({ ...RECOMMENDED_DEFAULT_CONFIG, schemaVersion: 999 });
  const { config, source, errors } = await getPlanConfig(db);
  assert.equal(source, 'fallback');
  assert.equal(config.plans.starter.basePhotoLimit, 25);
  assert.ok(errors.some((e) => e.includes('schemaVersion')));
});

test('invalid config can never expand Starter beyond the trusted built-in default (25), even when the malformed doc tries to claim 100', async () => {
  const db = new SingleDocFakeDb({
    schemaVersion: SCHEMA_VERSION,
    plans: {
      starter: { reportsPerMonth: 5, basePhotoLimit: 100 }, // attempted expansion
      professional: { reportsPerMonth: 50, basePhotoLimit: 100 },
      agency: { reportsPerMonth: 200, basePhotoLimit: 250 },
      // missing "enterprise" -> whole document invalid
    },
  });
  const { config, source } = await getPlanConfig(db);
  assert.equal(source, 'fallback');
  assert.equal(config.plans.starter.basePhotoLimit, 25, 'the attempted 100 must never take effect -- an invalid doc fails closed to the trusted default, not partial trust');
});

test('invalid config can never grant unlimited via a malformed representation (e.g. -1 instead of the explicit "unlimited" string)', async () => {
  const db = new SingleDocFakeDb({
    ...RECOMMENDED_DEFAULT_CONFIG,
    plans: { ...RECOMMENDED_DEFAULT_CONFIG.plans, starter: { reportsPerMonth: 5, basePhotoLimit: -1 } },
  });
  const { config, source, errors } = await getPlanConfig(db);
  assert.equal(source, 'fallback');
  assert.equal(config.plans.starter.basePhotoLimit, 25, 'never Infinity/unlimited, and never the raw -1');
  assert.ok(errors.length > 0);
});

test('applyLegacyRollbackConfig is the ONLY way the old flat-100 profile reaches planConfig/active -- never automatic', async () => {
  const db = new SingleDocFakeDb(null);
  // Before any explicit rollback, a missing doc already resolves to the
  // accepted mapping (asserted above) -- confirm the legacy profile is inert
  // until deliberately applied.
  await applyLegacyRollbackConfig(db, { updatedBy: 'ops-incident-1' });
  const { config, source } = await getPlanConfig(db, { forceRefresh: true });
  assert.equal(source, 'firestore', 'now genuinely persisted, not the built-in fallback');
  assert.equal(config.plans.starter.basePhotoLimit, 100, 'the deliberately-applied legacy rollback is flat 100');
  assert.equal(config.status, 'legacy_rollback');
});

test('LEGACY_ROLLBACK_CONFIG itself validates (it is a real, usable profile, just never automatic)', () => {
  assert.equal(validatePlanConfig(LEGACY_ROLLBACK_CONFIG).valid, true);
});

test('seed payload (RECOMMENDED_DEFAULT_CONFIG) is valid and re-seeding is idempotent -- same values, only updatedAt/updatedBy change', async () => {
  const db = new SingleDocFakeDb(null);
  assert.equal(validatePlanConfig(RECOMMENDED_DEFAULT_CONFIG).valid, true);
  const first = await setPlanConfig(db, RECOMMENDED_DEFAULT_CONFIG, { updatedBy: 'seed-run-1', now: () => new Date('2026-01-01T00:00:00Z') });
  const second = await setPlanConfig(db, RECOMMENDED_DEFAULT_CONFIG, { updatedBy: 'seed-run-2', now: () => new Date('2026-01-02T00:00:00Z') });
  assert.deepEqual(second.plans, first.plans, 'rerunning the seed never mutates the plan limits');
  assert.equal(second.createdAt, first.createdAt, 'idempotent -- createdAt is not reset by a rerun');
  assert.notEqual(second.updatedAt, first.updatedAt);
});

test('getPlanConfig acceptance: a validly populated document is read as-is, with the REAL configured values (25/100/250/unlimited)', async () => {
  const db = new SingleDocFakeDb(RECOMMENDED_DEFAULT_CONFIG);
  const { config, source } = await getPlanConfig(db);
  assert.equal(source, 'firestore');
  assert.equal(config.plans.starter.basePhotoLimit, 25);
  assert.equal(config.plans.professional.basePhotoLimit, 100);
  assert.equal(config.plans.agency.basePhotoLimit, 250);
  assert.equal(config.plans.enterprise.basePhotoLimit, UNLIMITED);
});

test('getPlanConfig caches within the TTL -- a second call inside the window does not re-read Firestore', async () => {
  const db = new SingleDocFakeDb(RECOMMENDED_DEFAULT_CONFIG);
  let now = 1000;
  await getPlanConfig(db, { now: () => now, ttlMs: 60_000 });
  assert.equal(db.getCalls, 1);
  now += 30_000;
  await getPlanConfig(db, { now: () => now, ttlMs: 60_000 });
  assert.equal(db.getCalls, 1, 'still within the TTL window, no re-read');
  now += 40_000; // past the 60s TTL from the first read
  await getPlanConfig(db, { now: () => now, ttlMs: 60_000 });
  assert.equal(db.getCalls, 2, 'TTL lapsed, re-read happened');
});

test('setPlanConfig invalidates the cache immediately -- the very next read sees the new value, not a stale cached one', async () => {
  const db = new SingleDocFakeDb(RECOMMENDED_DEFAULT_CONFIG);
  const now = () => 1000;
  await getPlanConfig(db, { now, ttlMs: 60_000 });
  assert.equal((await getPlanConfig(db, { now, ttlMs: 60_000 })).config.plans.starter.basePhotoLimit, 25);

  const updated = { ...RECOMMENDED_DEFAULT_CONFIG, plans: { ...RECOMMENDED_DEFAULT_CONFIG.plans, starter: { reportsPerMonth: 5, basePhotoLimit: 30 } } };
  await setPlanConfig(db, updated, { updatedBy: 'admin-1' });

  const { config } = await getPlanConfig(db, { now, ttlMs: 60_000 });
  assert.equal(config.plans.starter.basePhotoLimit, 30, 'write took effect on the very next read despite still being inside the old TTL window');
});

test('setPlanConfig rejects an invalid config outright (validated write path) and never persists it', async () => {
  const db = new SingleDocFakeDb(RECOMMENDED_DEFAULT_CONFIG);
  await assert.rejects(
    () => setPlanConfig(db, { ...RECOMMENDED_DEFAULT_CONFIG, maxFileSizeBytes: -1 }),
    (err) => err.code === 'INVALID_PLAN_CONFIG'
  );
  const { config } = await getPlanConfig(db, { forceRefresh: true });
  assert.equal(config.maxFileSizeBytes, RECOMMENDED_DEFAULT_CONFIG.maxFileSizeBytes, 'the invalid write never landed');
});

test('setPlanConfig preserves createdAt across an update, stamps updatedAt/updatedBy', async () => {
  const db = new SingleDocFakeDb(null);
  const first = await setPlanConfig(db, RECOMMENDED_DEFAULT_CONFIG, { updatedBy: 'admin-1', now: () => new Date('2026-01-01T00:00:00Z') });
  const second = await setPlanConfig(db, RECOMMENDED_DEFAULT_CONFIG, { updatedBy: 'admin-2', now: () => new Date('2026-06-01T00:00:00Z') });
  assert.equal(second.createdAt, first.createdAt);
  assert.equal(second.updatedBy, 'admin-2');
  assert.notEqual(second.updatedAt, first.updatedAt);
});

// ── getPlanLimits / resolveEffectivePhotoCapacity / resolvePlanContext ──

test('getPlanLimits resolves each of the 4 canonical tiers to their own limits', () => {
  for (const id of PLAN_IDS) {
    const limits = getPlanLimits(RECOMMENDED_DEFAULT_CONFIG, id);
    assert.ok(limits, id);
  }
});

test('getPlanLimits falls back to starter for an unrecognized plan id (never throws, never grants a random tier\'s limit)', () => {
  const limits = getPlanLimits(RECOMMENDED_DEFAULT_CONFIG, 'nonexistent-plan');
  assert.equal(limits.basePhotoLimit, 25);
});

test('resolveEffectivePhotoCapacity: unlimited stays unlimited regardless of add-on', () => {
  const { capacity, unlimited } = resolveEffectivePhotoCapacity({ basePhotoLimit: UNLIMITED, verifiedAddOnCapacity: 500 });
  assert.equal(unlimited, true);
  assert.equal(capacity, Infinity);
});

test('resolveEffectivePhotoCapacity: base + verified add-on (zero add-on is the Phase-44 default)', () => {
  assert.deepEqual(resolveEffectivePhotoCapacity({ basePhotoLimit: 25 }), { capacity: 25, unlimited: false });
  assert.deepEqual(resolveEffectivePhotoCapacity({ basePhotoLimit: 25, verifiedAddOnCapacity: 50 }), { capacity: 75, unlimited: false });
});

test('resolveEffectivePhotoCapacity: a negative/non-finite add-on is treated as zero, never subtracted or NaN-poisoned', () => {
  assert.equal(resolveEffectivePhotoCapacity({ basePhotoLimit: 25, verifiedAddOnCapacity: -10 }).capacity, 25);
  assert.equal(resolveEffectivePhotoCapacity({ basePhotoLimit: 25, verifiedAddOnCapacity: NaN }).capacity, 25);
  assert.equal(resolveEffectivePhotoCapacity({ basePhotoLimit: 25, verifiedAddOnCapacity: Infinity }).capacity, 25);
});

test('resolvePlanContext: maps each real tier to the change-request values (25/100/250/unlimited) once PlanConfig is populated', async () => {
  const db = new SingleDocFakeDb(RECOMMENDED_DEFAULT_CONFIG);
  const expectations = { starter: 25, professional: 100, agency: 250 };
  for (const [tier, expected] of Object.entries(expectations)) {
    const ctx = await resolvePlanContext(db, tier);
    assert.equal(ctx.capacity, expected, tier);
    assert.equal(ctx.unlimited, false, tier);
  }
  const ent = await resolvePlanContext(db, 'enterprise');
  assert.equal(ent.unlimited, true);
  assert.equal(ent.capacity, Infinity);
  assert.equal(ent.reportsPerMonth, -1, 'preserves tiers.js\'s own existing -1 sentinel contract for canGenerate()');
});

test('resolvePlanContext: an annual price-key tier name (e.g. professional_annual) resolves to its base plan\'s limits', async () => {
  const db = new SingleDocFakeDb(RECOMMENDED_DEFAULT_CONFIG);
  const ctx = await resolvePlanContext(db, 'professional_annual');
  assert.equal(ctx.planId, 'professional');
  assert.equal(ctx.capacity, 100);
});

test('resolvePlanContext: verifiedAddOnCapacity defaults to 0 -- a caller that never explicitly passes real, server-verified add-on data gets none', async () => {
  const db = new SingleDocFakeDb(RECOMMENDED_DEFAULT_CONFIG);
  const ctx = await resolvePlanContext(db, 'starter');
  assert.equal(ctx.verifiedAddOnCapacity, 0);
  assert.equal(ctx.capacity, 25);
});

test('resolvePlanContext: an unrecognized/garbage tier name never grants an elevated plan -- falls back to starter', async () => {
  const db = new SingleDocFakeDb(RECOMMENDED_DEFAULT_CONFIG);
  const ctx = await resolvePlanContext(db, 'super-mega-plan-i-made-up');
  assert.equal(ctx.planId, 'starter');
  assert.equal(ctx.capacity, 25);
});

test('resolvePlanContext: safe-fallback path (no PlanConfig doc) enforces the ACCEPTED mapping (25/100/250/unlimited), not the old flat-100 -- reportsPerMonth is untouched by this correction', async () => {
  const db = new SingleDocFakeDb(null);
  const starter = await resolvePlanContext(db, 'starter');
  const professional = await resolvePlanContext(db, 'professional');
  const agency = await resolvePlanContext(db, 'agency');
  const enterprise = await resolvePlanContext(db, 'enterprise');
  assert.equal(starter.capacity, 25);
  assert.equal(starter.reportsPerMonth, 5, 'reportsPerMonth is an unrelated entitlement -- unchanged by this correction');
  assert.equal(professional.capacity, 100);
  assert.equal(professional.reportsPerMonth, 50);
  assert.equal(agency.capacity, 250);
  assert.equal(enterprise.unlimited, true);
  assert.equal(starter.configSource, 'fallback');
});
