// Billing ledger: FlacronAI's copy of every Stripe record that matters for
// revenue reporting, each row tagged with `application_id` so the central
// management platform can filter one app or merge all apps. Same collection
// and field names as EnergyVerse (apps/api/app/billing/ledger.py).
//
// Server-only: firestore.rules has no rule for these collections, so client
// SDK access is denied by default.
//
// Writes are idempotent upserts keyed by the Stripe object id, storing the
// object's current state -- replaying an event (or a resync) converges on the
// same row instead of double counting.

const { APP_ID } = require('../config/stripeApp');

const COLLECTIONS = Object.freeze({
  events: 'stripe_events',
  customers: 'billing_customers',
  subscriptions: 'billing_subscriptions',
  invoices: 'billing_invoices',
  payments: 'billing_payments',
  refunds: 'billing_refunds',
});

// Only these statuses are revenue. Failed/incomplete/pending payments never are.
const REVENUE_PAYMENT_STATUS = 'succeeded';
const REVENUE_REFUND_STATUS = 'succeeded';
const MRR_SUBSCRIPTION_STATUSES = new Set(['active', 'past_due']);

const nowIso = () => new Date().toISOString();
const toIso = (unixSeconds) => (unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null);
const idOf = (v) => (v && typeof v === 'object' ? v.id : v) || null;

const base = (obj) => ({
  application_id: APP_ID,
  livemode: !!obj.livemode,
  updated_at: nowIso(),
});

const upsert = (db, collection, id, data) => db.collection(collection).doc(id).set(data, { merge: true });

// ── Records ──────────────────────────────────────────────────────────────────

const recordCustomer = (db, customer, { internalUserId } = {}) =>
  upsert(db, COLLECTIONS.customers, customer.id, {
    ...base(customer),
    stripe_customer_id: customer.id,
    internal_user_id: internalUserId || customer.metadata?.internal_user_id || null,
    email: customer.email || null,
    created_at: toIso(customer.created),
  });

const recordSubscription = (db, sub, { plan, interval, internalUserId } = {}) => {
  const item = sub.items?.data?.[0];
  const price = item?.price || {};
  return upsert(db, COLLECTIONS.subscriptions, sub.id, {
    ...base(sub),
    stripe_subscription_id: sub.id,
    stripe_customer_id: idOf(sub.customer),
    internal_user_id: internalUserId || sub.metadata?.internal_user_id || null,
    plan: plan || sub.metadata?.plan || null,
    interval: interval || price.recurring?.interval || null,
    stripe_price_id: price.id || null,
    status: sub.status,
    amount: price.unit_amount != null ? price.unit_amount * (item?.quantity || 1) : null,
    currency: price.currency || null,
    current_period_end: toIso(sub.current_period_end ?? item?.current_period_end),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    canceled_at: toIso(sub.canceled_at),
    created_at: toIso(sub.created),
  });
};

const recordInvoice = (db, inv) =>
  upsert(db, COLLECTIONS.invoices, inv.id, {
    ...base(inv),
    stripe_invoice_id: inv.id,
    stripe_customer_id: idOf(inv.customer),
    stripe_subscription_id: idOf(inv.subscription) || idOf(inv.parent?.subscription_details?.subscription),
    status: inv.status,
    amount_due: inv.amount_due ?? null,
    amount_paid: inv.amount_paid ?? null,
    currency: inv.currency || null,
    billing_reason: inv.billing_reason || null,
    payment_ids: [idOf(inv.payment_intent)].filter(Boolean),
    created_at: toIso(inv.created),
  });

// `status` is our normalized status: 'succeeded' | 'failed' | 'pending'.
const recordPayment = (db, { paymentIntent, status, invoice = null, failureMessage = null, kind, internalUserId }) =>
  upsert(db, COLLECTIONS.payments, paymentIntent.id, {
    ...base(paymentIntent),
    stripe_payment_id: paymentIntent.id,
    customer_id: idOf(paymentIntent.customer) || idOf(invoice?.customer),
    internal_user_id: internalUserId || paymentIntent.metadata?.internal_user_id || null,
    stripe_invoice_id: idOf(invoice) || null,
    stripe_subscription_id: idOf(invoice?.subscription) || null,
    kind: kind || (invoice ? 'subscription' : 'one_time'),
    status,
    amount: paymentIntent.amount_received || paymentIntent.amount || invoice?.amount_paid || invoice?.amount_due || 0,
    amount_refunded: 0,
    currency: paymentIntent.currency || invoice?.currency || null,
    failure_message: failureMessage || paymentIntent.last_payment_error?.message || null,
    created_at: toIso(paymentIntent.created),
  });

const recordRefund = (db, refund, { paymentId }) =>
  upsert(db, COLLECTIONS.refunds, refund.id, {
    ...base(refund),
    stripe_refund_id: refund.id,
    payment_id: paymentId || idOf(refund.payment_intent),
    charge_id: idOf(refund.charge),
    amount: refund.amount,
    currency: refund.currency,
    status: refund.status,
    reason: refund.reason || null,
    created_at: toIso(refund.created),
  });

const setPaymentRefundedAmount = (db, paymentId, amountRefunded) =>
  upsert(db, COLLECTIONS.payments, paymentId, { amount_refunded: amountRefunded, updated_at: nowIso() });

const getPayment = async (db, paymentId) => {
  const snap = await db.collection(COLLECTIONS.payments).doc(paymentId).get();
  return snap.exists ? snap.data() : null;
};

// ── Event log (idempotency + attribution audit) ─────────────────────────────

const getEvent = async (db, eventId) => {
  const snap = await db.collection(COLLECTIONS.events).doc(eventId).get();
  return snap.exists ? snap.data() : null;
};

// outcome: 'processed' | 'ignored' | 'app_mismatch' | 'unattributed' | 'mode_mismatch'
const recordEvent = (db, event, { outcome, attributedAppId = null, detail = null }) =>
  db.collection(COLLECTIONS.events).doc(event.id).set({
    application_id: APP_ID,
    stripe_event_id: event.id,
    type: event.type,
    livemode: !!event.livemode,
    outcome,
    attributed_app_id: attributedAppId,
    detail,
    received_at: nowIso(),
  });

// ── Reporting ────────────────────────────────────────────────────────────────

// applicationId: an app id, or 'all' for company-wide. livemode filters test
// rows out of live reports. Totals are per currency (never summed across).
const fetchRows = async (db, collection, { applicationId, livemode }) => {
  let q = db.collection(collection);
  if (applicationId && applicationId !== 'all') q = q.where('application_id', '==', applicationId);
  if (livemode !== undefined && livemode !== null) q = q.where('livemode', '==', !!livemode);
  const snap = await q.get();
  return snap.docs.map((d) => d.data());
};

const monthlyAmount = (sub) => {
  if (!sub.amount) return 0;
  if (sub.interval === 'year') return sub.amount / 12;
  if (sub.interval === 'week') return (sub.amount * 52) / 12;
  return sub.amount;
};

const buildRevenueReport = async (db, { applicationId = APP_ID, livemode } = {}) => {
  const [payments, refunds, subscriptions, customers] = await Promise.all([
    fetchRows(db, COLLECTIONS.payments, { applicationId, livemode }),
    fetchRows(db, COLLECTIONS.refunds, { applicationId, livemode }),
    fetchRows(db, COLLECTIONS.subscriptions, { applicationId, livemode }),
    fetchRows(db, COLLECTIONS.customers, { applicationId, livemode }),
  ]);

  const byCurrency = {};
  const bucket = (cur) => (byCurrency[cur || 'unknown'] ||= {
    gross_revenue: 0, refunds: 0, net_revenue: 0, mrr: 0, arr: 0,
  });

  let successful = 0, failed = 0;
  for (const p of payments) {
    if (p.status === REVENUE_PAYMENT_STATUS) { successful++; bucket(p.currency).gross_revenue += p.amount || 0; }
    else if (p.status === 'failed') failed++;
  }
  for (const r of refunds) {
    if (r.status === REVENUE_REFUND_STATUS) bucket(r.currency).refunds += r.amount || 0;
  }
  let active = 0, cancelled = 0;
  for (const s of subscriptions) {
    if (MRR_SUBSCRIPTION_STATUSES.has(s.status)) { active++; bucket(s.currency).mrr += monthlyAmount(s); }
    if (s.status === 'canceled') cancelled++;
  }
  for (const b of Object.values(byCurrency)) {
    b.net_revenue = b.gross_revenue - b.refunds;
    b.mrr = Math.round(b.mrr);
    b.arr = b.mrr * 12;
  }

  return {
    application_id: applicationId,
    livemode: livemode === undefined ? null : !!livemode,
    amounts_in: 'minor units (cents)',
    currencies: byCurrency,
    successful_payments: successful,
    failed_payments: failed,
    refund_count: refunds.filter((r) => r.status === REVENUE_REFUND_STATUS).length,
    active_subscriptions: active,
    cancelled_subscriptions: cancelled,
    customer_count: customers.length,
    generated_at: nowIso(),
  };
};

module.exports = {
  COLLECTIONS,
  recordCustomer,
  recordSubscription,
  recordInvoice,
  recordPayment,
  recordRefund,
  setPaymentRefundedAmount,
  getPayment,
  getEvent,
  recordEvent,
  buildRevenueReport,
};
