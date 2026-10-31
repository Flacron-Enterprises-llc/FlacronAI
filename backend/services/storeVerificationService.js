// Mobile Phase 7 (Subscriptions & IAP). Server-side verification against the
// stores' own APIs -- the ONLY way a store purchase can become an entitlement.
// Client-reported purchase data is used solely as a lookup key (Apple
// transactionId / Google purchaseToken); every attribute that matters
// (product, app identity, environment, state, expiry, account binding) comes
// from the store's signed / authenticated response.
//
//   Apple : App Store Server API getTransactionInfo + getAllSubscriptionStatuses,
//           JWS verified with Apple's official @apple/app-store-server-library
//           (x5c chain to the Apple root CA, bundle ID, environment).
//   Google: Play Developer API purchases.subscriptionsv2.get (+ server-side
//           purchases.subscriptions.acknowledge), RTDN Pub/Sub push requests
//           authenticated by their Google-signed OIDC token.
//
// Never logs a transaction JWS, purchase token or credential.
const crypto = require('crypto');
const {
  getAppleConfig,
  isAppleConfigured,
  getGoogleConfig,
  isGoogleConfigured,
  isGoogleRtdnConfigured,
  acceptsSandboxPurchases,
  resolveStoreProduct,
} = require('../config/storeBilling');

class StoreVerificationError extends Error {
  constructor(code, message, { status = 422, retryable = false } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const notConfigured = () =>
  new StoreVerificationError('STORE_NOT_CONFIGURED', 'In-app purchases are not available right now.', { status: 503 });
const unavailable = () =>
  new StoreVerificationError('STORE_UNAVAILABLE', 'The store could not be reached. Please try again.', {
    status: 503,
    retryable: true,
  });
const invalidPurchase = () =>
  new StoreVerificationError('INVALID_PURCHASE', 'This purchase could not be verified with the store.', { status: 422 });

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const toIso = (ms) => (Number.isFinite(Number(ms)) && Number(ms) > 0 ? new Date(Number(ms)).toISOString() : null);

// ---------------------------------------------------------------- Apple ----

let appleLib = null;
const getAppleLib = () => {
  if (!appleLib) appleLib = require('@apple/app-store-server-library');
  return appleLib;
};

// Default (real) Apple boundary. Tests replace it via setAppleDeps().
const realAppleDeps = () => {
  const lib = getAppleLib();
  const cfg = getAppleConfig();
  const clients = new Map();
  const verifiers = new Map();
  return {
    environments: () =>
      acceptsSandboxPurchases() ? [lib.Environment.PRODUCTION, lib.Environment.SANDBOX] : [lib.Environment.PRODUCTION],
    client: (env) => {
      if (!clients.has(env)) {
        clients.set(env, new lib.AppStoreServerAPIClient(cfg.privateKey, cfg.keyId, cfg.issuerId, cfg.bundleId, env));
      }
      return clients.get(env);
    },
    verifier: (env) => {
      if (!verifiers.has(env)) {
        verifiers.set(
          env,
          new lib.SignedDataVerifier(cfg.rootCerts, true, env, cfg.bundleId, env === lib.Environment.PRODUCTION ? cfg.appAppleId : undefined)
        );
      }
      return verifiers.get(env);
    },
    isConfigured: () => isAppleConfigured(cfg),
    bundleId: cfg.bundleId,
  };
};

let appleDepsOverride = null;
const setAppleDeps = (deps) => {
  appleDepsOverride = deps;
};
const appleDeps = () => appleDepsOverride || realAppleDeps();

// Apple API error codes meaning "not in this environment / doesn't exist".
const APPLE_NOT_FOUND_CODES = new Set([4040010, 4040005, 4000006, 4000008]);

const mapAppleError = (err) => {
  if (err && typeof err.httpStatusCode === 'number') {
    if (err.httpStatusCode === 429 || err.httpStatusCode >= 500) return unavailable();
    if (err.httpStatusCode === 401) return notConfigured();
    return invalidPurchase();
  }
  // VerificationException (bad chain / bundle / environment) and anything else.
  if (err && err.name === 'VerificationException') return invalidPurchase();
  return unavailable();
};

const APPLE_STATUS_TO_STATE = { 1: 'active', 2: 'expired', 3: 'billing_retry', 4: 'grace_period', 5: 'revoked' };

async function buildAppleSnapshot(deps, env, originalTransactionId) {
  const statuses = await deps.client(env).getAllSubscriptionStatuses(originalTransactionId);
  if (statuses.bundleId && statuses.bundleId !== deps.bundleId) throw invalidPurchase();
  let item = null;
  for (const group of statuses.data || []) {
    item = (group.lastTransactions || []).find((t) => t.originalTransactionId === originalTransactionId) || item;
  }
  if (!item || !item.signedTransactionInfo) throw invalidPurchase();

  const verifier = deps.verifier(env);
  const tx = await verifier.verifyAndDecodeTransaction(item.signedTransactionInfo);
  const renewal = item.signedRenewalInfo ? await verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo) : null;

  if (tx.bundleId !== deps.bundleId) throw new StoreVerificationError('APP_MISMATCH', 'This purchase belongs to a different app.');
  if (tx.type && tx.type !== 'Auto-Renewable Subscription') throw invalidPurchase();
  if (tx.inAppOwnershipType === 'FAMILY_SHARED') {
    throw new StoreVerificationError(
      'FAMILY_SHARING_NOT_SUPPORTED',
      'Subscriptions shared through Family Sharing cannot be linked to a FlacronAI account.'
    );
  }

  const product = resolveStoreProduct('ios', tx.productId);
  if (!product) throw new StoreVerificationError('PRODUCT_NOT_CONFIGURED', 'This subscription product is not offered by FlacronAI.');

  let state = APPLE_STATUS_TO_STATE[item.status] || 'unknown';
  if (tx.revocationDate) state = 'revoked';
  const expiresAt =
    state === 'grace_period' && renewal && renewal.gracePeriodExpiresDate
      ? toIso(renewal.gracePeriodExpiresDate)
      : toIso(tx.expiresDate);

  // Pending plan change (Apple applies downgrades/crossgrades at the next renewal).
  const renewsTo =
    renewal && renewal.autoRenewProductId && renewal.autoRenewProductId !== tx.productId
      ? resolveStoreProduct('ios', renewal.autoRenewProductId)
      : null;

  return {
    platform: 'ios',
    subscriptionKey: `ios:${originalTransactionId}`,
    renewsToTier: renewsTo ? renewsTo.tier : null,
    renewsToPeriod: renewsTo ? renewsTo.period : null,
    originalTransactionId,
    productId: tx.productId,
    basePlanId: null,
    tierKey: product.tierKey,
    tier: product.tier,
    period: product.period,
    environment: env,
    isTest: env !== 'Production',
    state,
    expiresAt,
    autoRenew: renewal ? renewal.autoRenewStatus === 1 : false,
    accountToken: tx.appAccountToken ? String(tx.appAccountToken).toLowerCase() : null,
    linkedSubscriptionKey: null,
    needsAcknowledge: false,
    fetchedAt: new Date().toISOString(),
  };
}

const assertSandboxAllowed = (snapshot) => {
  if (snapshot.isTest && !acceptsSandboxPurchases()) {
    throw new StoreVerificationError('SANDBOX_NOT_ACCEPTED', 'Test purchases are not accepted by this server.');
  }
};

// Verify a StoreKit 2 transaction id reported by the app.
async function verifyAppleTransaction(transactionId) {
  const deps = appleDeps();
  if (!deps.isConfigured()) throw notConfigured();
  if (typeof transactionId !== 'string' || !/^\d{1,30}$/.test(transactionId)) throw invalidPurchase();

  for (const env of deps.environments()) {
    let info;
    try {
      info = await deps.client(env).getTransactionInfo(transactionId);
    } catch (err) {
      if (err && APPLE_NOT_FOUND_CODES.has(Number(err.apiError))) continue; // try next environment
      throw mapAppleError(err);
    }
    try {
      const tx = await deps.verifier(env).verifyAndDecodeTransaction(info.signedTransactionInfo);
      if (tx.transactionId !== transactionId || !tx.originalTransactionId) throw invalidPurchase();
      const snapshot = await buildAppleSnapshot(deps, env, tx.originalTransactionId);
      assertSandboxAllowed(snapshot);
      return { ...snapshot, reportedProductId: tx.productId };
    } catch (err) {
      if (err instanceof StoreVerificationError) throw err;
      throw mapAppleError(err);
    }
  }
  throw invalidPurchase();
}

// App Store Server Notifications V2: verify the signed payload, then re-read
// the authoritative subscription status (the notification is only a trigger).
async function verifyAppleNotification(signedPayload) {
  const deps = appleDeps();
  if (!deps.isConfigured()) throw notConfigured();
  if (typeof signedPayload !== 'string' || signedPayload.length > 100000) throw invalidPurchase();

  let decoded = null;
  let env = null;
  for (const candidate of deps.environments()) {
    try {
      decoded = await deps.verifier(candidate).verifyAndDecodeNotification(signedPayload);
      env = candidate;
      break;
    } catch {
      // wrong environment or forged -- try the next accepted environment
    }
  }
  if (!decoded) throw invalidPurchase();

  const result = {
    notificationId: decoded.notificationUUID || null,
    notificationType: decoded.notificationType || null,
    subtype: decoded.subtype || null,
    environment: env,
    snapshot: null,
  };
  const signedTx = decoded.data && decoded.data.signedTransactionInfo;
  if (!signedTx) return result; // e.g. TEST notifications

  try {
    const tx = await deps.verifier(env).verifyAndDecodeTransaction(signedTx);
    if (!tx.originalTransactionId) return result;
    result.snapshot = await buildAppleSnapshot(deps, env, tx.originalTransactionId);
  } catch (err) {
    if (err instanceof StoreVerificationError) {
      // Product we don't sell / family-shared: nothing to grant, still a valid delivery.
      if (['PRODUCT_NOT_CONFIGURED', 'FAMILY_SHARING_NOT_SUPPORTED'].includes(err.code)) return result;
      throw err;
    }
    throw mapAppleError(err);
  }
  return result;
}

// --------------------------------------------------------------- Google ----

const PLAY_API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

const realGoogleDeps = () => {
  const cfg = getGoogleConfig();
  let clientPromise = null;
  return {
    isConfigured: () => isGoogleConfigured(cfg),
    isRtdnConfigured: () => isGoogleRtdnConfigured(cfg),
    packageName: cfg.packageName,
    rtdnAudience: cfg.rtdnAudience,
    rtdnServiceAccountEmail: cfg.rtdnServiceAccountEmail,
    request: async (opts) => {
      if (!clientPromise) {
        const { GoogleAuth } = require('google-auth-library');
        clientPromise = new GoogleAuth({
          credentials: cfg.serviceAccount,
          scopes: ['https://www.googleapis.com/auth/androidpublisher'],
        }).getClient();
      }
      const client = await clientPromise;
      return client.request({ ...opts, timeout: 15000 });
    },
    verifyIdToken: async (idToken, audience) => {
      const { OAuth2Client } = require('google-auth-library');
      const ticket = await new OAuth2Client().verifyIdToken({ idToken, audience });
      return ticket.getPayload();
    },
  };
};

let googleDepsOverride = null;
const setGoogleDeps = (deps) => {
  googleDepsOverride = deps;
};
const googleDeps = () => googleDepsOverride || realGoogleDeps();

const mapGoogleError = (err) => {
  const status = err && (err.status || (err.response && err.response.status));
  if (status === 429 || (status >= 500 && status < 600)) return unavailable();
  if (status === 401 || status === 403) return notConfigured();
  if (status === 400 || status === 404 || status === 410) return invalidPurchase();
  return unavailable();
};

const GOOGLE_STATE = {
  SUBSCRIPTION_STATE_ACTIVE: 'active',
  SUBSCRIPTION_STATE_CANCELED: 'active', // auto-renew off; access continues until expiry
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'grace_period',
  SUBSCRIPTION_STATE_ON_HOLD: 'on_hold',
  SUBSCRIPTION_STATE_PAUSED: 'paused',
  SUBSCRIPTION_STATE_EXPIRED: 'expired',
  SUBSCRIPTION_STATE_PENDING: 'pending',
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'expired',
};

const PURCHASE_TOKEN_RE = /^[A-Za-z0-9._:-]{10,4096}$/;

function normalizeGoogleSubscription(purchaseToken, data) {
  const lineItem = (data.lineItems || [])[0];
  if (!lineItem || !lineItem.productId) throw invalidPurchase();
  const basePlanId = (lineItem.offerDetails && lineItem.offerDetails.basePlanId) || null;
  const product = resolveStoreProduct('android', lineItem.productId, basePlanId);
  if (!product) throw new StoreVerificationError('PRODUCT_NOT_CONFIGURED', 'This subscription product is not offered by FlacronAI.');

  let state = GOOGLE_STATE[data.subscriptionState] || 'unknown';
  const expiresAt = lineItem.expiryTime ? new Date(lineItem.expiryTime).toISOString() : null;
  if (state === 'active' && expiresAt && Date.parse(expiresAt) <= Date.now() && data.subscriptionState === 'SUBSCRIPTION_STATE_CANCELED') {
    state = 'expired';
  }
  const ids = data.externalAccountIdentifiers || {};
  return {
    platform: 'android',
    subscriptionKey: `android:${hashToken(purchaseToken)}`,
    originalTransactionId: null,
    productId: lineItem.productId,
    basePlanId,
    tierKey: product.tierKey,
    tier: product.tier,
    period: product.period,
    environment: data.testPurchase ? 'Test' : 'Production',
    isTest: !!data.testPurchase,
    state,
    expiresAt,
    autoRenew: !!(lineItem.autoRenewingPlan && lineItem.autoRenewingPlan.autoRenewEnabled),
    accountToken: ids.obfuscatedExternalAccountId ? String(ids.obfuscatedExternalAccountId).toLowerCase() : null,
    linkedSubscriptionKey: data.linkedPurchaseToken ? `android:${hashToken(data.linkedPurchaseToken)}` : null,
    needsAcknowledge: data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' && state !== 'pending',
    fetchedAt: new Date().toISOString(),
  };
}

async function verifyGooglePurchase(purchaseToken) {
  const deps = googleDeps();
  if (!deps.isConfigured()) throw notConfigured();
  if (typeof purchaseToken !== 'string' || !PURCHASE_TOKEN_RE.test(purchaseToken)) throw invalidPurchase();
  let res;
  try {
    res = await deps.request({
      url: `${PLAY_API}/${encodeURIComponent(deps.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
      method: 'GET',
    });
  } catch (err) {
    throw mapGoogleError(err);
  }
  const snapshot = normalizeGoogleSubscription(purchaseToken, (res && res.data) || {});
  assertSandboxAllowed(snapshot);
  return snapshot;
}

// Server-side acknowledgement (Google's recommended path) -- only called after
// the purchase has been durably bound to an account.
async function acknowledgeGooglePurchase(productId, purchaseToken) {
  const deps = googleDeps();
  if (!deps.isConfigured()) throw notConfigured();
  try {
    await deps.request({
      url: `${PLAY_API}/${encodeURIComponent(deps.packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
      method: 'POST',
      data: {},
    });
  } catch (err) {
    const status = err && (err.status || (err.response && err.response.status));
    if (status === 400 || status === 409) return; // already acknowledged
    throw mapGoogleError(err);
  }
}

// Authenticates a Pub/Sub push request: Google-signed OIDC token for the
// configured audience, issued to the configured push service account.
async function verifyGoogleRtdnRequest(authorizationHeader) {
  const deps = googleDeps();
  if (!deps.isRtdnConfigured()) throw notConfigured();
  const match = /^Bearer (.+)$/.exec(authorizationHeader || '');
  if (!match) throw new StoreVerificationError('UNAUTHENTICATED', 'Unauthenticated', { status: 401 });
  let payload;
  try {
    payload = await deps.verifyIdToken(match[1], deps.rtdnAudience);
  } catch {
    throw new StoreVerificationError('UNAUTHENTICATED', 'Unauthenticated', { status: 401 });
  }
  if (!payload || payload.email !== deps.rtdnServiceAccountEmail || payload.email_verified !== true) {
    throw new StoreVerificationError('UNAUTHENTICATED', 'Unauthenticated', { status: 401 });
  }
  return { packageName: deps.packageName };
}

module.exports = {
  StoreVerificationError,
  hashToken,
  verifyAppleTransaction,
  verifyAppleNotification,
  verifyGooglePurchase,
  acknowledgeGooglePurchase,
  verifyGoogleRtdnRequest,
  normalizeGoogleSubscription,
  setAppleDeps,
  setGoogleDeps,
};
