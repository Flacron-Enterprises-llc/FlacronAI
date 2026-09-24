const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Phase 45 trust-boundary verification follow-up. Route-level tests for
// POST /payment/photo-pack-checkout/:intentId/sync -- previously untested at
// the HTTP layer (only the underlying fulfillCheckoutIntent was exercised
// directly). Confirms: (1) the sync route never reads/trusts any client
// body/query field, only req.params.intentId + the authenticated uid; (2) it
// always retrieves the Session from Stripe server-side and fulfills through
// the exact same fulfillCheckoutIntent the webhook uses; (3) a concurrent
// webhook delivery racing the sync call for the SAME intent still grants
// capacity exactly once.
process.env.PLAN_CONFIG_CACHE_TTL_MS = '0';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_PRICE_PHOTOS_25_TEST = 'price_test_photos25';
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

const TEST_UID = 'sync-route-uid';
const TEST_EMAIL = 'sync-route@example.com';

function makeFakeStripe(overrides = {}) {
  const calls = { sessionsRetrieve: [] };
  return {
    calls,
    checkout: {
      sessions: {
        create: async () => ({ id: 'cs_unused', url: 'https://stripe.test/unused' }),
        retrieve: async (id) => {
          calls.sessionsRetrieve.push(id);
          return overrides.sessionRetrieveResult ? overrides.sessionRetrieveResult(id) : { id, status: 'open', payment_status: 'unpaid' };
        },
      },
    },
    paymentIntents: { retrieve: async (id) => ({ id, metadata: {} }) },
    webhooks: {
      constructEvent: (body, sig) => {
        if (sig === 'invalid-signature') throw new Error('No signatures found matching the expected signature for payload');
        return JSON.parse(body.toString());
      },
    },
    subscriptions: { list: async () => ({ data: [] }), retrieve: async () => ({}), update: async () => ({}) },
    subscriptionSchedules: {},
    customers: { create: async () => ({ id: 'cus_fake' }) },
    invoices: { list: async () => ({ data: [] }) },
  };
}

function installFakes({ usersById = {}, reportsSeed = {}, purchasesSeed = {}, planConfigDoc = null, stripeOverrides = {} } = {}) {
  [
    firebaseConfigPath, authMiddlewarePath, tiersPath, planConfigPath,
    photoAddOnPacksPath, photoAddOnPurchasesPath, rateLimitersPath, paymentRoutePath, stripePath,
  ].forEach((p) => delete require.cache[p]);

  const db = new FakeFirestore();
  for (const [uid, data] of Object.entries(usersById)) db.store.set(`users/${uid}`, { version: 1, data });
  for (const [id, data] of Object.entries(reportsSeed)) db.store.set(`reports/${id}`, { version: 1, data });
  for (const [id, data] of Object.entries(purchasesSeed)) db.store.set(`photoAddOnPurchases/${id}`, { version: 1, data });
  if (planConfigDoc) db.store.set('planConfig/active', { version: 1, data: planConfigDoc });

  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath, filename: firebaseConfigPath, loaded: true,
    exports: {
      getAuth: () => ({ verifyIdToken: async () => ({ uid: TEST_UID, email: TEST_EMAIL, auth_time: 1700000000, iat: 1700000000 }) }),
      getFirestore: () => db,
      FieldValue: { serverTimestamp: () => new Date().toISOString() },
      Timestamp: {}, admin: {}, initFirebase: () => {}, getBucket: () => {},
    },
  };

  const fakeStripe = makeFakeStripe(stripeOverrides);
  require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true, exports: () => fakeStripe };

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

const seedIntent = (overrides = {}) => ({
  schemaVersion: 1, uid: TEST_UID, reportId: 'report-1', packId: 'photos_25', capacity: 25, amountCents: 499, currency: 'usd',
  stripeMode: 'test', status: 'session_created', stripeSessionId: 'cs_test_1', stripePaymentIntentId: null,
  fulfillment: null, reversal: null, manualReview: null, activeDisputeId: null, resolvedDisputeId: null, disputeOutcome: null,
  eventLog: [], createdAt: '2026-09-19T00:00:00.000Z', updatedAt: '2026-09-19T00:00:00.000Z', expiresAt: '2026-09-20T00:00:00.000Z',
  ...overrides,
});

async function postSync(base, intentId, { qs = '', body = undefined } = {}) {
  const res = await fetch(`${base}/photo-pack-checkout/${intentId}/sync${qs}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer faketoken', 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { res, body: json };
}

async function postWebhook(base, event) {
  const res = await fetch(`${base}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': 'valid-sig' },
    body: JSON.stringify(event),
  });
  return { res, body: await res.json().catch(() => ({})) };
}

const paidSession = (overrides = {}) => ({
  id: 'cs_test_1', mode: 'payment', livemode: false, currency: 'usd', amount_total: 499,
  payment_status: 'paid', payment_intent: 'pi_1', status: 'complete', metadata: { checkoutIntentId: 'intent-1' }, ...overrides,
});

test('sync: forged body fields (amount/capacity/status/pack) are completely ignored -- the route reads only req.params.intentId', async () => {
  const { router, db } = installFakes({
    reportsSeed: { 'report-1': seedReport() },
    purchasesSeed: { 'intent-1': seedIntent() },
    stripeOverrides: { sessionRetrieveResult: () => paidSession() },
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postSync(base, 'intent-1', {
      body: { status: 'fulfilled', amountCents: 1, capacity: 999999, packId: 'photos_250', currency: 'eur' },
    });
    assert.equal(res.status, 200);
    assert.equal(body.purchase.capacity, 25, 'the trusted stored capacity, never the forged body value');
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity, 25, 'granted capacity matches the trusted pack, not the forged 999999');
  });
});

test('sync: forged/irrelevant query-string parameters (photoPackCheckout=success&session_id=fake) have no effect', async () => {
  const { router, db } = installFakes({
    reportsSeed: { 'report-1': seedReport() },
    purchasesSeed: { 'intent-1': seedIntent() },
    stripeOverrides: { sessionRetrieveResult: () => paidSession() },
  });
  await withTestServer(router, async (base) => {
    const { res } = await postSync(base, 'intent-1', { qs: '?photoPackCheckout=success&session_id=fake_evil&amountCents=1' });
    assert.equal(res.status, 200);
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity, 25, 'query-string values never influence fulfillment');
  });
});

test('sync: a cross-user intent is rejected as not found, never syncing someone else\'s purchase', async () => {
  const { router } = installFakes({
    reportsSeed: { 'report-1': seedReport({ userId: 'someone-else' }) },
    purchasesSeed: { 'intent-1': seedIntent({ uid: 'someone-else', reportId: 'report-1' }) },
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postSync(base, 'intent-1');
    assert.equal(res.status, 404);
    assert.equal(body.code, 'NOT_FOUND');
  });
});

test('sync: an unknown intent id is rejected as not found', async () => {
  const { router } = installFakes({});
  await withTestServer(router, async (base) => {
    const { res } = await postSync(base, 'does-not-exist');
    assert.equal(res.status, 404);
  });
});

test('sync: retrieves the Session from Stripe server-side -- an unpaid session leaves the intent untouched (status-read-only behavior)', async () => {
  const { router, db, fakeStripe } = installFakes({
    reportsSeed: { 'report-1': seedReport() },
    purchasesSeed: { 'intent-1': seedIntent() },
    stripeOverrides: { sessionRetrieveResult: () => paidSession({ payment_status: 'unpaid', status: 'open' }) },
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postSync(base, 'intent-1');
    assert.equal(res.status, 200);
    assert.equal(body.purchase.status, 'session_created', 'no fulfillment happened -- still pending payment');
    assert.deepEqual(fakeStripe.calls.sessionsRetrieve, ['cs_test_1'], 'the session was actually fetched from Stripe, not assumed');
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity || 0, 0);
  });
});

test('sync: an expired Stripe session marks the intent expired and grants nothing', async () => {
  const { router, db } = installFakes({
    reportsSeed: { 'report-1': seedReport() },
    purchasesSeed: { 'intent-1': seedIntent() },
    stripeOverrides: { sessionRetrieveResult: () => paidSession({ status: 'expired', payment_status: 'unpaid' }) },
  });
  await withTestServer(router, async (base) => {
    const { body } = await postSync(base, 'intent-1');
    assert.equal(body.purchase.status, 'expired');
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity || 0, 0);
  });
});

test('sync: happy path fulfills through the same atomic path as the webhook, verifying amount/currency/mode/session-id/metadata against the trusted intent', async () => {
  const { router, db } = installFakes({
    reportsSeed: { 'report-1': seedReport() },
    purchasesSeed: { 'intent-1': seedIntent() },
    stripeOverrides: { sessionRetrieveResult: () => paidSession() },
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postSync(base, 'intent-1');
    assert.equal(res.status, 200);
    assert.equal(body.purchase.status, 'fulfilled');
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity, 25);
  });
});

test('sync: a mismatched (forged) Stripe session amount is rejected exactly like the webhook path, never fulfilled', async () => {
  const { router, db } = installFakes({
    reportsSeed: { 'report-1': seedReport() },
    purchasesSeed: { 'intent-1': seedIntent() },
    stripeOverrides: { sessionRetrieveResult: () => paidSession({ amount_total: 1 }) },
  });
  await withTestServer(router, async (base) => {
    const { body } = await postSync(base, 'intent-1');
    assert.equal(body.purchase.status, 'failed');
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity || 0, 0);
  });
});

test('sync: never creates a second entitlement on repeated calls (idempotent replay)', async () => {
  const { router, db } = installFakes({
    reportsSeed: { 'report-1': seedReport() },
    purchasesSeed: { 'intent-1': seedIntent() },
    stripeOverrides: { sessionRetrieveResult: () => paidSession() },
  });
  await withTestServer(router, async (base) => {
    await postSync(base, 'intent-1');
    const second = await postSync(base, 'intent-1');
    assert.equal(second.body.purchase.status, 'fulfilled');
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity, 25, 'a second sync call never double-grants');
  });
});

test('duplicate sync+webhook concurrency: a webhook delivery racing a sync call for the SAME intent grants capacity exactly once', async () => {
  const { router, db } = installFakes({
    reportsSeed: { 'report-1': seedReport() },
    purchasesSeed: { 'intent-1': seedIntent() },
    stripeOverrides: { sessionRetrieveResult: () => paidSession() },
  });
  const webhookEvent = {
    id: 'evt_race_1',
    type: 'checkout.session.completed',
    data: { object: paidSession() },
  };
  await withTestServer(router, async (base) => {
    const attempts = [
      postSync(base, 'intent-1'),
      postWebhook(base, webhookEvent),
      postSync(base, 'intent-1'),
      postWebhook(base, { ...webhookEvent, id: 'evt_race_2' }),
    ];
    await Promise.all(attempts);
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity, 25, 'capacity granted exactly once despite sync and webhook racing concurrently');
    const intent = (await db.collection('photoAddOnPurchases').doc('intent-1').get()).data();
    assert.equal(intent.status, 'fulfilled');
  });
});

test('sync never weakens webhook processing: an invalid webhook signature is still rejected even after a successful sync fulfillment', async () => {
  const { router, db } = installFakes({
    reportsSeed: { 'report-1': seedReport() },
    purchasesSeed: { 'intent-1': seedIntent() },
    stripeOverrides: { sessionRetrieveResult: () => paidSession() },
  });
  await withTestServer(router, async (base) => {
    await postSync(base, 'intent-1');
    const res = await fetch(`${base}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 'invalid-signature' },
      body: JSON.stringify({ id: 'evt_x', type: 'checkout.session.completed', data: { object: paidSession() } }),
    });
    assert.equal(res.status, 400);
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity, 25, 'unchanged -- signature verification is unaffected by prior sync activity');
  });
});
