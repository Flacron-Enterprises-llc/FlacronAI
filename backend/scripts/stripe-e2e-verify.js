#!/usr/bin/env node
// End-to-end verification of the centralized Stripe standard against REAL
// Stripe (TEST MODE ONLY): real API objects, real signed webhooks delivered by
// `stripe listen`, real payload shapes, test clocks for renewals/failures.
// The production payment router runs in-process against an in-memory
// Firestore, so no production data is touched.
//
// Usage:
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-e2e-verify.js <prices.env>
// <prices.env> = output of stripe-sync-catalog.js for test mode.
// Requires the Stripe CLI on PATH.

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const express = require('express');

const KEY = process.env.STRIPE_SECRET_KEY || '';
if (!/^(sk|rk)_test_/.test(KEY)) { console.error('Refusing to run: a TEST key is required.'); process.exit(2); }
const pricesFile = process.argv[2];
if (!pricesFile) { console.error('usage: stripe-e2e-verify.js <prices.env>'); process.exit(2); }
for (const line of fs.readFileSync(pricesFile, 'utf8').split(/\r?\n/)) {
  const m = /^(STRIPE_PRICE_[A-Z0-9_]+)=(price_\w+)/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}
process.env.FRONTEND_URL = 'https://e2e.flacronai.invalid';
process.env.ADMIN_EMAIL = 'admin@e2e.invalid';
process.env.PLAN_CONFIG_CACHE_TTL_MS = '0';

const stripeCli = process.platform === 'win32' ? 'stripe.exe' : 'stripe';
const secret = spawnSync(stripeCli, ['listen', '--print-secret', '--api-key', KEY], { encoding: 'utf8' }).stdout.trim().split(/\s+/).pop();
if (!/^whsec_/.test(secret)) { console.error('could not obtain webhook signing secret from stripe listen'); process.exit(1); }
process.env.STRIPE_WEBHOOK_SECRET = secret;

// In-memory Firestore + header-based auth for the real router.
const { FakeFirestore } = require('../test/helpers/fakeFirestore');
const db = new FakeFirestore();
const fbPath = require.resolve('../config/firebase');
require.cache[fbPath] = { id: fbPath, filename: fbPath, loaded: true, exports: {
  getFirestore: () => db, getAuth: () => ({}), FieldValue: { serverTimestamp: () => new Date().toISOString() },
  Timestamp: {}, admin: {}, initFirebase: () => {}, getBucket: () => {},
} };
const authPath = require.resolve('../middleware/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  authenticateToken: (req, _res, next) => { req.user = { uid: req.headers['x-uid'], email: `${req.headers['x-uid']}@e2e.invalid` }; next(); },
} };
const router = require('../routes/payment');
const ledger = require('../services/billingLedger');
const stripe = require('stripe')(KEY, { maxNetworkRetries: 5 });

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p) => { const [c, id] = p.split('/'); const s = await db.collection(c).doc(id).get(); return s.exists ? s.data() : null; };
const waitFor = async (fn, timeoutMs = 90000) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(1500); }
  return null;
};
const rows = async (coll, pred) => (await db.collection(coll).get()).docs.map((d) => d.data()).filter(pred);

(async () => {
  const app = express();
  app.use('/payment/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use('/payment', router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/payment`;
  const api = async (method, p, uid, body) => {
    const r = await fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json', 'x-uid': uid }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  const listener = spawn(stripeCli, ['listen', '--api-key', KEY, '--forward-to', `${base}/webhook`, '--skip-verify'], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve) => { const t = setTimeout(resolve, 15000); listener.stderr.on('data', (d) => { if (/Ready!/.test(d.toString())) { clearTimeout(t); resolve(); } }); });
  console.log('stripe listen ready ->', `${base}/webhook\n`);

  const clocks = [];
  const foreignCustomers = [];
  try {
    const UID = 'uid-e2e';
    const clock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now() / 1000), name: 'flacron-ai e2e' });
    clocks.push(clock.id);
    const meta = { app_id: 'flacron-ai', internal_user_id: UID, uid: UID };
    const customer = await stripe.customers.create({ email: 'e2e@flacronai.invalid', test_clock: clock.id, metadata: meta, payment_method: 'pm_card_visa', invoice_settings: { default_payment_method: undefined } });
    const pmVisa = (await stripe.paymentMethods.list({ customer: customer.id, type: 'card' })).data[0].id;
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pmVisa } });
    db.store.set(`users/${UID}`, { version: 1, data: { tier: 'starter', email: 'e2e@flacronai.invalid', stripeCustomerId: customer.id } });

    // 1. Checkout session created by OUR endpoint carries app_id (real Stripe object)
    db.store.set('users/uid-e2e-checkout', { version: 1, data: { tier: 'starter', email: 'uid-e2e-checkout@e2e.invalid' } });
    const sess = await api('POST', '/create-checkout-session', 'uid-e2e-checkout', { tier: 'professional' });
    const realSession = sess.body.sessionId ? await stripe.checkout.sessions.retrieve(sess.body.sessionId) : null;
    const realCustomer = realSession ? await stripe.customers.retrieve(realSession.customer) : null;
    check('checkout session + customer created with app_id metadata', sess.status === 200 && realSession?.metadata?.app_id === 'flacron-ai' && realCustomer?.metadata?.app_id === 'flacron-ai',
      `session=${realSession?.metadata?.app_id} customer=${realCustomer?.metadata?.app_id}`);
    if (realCustomer) await stripe.customers.del(realCustomer.id);

    // 2. Subscription creation (as Checkout would, with subscription_data metadata)
    const sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: process.env.STRIPE_PRICE_PROFESSIONAL }],
      metadata: { ...meta, tier: 'professional', plan: 'professional' } });
    const upgraded = await waitFor(async () => (await get(`users/${UID}`))?.tier === 'professional');
    const firstPay = await waitFor(async () => (await rows('billing_payments', (p) => p.customer_id === customer.id && p.status === 'succeeded'))[0]);
    check('subscription creation -> user upgraded to professional', !!upgraded);
    check('initial invoice payment in ledger (succeeded, application_id=flacron-ai, $39.99)', firstPay?.application_id === 'flacron-ai' && firstPay.amount === 3999, `amount=${firstPay?.amount}`);
    const stampedPi = firstPay ? await stripe.paymentIntents.retrieve(firstPay.stripe_payment_id) : null;
    check('invoice PaymentIntent stamped with app_id', stampedPi?.metadata?.app_id === 'flacron-ai');
    const subRow = await get(`billing_subscriptions/${sub.id}`);
    check('subscription row in ledger', subRow?.application_id === 'flacron-ai' && subRow.status === 'active' && subRow.plan === 'professional', `plan=${subRow?.plan}`);

    // 3. Upgrade through OUR endpoint (proration invoice)
    const up = await api('POST', '/create-checkout-session', UID, { tier: 'agency' });
    const agency = await waitFor(async () => (await get(`users/${UID}`))?.tier === 'agency');
    check('upgrade professional -> agency (immediate, prorated)', up.body.changeType === 'immediate' && !!agency, `changeType=${up.body.changeType}`);
    const prorationPay = await waitFor(async () => (await rows('billing_payments', (p) => p.customer_id === customer.id && p.status === 'succeeded')).length >= 2);
    check('proration payment recorded in ledger', !!prorationPay);

    // 4. Downgrade through OUR endpoint (scheduled at period end)
    const down = await api('POST', '/create-checkout-session', UID, { tier: 'professional' });
    const realSub = await stripe.subscriptions.retrieve(sub.id);
    const schedule = realSub.schedule ? await stripe.subscriptionSchedules.retrieve(realSub.schedule) : null;
    check('downgrade agency -> professional scheduled for period end (schedule tagged)', down.body.changeType === 'scheduled' && schedule?.metadata?.app_id === 'flacron-ai', `changeType=${down.body.changeType}`);

    // 5. Renewal (advance the test clock past the period end)
    const advance = async (seconds) => {
      const c = await stripe.testHelpers.testClocks.retrieve(clock.id);
      await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: c.frozen_time + seconds });
      await waitFor(async () => (await stripe.testHelpers.testClocks.retrieve(clock.id)).status === 'ready', 180000);
    };
    const paidBefore = (await rows('billing_payments', (p) => p.customer_id === customer.id && p.status === 'succeeded')).length;
    await advance(32 * 86400);
    const renewed = await waitFor(async () => (await rows('billing_payments', (p) => p.customer_id === customer.id && p.status === 'succeeded')).length > paidBefore, 120000);
    const afterRenewal = await waitFor(async () => (await get(`users/${UID}`))?.tier === 'professional', 60000);
    check('renewal invoice paid and recorded', !!renewed);
    check('scheduled downgrade applied at renewal (user now professional)', !!afterRenewal);

    // 6. Failed payment on the next renewal
    const failingPm = await stripe.paymentMethods.attach('pm_card_chargeCustomerFail', { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: failingPm.id } });
    await stripe.subscriptions.update(sub.id, { default_payment_method: failingPm.id });
    await advance(32 * 86400);
    const failed = await waitFor(async () => (await rows('billing_payments', (p) => p.customer_id === customer.id && p.status === 'failed'))[0], 120000);
    const pastDue = await waitFor(async () => (await get(`users/${UID}`))?.subscriptionStatus === 'past_due', 60000);
    check('failed renewal stored as failed payment with application_id', failed?.application_id === 'flacron-ai');
    check('failed payment marks user past_due (no new paid access)', !!pastDue);

    // 7. Refund (partial) of the first payment
    await stripe.refunds.create({ payment_intent: firstPay.stripe_payment_id, amount: 1000 });
    const refundRow = await waitFor(async () => (await rows('billing_refunds', (r) => r.payment_id === firstPay.stripe_payment_id && r.status === 'succeeded'))[0]);
    check('partial refund ($10.00) recorded against the payment', refundRow?.amount === 1000 && refundRow.application_id === 'flacron-ai');

    // 8. Cancellation through OUR endpoint, then immediate end
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pmVisa } });
    const cancel = await api('POST', '/cancel-subscription', UID);
    check('cancel endpoint sets cancel_at_period_end', cancel.status === 200 && (await stripe.subscriptions.retrieve(sub.id)).cancel_at_period_end === true);
    await stripe.subscriptions.cancel(sub.id);
    const downgraded = await waitFor(async () => (await get(`users/${UID}`))?.tier === 'starter');
    const canceledRow = await waitFor(async () => (await get(`billing_subscriptions/${sub.id}`))?.status === 'canceled');
    check('subscription deletion -> user back to starter, ledger status canceled', !!downgraded && !!canceledRow);

    // 9. Cross-app isolation: another app's subscription in the SAME account
    const fClock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now() / 1000), name: 'foreign e2e' });
    clocks.push(fClock.id);
    const fMeta = { app_id: 'flacron-verify-foreign', internal_user_id: 'uid-foreign' };
    const fCust = await stripe.customers.create({ email: 'foreign@flacronai.invalid', test_clock: fClock.id, metadata: fMeta, payment_method: 'pm_card_visa' });
    foreignCustomers.push(fCust.id);
    const fPm = (await stripe.paymentMethods.list({ customer: fCust.id, type: 'card' })).data[0].id;
    const fSub = await stripe.subscriptions.create({ customer: fCust.id, default_payment_method: fPm, items: [{ price: process.env.STRIPE_PRICE_AGENCY }], metadata: fMeta });
    const mismatch = await waitFor(async () => (await rows('stripe_events', (e) => e.outcome === 'app_mismatch' && e.attributed_app_id === 'flacron-verify-foreign')).length >= 2, 60000);
    const leaked = (await rows('billing_payments', (p) => p.customer_id === fCust.id)).length + (await rows('billing_subscriptions', (s) => s.stripe_subscription_id === fSub.id)).length;
    check('foreign app events rejected as app_mismatch and logged', !!mismatch);
    check('no foreign rows in FlacronAI ledger', leaked === 0, `leaked=${leaked}`);

    // 10. Duplicate delivery + forged signature (real event payload)
    const realEvent = (await stripe.events.list({ type: 'invoice.paid', limit: 5 })).data.find((e) => e.data.object.customer === customer.id);
    const payload = JSON.stringify(realEvent);
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const dup = await fetch(`${base}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': sig }, body: payload });
    const dupBody = await dup.json();
    check('redelivered event is a duplicate no-op', dup.status === 200 && dupBody.duplicate === true);
    const forged = await fetch(`${base}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' }, body: payload });
    check('forged signature rejected (400)', forged.status === 400);

    // 11. Revenue reconciliation: ledger vs Stripe's own records for this customer
    const charges = (await stripe.charges.list({ customer: customer.id, limit: 100 })).data;
    const stripeGross = charges.filter((c) => c.status === 'succeeded').reduce((s, c) => s + c.amount, 0);
    const stripeRefunds = charges.reduce((s, c) => s + c.amount_refunded, 0);
    const report = await ledger.buildRevenueReport(db, { applicationId: 'flacron-ai', livemode: false });
    const usd = report.currencies.usd || {};
    check('ledger gross == Stripe gross', usd.gross_revenue === stripeGross, `ledger=${usd.gross_revenue} stripe=${stripeGross}`);
    check('ledger refunds == Stripe refunds; net = gross - refunds', usd.refunds === stripeRefunds && usd.net_revenue === stripeGross - stripeRefunds, `refunds ledger=${usd.refunds} stripe=${stripeRefunds}`);
    const foreignReport = await ledger.buildRevenueReport(db, { applicationId: 'flacron-verify-foreign', livemode: false });
    check('foreign app report is empty (no cross-app mixing)', foreignReport.successful_payments === 0);
    console.log('\nFlacronAI test-mode revenue report:', JSON.stringify({ ...report, generated_at: undefined }));
  } catch (err) {
    check('script completed without error', false, err.message);
  } finally {
    for (const c of clocks) { try { await stripe.testHelpers.testClocks.del(c); } catch { /* best effort */ } }
    listener.kill();
    server.close();
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
  }
})();
