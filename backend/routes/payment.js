const express = require('express');
const router = express.Router();
// Network retries are safe: stripe-node sends an idempotency key with every
// retried POST, so a transient failure can never create a duplicate charge.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
const { getFirestore } = require('../config/firebase');
const { authenticateToken } = require('../middleware/auth');
const { sendPaymentFailedEmail } = require('../services/emailService');
const { isNotificationEnabled } = require('../utils/notificationPrefs');
const { notifyUser, NOTIFICATION_TYPES } = require('../utils/notificationService');
const {
  TIER_ORDER,
  TIERS,
  getStripePriceId,
  getTierKeyFromStripePriceId,
  getBaseTier,
} = require('../config/tiers');
const { photoAddOnCheckoutLimiter } = require('../middleware/rateLimiters');
const {
  resolveStripeMode,
  resolveActivePack,
  getPackPriceId,
  getPublicCatalogue,
} = require('../config/photoAddOnPacks');
const {
  createCheckoutIntent,
  markSessionCreated,
  markSessionFailed,
  getCheckoutIntent,
  fulfillCheckoutIntent,
  markExpired,
  applyRefund,
  applyDisputeCreated,
  applyDisputeClosed,
  toSanitizedPurchase,
} = require('../utils/photoAddOnPurchases');
const { getPlanConfig, resolvePlanContext, PLAN_IDS, UNLIMITED } = require('../config/planConfig');
const {
  APP_ID,
  STRIPE_LIVEMODE,
  appMetadata,
  appIdFrom,
  classifyAppId,
  describeKeyConfig,
} = require('../config/stripeApp');
const ledger = require('../services/billingLedger');

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);

{
  const { appId, mode, warnings } = describeKeyConfig();
  console.log(`💳 Stripe: app_id=${appId}, mode=${mode}`);
  warnings.forEach((w) => console.warn(`⚠️  Stripe: ${w}`));
}

const isMissing = (err) => err?.code === 'resource_missing' || err?.statusCode === 404;

// Ids stored on a user doc may belong to a previous Stripe account (FlacronAI
// moved to the shared Flacron Enterprises account). A missing object is
// treated as absent instead of failing the request.
const retrieveOrNull = async (fn, id) => {
  if (!id) return null;
  try {
    return await fn(id);
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
};

// Standard metadata for this user's Stripe objects. `uid` is kept for
// backward compatibility with objects created before the standard.
const userMetadata = (uid, extra = {}) => appMetadata({ internal_user_id: uid, uid, ...extra });

// A Price may only be sold if it is ours: active, tagged with our app_id and
// in the same mode as the key. Cached briefly (Prices are immutable).
const priceOwnershipCache = new Map();
const PRICE_CACHE_MS = 10 * 60 * 1000;
const assertPriceIsOurs = async (priceId) => {
  const hit = priceOwnershipCache.get(priceId);
  if (hit && hit.expires > Date.now()) return hit.ok;
  const price = await retrieveOrNull((id) => stripe.prices.retrieve(id), priceId);
  const ok = !!price && price.active && appIdFrom(price) === APP_ID && price.livemode === STRIPE_LIVEMODE;
  if (!ok) {
    console.error(`Stripe price ${priceId} rejected: ${price ? `active=${price.active} app_id=${appIdFrom(price)} livemode=${price.livemode}` : 'not found'}`);
  }
  priceOwnershipCache.set(priceId, { ok, expires: Date.now() + PRICE_CACHE_MS });
  return ok;
};

// Reuse the user's customer only if it is ours (or untagged legacy, which is
// adopted and stamped). Never reuse another app's customer.
const getOrCreateCustomer = async (db, uid, email, userData) => {
  const existing = await retrieveOrNull((id) => stripe.customers.retrieve(id), userData.stripeCustomerId);
  if (existing && !existing.deleted) {
    const cls = classifyAppId(existing);
    if (cls === 'match') return existing.id;
    if (cls === 'missing') {
      const stamped = await stripe.customers.update(existing.id, { metadata: userMetadata(uid) });
      await ledger.recordCustomer(db, stamped, { internalUserId: uid });
      return existing.id;
    }
    console.warn(`Customer ${existing.id} belongs to app ${appIdFrom(existing)} -- creating a ${APP_ID} customer instead`);
  }
  const customer = await stripe.customers.create({
    email,
    name: userData.displayName || '',
    metadata: userMetadata(uid),
  });
  await db.collection('users').doc(uid).update({ stripeCustomerId: customer.id });
  await ledger.recordCustomer(db, customer, { internalUserId: uid });
  return customer.id;
};

const getSubscriptionTierKey = subscription =>
  getTierKeyFromStripePriceId(subscription.items?.data?.[0]?.price?.id);

const persistSubscription = async (userRef, subscription, tierKey = getSubscriptionTierKey(subscription)) => {
  const tier = getBaseTier(tierKey);
  if (!tierKey || !TIER_ORDER.includes(tier)) return null;

  await userRef.update({
    tier,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: subscription.customer,
    subscriptionStatus: subscription.cancel_at_period_end ? 'cancelling' : subscription.status,
    stripeSubscriptionCreatedAt: subscription.created,
    updatedAt: new Date().toISOString(),
  });

  return tier;
};

const findActiveSubscription = async customerId => {
  if (!customerId) return null;
  let subscriptions;
  try {
    subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 });
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
  return subscriptions.data
    .filter(subscription => ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status))
    // Only this app's subscriptions (untagged legacy ones still count).
    .filter(subscription => classifyAppId(subscription) !== 'mismatch')
    .sort((a, b) => b.created - a.created)[0] || null;
};

// POST /api/payment/create-checkout-session
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  const { tier } = req.body;
  const priceId = getStripePriceId(tier);

  if (!priceId) {
    return res.status(400).json({ success: false, error: 'Invalid tier or tier not configured', code: 'INVALID_TIER' });
  }

  try {
    if (!(await assertPriceIsOurs(priceId))) {
      return res.status(503).json({ success: false, error: 'This plan is not available right now.', code: 'PRICE_NOT_CONFIGURED' });
    }

    const db = getFirestore();
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userData = userDoc.data() || {};

    const customerId = await getOrCreateCustomer(db, req.user.uid, req.user.email, userData);

    let existingSubscription = await retrieveOrNull((id) => stripe.subscriptions.retrieve(id), userData.stripeSubscriptionId);
    if (existingSubscription && classifyAppId(existingSubscription) === 'mismatch') existingSubscription = null;
    if (!existingSubscription || !ACTIVE_SUBSCRIPTION_STATUSES.has(existingSubscription.status)) {
      existingSubscription = await findActiveSubscription(customerId);
    }

    if (existingSubscription) {
      const currentTierKey = getSubscriptionTierKey(existingSubscription);
      const currentTier = getBaseTier(currentTierKey);
      const requestedTier = getBaseTier(tier);

      if (currentTierKey === tier) {
        await persistSubscription(db.collection('users').doc(req.user.uid), existingSubscription, tier);
        return res.json({
          success: true,
          changeType: 'unchanged',
          tier: requestedTier,
          message: 'This plan is already active.',
        });
      }

      const isUpgrade = TIER_ORDER.indexOf(requestedTier) > TIER_ORDER.indexOf(currentTier);
      if (isUpgrade || currentTier === requestedTier) {
        const updatedSubscription = await stripe.subscriptions.update(existingSubscription.id, {
          cancel_at_period_end: false,
          items: [{ id: existingSubscription.items.data[0].id, price: priceId }],
          metadata: userMetadata(req.user.uid, { tier, plan: requestedTier }),
          proration_behavior: 'always_invoice',
          payment_behavior: 'error_if_incomplete',
          expand: ['latest_invoice.payment_intent'],
        });

        const effectiveTierKey = getSubscriptionTierKey(updatedSubscription);
        if (effectiveTierKey === tier) {
          await persistSubscription(db.collection('users').doc(req.user.uid), updatedSubscription, tier);
        }
        await ledger.recordSubscription(db, updatedSubscription, { plan: requestedTier, internalUserId: req.user.uid });

        return res.json({
          success: true,
          changeType: 'immediate',
          tier: requestedTier,
          message: 'Plan changed with a prorated adjustment for unused time.',
        });
      }

      const schedule = existingSubscription.schedule
        ? await stripe.subscriptionSchedules.retrieve(existingSubscription.schedule)
        : await stripe.subscriptionSchedules.create({ from_subscription: existingSubscription.id });
      const scheduleMetadata = userMetadata(req.user.uid, { tier, plan: requestedTier });
      const currentPhase = schedule.phases.find(phase => phase.end_date === existingSubscription.current_period_end)
        || schedule.phases[0];

      await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: 'release',
        metadata: scheduleMetadata,
        phases: [
          {
            start_date: currentPhase.start_date,
            end_date: existingSubscription.current_period_end,
            items: currentPhase.items.map(item => ({ price: item.price, quantity: item.quantity || 1 })),
          },
          {
            start_date: existingSubscription.current_period_end,
            items: [{ price: priceId, quantity: 1 }],
            metadata: scheduleMetadata,
          },
        ],
      });

      return res.json({
        success: true,
        changeType: 'scheduled',
        tier: requestedTier,
        effectiveAt: new Date(existingSubscription.current_period_end * 1000).toISOString(),
        message: 'Downgrade scheduled for the end of the current billing period.',
      });
    }

    const checkoutMetadata = userMetadata(req.user.uid, { tier, plan: getBaseTier(tier) });
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: req.user.uid,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/dashboard?upgrade=success&tier=${tier}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?cancelled=true`,
      metadata: checkoutMetadata,
      subscription_data: { metadata: checkoutMetadata },
    });

    return res.json({ success: true, sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Checkout session error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create checkout session', code: 'STRIPE_ERROR' });
  }
});

// GET /api/payment/public-plan-config — Phase 48 (Pricing Page, Admin
// Configuration UI & Cross-Surface Consistency). The ONE sanitized,
// server-derived read model the public pricing page (and any other
// unauthenticated marketing surface) consumes for plan photo limits and
// add-on pack pricing -- the SAME PlanConfig/catalogue Phase 44/45
// enforcement already reads, never a separately maintained copy. No auth
// required (matches the ai-status/property-lookup/config precedent: a safe
// feature/pricing check every visitor can make before signing up). Never
// includes a Stripe Price ID, secret, admin identity, or internal Firestore
// path -- see photoAddOnPacks.js's toPublicPack/getPublicCatalogue and this
// handler's own field list below.
router.get('/public-plan-config', async (req, res) => {
  try {
    const db = getFirestore();
    const { config: planConfig, source } = await getPlanConfig(db);
    const mode = resolveStripeMode();

    const plans = Object.fromEntries(
      PLAN_IDS.map((id) => {
        const limits = planConfig.plans[id];
        const unlimited = limits.basePhotoLimit === UNLIMITED;
        return [
          id,
          {
            label: (planConfig.displayLabels && planConfig.displayLabels[id]) || TIERS[id]?.name || id,
            basePhotoLimit: unlimited ? null : limits.basePhotoLimit,
            unlimited,
          },
        ];
      })
    );

    const packs = getPublicCatalogue().map((p) => ({
      ...p,
      available: !!planConfig.addOnsEnabled && !!getPackPriceId(resolveActivePack(p.id), mode),
    }));
    const checkoutAvailable = packs.some((p) => p.available);

    return res.json({
      success: true,
      plans,
      addOns: {
        enabled: !!planConfig.addOnsEnabled,
        reportSpecific: true,
        checkoutAvailable,
        packs,
      },
      configSource: source, // 'firestore' | 'fallback' -- never raw validation error strings
    });
  } catch (err) {
    console.error('Public plan config error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load pricing configuration', code: 'PUBLIC_PLAN_CONFIG_ERROR' });
  }
});

// GET /api/payment/photo-packs — Phase 45 (Stripe Report-Specific Photo
// Add-Ons). Sanitized, public-safe catalogue: display info only (label,
// capacity, price, currency) plus a per-pack `available` flag -- never a
// Stripe Price ID or which internal config slot is/isn't set.
router.get('/photo-packs', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const { config: planConfig } = await getPlanConfig(db);
    const mode = resolveStripeMode();
    const packs = getPublicCatalogue().map((p) => ({
      ...p,
      available: !!planConfig.addOnsEnabled && !!getPackPriceId(resolveActivePack(p.id), mode),
    }));
    return res.json({ success: true, enabled: !!planConfig.addOnsEnabled, packs });
  } catch (err) {
    console.error('Photo pack catalogue error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load photo packs', code: 'CATALOGUE_ERROR' });
  }
});

// POST /api/payment/photo-pack-checkout — client sends only { reportId,
// packId }; every authoritative attribute (amount, currency, capacity,
// Stripe Price ID) is resolved server-side from the trusted catalogue.
router.post('/photo-pack-checkout', authenticateToken, photoAddOnCheckoutLimiter, async (req, res) => {
  try {
    const reportId = String(req.body?.reportId || '').trim();
    const packId = String(req.body?.packId || '').trim();
    if (!reportId || !packId) {
      return res.status(400).json({ success: false, error: 'reportId and packId are required', code: 'INVALID_REQUEST' });
    }

    const db = getFirestore();
    const ownerDoc = await db.collection('users').doc(req.user.uid).get();
    const ownerData = ownerDoc.data() || {};

    // Enterprise/unlimited never needs purchased capacity -- checked before
    // touching Stripe or the pack catalogue at all, using only the
    // requester's own account tier (never report-specific data), so this can
    // never be used to probe another report's existence or status.
    const planCtx = await resolvePlanContext(db, ownerData.tier);
    if (planCtx.unlimited) {
      return res.json({ success: true, unlimited: true, message: 'Your plan already includes unlimited photo capacity.' });
    }

    const { config: planConfig } = await getPlanConfig(db);
    if (!planConfig.addOnsEnabled) {
      return res.status(503).json({ success: false, error: 'Photo capacity add-ons are not currently available.', code: 'ADDONS_DISABLED' });
    }

    const pack = resolveActivePack(packId);
    if (!pack) {
      return res.status(400).json({ success: false, error: 'Unknown or inactive photo pack', code: 'INVALID_PACK' });
    }

    const mode = resolveStripeMode();
    const priceId = getPackPriceId(pack, mode);
    if (!priceId || !(await assertPriceIsOurs(priceId))) {
      return res.status(503).json({
        success: false,
        error: 'Photo capacity add-ons are not currently configured.',
        code: 'STRIPE_ADDONS_NOT_CONFIGURED',
      });
    }

    let intent;
    try {
      intent = await createCheckoutIntent(db, { uid: req.user.uid, reportId, pack, mode });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
      }
      if (err.code === 'REPORT_FINALIZED') {
        return res.status(409).json({ success: false, error: err.message, code: 'REPORT_FINALIZED' });
      }
      throw err;
    }

    const successUrl = `${process.env.FRONTEND_URL}/reports/${reportId}/preview?photoPackCheckout=success&session_id={CHECKOUT_SESSION_ID}&intentId=${intent.id}`;
    const cancelUrl = `${process.env.FRONTEND_URL}/reports/${reportId}/preview?photoPackCheckout=cancelled&intentId=${intent.id}`;

    let session;
    try {
      const customerId = await getOrCreateCustomer(db, req.user.uid, req.user.email, ownerData);
      const packMetadata = userMetadata(req.user.uid, { checkoutIntentId: intent.id, reportId, product: 'photo_pack', packId: pack.id });
      session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          payment_method_types: ['card'],
          customer: customerId,
          client_reference_id: req.user.uid,
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: { ...packMetadata, schemaVersion: '1' },
          payment_intent_data: { metadata: packMetadata },
        },
        // Protects against stripe-node's own automatic network-error retry
        // creating a second Checkout Session for the same stored intent.
        { idempotencyKey: `photopack_${intent.id}` }
      );
    } catch (err) {
      console.error('Photo pack checkout session error:', err.message);
      await markSessionFailed(db, intent.id, { reason: err.message });
      return res.status(502).json({
        success: false,
        error: 'Failed to create checkout session. Please try again.',
        code: 'CHECKOUT_SESSION_FAILED',
      });
    }

    await markSessionCreated(db, intent.id, { stripeSessionId: session.id });

    return res.json({ success: true, checkoutIntentId: intent.id, url: session.url });
  } catch (err) {
    console.error('Photo pack checkout error:', err);
    return res.status(500).json({ success: false, error: 'Failed to start checkout', code: 'STRIPE_ERROR' });
  }
});

// POST /api/payment/photo-pack-checkout/:intentId/sync — after Stripe
// redirects back to the app, the query string is NEVER trusted; this
// retrieves the Checkout Session server-side and, only if Stripe reports it
// paid, fulfills through the exact same atomic path the webhook uses
// (fulfillCheckoutIntent is idempotent either way). The webhook remains the
// authoritative, required fulfillment path for reliability -- this only
// shortens the visible wait when the redirect lands before the webhook does.
router.post('/photo-pack-checkout/:intentId/sync', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const intent = await getCheckoutIntent(db, req.params.intentId);
    if (!intent || intent.uid !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Checkout not found', code: 'NOT_FOUND' });
    }

    if (intent.stripeSessionId && (intent.status === 'pending' || intent.status === 'session_created')) {
      const session = await stripe.checkout.sessions.retrieve(intent.stripeSessionId);
      if (session.status === 'expired') {
        await markExpired(db, intent.id, {});
      } else if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
        await fulfillCheckoutIntent(db, intent.id, { stripeSession: session, source: 'sync' });
      }
      // Otherwise payment is still in flight -- leave the intent untouched.
    }

    const refreshed = await getCheckoutIntent(db, intent.id);
    return res.json({ success: true, purchase: toSanitizedPurchase(refreshed) });
  } catch (err) {
    console.error('Photo pack checkout sync error:', err);
    return res.status(500).json({ success: false, error: 'Failed to sync checkout status', code: 'STRIPE_ERROR' });
  }
});

// POST /api/payment/webhook
//
// Centralized Stripe standard: every event is (1) signature-verified,
// (2) deduplicated on its event id (stripe_events), (3) checked for mode and
// (4) attributed to an app_id from the Stripe object itself or a fresh read of
// its parent (subscription / PaymentIntent / invoice). Only events that carry
// OUR app_id are applied. Mismatched or untagged events are logged and
// recorded in stripe_events, and acknowledged with 200 so Stripe does not retry
// them -- arriving on this URL is never treated as proof of ownership.

// Events this app applies; anything else is acknowledged and logged as 'ignored'.
const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.expired',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'payment_intent.payment_failed',
  'charge.refunded',
  'refund.created',
  'refund.updated',
  'refund.failed',
  'charge.dispute.created',
  'charge.dispute.closed',
]);

const idOf = (v) => (v && typeof v === 'object' ? v.id : v) || null;

// Resolve the app_id owning a PaymentIntent: its own metadata, or (for
// subscription invoices, whose PaymentIntents Checkout cannot tag) the
// subscription behind its invoice.
const appIdForPaymentIntent = async (paymentIntentId) => {
  const pi = await retrieveOrNull((id) => stripe.paymentIntents.retrieve(id), paymentIntentId);
  if (!pi) return { pi: null, appId: null };
  if (appIdFrom(pi)) return { pi, appId: appIdFrom(pi) };
  if (pi.invoice) {
    const inv = await retrieveOrNull((id) => stripe.invoices.retrieve(id), idOf(pi.invoice));
    const subId = idOf(inv?.subscription);
    const sub = subId ? await retrieveOrNull((id) => stripe.subscriptions.retrieve(id), subId) : null;
    return { pi, appId: appIdFrom(inv) || appIdFrom(sub) };
  }
  return { pi, appId: null };
};

// Returns { appId, context } for an event (appId null = untagged).
const attributeEvent = async (event) => {
  const obj = event.data.object || {};
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.expired':
      return { appId: appIdFrom(obj), context: {} };
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return { appId: appIdFrom(obj), context: {} };
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const subId = idOf(obj.subscription);
      const sub = subId ? await retrieveOrNull((id) => stripe.subscriptions.retrieve(id), subId) : null;
      return { appId: appIdFrom(obj) || appIdFrom(sub) || appIdFrom(obj.subscription_details), context: { subscription: sub } };
    }
    case 'payment_intent.payment_failed': {
      // Subscription-invoice PaymentIntents are untagged; attribute via the invoice.
      if (appIdFrom(obj) || !obj.invoice) return { appId: appIdFrom(obj), context: { paymentIntent: obj } };
      const { appId } = await appIdForPaymentIntent(obj.id);
      return { appId, context: { paymentIntent: obj } };
    }
    case 'charge.refunded':
    case 'charge.dispute.created':
    case 'charge.dispute.closed':
    case 'refund.created':
    case 'refund.updated':
    case 'refund.failed': {
      const { pi, appId } = await appIdForPaymentIntent(idOf(obj.payment_intent));
      return { appId, context: { paymentIntent: pi } };
    }
    default:
      return { appId: null, context: {} };
  }
};

// Ledger: a subscription invoice's payment. Stamps app_id on the invoice's
// PaymentIntent (Checkout cannot) so every PaymentIntent is attributable.
const ledgerInvoicePayment = async (db, invoice, status) => {
  await ledger.recordInvoice(db, invoice);
  const piId = idOf(invoice.payment_intent);
  if (!piId) return; // $0 invoice (trial/coupon) -- no payment to record
  let pi = await retrieveOrNull((id) => stripe.paymentIntents.retrieve(id), piId);
  if (!pi) return;
  if (!appIdFrom(pi)) {
    try {
      pi = await stripe.paymentIntents.update(pi.id, { metadata: appMetadata(pi.metadata?.internal_user_id ? { internal_user_id: pi.metadata.internal_user_id } : {}) });
    } catch (err) {
      console.warn(`Could not stamp app_id on ${pi.id}: ${err.message}`);
    }
  }
  await ledger.recordPayment(db, {
    paymentIntent: pi,
    invoice,
    status,
    kind: 'subscription',
    failureMessage: status === 'failed' ? (pi.last_payment_error?.message || 'payment failed') : null,
  });
};

const ledgerRefundsForPaymentIntent = async (db, paymentIntentId) => {
  if (!paymentIntentId) return;
  const refunds = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 });
  let refunded = 0;
  for (const r of refunds.data) {
    await ledger.recordRefund(db, r, { paymentId: paymentIntentId });
    if (r.status === 'succeeded') refunded += r.amount;
  }
  if (await ledger.getPayment(db, paymentIntentId)) {
    await ledger.setPaymentRefundedAmount(db, paymentIntentId, refunded);
  }
};

const syncUserSubscription = async (db, sub) => {
  let snapshot = await db.collection('users').where('stripeSubscriptionId', '==', sub.id).limit(1).get();
  if (snapshot.empty && (sub.metadata?.internal_user_id || sub.metadata?.uid)) {
    const userDoc = await db.collection('users').doc(sub.metadata.internal_user_id || sub.metadata.uid).get();
    snapshot = userDoc.exists ? { empty: false, docs: [userDoc] } : snapshot;
  }
  if (!snapshot.empty) {
    const tierKey = getSubscriptionTierKey(sub) || sub.metadata?.tier;
    await persistSubscription(snapshot.docs[0].ref, sub, tierKey);
  }
};

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  const db = getFirestore();

  // Idempotency: every processed event id is stored; redeliveries are no-ops.
  // (processedWebhooks is the pre-standard store, still honoured.)
  const [seen, legacySeen] = await Promise.all([
    ledger.getEvent(db, event.id),
    db.collection('processedWebhooks').doc(event.id).get(),
  ]);
  if (seen || legacySeen.exists) {
    return res.json({ received: true, duplicate: true });
  }

  // A test event must never touch live data, and vice versa.
  if (typeof event.livemode === 'boolean' && event.livemode !== STRIPE_LIVEMODE) {
    console.warn(`[stripe webhook] mode mismatch: event ${event.id} livemode=${event.livemode}, key livemode=${STRIPE_LIVEMODE}`);
    await ledger.recordEvent(db, event, { outcome: 'mode_mismatch' });
    return res.json({ received: true, ignored: 'mode_mismatch' });
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    await ledger.recordEvent(db, event, { outcome: 'ignored' });
    return res.json({ received: true, ignored: 'unhandled_type' });
  }

  try {
    const { appId, context } = await attributeEvent(event);
    if (appId !== APP_ID) {
      const outcome = appId ? 'app_mismatch' : 'unattributed';
      const log = appId ? console.warn : console.info;
      log('[stripe webhook] app_id rejected', { eventId: event.id, type: event.type, expected: APP_ID, received: appId });
      await ledger.recordEvent(db, event, { outcome, attributedAppId: appId });
      return res.json({ received: true, ignored: outcome });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        // Phase 45: a report-specific photo add-on is a `mode: 'payment'`
        // Checkout Session carrying our own opaque `checkoutIntentId` --
        // fully additive, and mutually exclusive with the `mode:
        // 'subscription'` tier-upgrade path below.
        const checkoutIntentId = session.metadata?.checkoutIntentId;
        if (checkoutIntentId) {
          const result = await fulfillCheckoutIntent(db, checkoutIntentId, {
            stripeSession: session,
            eventId: event.id,
            source: 'webhook',
          });
          if (!result.fulfilled && !result.alreadyFulfilled) {
            console.error(`Photo add-on fulfillment rejected for intent ${checkoutIntentId}: ${result.reason}`);
          }
          if (session.payment_intent && session.payment_status === 'paid') {
            const pi = await retrieveOrNull((id) => stripe.paymentIntents.retrieve(id), idOf(session.payment_intent));
            if (pi) await ledger.recordPayment(db, { paymentIntent: pi, status: 'succeeded', kind: 'one_time' });
          }
          break;
        }

        const uid = session.metadata?.internal_user_id || session.metadata?.uid;
        const tier = getBaseTier(session.metadata?.tier); // strip _annual suffix
        if (uid && tier && session.subscription) {
          const userRef = db.collection('users').doc(uid);
          const [userDoc, subscription] = await Promise.all([
            userRef.get(),
            stripe.subscriptions.retrieve(idOf(session.subscription)),
          ]);
          const previousCreatedAt = userDoc.data()?.stripeSubscriptionCreatedAt || 0;
          if (subscription.created >= previousCreatedAt) {
            await persistSubscription(userRef, subscription, session.metadata?.tier);
            console.log(`✅ User ${uid} upgraded to ${tier}`);
          }
          await ledger.recordSubscription(db, subscription, { plan: tier, internalUserId: uid });
        }
        break;
      }

      // Phase 45: the Checkout Session's own 24h expiry -- grants nothing.
      case 'checkout.session.expired': {
        const checkoutIntentId = event.data.object.metadata?.checkoutIntentId;
        if (checkoutIntentId) await markExpired(db, checkoutIntentId, { eventId: event.id });
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        await syncUserSubscription(db, sub);
        if (event.type === 'customer.subscription.created') {
          // Customer count must include customers created outside our endpoint.
          const customer = await retrieveOrNull((id) => stripe.customers.retrieve(id), idOf(sub.customer));
          if (customer && !customer.deleted) await ledger.recordCustomer(db, customer);
        }
        await ledger.recordSubscription(db, sub, { plan: getBaseTier(getSubscriptionTierKey(sub) || sub.metadata?.tier) });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const snapshot = await db.collection('users').where('stripeSubscriptionId', '==', subscription.id).limit(1).get();
        if (!snapshot.empty) {
          await snapshot.docs[0].ref.update({
            tier: 'starter',
            subscriptionStatus: 'cancelled',
            stripeSubscriptionId: null,
            updatedAt: new Date().toISOString(),
          });
        } else {
          console.log(`Ignored deletion of non-current subscription ${subscription.id} for customer ${subscription.customer}`);
        }
        await ledger.recordSubscription(db, subscription, { plan: getBaseTier(getSubscriptionTierKey(subscription) || subscription.metadata?.tier) });
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        await ledgerInvoicePayment(db, invoice, 'succeeded');
        if (context.subscription) {
          await ledger.recordSubscription(db, context.subscription, {
            plan: getBaseTier(getSubscriptionTierKey(context.subscription) || context.subscription.metadata?.tier),
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        // A failed payment never grants or keeps paid access by itself and is
        // stored as 'failed' (never revenue).
        await ledgerInvoicePayment(db, invoice, 'failed');
        const snapshot = await db.collection('users').where('stripeCustomerId', '==', idOf(invoice.customer)).limit(1).get();
        if (!snapshot.empty) {
          const userData = snapshot.docs[0].data();
          // Phase 18 (Notifications): gated by 'billing' (defaults enabled).
          if (isNotificationEnabled(userData.notifications, 'billing')) {
            sendPaymentFailedEmail(userData.email, userData.displayName).catch(() => {});
            notifyUser(db, snapshot.docs[0].id, NOTIFICATION_TYPES.SUBSCRIPTION_ISSUE, {}, {
              dedupeKey: `sub_issue_${invoice.id}`,
            }).catch(() => {});
          }
          await snapshot.docs[0].ref.update({ subscriptionStatus: 'past_due', updatedAt: new Date().toISOString() });
        }
        break;
      }

      // One-time payments (photo packs) that fail; subscription invoice
      // failures arrive as invoice.payment_failed instead.
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        if (!pi.invoice) await ledger.recordPayment(db, { paymentIntent: pi, status: 'failed', kind: 'one_time' });
        break;
      }

      // Phase 45: refund of a report-specific photo add-on charge (capacity
      // reversal), plus the ledger refund rows for any of our payments.
      case 'charge.refunded': {
        const charge = event.data.object;
        const checkoutIntentId = context.paymentIntent?.metadata?.checkoutIntentId || null;
        if (checkoutIntentId) {
          await applyRefund(db, checkoutIntentId, {
            eventId: event.id,
            amountRefundedCents: charge.amount_refunded,
            fullyRefunded: charge.amount_refunded >= charge.amount,
          });
        }
        await ledgerRefundsForPaymentIntent(db, idOf(charge.payment_intent));
        break;
      }

      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed': {
        await ledgerRefundsForPaymentIntent(db, idOf(event.data.object.payment_intent));
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object;
        const checkoutIntentId = context.paymentIntent?.metadata?.checkoutIntentId || null;
        if (checkoutIntentId) {
          await applyDisputeCreated(db, checkoutIntentId, { eventId: event.id, disputeId: dispute.id });
        }
        break;
      }

      // Real Stripe event names only -- there is no `charge.dispute.won`/
      // `charge.dispute.lost`. The outcome is `dispute.status` on the single
      // `charge.dispute.closed` event; only 'won'/'lost' are actionable.
      case 'charge.dispute.closed': {
        const dispute = event.data.object;
        const checkoutIntentId = context.paymentIntent?.metadata?.checkoutIntentId || null;
        if (checkoutIntentId && (dispute.status === 'won' || dispute.status === 'lost')) {
          await applyDisputeClosed(db, checkoutIntentId, { eventId: event.id, disputeId: dispute.id, outcome: dispute.status });
        }
        break;
      }
    }

    // Recorded only after successful processing: a failure returns 500 and
    // Stripe retries the event.
    await ledger.recordEvent(db, event, { outcome: 'processed', attributedAppId: appId });
    return res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// GET /api/payment/admin/revenue?application_id=flacron-ai|all&livemode=true|false
// Revenue report from the billing ledger (failed/incomplete payments are never
// revenue; amounts in minor units, per currency). Admin only.
router.get('/admin/revenue', authenticateToken, async (req, res) => {
  if (!req.user || req.user.email !== process.env.ADMIN_EMAIL) {
    return res.status(403).json({ success: false, error: 'Admin access required', code: 'ADMIN_REQUIRED' });
  }
  try {
    const applicationId = String(req.query.application_id || APP_ID);
    const livemode = req.query.livemode === undefined ? STRIPE_LIVEMODE : req.query.livemode === 'true';
    const report = await ledger.buildRevenueReport(getFirestore(), { applicationId, livemode });
    return res.json({ success: true, report });
  } catch (err) {
    console.error('Revenue report error:', err);
    return res.status(500).json({ success: false, error: 'Failed to build revenue report', code: 'REPORT_ERROR' });
  }
});

// GET /api/payment/current-subscription
router.get('/current-subscription', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userData = userDoc.data() || {};

    let subscription = await retrieveOrNull((id) => stripe.subscriptions.retrieve(id), userData.stripeSubscriptionId);
    if (subscription && classifyAppId(subscription) === 'mismatch') subscription = null;
    if (!subscription || !ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
      subscription = await findActiveSubscription(userData.stripeCustomerId);
      if (subscription) {
        await persistSubscription(userDoc.ref, subscription);
      }
    }

    if (!subscription) {
      return res.json({ success: true, subscription: null, tier: userData.tier || 'starter' });
    }

    const resolvedTierKey = getSubscriptionTierKey(subscription);
    const resolvedTier = resolvedTierKey ? getBaseTier(resolvedTierKey) : (userData.tier || 'starter');
    return res.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.cancel_at_period_end ? 'cancelling' : subscription.status,
        stripeStatus: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        plan: subscription.items.data[0]?.price?.nickname || resolvedTier,
      },
      tier: resolvedTier,
    });
  } catch (err) {
    console.error('Subscription fetch error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch subscription', code: 'STRIPE_ERROR' });
  }
});

// POST /api/payment/confirm-checkout
router.post('/confirm-checkout', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Checkout session is required', code: 'SESSION_REQUIRED' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
    if (session.metadata?.uid !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'Checkout does not belong to this account', code: 'FORBIDDEN' });
    }
    if (session.status !== 'complete' || !['paid', 'no_payment_required'].includes(session.payment_status)) {
      return res.status(409).json({ success: false, error: 'Checkout payment is not complete', code: 'PAYMENT_PENDING' });
    }

    const subscription = session.subscription;
    const tierKey = session.metadata?.tier || getSubscriptionTierKey(subscription);
    const userRef = getFirestore().collection('users').doc(req.user.uid);
    const resolvedTier = await persistSubscription(userRef, subscription, tierKey);

    return res.json({ success: true, tier: resolvedTier });
  } catch (err) {
    console.error('Checkout confirmation error:', err);
    return res.status(500).json({ success: false, error: 'Failed to confirm checkout', code: 'STRIPE_ERROR' });
  }
});

// GET /api/payment/invoices
router.get('/invoices', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const { stripeCustomerId } = userDoc.data() || {};

    if (!stripeCustomerId) return res.json({ success: true, invoices: [] });

    let invoices;
    try {
      invoices = await stripe.invoices.list({ customer: stripeCustomerId, limit: 24 });
    } catch (err) {
      if (isMissing(err)) return res.json({ success: true, invoices: [] }); // customer from a previous Stripe account
      throw err;
    }
    return res.json({
      success: true,
      invoices: invoices.data.map(inv => ({
        id: inv.id,
        date: new Date(inv.created * 1000).toISOString(),
        amount: inv.amount_paid / 100,
        currency: inv.currency.toUpperCase(),
        status: inv.status,
        pdf: inv.invoice_pdf,
        description: inv.lines.data[0]?.description || '',
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch invoices', code: 'STRIPE_ERROR' });
  }
});

// POST /api/payment/cancel-subscription
router.post('/cancel-subscription', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const { stripeSubscriptionId } = userDoc.data() || {};

    if (!stripeSubscriptionId) {
      return res.status(404).json({ success: false, error: 'No active subscription', code: 'NO_SUBSCRIPTION' });
    }

    let updated;
    try {
      updated = await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });
    } catch (err) {
      if (!isMissing(err)) throw err;
      return res.status(404).json({ success: false, error: 'No active subscription', code: 'NO_SUBSCRIPTION' });
    }
    await ledger.recordSubscription(db, updated, { internalUserId: req.user.uid });

    await db.collection('users').doc(req.user.uid).update({
      subscriptionStatus: 'cancelling',
      updatedAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: 'Subscription will cancel at end of billing period',
      cancelAt: new Date(updated.current_period_end * 1000).toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to cancel subscription', code: 'STRIPE_ERROR' });
  }
});

module.exports = router;
