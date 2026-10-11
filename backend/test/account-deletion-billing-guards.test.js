const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Account deletion <-> Stripe races (decision §10.26): while a deletion lease is
// held, or after the account is tombstoned, no checkout / confirm / photo pack
// may start and no delayed webhook may (re)grant a subscription. A webhook that
// arrives mid-deletion is NOT acknowledged (500 -> Stripe redelivers later); one
// that arrives after deletion cancels the new subscription instead of granting.
// REAL payment router + auth middleware; mocked Stripe and Firestore only.
process.env.PLAN_CONFIG_CACHE_TTL_MS = '0';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_PRICE_PROFESSIONAL = 'price_professional';
delete process.env.MFA_ENFORCEMENT_ENABLED;

const firebaseConfigPath = require.resolve('../config/firebase');
const stripePath = require.resolve('stripe');
const resetPaths = [
  firebaseConfigPath,
  stripePath,
  require.resolve('../middleware/auth'),
  require.resolve('../config/tiers'),
  require.resolve('../routes/payment'),
  require.resolve('../services/stripeAccountCancellation'),
];

const lease = () => ({ accountDeletionLock: { startedAt: Date.now(), until: Date.now() + 60000 } });

function install({ users = {}, seed = {} } = {}) {
  resetPaths.forEach((p) => delete require.cache[p]);
  const db = new FakeFirestore();
  for (const [uid, data] of Object.entries(users))
    db.store.set(`users/${uid}`, { version: 1, data });
  for (const [path, data] of Object.entries(seed)) db.store.set(path, { version: 1, data });
  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath,
    filename: firebaseConfigPath,
    loaded: true,
    exports: {
      getAuth: () => ({
        verifyIdToken: async (t) => ({ uid: t, email: `${t}@example.com`, auth_time: 1, iat: 1 }),
      }),
      getFirestore: () => db,
      FieldValue: { serverTimestamp: () => new Date().toISOString(), increment: (n) => n },
      Timestamp: {},
      admin: {},
      initFirebase: () => {},
      getBucket: () => {},
    },
  };
  const subs = {
    sub_new: {
      id: 'sub_new',
      status: 'active',
      created: 1700000000,
      customer: 'cus_A',
      cancel_at_period_end: false,
      current_period_end: 1800000000,
      items: { data: [{ id: 'si_1', price: { id: 'price_professional' } }] },
      metadata: { uid: 'userA', tier: 'professional' },
    },
  };
  const calls = { cancel: [], sessionsCreate: 0 };
  const fakeStripe = {
    webhooks: { constructEvent: (raw) => JSON.parse(raw.toString()) },
    subscriptions: {
      retrieve: async (id) => subs[id],
      list: async () => ({ data: [] }),
      cancel: async (id, params, opts) => {
        calls.cancel.push({ id, params, opts });
        subs[id].status = 'canceled';
        return subs[id];
      },
    },
    checkout: {
      sessions: {
        create: async () => {
          calls.sessionsCreate++;
          return { id: 'cs_1', url: 'https://checkout.example' };
        },
        retrieve: async () => ({
          metadata: { uid: 'userA', tier: 'professional' },
          status: 'complete',
          payment_status: 'paid',
          subscription: subs.sub_new,
        }),
      },
    },
    customers: { create: async () => ({ id: 'cus_A' }) },
    paymentIntents: {},
    subscriptionSchedules: {},
    invoices: {},
  };
  require.cache[stripePath] = {
    id: stripePath,
    filename: stripePath,
    loaded: true,
    exports: () => fakeStripe,
  };
  return { db, calls, subs, router: require('../routes/payment') };
}

async function withServer(router, fn) {
  const app = express();
  app.use('/payment/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use('/payment', router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}/payment`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const post = async (base, path, body, auth = 'userA') => {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth}`,
      'stripe-signature': 'ok',
    },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, body: await res.json() };
};

const completed = (id) => ({
  id,
  type: 'checkout.session.completed',
  data: { object: { metadata: { uid: 'userA', tier: 'professional' }, subscription: 'sub_new' } },
});

test('checkout, confirm and photo packs are refused while deletion is in progress or after the tombstone', async () => {
  for (const setup of [
    { users: { userA: { email: 'a@example.com', ...lease() } } },
    {
      users: { userA: { email: 'a@example.com' } },
      seed: { 'deletedAccounts/userA': { completed: false } },
    },
  ]) {
    const { calls, router } = install(setup);
    await withServer(router, async (base) => {
      for (const [path, body] of [
        ['/create-checkout-session', { tier: 'professional' }],
        ['/confirm-checkout', { sessionId: 'cs_1' }],
        ['/photo-pack-checkout', { reportId: 'r1', packId: 'p1' }],
      ]) {
        const r = await post(base, path, body);
        assert.equal(r.status, 409, path);
        assert.equal(r.body.code, 'ACCOUNT_DELETION_IN_PROGRESS', path);
      }
    });
    assert.equal(calls.sessionsCreate, 0);
  }
});

test('a normal account can still start checkout (unchanged behaviour)', async () => {
  const { calls, router } = install({
    users: { userA: { email: 'a@example.com', stripeCustomerId: 'cus_A' } },
  });
  await withServer(router, async (base) => {
    const r = await post(base, '/create-checkout-session', { tier: 'professional' });
    assert.equal(r.status, 200);
    assert.equal(r.body.url, 'https://checkout.example');
  });
  assert.equal(calls.sessionsCreate, 1);
});

test('webhook mid-deletion is not acknowledged (Stripe redelivers) and grants nothing', async () => {
  const { db, calls, router } = install({
    users: { userA: { email: 'a@example.com', tier: 'starter', ...lease() } },
  });
  await withServer(router, async (base) => {
    const r = await post(base, '/webhook', completed('evt_1'));
    assert.equal(r.status, 500);
  });
  assert.equal(
    db.store.has('processedWebhooks/evt_1'),
    false,
    'left unprocessed so Stripe retries'
  );
  assert.equal(db.store.get('users/userA').data.tier, 'starter');
  assert.equal(calls.cancel.length, 0);
});

test('delayed checkout.session.completed after deletion cancels the new subscription (no refund/proration) and grants nothing', async () => {
  const { db, calls, subs, router } = install({
    seed: { 'deletedAccounts/userA': { completed: true, stripeCustomerIds: ['cus_A'] } },
  });
  await withServer(router, async (base) => {
    assert.equal((await post(base, '/webhook', completed('evt_2'))).status, 200);
    // Redelivery is idempotent.
    assert.equal((await post(base, '/webhook', completed('evt_2'))).status, 200);
  });
  assert.deepEqual(
    calls.cancel.map((c) => [c.id, c.params]),
    [['sub_new', { invoice_now: false, prorate: false }]]
  );
  assert.equal(subs.sub_new.status, 'canceled');
  assert.equal(db.store.has('users/userA'), false, 'no user doc recreated');
});

test('delayed subscription.updated (active) for a deleted account cancels instead of re-granting', async () => {
  const { db, calls, router } = install({ seed: { 'deletedAccounts/userA': { completed: true } } });
  await withServer(router, async (base) => {
    const r = await post(base, '/webhook', {
      id: 'evt_3',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_new' } },
    });
    assert.equal(r.status, 200);
  });
  assert.deepEqual(
    calls.cancel.map((c) => c.id),
    ['sub_new']
  );
  assert.equal(db.store.has('users/userA'), false);
});

test('once the lease is released (deletion failed), the redelivered event grants normally', async () => {
  const { db, router } = install({
    users: { userA: { email: 'a@example.com', tier: 'starter', accountDeletionLock: null } },
  });
  await withServer(router, async (base) => {
    assert.equal((await post(base, '/webhook', completed('evt_4'))).status, 200);
  });
  assert.equal(db.store.get('users/userA').data.tier, 'professional');
});
