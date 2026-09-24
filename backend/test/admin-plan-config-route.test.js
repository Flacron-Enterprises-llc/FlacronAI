const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Phase 48 (Pricing Page, Admin Configuration UI & Cross-Surface
// Consistency). Route-level tests for the new admin PlanConfig endpoints on
// routes/sales.js, following this repo's established route-test convention
// (photo-addon-checkout-route.test.js): a REAL Express app mounting the
// REAL sales.js router, faking only ../config/firebase (auth + Firestore).
process.env.PLAN_CONFIG_CACHE_TTL_MS = '0';
process.env.ADMIN_EMAIL = 'admin@example.com';
delete process.env.STRIPE_SECRET_KEY;

const firebaseConfigPath = require.resolve('../config/firebase');
const authMiddlewarePath = require.resolve('../middleware/auth');
const planConfigPath = require.resolve('../config/planConfig');
const planConfigAdminPath = require.resolve('../config/planConfigAdmin');
const rateLimitersPath = require.resolve('../middleware/rateLimiters');
const auditLogServicePath = require.resolve('../services/auditLogService');
const salesRoutePath = require.resolve('../routes/sales');

const ADMIN_UID = 'admin-uid-1';
const ADMIN_EMAIL = 'admin@example.com';
const USER_UID = 'user-uid-1';
const USER_EMAIL = 'notadmin@example.com';

function installFakes({ usersById = {}, planConfigDoc = null } = {}) {
  [firebaseConfigPath, authMiddlewarePath, planConfigPath, planConfigAdminPath, rateLimitersPath, auditLogServicePath, salesRoutePath]
    .forEach((p) => delete require.cache[p]);

  const db = new FakeFirestore();
  for (const [uid, data] of Object.entries(usersById)) db.store.set(`users/${uid}`, { version: 1, data });
  if (planConfigDoc) db.store.set('planConfig/active', { version: 1, data: planConfigDoc });

  const auditLogs = [];
  require.cache[auditLogServicePath] = {
    id: auditLogServicePath, filename: auditLogServicePath, loaded: true,
    exports: { recordAuditLog: async (entry) => { auditLogs.push(entry); } },
  };

  // A single fake token->identity map so each test authenticates as either
  // the admin or a normal user by Authorization header value alone.
  const identities = {
    'Bearer admin-token': { uid: ADMIN_UID, email: ADMIN_EMAIL, auth_time: 1700000000, iat: 1700000000 },
    'Bearer user-token': { uid: USER_UID, email: USER_EMAIL, auth_time: 1700000000, iat: 1700000000 },
    'Bearer forged-token': { uid: USER_UID, email: USER_EMAIL, role: 'admin', isAdmin: true, auth_time: 1700000000, iat: 1700000000 },
  };

  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath, filename: firebaseConfigPath, loaded: true,
    exports: {
      getAuth: () => ({
        verifyIdToken: async (token) => {
          const identity = identities[`Bearer ${token}`];
          if (!identity) throw new Error('invalid token');
          return identity;
        },
      }),
      getFirestore: () => db,
      FieldValue: { serverTimestamp: () => new Date().toISOString() },
      Timestamp: {},
      admin: {},
      initFirebase: () => {},
      getBucket: () => {},
    },
  };

  const router = require('../routes/sales');
  return { router, db, auditLogs };
}

async function withTestServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use('/sales', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}/sales`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function getJson(base, path, token) {
  const res = await fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { res, body: await res.json() };
}
async function putJson(base, path, token, payload) {
  const res = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  return { res, body: await res.json() };
}
async function postJson(base, path, token, payload) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  return { res, body: await res.json() };
}

const usersFixture = {
  [ADMIN_UID]: { email: ADMIN_EMAIL, tier: 'enterprise' },
  [USER_UID]: { email: USER_EMAIL, tier: 'starter' },
};

test('GET /admin/plan-config: unauthenticated request rejected', async () => {
  const { router } = installFakes({ usersById: usersFixture });
  await withTestServer(router, async (base) => {
    const { res } = await getJson(base, '/admin/plan-config');
    assert.equal(res.status, 401);
  });
});

test('GET /admin/plan-config: normal authenticated user rejected (ADMIN_REQUIRED)', async () => {
  const { router } = installFakes({ usersById: usersFixture });
  await withTestServer(router, async (base) => {
    const { res, body } = await getJson(base, '/admin/plan-config', 'user-token');
    assert.equal(res.status, 403);
    assert.equal(body.code, 'ADMIN_REQUIRED');
    assert.equal(body.success, false);
  });
});

test('GET /admin/plan-config: a forged client-side admin role/claim on a non-admin email is still rejected -- authorization is server-side email match only', async () => {
  const { router } = installFakes({ usersById: usersFixture });
  await withTestServer(router, async (base) => {
    const { res, body } = await getJson(base, '/admin/plan-config', 'forged-token');
    assert.equal(res.status, 403);
    assert.equal(body.code, 'ADMIN_REQUIRED');
  });
});

test('GET /admin/plan-config: admin read allowed, returns revision/source/config', async () => {
  const { router } = installFakes({ usersById: usersFixture });
  await withTestServer(router, async (base) => {
    const { res, body } = await getJson(base, '/admin/plan-config', 'admin-token');
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.source, 'fallback');
    assert.equal(body.revision, 0);
    assert.equal(body.config.plans.starter.basePhotoLimit, 25);
  });
});

test('PUT /admin/plan-config: admin write allowed, standard envelope, audit-logged', async () => {
  const { router, auditLogs } = installFakes({ usersById: usersFixture });
  await withTestServer(router, async (base) => {
    const { res, body } = await putJson(base, '/admin/plan-config', 'admin-token', {
      patch: { plans: { starter: { basePhotoLimit: 30 } } },
      changeSummary: 'raise starter limit for a promo',
    });
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.config.plans.starter.basePhotoLimit, 30);
    assert.equal(body.config.revision, 1);

    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, 'admin_plan_config_update');
    assert.equal(auditLogs[0].actorEmail, ADMIN_EMAIL);
  });
});

test('PUT /admin/plan-config: normal user write rejected', async () => {
  const { router } = installFakes({ usersById: usersFixture });
  await withTestServer(router, async (base) => {
    const { res } = await putJson(base, '/admin/plan-config', 'user-token', {
      patch: { addOnsEnabled: true },
      changeSummary: 'try to enable',
    });
    assert.equal(res.status, 403);
  });
});

test('PUT /admin/plan-config: missing changeSummary rejected (VALIDATION_ERROR envelope)', async () => {
  const { router } = installFakes({ usersById: usersFixture });
  await withTestServer(router, async (base) => {
    const { res, body } = await putJson(base, '/admin/plan-config', 'admin-token', { patch: { addOnsEnabled: true } });
    assert.equal(res.status, 400);
    assert.equal(body.code, 'VALIDATION_ERROR');
  });
});

test('PUT /admin/plan-config: reportsPerMonth in the patch is rejected outright, not silently dropped', async () => {
  const { router } = installFakes({ usersById: usersFixture });
  await withTestServer(router, async (base) => {
    const { res, body } = await putJson(base, '/admin/plan-config', 'admin-token', {
      patch: { plans: { starter: { reportsPerMonth: 999 } } },
      changeSummary: 'try to smuggle a report limit change',
    });
    assert.equal(res.status, 400);
    assert.equal(body.code, 'INVALID_PLAN_CONFIG_PATCH');
  });
});

test('PUT /admin/plan-config: stale expectedRevision yields 409 with currentRevision, config left untouched', async () => {
  const { router, db } = installFakes({ usersById: usersFixture });
  await withTestServer(router, async (base) => {
    await putJson(base, '/admin/plan-config', 'admin-token', { patch: { addOnsEnabled: true }, changeSummary: 'first' });
    const { res, body } = await putJson(base, '/admin/plan-config', 'admin-token', {
      patch: { addOnsEnabled: false },
      changeSummary: 'stale',
      expectedRevision: 0,
    });
    assert.equal(res.status, 409);
    assert.equal(body.code, 'PLAN_CONFIG_CONFLICT');
    assert.equal(body.currentRevision, 1);
    const doc = (await db.collection('planConfig').doc('active').get()).data();
    assert.equal(doc.addOnsEnabled, true);
  });
});

test('POST /admin/plan-config/legacy-rollback: requires confirm:true, applies flat-100 profile, audit-logged distinctly', async () => {
  const { router, auditLogs } = installFakes({ usersById: usersFixture });
  await withTestServer(router, async (base) => {
    const noConfirm = await postJson(base, '/admin/plan-config/legacy-rollback', 'admin-token', { changeSummary: 'incident' });
    assert.equal(noConfirm.res.status, 400);

    const { res, body } = await postJson(base, '/admin/plan-config/legacy-rollback', 'admin-token', { changeSummary: 'incident response', confirm: 'true' });
    assert.equal(res.status, 200);
    assert.equal(body.config.status, 'legacy_rollback');
    assert.equal(body.config.plans.agency.basePhotoLimit, 100);

    assert.ok(auditLogs.some((e) => e.action === 'admin_plan_config_legacy_rollback'));
  });
});

test('GET /admin/plan-config/history: admin-only, reflects prior writes', async () => {
  const { router } = installFakes({ usersById: usersFixture });
  await withTestServer(router, async (base) => {
    await putJson(base, '/admin/plan-config', 'admin-token', { patch: { addOnsEnabled: true }, changeSummary: 'first' });
    await putJson(base, '/admin/plan-config', 'admin-token', { patch: { addOnsEnabled: false }, changeSummary: 'second', expectedRevision: 1 });
    const { res, body } = await getJson(base, '/admin/plan-config/history', 'admin-token');
    assert.equal(res.status, 200);
    assert.equal(body.history.length, 1, 'one prior real config existed to snapshot');
    assert.equal(body.history[0].changeSummary, 'second');
  });
});

test('GET /admin/photo-packs: admin-only, read-only detail, never a Stripe Price ID value', async () => {
  const { router } = installFakes({ usersById: usersFixture });
  await withTestServer(router, async (base) => {
    const denied = await getJson(base, '/admin/photo-packs', 'user-token');
    assert.equal(denied.res.status, 403);

    const { res, body } = await getJson(base, '/admin/photo-packs', 'admin-token');
    assert.equal(res.status, 200);
    assert.equal(body.packs.length, 4);
    const byId = Object.fromEntries(body.packs.map((p) => [p.id, p]));
    assert.equal(byId.photos_25.capacity, 25);
    assert.equal(byId.photos_25.amountCents, 499);
    assert.equal(byId.photos_100.capacity, 100);
    assert.equal(byId.photos_100.amountCents, 1299);
    for (const p of body.packs) {
      assert.equal('stripePriceId' in p, false);
      assert.ok(['configured', 'not_configured'].includes(p.priceIdStatus.test));
      assert.ok(['configured', 'not_configured'].includes(p.priceIdStatus.live));
    }
  });
});

test('GET /admin/integration-status: admin-only, booleans/status enums only, no secret values', async () => {
  process.env.OPENAI_API_KEY = 'sk-should-never-appear';
  const { router } = installFakes({ usersById: usersFixture });
  await withTestServer(router, async (base) => {
    const denied = await getJson(base, '/admin/integration-status', 'user-token');
    assert.equal(denied.res.status, 403);

    const { res, body } = await getJson(base, '/admin/integration-status', 'admin-token');
    assert.equal(res.status, 200);
    assert.equal(body.integrations.openaiPricing.configured, true);
    assert.equal(body.integrations.openaiPricing.status, 'live_validation_pending');
    assert.equal(JSON.stringify(body).includes('should-never-appear'), false);
  });
  delete process.env.OPENAI_API_KEY;
});
