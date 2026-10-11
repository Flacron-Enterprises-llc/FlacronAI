const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Mobile Phase 8 -- self-service account deletion (DELETE /users/account) and the
// guards that stop a deleted account from being recreated or its purchases
// re-linked. Real router + auth middleware; fakes only ../config/firebase (Firestore
// + Auth) and ../config/storage. No real account, store or Stripe is touched.
delete process.env.MFA_ENFORCEMENT_ENABLED;
delete process.env.FIREBASE_API_KEY;

const firebaseConfigPath = require.resolve('../config/firebase');
const storagePath = require.resolve('../config/storage');
const resetPaths = [
  firebaseConfigPath,
  storagePath,
  require.resolve('../middleware/auth'),
  require.resolve('../routes/users'),
  require.resolve('../services/accountDeletionCleanup'),
  require.resolve('../utils/notificationService'),
  require.resolve('../utils/storeSubscriptions'),
  require.resolve('../services/stripeAccountCancellation'),
];

const nowS = () => Math.floor(Date.now() / 1000);
const future = new Date(Date.now() + 30 * 86400000).toISOString();

// Mocked Stripe (no network). It deliberately has NO refunds / invoices / credit
// notes API: any such call would throw and fail the test.
function fakeStripe({ customers = {}, subs = {}, sessions = {}, schedules = {}, cancelImpl } = {}) {
  const calls = { cancel: [], expire: [], scheduleCancel: [] };
  const missing = () => Object.assign(new Error('No such resource'), { code: 'resource_missing', statusCode: 404 });
  const page = (data) => ({ data, has_more: false });
  const byCustomer = (map, customer, extra = () => true) =>
    page(Object.entries(map).filter(([, v]) => v.customer === customer && extra(v)).map(([id, v]) => ({ id, ...v })));
  const get = (map, id) => {
    if (!map[id]) throw missing();
    return { id, ...map[id] };
  };
  const stripe = {
    customers: { retrieve: async (id) => get(customers, id) },
    subscriptions: {
      list: async ({ customer }) => byCustomer(subs, customer),
      retrieve: async (id) => get(subs, id),
      cancel: async (id, params, opts) => {
        calls.cancel.push({ id, params, opts });
        if (cancelImpl && (await cancelImpl(id, subs)) === 'noop') return get(subs, id);
        if (!subs[id]) throw missing();
        if (subs[id].status === 'canceled') throw Object.assign(new Error('already canceled'), { type: 'StripeInvalidRequestError', statusCode: 400 });
        subs[id].status = 'canceled';
        return get(subs, id);
      },
    },
    checkout: {
      sessions: {
        list: async ({ customer, status }) => byCustomer(sessions, customer, (v) => v.status === status),
        expire: async (id) => {
          calls.expire.push(id);
          sessions[id].status = 'expired';
          return get(sessions, id);
        },
        retrieve: async (id) => get(sessions, id),
      },
    },
    subscriptionSchedules: {
      list: async ({ customer }) => byCustomer(schedules, customer),
      cancel: async (id) => {
        calls.scheduleCancel.push(id);
        schedules[id].status = 'canceled';
        return get(schedules, id);
      },
      retrieve: async (id) => get(schedules, id),
    },
  };
  return { stripe, calls, subs };
}

function install({ users = {}, seed = {}, authTime = nowS(), deleteUserImpl, deletePrefixImpl, stripe } = {}) {
  resetPaths.forEach((p) => delete require.cache[p]);
  const db = new FakeFirestore();
  for (const [uid, data] of Object.entries(users)) db.store.set(`users/${uid}`, { version: 1, data });
  for (const [path, data] of Object.entries(seed)) db.store.set(path, { version: 1, data });
  const calls = { deleteUser: [], deletePrefix: [] };
  const identities = {
    'tok-a': { uid: 'userA', email: 'a@example.com', auth_time: authTime, iat: nowS() },
    'tok-b': { uid: 'userB', email: 'b@example.com', auth_time: nowS(), iat: nowS() },
  };
  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath,
    filename: firebaseConfigPath,
    loaded: true,
    exports: {
      getAuth: () => ({
        verifyIdToken: async (t) => {
          if (!identities[t]) throw new Error('invalid');
          return identities[t];
        },
        deleteUser: async (uid) => {
          calls.deleteUser.push(uid);
          if (deleteUserImpl) return deleteUserImpl(uid);
          return undefined;
        },
        updateUser: async () => {},
      }),
      getFirestore: () => db,
      FieldValue: { increment: (n) => n, delete: () => undefined, serverTimestamp: () => new Date().toISOString() },
      Timestamp: {},
      admin: {},
      initFirebase: () => {},
      getBucket: () => ({}),
    },
  };
  require.cache[storagePath] = {
    id: storagePath,
    filename: storagePath,
    loaded: true,
    exports: new Proxy(
      {
        deletePrefix: async (prefix, opts) => {
          calls.deletePrefix.push(prefix);
          if (deletePrefixImpl) return deletePrefixImpl(prefix, opts);
        },
      },
      { get: (t, k) => (k in t ? t[k] : () => undefined) }
    ),
  };
  if (stripe) require('../services/stripeAccountCancellation')._setStripeForTests(stripe);
  return { db, calls, router: require('../routes/users') };
}

async function withServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use('/users', router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}/users`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}
const call = async (base, path, { auth, body, method = 'DELETE' } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  return { status: res.status, body: await res.json() };
};
const del = (base, auth, body) => call(base, '/account', { auth, body });
const has = (db, path) => db.store.has(path);

const seedA = {
  'reports/r1': { userId: 'userA' },
  'reports/r1/versions/v1': { x: 1 },
  'reports/rB': { userId: 'userB' },
  'notifications/n1': { uid: 'userA' },
  'notifications/nB': { uid: 'userB' },
  'pushDevices/d1': { uid: 'userA' },
  'pushOutbox/o1': { uid: 'userA' },
  'reportDrafts/dr1': { userId: 'userA' },
  'webhookEndpoints/w1': { userId: 'userA' },
  'apiKeys/k1': { userId: 'userA' },
  'auditLogs/a1': { actorUid: 'userA' },
  'storeSubscriptions/s1': { ownerUid: 'userA', accountToken: 'tok', state: 'active' },
};

test('recent sign-in + confirmation deletes the account and its data; other accounts untouched', async () => {
  const { db, calls, router } = install({ users: { userA: { email: 'a@example.com', tier: 'starter' }, userB: { email: 'b@example.com' } }, seed: seedA });
  await withServer(router, async (base) => {
    const r = await del(base, 'tok-a', { confirmation: 'DELETE' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.subscriptionsStillBilling, { stripe: false, store: null });
  });
  for (const p of ['users/userA', 'reports/r1', 'reports/r1/versions/v1', 'notifications/n1', 'pushDevices/d1', 'pushOutbox/o1', 'reportDrafts/dr1', 'webhookEndpoints/w1', 'apiKeys/k1']) {
    assert.equal(has(db, p), false, p);
  }
  for (const p of ['users/userB', 'reports/rB', 'notifications/nB', 'auditLogs/a1']) assert.equal(has(db, p), true, p);
  assert.deepEqual(calls.deleteUser, ['userA']);
  assert.deepEqual(calls.deletePrefix, ['users/userA/']);
  // Purchase record retained, locked to the deleted owner, personal token cleared.
  const s1 = db.store.get('storeSubscriptions/s1').data;
  assert.equal(s1.ownerUid, 'userA');
  assert.equal(s1.ownerDeleted, true);
  assert.equal(s1.accountToken, null);
  assert.equal(db.store.get('deletedAccounts/userA').data.completed, true);
});

test('identity re-check: confirmation required, stale sign-in refused, password path unchanged', async () => {
  const stale = install({ users: { userA: { email: 'a@example.com' } }, authTime: nowS() - 3600 });
  await withServer(stale.router, async (base) => {
    assert.equal((await del(base, 'tok-a', {})).body.code, 'CONFIRMATION_REQUIRED');
    const r = await del(base, 'tok-a', { confirmation: 'DELETE' });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'RECENT_LOGIN_REQUIRED');
    // Web password path: still requires FIREBASE_API_KEY server-side (unchanged).
    assert.equal((await del(base, 'tok-a', { password: 'x' })).body.code, 'CONFIG_ERROR');
    assert.equal((await del(base, null, { confirmation: 'DELETE' })).status, 401);
  });
  assert.equal(has(stale.db, 'users/userA'), true);
  assert.equal(stale.calls.deleteUser.length, 0);
});

test('team owners are blocked before anything is changed', async () => {
  const { db, calls, router } = install({ users: { userA: { email: 'a@example.com' } }, seed: { 'enterpriseTeams/t1': { ownerId: 'userA' }, ...seedA } });
  await withServer(router, async (base) => {
    assert.equal((await del(base, 'tok-a', { confirmation: 'DELETE' })).body.code, 'TEAM_OWNER_BLOCKED');
  });
  assert.equal(has(db, 'users/userA'), true);
  assert.equal(has(db, 'deletedAccounts/userA'), false);
  assert.equal(calls.deleteUser.length, 0);
});

test('Stripe is cancelled on deletion; store subscriptions are reported as still billing (never "cancelled")', async () => {
  const { stripe, calls: sc } = fakeStripe({ customers: { cus_A: { metadata: { uid: 'userA' } } }, subs: { sub_1: { customer: 'cus_A', status: 'active' } } });
  const { router } = install({
    users: {
      userA: {
        email: 'a@example.com',
        stripeCustomerId: 'cus_A',
        stripeSubscriptionId: 'sub_1',
        subscriptionStatus: 'active',
        storeEntitlement: { platform: 'ios', tier: 'agency', state: 'active', expiresAt: future, autoRenew: true },
      },
    },
    stripe,
  });
  await withServer(router, async (base) => {
    const r = await del(base, 'tok-a', { confirmation: 'DELETE' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.subscriptionsStillBilling, { stripe: false, store: 'ios' });
    assert.equal(r.body.stripeSubscriptionsCancelled, 1);
  });
  assert.deepEqual(sc.cancel.map((c) => c.id), ['sub_1']);
});

test('partial failure is reported as incomplete; a retry finishes safely', async () => {
  let fail = true;
  const { db, calls, router } = install({
    users: { userA: { email: 'a@example.com' } },
    seed: seedA,
    deleteUserImpl: async () => {
      if (fail) throw Object.assign(new Error('auth backend down'), { code: 'auth/internal-error' });
    },
  });
  await withServer(router, async (base) => {
    const first = await del(base, 'tok-a', { confirmation: 'DELETE' });
    assert.equal(first.status, 500);
    assert.equal(first.body.code, 'DELETE_ACCOUNT_INCOMPLETE');
    assert.doesNotMatch(JSON.stringify(first.body), /auth backend down/);
    assert.equal(db.store.get('deletedAccounts/userA').data.completed, false);
    // Profile already gone: the deleted account is refused everywhere except deletion retry.
    const blocked = await call(base, '/profile', { auth: 'tok-a', method: 'GET' });
    assert.equal(blocked.status, 401);
    assert.equal(blocked.body.code, 'ACCOUNT_DELETED');
    fail = false;
    // The user can no longer retry themselves (no profile => ACCOUNT_DELETED)...
    assert.equal((await del(base, 'tok-a', { confirmation: 'DELETE' })).body.code, 'ACCOUNT_DELETED');
  });
  assert.equal(calls.deleteUser.length, 1);
  // ...so the server-side sweeper finishes it once the attempt is stale.
  const { sweepIncompleteDeletions, STALE_MS } = require('../services/accountDeletionCleanup');
  const early = await sweepIncompleteDeletions(db);
  assert.deepEqual(early.completed, [], 'a just-failed attempt is not swept (user retry window)');
  const late = await sweepIncompleteDeletions(db, { now: Date.now() + STALE_MS + 1000 });
  assert.deepEqual(late.completed, ['userA']);
  assert.equal(calls.deleteUser.length, 2);
  const tomb = db.store.get('deletedAccounts/userA').data;
  assert.equal(tomb.completed, true);
  assert.equal(tomb.lastSweepError, null);
  // Idempotent: nothing left to sweep.
  assert.deepEqual((await sweepIncompleteDeletions(db, { now: Date.now() + 2 * STALE_MS })).completed, []);
});

test('storage wipe failure keeps the deletion incomplete (never marked done with files left)', async () => {
  let storageDown = true;
  const { db, calls, router } = install({
    users: { userA: { email: 'a@example.com' } },
    seed: seedA,
    deletePrefixImpl: async (prefix, opts) => {
      assert.equal(opts && opts.strict, true);
      if (storageDown) throw Object.assign(new Error('gcs 503'), { code: 503 });
    },
  });
  await withServer(router, async (base) => {
    const first = await del(base, 'tok-a', { confirmation: 'DELETE' });
    assert.equal(first.body.code, 'DELETE_ACCOUNT_INCOMPLETE');
    assert.equal(db.store.get('deletedAccounts/userA').data.completed, false);
    // Profile still present => the user can retry directly.
    assert.equal(has(db, 'users/userA'), true);
    storageDown = false;
    assert.equal((await del(base, 'tok-a', { confirmation: 'DELETE' })).status, 200);
  });
  assert.equal(calls.deletePrefix.length, 2);
  assert.equal(db.store.get('deletedAccounts/userA').data.completed, true);
});

test('sweeper: records only an error code on failure, caps attempts, skips completed tombstones', async () => {
  let down = true;
  const { db } = install({
    seed: {
      'deletedAccounts/userA': { completed: false, lastAttemptAt: '2026-01-01T00:00:00.000Z' },
      'deletedAccounts/userC': { completed: true },
      'reports/r1': { userId: 'userA' },
    },
    deleteUserImpl: async () => {
      if (down) throw Object.assign(new Error('secret detail a@example.com'), { code: 'auth/internal-error' });
    },
  });
  const { sweepIncompleteDeletions, STALE_MS, MAX_SWEEP_ATTEMPTS } = require('../services/accountDeletionCleanup');
  let now = Date.now();
  const r = await sweepIncompleteDeletions(db, { now });
  assert.deepEqual(r.failed, ['userA']);
  let tomb = db.store.get('deletedAccounts/userA').data;
  assert.equal(tomb.lastSweepError, 'auth/internal-error');
  assert.doesNotMatch(JSON.stringify(tomb), /secret detail|example\.com/);
  assert.equal(has(db, 'reports/r1'), false, 'progress before the failing step is kept');
  // Attempt cap: after MAX attempts the sweeper stops and leaves it for a human.
  for (let i = 1; i < MAX_SWEEP_ATTEMPTS; i++) {
    now += STALE_MS + 1000;
    await sweepIncompleteDeletions(db, { now });
  }
  assert.equal(db.store.get('deletedAccounts/userA').data.sweepAttempts, MAX_SWEEP_ATTEMPTS);
  down = false;
  now += STALE_MS + 1000;
  assert.deepEqual((await sweepIncompleteDeletions(db, { now })).completed, []);
  assert.equal(db.store.get('deletedAccounts/userA').data.completed, false);
  assert.deepEqual(db.store.get('deletedAccounts/userC').data, { completed: true });
});

test('auth user already gone on a retry is treated as done', async () => {
  const { db, router } = install({
    users: { userA: { email: 'a@example.com' } },
    deleteUserImpl: async () => {
      throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' });
    },
  });
  await withServer(router, async (base) => {
    assert.equal((await del(base, 'tok-a', { confirmation: 'DELETE' })).status, 200);
  });
  assert.equal(db.store.get('deletedAccounts/userA').data.completed, true);
});

test('a deleted account is never recreated by a leftover token, profile write or delayed notification', async () => {
  const { db, router } = install({ users: { userB: { email: 'b@example.com' } }, seed: { 'deletedAccounts/userA': { completed: true } } });
  await withServer(router, async (base) => {
    assert.equal((await call(base, '/profile', { auth: 'tok-a', method: 'GET' })).body.code, 'ACCOUNT_DELETED');
    assert.equal((await call(base, '/profile', { auth: 'tok-a', method: 'PUT', body: { displayName: 'x' } })).status, 401);
    // A brand-new account (no tombstone) is still auto-created as before.
    const fresh = await call(base, '/profile', { auth: 'tok-b', method: 'GET' });
    assert.equal(fresh.status, 200);
  });
  assert.equal(has(db, 'users/userA'), false);
  const { notifyUser } = require('../utils/notificationService');
  await notifyUser(db, 'userA', 'report_completed', { reportId: 'r1' });
  assert.equal(has(db, 'users/userA'), false, 'notification counter must not recreate the user doc');
});

test('profile update writes only permitted fields and enforces lengths', async () => {
  const { db, router } = install({ users: { userA: { email: 'a@example.com', tier: 'starter' } } });
  await withServer(router, async (base) => {
    const ok = await call(base, '/profile', {
      auth: 'tok-a',
      method: 'PUT',
      body: { displayName: 'Alice', phone: '555', company: 'Acme', tier: 'enterprise', stripeTier: 'agency', adminTier: 'agency', teamOwnerId: 'x' },
    });
    assert.equal(ok.status, 200);
    const tooLong = await call(base, '/profile', { auth: 'tok-a', method: 'PUT', body: { phone: '1'.repeat(41) } });
    assert.equal(tooLong.status, 400);
  });
  const u = db.store.get('users/userA').data;
  assert.equal(u.displayName, 'Alice');
  for (const k of ['stripeTier', 'adminTier', 'teamOwnerId']) assert.equal(k in u, false, k);
  assert.notEqual(u.tier, 'enterprise');
});

// ---- Account deletion cancels Stripe billing (decision §10.26, 2026-10-07) ----

const paidUser = (extra = {}) => ({ email: 'a@example.com', stripeCustomerId: 'cus_A', stripeSubscriptionId: 'sub_act', subscriptionStatus: 'active', ...extra });

test('stripe: every billable subscription, open checkout and pending schedule of the account is ended; nothing else', async () => {
  const f = fakeStripe({
    customers: { cus_A: { metadata: { uid: 'userA' } }, cus_B: { metadata: { uid: 'userB' } } },
    subs: {
      sub_act: { customer: 'cus_A', status: 'active' },
      sub_trial: { customer: 'cus_A', status: 'trialing' },
      sub_due: { customer: 'cus_A', status: 'past_due' },
      sub_unpaid: { customer: 'cus_A', status: 'unpaid' },
      sub_old: { customer: 'cus_A', status: 'canceled' },
      sub_exp: { customer: 'cus_A', status: 'incomplete_expired' },
      sub_other: { customer: 'cus_B', status: 'active' },
    },
    sessions: { cs_open: { customer: 'cus_A', status: 'open' }, cs_b: { customer: 'cus_B', status: 'open' } },
    schedules: { sch_future: { customer: 'cus_A', status: 'not_started' }, sch_b: { customer: 'cus_B', status: 'not_started' } },
  });
  const { db, router } = install({ users: { userA: paidUser(), userB: { email: 'b@example.com', stripeCustomerId: 'cus_B' } }, seed: seedA, stripe: f.stripe });
  await withServer(router, async (base) => {
    const r = await del(base, 'tok-a', { confirmation: 'DELETE' });
    assert.equal(r.status, 200);
    assert.equal(r.body.stripeSubscriptionsCancelled, 4);
    assert.equal(r.body.subscriptionsStillBilling.stripe, false);
  });
  assert.deepEqual(f.calls.cancel.map((c) => c.id).sort(), ['sub_act', 'sub_due', 'sub_trial', 'sub_unpaid']);
  for (const c of f.calls.cancel) {
    // No final invoice, no proration credit; deterministic idempotency key for retries.
    assert.deepEqual(c.params, { invoice_now: false, prorate: false });
    assert.equal(c.opts.idempotencyKey, `account-delete-userA-${c.id}`);
  }
  assert.deepEqual(f.calls.expire, ['cs_open']);
  assert.deepEqual(f.calls.scheduleCancel, ['sch_future']);
  assert.equal(f.subs.sub_other.status, 'active', 'another customer subscription is untouched');
  const tomb = db.store.get('deletedAccounts/userA').data;
  assert.deepEqual(tomb.stripeCustomerIds, ['cus_A']);
  assert.equal(tomb.completed, true);
  assert.equal(has(db, 'users/userB'), true);
});

test('stripe failure: nothing is deleted, the account stays usable, and a retry succeeds', async () => {
  let failing = true;
  const f = fakeStripe({
    customers: { cus_A: { metadata: { uid: 'userA' } } },
    subs: { sub_act: { customer: 'cus_A', status: 'active' } },
    cancelImpl: async () => {
      if (failing) throw Object.assign(new Error('Your card was declined'), { type: 'StripeInvalidRequestError', statusCode: 400 });
    },
  });
  const { db, calls, router } = install({ users: { userA: paidUser() }, seed: seedA, stripe: f.stripe });
  await withServer(router, async (base) => {
    const r = await del(base, 'tok-a', { confirmation: 'DELETE' });
    assert.equal(r.status, 502);
    assert.equal(r.body.code, 'STRIPE_CANCELLATION_FAILED');
    assert.equal(r.body.retryable, true);
    assert.equal(r.body.outcomeUncertain, false);
    assert.match(r.body.error, /NOT deleted/);
    assert.doesNotMatch(JSON.stringify(r.body), /declined/);
    for (const p of ['users/userA', 'reports/r1', 'notifications/n1', 'apiKeys/k1']) assert.equal(has(db, p), true, p);
    assert.equal(has(db, 'deletedAccounts/userA'), false);
    assert.equal(db.store.get('storeSubscriptions/s1').data.ownerDeleted, undefined);
    assert.equal(db.store.get('users/userA').data.accountDeletionLock, null, 'lease released');
    assert.equal(calls.deleteUser.length, 0);
    assert.equal(calls.deletePrefix.length, 0);
    // Still a normal account.
    assert.equal((await call(base, '/profile', { auth: 'tok-a', method: 'GET' })).status, 200);

    failing = false;
    assert.equal((await del(base, 'tok-a', { confirmation: 'DELETE' })).status, 200);
  });
  assert.equal(f.subs.sub_act.status, 'canceled');
  assert.equal(has(db, 'users/userA'), false);
});

test('stripe timeout: outcome reported as uncertain, nothing deleted; retry confirms the late cancellation idempotently', async () => {
  process.env.STRIPE_ACCOUNT_DELETE_TIMEOUT_MS = '40';
  try {
    const f = fakeStripe({
      customers: { cus_A: { metadata: { uid: 'userA' } } },
      subs: { sub_act: { customer: 'cus_A', status: 'active' } },
      // Stripe applies the cancel, but only after our timeout fired.
      cancelImpl: (id, subs) =>
        new Promise((resolve) =>
          setTimeout(() => {
            subs[id].status = 'canceled';
            resolve('noop');
          }, 120)
        ),
    });
    const { db, router } = install({ users: { userA: paidUser() }, seed: seedA, stripe: f.stripe });
    await withServer(router, async (base) => {
      const r = await del(base, 'tok-a', { confirmation: 'DELETE' });
      assert.equal(r.status, 502);
      assert.equal(r.body.outcomeUncertain, true);
      assert.equal(has(db, 'reports/r1'), true);
      assert.equal(has(db, 'deletedAccounts/userA'), false);
      await new Promise((res) => setTimeout(res, 150));
      const retry = await del(base, 'tok-a', { confirmation: 'DELETE' });
      assert.equal(retry.status, 200);
      assert.equal(retry.body.stripeSubscriptionsCancelled, 0, 'already cancelled -> counted as ended, not re-cancelled');
    });
    assert.equal(f.calls.cancel.length, 1);
  } finally {
    delete process.env.STRIPE_ACCOUNT_DELETE_TIMEOUT_MS;
  }
});

test('stripe: a subscription still billable after cancel is not treated as confirmed', async () => {
  const f = fakeStripe({
    customers: { cus_A: { metadata: { uid: 'userA' } } },
    subs: { sub_act: { customer: 'cus_A', status: 'active' } },
    cancelImpl: async () => 'noop', // accepted, but Stripe still reports it active
  });
  const { db, router } = install({ users: { userA: paidUser() }, seed: seedA, stripe: f.stripe });
  await withServer(router, async (base) => {
    const r = await del(base, 'tok-a', { confirmation: 'DELETE' });
    assert.equal(r.status, 502);
    assert.equal(r.body.code, 'STRIPE_CANCELLATION_FAILED');
  });
  assert.equal(has(db, 'users/userA'), true);
  assert.equal(has(db, 'reports/r1'), true);
});

test('stripe ownership: a customer owned by another uid is refused; a foreign stored subscription is never cancelled', async () => {
  const wrong = fakeStripe({ customers: { cus_A: { metadata: { uid: 'userB' } } }, subs: { sub_act: { customer: 'cus_A', status: 'active' } } });
  const a = install({ users: { userA: paidUser() }, seed: seedA, stripe: wrong.stripe });
  await withServer(a.router, async (base) => {
    assert.equal((await del(base, 'tok-a', { confirmation: 'DELETE' })).status, 502);
  });
  assert.equal(wrong.calls.cancel.length, 0);
  assert.equal(has(a.db, 'users/userA'), true);

  // Stored subscription id that Stripe says belongs to someone else (no customer on our record).
  const foreign = fakeStripe({ subs: { sub_x: { customer: 'cus_Z', status: 'active', metadata: { uid: 'userZ' } } } });
  const b = install({ users: { userA: { email: 'a@example.com', stripeSubscriptionId: 'sub_x' } }, stripe: foreign.stripe });
  await withServer(b.router, async (base) => {
    assert.equal((await del(base, 'tok-a', { confirmation: 'DELETE' })).status, 200);
  });
  assert.equal(foreign.calls.cancel.length, 0);
  assert.equal(foreign.subs.sub_x.status, 'active');
});

test('stripe: concurrent deletion is refused while a lease is held; an expired lease is taken over', async () => {
  const f = fakeStripe({ customers: { cus_A: { metadata: { uid: 'userA' } } }, subs: { sub_act: { customer: 'cus_A', status: 'active' } } });
  const held = install({ users: { userA: paidUser({ accountDeletionLock: { startedAt: Date.now(), until: Date.now() + 60000 } }) }, seed: seedA, stripe: f.stripe });
  await withServer(held.router, async (base) => {
    const r = await del(base, 'tok-a', { confirmation: 'DELETE' });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'DELETE_IN_PROGRESS');
  });
  assert.equal(f.calls.cancel.length, 0);
  assert.ok(held.db.store.get('users/userA').data.accountDeletionLock.until > Date.now(), 'the other attempt lease is not cleared');

  const stale = install({ users: { userA: paidUser({ accountDeletionLock: { startedAt: 1, until: 2 } }) }, seed: seedA, stripe: f.stripe });
  await withServer(stale.router, async (base) => {
    assert.equal((await del(base, 'tok-a', { confirmation: 'DELETE' })).status, 200);
  });
});

test('stripe service: retry from tombstone ids only (user doc already gone) re-verifies and is idempotent', async () => {
  const { cancelStripeBillingForDeletion } = require('../services/stripeAccountCancellation');
  const f = fakeStripe({ customers: { cus_A: { metadata: { uid: 'userA' } } }, subs: { s1: { customer: 'cus_A', status: 'canceled' }, s2: { customer: 'cus_A', status: 'trialing' } } });
  const first = await cancelStripeBillingForDeletion({ uid: 'userA', customerIds: ['cus_A'], subscriptionIds: ['s1'] }, { stripe: f.stripe });
  assert.deepEqual(first.cancelled, ['s2']);
  const again = await cancelStripeBillingForDeletion({ uid: 'userA', customerIds: ['cus_A'], subscriptionIds: ['s1'] }, { stripe: f.stripe });
  assert.deepEqual(again.cancelled, []);
  assert.deepEqual(again.alreadyEnded.sort(), ['s1', 's2']);
  // No Stripe records at all -> no Stripe call (works without STRIPE_SECRET_KEY).
  assert.deepEqual((await cancelStripeBillingForDeletion({ uid: 'userA' })).cancelled, []);
});
