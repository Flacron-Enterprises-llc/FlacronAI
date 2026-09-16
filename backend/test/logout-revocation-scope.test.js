const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

// Rollout-safety correction (2026-09-08): ordinary Sign Out (POST /auth/logout) must
// NEVER silently become an all-devices "kill every other session now" operation --
// that is reserved for explicit, deliberate security events (a password change). This
// suite proves the two routes now have genuinely different revocation scope, not just
// different comments.

const firebaseConfigPath = require.resolve('../config/firebase');
const authRoutePath = require.resolve('../routes/auth');
const authMiddlewarePath = require.resolve('../middleware/auth');
const usersRoutePath = require.resolve('../routes/users');

// A fresh "just signed in" timestamp, not a fixed past one -- the two change-password
// routes exercised below are now also gated by requireRecentAuth (2026-09-08), which
// rejects any auth_time older than a few minutes; that isn't what this file is testing
// (see require-recent-auth.test.js / password-change-contract.test.js for that), so a
// stale fixed constant here would fail these tests for an unrelated reason.
const AUTH_TIME = Math.floor(Date.now() / 1000);
const TEST_UID = 'revocation-scope-uid';

function installFakes({ routeModulePath }) {
  const userData = { tier: 'starter', email: 'scope-test@example.com', tokenVersion: 0 };
  let revokeRefreshTokensCalls = 0;

  delete require.cache[firebaseConfigPath];
  delete require.cache[routeModulePath];
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
          auth_time: AUTH_TIME,
          iat: AUTH_TIME,
        }),
        revokeRefreshTokens: async () => {
          revokeRefreshTokensCalls += 1;
        },
        updateUser: async () => {},
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

  const router = require(routeModulePath);
  return { router, userData, getRevokeCalls: () => revokeRefreshTokensCalls };
}

async function withTestServer(router, mountPath, fn) {
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}${mountPath}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('POST /auth/logout does NOT set tokenValidAfter -- ordinary Sign Out stays single-session-scoped', async () => {
  const { router, userData, getRevokeCalls } = installFakes({ routeModulePath: authRoutePath });
  await withTestServer(router, '/api/v1/auth', async (base) => {
    const res = await fetch(`${base}/logout`, {
      method: 'POST',
      headers: { Authorization: 'Bearer faketoken' },
    });
    assert.equal(res.status, 200);
  });
  assert.equal(
    userData.tokenValidAfter,
    undefined,
    'ordinary logout must not bump tokenValidAfter'
  );
  assert.equal(
    userData.tokenVersion,
    1,
    'tokenVersion still bumps (invalidates custom JWTs/MFA assertions)'
  );
  assert.equal(
    getRevokeCalls(),
    1,
    'revokeRefreshTokens is still called (blocks future refreshes, pre-existing behavior)'
  );
});

test('POST /auth/change-password DOES set tokenValidAfter -- an explicit all-sessions security event', async () => {
  const { router, userData } = installFakes({ routeModulePath: authRoutePath });
  await withTestServer(router, '/api/v1/auth', async (base) => {
    const res = await fetch(`${base}/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify({ newPassword: 'Str0ng!Passw0rd#2026' }),
    });
    assert.equal(res.status, 200);
  });
  assert.equal(typeof userData.tokenValidAfter, 'number');
  assert.equal(userData.tokenVersion, 1);
});

test('PUT /users/change-password ALSO sets tokenValidAfter, matching /auth/change-password', async () => {
  const { router, userData } = installFakes({ routeModulePath: usersRoutePath });
  await withTestServer(router, '/api/v1/users', async (base) => {
    const res = await fetch(`${base}/change-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify({ newPassword: 'Str0ng!Passw0rd#2026' }),
    });
    assert.equal(res.status, 200);
  });
  assert.equal(typeof userData.tokenValidAfter, 'number');
});
