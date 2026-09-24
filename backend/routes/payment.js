const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
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

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);

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

// Phase 45: refund/dispute webhook events carry a `payment_intent` id, not
// our own `checkoutIntentId` directly -- retrieve the PaymentIntent
// server-side (its metadata was set at checkout-session creation via
// `payment_intent_data.metadata`) to recover it. Never guesses/derives it
// from anything client- or metadata-only on the refund/dispute object
// itself. Returns null (safe no-op upstream) if it isn't one of our intents
// or Stripe says the PaymentIntent doesn't exist. Any OTHER lookup failure
// (network/5xx/rate limit) is rethrown so the webhook returns 500 without
// recording the event as processed -- Stripe then retries, instead of a
// refund/dispute being silently dropped and the pack keeping its capacity.
const resolveCheckoutIntentIdFromPaymentIntent = async paymentIntentId => {
  if (!paymentIntentId) return null;
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent.metadata?.checkoutIntentId || null;
  } catch (err) {
    console.error('Failed to resolve checkout intent from payment intent:', err.message);
    if (err?.code === 'resource_missing') return null;
    throw err;
  }
};

const findActiveSubscription = async customerId => {
  if (!customerId) return null;
  const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 });
  return subscriptions.data
    .filter(subscription => ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status))
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
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userData = userDoc.data() || {};

    // Get or create Stripe customer
    let customerId = userData.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: userData.displayName || '',
        metadata: { uid: req.user.uid },
      });
      customerId = customer.id;
      await db.collection('users').doc(req.user.uid).update({ stripeCustomerId: customerId });
    }

    let existingSubscription = null;
    if (userData.stripeSubscriptionId) {
      existingSubscription = await stripe.subscriptions.retrieve(userData.stripeSubscriptionId);
    }
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
          metadata: { uid: req.user.uid, tier },
          proration_behavior: 'always_invoice',
          payment_behavior: 'error_if_incomplete',
          expand: ['latest_invoice.payment_intent'],
        });

        const effectiveTierKey = getSubscriptionTierKey(updatedSubscription);
        if (effectiveTierKey === tier) {
          await persistSubscription(db.collection('users').doc(req.user.uid), updatedSubscription, tier);
        }

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
      const currentPhase = schedule.phases.find(phase => phase.end_date === existingSubscription.current_period_end)
        || schedule.phases[0];

      await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: 'release',
        phases: [
          {
            start_date: currentPhase.start_date,
            end_date: existingSubscription.current_period_end,
            items: currentPhase.items.map(item => ({ price: item.price, quantity: item.quantity || 1 })),
          },
          {
            start_date: existingSubscription.current_period_end,
            items: [{ price: priceId, quantity: 1 }],
            metadata: { uid: req.user.uid, tier },
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

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/dashboard?upgrade=success&tier=${tier}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?cancelled=true`,
      metadata: { uid: req.user.uid, tier },
      subscription_data: { metadata: { uid: req.user.uid, tier } },
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
    if (!priceId) {
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
      session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          payment_method_types: ['card'],
          ...(ownerData.stripeCustomerId ? { customer: ownerData.stripeCustomerId } : { customer_email: req.user.email }),
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: { checkoutIntentId: intent.id, reportId, schemaVersion: '1' },
          payment_intent_data: { metadata: { checkoutIntentId: intent.id, reportId } },
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

  // Idempotency: skip events already processed
  const processedRef = db.collection('processedWebhooks').doc(event.id);
  const alreadyProcessed = await processedRef.get();
  if (alreadyProcessed.exists) {
    return res.json({ received: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        // Phase 45: a report-specific photo add-on is a `mode: 'payment'`
        // Checkout Session carrying our own opaque `checkoutIntentId` --
        // fully additive, and mutually exclusive with the existing
        // `mode: 'subscription'` tier-upgrade path below (a subscription
        // session never sets this field, so that path is untouched).
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
          break;
        }

        const uid = session.metadata?.uid;
        const tier = getBaseTier(session.metadata?.tier); // strip _annual suffix
        if (uid && tier) {
          const userRef = db.collection('users').doc(uid);
          const [userDoc, subscription] = await Promise.all([
            userRef.get(),
            stripe.subscriptions.retrieve(session.subscription),
          ]);
          const previousCreatedAt = userDoc.data()?.stripeSubscriptionCreatedAt || 0;
          if (subscription.created >= previousCreatedAt) {
            await persistSubscription(userRef, subscription, session.metadata?.tier);
            console.log(`✅ User ${uid} upgraded to ${tier}`);
          }
        }
        break;
      }

      // Phase 45: the Checkout Session's own 24h expiry -- grants nothing.
      case 'checkout.session.expired': {
        const session = event.data.object;
        const checkoutIntentId = session.metadata?.checkoutIntentId;
        if (checkoutIntentId) {
          await markExpired(db, checkoutIntentId, { eventId: event.id });
        }
        break;
      }

      // Phase 45: refund of a report-specific photo add-on charge. The
      // Charge event carries `payment_intent` directly; the PaymentIntent's
      // own metadata (set at checkout-session creation) is retrieved
      // server-side to locate the trusted intent doc -- never trusted from
      // the charge object's own (unset) metadata.
      case 'charge.refunded': {
        const charge = event.data.object;
        const checkoutIntentId = await resolveCheckoutIntentIdFromPaymentIntent(charge.payment_intent);
        if (checkoutIntentId) {
          const fullyRefunded = charge.amount_refunded >= charge.amount;
          await applyRefund(db, checkoutIntentId, {
            eventId: event.id,
            amountRefundedCents: charge.amount_refunded,
            fullyRefunded,
          });
        }
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object;
        const checkoutIntentId = await resolveCheckoutIntentIdFromPaymentIntent(dispute.payment_intent);
        if (checkoutIntentId) {
          await applyDisputeCreated(db, checkoutIntentId, { eventId: event.id, disputeId: dispute.id });
        }
        break;
      }

      // Real Stripe event names only -- there is no `charge.dispute.won`/
      // `charge.dispute.lost`. The outcome is `dispute.status` ('won' |
      // 'lost' | 'warning_closed'/etc.) on the single `charge.dispute.closed`
      // event; only 'won'/'lost' are actionable capacity outcomes here.
      case 'charge.dispute.closed': {
        const dispute = event.data.object;
        if (dispute.status === 'won' || dispute.status === 'lost') {
          const checkoutIntentId = await resolveCheckoutIntentIdFromPaymentIntent(dispute.payment_intent);
          if (checkoutIntentId) {
            await applyDisputeClosed(db, checkoutIntentId, { eventId: event.id, disputeId: dispute.id, outcome: dispute.status });
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customer = subscription.customer;
        const snapshot = await db.collection('users').where('stripeSubscriptionId', '==', subscription.id).limit(1).get();
        if (!snapshot.empty) {
          await snapshot.docs[0].ref.update({
            tier: 'starter',
            subscriptionStatus: 'cancelled',
            stripeSubscriptionId: null,
            updatedAt: new Date().toISOString(),
          });
        } else {
          console.log(`Ignored deletion of non-current subscription ${subscription.id} for customer ${customer}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const snapshot = await db.collection('users').where('stripeCustomerId', '==', invoice.customer).limit(1).get();
        if (!snapshot.empty) {
          const userData = snapshot.docs[0].data();
          // Phase 18 (Notifications): gated by 'billing' (defaults enabled).
          if (isNotificationEnabled(userData.notifications, 'billing')) {
            sendPaymentFailedEmail(userData.email, userData.displayName).catch(() => {});
          }
          // Phase 20: in-app bell entry, same gate. dedupeKey guards against a
          // redelivered webhook double-firing (Stripe's own `processedWebhooks`
          // idempotency check upstream already prevents most of this, but a
          // deterministic id here is cheap defense-in-depth).
          if (isNotificationEnabled(userData.notifications, 'billing')) {
            notifyUser(db, snapshot.docs[0].id, NOTIFICATION_TYPES.SUBSCRIPTION_ISSUE, {}, {
              dedupeKey: `sub_issue_${invoice.id}`,
            }).catch(() => {});
          }
          await snapshot.docs[0].ref.update({ subscriptionStatus: 'past_due', updatedAt: new Date().toISOString() });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        let snapshot = await db.collection('users').where('stripeSubscriptionId', '==', sub.id).limit(1).get();
        if (snapshot.empty && sub.metadata?.uid) {
          const userDoc = await db.collection('users').doc(sub.metadata.uid).get();
          snapshot = userDoc.exists ? { empty: false, docs: [userDoc] } : snapshot;
        }
        if (!snapshot.empty) {
          const tierKey = getSubscriptionTierKey(sub) || sub.metadata?.tier;
          await persistSubscription(snapshot.docs[0].ref, sub, tierKey);
        }
        break;
      }
    }

    // Mark event as processed
    await processedRef.set({ type: event.type, processedAt: new Date().toISOString() });

    return res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// GET /api/payment/current-subscription
router.get('/current-subscription', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userData = userDoc.data() || {};

    let subscription = null;
    if (userData.stripeSubscriptionId) {
      subscription = await stripe.subscriptions.retrieve(userData.stripeSubscriptionId);
    }
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

    const invoices = await stripe.invoices.list({ customer: stripeCustomerId, limit: 24 });
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

    const updated = await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });

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
