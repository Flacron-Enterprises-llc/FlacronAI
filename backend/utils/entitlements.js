// Mobile Phase 7 (Subscriptions & IAP) + entitlement-consistency pass. The ONE
// entitlement calculation and the ONE writer of `users/{uid}.tier`, shared by
// every source, so `tier` -- which every existing plan-limit / paid-feature
// check already reads -- is always derived the same way.
//
// Source fields on users/{uid} (each written only by its own path):
//   stripeTier       Stripe (web) subscription tier          routes/payment.js
//   adminTier        admin grant (override)                   routes/sales.js
//   teamOwnerId +    enterprise team membership -> 'enterprise' routes/teams.js
//   teamMembershipStatus
//   storeEntitlement best active App Store / Google Play sub  utils/storeSubscriptions.js
//   legacyTier       one-time snapshot of `tier` taken the first time a
//                    source-aware write touches a pre-existing account, so
//                    nothing it already had is lost.
//
// POLICY: effective tier = the HIGHEST of all sources. No source can reduce
// what another source grants, so a billing event never erases an admin grant
// or a team plan, and an admin/team change never removes a paid plan. Removing
// a grant = clearing that source (e.g. admin sets 'starter' -> adminTier null).
//
// Accounts no source-aware write has touched yet keep the exact pre-existing
// read: `tier || 'starter'`.
const { TIER_ORDER, getBaseTier } = require('../config/tiers');

// Store states that grant access. A cancelled subscription (auto-renew off)
// stays `active` until expiry -- cancellation is not expiration.
const ENTITLED_STORE_STATES = new Set(['active', 'grace_period']);

// Tolerance for renewal-notification lag past `expiresAt`.
const STORE_EXPIRY_LEEWAY_MS = 60 * 60 * 1000;

const STRIPE_ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'cancelling']);

const normalizeTier = (tier) => {
  const base = getBaseTier(typeof tier === 'string' ? tier : '');
  return TIER_ORDER.includes(base) ? base : 'starter';
};

const higherTier = (...tiers) =>
  tiers
    .filter((t) => typeof t === 'string')
    .map(normalizeTier)
    .reduce((best, t) => (TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf(best) ? t : best), 'starter');

const isStoreEntitlementActive = (entitlement, now = Date.now()) => {
  if (!entitlement || typeof entitlement !== 'object') return false;
  if (!ENTITLED_STORE_STATES.has(entitlement.state)) return false;
  // Sandbox purchases grant nothing unless the sandbox policy allowed this account.
  if (entitlement.isTest && entitlement.testAccessAllowed === false) return false;
  const expiresAt = Date.parse(entitlement.expiresAt);
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt + STORE_EXPIRY_LEEWAY_MS > now;
};

const activeStoreTier = (userData, now = Date.now()) => {
  const e = userData && userData.storeEntitlement;
  return isStoreEntitlementActive(e, now) ? normalizeTier(e.tier) : null;
};

const teamTier = (u) => (u && u.teamOwnerId && u.teamMembershipStatus !== 'suspended' ? 'enterprise' : null);

const hasSourceModel = (u) =>
  !!u &&
  (typeof u.stripeTier === 'string' ||
    typeof u.adminTier === 'string' ||
    typeof u.legacyTier === 'string' ||
    (u.storeEntitlement !== undefined && u.storeEntitlement !== null));

const resolveEffectiveTier = (userData = {}, now = Date.now()) => {
  if (!hasSourceModel(userData)) return (userData && userData.tier) || 'starter';
  const base = typeof userData.stripeTier === 'string' ? userData.stripeTier : userData.legacyTier;
  return higherTier(base, userData.adminTier, teamTier(userData), activeStoreTier(userData, now));
};

// First source-aware write on a pre-existing account: preserve what it had.
// - A team member's `tier` was set by the team (re-derived from team fields),
//   so their personal baseline is unknown -> 'starter' (a personal Stripe plan
//   comes back on its next Stripe write).
// - An admin-updated account with no active Stripe subscription: the admin is
//   the only possible writer of that tier -> carried over as `adminTier`.
// - Otherwise the tier is kept as `legacyTier`.
const legacySnapshot = (u = {}) => {
  if (hasSourceModel(u)) return {};
  if (teamTier(u)) return { legacyTier: 'starter' };
  const tier = normalizeTier(u.tier);
  const stripeActive = !!u.stripeSubscriptionId && STRIPE_ACTIVE_STATUSES.has(u.subscriptionStatus);
  if (u.adminUpdated === true && !stripeActive) return { legacyTier: 'starter', adminTier: tier === 'starter' ? null : tier };
  return { legacyTier: tier };
};

const needsTierReconcile = (userData = {}, now = Date.now()) =>
  hasSourceModel(userData) && normalizeTier(userData.tier) !== resolveEffectiveTier(userData, now);

/**
 * The single transactional writer of `tier`. `buildPatch(user, tx)` returns the
 * source/other fields to write (or null to skip). It may do further `tx.get`s
 * (all reads happen before the single write). `ignoreForTier` lists patch keys
 * whose written value is a delete sentinel (treated as removed when computing).
 * Returns the written effective tier, or null if skipped / no such user.
 */
async function applyEntitlementSources(db, uid, buildPatch, { now = Date.now(), ignoreForTier = [] } = {}) {
  const ref = db.collection('users').doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const user = snap.data();
    const patch = await buildPatch(user, tx);
    if (!patch) return null;
    const write = { ...legacySnapshot(user), ...patch };
    const view = { ...user, ...write };
    for (const k of ignoreForTier) delete view[k];
    write.tier = resolveEffectiveTier(view, now);
    tx.update(ref, write);
    return write.tier;
  });
}

// Recompute only (lazy correction after a store subscription lapsed without a
// notification, or any other drift).
const reconcileUserTier = (db, uid) => applyEntitlementSources(db, uid, () => ({ updatedAt: new Date().toISOString() }));

module.exports = {
  ENTITLED_STORE_STATES,
  STORE_EXPIRY_LEEWAY_MS,
  STRIPE_ACTIVE_STATUSES,
  normalizeTier,
  higherTier,
  isStoreEntitlementActive,
  activeStoreTier,
  teamTier,
  hasSourceModel,
  resolveEffectiveTier,
  legacySnapshot,
  needsTierReconcile,
  applyEntitlementSources,
  reconcileUserTier,
};
