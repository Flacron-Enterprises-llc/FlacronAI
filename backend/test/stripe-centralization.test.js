const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Company-wide centralized Stripe standard (one Stripe account, app_id per
// app). Exercises the REAL payment router + billing ledger; only Firebase and
// the `stripe` package are faked. Mirrors the mandatory checks of the
// standard: app_id metadata, app_id validation in webhooks, idempotency,
// failed payments, refunds, per-app separation and revenue reconciliation.
process.env.PLAN_CONFIG_CACHE_TTL_MS = '0';
process.env.STRIPE_SECRET_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
process.env.STRIPE_PRICE_PROFESSIONAL = 'price_pro_m';
process.env.STRIPE_PRICE_AGENCY = 'price_agency_m';
process.env.FRONTEND_URL = 'https://app.example.test';
process.env.ADMIN_EMAIL = 'admin@example.test';
delete process.env.APP_ID; // default must be the standard id

const paths = [
  '../config/firebase', '../middleware/auth', '../config/tiers', '../config/planConfig', '../config/photoAddOnPacks',
  '../utils/photoAddOnPurchases', '../middleware/rateLimiters', '../routes/payment', '../config/stripeApp',
  '../services/billingLedger', 'stripe',
].map((p) => require.resolve(p));
const firebasePath = require.resolve('../config/firebase');
const authPath = require.resolve('../middleware/auth');
const stripePath = require.resolve('stripe');

const OURS = { app_id: 'flacron-ai' };
const FOREIGN = { app_id: 'flacron-energy' };

function makeStripe({ prices = {}, subscriptions = {}, paymentIntents = {}, invoices = {}, refundsByPi = {} } = {}) {
  const calls = { sessionsCreate: [], customersCreate: [], piUpdate: [] };
  const missing = () => { const e = new Error('No such object'); e.code = 'resource_missing'; e.statusCode = 404; throw e; };
  return {
    calls,
    prices: { retrieve: async (id) => prices[id] || missing() },
    customers: {
      create: async (p) => { calls.customersCreate.push(p); return { id: 'cus_new', email: p.email, metadata: p.metadata, livemode: false, created: 1700000000 }; },
      retrieve: async () => missing(),
      update: async (id, p) => ({ id, metadata: p.metadata }),
    },
    checkout: { sessions: { create: async (p) => { calls.sessionsCreate.push(p); return { id: 'cs_1', url: 'https://stripe.test/cs_1' }; }, retrieve: async () => ({}) } },
    subscriptions: {
      list: async () => ({ data: [] }),
      retrieve: async (id) => subscriptions[id] || missing(),
      update: async (id) => subscriptions[id],
    },
    subscriptionSchedules: {},
    paymentIntents: {
      retrieve: async (id) => paymentIntents[id] || missing(),
      update: async (id, p) => { calls.piUpdate.push({ id, p }); paymentIntents[id] = { ...paymentIntents[id], metadata: p.metadata }; return paymentIntents[id]; },
    },
    invoices: { list: async () => ({ data: [] }), retrieve: async (id) => invoices[id] || missing() },
    refunds: { list: async ({ payment_intent }) => ({ data: refundsByPi[payment_intent] || [] }) },
    webhooks: {
      constructEvent: (raw, sig) => {
        if (sig !== 'valid') throw new Error('No signatures found matching the expected signature for payload');
        return JSON.parse(raw.toString());
      },
    },
  };
}

function install({ users = {}, stripe = {} } = {}) {
  paths.forEach((p) => delete require.cache[p]);
  const db = new FakeFirestore();
  for (const [uid, data] of Object.entries(users)) db.store.set(`users/${uid}`, { version: 1, data });
  require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: {
    getFirestore: () => db, getAuth: () => ({}), FieldValue: { serverTimestamp: () => new Date().toISOString() },
    Timestamp: {}, admin: {}, initFirebase: () => {}, getBucket: () => {},
  } };
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
    authenticateToken: (req, _res, next) => { req.user = { uid: req.headers['x-test-uid'] || 'uid-1', email: req.headers['x-test-email'] || 'user@example.test' }; next(); },
  } };
  const fakeStripe = makeStripe(stripe);
  require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true, exports: () => fakeStripe };
  const router = require('../routes/payment');
  const ledger = require('../services/billingLedger');
  return { router, db, fakeStripe, ledger };
}

async function serve(router, fn) {
  const app = express();
  app.use('/payment/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use('/payment', router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  try { await fn(`http://127.0.0.1:${server.address().port}/payment`); } finally { await new Promise((r) => server.close(r)); }
}

const post = async (url, body, headers = {}) => {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { res, body: await res.json().catch(() => ({})) };
};
const hook = (base, event, sig = 'valid') => post(`${base}/webhook`, event, { 'stripe-signature': sig });
const doc = async (db, path) => { const [c, id] = path.split('/'); return (await db.collection(c).doc(id).get()).data(); };

const ourPrice = (id) => ({ id, active: true, livemode: false, metadata: { ...OURS } });
const sub = (id, meta, extra = {}) => ({
  id, object: 'subscription', status: 'active', created: 1700000000, customer: 'cus_1', cancel_at_period_end: false,
  livemode: false, current_period_end: 1702592000, metadata: meta,
  items: { data: [{ quantity: 1, price: { id: 'price_pro_m', unit_amount: 3999, currency: 'usd', recurring: { interval: 'month' } } }] },
  ...extra,
});
const pi = (id, amount, meta = {}, extra = {}) => ({ id, amount, amount_received: amount, currency: 'usd', customer: 'cus_1', livemode: false, created: 1700000000, metadata: meta, ...extra });

// ── Checkout: app_id metadata everywhere ────────────────────────────────────

test('checkout: customer, session and subscription_data all carry app_id + internal_user_id', async () => {
  const { router, fakeStripe } = install({ users: { 'uid-1': { tier: 'starter' } }, stripe: { prices: { price_pro_m: ourPrice('price_pro_m') } } });
  await serve(router, async (base) => {
    const { res } = await post(`${base}/create-checkout-session`, { tier: 'professional' });
    assert.equal(res.status, 200);
    const cust = fakeStripe.calls.customersCreate[0];
    assert.equal(cust.metadata.app_id, 'flacron-ai');
    assert.equal(cust.metadata.internal_user_id, 'uid-1');
    const s = fakeStripe.calls.sessionsCreate[0];
    assert.equal(s.metadata.app_id, 'flacron-ai');
    assert.equal(s.subscription_data.metadata.app_id, 'flacron-ai');
    assert.equal(s.subscription_data.metadata.internal_user_id, 'uid-1');
    assert.equal(s.client_reference_id, 'uid-1');
  });
});

test('checkout: a Price that is not ours (foreign app_id / inactive / wrong mode) is refused', async () => {
  for (const bad of [
    { id: 'price_pro_m', active: true, livemode: false, metadata: { ...FOREIGN } },
    { id: 'price_pro_m', active: false, livemode: false, metadata: { ...OURS } },
    { id: 'price_pro_m', active: true, livemode: true, metadata: { ...OURS } },
  ]) {
    const { router, fakeStripe } = install({ users: { 'uid-1': {} }, stripe: { prices: { price_pro_m: bad } } });
    await serve(router, async (base) => {
      const { res, body } = await post(`${base}/create-checkout-session`, { tier: 'professional' });
      assert.equal(res.status, 503);
      assert.equal(body.code, 'PRICE_NOT_CONFIGURED');
      assert.equal(fakeStripe.calls.sessionsCreate.length, 0);
    });
  }
});

test('checkout: stale ids from a previous Stripe account do not break checkout', async () => {
  const { router, fakeStripe } = install({
    users: { 'uid-1': { stripeCustomerId: 'cus_old_account', stripeSubscriptionId: 'sub_old_account' } },
    stripe: { prices: { price_pro_m: ourPrice('price_pro_m') } },
  });
  await serve(router, async (base) => {
    const { res } = await post(`${base}/create-checkout-session`, { tier: 'professional' });
    assert.equal(res.status, 200);
    assert.equal(fakeStripe.calls.customersCreate.length, 1, 'a fresh customer in the shared account');
  });
});

// ── Webhooks: signature, idempotency, mode, app_id validation ───────────────

const checkoutEvent = (id, meta) => ({
  id, type: 'checkout.session.completed', livemode: false,
  data: { object: { id: 'cs_x', mode: 'subscription', livemode: false, subscription: 'sub_1', metadata: meta } },
});

test('webhook: forged signature is rejected with 400', async () => {
  const { router, db } = install({ users: { 'uid-1': { tier: 'starter' } } });
  await serve(router, async (base) => {
    const { res } = await hook(base, checkoutEvent('evt_forged', { ...OURS, internal_user_id: 'uid-1', tier: 'professional' }), 'forged');
    assert.equal(res.status, 400);
    assert.equal((await doc(db, 'users/uid-1')).tier, 'starter');
  });
});

test('webhook: another app\'s event (app_id mismatch) is logged, recorded and NOT applied', async () => {
  const { router, db } = install({ users: { 'uid-1': { tier: 'starter' } }, stripe: { subscriptions: { sub_1: sub('sub_1', FOREIGN) } } });
  await serve(router, async (base) => {
    const { res, body } = await hook(base, checkoutEvent('evt_foreign', { ...FOREIGN, internal_user_id: 'uid-1', tier: 'professional' }));
    assert.equal(res.status, 200);
    assert.equal(body.ignored, 'app_mismatch');
    assert.equal((await doc(db, 'users/uid-1')).tier, 'starter', 'never assigned to the wrong application');
    const evt = await doc(db, 'stripe_events/evt_foreign');
    assert.equal(evt.outcome, 'app_mismatch');
    assert.equal(evt.attributed_app_id, 'flacron-energy');
  });
});

test('webhook: an untagged event is unattributed and NOT applied (URL is not proof of ownership)', async () => {
  const { router, db } = install({ users: { 'uid-1': { tier: 'starter' } } });
  await serve(router, async (base) => {
    const { body } = await hook(base, checkoutEvent('evt_untagged', { uid: 'uid-1', tier: 'professional' }));
    assert.equal(body.ignored, 'unattributed');
    assert.equal((await doc(db, 'users/uid-1')).tier, 'starter');
  });
});

test('webhook: a live event against a test key is a mode mismatch and NOT applied', async () => {
  const { router, db } = install({ users: { 'uid-1': { tier: 'starter' } } });
  await serve(router, async (base) => {
    const evt = checkoutEvent('evt_live', { ...OURS, internal_user_id: 'uid-1', tier: 'professional' });
    evt.livemode = true;
    const { body } = await hook(base, evt);
    assert.equal(body.ignored, 'mode_mismatch');
    assert.equal((await doc(db, 'users/uid-1')).tier, 'starter');
  });
});

test('webhook: our checkout upgrades the user, writes the ledger, and a redelivery is a no-op', async () => {
  const { router, db } = install({ users: { 'uid-1': { tier: 'starter' } }, stripe: { subscriptions: { sub_1: sub('sub_1', { ...OURS, internal_user_id: 'uid-1', tier: 'professional' }) } } });
  await serve(router, async (base) => {
    const first = await hook(base, checkoutEvent('evt_ok', { ...OURS, internal_user_id: 'uid-1', tier: 'professional' }));
    assert.equal(first.body.received, true);
    assert.equal((await doc(db, 'users/uid-1')).tier, 'professional');
    const row = await doc(db, 'billing_subscriptions/sub_1');
    assert.equal(row.application_id, 'flacron-ai');
    assert.equal(row.plan, 'professional');
    assert.equal(row.status, 'active');
    assert.equal((await doc(db, 'stripe_events/evt_ok')).outcome, 'processed');

    await db.collection('users').doc('uid-1').update({ tier: 'starter' }); // would be re-upgraded if reprocessed
    const again = await hook(base, checkoutEvent('evt_ok', { ...OURS, internal_user_id: 'uid-1', tier: 'professional' }));
    assert.equal(again.body.duplicate, true);
    assert.equal((await doc(db, 'users/uid-1')).tier, 'starter', 'duplicate event not processed again');
  });
});

// ── Ledger: payments, failures, refunds ─────────────────────────────────────

const invoiceEvent = (id, type, invId, piId, amount) => ({
  id, type, livemode: false,
  data: { object: { id: invId, object: 'invoice', customer: 'cus_1', subscription: 'sub_1', payment_intent: piId, status: type === 'invoice.paid' ? 'paid' : 'open', amount_due: amount, amount_paid: type === 'invoice.paid' ? amount : 0, currency: 'usd', billing_reason: 'subscription_cycle', livemode: false, created: 1700000000, metadata: {} } },
});

test('webhook: invoice.paid records a succeeded payment and stamps app_id on the invoice PaymentIntent', async () => {
  const { router, db, fakeStripe } = install({ stripe: {
    subscriptions: { sub_1: sub('sub_1', { ...OURS, internal_user_id: 'uid-1', tier: 'professional' }) },
    paymentIntents: { pi_inv: pi('pi_inv', 3999, {}, { invoice: 'in_1' }) },
  } });
  await serve(router, async (base) => {
    await hook(base, invoiceEvent('evt_inv_paid', 'invoice.paid', 'in_1', 'pi_inv', 3999));
    const pay = await doc(db, 'billing_payments/pi_inv');
    assert.equal(pay.application_id, 'flacron-ai');
    assert.equal(pay.status, 'succeeded');
    assert.equal(pay.amount, 3999);
    assert.equal((await doc(db, 'billing_invoices/in_1')).application_id, 'flacron-ai');
    assert.equal(fakeStripe.calls.piUpdate[0].p.metadata.app_id, 'flacron-ai', 'PaymentIntent stamped');
  });
});

test('webhook: a failed payment is stored as failed, never revenue, and never grants paid access', async () => {
  const { router, db, ledger } = install({
    users: { 'uid-1': { tier: 'starter', stripeCustomerId: 'cus_1', email: 'u@example.test' } },
    stripe: {
      subscriptions: { sub_1: sub('sub_1', { ...OURS, internal_user_id: 'uid-1', tier: 'professional' }, { status: 'incomplete' }) },
      paymentIntents: { pi_fail: pi('pi_fail', 3999, {}, { invoice: 'in_f', status: 'requires_payment_method', last_payment_error: { message: 'Your card was declined.' } }) },
    },
  });
  await serve(router, async (base) => {
    await hook(base, invoiceEvent('evt_inv_fail', 'invoice.payment_failed', 'in_f', 'pi_fail', 3999));
    const pay = await doc(db, 'billing_payments/pi_fail');
    assert.equal(pay.status, 'failed');
    assert.equal(pay.application_id, 'flacron-ai');
    assert.equal((await doc(db, 'users/uid-1')).tier, 'starter', 'no paid access from a failed payment');
    const report = await ledger.buildRevenueReport(db, { applicationId: 'flacron-ai', livemode: false });
    assert.equal(report.failed_payments, 1);
    assert.equal(report.successful_payments, 0);
    assert.equal(report.currencies.usd?.gross_revenue || 0, 0);
  });
});

test('refund test: $100 payment, $30 refund -> gross 100, refunds 30, net 70 (FlacronAI only)', async () => {
  const { router, db, ledger } = install({ stripe: {
    paymentIntents: { pi_100: pi('pi_100', 10000, { ...OURS, internal_user_id: 'uid-1' }) },
    refundsByPi: { pi_100: [{ id: 're_30', amount: 3000, currency: 'usd', status: 'succeeded', payment_intent: 'pi_100', charge: 'ch_100', livemode: false, created: 1700000100 }] },
  } });
  await ledger.recordPayment(db, { paymentIntent: pi('pi_100', 10000, OURS), status: 'succeeded', kind: 'one_time' });
  // another app's payment in the same central data must be unaffected
  db.store.set('billing_payments/pi_energy', { version: 1, data: { application_id: 'flacron-energy', livemode: false, status: 'succeeded', amount: 10000, currency: 'usd' } });
  await serve(router, async (base) => {
    await hook(base, { id: 'evt_refund', type: 'charge.refunded', livemode: false, data: { object: { id: 'ch_100', payment_intent: 'pi_100', amount: 10000, amount_refunded: 3000, livemode: false } } });
  });
  const ai = await ledger.buildRevenueReport(db, { applicationId: 'flacron-ai', livemode: false });
  assert.deepEqual([ai.currencies.usd.gross_revenue, ai.currencies.usd.refunds, ai.currencies.usd.net_revenue], [10000, 3000, 7000]);
  assert.equal((await doc(db, 'billing_refunds/re_30')).application_id, 'flacron-ai');
  assert.equal((await doc(db, 'billing_payments/pi_100')).amount_refunded, 3000);
  const energy = await ledger.buildRevenueReport(db, { applicationId: 'flacron-energy', livemode: false });
  assert.equal(energy.currencies.usd.refunds, 0, 'refund does not affect another application');
  assert.equal(energy.currencies.usd.net_revenue, 10000);
});

// ── Separation + revenue reconciliation (mandatory tests 11 & 12) ───────────

test('separation test: 3 FlacronAI + 2 FlacronEnergy + 4 FlacronCV payments -> 3 / 2 / 4 / 9', async () => {
  const { db, ledger } = install();
  const seed = (app, n) => { for (let i = 0; i < n; i++) db.store.set(`billing_payments/${app}_${i}`, { version: 1, data: { application_id: app, livemode: false, status: 'succeeded', amount: 1000, currency: 'usd' } }); };
  seed('flacron-ai', 3); seed('flacron-energy', 2); seed('flacron-cv', 4);
  const count = async (app) => (await ledger.buildRevenueReport(db, { applicationId: app, livemode: false })).successful_payments;
  assert.equal(await count('flacron-ai'), 3);
  assert.equal(await count('flacron-energy'), 2);
  assert.equal(await count('flacron-cv'), 4);
  assert.equal(await count('all'), 9);
});

test('revenue test: AI $20+$30+$50=$100, Energy $40+$60=$100, all apps $200; failed/test rows excluded', async () => {
  const { db, ledger } = install();
  let n = 0;
  const add = (app, cents, status = 'succeeded', livemode = false) => db.store.set(`billing_payments/p${n++}`, { version: 1, data: { application_id: app, livemode, status, amount: cents, currency: 'usd' } });
  [2000, 3000, 5000].forEach((c) => add('flacron-ai', c));
  [4000, 6000].forEach((c) => add('flacron-energy', c));
  add('flacron-ai', 99900, 'failed'); // never revenue
  add('flacron-ai', 12345, 'succeeded', true); // live row excluded from a test report
  const gross = async (app) => (await ledger.buildRevenueReport(db, { applicationId: app, livemode: false })).currencies.usd.gross_revenue;
  assert.equal(await gross('flacron-ai'), 10000);
  assert.equal(await gross('flacron-energy'), 10000);
  assert.equal(await gross('all'), 20000);
});

test('admin revenue endpoint: admin only, defaults to this app', async () => {
  const { router, db } = install();
  db.store.set('billing_payments/x', { version: 1, data: { application_id: 'flacron-ai', livemode: false, status: 'succeeded', amount: 500, currency: 'usd' } });
  await serve(router, async (base) => {
    const denied = await fetch(`${base}/admin/revenue`, { headers: { 'x-test-email': 'someone@example.test' } });
    assert.equal(denied.status, 403);
    const ok = await (await fetch(`${base}/admin/revenue`, { headers: { 'x-test-email': 'admin@example.test' } })).json();
    assert.equal(ok.report.application_id, 'flacron-ai');
    assert.equal(ok.report.currencies.usd.gross_revenue, 500);
  });
});
