const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Phase 6 follow-up: reduced deliverability lease, stable event id + binding tag
// in push data, and recovery of notifications saved without their outbox job.
// Expo is a local stub; nothing leaves the process.
const firebaseConfigPath = require.resolve('../config/firebase');
const paths = [
  firebaseConfigPath,
  require.resolve('../utils/notificationService'),
  require.resolve('../utils/pushDeviceStore'),
  require.resolve('../services/pushService'),
];

function load() {
  paths.forEach((p) => delete require.cache[p]);
  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath,
    filename: firebaseConfigPath,
    loaded: true,
    exports: { FieldValue: { increment: (n) => n }, getFirestore: () => null, getAuth: () => ({}) },
  };
  return {
    push: require('../services/pushService'),
    notifications: require('../utils/notificationService'),
    store: require('../utils/pushDeviceStore'),
  };
}

const HOUR = 60 * 60 * 1000;
const tok = 'ExponentPushToken[device0001]';
const BIND = '00000001-0000-4000-8000-000000000000';
const docs = (db, prefix) =>
  [...db.store.entries()].filter(([k]) => k.startsWith(`${prefix}/`)).map(([k, v]) => ({ id: k.split('/')[1], ...v.data }));

function stubFetch() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    const json = url.endsWith('/send')
      ? { data: body.map((m) => ({ status: 'ok', id: `t-${m.to}` })) }
      : { data: Object.fromEntries(body.ids.map((id) => [id, { status: 'ok' }])) };
    return { ok: true, status: 200, json: async () => json };
  };
  return { fetchImpl, calls };
}

async function world(store, now) {
  const db = new FakeFirestore();
  db.store.set('users/userA', { version: 1, data: { email: 'a@x' } });
  await store.registerDevice(
    db,
    'userA',
    { token: tok, platform: 'ios', bindingId: BIND, session: { authTime: 1000, issuedAt: 1000, kind: 'firebase' } },
    { now }
  );
  return db;
}

const worker = (push, db, clock, fetchImpl) =>
  push.createPushWorker({
    db,
    fetchImpl,
    sleep: async () => {},
    getAuthUser: async () => ({ disabled: false }),
    clock: () => clock.now,
  });

test.beforeEach(() => {
  process.env.PUSH_NOTIFICATIONS_ENABLED = 'true';
  delete process.env.PUSH_BINDING_LEASE_HOURS;
});
test.after(() => {
  delete process.env.PUSH_NOTIFICATIONS_ENABLED;
  delete process.env.PUSH_BINDING_LEASE_HOURS;
});

test('lease: 7-day default, configurable, clamped to 24h..14d', async () => {
  const { store } = load();
  assert.equal(store.leaseMs(), 168 * HOUR);
  process.env.PUSH_BINDING_LEASE_HOURS = '72';
  assert.equal(store.leaseMs(), 72 * HOUR);
  process.env.PUSH_BINDING_LEASE_HOURS = '1';
  assert.equal(store.leaseMs(), 24 * HOUR);
  process.env.PUSH_BINDING_LEASE_HOURS = '9999';
  assert.equal(store.leaseMs(), 336 * HOUR);
  process.env.PUSH_BINDING_LEASE_HOURS = 'abc';
  assert.equal(store.leaseMs(), 168 * HOUR);

  delete process.env.PUSH_BINDING_LEASE_HOURS;
  const now = Date.now();
  const db = await world(store, now);
  const [device] = docs(db, 'pushDevices');
  assert.equal(device.leaseExpiresAt, now + 168 * HOUR);
  // Beyond the lease the binding is never delivered to.
  assert.equal(
    store.bindingIneligibilityReason(device, { uid: 'userA', userData: {}, authUser: { disabled: false }, now: now + 168 * HOUR + 1 }),
    'lease-expired'
  );
});

test('push data carries a stable eventId and a binding tag, never the bindingId or its hash', async () => {
  const { push, store, notifications } = load();
  const clock = { now: Date.now() };
  const db = await world(store, clock.now);
  await notifications.notifyUser(db, 'userA', 'review_requested', { reportId: 'rep1' });
  const [n] = docs(db, 'notifications');
  clock.now = Date.now() + 1000; // job stamped with real time
  const { fetchImpl, calls } = stubFetch();
  await worker(push, db, clock, fetchImpl).tick();
  const msg = calls.find((c) => c.url.endsWith('/send')).body[0];
  assert.equal(msg.data.eventId, n.id);
  const [device] = docs(db, 'pushDevices');
  assert.equal(msg.data.bindingTag, store.bindingTag(device.bindingIdHash));
  assert.match(msg.data.bindingTag, /^[0-9a-f]{16}$/);
  const text = JSON.stringify(msg);
  assert.ok(!text.includes(BIND) && !text.includes(device.bindingIdHash));
});

test('outbox gap: failed combined write -> notification saved once with pushPending; reconcile creates the job once', async () => {
  const { push, store, notifications } = load();
  const clock = { now: Date.now() };
  const db = await world(store, clock.now);
  const realTx = db.runTransaction.bind(db);
  db.runTransaction = async () => {
    throw new Error('contention');
  };
  const created = await notifications.notifyUser(db, 'userA', 'review_requested', { reportId: 'rep1' });
  db.runTransaction = realTx;
  assert.equal(created, true, 'in-app notification still saved when push infra fails');
  const [n] = docs(db, 'notifications');
  assert.equal(n.pushPending, true);
  assert.equal(docs(db, 'pushOutbox').length, 0);

  const { fetchImpl, calls } = stubFetch();
  const w = worker(push, db, clock, fetchImpl);
  await w.tick();
  assert.equal(docs(db, 'pushOutbox').length, 1);
  assert.equal(docs(db, 'notifications')[0].pushPending, false);
  assert.equal(calls.filter((c) => c.url.endsWith('/send')).length, 1);
  // Re-running reconciliation never creates a second job or a second send.
  db.store.get(`notifications/${n.id}`).data.pushPending = true;
  assert.equal(await w.reconcileMissingOutbox(), 0);
  assert.equal(docs(db, 'pushOutbox').length, 1);
});

test('outbox gap: a stale pending notification is cleared, never sent late', async () => {
  const { push, store } = load();
  const clock = { now: Date.now() };
  const db = await world(store, clock.now);
  db.store.set('notifications/old1', {
    version: 1,
    data: { uid: 'userA', type: 'review_requested', meta: { reportId: 'rep1' }, createdAt: new Date(clock.now - 2 * HOUR).toISOString(), pushPending: true },
  });
  const { fetchImpl, calls } = stubFetch();
  await worker(push, db, clock, fetchImpl).tick();
  assert.equal(docs(db, 'pushOutbox').length, 0);
  assert.equal(db.store.get('notifications/old1').data.pushPending, false);
  assert.equal(calls.length, 0);
});

test('outbox gap: dedupe-keyed notifications stay single when the combined write is ambiguous', async () => {
  const { store, notifications } = load();
  const db = await world(store, Date.now());
  const realTx = db.runTransaction.bind(db);
  // Commit succeeds, but the client sees an error (ambiguous commit).
  db.runTransaction = async (fn) => {
    await realTx(fn);
    throw new Error('deadline exceeded');
  };
  const created = await notifications.notifyUser(db, 'userA', 'review_requested', { reportId: 'rep1' }, { dedupeKey: 'k1' });
  db.runTransaction = realTx;
  assert.equal(created, false);
  assert.equal(docs(db, 'notifications').length, 1);
  assert.equal(docs(db, 'pushOutbox').length, 1);
  // Same for auto-id notifications: the fallback reuses the transaction's id.
  db.runTransaction = async (fn) => {
    await realTx(fn);
    throw new Error('deadline exceeded');
  };
  await notifications.notifyUser(db, 'userA', 'review_requested', { reportId: 'rep2' });
  db.runTransaction = realTx;
  assert.equal(docs(db, 'notifications').length, 2);
});

test('push disabled: exactly the original write, no pushPending flag, no worker', async () => {
  const { push, store, notifications } = load();
  delete process.env.PUSH_NOTIFICATIONS_ENABLED;
  const db = await world(store, Date.now());
  await notifications.notifyUser(db, 'userA', 'review_requested', { reportId: 'rep1' });
  const [n] = docs(db, 'notifications');
  assert.equal('pushPending' in n, false);
  assert.equal(docs(db, 'pushOutbox').length, 0);
  assert.deepEqual(await push.createPushWorker({ db }).tick(), { claimed: 0, committed: 0 });
});
