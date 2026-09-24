const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Phase 45 (Stripe Report-Specific Photo Add-Ons). Route-level tests for
// POST /payment/photo-pack-checkout and GET /payment/photo-packs, following
// this repo's established route-test convention (pricing-route.test.js,
// photo-capacity-route.test.js): a REAL Express app mounting the REAL
// payment.js router, faking only ../config/firebase (auth + Firestore) and
// the `stripe` package itself (no real network calls in the normal suite).
process.env.PLAN_CONFIG_CACHE_TTL_MS = '0';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_PRICE_PHOTOS_25_TEST = 'price_test_photos25';
process.env.STRIPE_PRICE_PHOTOS_50_TEST = 'price_test_photos50';
process.env.STRIPE_PRICE_PHOTOS_100_TEST = '';
process.env.STRIPE_PRICE_PHOTOS_250_TEST = '';
process.env.FRONTEND_URL = 'https://app.example.test';

const firebaseConfigPath = require.resolve('../config/firebase');
const authMiddlewarePath = require.resolve('../middleware/auth');
const tiersPath = require.resolve('../config/tiers');
const planConfigPath = require.resolve('../config/planConfig');
const photoAddOnPacksPath = require.resolve('../config/photoAddOnPacks');
const photoAddOnPurchasesPath = require.resolve('../utils/photoAddOnPurchases');
const rateLimitersPath = require.resolve('../middleware/rateLimiters');
const paymentRoutePath = require.resolve('../routes/payment');
const stripePath = require.resolve('stripe');

const TEST_UID = 'photo-addon-uid';
const TEST_EMAIL = 'photo-addon@example.com';

function makeFakeStripe(overrides = {}) {
  const calls = { sessionsCreate: [], sessionsRetrieve: [] };
  return {
    calls,
    checkout: {
      sessions: {
        create: async (params, options) => {
          calls.sessionsCreate.push({ params, options });
          if (overrides.sessionCreateShouldFail) throw new Error(overrides.sessionCreateError || 'stripe unavailable');
          return overrides.sessionCreateResult || { id: 'cs_test_mock', url: 'https://stripe.test/pay/cs_test_mock' };
        },
        retrieve: async (id) => {
          calls.sessionsRetrieve.push(id);
          return overrides.sessionRetrieveResult ? overrides.sessionRetrieveResult(id) : { id, status: 'open', payment_status: 'unpaid' };
        },
      },
    },
    paymentIntents: { retrieve: async (id) => (overrides.paymentIntentRetrieveResult ? overrides.paymentIntentRetrieveResult(id) : { id, metadata: {} }) },
    webhooks: { constructEvent: overrides.constructEvent || ((body) => JSON.parse(body.toString())) },
    subscriptions: { list: async () => ({ data: [] }), retrieve: async () => ({}), update: async () => ({}) },
    subscriptionSchedules: { retrieve: async () => ({}), create: async () => ({}), update: async () => ({}) },
    customers: { create: async () => ({ id: 'cus_fake' }) },
    invoices: { list: async () => ({ data: [] }) },
  };
}

function installFakes({ usersById = {}, reportsSeed = {}, planConfigDoc = null, stripeOverrides = {} } = {}) {
  [
    firebaseConfigPath, authMiddlewarePath, tiersPath, planConfigPath,
    photoAddOnPacksPath, photoAddOnPurchasesPath, rateLimitersPath, paymentRoutePath, stripePath,
  ].forEach((p) => delete require.cache[p]);

  const db = new FakeFirestore();
  for (const [uid, data] of Object.entries(usersById)) db.store.set(`users/${uid}`, { version: 1, data });
  for (const [id, data] of Object.entries(reportsSeed)) db.store.set(`reports/${id}`, { version: 1, data });
  if (planConfigDoc) db.store.set('planConfig/active', { version: 1, data: planConfigDoc });

  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath, filename: firebaseConfigPath, loaded: true,
    exports: {
      getAuth: () => ({ verifyIdToken: async () => ({ uid: TEST_UID, email: TEST_EMAIL, auth_time: 1700000000, iat: 1700000000 }) }),
      getFirestore: () => db,
      FieldValue: { serverTimestamp: () => new Date().toISOString() },
      Timestamp: {},
      admin: {},
      initFirebase: () => {},
      getBucket: () => {},
    },
  };

  const fakeStripe = makeFakeStripe(stripeOverrides);
  require.cache[stripePath] = {
    id: stripePath, filename: stripePath, loaded: true,
    exports: () => fakeStripe,
  };

  const router = require('../routes/payment');
  return { router, db, fakeStripe };
}

async function withTestServer(router, fn) {
  const app = express();
  app.use('/payment/webhook', express.raw({ type: 'application/json' }));
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

const seedReport = (overrides = {}) => ({ id: 'report-1', userId: TEST_UID, status: 'draft', photos: [], ...overrides });

const PLAN_CONFIG_ADDONS_ON = {
  schemaVersion: 1,
  plans: {
    starter: { reportsPerMonth: 5, basePhotoLimit: 25 },
    professional: { reportsPerMonth: 50, basePhotoLimit: 100 },
    agency: { reportsPerMonth: 200, basePhotoLimit: 250 },
    enterprise: { reportsPerMonth: 'unlimited', basePhotoLimit: 'unlimited' },
  },
  addOnsEnabled: true,
  allowedMimeTypes: ['image/jpeg'],
  maxFileSizeBytes: 10 * 1024 * 1024,
  watermarkPolicyEnabled: true,
  status: 'active',
};

const PLAN_CONFIG_ADDONS_OFF = { ...PLAN_CONFIG_ADDONS_ON, addOnsEnabled: false };

async function postJson(base, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer faketoken', 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json();
  return { res, body: json };
}

async function getJson(base, path) {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: 'Bearer faketoken' } });
  const json = await res.json();
  return { res, body: json };
}

test('GET /photo-packs: sanitized catalogue, never leaks Price IDs, reflects availability per env-configured pack', async () => {
  const { router } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    planConfigDoc: PLAN_CONFIG_ADDONS_ON,
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await getJson(base, '/photo-packs');
    assert.equal(res.status, 200);
    assert.equal(body.enabled, true);
    assert.equal(body.packs.length, 4);
    const byId = Object.fromEntries(body.packs.map((p) => [p.id, p]));
    assert.equal(byId.photos_25.available, true, 'configured test Price ID -> available');
    assert.equal(byId.photos_100.available, false, 'no test Price ID configured -> unavailable, but still listed');
    for (const p of body.packs) assert.equal('stripePriceId' in p, false);
  });
});

test('POST /photo-pack-checkout: happy path creates an intent, a Stripe session with the trusted Price ID only, and returns a safe minimal response', async () => {
  const { router, db, fakeStripe } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: { 'report-1': seedReport() },
    planConfigDoc: PLAN_CONFIG_ADDONS_ON,
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postJson(base, '/photo-pack-checkout', { reportId: 'report-1', packId: 'photos_25' });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.ok(body.checkoutIntentId);
    assert.equal(body.url, 'https://stripe.test/pay/cs_test_mock');
    assert.equal('priceId' in body, false);
    assert.equal('amountCents' in body, false);

    assert.equal(fakeStripe.calls.sessionsCreate.length, 1);
    const [{ params, options }] = fakeStripe.calls.sessionsCreate;
    assert.equal(params.line_items[0].price, 'price_test_photos25', 'the SERVER-resolved trusted Price ID, not anything client-supplied');
    assert.equal(params.mode, 'payment');
    assert.equal(params.success_url.startsWith('https://app.example.test/reports/report-1/preview'), true, 'allowlisted server-configured success URL');
    assert.equal(params.cancel_url.startsWith('https://app.example.test/reports/report-1/preview'), true);
    assert.equal(params.metadata.checkoutIntentId, body.checkoutIntentId);
    assert.ok(options.idempotencyKey.includes(body.checkoutIntentId), 'a stable idempotency key tied to the stored intent');

    const intent = (await db.collection('photoAddOnPurchases').doc(body.checkoutIntentId).get()).data();
    assert.equal(intent.status, 'session_created');
    assert.equal(intent.capacity, 25);
    assert.equal(intent.amountCents, 499);
    assert.equal(intent.currency, 'usd');
  });
});

test('POST /photo-pack-checkout: client-supplied amount/currency/capacity/priceId/mode fields are ignored entirely', async () => {
  const { router, db } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: { 'report-1': seedReport() },
    planConfigDoc: PLAN_CONFIG_ADDONS_ON,
  });
  await withTestServer(router, async (base) => {
    const { body } = await postJson(base, '/photo-pack-checkout', {
      reportId: 'report-1',
      packId: 'photos_25',
      amountCents: 1,
      currency: 'eur',
      capacity: 999999,
      priceId: 'price_evil',
      mode: 'subscription',
    });
    const intent = (await db.collection('photoAddOnPurchases').doc(body.checkoutIntentId).get()).data();
    assert.equal(intent.amountCents, 499, 'server-resolved amount only');
    assert.equal(intent.currency, 'usd');
    assert.equal(intent.capacity, 25);
  });
});

test('POST /photo-pack-checkout: unknown pack id is rejected', async () => {
  const { router } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: { 'report-1': seedReport() },
    planConfigDoc: PLAN_CONFIG_ADDONS_ON,
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postJson(base, '/photo-pack-checkout', { reportId: 'report-1', packId: 'not-a-real-pack' });
    assert.equal(res.status, 400);
    assert.equal(body.code, 'INVALID_PACK');
  });
});

test('POST /photo-pack-checkout: a pack with no configured Price ID for this mode fails safely without breaking anything else', async () => {
  const { router } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: { 'report-1': seedReport() },
    planConfigDoc: PLAN_CONFIG_ADDONS_ON,
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postJson(base, '/photo-pack-checkout', { reportId: 'report-1', packId: 'photos_100' });
    assert.equal(res.status, 503);
    assert.equal(body.code, 'STRIPE_ADDONS_NOT_CONFIGURED');
  });
});

test('POST /photo-pack-checkout: add-ons disabled at the PlanConfig level fails safely', async () => {
  const { router } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: { 'report-1': seedReport() },
    planConfigDoc: PLAN_CONFIG_ADDONS_OFF,
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postJson(base, '/photo-pack-checkout', { reportId: 'report-1', packId: 'photos_25' });
    assert.equal(res.status, 503);
    assert.equal(body.code, 'ADDONS_DISABLED');
  });
});

test('POST /photo-pack-checkout: a cross-user report is rejected as not found, never distinguishing "exists but not yours"', async () => {
  const { router } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: { 'report-1': seedReport({ userId: 'someone-else' }) },
    planConfigDoc: PLAN_CONFIG_ADDONS_ON,
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postJson(base, '/photo-pack-checkout', { reportId: 'report-1', packId: 'photos_25' });
    assert.equal(res.status, 404);
    assert.equal(body.code, 'NOT_FOUND');
  });
});

test('POST /photo-pack-checkout: a finalized report is rejected', async () => {
  const { router } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: { 'report-1': seedReport({ status: 'finalized' }) },
    planConfigDoc: PLAN_CONFIG_ADDONS_ON,
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postJson(base, '/photo-pack-checkout', { reportId: 'report-1', packId: 'photos_25' });
    assert.equal(res.status, 409);
    assert.equal(body.code, 'REPORT_FINALIZED');
  });
});

test('POST /photo-pack-checkout: Enterprise (unlimited) never needs a pack -- a safe response, no Stripe call, no intent created', async () => {
  const { router, fakeStripe } = installFakes({
    usersById: { [TEST_UID]: { tier: 'enterprise' } },
    reportsSeed: { 'report-1': seedReport() },
    planConfigDoc: PLAN_CONFIG_ADDONS_ON,
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postJson(base, '/photo-pack-checkout', { reportId: 'report-1', packId: 'photos_25' });
    assert.equal(res.status, 200);
    assert.equal(body.unlimited, true);
    assert.equal(fakeStripe.calls.sessionsCreate.length, 0);
  });
});

test('POST /photo-pack-checkout: Stripe session-creation failure marks the intent failed safely and a fresh retry succeeds', async () => {
  const { router, db } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: { 'report-1': seedReport() },
    planConfigDoc: PLAN_CONFIG_ADDONS_ON,
    stripeOverrides: { sessionCreateShouldFail: true },
  });
  await withTestServer(router, async (base) => {
    const first = await postJson(base, '/photo-pack-checkout', { reportId: 'report-1', packId: 'photos_25' });
    assert.equal(first.res.status, 502);
    assert.equal(first.body.code, 'CHECKOUT_SESSION_FAILED');
    const intents = await db.collection('photoAddOnPurchases').get();
    assert.equal(intents.docs.length, 1);
    assert.equal(intents.docs[0].data().status, 'failed');
  });

  // A fresh retry (new router instance = Stripe now healthy) succeeds independently.
  const { router: router2 } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: { 'report-1': seedReport() },
    planConfigDoc: PLAN_CONFIG_ADDONS_ON,
  });
  await withTestServer(router2, async (base) => {
    const retry = await postJson(base, '/photo-pack-checkout', { reportId: 'report-1', packId: 'photos_25' });
    assert.equal(retry.res.status, 200);
  });
});
