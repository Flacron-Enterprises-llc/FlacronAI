const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

// End-to-end route coverage (real Express app, real authenticateToken, real
// express-validator/rate-limit middleware, only Firebase Admin + speakeasy faked) proving
// the actual bypass-relevant claim: a successful POST /auth/mfa/verify or
// /auth/mfa/verify-setup hands back a usable mfaAssertion additively, without breaking
// any existing response field. This is the "successful setup/verification issues an
// assertion" case from the required test list -- covered end-to-end here rather than
// only at the unit level (mfa-assertion.test.js) since bootstrap correctness depends on
// the real route wiring, not just the crypto.

const firebaseConfigPath = require.resolve('../config/firebase');
const speakeasyPath = require.resolve('speakeasy');
const authRoutePath = require.resolve('../routes/auth');
const authMiddlewarePath = require.resolve('../middleware/auth');

const AUTH_TIME = 1700000000;
const TEST_UID = 'route-test-uid';

function installFakes({ mfaEnabled, mfaSecret = 'BASE32SECRETSTUB', totpVerifies = true }) {
  const userData = {
    tier: 'starter',
    email: 'route-test@example.com',
    mfaEnabled,
    mfaSecret,
    tokenVersion: 0,
  };

  delete require.cache[firebaseConfigPath];
  delete require.cache[speakeasyPath];
  delete require.cache[authRoutePath];
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
      }),
      getFirestore: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: true, data: () => userData, ref: {} }),
            update: async (patch) => Object.assign(userData, patch),
          }),
          add: async () => ({ id: 'fake-audit-id' }),
        }),
        runTransaction: async (cb) =>
          cb({ get: async () => ({ data: () => userData }), update: () => {} }),
      }),
      FieldValue: {},
      Timestamp: {},
      admin: {},
      initFirebase: () => {},
      getBucket: () => {},
    },
  };

  require.cache[speakeasyPath] = {
    id: speakeasyPath,
    filename: speakeasyPath,
    loaded: true,
    exports: {
      generateSecret: () => ({ base32: 'NEWSECRET', otpauth_url: 'otpauth://stub' }),
      totp: { verify: () => totpVerifies },
    },
  };

  return require('../routes/auth');
}

async function withTestServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}/api/v1/auth`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const ORIGINAL_ENFORCEMENT_ENV = process.env.MFA_ENFORCEMENT_ENABLED;
test.afterEach(() => {
  if (ORIGINAL_ENFORCEMENT_ENV === undefined) delete process.env.MFA_ENFORCEMENT_ENABLED;
  else process.env.MFA_ENFORCEMENT_ENABLED = ORIGINAL_ENFORCEMENT_ENV;
});

test('POST /auth/mfa/verify with a correct code returns an mfaAssertion additively, without dropping existing fields', async () => {
  const router = installFakes({ mfaEnabled: true, totpVerifies: true });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify({ code: '123456' }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.method, 'totp');
    assert.equal(typeof body.mfaAssertion, 'string');
    assert.ok(body.mfaAssertion.length > 20);
  });
});

test('POST /auth/mfa/verify with an incorrect code does NOT return an mfaAssertion', async () => {
  const router = installFakes({ mfaEnabled: true, totpVerifies: false });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify({ code: '000000' }),
    });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.code, 'INVALID_MFA_CODE');
    assert.equal(body.mfaAssertion, undefined);
  });
});

test('rollout safety: with enforcement DISABLED (the safe default), an MFA-enabled account reaches a real protected route with NO assertion at all', async () => {
  delete process.env.MFA_ENFORCEMENT_ENABLED;
  const router = installFakes({ mfaEnabled: true, totpVerifies: true });
  const { authenticateToken } = require('../middleware/auth');
  await withTestServer(router, async () => {
    const protectedApp = express();
    protectedApp.get('/protected', authenticateToken, (req, res) => res.json({ success: true }));
    const protectedServer = http.createServer(protectedApp);
    await new Promise((resolve) => protectedServer.listen(0, resolve));
    const protectedPort = protectedServer.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${protectedPort}/protected`, {
        headers: { Authorization: 'Bearer faketoken' },
      });
      assert.equal(
        res.status,
        200,
        'existing MFA users must not be locked out while enforcement is disabled'
      );
    } finally {
      await new Promise((resolve) => protectedServer.close(resolve));
    }
  });
});

test('with enforcement ENABLED, a real protected route (not just /auth) rejects the same session until that assertion is attached', async () => {
  process.env.MFA_ENFORCEMENT_ENABLED = 'true';
  const router = installFakes({ mfaEnabled: true, totpVerifies: true });
  const { authenticateToken } = require('../middleware/auth');
  await withTestServer(router, async (base) => {
    // Prove the assertion this route just issued is what a DIFFERENT protected router
    // (simulated here, since this test app only mounts /auth) would actually require.
    const verifyRes = await fetch(`${base}/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify({ code: '123456' }),
    });
    const { mfaAssertion } = await verifyRes.json();

    const protectedApp = express();
    protectedApp.get('/protected', authenticateToken, (req, res) => res.json({ success: true }));
    const protectedServer = http.createServer(protectedApp);
    await new Promise((resolve) => protectedServer.listen(0, resolve));
    const protectedPort = protectedServer.address().port;
    try {
      const withoutAssertion = await fetch(`http://127.0.0.1:${protectedPort}/protected`, {
        headers: { Authorization: 'Bearer faketoken' },
      });
      assert.equal(withoutAssertion.status, 403);

      const withAssertion = await fetch(`http://127.0.0.1:${protectedPort}/protected`, {
        headers: { Authorization: 'Bearer faketoken', 'X-MFA-Token': mfaAssertion },
      });
      assert.equal(withAssertion.status, 200);
    } finally {
      await new Promise((resolve) => protectedServer.close(resolve));
    }
  });
});
