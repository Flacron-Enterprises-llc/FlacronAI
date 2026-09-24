const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Phase 48. Route-level tests for GET /payment/public-plan-config -- the
// ONE sanitized, no-auth, server-derived read model the public pricing page
// consumes. Mirrors photo-addon-checkout-route.test.js's install pattern.
process.env.PLAN_CONFIG_CACHE_TTL_MS = '0';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const firebaseConfigPath = require.resolve('../config/firebase');
const planConfigPath = require.resolve('../config/planConfig');
const photoAddOnPacksPath = require.resolve('../config/photoAddOnPacks');
const paymentRoutePath = require.resolve('../routes/payment');
const stripePath = require.resolve('stripe');

function installFakes({ planConfigDoc = null } = {}) {
  [firebaseConfigPath, planConfigPath, photoAddOnPacksPath, paymentRoutePath, stripePath].forEach((p) => delete require.cache[p]);

  const db = new FakeFirestore();
  if (planConfigDoc) db.store.set('planConfig/active', { version: 1, data: planConfigDoc });

  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath, filename: firebaseConfigPath, loaded: true,
    exports: {
      getAuth: () => ({ verifyIdToken: async () => { throw new Error('not used by this test'); } }),
      getFirestore: () => db,
      FieldValue: { serverTimestamp: () => new Date().toISOString() },
      Timestamp: {},
      admin: {},
      initFirebase: () => {},
      getBucket: () => {},
    },
  };
  require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true, exports: () => ({}) };

  const router = require('../routes/payment');
  return { router, db };
}

async function withTestServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use('/payment', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}/payment`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const PLAN_CONFIG_CUSTOM = {
  schemaVersion: 1,
  plans: {
    starter: { reportsPerMonth: 5, basePhotoLimit: 25 },
    professional: { reportsPerMonth: 50, basePhotoLimit: 100 },
    agency: { reportsPerMonth: 200, basePhotoLimit: 250 },
    enterprise: { reportsPerMonth: 'unlimited', basePhotoLimit: 'unlimited' },
  },
  addOnsEnabled: true,
  displayLabels: { starter: 'Starter Plan' },
  allowedMimeTypes: ['image/jpeg'],
  maxFileSizeBytes: 10 * 1024 * 1024,
  watermarkPolicyEnabled: true,
  status: 'active',
};

test('GET /public-plan-config: no auth required', async () => {
  const { router } = installFakes();
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/public-plan-config`);
    assert.equal(res.status, 200);
  });
});

test('GET /public-plan-config: built-in fallback (no Firestore doc) reports the accepted mapping 25/100/250/unlimited', async () => {
  const { router } = installFakes();
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/public-plan-config`);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.configSource, 'fallback');
    assert.equal(body.plans.starter.basePhotoLimit, 25);
    assert.equal(body.plans.starter.unlimited, false);
    assert.equal(body.plans.professional.basePhotoLimit, 100);
    assert.equal(body.plans.agency.basePhotoLimit, 250);
    assert.equal(body.plans.enterprise.unlimited, true);
    assert.equal(body.plans.enterprise.basePhotoLimit, null, 'never a numeric value for unlimited');
  });
});

test('GET /public-plan-config: a real Firestore-backed config is reflected, including a display label override', async () => {
  const { router } = installFakes({ planConfigDoc: PLAN_CONFIG_CUSTOM });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/public-plan-config`);
    const body = await res.json();
    assert.equal(body.configSource, 'firestore');
    assert.equal(body.plans.starter.label, 'Starter Plan');
    assert.equal(body.plans.professional.label, 'Professional', 'falls back to tiers.js TIERS name when no override is set');
  });
});

test('GET /public-plan-config: pack catalogue is server-derived, never a scattered client copy -- exact confirmed capacities/prices', async () => {
  const { router } = installFakes({ planConfigDoc: PLAN_CONFIG_CUSTOM });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/public-plan-config`);
    const body = await res.json();
    const byId = Object.fromEntries(body.addOns.packs.map((p) => [p.id, p]));
    assert.equal(byId.photos_25.capacity, 25);
    assert.equal(byId.photos_25.amountCents, 499);
    assert.equal(byId.photos_50.capacity, 50);
    assert.equal(byId.photos_50.amountCents, 799);
    assert.equal(byId.photos_100.capacity, 100);
    assert.equal(byId.photos_100.amountCents, 1299);
    assert.equal(byId.photos_250.capacity, 250);
    assert.equal(byId.photos_250.amountCents, 2499);
    for (const p of Object.values(byId)) assert.equal(p.currency, 'usd');
    assert.equal(body.addOns.reportSpecific, true);
  });
});

test('GET /public-plan-config: never exposes a Stripe Price ID, admin identity, or internal error detail', async () => {
  const { router } = installFakes({ planConfigDoc: PLAN_CONFIG_CUSTOM });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/public-plan-config`);
    const body = await res.json();
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes('price_'), false);
    assert.equal('updatedBy' in body, false);
    assert.equal(serialized.includes('stripePriceId'), false);
  });
});

test('GET /public-plan-config: addOns.enabled false and no configured Price IDs -> checkoutAvailable is false, never claims live purchasing', async () => {
  const { router } = installFakes({ planConfigDoc: { ...PLAN_CONFIG_CUSTOM, addOnsEnabled: false } });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/public-plan-config`);
    const body = await res.json();
    assert.equal(body.addOns.enabled, false);
    assert.equal(body.addOns.checkoutAvailable, false);
    for (const p of body.addOns.packs) assert.equal(p.available, false);
  });
});
