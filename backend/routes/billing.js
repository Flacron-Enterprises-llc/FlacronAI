// Mobile Phase 7 (Subscriptions & IAP). App Store / Google Play subscription
// endpoints. Additive: Stripe (web) billing stays entirely in routes/payment.js
// and is not called or modified from here.
//
//   GET  /billing/status                      combined, client-safe entitlement view
//   GET  /billing/store/catalog?platform=     configured store products for a platform
//   POST /billing/store/account-token         per-account token the app passes to the store
//   POST /billing/store/verify                verify a purchase / restore with the store
//   POST /billing/store/notifications/apple   App Store Server Notifications V2
//   POST /billing/store/notifications/google  Play RTDN via authenticated Pub/Sub push
const express = require('express');
const router = express.Router();
const { getFirestore } = require('../config/firebase');
const { authenticateToken } = require('../middleware/auth');
const { storeBillingLimiter } = require('../middleware/rateLimiters');
const { billingBlockState, ACCOUNT_DELETION_BLOCKED_BODY } = require('../utils/accountDeletionLock');
const { TIERS, getEffectiveTier } = require('../config/tiers');
const {
  PLATFORMS,
  getStoreProducts,
  isPlatformConfigured,
  getGoogleConfig,
} = require('../config/storeBilling');
const {
  StoreVerificationError,
  verifyAppleTransaction,
  verifyAppleNotification,
  verifyGooglePurchase,
  acknowledgeGooglePurchase,
  verifyGoogleRtdnRequest,
} = require('../services/storeVerificationService');
const {
  StoreBindingError,
  getOrCreateBillingAccountToken,
  recordStoreSubscription,
  toPublicStoreEntitlement,
} = require('../utils/storeSubscriptions');
const {
  resolveEffectiveTier,
  isStoreEntitlementActive,
  teamTier,
  STRIPE_ACTIVE_STATUSES,
} = require('../utils/entitlements');
const PROCESSED = 'processedStoreNotifications';

const sendError = (res, err, fallbackCode) => {
  if (err instanceof StoreVerificationError || err instanceof StoreBindingError) {
    return res.status(err.status).json({ success: false, error: err.message, code: err.code, finish: false });
  }
  // Never echo store/SDK error text: it can contain request URLs with tokens.
  console.error(`Store billing error (${fallbackCode}):`, err && err.code ? err.code : 'unexpected');
  return res.status(500).json({ success: false, error: 'Billing request failed. Please try again.', code: fallbackCode, finish: false });
};

const stripeSummary = (user) => {
  const active = !!user.stripeSubscriptionId && STRIPE_ACTIVE_STATUSES.has(user.subscriptionStatus);
  return {
    active,
    status: active ? user.subscriptionStatus : null,
    tier: active ? user.stripeTier || user.tier || null : null,
  };
};

// Why the app must not start a NEW store subscription for this account, or null.
// (An active store subscriber changes plan through the store -- see the app.)
const purchaseBlockedReason = (user) => {
  if (stripeSummary(user).active) return 'WEB_SUBSCRIPTION_ACTIVE';
  if (teamTier(user)) return 'TEAM_PLAN_ACTIVE';
  if (isStoreEntitlementActive(user.storeEntitlement)) return 'STORE_SUBSCRIPTION_ACTIVE';
  return null;
};

const buildStatus = (user) => {
  const blocked = purchaseBlockedReason(user);
  return {
    success: true,
    tier: resolveEffectiveTier(user),
    stripe: stripeSummary(user),
    store: toPublicStoreEntitlement(user.storeEntitlement),
    // Non-billing grants, shown so the app can explain the plan (no ids/emails).
    team: { active: !!teamTier(user) },
    admin: { active: typeof user.adminTier === 'string', tier: typeof user.adminTier === 'string' ? user.adminTier : null },
    canPurchaseInApp: !blocked,
    purchaseBlockedReason: blocked,
  };
};

const loadUser = async (uid) => {
  const snap = await getFirestore().collection('users').doc(uid).get();
  return snap.exists ? snap.data() : {};
};

router.get('/status', authenticateToken, async (req, res) => {
  try {
    return res.json(buildStatus(await loadUser(req.user.uid)));
  } catch (err) {
    return sendError(res, err, 'BILLING_STATUS_ERROR');
  }
});

router.get('/store/catalog', authenticateToken, async (req, res) => {
  const platform = String(req.query.platform || '');
  if (!PLATFORMS.includes(platform)) {
    return res.status(400).json({ success: false, error: 'platform must be ios or android', code: 'INVALID_PLATFORM' });
  }
  try {
    const configured = isPlatformConfigured(platform);
    const db = getFirestore();
    const products = configured
      ? await Promise.all(
          getStoreProducts(platform).map(async (p) => {
            const live = await getEffectiveTier(db, p.tier);
            return {
              tierKey: p.tierKey,
              tier: p.tier,
              period: p.period,
              productId: p.productId,
              basePlanId: p.basePlanId,
              planName: TIERS[p.tier].name,
              reportsPerMonth: live.reportsPerMonth,
              exportFormats: TIERS[p.tier].exportFormats,
            };
          })
        )
      : [];
    return res.json({
      success: true,
      platform,
      available: configured && products.length > 0,
      reason: !configured ? 'STORE_NOT_CONFIGURED' : products.length ? null : 'NO_PRODUCTS',
      products,
    });
  } catch (err) {
    return sendError(res, err, 'BILLING_CATALOG_ERROR');
  }
});

router.post('/store/account-token', authenticateToken, storeBillingLimiter, async (req, res) => {
  try {
    if ((await billingBlockState(getFirestore(), req.user.uid)) !== 'ok') return res.status(409).json(ACCOUNT_DELETION_BLOCKED_BODY);
    const accountToken = await getOrCreateBillingAccountToken(getFirestore(), req.user.uid);
    return res.json({ success: true, accountToken });
  } catch (err) {
    if (err && err.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'Account not found', code: 'NOT_FOUND' });
    }
    return sendError(res, err, 'BILLING_ACCOUNT_TOKEN_ERROR');
  }
});

const PRODUCT_ID_RE = /^[A-Za-z0-9._-]{1,150}$/;

router.post('/store/verify', authenticateToken, storeBillingLimiter, async (req, res) => {
  const { platform, productId, transactionId, purchaseToken, source } = req.body || {};
  if (!PLATFORMS.includes(platform) || typeof productId !== 'string' || !PRODUCT_ID_RE.test(productId)) {
    return res.status(400).json({ success: false, error: 'Invalid purchase details', code: 'INVALID_REQUEST', finish: false });
  }
  const origin = source === 'restore' ? 'restore' : 'purchase';
  try {
    const db = getFirestore();
    // Account being deleted: don't bind; leave the transaction unfinished.
    if ((await billingBlockState(db, req.user.uid)) !== 'ok') {
      return res.status(409).json({ ...ACCOUNT_DELETION_BLOCKED_BODY, finish: false });
    }
    let snapshot;
    if (platform === 'ios') {
      snapshot = await verifyAppleTransaction(transactionId);
      if (productId !== snapshot.reportedProductId && productId !== snapshot.productId) {
        throw new StoreVerificationError('PRODUCT_MISMATCH', 'The purchased product does not match this request.');
      }
    } else {
      snapshot = await verifyGooglePurchase(purchaseToken);
      if (productId !== snapshot.productId) {
        throw new StoreVerificationError('PRODUCT_MISMATCH', 'The purchased product does not match this request.');
      }
    }

    const record = await recordStoreSubscription(db, { snapshot, requesterUid: req.user.uid, source: `app_${origin}` });

    if (platform === 'android' && snapshot.needsAcknowledge) {
      // Durably recorded above; the app's finishTransaction is the fallback.
      await acknowledgeGooglePurchase(snapshot.productId, purchaseToken).catch(() => {});
    }

    const user = await loadUser(req.user.uid);
    const sub = record.subscription;
    return res.json({
      ...buildStatus(user),
      verified: true,
      entitled: isStoreEntitlementActive(sub),
      subscription: toPublicStoreEntitlement(sub),
      // Pending purchases must stay unfinished so the store can complete them.
      finish: sub.state !== 'pending',
    });
  } catch (err) {
    return sendError(res, err, 'STORE_VERIFY_ERROR');
  }
});

// Durable replay protection: a notification id is recorded only after it was
// processed successfully, so a failure returns 5xx and the store redelivers.
const alreadyProcessed = async (db, id) => (await db.collection(PROCESSED).doc(id).get()).exists;
const markProcessed = (db, id, data) =>
  db.collection(PROCESSED).doc(id).set({ ...data, processedAt: new Date().toISOString() });

router.post('/store/notifications/apple', async (req, res) => {
  const signedPayload = req.body && req.body.signedPayload;
  let result;
  try {
    result = await verifyAppleNotification(signedPayload);
  } catch (err) {
    if (err instanceof StoreVerificationError && (err.code === 'STORE_NOT_CONFIGURED' || err.retryable)) {
      return res.status(503).json({ success: false, code: err.code });
    }
    return res.status(400).json({ success: false, code: 'INVALID_NOTIFICATION' });
  }
  if (!result.notificationId) return res.status(400).json({ success: false, code: 'INVALID_NOTIFICATION' });

  const db = getFirestore();
  const id = `apple_${result.notificationId}`;
  try {
    if (await alreadyProcessed(db, id)) return res.json({ received: true, duplicate: true });
    if (result.snapshot) {
      await recordStoreSubscription(db, { snapshot: result.snapshot, source: 'apple_notification', eventId: id });
    }
    await markProcessed(db, id, { type: result.notificationType, subtype: result.subtype });
    return res.json({ received: true });
  } catch (err) {
    console.error('Apple notification processing failed:', err && err.code ? err.code : 'unexpected');
    return res.status(500).json({ success: false, code: 'NOTIFICATION_PROCESSING_FAILED' });
  }
});

const decodePubSubData = (data) => {
  try {
    return JSON.parse(Buffer.from(String(data), 'base64').toString('utf8'));
  } catch {
    return null;
  }
};

router.post('/store/notifications/google', async (req, res) => {
  try {
    await verifyGoogleRtdnRequest(req.headers.authorization);
  } catch (err) {
    if (err instanceof StoreVerificationError && err.code === 'STORE_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, code: err.code });
    }
    return res.status(401).json({ success: false, code: 'UNAUTHENTICATED' });
  }

  const message = req.body && req.body.message;
  const payload = message && message.data ? decodePubSubData(message.data) : null;
  if (!message || typeof message.messageId !== 'string' || !payload) {
    return res.status(400).json({ success: false, code: 'INVALID_NOTIFICATION' });
  }
  // Not our app: acknowledge so Pub/Sub stops redelivering, grant nothing.
  if (payload.packageName !== getGoogleConfig().packageName) return res.json({ received: true, ignored: true });

  const db = getFirestore();
  const id = `google_${message.messageId}`;
  try {
    if (await alreadyProcessed(db, id)) return res.json({ received: true, duplicate: true });

    const voided = payload.voidedPurchaseNotification;
    const token =
      (payload.subscriptionNotification && payload.subscriptionNotification.purchaseToken) ||
      (voided && voided.productType === 1 ? voided.purchaseToken : null);

    if (token) {
      let snapshot = null;
      try {
        snapshot = await verifyGooglePurchase(token);
      } catch (err) {
        // A token that isn't ours / no longer exists can never become valid.
        if (!(err instanceof StoreVerificationError) || err.retryable || err.code === 'STORE_NOT_CONFIGURED') throw err;
      }
      if (snapshot) {
        const record = await recordStoreSubscription(db, { snapshot, source: 'google_rtdn', eventId: id });
        if (record.ownerUid && snapshot.needsAcknowledge) await acknowledgeGooglePurchase(snapshot.productId, token);
      }
    }
    await markProcessed(db, id, {
      type: payload.subscriptionNotification ? payload.subscriptionNotification.notificationType : voided ? 'voided' : 'test',
    });
    return res.json({ received: true });
  } catch (err) {
    console.error('Google RTDN processing failed:', err && err.code ? err.code : 'unexpected');
    return res.status(500).json({ success: false, code: 'NOTIFICATION_PROCESSING_FAILED' });
  }
});

module.exports = router;
