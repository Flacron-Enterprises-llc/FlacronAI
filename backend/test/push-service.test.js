const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Mobile Phase 6 -- durable push outbox (services/pushService.js) and its
// handoff from notifyUser(). Expo is always a local stub; Firebase Auth is a
// stub `getAuthUser`; time is a controllable clock. Nothing leaves the process.
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
    exports: {
      FieldValue: { increment: (n) => n },
      getFirestore: () => null,
      getAuth: () => ({
        getUser: async () => {
          throw new Error('not stubbed');
        },
      }),
    },
  };
  return {
    push: require('../services/pushService'),
    notifications: require('../utils/notificationService'),
    store: require('../utils/pushDeviceStore'),
  };
}

const T0 = 1_800_000_000_000;
const tok = (n) => `ExponentPushToken[device${String(n).padStart(4, '0')}]`;
const bind = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const noSleep = async () => {};
const docs = (db, prefix) =>
  [...db.store.entries()]
    .filter(([k]) => k.startsWith(`${prefix}/`))
    .map(([k, v]) => ({ id: k.split('/')[1], ...v.data }));
const job = (db, id) => db.store.get(`pushOutbox/${id}`)?.data;

function stubFetch(responder) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, headers: init.headers });
    const r = await responder(url, body, calls.length - 1);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
  };
  return { fetchImpl, calls };
}
const okTickets = (url, body) =>
  url.endsWith('/send')
    ? { status: 200, json: { data: body.map((m) => ({ status: 'ok', id: `t-${m.to}` })) } }
    : {
        status: 200,
        json: { data: Object.fromEntries(body.ids.map((id) => [id, { status: 'ok' }])) },
      };

// A world with userA (two devices) and userB (one device), all eligible.
async function world({ store }, { clock }) {
  const db = new FakeFirestore();
  db.store.set('users/userA', {
    version: 1,
    data: { email: 'a@x', notifications: { reportCompleted: true } },
  });
  db.store.set('users/userB', { version: 1, data: { email: 'b@x' } });
  const reg = (uid, n, platform = 'ios', authTime = 1000) =>
    store.registerDevice(
      db,
      uid,
      {
        token: tok(n),
        platform,
        bindingId: bind(n),
        session: { authTime, issuedAt: authTime, kind: 'firebase' },
      },
      { now: clock.now }
    );
  await reg('userA', 1);
  await reg('userA', 2, 'android');
  await reg('userB', 3);
  return db;
}

const authUsers = {
  userA: { disabled: false, tokensValidAfterTime: new Date(500 * 1000).toUTCString() },
  userB: { disabled: false },
};
const getAuthUser = async (uid) => {
  if (!authUsers[uid]) throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
  return authUsers[uid];
};

function makeWorker(push, db, clock, fetchImpl, extra = {}) {
  return push.createPushWorker({
    db,
    fetchImpl,
    sleep: noSleep,
    getAuthUser,
    clock: () => clock.now,
    receiptDelayMs: 15 * 60_000,
    ...extra,
  });
}

const enqueue = (db, push, id, uid, type, data, createdAt) =>
  db.store.set(`pushOutbox/${id}`, {
    version: 1,
    data: push.buildOutboxJob(id, uid, type, data, createdAt),
  });

test.beforeEach(() => {
  delete process.env.PUSH_NOTIFICATIONS_ENABLED;
  delete process.env.EXPO_ACCESS_TOKEN;
});

test('disabled: notifyUser writes the notification only -- no outbox job, no provider request, worker idle', async () => {
  const mods = load();
  const clock = { now: T0 };
  const db = await world(mods, { clock });
  const originalFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => {
    fetched++;
    throw new Error('must not be called');
  };
  try {
    assert.equal(
      await mods.notifications.notifyUser(db, 'userA', 'report_completed', {
        reportId: 'r1',
        claimNumber: 'CLM-9',
      }),
      true
    );
    assert.equal(docs(db, 'notifications').length, 1);
    assert.equal(docs(db, 'notifications')[0].meta.claimNumber, 'CLM-9', 'in-app record unchanged');
    assert.equal(docs(db, 'pushOutbox').length, 0);
    // Even a pre-existing job is not processed while disabled.
    enqueue(db, mods.push, 'old', 'userA', 'report_completed', { reportId: 'r1' }, T0);
    const { fetchImpl, calls } = stubFetch(okTickets);
    const w = makeWorker(mods.push, db, clock, fetchImpl);
    assert.deepEqual(await w.tick(), { claimed: 0, committed: 0 });
    assert.equal(w.start(), false);
    assert.equal(calls.length + fetched, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('enabled: notification and outbox job are written together; dedupe hit creates neither again', async () => {
  process.env.PUSH_NOTIFICATIONS_ENABLED = 'true';
  const mods = load();
  const db = await world(mods, { clock: { now: T0 } });
  assert.equal(
    await mods.notifications.notifyUser(db, 'userA', 'subscription_issue', {}, { dedupeKey: 'k1' }),
    true
  );
  assert.equal(
    await mods.notifications.notifyUser(db, 'userA', 'subscription_issue', {}, { dedupeKey: 'k1' }),
    false
  );
  assert.equal(
    await mods.notifications.notifyUser(db, 'userA', 'report_completed', { reportId: 'r1' }),
    true
  );
  const jobs = docs(db, 'pushOutbox');
  const notifs = docs(db, 'notifications');
  assert.equal(notifs.length, 2);
  assert.deepEqual(
    jobs.map((j) => j.id).sort(),
    notifs.map((n) => n.id).sort(),
    'job id = notification id'
  );
  assert.ok(jobs.every((j) => j.state === 'pending' && j.uid === 'userA'));
});

test('enabled: an outbox transaction failure still persists the notification (no push)', async () => {
  process.env.PUSH_NOTIFICATIONS_ENABLED = 'true';
  const mods = load();
  const db = await world(mods, { clock: { now: T0 } });
  db.runTransaction = async () => {
    throw new Error('contention');
  };
  assert.equal(
    await mods.notifications.notifyUser(db, 'userA', 'report_approved', { reportId: 'r1' }),
    true
  );
  assert.equal(docs(db, 'notifications').length, 1);
  assert.equal(docs(db, 'pushOutbox').length, 0);
});

test('worker: sends only to the recipient’s eligible devices with generic copy and the mobile payload', async () => {
  process.env.PUSH_NOTIFICATIONS_ENABLED = 'true';
  const mods = load();
  const clock = { now: T0 };
  const db = await world(mods, { clock });
  enqueue(
    db,
    mods.push,
    'j1',
    'userA',
    'review_requested',
    { reportId: 'rep_1', claimNumber: 'CLM-SECRET' },
    T0
  );
  const { fetchImpl, calls } = stubFetch(okTickets);
  await makeWorker(mods.push, db, clock, fetchImpl).tick();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.map((m) => m.to).sort(), [tok(1), tok(2)]);
  for (const m of calls[0].body) {
    // eventId = the notification/job id; bindingTag = per-device marker (Phase 6 follow-up).
    const { eventId, bindingTag, ...rest } = m.data;
    assert.deepEqual(rest, { type: 'review_requested', reportId: 'rep_1' });
    assert.equal(eventId, 'j1');
    assert.match(bindingTag, /^[0-9a-f]{16}$/);
    assert.doesNotMatch(JSON.stringify(m.data), /CLM|SECRET/);
    assert.equal(m.channelId, 'report-activity');
    assert.doesNotMatch(`${m.title} ${m.body}`, /CLM|SECRET/);
  }
  const j = job(db, 'j1');
  assert.equal(j.state, 'awaiting_receipts');
  assert.equal(j.nextRunAt, T0 + 15 * 60_000, 'receipts checked after the provider delay');
  assert.equal(j.leaseId, null);
  assert.ok(!JSON.stringify(j).includes('ExponentPushToken[device0003]'));
});

test('old backlog: a job older than the max event age expires without sending', async () => {
  process.env.PUSH_NOTIFICATIONS_ENABLED = 'true';
  const mods = load();
  const clock = { now: T0 };
  const db = await world(mods, { clock });
  enqueue(
    db,
    mods.push,
    'old',
    'userA',
    'report_completed',
    { reportId: 'r1' },
    T0 - 2 * 60 * 60_000
  );
  const { fetchImpl, calls } = stubFetch(okTickets);
  await makeWorker(mods.push, db, clock, fetchImpl).tick();
  assert.equal(calls.length, 0);
  assert.equal(job(db, 'old').state, 'expired');
});

test('eligibility re-checked at send: preference off, revoked session, missing account', async () => {
  process.env.PUSH_NOTIFICATIONS_ENABLED = 'true';
  const mods = load();
  const clock = { now: T0 };
  const db = await world(mods, { clock });
  const { fetchImpl, calls } = stubFetch(okTickets);
  const w = makeWorker(mods.push, db, clock, fetchImpl);

  db.store.set('users/userA', { version: 2, data: { notifications: { reportCompleted: false } } });
  enqueue(db, mods.push, 'pref', 'userA', 'report_completed', { reportId: 'r1' }, T0);
  await w.tick();
  assert.equal(job(db, 'pref').lastError, 'preference-off');

  // userB's refresh tokens were revoked (web Sign Out / password change) after its binding's session began.
  authUsers.userB = { disabled: false, tokensValidAfterTime: new Date(5000 * 1000).toUTCString() };
  enqueue(db, mods.push, 'rev', 'userB', 'report_completed', { reportId: 'r1' }, T0);
  await w.tick();
  assert.equal(job(db, 'rev').state, 'done');
  assert.equal(Object.values(job(db, 'rev').deliveries)[0].reason, 'session-revoked');
  authUsers.userB = { disabled: false };

  db.store.set('users/ghost', { version: 1, data: {} });
  enqueue(db, mods.push, 'ghost', 'ghost', 'report_completed', { reportId: 'r1' }, T0);
  await w.tick();
  assert.equal(job(db, 'ghost').lastError, 'account-missing');
  assert.equal(calls.length, 0);
});

test('restart recovery: a crashed worker’s job is re-claimed after its lease expires; its late commit is fenced', async () => {
  process.env.PUSH_NOTIFICATIONS_ENABLED = 'true';
  const mods = load();
  const clock = { now: T0 };
  const db = await world(mods, { clock });
  enqueue(db, mods.push, 'j1', 'userB', 'report_completed', { reportId: 'r1' }, T0);
  const { fetchImpl, calls } = stubFetch(okTickets);
  const crashed = makeWorker(mods.push, db, clock, fetchImpl);
  const claimed = await crashed.claim('j1'); // then the process dies
  assert.ok(claimed);

  const survivor = makeWorker(mods.push, db, clock, fetchImpl);
  assert.equal((await survivor.tick()).claimed, 0, 'lease still held');
  clock.now += mods.push.LEASE_MS + 1;
  assert.equal((await survivor.tick()).committed, 1);
  assert.equal(job(db, 'j1').state, 'awaiting_receipts');
  assert.equal(
    await crashed.commit('j1', claimed.leaseId, { state: 'failed' }),
    false,
    'stale lease cannot overwrite'
  );
  assert.equal(job(db, 'j1').state, 'awaiting_receipts');
  assert.equal(calls.length, 1);
});

test('concurrent workers: each job is claimed and sent once', async () => {
  process.env.PUSH_NOTIFICATIONS_ENABLED = 'true';
  const mods = load();
  const clock = { now: T0 };
  const db = await world(mods, { clock });
  for (let i = 0; i < 5; i++)
    enqueue(db, mods.push, `j${i}`, 'userB', 'report_completed', { reportId: `r${i}` }, T0);
  const { fetchImpl, calls } = stubFetch(okTickets);
  const workers = [0, 1, 2].map(() => makeWorker(mods.push, db, clock, fetchImpl));
  const results = await Promise.all(workers.map((w) => w.tick()));
  assert.equal(
    results.reduce((n, r) => n + r.committed, 0),
    5
  );
  assert.equal(calls.length, 5);
});

test('bounded retries: failed requests back off, then the job fails without deleting tokens', async () => {
  process.env.PUSH_NOTIFICATIONS_ENABLED = 'true';
  const mods = load();
  const clock = { now: T0 };
  const db = await world(mods, { clock });
  enqueue(db, mods.push, 'j1', 'userB', 'report_completed', { reportId: 'r1' }, T0);
  const { fetchImpl, calls } = stubFetch(() => ({ status: 503, json: {} }));
  const w = makeWorker(mods.push, db, clock, fetchImpl, { maxEventAgeMs: Number.MAX_SAFE_INTEGER });
  await w.tick();
  assert.equal(job(db, 'j1').state, 'pending');
  assert.equal(job(db, 'j1').attempts, 1);
  assert.ok(job(db, 'j1').nextRunAt > clock.now);
  assert.equal((await w.tick()).claimed, 0, 'not due before backoff');
  for (let i = 0; i < 10 && job(db, 'j1').state === 'pending'; i++) {
    clock.now = job(db, 'j1').nextRunAt;
    await w.tick();
  }
  assert.equal(job(db, 'j1').state, 'failed');
  assert.equal(calls.length, mods.push.MAX_SEND_ATTEMPTS);
  assert.equal(docs(db, 'pushDevices').length, 3);
});

test('tickets: DeviceNotRegistered removes, MessageRateExceeded retries that device only, InvalidCredentials is diagnosed', async () => {
  process.env.PUSH_NOTIFICATIONS_ENABLED = 'true';
  const mods = load();
  const clock = { now: T0 };
  const db = await world(mods, { clock });
  await mods.store.registerDevice(
    db,
    'userA',
    {
      token: tok(4),
      platform: 'android',
      bindingId: bind(4),
      session: { authTime: 1000, issuedAt: 1000 },
    },
    { now: clock.now }
  );
  const errorFor = {
    [tok(1)]: 'DeviceNotRegistered',
    [tok(2)]: 'InvalidCredentials',
    [tok(4)]: 'MessageRateExceeded',
  };
  const { fetchImpl, calls } = stubFetch((url, body) => ({
    status: 200,
    json: {
      data: body.map((m) =>
        calls.length > 1
          ? { status: 'ok', id: 'later' }
          : { status: 'error', details: { error: errorFor[m.to] } }
      ),
    },
  }));
  const w = makeWorker(mods.push, db, clock, fetchImpl);
  enqueue(db, mods.push, 'j1', 'userA', 'report_completed', { reportId: 'r1' }, T0);
  await w.tick();
  assert.ok(
    !docs(db, 'pushDevices').some((d) => d.token === tok(1)),
    'confirmed permanent failure removed'
  );
  assert.ok(
    docs(db, 'pushDevices').some((d) => d.token === tok(2)),
    'credential error keeps token'
  );
  assert.equal(await mods.push.getProviderStatus(db, 'android', clock.now), 'credential-error');
  assert.equal(await mods.push.getProviderStatus(db, 'ios', clock.now), 'unverified');
  assert.equal(job(db, 'j1').state, 'pending');
  clock.now = job(db, 'j1').nextRunAt;
  await w.tick();
  assert.deepEqual(
    calls[1].body.map((m) => m.to),
    [tok(4)],
    'only the rate-limited device is retried'
  );
  assert.equal(job(db, 'j1').state, 'awaiting_receipts');
});

test('receipts: ok / DeviceNotRegistered / credential error; stale results never delete; missing receipts bounded', async () => {
  process.env.PUSH_NOTIFICATIONS_ENABLED = 'true';
  const mods = load();
  const clock = { now: T0 };
  const db = await world(mods, { clock });
  for (const n of [5, 6, 7]) {
    await mods.store.registerDevice(
      db,
      'userA',
      {
        token: tok(n),
        platform: 'android',
        bindingId: bind(n),
        session: { authTime: 1000, issuedAt: 1000 },
      },
      { now: clock.now }
    );
  }
  enqueue(db, mods.push, 'j1', 'userA', 'report_completed', { reportId: 'r1' }, T0);
  const plan = {
    [tok(1)]: 'ok',
    [tok(2)]: 'InvalidCredentials',
    [tok(5)]: 'DeviceNotRegistered',
    [tok(6)]: 'DeviceNotRegistered',
    [tok(7)]: 'missing',
  };
  const { fetchImpl, calls } = stubFetch((url, body) => {
    if (url.endsWith('/send')) return okTickets(url, body);
    return {
      status: 200,
      json: {
        data: Object.fromEntries(
          body.ids
            .map((id) => [id, plan[id.slice(2)]])
            .filter(([, p]) => p !== 'missing')
            .map(([id, p]) => [
              id,
              p === 'ok' ? { status: 'ok' } : { status: 'error', details: { error: p } },
            ])
        ),
      },
    };
  });
  const w = makeWorker(mods.push, db, clock, fetchImpl);
  await w.tick();
  // Before receipts: tok(6) is re-registered by another account (ownership moved).
  await mods.store.registerDevice(
    db,
    'userB',
    {
      token: tok(6),
      platform: 'android',
      bindingId: bind(66),
      session: { authTime: 2000, issuedAt: 2000 },
    },
    { now: clock.now }
  );
  clock.now = job(db, 'j1').nextRunAt;
  assert.equal((await w.tick()).committed, 1);
  assert.equal(calls[1].url, mods.push.EXPO_RECEIPTS_URL);
  const left = docs(db, 'pushDevices');
  assert.ok(!left.some((d) => d.token === tok(5)), 'confirmed permanent failure removed');
  assert.ok(
    left.some((d) => d.token === tok(6) && d.uid === 'userB'),
    'moved token survives a stale receipt'
  );
  assert.ok(
    left.some((d) => d.token === tok(2)),
    'credential error keeps token'
  );
  const j = job(db, 'j1');
  assert.equal(j.state, 'awaiting_receipts', 'one receipt still missing -> rechecked');
  for (let i = 0; i < 10 && job(db, 'j1').state === 'awaiting_receipts'; i++) {
    clock.now = job(db, 'j1').nextRunAt;
    await w.tick();
  }
  const done = job(db, 'j1');
  assert.equal(done.state, 'done');
  assert.equal(done.receiptAttempts, mods.push.MAX_RECEIPT_ATTEMPTS);
  assert.ok(Object.values(done.deliveries).some((d) => d.status === 'unconfirmed'));
  assert.ok(done.expireAt > clock.now);
});

test('batching and cleanup: sends are chunked; terminal jobs are swept after retention', async () => {
  process.env.PUSH_NOTIFICATIONS_ENABLED = 'true';
  const mods = load();
  const clock = { now: T0 };
  const db = await world(mods, { clock });
  for (let n = 10; n < 17; n++) {
    await mods.store.registerDevice(
      db,
      'userB',
      {
        token: tok(n),
        platform: 'ios',
        bindingId: bind(n),
        session: { authTime: 1000, issuedAt: 1000 },
      },
      { now: clock.now }
    );
  }
  enqueue(db, mods.push, 'j1', 'userB', 'export_completed', { reportId: 'r1' }, T0);
  const { fetchImpl, calls } = stubFetch(okTickets);
  const w = makeWorker(mods.push, db, clock, fetchImpl, { sendChunkSize: 3 });
  await w.tick();
  assert.deepEqual(
    calls.map((c) => c.body.length),
    [3, 3, 2]
  );
  db.store.set('pushOutbox/old', {
    version: 1,
    data: { state: 'done', nextRunAt: null, expireAt: clock.now - 1 },
  });
  assert.equal(await w.sweepJobs(), 1);
  assert.ok(!job(db, 'old'));
  assert.ok(job(db, 'j1'));
});

test('push failures never break notifications (enabled, provider down)', async () => {
  process.env.PUSH_NOTIFICATIONS_ENABLED = 'true';
  const mods = load();
  const clock = { now: Date.now() };
  const db = await world(mods, { clock });
  assert.equal(
    await mods.notifications.notifyUser(db, 'userB', 'report_approved', { reportId: 'r1' }),
    true
  );
  const w = makeWorker(mods.push, db, clock, async () => {
    throw new Error('network down');
  });
  await assert.doesNotReject(w.tick());
  assert.equal(docs(db, 'notifications').length, 1);
  assert.equal(docs(db, 'pushDevices').length, 3);
});

test('generic copy for every type; report types need a valid report id', () => {
  const { push, notifications } = load();
  for (const type of Object.values(notifications.NOTIFICATION_TYPES)) {
    const c = push.buildPushContent(type, { reportId: 'r1', claimNumber: 'CLM-1' });
    assert.ok(c && c.title && c.body, type);
    assert.doesNotMatch(c.body, /CLM-1/);
  }
  assert.equal(push.buildPushContent('report_completed', {}), null);
  assert.equal(push.buildPushContent('report_completed', { reportId: '../x' }), null);
  assert.equal(push.buildOutboxJob('n1', 'u', 'unknown_type', {}), null);
});

test('postToExpo: bounded in-request retries, no retry for permanent HTTP errors, optional access token', async () => {
  const { push } = load();
  const transient = stubFetch(() => ({ status: 503, json: {} }));
  assert.equal(
    await push.postToExpo(push.EXPO_SEND_URL, [], {
      fetchImpl: transient.fetchImpl,
      sleep: noSleep,
    }),
    null
  );
  assert.equal(transient.calls.length, push.MAX_ATTEMPTS);
  const badRequest = stubFetch(() => ({ status: 400, json: {} }));
  await push.postToExpo(push.EXPO_SEND_URL, [], {
    fetchImpl: badRequest.fetchImpl,
    sleep: noSleep,
  });
  assert.equal(badRequest.calls.length, 1);
  process.env.EXPO_ACCESS_TOKEN = 'expo-secret';
  const ok = stubFetch(() => ({ status: 200, json: { data: [] } }));
  await push.postToExpo(push.EXPO_SEND_URL, [], { fetchImpl: ok.fetchImpl });
  assert.equal(ok.calls[0].headers.Authorization, 'Bearer expo-secret');
});
