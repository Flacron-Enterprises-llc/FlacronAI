// Mobile Phase 7 (Subscriptions & IAP). Durable record of store (Apple /
// Google) subscriptions and their binding to FlacronAI accounts.
//
// storeSubscriptions/{sha256(subscriptionKey)} -- one doc per store
// subscription (Apple originalTransactionId / Google purchase token), owned by
// at most one account (`ownerUid`). Separate from every Stripe field: nothing
// here reads or writes stripeSubscriptionId / stripeCustomerId /
// subscriptionStatus.
//
// Binding rules (enforced in a transaction, so concurrent verify / restore /
// notification calls can't double-bind):
//  1. A purchase carrying an account token (Apple appAccountToken / Google
//     obfuscatedExternalAccountId) can only ever be bound to the account that
//     token was issued to -- a different signed-in account gets ACCOUNT_MISMATCH.
//  2. A purchase already owned by another account is never transferred:
//     PURCHASE_OWNED_BY_OTHER_ACCOUNT -- or PURCHASE_LINKED_TO_DELETED_ACCOUNT when
//     that owner deleted their account (Mobile Phase 8: deletion must not make a
//     purchase claimable by someone else).
//  3. A purchase with no account token (e.g. an offer code redeemed in the App
//     Store) is bound to the first account that verifies it, then rule 2 applies.
// Re-processing the same store state is a no-op apart from timestamps, so every
// path (purchase, restore, retry, notification replay) is idempotent.
const crypto = require('crypto');
const { applyEntitlementSources, isStoreEntitlementActive, normalizeTier } = require('./entitlements');
const { TIER_ORDER } = require('../config/tiers');
const { isSandboxAllowedFor } = require('../config/storeBilling');

const COLLECTION = 'storeSubscriptions';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

class StoreBindingError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const docIdFor = (subscriptionKey) => crypto.createHash('sha256').update(subscriptionKey).digest('hex');

async function getOrCreateBillingAccountToken(db, uid) {
  const ref = db.collection('users').doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      const err = new Error('User not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const existing = snap.data().billingAccountToken;
    if (typeof existing === 'string' && UUID_RE.test(existing)) return existing;
    const token = crypto.randomUUID();
    tx.update(ref, { billingAccountToken: token });
    return token;
  });
}

async function findUidByAccountToken(db, token) {
  if (!token || !UUID_RE.test(token)) return null;
  const snap = await db.collection('users').where('billingAccountToken', '==', token).limit(2).get();
  return snap.docs.length === 1 ? snap.docs[0].id : null;
}

const SUB_FIELDS = [
  'platform', 'productId', 'basePlanId', 'tierKey', 'tier', 'period', 'state', 'expiresAt',
  'autoRenew', 'environment', 'isTest', 'originalTransactionId', 'accountToken', 'linkedSubscriptionKey', 'fetchedAt',
  'renewsToTier', 'renewsToPeriod',
];

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k] === undefined ? null : obj[k]]));

// Public, client-safe view of a store entitlement (no tokens / account ids).
const toPublicStoreEntitlement = (e) =>
  e
    ? {
        platform: e.platform,
        productId: e.productId,
        tier: e.tier,
        period: e.period,
        state: e.state,
        expiresAt: e.expiresAt,
        autoRenew: !!e.autoRenew,
        isTest: !!e.isTest,
        // A pending plan change the store reports for the next renewal (Apple downgrade/crossgrade).
        renewsToTier: e.renewsToTier || null,
        renewsToPeriod: e.renewsToPeriod || null,
        active: isStoreEntitlementActive(e),
      }
    : null;

/**
 * Persist a store-verified subscription snapshot and recompute the owner's
 * entitlement. `requesterUid` is set for app-initiated verify/restore calls and
 * null for store notifications.
 * Returns { ownerUid, subscriptionId, stale }.
 */
async function recordStoreSubscription(db, { snapshot, requesterUid = null, source, eventId = null }) {
  const subscriptionId = docIdFor(snapshot.subscriptionKey);
  const subRef = db.collection(COLLECTION).doc(subscriptionId);
  const linkedRef = snapshot.linkedSubscriptionKey
    ? db.collection(COLLECTION).doc(docIdFor(snapshot.linkedSubscriptionKey))
    : null;
  // Notifications have no signed-in user: resolve the account the purchase was
  // made for from its account token (outside the transaction; re-checked below).
  const tokenOwnerUid = !requesterUid && snapshot.accountToken ? await findUidByAccountToken(db, snapshot.accountToken) : null;

  const result = await db.runTransaction(async (tx) => {
    const subSnap = await tx.get(subRef);
    const linkedSnap = linkedRef ? await tx.get(linkedRef) : null;
    const existing = subSnap.exists ? subSnap.data() : null;
    const linked = linkedSnap && linkedSnap.exists ? linkedSnap.data() : null;

    // Loads an owner's user doc (null when the account no longer exists).
    const liveOwner = async (uid) => {
      if (!uid) return null;
      const s = await tx.get(db.collection('users').doc(uid));
      return s.exists ? { uid, data: s.data() } : null;
    };
    const currentOwner = await liveOwner(existing && existing.ownerUid);
    const linkedOwner = await liveOwner(linked && linked.ownerUid);
    const requester = requesterUid ? await liveOwner(requesterUid) : null;
    const tokenOwner = tokenOwnerUid ? await liveOwner(tokenOwnerUid) : null;

    let ownerUid = null;
    if (requesterUid) {
      if (!requester) throw new StoreBindingError('ACCOUNT_NOT_FOUND', 'Account not found.');
      if (snapshot.accountToken && snapshot.accountToken !== requester.data.billingAccountToken) {
        throw new StoreBindingError(
          'ACCOUNT_MISMATCH',
          'This purchase was made while signed in to a different FlacronAI account. Sign in to that account to use it.'
        );
      }
      const holderUid = (existing && existing.ownerUid) || (linked && linked.ownerUid) || null;
      if (holderUid && holderUid !== requesterUid) {
        const holderAlive = (currentOwner && currentOwner.uid === holderUid) || (linkedOwner && linkedOwner.uid === holderUid);
        throw holderAlive
          ? new StoreBindingError(
              'PURCHASE_OWNED_BY_OTHER_ACCOUNT',
              'This store subscription is already linked to a different FlacronAI account.'
            )
          : new StoreBindingError(
              'PURCHASE_LINKED_TO_DELETED_ACCOUNT',
              'This store subscription belonged to a FlacronAI account that was deleted, so it cannot be linked to another account. Cancel it in your store subscription settings, or contact support.'
            );
      }
      ownerUid = requesterUid;
    } else {
      // An existing owner -- even a deleted one -- keeps the record.
      const holderUid = (existing && existing.ownerUid) || (linked && linked.ownerUid) || null;
      if (holderUid) ownerUid = holderUid;
      else if (tokenOwner && tokenOwner.data.billingAccountToken === snapshot.accountToken) ownerUid = tokenOwner.uid;
    }

    // Sandbox / license-tester purchases: per-account policy (config/storeBilling.js).
    // An app request from a non-allowed account is refused; a notification still
    // records the purchase but it grants nothing.
    const owner = [requester, currentOwner, linkedOwner, tokenOwner].find((o) => o && o.uid === ownerUid) || null;
    const testAccessAllowed = snapshot.isTest ? !!owner && isSandboxAllowedFor(owner.data.email) : true;
    if (snapshot.isTest && requesterUid && !testAccessAllowed) {
      throw new StoreBindingError('SANDBOX_NOT_ACCEPTED', 'Test purchases are not accepted for this account.', 422);
    }

    // Out-of-order protection: never let an older store read overwrite a newer one.
    const stale = !!(existing && existing.fetchedAt && existing.fetchedAt > snapshot.fetchedAt);
    const now = new Date().toISOString();
    const doc = {
      ...(stale ? pick(existing, SUB_FIELDS) : pick(snapshot, SUB_FIELDS)),
      ownerUid,
      testAccessAllowed,
      boundAt: existing && existing.ownerUid === ownerUid && existing.boundAt ? existing.boundAt : ownerUid ? now : null,
      createdAt: (existing && existing.createdAt) || now,
      updatedAt: now,
      lastSource: source,
      lastEventId: eventId,
      supersededBy: (existing && existing.supersededBy) || null,
    };
    tx.set(subRef, doc);
    // The owner's list of subscription ids lets the entitlement recompute read
    // every one of them inside its own transaction (no stale query results).
    if (owner) {
      const ids = new Set(Array.isArray(owner.data.storeSubscriptionIds) ? owner.data.storeSubscriptionIds : []);
      if (!ids.has(subscriptionId)) {
        ids.add(subscriptionId);
        tx.update(db.collection('users').doc(owner.uid), { storeSubscriptionIds: [...ids] });
      }
    }
    if (linkedRef && linked && linked.supersededBy !== subscriptionId) {
      tx.set(linkedRef, { ...linked, state: 'replaced', supersededBy: subscriptionId, updatedAt: now });
    }
    return { ownerUid, previousOwnerUid: linked ? linked.ownerUid || null : null, stale, doc };
  });

  if (result.ownerUid) await recomputeUserStoreEntitlement(db, result.ownerUid);
  if (result.previousOwnerUid && result.previousOwnerUid !== result.ownerUid) {
    await recomputeUserStoreEntitlement(db, result.previousOwnerUid);
  }
  return { ownerUid: result.ownerUid, subscriptionId, stale: result.stale, subscription: result.doc };
}

const rank = (s) => TIER_ORDER.indexOf(normalizeTier(s.tier));

// Pick the subscription that should drive the user's store entitlement:
// the highest entitled tier (latest expiry breaks ties), else the most
// recently updated one so the app can show "expired on ..." honestly.
function chooseStoreEntitlement(subs, now = Date.now()) {
  const live = subs.filter((s) => s.state !== 'replaced');
  const entitled = live.filter((s) => isStoreEntitlementActive(s, now));
  const pool = entitled.length ? entitled : live;
  if (!pool.length) return null;
  const sorted = [...pool].sort((a, b) =>
    entitled.length
      ? rank(b) - rank(a) || String(b.expiresAt).localeCompare(String(a.expiresAt))
      : String(b.updatedAt).localeCompare(String(a.updatedAt))
  );
  const s = sorted[0];
  return {
    subscriptionId: s.id,
    platform: s.platform,
    productId: s.productId,
    tierKey: s.tierKey,
    tier: s.tier,
    period: s.period,
    state: s.state,
    expiresAt: s.expiresAt,
    autoRenew: !!s.autoRenew,
    environment: s.environment,
    isTest: !!s.isTest,
    testAccessAllowed: s.testAccessAllowed !== false,
    renewsToTier: s.renewsToTier || null,
    renewsToPeriod: s.renewsToPeriod || null,
  };
}

// Recomputes the store entitlement and `tier` in ONE transaction that reads the
// user doc and every subscription it lists, so concurrent verify / restore /
// notification / Stripe writes can never apply a stale result.
async function recomputeUserStoreEntitlement(db, uid, now = Date.now()) {
  return applyEntitlementSources(
    db,
    uid,
    async (user, tx) => {
      const ids = Array.isArray(user.storeSubscriptionIds) ? user.storeSubscriptionIds : [];
      const subs = [];
      for (const id of ids) {
        const snap = await tx.get(db.collection(COLLECTION).doc(id));
        if (snap.exists && snap.data().ownerUid === uid) subs.push({ id, ...snap.data() });
      }
      const chosen = chooseStoreEntitlement(subs, now);
      if (!chosen && !user.storeEntitlement) return null; // nothing store-related to change
      return {
        storeEntitlement: chosen ? { ...chosen, updatedAt: new Date(now).toISOString() } : null,
        updatedAt: new Date(now).toISOString(),
      };
    },
    { now }
  );
}

module.exports = {
  COLLECTION,
  StoreBindingError,
  docIdFor,
  getOrCreateBillingAccountToken,
  findUidByAccountToken,
  recordStoreSubscription,
  recomputeUserStoreEntitlement,
  chooseStoreEntitlement,
  toPublicStoreEntitlement,
};
