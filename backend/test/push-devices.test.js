const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Mobile Phase 6 -- device-binding endpoints (routes/notifications.js) and the
// store behind them (utils/pushDeviceStore.js): auth, validation, ownership,
// the sign-out revocation fence, the stale-request fence, lease/session
// eligibility and sweeping. Real Express app + real router, faking only
// ../config/firebase. Push delivery stays disabled; nothing contacts Expo.
delete process.env.PUSH_NOTIFICATIONS_ENABLED;
delete process.env.MFA_ENFORCEMENT_ENABLED;

const firebaseConfigPath = require.resolve('../config/firebase');
const resetPaths = [
  firebaseConfigPath,
  require.resolve('../middleware/auth'),
  require.resolve('../middleware/rateLimiters'),
  require.resolve('../routes/notifications'),
  require.resolve('../utils/notificationService'),
  require.resolve('../utils/pushDeviceStore'),
  require.resolve('../services/pushService'),
];

const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';
const BIND_A = '11111111-1111-4111-8111-111111111111';
const BIND_A2 = '22222222-2222-4222-8222-222222222222';
const BIND_B = '33333333-3333-4333-9333-333333333333';

function installFakes() {
  resetPaths.forEach((p) => delete require.cache[p]);
  const db = new FakeFirestore();
  db.store.set('users/userA', { version: 1, data: { email: 'a@example.com', tier: 'starter' } });
  db.store.set('users/userB', { version: 1, data: { email: 'b@example.com', tier: 'starter' } });
  // Bearer value -> verified claims. Tests mutate this to model sessions.
  const identities = {
    'a-old': { uid: 'userA', email: 'a@example.com', auth_time: 1000, iat: 1500 },
    'a-new': { uid: 'userA', email: 'a@example.com', auth_time: 3000, iat: 3000 },
    'b-1': { uid: 'userB', email: 'b@example.com', auth_time: 2000, iat: 2000 },
  };
  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath,
    filename: firebaseConfigPath,
    loaded: true,
    exports: {
      getAuth: () => ({
        verifyIdToken: async (token) => {
          if (!identities[token]) throw new Error('invalid token');
          return identities[token];
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
  return {
    router: require('../routes/notifications'),
    db,
    store: require('../utils/pushDeviceStore'),
    identities,
  };
}

async function withServer(router, fn) {
  const app = express();
  app.use(express.json({ limit: '10kb' }));
  app.use('/notifications', router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}/notifications`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

async function call(base, path, auth, body, method = 'POST') {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      'Content-Type': 'application/json',
    },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  return { status: res.status, body: await res.json() };
}
const register = (base, auth, token, bindingId, platform = 'ios') =>
  call(base, '/devices', auth, { token, platform, bindingId });
const revoke = (base, bindingId) => call(base, '/devices/revoke', null, { bindingId });

const devicesIn = (db) =>
  [...db.store.entries()]
    .filter(([k]) => k.startsWith('pushDevices/'))
    .map(([k, v]) => ({ id: k.split('/')[1], ...v.data }));
const session = (authTime, issuedAt = authTime, kind = 'firebase', tokenVersion = 0) => ({
  authTime,
  issuedAt,
  kind,
  tokenVersion,
});

test('register: requires authentication', async () => {
  const { router, db } = installFakes();
  await withServer(router, async (base) => {
    assert.equal((await register(base, null, TOKEN_A, BIND_A)).status, 401);
    assert.equal((await register(base, 'forged', TOKEN_A, BIND_A)).status, 401);
    assert.equal((await call(base, '/push-status', null, null, 'GET')).status, 401);
  });
  assert.equal(devicesIn(db).length, 0);
});

test('register/revoke: validate token, platform, bindingId and size', async () => {
  const { router, db } = installFakes();
  await withServer(router, async (base) => {
    for (const body of [
      {},
      { token: 'not-a-token', platform: 'ios', bindingId: BIND_A },
      { token: `ExponentPushToken[${'x'.repeat(300)}]`, platform: 'ios', bindingId: BIND_A },
      { token: TOKEN_A, platform: 'web', bindingId: BIND_A },
      { token: TOKEN_A, platform: 'ios' },
      { token: TOKEN_A, platform: 'ios', bindingId: 'not-a-uuid' },
      { token: TOKEN_A, platform: 'ios', bindingId: '11111111-1111-1111-1111-111111111111' }, // not v4
    ]) {
      const r = await call(base, '/devices', 'b-1', body);
      assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80));
      assert.equal(r.body.code, 'INVALID_PUSH_DEVICE');
    }
    assert.equal((await revoke(base, 'nope')).status, 400);
  });
  assert.equal(devicesIn(db).length, 0);
});

test('register: identity + session come from the verified token; bindingId stored only as a hash; token not echoed', async () => {
  const { router, db } = installFakes();
  await withServer(router, async (base) => {
    const r = await call(base, '/devices', 'b-1', {
      token: TOKEN_A,
      platform: 'android',
      bindingId: BIND_B,
      uid: 'userA',
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {
      success: true,
      registered: true,
      deliveryEnabled: false,
      providerStatus: 'unverified',
    });
  });
  const [d] = devicesIn(db);
  assert.equal(d.uid, 'userB');
  assert.equal(d.sessionAuthTime, 2000);
  assert.equal(d.sessionKind, 'firebase');
  assert.ok(d.leaseExpiresAt > Date.now());
  assert.ok(!JSON.stringify(d).includes(BIND_B), 'raw bindingId never stored');
});

test('repeated registration is idempotent; multiple devices per account', async () => {
  const { router, db } = installFakes();
  await withServer(router, async (base) => {
    await register(base, 'b-1', TOKEN_A, BIND_B);
    const first = devicesIn(db)[0];
    await register(base, 'b-1', TOKEN_A, BIND_B);
    assert.equal(devicesIn(db).length, 1);
    assert.equal(devicesIn(db)[0].createdAt, first.createdAt);
    assert.notEqual(devicesIn(db)[0].registrationId, first.registrationId);
    await register(base, 'b-1', TOKEN_B, BIND_B, 'android');
  });
  assert.equal(devicesIn(db).filter((d) => d.uid === 'userB').length, 2);
});

test('logout race: a registration that reaches the server AFTER sign-out revocation is rejected', async () => {
  const { router, db } = installFakes();
  await withServer(router, async (base) => {
    assert.equal((await revoke(base, BIND_A)).status, 200); // sign-out (no auth needed)
    const late = await register(base, 'a-new', TOKEN_A, BIND_A); // in-flight request lands late
    assert.equal(late.status, 409);
    assert.equal(late.body.code, 'PUSH_BINDING_REVOKED');
  });
  assert.equal(devicesIn(db).length, 0);
});

test('logout race: registration first, revocation second -> removed; both orders end unbound', async () => {
  const { db, store } = installFakes();
  await store.registerDevice(db, 'userA', {
    token: TOKEN_A,
    platform: 'ios',
    bindingId: BIND_A,
    session: session(3000),
  });
  assert.equal(await store.revokeBinding(db, BIND_A), 1);
  assert.equal(devicesIn(db).length, 0);
  // Concurrent: whatever the interleaving, nothing stays bound.
  await Promise.all([
    store.registerDevice(db, 'userA', {
      token: TOKEN_B,
      platform: 'ios',
      bindingId: BIND_A2,
      session: session(3000),
    }),
    store.revokeBinding(db, BIND_A2),
  ]);
  assert.equal(devicesIn(db).length, 0);
});

test('revocation is idempotent, unauthenticated and never touches a newer binding of the same token', async () => {
  const { router, db } = installFakes();
  await withServer(router, async (base) => {
    await register(base, 'a-old', TOKEN_A, BIND_A);
    await register(base, 'b-1', TOKEN_A, BIND_B); // B signed in on the same device
    for (let i = 0; i < 2; i++)
      assert.deepEqual((await revoke(base, BIND_A)).body, { success: true });
  });
  const all = devicesIn(db);
  assert.equal(all.length, 1);
  assert.equal(all[0].uid, 'userB');
});

test('stale-request fence: a late request from an older session cannot take the device back', async () => {
  const { router, db } = installFakes();
  await withServer(router, async (base) => {
    assert.equal((await register(base, 'b-1', TOKEN_A, BIND_B)).status, 200); // B session began at 2000
    const stale = await register(base, 'a-old', TOKEN_A, BIND_A); // A's token issued at 1500
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'PUSH_REGISTRATION_STALE');
    assert.equal(devicesIn(db)[0].uid, 'userB');
    // A genuinely signs in again later -> allowed.
    assert.equal((await register(base, 'a-new', TOKEN_A, BIND_A2)).status, 200);
    assert.equal(devicesIn(db)[0].uid, 'userA');
  });
});

test('stale-request fence also applies within one account (old session vs new session)', async () => {
  const { db, store } = installFakes();
  await store.registerDevice(db, 'userA', {
    token: TOKEN_A,
    platform: 'ios',
    bindingId: BIND_A2,
    session: session(3000),
  });
  const late = await store.registerDevice(db, 'userA', {
    token: TOKEN_A,
    platform: 'ios',
    bindingId: BIND_A,
    session: session(1000, 1500),
  });
  assert.equal(late.status, 'stale');
  assert.equal(devicesIn(db)[0].bindingIdHash, store.bindingHash(BIND_A2));
});

test('race: concurrent registrations of one token by two accounts leave exactly one owner', async () => {
  const { db, store } = installFakes();
  await Promise.all([
    store.registerDevice(db, 'userA', {
      token: TOKEN_A,
      platform: 'ios',
      bindingId: BIND_A,
      session: session(3000),
    }),
    store.registerDevice(db, 'userB', {
      token: TOKEN_A,
      platform: 'ios',
      bindingId: BIND_B,
      session: session(3000),
    }),
  ]);
  assert.equal(devicesIn(db).length, 1);
});

test('owner-scoped token unregister: old owner cannot remove a moved token', async () => {
  const { db, store } = installFakes();
  await store.registerDevice(db, 'userA', {
    token: TOKEN_A,
    platform: 'ios',
    bindingId: BIND_A,
    session: session(1000),
  });
  await store.registerDevice(db, 'userB', {
    token: TOKEN_A,
    platform: 'ios',
    bindingId: BIND_B,
    session: session(2000),
  });
  assert.deepEqual(await store.unregisterDevice(db, 'userA', TOKEN_A), { removed: false });
  assert.equal(devicesIn(db)[0].uid, 'userB');
});

test('stale-result protection: removal only applies to the exact registration it was made for', async () => {
  const { db, store } = installFakes();
  await store.registerDevice(db, 'userA', {
    token: TOKEN_A,
    platform: 'ios',
    bindingId: BIND_A,
    session: session(1000),
  });
  const original = devicesIn(db)[0];
  await store.registerDevice(db, 'userA', {
    token: TOKEN_A,
    platform: 'ios',
    bindingId: BIND_A,
    session: session(1000),
  });
  assert.equal(await store.removeDeviceIfUnchanged(db, original.id, original), false);
  const latest = devicesIn(db)[0];
  assert.equal(await store.removeDeviceIfUnchanged(db, latest.id, latest), true);
});

test('binding eligibility: lease, account, revoked sessions, disabled user, custom-JWT version', () => {
  const { store } = installFakes();
  const now = 5_000_000;
  const b = {
    uid: 'u',
    token: TOKEN_A,
    leaseExpiresAt: now + 1000,
    sessionAuthTime: 4000,
    sessionKind: 'firebase',
    tokenVersion: 0,
  };
  const ctx = (over = {}) => ({
    uid: 'u',
    userData: { tokenVersion: 0 },
    authUser: { disabled: false, tokensValidAfterTime: new Date(3000 * 1000).toUTCString() },
    now,
    ...over,
  });
  assert.equal(store.bindingIneligibilityReason(b, ctx()), null);
  assert.equal(store.bindingIneligibilityReason({ ...b, uid: 'other' }, ctx()), 'not-owner');
  assert.equal(
    store.bindingIneligibilityReason({ ...b, leaseExpiresAt: now - 1 }, ctx()),
    'lease-expired'
  );
  assert.equal(store.bindingIneligibilityReason(b, ctx({ userData: null })), 'account-missing');
  assert.equal(
    store.bindingIneligibilityReason(b, ctx({ userData: { teamMembershipStatus: 'suspended' } })),
    'account-suspended'
  );
  assert.equal(
    store.bindingIneligibilityReason(b, ctx({ userData: { tokenValidAfter: 4500 } })),
    'session-revoked'
  );
  assert.equal(
    store.bindingIneligibilityReason(
      b,
      ctx({
        authUser: { disabled: false, tokensValidAfterTime: new Date(4500 * 1000).toUTCString() },
      })
    ),
    'session-revoked',
    'web Sign Out / password change revoked refresh tokens after this session began'
  );
  assert.equal(
    store.bindingIneligibilityReason(b, ctx({ authUser: { disabled: true } })),
    'account-disabled'
  );
  assert.equal(
    store.bindingIneligibilityReason(
      { ...b, sessionKind: 'jwt' },
      ctx({ userData: { tokenVersion: 1 } })
    ),
    'session-revoked'
  );
  // Same-second revocation + re-login is allowed (strict comparison).
  assert.equal(
    store.bindingIneligibilityReason(b, ctx({ userData: { tokenValidAfter: 4000 } })),
    null
  );
});

test('sweepExpired removes old tombstones and long-expired leases only', async () => {
  const { db, store } = installFakes();
  const now = Date.now();
  await store.revokeBinding(db, BIND_A, { now: now - store.REVOCATION_TTL_MS - 1 });
  await store.revokeBinding(db, BIND_A2, { now });
  await store.registerDevice(
    db,
    'userA',
    { token: TOKEN_A, platform: 'ios', bindingId: BIND_B, session: session(1000) },
    { now: now - store.LEASE_MS - store.LEASE_GRACE_MS - 1 }
  );
  await store.registerDevice(
    db,
    'userA',
    {
      token: TOKEN_B,
      platform: 'ios',
      bindingId: '44444444-4444-4444-8444-444444444444',
      session: session(1000),
    },
    { now }
  );
  const stats = await store.sweepExpired(db, { now });
  assert.deepEqual(stats, { revocations: 1, devices: 1 });
  assert.deepEqual(
    devicesIn(db).map((d) => d.token),
    [TOKEN_B]
  );
});

test('per-account cap evicts the least recently registered devices', async () => {
  const { db, store } = installFakes();
  for (let i = 0; i < store.MAX_DEVICES_PER_USER + 2; i++) {
    await store.registerDevice(db, 'userA', {
      token: `ExponentPushToken[device${String(i).padStart(3, '0')}]`,
      platform: 'android',
      bindingId: BIND_A,
      session: session(1000),
    });
    await new Promise((r) => setTimeout(r, 2));
  }
  const mine = devicesIn(db).filter((d) => d.uid === 'userA');
  assert.equal(mine.length, store.MAX_DEVICES_PER_USER);
  assert.ok(!mine.some((d) => d.token === 'ExponentPushToken[device000]'));
});

test('push-status exposes only safe flags', async () => {
  const { router } = installFakes();
  await withServer(router, async (base) => {
    const r = await call(base, '/push-status?platform=ios', 'b-1', null, 'GET');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {
      success: true,
      deliveryEnabled: false,
      providerStatus: 'unverified',
    });
  });
});

test('existing notification feed route is unaffected', async () => {
  const { router, db } = installFakes();
  db.store.set('notifications/n1', {
    version: 1,
    data: {
      uid: 'userB',
      type: 'report_completed',
      createdAt: new Date().toISOString(),
      read: false,
    },
  });
  await withServer(router, async (base) => {
    const r = await call(base, '/', 'b-1', null, 'GET');
    assert.equal(r.status, 200);
    assert.equal(r.body.notifications[0].id, 'n1');
  });
});
