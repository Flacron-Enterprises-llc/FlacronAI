const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Mobile Phase 7 -- App Store / Google Play subscription verification,
// account binding, entitlement calculation and store notifications. Real
// Express app + real routers/middleware; fakes only ../config/firebase and the
// store boundaries (Apple App Store Server API + JWS verifier, Google Play
// Developer API + Pub/Sub OIDC verifier). Nothing contacts a real store.
// Product IDs below are TEST FIXTURES, not real store products.
process.env.PLAN_CONFIG_CACHE_TTL_MS = '0';
delete process.env.MFA_ENFORCEMENT_ENABLED;
delete process.env.STORE_BILLING_ACCEPT_SANDBOX;
const STORE_ENV = {
  APPLE_IAP_PRODUCT_PROFESSIONAL: 'test.pro.monthly',
  APPLE_IAP_PRODUCT_AGENCY: 'test.agency.monthly',
  GOOGLE_PLAY_PRODUCT_PROFESSIONAL: 'test_pro:monthly',
  GOOGLE_PLAY_PRODUCT_PROFESSIONAL_ANNUAL: 'test_pro:annual',
  GOOGLE_PLAY_PACKAGE_NAME: 'com.example.test',
};
Object.assign(process.env, STORE_ENV);

const firebaseConfigPath = require.resolve('../config/firebase');
const resetPaths = [
  firebaseConfigPath,
  require.resolve('../middleware/auth'),
  require.resolve('../middleware/rateLimiters'),
  require.resolve('../routes/billing'),
  require.resolve('../utils/storeSubscriptions'),
  require.resolve('../services/storeVerificationService'),
  require.resolve('../config/storeBilling'),
];

const DAY = 24 * 60 * 60 * 1000;
const future = (days = 30) => Date.now() + days * DAY;
const TOKEN_A = '11111111-1111-4111-8111-111111111111';
const TOKEN_B = '22222222-2222-4222-8222-222222222222';
const BUNDLE = 'com.example.test';
const GTOKEN = 'google-purchase-token-aaaaaaaaaaaa';

// ---- fake Apple boundary -------------------------------------------------
function makeApple() {
  const state = {
    // transactionId -> { env, tx }
    transactions: new Map(),
    // originalTransactionId -> { status, latestId, autoRenewStatus }
    statuses: new Map(),
    calls: 0,
    failWith: null,
  };
  const addTx = ({ id, otid = id, env = 'Production', productId = 'test.pro.monthly', status = 1, token = TOKEN_A, ...rest }) => {
    const tx = {
      transactionId: id,
      originalTransactionId: otid,
      bundleId: BUNDLE,
      productId,
      type: 'Auto-Renewable Subscription',
      expiresDate: future(),
      appAccountToken: token,
      environment: env,
      ...rest,
    };
    state.transactions.set(id, { env, tx });
    state.statuses.set(otid, { status, latestId: id, autoRenewStatus: 1 });
    return tx;
  };
  const notFound = () => Object.assign(new Error('not found'), { httpStatusCode: 404, apiError: 4040010 });
  const deps = {
    isConfigured: () => true,
    bundleId: BUNDLE,
    environments: () => ['Production', 'Sandbox'],
    client: (env) => ({
      getTransactionInfo: async (id) => {
        state.calls++;
        if (state.failWith) throw state.failWith;
        const t = state.transactions.get(id);
        if (!t || t.env !== env) throw notFound();
        return { signedTransactionInfo: `jws:${id}` };
      },
      getAllSubscriptionStatuses: async (otid) => {
        const s = state.statuses.get(otid);
        if (!s) throw notFound();
        return {
          bundleId: BUNDLE,
          data: [
            {
              lastTransactions: [
                { originalTransactionId: otid, status: s.status, signedTransactionInfo: `jws:${s.latestId}`, signedRenewalInfo: `ren:${otid}` },
              ],
            },
          ],
        };
      },
    }),
    verifier: (env) => ({
      verifyAndDecodeTransaction: async (jws) => {
        const t = state.transactions.get(jws.replace(/^jws:/, ''));
        if (!jws.startsWith('jws:') || !t || t.env !== env) throw Object.assign(new Error('bad'), { name: 'VerificationException' });
        return t.tx;
      },
      verifyAndDecodeRenewalInfo: async (jws) => ({
        autoRenewStatus: state.statuses.get(jws.replace(/^ren:/, '')).autoRenewStatus,
        autoRenewProductId: state.renewalProduct || undefined,
      }),
      verifyAndDecodeNotification: async (payload) => {
        if (!payload.startsWith('signed:')) throw Object.assign(new Error('bad'), { name: 'VerificationException' });
        const n = JSON.parse(payload.slice(7));
        if (n.env !== env) throw Object.assign(new Error('env'), { name: 'VerificationException' });
        return {
          notificationUUID: n.uuid,
          notificationType: n.type,
          data: n.txId ? { signedTransactionInfo: `jws:${n.txId}` } : {},
        };
      },
    }),
  };
  return { state, deps, addTx };
}

// ---- fake Google boundary ------------------------------------------------
function makeGoogle() {
  const state = { subs: new Map(), acks: [], requests: 0, failWith: null };
  const setSub = (token, overrides = {}) =>
    state.subs.set(token, {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
      externalAccountIdentifiers: { obfuscatedExternalAccountId: TOKEN_A },
      lineItems: [
        {
          productId: 'test_pro',
          expiryTime: new Date(future()).toISOString(),
          offerDetails: { basePlanId: 'monthly' },
          autoRenewingPlan: { autoRenewEnabled: true },
        },
      ],
      ...overrides,
    });
  const deps = {
    isConfigured: () => true,
    isRtdnConfigured: () => true,
    packageName: 'com.example.test',
    rtdnAudience: 'https://api.example.test/rtdn',
    rtdnServiceAccountEmail: 'rtdn@example.iam.gserviceaccount.com',
    request: async ({ url, method }) => {
      state.requests++;
      if (state.failWith) throw state.failWith;
      if (method === 'POST') {
        state.acks.push(url);
        return { data: {} };
      }
      const token = decodeURIComponent(url.split('/tokens/')[1]);
      if (!state.subs.has(token)) throw Object.assign(new Error('nf'), { response: { status: 404 } });
      return { data: state.subs.get(token) };
    },
    verifyIdToken: async (idToken, audience) => {
      if (idToken !== 'valid-oidc' || audience !== 'https://api.example.test/rtdn') throw new Error('bad token');
      return { email: 'rtdn@example.iam.gserviceaccount.com', email_verified: true };
    },
  };
  return { state, deps, setSub };
}

function installFakes({ users = {} } = {}) {
  resetPaths.forEach((p) => delete require.cache[p]);
  const db = new FakeFirestore();
  const seed = {
    userA: { email: 'a@example.com', tier: 'starter', billingAccountToken: TOKEN_A },
    userB: { email: 'b@example.com', tier: 'starter', billingAccountToken: TOKEN_B },
    ...users,
  };
  for (const [uid, data] of Object.entries(seed)) db.store.set(`users/${uid}`, { version: 1, data });
  const identities = {
    'tok-a': { uid: 'userA', email: 'a@example.com', auth_time: 1000, iat: 1000 },
    'tok-b': { uid: 'userB', email: 'b@example.com', auth_time: 1000, iat: 1000 },
  };
  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath,
    filename: firebaseConfigPath,
    loaded: true,
    exports: {
      getAuth: () => ({
        verifyIdToken: async (t) => {
          if (!identities[t]) throw new Error('invalid token');
          return identities[t];
        },
      }),
      getFirestore: () => db,
      FieldValue: { serverTimestamp: () => new Date().toISOString(), increment: (n) => n },
      Timestamp: {},
      admin: {},
      initFirebase: () => {},
      getBucket: () => {},
    },
  };
  const service = require('../services/storeVerificationService');
  const apple = makeApple();
  const google = makeGoogle();
  service.setAppleDeps(apple.deps);
  service.setGoogleDeps(google.deps);
  return { db, apple, google, router: require('../routes/billing'), store: require('../utils/storeSubscriptions'), service };
}

async function withServer(router, fn) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/billing', router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}/billing`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

async function call(base, path, { auth, body, method = 'POST', headers = {} } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), 'Content-Type': 'application/json', ...headers },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  return { status: res.status, body: await res.json() };
}
const verifyIos = (base, auth, transactionId, productId = 'test.pro.monthly', source = 'purchase') =>
  call(base, '/store/verify', { auth, body: { platform: 'ios', productId, transactionId, source } });
const verifyAndroid = (base, auth, purchaseToken = GTOKEN, productId = 'test_pro', source = 'purchase') =>
  call(base, '/store/verify', { auth, body: { platform: 'android', productId, purchaseToken, source } });
const user = (db, uid) => db.store.get(`users/${uid}`).data;
const subsIn = (db) => [...db.store.entries()].filter(([k]) => k.startsWith('storeSubscriptions/')).map(([, v]) => v.data);

// ---- product / plan mapping ------------------------------------------------

test('product mapping: only configured, well-formed IDs; unset/malformed never purchasable', () => {
  installFakes();
  const cfg = require('../config/storeBilling');
  const ios = cfg.getStoreProducts('ios');
  assert.deepEqual(
    ios.map((p) => [p.tierKey, p.tier, p.period, p.productId]),
    [
      ['professional', 'professional', 'monthly', 'test.pro.monthly'],
      ['agency', 'agency', 'monthly', 'test.agency.monthly'],
    ]
  );
  const android = cfg.getStoreProducts('android');
  assert.deepEqual(android.map((p) => `${p.tierKey}=${p.productId}:${p.basePlanId}`), [
    'professional=test_pro:monthly',
    'professional_annual=test_pro:annual',
  ]);
  assert.equal(cfg.resolveStoreProduct('android', 'test_pro', 'annual').tierKey, 'professional_annual');
  // Two base plans on one product: base plan must match exactly.
  assert.equal(cfg.resolveStoreProduct('android', 'test_pro', null), null);
  assert.equal(cfg.resolveStoreProduct('ios', 'unknown.product'), null);
  assert.deepEqual(cfg.getStoreProducts('web'), []);

  process.env.GOOGLE_PLAY_PRODUCT_AGENCY = 'no-base-plan';
  process.env.APPLE_IAP_PRODUCT_ENTERPRISE = 'bad id with spaces';
  process.env.APPLE_IAP_PRODUCT_AGENCY_ANNUAL = 'test.pro.monthly'; // duplicate of professional
  try {
    assert.equal(cfg.getStoreProducts('android').length, 2);
    assert.equal(cfg.getStoreProducts('ios').length, 2);
  } finally {
    delete process.env.GOOGLE_PLAY_PRODUCT_AGENCY;
    delete process.env.APPLE_IAP_PRODUCT_ENTERPRISE;
    delete process.env.APPLE_IAP_PRODUCT_AGENCY_ANNUAL;
  }
});

test('catalog: unconfigured store -> honest unavailable state, no products', async () => {
  const { router } = installFakes();
  // No Apple credentials in the test env -> the real config check says unconfigured.
  await withServer(router, async (base) => {
    const r = await call(base, '/store/catalog?platform=ios', { auth: 'tok-a', method: 'GET' });
    assert.equal(r.status, 200);
    assert.equal(r.body.available, false);
    assert.equal(r.body.reason, 'STORE_NOT_CONFIGURED');
    assert.deepEqual(r.body.products, []);
    const bad = await call(base, '/store/catalog?platform=web', { auth: 'tok-a', method: 'GET' });
    assert.equal(bad.status, 400);
    const anon = await call(base, '/store/catalog?platform=ios', { method: 'GET' });
    assert.equal(anon.status, 401);
  });
});

test('catalog: configured store lists mapped plans with live plan limits', async () => {
  const { router } = installFakes();
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'x@example.com', private_key: 'k' });
  try {
    await withServer(router, async (base) => {
      const r = await call(base, '/store/catalog?platform=android', { auth: 'tok-a', method: 'GET' });
      assert.equal(r.body.available, true);
      assert.deepEqual(r.body.products.map((p) => [p.tierKey, p.planName, p.reportsPerMonth]), [
        ['professional', 'Professional', 50],
        ['professional_annual', 'Professional', 50],
      ]);
      assert.ok(!JSON.stringify(r.body).includes('private_key'));
    });
  } finally {
    delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  }
});

// ---- entitlement calculation / Stripe compatibility ------------------------

test('entitlements: accounts without a store purchase resolve exactly as before', () => {
  const e = require('../utils/entitlements');
  assert.equal(e.resolveEffectiveTier({ tier: 'agency' }), 'agency');
  assert.equal(e.resolveEffectiveTier({}), 'starter');
  // Once sources exist, `tier` is derived from them (highest wins).
  assert.equal(e.resolveEffectiveTier({ tier: 'enterprise', stripeTier: 'professional' }), 'professional');
  assert.equal(e.resolveEffectiveTier({ stripeTier: 'professional', adminTier: 'agency' }), 'agency');
  assert.equal(e.resolveEffectiveTier({ stripeTier: 'starter', teamOwnerId: 'o', teamMembershipStatus: 'active' }), 'enterprise');
  assert.equal(e.needsTierReconcile({ tier: 'agency' }), false);
  // Legacy snapshot keeps what an untouched account had.
  assert.deepEqual(e.legacySnapshot({ tier: 'agency' }), { legacyTier: 'agency' });
  assert.deepEqual(e.legacySnapshot({ tier: 'enterprise', teamOwnerId: 'o', teamMembershipStatus: 'active' }), { legacyTier: 'starter' });
  assert.deepEqual(e.legacySnapshot({ tier: 'agency', adminUpdated: true }), { legacyTier: 'starter', adminTier: 'agency' });
  assert.deepEqual(
    e.legacySnapshot({ tier: 'agency', adminUpdated: true, stripeSubscriptionId: 's', subscriptionStatus: 'active' }),
    { legacyTier: 'agency' }
  );
  assert.deepEqual(e.legacySnapshot({ tier: 'agency', stripeTier: 'agency' }), {});
});

test('entitlements: store + Stripe combine to the higher tier; expiry/cancellation semantics', () => {
  const e = require('../utils/entitlements');
  const active = { tier: 'agency', state: 'active', expiresAt: new Date(future()).toISOString() };
  assert.equal(e.resolveEffectiveTier({ tier: 'agency', stripeTier: 'professional', storeEntitlement: active }), 'agency');
  assert.equal(e.resolveEffectiveTier({ tier: 'agency', stripeTier: 'enterprise', storeEntitlement: active }), 'enterprise');
  // Cancelled (auto-renew off) keeps access until expiry -- state stays active.
  assert.equal(e.resolveEffectiveTier({ legacyTier: 'starter', storeEntitlement: { ...active, autoRenew: false } }), 'agency');
  // Expired beyond leeway -> back to the non-store tier, and a reconcile is due.
  const lapsed = { ...active, expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() };
  const doc = { tier: 'agency', legacyTier: 'professional', storeEntitlement: lapsed };
  assert.equal(e.resolveEffectiveTier(doc), 'professional');
  assert.equal(e.needsTierReconcile(doc), true);
  // Within the 1h leeway still entitled.
  const justPast = { ...active, expiresAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() };
  assert.equal(e.resolveEffectiveTier({ legacyTier: 'starter', storeEntitlement: justPast }), 'agency');
  for (const state of ['on_hold', 'paused', 'pending', 'billing_retry', 'expired', 'revoked', 'replaced']) {
    assert.equal(e.resolveEffectiveTier({ legacyTier: 'starter', storeEntitlement: { ...active, state } }), 'starter', state);
  }
  assert.equal(e.resolveEffectiveTier({ legacyTier: 'starter', storeEntitlement: { ...active, state: 'grace_period' } }), 'agency');
  // Stripe downgrade does not remove an active store entitlement.
  assert.equal(e.resolveEffectiveTier({ stripeTier: 'starter', storeEntitlement: active }), 'agency');
  // Sandbox purchase not allowed for this account grants nothing.
  assert.equal(e.resolveEffectiveTier({ stripeTier: 'starter', storeEntitlement: { ...active, isTest: true, testAccessAllowed: false } }), 'starter');
});

// ---- Apple verification ----------------------------------------------------

test('apple verify: grants only after store verification; idempotent; finish=true', async () => {
  const { router, db, apple } = installFakes();
  apple.addTx({ id: '1000' });
  await withServer(router, async (base) => {
    const r1 = await verifyIos(base, 'tok-a', '1000');
    assert.equal(r1.status, 200);
    assert.equal(r1.body.entitled, true);
    assert.equal(r1.body.finish, true);
    assert.equal(r1.body.tier, 'professional');
    assert.equal(r1.body.subscription.platform, 'ios');
    const u = user(db, 'userA');
    assert.equal(u.tier, 'professional');
    assert.equal(u.legacyTier, 'starter');
    assert.equal(u.stripeSubscriptionId, undefined); // web billing records untouched
    const r2 = await verifyIos(base, 'tok-a', '1000', 'test.pro.monthly', 'restore');
    assert.equal(r2.status, 200);
    assert.equal(subsIn(db).length, 1);
    assert.ok(!JSON.stringify(r2.body).includes(TOKEN_A), 'account token never echoed in verify response');
  });
});

test('apple verify: failures never grant access', async () => {
  const { router, db, apple } = installFakes();
  apple.addTx({ id: '2000', productId: 'other.app.product' });
  apple.addTx({ id: '2001' });
  apple.addTx({ id: '2002', bundleId: 'com.someone.else' });
  apple.addTx({ id: '2003', inAppOwnershipType: 'FAMILY_SHARED' });
  await withServer(router, async (base) => {
    assert.equal((await verifyIos(base, 'tok-a', '2000', 'other.app.product')).body.code, 'PRODUCT_NOT_CONFIGURED');
    assert.equal((await verifyIos(base, 'tok-a', '2001', 'test.agency.monthly')).body.code, 'PRODUCT_MISMATCH');
    assert.equal((await verifyIos(base, 'tok-a', '2002')).body.code, 'APP_MISMATCH');
    assert.equal((await verifyIos(base, 'tok-a', '2003')).body.code, 'FAMILY_SHARING_NOT_SUPPORTED');
    const unknown = await verifyIos(base, 'tok-a', '9999');
    assert.equal(unknown.status, 422);
    assert.equal(unknown.body.code, 'INVALID_PURCHASE');
    assert.equal(unknown.body.finish, false);
    assert.equal((await verifyIos(base, 'tok-a', 'not-a-number')).body.code, 'INVALID_PURCHASE');
    assert.equal((await call(base, '/store/verify', { auth: 'tok-a', body: { platform: 'ios' } })).status, 400);
    assert.equal((await verifyIos(base, null, '2001')).status, 401);

    apple.state.failWith = Object.assign(new Error('Server error token=secret'), { httpStatusCode: 503 });
    const outage = await verifyIos(base, 'tok-a', '2001');
    assert.equal(outage.status, 503);
    assert.equal(outage.body.code, 'STORE_UNAVAILABLE');
    assert.ok(!JSON.stringify(outage.body).includes('secret'));
  });
  assert.equal(user(db, 'userA').tier, 'starter');
  assert.equal(subsIn(db).length, 0);
});

test('apple verify: sandbox falls back from production, and is refused when sandbox is not accepted', async () => {
  const { router, db, apple } = installFakes();
  apple.addTx({ id: '3000', env: 'Sandbox' });
  await withServer(router, async (base) => {
    process.env.STORE_BILLING_ACCEPT_SANDBOX = 'false';
    try {
      const refused = await verifyIos(base, 'tok-a', '3000');
      assert.equal(refused.body.code, 'SANDBOX_NOT_ACCEPTED');
      assert.equal(user(db, 'userA').tier, 'starter');
    } finally {
      delete process.env.STORE_BILLING_ACCEPT_SANDBOX;
    }
    const ok = await verifyIos(base, 'tok-a', '3000');
    assert.equal(ok.body.entitled, true);
    assert.equal(ok.body.subscription.isTest, true);
  });
});

test('apple lifecycle: billing retry / expired / revoked remove access; grace period keeps it', async () => {
  const { router, db, apple } = installFakes();
  apple.addTx({ id: '4000' });
  await withServer(router, async (base) => {
    await verifyIos(base, 'tok-a', '4000');
    for (const [status, tier] of [[4, 'professional'], [3, 'starter'], [1, 'professional'], [2, 'starter'], [5, 'starter']]) {
      apple.state.statuses.get('4000').status = status;
      const r = await verifyIos(base, 'tok-a', '4000', 'test.pro.monthly', 'restore');
      assert.equal(r.body.tier, tier, `status ${status}`);
      assert.equal(user(db, 'userA').tier, tier);
      assert.equal(r.body.finish, true);
    }
  });
});

// ---- account ownership / switching -----------------------------------------

test('ownership: a purchase made for account A can never be bound to account B', async () => {
  const { router, db, apple } = installFakes();
  apple.addTx({ id: '5000', token: TOKEN_A });
  await withServer(router, async (base) => {
    // Account switch race: B is signed in when A's purchase is verified.
    const r = await verifyIos(base, 'tok-b', '5000');
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'ACCOUNT_MISMATCH');
    assert.equal(r.body.finish, false);
    assert.equal(user(db, 'userB').tier, 'starter');
    assert.equal((await verifyIos(base, 'tok-a', '5000')).body.tier, 'professional');
  });
});

test('ownership: token-less purchase binds to the first account, never transferred on restore', async () => {
  const { router, db, apple } = installFakes();
  apple.addTx({ id: '6000', token: null });
  await withServer(router, async (base) => {
    assert.equal((await verifyIos(base, 'tok-a', '6000')).body.tier, 'professional');
    const stolen = await verifyIos(base, 'tok-b', '6000', 'test.pro.monthly', 'restore');
    assert.equal(stolen.status, 409);
    assert.equal(stolen.body.code, 'PURCHASE_OWNED_BY_OTHER_ACCOUNT');
    assert.equal(user(db, 'userB').tier, 'starter');
    assert.equal(user(db, 'userA').tier, 'professional');
  });
});

test('ownership: concurrent verification by two accounts leaves exactly one owner', async () => {
  const { router, db, apple } = installFakes();
  apple.addTx({ id: '6500', token: null });
  await withServer(router, async (base) => {
    const [a, b] = await Promise.all([verifyIos(base, 'tok-a', '6500'), verifyIos(base, 'tok-b', '6500')]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const tiers = [user(db, 'userA').tier, user(db, 'userB').tier].sort();
    assert.deepEqual(tiers, ['professional', 'starter']);
  });
});

test('ownership: a deleted owner purchase is never re-linked to another account', async () => {
  const { router, db, apple } = installFakes();
  apple.addTx({ id: '6600', token: null });
  await withServer(router, async (base) => {
    await verifyIos(base, 'tok-a', '6600');
    db.store.delete('users/userA');
    const r = await verifyIos(base, 'tok-b', '6600', 'test.pro.monthly', 'restore');
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'PURCHASE_LINKED_TO_DELETED_ACCOUNT');
    assert.equal(user(db, 'userB').tier, 'starter');
  });
});

test('account token: created once per account, stable, authenticated', async () => {
  const { router, db } = installFakes({ users: { userA: { email: 'a@example.com', tier: 'starter' } } });
  await withServer(router, async (base) => {
    const r1 = await call(base, '/store/account-token', { auth: 'tok-a' });
    const r2 = await call(base, '/store/account-token', { auth: 'tok-a' });
    assert.match(r1.body.accountToken, /^[0-9a-f-]{36}$/);
    assert.equal(r1.body.accountToken, r2.body.accountToken);
    assert.equal(user(db, 'userA').billingAccountToken, r1.body.accountToken);
    assert.equal((await call(base, '/store/account-token', {})).status, 401);
  });
});

// ---- Google verification -----------------------------------------------------

test('google verify: verified + acknowledged server-side; pending is not entitled and not finished', async () => {
  const { router, db, google } = installFakes();
  google.setSub(GTOKEN);
  google.setSub('pending-token-bbbbbbbbbbbb', { subscriptionState: 'SUBSCRIPTION_STATE_PENDING' });
  await withServer(router, async (base) => {
    const r = await verifyAndroid(base, 'tok-a');
    assert.equal(r.body.entitled, true);
    assert.equal(r.body.finish, true);
    assert.equal(google.state.acks.length, 1);
    assert.ok(google.state.acks[0].includes(':acknowledge'));
    assert.equal(user(db, 'userA').tier, 'professional');
    const stored = subsIn(db)[0];
    assert.ok(!JSON.stringify(stored).includes(GTOKEN), 'raw purchase token is not stored');

    const p = await verifyAndroid(base, 'tok-b', 'pending-token-bbbbbbbbbbbb');
    assert.equal(p.status, 409); // token belongs to account A
    google.setSub('pending-token-bbbbbbbbbbbb', {
      subscriptionState: 'SUBSCRIPTION_STATE_PENDING',
      externalAccountIdentifiers: { obfuscatedExternalAccountId: TOKEN_B },
    });
    const p2 = await verifyAndroid(base, 'tok-b', 'pending-token-bbbbbbbbbbbb');
    assert.equal(p2.body.entitled, false);
    assert.equal(p2.body.finish, false);
    assert.equal(user(db, 'userB').tier, 'starter');
    assert.equal(google.state.acks.length, 1, 'pending purchase not acknowledged');
  });
});

test('google lifecycle: cancelled keeps access until expiry; on hold/paused/expired remove it', async () => {
  const { router, db, google } = installFakes();
  google.setSub(GTOKEN);
  await withServer(router, async (base) => {
    await verifyAndroid(base, 'tok-a');
    const set = (state, extra = {}) => google.setSub(GTOKEN, { subscriptionState: state, acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED', ...extra });
    set('SUBSCRIPTION_STATE_CANCELED', {
      lineItems: [{ productId: 'test_pro', expiryTime: new Date(future(5)).toISOString(), offerDetails: { basePlanId: 'monthly' }, autoRenewingPlan: { autoRenewEnabled: false } }],
    });
    let r = await verifyAndroid(base, 'tok-a', GTOKEN, 'test_pro', 'restore');
    assert.equal(r.body.tier, 'professional', 'cancelled is not immediate expiration');
    assert.equal(r.body.subscription.state, 'active');
    assert.equal(r.body.subscription.autoRenew, false);
    for (const [state, tier] of [
      ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'professional'],
      ['SUBSCRIPTION_STATE_ON_HOLD', 'starter'],
      ['SUBSCRIPTION_STATE_PAUSED', 'starter'],
      ['SUBSCRIPTION_STATE_ACTIVE', 'professional'],
      ['SUBSCRIPTION_STATE_EXPIRED', 'starter'],
    ]) {
      set(state);
      r = await verifyAndroid(base, 'tok-a', GTOKEN, 'test_pro', 'restore');
      assert.equal(r.body.tier, tier, state);
      assert.equal(user(db, 'userA').tier, tier);
    }
  });
});

test('google: test purchases follow the sandbox policy; unknown token / outage never grants', async () => {
  const { router, db, google } = installFakes();
  google.setSub(GTOKEN, { testPurchase: {} });
  await withServer(router, async (base) => {
    process.env.STORE_BILLING_ACCEPT_SANDBOX = 'false';
    try {
      assert.equal((await verifyAndroid(base, 'tok-a')).body.code, 'SANDBOX_NOT_ACCEPTED');
    } finally {
      delete process.env.STORE_BILLING_ACCEPT_SANDBOX;
    }
    assert.equal((await verifyAndroid(base, 'tok-a', 'unknown-token-cccccccccccc')).body.code, 'INVALID_PURCHASE');
    assert.equal((await verifyAndroid(base, 'tok-a', GTOKEN, 'test_other')).body.code, 'PRODUCT_MISMATCH');
    google.state.failWith = Object.assign(new Error('x'), { response: { status: 500 } });
    assert.equal((await verifyAndroid(base, 'tok-a')).status, 503);
  });
  assert.equal(user(db, 'userA').tier, 'starter');
});

test('google: linkedPurchaseToken (upgrade/resubscribe) retires the previous purchase', async () => {
  const { router, db, google } = installFakes();
  google.setSub(GTOKEN);
  await withServer(router, async (base) => {
    await verifyAndroid(base, 'tok-a');
    google.setSub('new-token-dddddddddddd', {
      linkedPurchaseToken: GTOKEN,
      lineItems: [{ productId: 'test_pro', expiryTime: new Date(future(365)).toISOString(), offerDetails: { basePlanId: 'annual' }, autoRenewingPlan: { autoRenewEnabled: true } }],
    });
    const r = await verifyAndroid(base, 'tok-a', 'new-token-dddddddddddd');
    assert.equal(r.body.subscription.period, 'annual');
    const states = subsIn(db).map((s) => s.state).sort();
    assert.deepEqual(states, ['active', 'replaced']);
    // B can't claim the retired token either.
    google.setSub(GTOKEN, { externalAccountIdentifiers: {} });
    assert.equal((await verifyAndroid(base, 'tok-b', GTOKEN, 'test_pro', 'restore')).status, 409);
  });
});

// ---- notifications -----------------------------------------------------------

test('apple notifications: unsigned/forged rejected; signed processed once; replay is a no-op', async () => {
  const { router, db, apple } = installFakes();
  apple.addTx({ id: '7000' });
  const payload = (o) => `signed:${JSON.stringify({ env: 'Production', ...o })}`;
  await withServer(router, async (base) => {
    assert.equal((await call(base, '/store/notifications/apple', { body: {} })).status, 400);
    assert.equal((await call(base, '/store/notifications/apple', { body: { signedPayload: 'forged' } })).status, 400);
    assert.equal(user(db, 'userA').tier, 'starter');

    // Purchase completed but the app never reported it (crash): bound via account token.
    const n1 = await call(base, '/store/notifications/apple', { body: { signedPayload: payload({ uuid: 'n-1', type: 'SUBSCRIBED', txId: '7000' }) } });
    assert.equal(n1.status, 200);
    assert.equal(user(db, 'userA').tier, 'professional');

    apple.state.statuses.get('7000').status = 2; // expired
    const n2 = await call(base, '/store/notifications/apple', { body: { signedPayload: payload({ uuid: 'n-2', type: 'EXPIRED', txId: '7000' }) } });
    assert.equal(n2.status, 200);
    assert.equal(user(db, 'userA').tier, 'starter');

    // Replay of the old SUBSCRIBED notification: deduped, and even if it weren't,
    // state is re-read from the store -- access is not resurrected.
    apple.state.calls = 0;
    const replay = await call(base, '/store/notifications/apple', { body: { signedPayload: payload({ uuid: 'n-1', type: 'SUBSCRIBED', txId: '7000' }) } });
    assert.equal(replay.body.duplicate, true);
    assert.equal(user(db, 'userA').tier, 'starter');
    assert.ok(db.store.has('processedStoreNotifications/apple_n-1'));

    const test1 = await call(base, '/store/notifications/apple', { body: { signedPayload: payload({ uuid: 'n-3', type: 'TEST' }) } });
    assert.equal(test1.status, 200);
  });
});

test('apple notifications: token-less purchase from a notification is recorded but unclaimed', async () => {
  const { router, db, apple } = installFakes();
  apple.addTx({ id: '7100', token: null });
  await withServer(router, async (base) => {
    await call(base, '/store/notifications/apple', {
      body: { signedPayload: `signed:${JSON.stringify({ env: 'Production', uuid: 'n-9', type: 'SUBSCRIBED', txId: '7100' })}` },
    });
    assert.equal(subsIn(db)[0].ownerUid, null);
    assert.equal(user(db, 'userA').tier, 'starter');
    // Restore later binds it to the signed-in account.
    assert.equal((await verifyIos(base, 'tok-a', '7100', 'test.pro.monthly', 'restore')).body.tier, 'professional');
  });
});

test('google RTDN: unauthenticated / wrong identity rejected; valid push processed once', async () => {
  const { router, db, google } = installFakes();
  google.setSub(GTOKEN);
  const msg = (id, data) => ({ message: { messageId: id, data: Buffer.from(JSON.stringify(data)).toString('base64') } });
  const body = msg('m-1', { packageName: 'com.example.test', subscriptionNotification: { notificationType: 4, purchaseToken: GTOKEN } });
  await withServer(router, async (base) => {
    assert.equal((await call(base, '/store/notifications/google', { body })).status, 401);
    assert.equal((await call(base, '/store/notifications/google', { body, headers: { Authorization: 'Bearer forged' } })).status, 401);
    assert.equal(user(db, 'userA').tier, 'starter');

    const auth = { Authorization: 'Bearer valid-oidc' };
    const ok = await call(base, '/store/notifications/google', { body, headers: auth });
    assert.equal(ok.status, 200);
    assert.equal(user(db, 'userA').tier, 'professional');
    assert.equal(google.state.acks.length, 1, 'acknowledged once bound');

    const before = google.state.requests;
    const replay = await call(base, '/store/notifications/google', { body, headers: auth });
    assert.equal(replay.body.duplicate, true);
    assert.equal(google.state.requests, before);

    const other = await call(base, '/store/notifications/google', {
      body: msg('m-2', { packageName: 'com.attacker.app', subscriptionNotification: { purchaseToken: GTOKEN } }),
      headers: auth,
    });
    assert.equal(other.body.ignored, true);

    google.setSub(GTOKEN, { subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' });
    await call(base, '/store/notifications/google', {
      body: msg('m-3', { packageName: 'com.example.test', subscriptionNotification: { notificationType: 12, purchaseToken: GTOKEN } }),
      headers: auth,
    });
    assert.equal(user(db, 'userA').tier, 'starter');

    // Store outage: 5xx so Pub/Sub redelivers, and the message is NOT marked processed.
    google.state.failWith = Object.assign(new Error('x'), { response: { status: 503 } });
    const fail = await call(base, '/store/notifications/google', {
      body: msg('m-4', { packageName: 'com.example.test', subscriptionNotification: { purchaseToken: GTOKEN } }),
      headers: auth,
    });
    assert.equal(fail.status, 500);
    assert.ok(!db.store.has('processedStoreNotifications/google_m-4'));
    assert.equal((await call(base, '/store/notifications/google', { body: { message: {} }, headers: auth })).status, 400);
  });
});

test('notifications: missing credentials fail safely (503, nothing granted)', async () => {
  const { router, db, service } = installFakes();
  service.setAppleDeps({ isConfigured: () => false });
  service.setGoogleDeps({ isConfigured: () => false, isRtdnConfigured: () => false });
  await withServer(router, async (base) => {
    assert.equal((await call(base, '/store/notifications/apple', { body: { signedPayload: 'signed:{}' } })).status, 503);
    assert.equal((await call(base, '/store/notifications/google', { body: {}, headers: { Authorization: 'Bearer valid-oidc' } })).status, 503);
    assert.equal((await verifyIos(base, 'tok-a', '1')).body.code, 'STORE_NOT_CONFIGURED');
    assert.equal((await verifyAndroid(base, 'tok-a')).body.code, 'STORE_NOT_CONFIGURED');
  });
  assert.equal(user(db, 'userA').tier, 'starter');
});

// ---- status / web subscription handling ------------------------------------

test('status: web (Stripe) subscribers are told to manage on the web and cannot buy in-app', async () => {
  const { router } = installFakes({
    users: {
      userA: { email: 'a@example.com', tier: 'agency', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active', stripeCustomerId: 'cus_1' },
    },
  });
  await withServer(router, async (base) => {
    const r = await call(base, '/status', { auth: 'tok-a', method: 'GET' });
    assert.equal(r.body.tier, 'agency');
    assert.equal(r.body.stripe.active, true);
    assert.equal(r.body.canPurchaseInApp, false);
    assert.equal(r.body.purchaseBlockedReason, 'WEB_SUBSCRIPTION_ACTIVE');
    assert.equal(r.body.store, null);
    assert.ok(!JSON.stringify(r.body).includes('sub_1') && !JSON.stringify(r.body).includes('cus_1'));
    const b = await call(base, '/status', { auth: 'tok-b', method: 'GET' });
    assert.equal(b.body.canPurchaseInApp, true);
  });
});

test('status: an active store subscription blocks a second store purchase; lapsed one reconciles', async () => {
  const { router, db, apple, store } = installFakes();
  apple.addTx({ id: '8000' });
  await withServer(router, async (base) => {
    await verifyIos(base, 'tok-a', '8000');
    const r = await call(base, '/status', { auth: 'tok-a', method: 'GET' });
    assert.equal(r.body.purchaseBlockedReason, 'STORE_SUBSCRIPTION_ACTIVE');
    assert.equal(r.body.store.active, true);
  });
  // No EXPIRED notification ever arrives: the stored sub simply runs past expiry.
  const [key] = [...db.store.keys()].filter((k) => k.startsWith('storeSubscriptions/'));
  db.store.get(key).data.expiresAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const doc = user(db, 'userA');
  doc.storeEntitlement.expiresAt = db.store.get(key).data.expiresAt;
  assert.equal(require('../utils/entitlements').resolveEffectiveTier(doc), 'starter');
  await store.recomputeUserStoreEntitlement(db, 'userA');
  assert.equal(user(db, 'userA').tier, 'starter');
});

test('stripe webhook after a store purchase keeps the store tier (shared calculation)', async () => {
  const { db, apple, router } = installFakes();
  apple.addTx({ id: '9000', productId: 'test.agency.monthly' });
  await withServer(router, async (base) => {
    await verifyIos(base, 'tok-a', '9000', 'test.agency.monthly');
  });
  const { applyEntitlementSources } = require('../utils/entitlements');
  // A Stripe write below the store tier keeps the store tier ...
  assert.equal(await applyEntitlementSources(db, 'userA', () => ({ stripeTier: 'professional' })), 'agency');
  assert.equal(user(db, 'userA').storeEntitlement.tier, 'agency', 'store record untouched');
  // ... and after the store sub ends, the Stripe tier remains.
  apple.state.statuses.get('9000').status = 2;
  await withServer(router, async (base) => {
    await verifyIos(base, 'tok-a', '9000', 'test.agency.monthly', 'restore');
  });
  assert.equal(user(db, 'userA').tier, 'professional');
});

test('refund/revocation of one store subscription never removes another valid one', async () => {
  const { router, db, apple, google } = installFakes();
  apple.addTx({ id: '9100', productId: 'test.agency.monthly' });
  google.setSub(GTOKEN);
  await withServer(router, async (base) => {
    await verifyIos(base, 'tok-a', '9100', 'test.agency.monthly');
    await verifyAndroid(base, 'tok-a');
    assert.equal(user(db, 'userA').tier, 'agency');
    apple.state.statuses.get('9100').status = 5; // Apple REFUND -> revoked
    await verifyIos(base, 'tok-a', '9100', 'test.agency.monthly', 'restore');
    assert.equal(user(db, 'userA').tier, 'professional', 'Google subscription still grants');
    assert.equal(user(db, 'userA').storeEntitlement.platform, 'android');
  });
});

test('sandbox in production: only allow-listed tester accounts get access', async () => {
  const { router, db, apple } = installFakes({
    users: { userB: { email: 'reviewer@example.com', tier: 'starter', billingAccountToken: TOKEN_B } },
  });
  apple.addTx({ id: '9200', env: 'Sandbox', token: TOKEN_A });
  apple.addTx({ id: '9201', env: 'Sandbox', token: TOKEN_B });
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  process.env.STORE_SANDBOX_TESTER_EMAILS = 'Reviewer@Example.com';
  try {
    await withServer(router, async (base) => {
      const denied = await verifyIos(base, 'tok-a', '9200');
      assert.equal(denied.body.code, 'SANDBOX_NOT_ACCEPTED');
      assert.equal(user(db, 'userA').tier, 'starter');
      const ok = await verifyIos(base, 'tok-b', '9201');
      assert.equal(ok.body.entitled, true);
      assert.equal(user(db, 'userB').tier, 'professional');
      // A sandbox notification for a non-allowed account is recorded but grants nothing.
      await call(base, '/store/notifications/apple', {
        body: { signedPayload: `signed:${JSON.stringify({ env: 'Sandbox', uuid: 'sb-1', type: 'SUBSCRIBED', txId: '9200' })}` },
      });
      assert.equal(user(db, 'userA').tier, 'starter');
      assert.ok(subsIn(db).some((s) => s.ownerUid === 'userA' && s.testAccessAllowed === false));
    });
  } finally {
    process.env.NODE_ENV = prev;
    delete process.env.STORE_SANDBOX_TESTER_EMAILS;
  }
});

test('apple plan change: a pending downgrade is reported with the next-renewal tier', async () => {
  const { router, db, apple } = installFakes();
  apple.addTx({ id: '9300', productId: 'test.agency.monthly' });
  await withServer(router, async (base) => {
    await verifyIos(base, 'tok-a', '9300', 'test.agency.monthly');
    // User picked Professional in App Store subscription management (applies at renewal).
    apple.state.renewalProduct = 'test.pro.monthly';
    const r = await verifyIos(base, 'tok-a', '9300', 'test.agency.monthly', 'restore');
    assert.equal(r.body.tier, 'agency', 'current period keeps the higher plan');
    assert.equal(r.body.store.renewsToTier, 'professional');
    // Upgrade applies immediately: the latest transaction carries the new product.
    apple.addTx({ id: '9301', otid: '9300', productId: 'test.pro.monthly' });
    apple.state.renewalProduct = null;
    const up = await verifyIos(base, 'tok-a', '9301', 'test.pro.monthly', 'restore');
    assert.equal(up.body.tier, 'professional');
    assert.equal(subsIn(db).length, 1, 'same originalTransactionId -> same record');
  });
});

test('Enterprise is never sold in-app, even if a store product is configured (sales-led on web)', () => {
  installFakes();
  process.env.APPLE_IAP_PRODUCT_ENTERPRISE = 'test.enterprise.monthly';
  process.env.GOOGLE_PLAY_PRODUCT_ENTERPRISE = 'test_ent:monthly';
  try {
    const cfg = require('../config/storeBilling');
    assert.ok(!cfg.getStoreProducts('ios').some((p) => p.tier === 'enterprise'));
    assert.ok(!cfg.getStoreProducts('android').some((p) => p.tier === 'enterprise'));
    assert.equal(cfg.resolveStoreProduct('ios', 'test.enterprise.monthly'), null);
  } finally {
    delete process.env.APPLE_IAP_PRODUCT_ENTERPRISE;
    delete process.env.GOOGLE_PLAY_PRODUCT_ENTERPRISE;
  }
});
