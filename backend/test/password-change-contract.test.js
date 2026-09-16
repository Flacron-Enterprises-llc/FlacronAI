const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

// Real Express app, real `authenticateToken`, real `PUT /users/change-password` route --
// only Firebase Admin is faked. This is the strongest practical integration-level proof
// available (no jsdom/browser to exercise Settings.jsx itself) for the 2026-09-08
// password-change sequencing fix: it directly confirms the actual backend contract the
// frontend now relies on as its single authority for the password mutation --
//   - the endpoint takes ONLY `newPassword` (no `currentPassword` field is required or
//     checked server-side -- confirmed here, not assumed, which is why the frontend keeps
//     Firebase's own client-side reauthentication as the real "prove you know the current
//     password" step before ever calling this endpoint);
//   - a successful call mutates the password (Admin SDK `updateUser`) at exactly ONE call
//     site;
//   - a successful call bumps BOTH revocation fields (`tokenVersion`, `tokenValidAfter`);
//   - a failed mutation does NOT bump either revocation field and does NOT report success
//     -- so a client that awaits this call (as Settings.jsx now does) can never show a
//     false "password changed" success state.
//   - (2026-09-08 follow-up) the route is now ALSO gated by requireRecentAuth, driven by
//     the same auth_time this fake verifyIdToken hands back -- see the "recent
//     authentication" describe block below for that coverage, end-to-end through the real
//     route rather than just the unit-level require-recent-auth.test.js.

const firebaseConfigPath = require.resolve('../config/firebase');
const usersRoutePath = require.resolve('../routes/users');
const authMiddlewarePath = require.resolve('../middleware/auth');

// A fresh "just signed in" timestamp by default -- requireRecentAuth (2026-09-08) now
// sits in front of this route and rejects any auth_time older than a few minutes, so a
// realistic default here keeps every pre-existing contract test (which isn't about
// recent-auth at all) passing without each one having to think about it. Tests that ARE
// about recent-auth pass their own authTimeOverride below.
const freshAuthTime = () => Math.floor(Date.now() / 1000);
const TEST_UID = 'password-change-contract-uid';
const STRONG_NEW_PASSWORD = 'Str0ng!Passw0rd#2026';

function installFakes({ updateUserImpl, authTimeOverride } = {}) {
  const userData = { tier: 'starter', email: 'contract-test@example.com', tokenVersion: 0 };
  const updateUserCalls = [];
  const authTime = authTimeOverride !== undefined ? authTimeOverride : freshAuthTime();

  delete require.cache[firebaseConfigPath];
  delete require.cache[usersRoutePath];
  delete require.cache[authMiddlewarePath];

  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath,
    filename: firebaseConfigPath,
    loaded: true,
    exports: {
      getAuth: () => ({
        verifyIdToken: async () => ({
          uid: TEST_UID,
          email: userData.email,
          auth_time: authTime,
          iat: freshAuthTime(),
        }),
        updateUser: async (uid, patch) => {
          updateUserCalls.push({ uid, patch });
          if (updateUserImpl) return updateUserImpl(uid, patch);
          return undefined;
        },
        revokeRefreshTokens: async () => {},
      }),
      getFirestore: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: true, data: () => userData, ref: {} }),
            update: async (patch) => Object.assign(userData, patch),
          }),
          add: async () => ({ id: 'fake-audit-id' }),
        }),
      }),
      FieldValue: {},
      Timestamp: {},
      admin: {},
      initFirebase: () => {},
      getBucket: () => {},
    },
  };

  const router = require(usersRoutePath);
  return { router, userData, getUpdateUserCalls: () => updateUserCalls };
}

async function withTestServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/users', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}/api/v1/users`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('PUT /users/change-password requires only newPassword -- no currentPassword field exists in the contract', async () => {
  const { router, getUpdateUserCalls } = installFakes();
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/change-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify({ newPassword: STRONG_NEW_PASSWORD }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
  });
  assert.equal(getUpdateUserCalls().length, 1);
});

test('a currentPassword field, if sent anyway, is silently ignored -- confirms the server never validates it', async () => {
  const { router, getUpdateUserCalls } = installFakes();
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/change-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      // A deliberately WRONG "current password" -- if the server checked it, this would fail.
      body: JSON.stringify({
        currentPassword: 'totally-wrong-old-password',
        newPassword: STRONG_NEW_PASSWORD,
      }),
    });
    const body = await res.json();
    assert.equal(
      res.status,
      200,
      'server trusts the authenticated session, not a re-supplied current password'
    );
    assert.equal(body.success, true);
  });
  assert.equal(getUpdateUserCalls().length, 1);
});

test('a successful change mutates the password at exactly one Admin SDK call site', async () => {
  const { router, getUpdateUserCalls } = installFakes();
  await withTestServer(router, async (base) => {
    await fetch(`${base}/change-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify({ newPassword: STRONG_NEW_PASSWORD }),
    });
  });
  const calls = getUpdateUserCalls();
  assert.equal(calls.length, 1, 'password must be mutated exactly once per request');
  assert.equal(calls[0].uid, TEST_UID);
  assert.equal(calls[0].patch.password, STRONG_NEW_PASSWORD);
});

test('a successful change bumps BOTH tokenVersion and tokenValidAfter (revocation fields)', async () => {
  const { router, userData } = installFakes();
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/change-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify({ newPassword: STRONG_NEW_PASSWORD }),
    });
    assert.equal(res.status, 200);
  });
  assert.equal(userData.tokenVersion, 1);
  assert.equal(typeof userData.tokenValidAfter, 'number');
});

test('when the Admin SDK mutation itself fails, the response is NOT success and NEITHER revocation field is bumped', async () => {
  const { router, userData, getUpdateUserCalls } = installFakes({
    updateUserImpl: async () => {
      throw new Error('Firebase Admin updateUser failure (simulated)');
    },
  });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/change-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify({ newPassword: STRONG_NEW_PASSWORD }),
    });
    const body = await res.json();
    assert.equal(res.status, 500, 'a genuine mutation failure must never look like success');
    assert.equal(body.success, false);
    assert.equal(body.code, 'PASSWORD_ERROR');
  });
  assert.equal(
    getUpdateUserCalls().length,
    1,
    'the mutation was attempted exactly once, and it failed'
  );
  assert.equal(userData.tokenVersion, 0, 'no revocation on a failed mutation');
  assert.equal(userData.tokenValidAfter, undefined, 'no revocation on a failed mutation');
});

test('a weak new password is rejected by server-side validation before any Admin SDK call is made', async () => {
  const { router, getUpdateUserCalls } = installFakes();
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/change-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify({ newPassword: 'weak' }),
    });
    assert.equal(res.status, 400);
  });
  assert.equal(
    getUpdateUserCalls().length,
    0,
    'validation must reject before any mutation is attempted'
  );
});

test('the response body and this test never contain the plaintext new password anywhere but the request itself', async () => {
  const { router } = installFakes();
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/change-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify({ newPassword: STRONG_NEW_PASSWORD }),
    });
    const body = await res.json();
    assert.equal(
      JSON.stringify(body).includes(STRONG_NEW_PASSWORD),
      false,
      'the password must never be echoed back in the response'
    );
  });
});

// ── requireRecentAuth, end-to-end through the real route (2026-09-08) ──────────────────
// Unit-level behavior of the middleware itself lives in require-recent-auth.test.js; these
// prove it is actually wired into this exact route ahead of the mutation, using the same
// real Express app + real authenticateToken + real route as every test above.

test('a recent auth_time (reauthenticated moments ago) succeeds through the real route', async () => {
  const { router, getUpdateUserCalls } = installFakes({ authTimeOverride: freshAuthTime() - 5 });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/change-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify({ newPassword: STRONG_NEW_PASSWORD }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
  });
  assert.equal(getUpdateUserCalls().length, 1);
});

test('a stale auth_time (signed in 20 minutes ago) is rejected with 403 RECENT_LOGIN_REQUIRED and never mutates the password', async () => {
  const { router, userData, getUpdateUserCalls } = installFakes({ authTimeOverride: freshAuthTime() - 20 * 60 });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/change-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify({ newPassword: STRONG_NEW_PASSWORD }),
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.success, false);
    assert.equal(body.code, 'RECENT_LOGIN_REQUIRED');
  });
  assert.equal(getUpdateUserCalls().length, 0, 'a stale reauthentication must never reach the mutation');
  assert.equal(userData.tokenVersion, 0, 'no revocation side effect on a rejected request');
});

test('a future auth_time (clock-skew abuse / forged claim) is rejected and never mutates the password', async () => {
  const { router, getUpdateUserCalls } = installFakes({ authTimeOverride: freshAuthTime() + 10 * 60 });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/change-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify({ newPassword: STRONG_NEW_PASSWORD }),
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.code, 'RECENT_LOGIN_REQUIRED');
  });
  assert.equal(getUpdateUserCalls().length, 0);
});

test('a missing auth_time claim on the verified token is rejected and never mutates the password', async () => {
  // installFakes falls back to a fresh authTime when the option is omitted entirely
  // (authTimeOverride === undefined), so explicitly force the verified token to carry no
  // usable auth_time by overriding with null -- not a valid timestamp, same as an absent
  // claim from requireRecentAuth's point of view.
  const { router, getUpdateUserCalls } = installFakes({ authTimeOverride: null });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/change-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify({ newPassword: STRONG_NEW_PASSWORD }),
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.code, 'RECENT_LOGIN_REQUIRED');
  });
  assert.equal(getUpdateUserCalls().length, 0);
});

test('a client-supplied "reauthenticatedAt"/"authTime" field in the request body cannot bypass a stale real auth_time', async () => {
  const { router, getUpdateUserCalls } = installFakes({ authTimeOverride: freshAuthTime() - 20 * 60 });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/change-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      // A forged claim of recency in the body -- the route never reads this field at all,
      // so it must have zero effect; only the verified token's own auth_time matters.
      body: JSON.stringify({
        newPassword: STRONG_NEW_PASSWORD,
        authTime: freshAuthTime(),
        reauthenticatedAt: freshAuthTime(),
      }),
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.code, 'RECENT_LOGIN_REQUIRED');
  });
  assert.equal(getUpdateUserCalls().length, 0);
});
