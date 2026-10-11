const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Mobile Phase 7 -- the REAL Stripe webhook route (routes/payment.js) and the
// REAL auth middleware with the shared entitlement calculation: existing
// Stripe behavior is unchanged for accounts without a store purchase, and an
// active App Store / Google Play entitlement is never overwritten by Stripe.
process.env.PLAN_CONFIG_CACHE_TTL_MS = '0';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_PRICE_PROFESSIONAL = 'price_professional';
process.env.STRIPE_PRICE_AGENCY = 'price_agency';
delete process.env.MFA_ENFORCEMENT_ENABLED;

const firebaseConfigPath = require.resolve('../config/firebase');
const stripePath = require.resolve('stripe');
const resetPaths = [
  firebaseConfigPath,
  stripePath,
  require.resolve('../middleware/auth'),
  require.resolve('../config/tiers'),
  require.resolve('../routes/payment'),
  require.resolve('../utils/storeSubscriptions'),
];

const future = new Date(Date.now() + 30 * 86400000).toISOString();
const past = new Date(Date.now() - 3 * 3600000).toISOString();
const storeAgency = (expiresAt = future) => ({ tier: 'agency', state: 'active', expiresAt, platform: 'ios' });

function install(users) {
  resetPaths.forEach((p) => delete require.cache[p]);
  const db = new FakeFirestore();
  for (const [uid, data] of Object.entries(users)) db.store.set(`users/${uid}`, { version: 1, data });
  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath,
    filename: firebaseConfigPath,
    loaded: true,
    exports: {
      getAuth: () => ({ verifyIdToken: async (t) => ({ uid: t, email: `${t}@example.com`, auth_time: 1, iat: 1 }) }),
      getFirestore: () => db,
      FieldValue: { serverTimestamp: () => new Date().toISOString(), increment: (n) => n },
      Timestamp: {},
      admin: {},
      initFirebase: () => {},
      getBucket: () => {},
    },
  };
  const subscription = (price) => ({
    id: 'sub_1',
    status: 'active',
    created: 1700000000,
    customer: 'cus_1',
    cancel_at_period_end: false,
    current_period_end: 1800000000,
    items: { data: [{ id: 'si_1', price: { id: price } }] },
    metadata: {},
  });
  const subsById = {};
  const fakeStripe = {
    webhooks: { constructEvent: (raw, sig) => { if (sig !== 'ok') throw new Error('bad sig'); return JSON.parse(raw.toString()); } },
    // Current Stripe state by id (the updated-webhook path re-reads it).
    subscriptions: { retrieve: async (id) => subsById[id] || subscription('price_professional'), list: async () => ({ data: [] }) },
    checkout: { sessions: {} },
    paymentIntents: {},
    subscriptionSchedules: {},
    customers: {},
    invoices: {},
  };
  require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true, exports: () => fakeStripe };
  return { db, router: require('../routes/payment'), auth: require('../middleware/auth'), subscription, subsById };
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const paymentApp = (router) => {
  const app = express();
  app.use('/payment/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use('/payment', router);
  return app;
};

const postEvent = (base, event, sig = 'ok') =>
  fetch(`${base}/payment/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': sig }, body: JSON.stringify(event) });

test('stripe webhook: unchanged result for accounts with no store purchase', async () => {
  const { db, router, subscription, subsById } = install({ u1: { tier: 'starter', stripeSubscriptionId: 'sub_1' } });
  subsById.sub_1 = subscription('price_agency');
  await withServer(paymentApp(router), async (base) => {
    assert.equal((await postEvent(base, { id: 'e0', type: 'x' }, 'bad')).status, 400);
    await postEvent(base, { id: 'e1', type: 'customer.subscription.updated', data: { object: subscription('price_agency') } });
    assert.equal(db.store.get('users/u1').data.tier, 'agency');
    await postEvent(base, { id: 'e2', type: 'customer.subscription.deleted', data: { object: subscription('price_agency') } });
    const u = db.store.get('users/u1').data;
    assert.equal(u.tier, 'starter');
    assert.equal(u.subscriptionStatus, 'cancelled');
  });
});

test('stripe webhook: cancelling the web subscription keeps an active store entitlement', async () => {
  const { db, router, subscription, subsById } = install({
    u1: { tier: 'agency', stripeTier: 'professional', stripeSubscriptionId: 'sub_1', storeEntitlement: storeAgency() },
  });
  subsById.sub_2 = { ...subscription('price_agency'), id: 'sub_2', created: 1700000100, metadata: { uid: 'u1' } };
  await withServer(paymentApp(router), async (base) => {
    await postEvent(base, { id: 'e3', type: 'customer.subscription.deleted', data: { object: subscription('price_professional') } });
    const u = db.store.get('users/u1').data;
    assert.equal(u.tier, 'agency');
    assert.equal(u.stripeTier, 'starter');
    assert.equal(u.storeEntitlement.tier, 'agency', 'store record untouched by Stripe');
    // Stripe upgrade above the store tier wins.
    await postEvent(base, { id: 'e4', type: 'customer.subscription.updated', data: { object: { ...subscription('price_agency'), id: 'sub_2', metadata: { uid: 'u1' } } } });
    assert.equal(db.store.get('users/u1').data.tier, 'agency');
    assert.equal(db.store.get('users/u1').data.stripeTier, 'agency', 'the newer Stripe subscription was applied');
    assert.equal(db.store.get('users/u1').data.stripeSubscriptionId, 'sub_2');
  });
});

test('auth middleware: a lapsed store subscription no longer grants its tier, even before any notification', async () => {
  const { db, auth } = install({
    u1: { tier: 'agency', legacyTier: 'starter', storeEntitlement: storeAgency(past) },
    u2: { tier: 'professional' },
  });
  const app = express();
  app.get('/me', auth.authenticateToken, auth.requireTier('agency'), (req, res) => res.json({ tier: req.user.tier }));
  app.get('/tier', auth.authenticateToken, (req, res) => res.json({ tier: req.user.tier }));
  await withServer(app, async (base) => {
    const r = await fetch(`${base}/me`, { headers: { Authorization: 'Bearer u1' } });
    assert.equal(r.status, 403);
    const t2 = await (await fetch(`${base}/tier`, { headers: { Authorization: 'Bearer u2' } })).json();
    assert.equal(t2.tier, 'professional');
  });
  // Background reconcile corrected the stored tier.
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(db.store.get('users/u1').data.tier, 'starter');
});

test('stripe out-of-order: a delayed "updated: active" after deletion never restores access', async () => {
  const { db, router, subscription, subsById } = install({ u1: { tier: 'agency', stripeTier: 'agency', stripeSubscriptionId: 'sub_1' } });
  await withServer(paymentApp(router), async (base) => {
    subsById.sub_1 = { ...subscription('price_agency'), status: 'canceled' };
    await postEvent(base, { id: 'd1', type: 'customer.subscription.deleted', data: { object: subscription('price_agency') } });
    assert.equal(db.store.get('users/u1').data.tier, 'starter');
    // Late event whose payload still says "active" (and carries metadata.uid).
    const stale = { ...subscription('price_agency'), metadata: { uid: 'u1' } };
    await postEvent(base, { id: 'u_late', type: 'customer.subscription.updated', data: { object: stale } });
    const u = db.store.get('users/u1').data;
    assert.equal(u.tier, 'starter');
    assert.equal(u.stripeSubscriptionId, null);
  });
});

test('stripe out-of-order: an event for an OLDER subscription never replaces the current one', async () => {
  const { db, router, subscription, subsById } = install({
    u1: { tier: 'agency', stripeTier: 'agency', stripeSubscriptionId: 'sub_new', stripeSubscriptionCreatedAt: 1700000500 },
  });
  subsById.sub_old = { ...subscription('price_professional'), id: 'sub_old', created: 1700000000, metadata: { uid: 'u1' } };
  await withServer(paymentApp(router), async (base) => {
    await postEvent(base, { id: 'o1', type: 'customer.subscription.updated', data: { object: { id: 'sub_old' } } });
    const u = db.store.get('users/u1').data;
    assert.equal(u.stripeSubscriptionId, 'sub_new');
    assert.equal(u.tier, 'agency');
  });
});

test('stripe updated -> past_due keeps access; -> unpaid ends only the Stripe source; retries idempotent', async () => {
  const { db, router, subscription, subsById } = install({
    u1: { tier: 'agency', stripeTier: 'agency', stripeSubscriptionId: 'sub_1', adminTier: 'professional' },
  });
  await withServer(paymentApp(router), async (base) => {
    subsById.sub_1 = { ...subscription('price_agency'), status: 'past_due' };
    await postEvent(base, { id: 'p1', type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } });
    assert.equal(db.store.get('users/u1').data.tier, 'agency');
    subsById.sub_1 = { ...subscription('price_agency'), status: 'unpaid' };
    await postEvent(base, { id: 'p2', type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } });
    const u = db.store.get('users/u1').data;
    assert.equal(u.stripeTier, 'starter');
    assert.equal(u.tier, 'professional', 'admin grant survives the Stripe subscription ending');
    await postEvent(base, { id: 'p2', type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } });
    assert.equal(db.store.get('users/u1').data.tier, 'professional');
  });
});

test('admin override: preserved across billing events; "starter" clears the grant but never removes a paid plan', async () => {
  const { db } = install({
    u1: { tier: 'starter' },
    u2: { tier: 'agency', adminUpdated: true },
    u3: { tier: 'professional', stripeTier: 'professional' },
  });
  const { applyEntitlementSources } = require('../utils/entitlements');
  assert.equal(await applyEntitlementSources(db, 'u1', () => ({ adminTier: 'agency' })), 'agency');
  assert.equal(await applyEntitlementSources(db, 'u1', () => ({ stripeTier: 'professional' })), 'agency');
  assert.equal(await applyEntitlementSources(db, 'u1', () => ({ stripeTier: 'starter' })), 'agency');
  // Legacy admin-updated account (before adminTier existed): grant carried over.
  assert.equal(await applyEntitlementSources(db, 'u2', () => ({ stripeTier: 'starter' })), 'agency');
  assert.equal(db.store.get('users/u2').data.adminTier, 'agency');
  assert.equal(await applyEntitlementSources(db, 'u3', () => ({ adminTier: null })), 'professional');
});

test('team membership: removal recomputes from the member own sources instead of forcing starter', async () => {
  const del = { __delete: true };
  const ignoreForTier = ['teamOwnerId', 'teamMembershipStatus'];
  const { db } = install({
    m1: { tier: 'enterprise', stripeTier: 'agency', teamOwnerId: 'o', teamMembershipStatus: 'active' },
    m2: { tier: 'enterprise', teamOwnerId: 'o', teamMembershipStatus: 'active' },
    m3: { tier: 'starter' },
  });
  const { applyEntitlementSources } = require('../utils/entitlements');
  assert.equal(await applyEntitlementSources(db, 'm1', () => ({ teamOwnerId: del, teamMembershipStatus: del }), { ignoreForTier }), 'agency');
  assert.equal(await applyEntitlementSources(db, 'm2', () => ({ teamOwnerId: del, teamMembershipStatus: del }), { ignoreForTier }), 'starter');
  assert.equal(await applyEntitlementSources(db, 'm3', () => ({ teamOwnerId: 'o', teamMembershipStatus: 'active' })), 'enterprise');
});

test('concurrent Stripe + store writes converge on the sources (no lost or stale grant)', async () => {
  const { db } = install({ u1: { tier: 'starter', storeSubscriptionIds: ['s1'] } });
  db.store.set('storeSubscriptions/s1', {
    version: 1,
    data: { ownerUid: 'u1', platform: 'ios', tier: 'agency', state: 'active', expiresAt: future, updatedAt: '2026-01-01' },
  });
  const { applyEntitlementSources } = require('../utils/entitlements');
  const { recomputeUserStoreEntitlement } = require('../utils/storeSubscriptions');
  await Promise.all([
    applyEntitlementSources(db, 'u1', () => ({ stripeTier: 'professional' })),
    recomputeUserStoreEntitlement(db, 'u1'),
    applyEntitlementSources(db, 'u1', () => ({ stripeTier: 'professional' })),
  ]);
  let u = db.store.get('users/u1').data;
  assert.equal(u.stripeTier, 'professional');
  assert.equal(u.storeEntitlement.tier, 'agency');
  assert.equal(u.tier, 'agency');
  const sub = db.store.get('storeSubscriptions/s1');
  db.store.set('storeSubscriptions/s1', { version: sub.version + 1, data: { ...sub.data, state: 'expired' } });
  await Promise.all([recomputeUserStoreEntitlement(db, 'u1'), applyEntitlementSources(db, 'u1', () => ({ stripeTier: 'professional' }))]);
  u = db.store.get('users/u1').data;
  assert.equal(u.tier, 'professional');
  assert.equal(u.storeEntitlement.state, 'expired');
});
