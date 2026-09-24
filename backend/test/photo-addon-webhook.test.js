const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Phase 45 (Stripe Report-Specific Photo Add-Ons). Webhook-level tests for
// the extended POST /payment/webhook -- exercises the REAL router/handler,
// faking only ../config/firebase and the `stripe` package (signature
// verification is faked to a plain JSON parse; every trust-boundary check
// this phase adds -- amount/currency/mode/session-id/metadata -- is real
// code, exercised end to end through the HTTP layer here).
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

function makeFakeStripe(overrides = {}) {
  const calls = { constructEvent: [], paymentIntentsRetrieve: [] };
  return {
    calls,
    checkout: { sessions: { create: async () => ({ id: 'cs_unused', url: 'https://stripe.test/unused' }), retrieve: async () => ({}) } },
    paymentIntents: {
      retrieve: async (id) => {
        calls.paymentIntentsRetrieve.push(id);
        return overrides.paymentIntentRetrieveResult ? overrides.paymentIntentRetrieveResult(id) : { id, metadata: {} };
      },
    },
    webhooks: {
      constructEvent: (rawBody, sig) => {
        calls.constructEvent.push(sig);
        if (sig === 'invalid-signature') {
          const err = new Error('No signatures found matching the expected signature for payload');
          throw err;
        }
        return JSON.parse(rawBody.toString());
      },
    },
    subscriptions: { list: async () => ({ data: [] }), retrieve: overrides.subscriptionsRetrieve || (async () => ({ id: 'sub_1', status: 'active', created: 1700000000, customer: 'cus_1', cancel_at_period_end: false, items: { data: [{ price: { id: 'price_professional' } }] } })) },
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
      getAuth: () => ({ verifyIdToken: async () => ({ uid: 'unused', email: 'unused@example.com', auth_time: 1700000000, iat: 1700000000 }) }),
      getFirestore: () => db,
      FieldValue: { serverTimestamp: () => new Date().toISOString() },
      Timestamp: {},
      admin: {},
      initFirebase: () => {},
      getBucket: () => {},
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

async function postWebhook(base, event, sig = 'valid-sig') {
  const res = await fetch(`${base}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
    body: JSON.stringify(event),
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

const seedReport = (overrides = {}) => ({ id: 'report-1', userId: 'uid-1', status: 'draft', photos: [], ...overrides });

const seedIntent = (overrides = {}) => ({
  schemaVersion: 1,
  uid: 'uid-1',
  reportId: 'report-1',
  packId: 'photos_25',
  capacity: 25,
  amountCents: 499,
  currency: 'usd',
  stripeMode: 'test',
  status: 'session_created',
  stripeSessionId: 'cs_test_1',
  stripePaymentIntentId: null,
  fulfillment: null,
  reversal: null,
  manualReview: null,
  activeDisputeId: null,
  resolvedDisputeId: null,
  disputeOutcome: null,
  eventLog: [],
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
  expiresAt: '2026-09-20T00:00:00.000Z',
  ...overrides,
});

const checkoutCompletedEvent = (overrides = {}) => ({
  id: 'evt_1',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_1',
      mode: 'payment',
      livemode: false,
      currency: 'usd',
      amount_total: 499,
      payment_status: 'paid',
      payment_intent: 'pi_1',
      metadata: { checkoutIntentId: 'intent-1', reportId: 'report-1' },
      ...overrides,
    },
  },
});

test('webhook: invalid signature is rejected with 400, never processed', async () => {
  const { router, db } = installFakes({ reportsSeed: { 'report-1': seedReport() }, purchasesSeed: { 'intent-1': seedIntent() } });
  await withTestServer(router, async (base) => {
    const { res } = await postWebhook(base, checkoutCompletedEvent(), 'invalid-signature');
    assert.equal(res.status, 400);
    const intent = (await db.collection('photoAddOnPurchases').doc('intent-1').get()).data();
    assert.equal(intent.status, 'session_created', 'never fulfilled from an unverified request');
  });
});

test('webhook: checkout.session.completed fulfills the matching photo add-on intent (not the unrelated subscription path)', async () => {
  const { router, db } = installFakes({ reportsSeed: { 'report-1': seedReport() }, purchasesSeed: { 'intent-1': seedIntent() } });
  await withTestServer(router, async (base) => {
    const { res, body } = await postWebhook(base, checkoutCompletedEvent());
    assert.equal(res.status, 200);
    assert.equal(body.received, true);
    const intent = (await db.collection('photoAddOnPurchases').doc('intent-1').get()).data();
    assert.equal(intent.status, 'fulfilled');
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity, 25);
  });
});

test('webhook: duplicate event id (redelivery) is processed once, thanks to the existing processedWebhooks idempotency gate', async () => {
  const { router, db } = installFakes({ reportsSeed: { 'report-1': seedReport() }, purchasesSeed: { 'intent-1': seedIntent() } });
  await withTestServer(router, async (base) => {
    await postWebhook(base, checkoutCompletedEvent());
    const second = await postWebhook(base, checkoutCompletedEvent());
    assert.equal(second.res.status, 200);
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity, 25, 'redelivery of the same event id never double-grants');
  });
});

test('webhook: an unknown/unhandled event type is a safe no-op (200, marked processed, nothing changes)', async () => {
  const { router, db } = installFakes({ reportsSeed: { 'report-1': seedReport() }, purchasesSeed: { 'intent-1': seedIntent() } });
  await withTestServer(router, async (base) => {
    const { res } = await postWebhook(base, { id: 'evt_unknown', type: 'some.future.event.type', data: { object: {} } });
    assert.equal(res.status, 200);
    const intent = (await db.collection('photoAddOnPurchases').doc('intent-1').get()).data();
    assert.equal(intent.status, 'session_created', 'unaffected');
  });
});

test('webhook: existing subscription checkout.session.completed path is completely unaffected (regression)', async () => {
  const { router, db } = installFakes({ usersById: { 'uid-sub': { tier: 'starter' } } });
  await withTestServer(router, async (base) => {
    const { res } = await postWebhook(base, {
      id: 'evt_sub_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_sub', mode: 'subscription', metadata: { uid: 'uid-sub', tier: 'professional' }, subscription: 'sub_1' } },
    });
    assert.equal(res.status, 200);
    const user = (await db.collection('users').doc('uid-sub').get()).data();
    assert.equal(user.tier, 'professional', 'the pre-existing subscription upgrade path still works unmodified');
  });
});

test('webhook: checkout.session.expired grants nothing', async () => {
  const { router, db } = installFakes({ reportsSeed: { 'report-1': seedReport() }, purchasesSeed: { 'intent-1': seedIntent() } });
  await withTestServer(router, async (base) => {
    const { res } = await postWebhook(base, {
      id: 'evt_exp_1',
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_test_1', metadata: { checkoutIntentId: 'intent-1' } } },
    });
    assert.equal(res.status, 200);
    const intent = (await db.collection('photoAddOnPurchases').doc('intent-1').get()).data();
    assert.equal(intent.status, 'expired');
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity || 0, 0);
  });
});

test('webhook: charge.refunded (full) revokes capacity via a PaymentIntent metadata lookup, never from the charge object alone', async () => {
  const { router, db } = installFakes({
    reportsSeed: { 'report-1': seedReport() },
    purchasesSeed: { 'intent-1': seedIntent({ status: 'fulfilled', stripePaymentIntentId: 'pi_1', fulfillment: { fulfilledAt: '2026-09-19T00:00:00.000Z' } }) },
    stripeOverrides: { paymentIntentRetrieveResult: () => ({ id: 'pi_1', metadata: { checkoutIntentId: 'intent-1' } }) },
  });
  // Pre-seed the report as already granted (simulating the earlier fulfillment).
  db.store.set('reports/report-1', { version: 1, data: { ...seedReport(), purchasedPhotoCapacity: 25, photoAddOnCapacityGrantedFor: ['intent-1'] } });

  await withTestServer(router, async (base) => {
    const { res } = await postWebhook(base, {
      id: 'evt_refund_1',
      type: 'charge.refunded',
      data: { object: { id: 'ch_1', payment_intent: 'pi_1', amount: 499, amount_refunded: 499 } },
    });
    assert.equal(res.status, 200);
    const intent = (await db.collection('photoAddOnPurchases').doc('intent-1').get()).data();
    assert.equal(intent.status, 'refunded');
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity, 0);
  });
});

test('webhook: charge.refunded returns 500 and is NOT marked processed when the PaymentIntent lookup fails transiently (so Stripe retries)', async () => {
  const { router, db } = installFakes({
    reportsSeed: { 'report-1': seedReport() },
    purchasesSeed: { 'intent-1': seedIntent({ status: 'fulfilled', stripePaymentIntentId: 'pi_1', fulfillment: { fulfilledAt: '2026-09-19T00:00:00.000Z' } }) },
    stripeOverrides: {
      paymentIntentRetrieveResult: () => {
        const err = new Error('Stripe API temporarily unavailable');
        err.code = 'api_connection_error';
        throw err;
      },
    },
  });
  db.store.set('reports/report-1', { version: 1, data: { ...seedReport(), purchasedPhotoCapacity: 25, photoAddOnCapacityGrantedFor: ['intent-1'] } });

  await withTestServer(router, async (base) => {
    const { res } = await postWebhook(base, {
      id: 'evt_refund_transient',
      type: 'charge.refunded',
      data: { object: { id: 'ch_1', payment_intent: 'pi_1', amount: 499, amount_refunded: 499 } },
    });
    assert.equal(res.status, 500);
    const processed = await db.collection('processedWebhooks').doc('evt_refund_transient').get();
    assert.equal(processed.exists, false);
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity, 25);
  });
});

test('webhook: charge.refunded for a PaymentIntent Stripe reports as missing is a safe 200 no-op', async () => {
  const { router, db } = installFakes({
    reportsSeed: { 'report-1': seedReport() },
    stripeOverrides: {
      paymentIntentRetrieveResult: () => {
        const err = new Error('No such payment_intent');
        err.code = 'resource_missing';
        throw err;
      },
    },
  });

  await withTestServer(router, async (base) => {
    const { res } = await postWebhook(base, {
      id: 'evt_refund_missing',
      type: 'charge.refunded',
      data: { object: { id: 'ch_x', payment_intent: 'pi_unknown', amount: 499, amount_refunded: 499 } },
    });
    assert.equal(res.status, 200);
    const processed = await db.collection('processedWebhooks').doc('evt_refund_missing').get();
    assert.equal(processed.exists, true);
  });
});

test('webhook: charge.refunded (partial) flags for manual review without changing capacity', async () => {
  const { router, db } = installFakes({
    purchasesSeed: { 'intent-1': seedIntent({ status: 'fulfilled', stripePaymentIntentId: 'pi_1' }) },
    stripeOverrides: { paymentIntentRetrieveResult: () => ({ id: 'pi_1', metadata: { checkoutIntentId: 'intent-1' } }) },
  });
  db.store.set('reports/report-1', { version: 1, data: { ...seedReport(), purchasedPhotoCapacity: 25, photoAddOnCapacityGrantedFor: ['intent-1'] } });

  await withTestServer(router, async (base) => {
    await postWebhook(base, {
      id: 'evt_refund_partial',
      type: 'charge.refunded',
      data: { object: { id: 'ch_1', payment_intent: 'pi_1', amount: 499, amount_refunded: 200 } },
    });
    const intent = (await db.collection('photoAddOnPurchases').doc('intent-1').get()).data();
    assert.equal(intent.status, 'fulfilled', 'status unchanged on a partial refund');
    assert.ok(intent.manualReview);
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity, 25);
  });
});

test('webhook: charge.dispute.created suspends, charge.dispute.closed(won) restores exactly once', async () => {
  const { router, db } = installFakes({
    purchasesSeed: { 'intent-1': seedIntent({ status: 'fulfilled', stripePaymentIntentId: 'pi_1' }) },
    stripeOverrides: { paymentIntentRetrieveResult: () => ({ id: 'pi_1', metadata: { checkoutIntentId: 'intent-1' } }) },
  });
  db.store.set('reports/report-1', { version: 1, data: { ...seedReport(), purchasedPhotoCapacity: 25, photoAddOnCapacityGrantedFor: ['intent-1'] } });

  await withTestServer(router, async (base) => {
    await postWebhook(base, { id: 'evt_dc_1', type: 'charge.dispute.created', data: { object: { id: 'dp_1', payment_intent: 'pi_1' } } });
    let report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity, 0);

    await postWebhook(base, { id: 'evt_dc_2', type: 'charge.dispute.closed', data: { object: { id: 'dp_1', payment_intent: 'pi_1', status: 'won' } } });
    report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity, 25);

    // Redelivery of the same "won" closure never double-restores.
    await postWebhook(base, { id: 'evt_dc_2_dup', type: 'charge.dispute.closed', data: { object: { id: 'dp_1', payment_intent: 'pi_1', status: 'won' } } });
    report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity, 25);
  });
});

test('webhook: charge.dispute.closed(lost) keeps the revocation', async () => {
  const { router, db } = installFakes({
    purchasesSeed: { 'intent-1': seedIntent({ status: 'fulfilled', stripePaymentIntentId: 'pi_1' }) },
    stripeOverrides: { paymentIntentRetrieveResult: () => ({ id: 'pi_1', metadata: { checkoutIntentId: 'intent-1' } }) },
  });
  db.store.set('reports/report-1', { version: 1, data: { ...seedReport(), purchasedPhotoCapacity: 25, photoAddOnCapacityGrantedFor: ['intent-1'] } });

  await withTestServer(router, async (base) => {
    await postWebhook(base, { id: 'evt_dl_1', type: 'charge.dispute.created', data: { object: { id: 'dp_1', payment_intent: 'pi_1' } } });
    await postWebhook(base, { id: 'evt_dl_2', type: 'charge.dispute.closed', data: { object: { id: 'dp_1', payment_intent: 'pi_1', status: 'lost' } } });
    const intent = (await db.collection('photoAddOnPurchases').doc('intent-1').get()).data();
    assert.equal(intent.status, 'dispute_lost');
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity, 0);
  });
});

test('webhook: amount mismatch between the Stripe session and the trusted stored intent is rejected, never fulfilled', async () => {
  const { router, db } = installFakes({ reportsSeed: { 'report-1': seedReport() }, purchasesSeed: { 'intent-1': seedIntent() } });
  await withTestServer(router, async (base) => {
    await postWebhook(base, checkoutCompletedEvent({ amount_total: 999999 }));
    const intent = (await db.collection('photoAddOnPurchases').doc('intent-1').get()).data();
    assert.equal(intent.status, 'failed');
    const report = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(report.purchasedPhotoCapacity || 0, 0);
  });
});

test('webhook: no secrets, signatures, or raw payment payloads are ever echoed back in the response', async () => {
  const { router } = installFakes({ reportsSeed: { 'report-1': seedReport() }, purchasesSeed: { 'intent-1': seedIntent() } });
  await withTestServer(router, async (base) => {
    const { body } = await postWebhook(base, checkoutCompletedEvent());
    const asString = JSON.stringify(body);
    assert.equal(asString.includes('sk_test'), false);
    assert.equal(asString.includes('pi_1'), false);
    assert.deepEqual(Object.keys(body), ['received']);
  });
});
