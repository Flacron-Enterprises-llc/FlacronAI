const test = require('node:test');
const assert = require('node:assert/strict');
const { issueMfaAssertion } = require('../utils/mfaAssertion');

// Integration coverage for the 2026-09-08 follow-up-audit fix (and its
// 2026-09-08 rollout-safety correction): authenticateToken must require a
// valid X-MFA-Token assertion for any account with mfaEnabled === true, on
// every protected route except the explicit, exact METHOD+path bootstrap
// exemption list -- but ONLY once MFA_ENFORCEMENT_ENABLED === 'true'; while
// disabled (the safe default), no request is ever rejected for a
// missing/invalid assertion. Separately, an already-issued Firebase ID
// token is rejected once tokenValidAfter has been bumped past its iat
// (password-change revocation only -- NOT ordinary logout, see
// routes/auth.js's own header comment). Uses the same require.cache-injection
// technique as auth-transient-error.test.js so nothing here ever touches a
// real Firebase project.

const firebaseConfigPath = require.resolve('../config/firebase');
const authMiddlewarePath = require.resolve('../middleware/auth');

const installFakeFirebase = ({ verifyIdToken, firestoreData }) => {
  delete require.cache[firebaseConfigPath];
  delete require.cache[authMiddlewarePath];
  // NOT cleared: ../utils/mfaAssertion -- issueMfaAssertion (imported directly in this test
  // file, above) and the copy middleware/auth.js re-requires must share the exact same
  // module instance so they derive the identical MFA_SESSION_SECRET, and both must read
  // MFA_ENFORCEMENT_ENABLED fresh from process.env (never cached at require time).
  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath,
    filename: firebaseConfigPath,
    loaded: true,
    exports: {
      getAuth: () => ({ verifyIdToken }),
      getFirestore: () => ({
        collection: () => ({
          doc: () => ({ get: async () => ({ exists: true, data: () => firestoreData }) }),
        }),
      }),
      FieldValue: {},
      Timestamp: {},
      admin: {},
      initFirebase: () => {},
      getBucket: () => {},
    },
  };
  return require('../middleware/auth');
};

const fakeReq = ({
  token = 'faketoken',
  mfaHeader,
  method = 'POST',
  baseUrl = '/api/v1/reports',
  path = '/generate',
} = {}) => ({
  headers: {
    authorization: `Bearer ${token}`,
    ...(mfaHeader ? { 'x-mfa-token': mfaHeader } : {}),
  },
  method,
  baseUrl,
  path,
});
const fakeRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
};

require('../utils/mfaAssertion'); // ensure loaded once before any cache manipulation above

const AUTH_TIME = 1700000000;
const IAT = AUTH_TIME; // simplification: this fake token's iat equals its auth_time

const ORIGINAL_ENFORCEMENT_ENV = process.env.MFA_ENFORCEMENT_ENABLED;
const enableEnforcement = () => {
  process.env.MFA_ENFORCEMENT_ENABLED = 'true';
};
const disableEnforcement = () => {
  delete process.env.MFA_ENFORCEMENT_ENABLED;
};
test.afterEach(() => {
  if (ORIGINAL_ENFORCEMENT_ENV === undefined) delete process.env.MFA_ENFORCEMENT_ENABLED;
  else process.env.MFA_ENFORCEMENT_ENABLED = ORIGINAL_ENFORCEMENT_ENV;
});

// --- rollout-safety: the enforcement flag itself ---

test('enforcement flag DEFAULTS DISABLED (unset) -- an MFA-enabled account without an assertion is NOT blocked', async () => {
  disableEnforcement();
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({
      uid: 'u-flag-off',
      email: 'a@b.com',
      auth_time: AUTH_TIME,
      iat: IAT,
    }),
    firestoreData: { tier: 'starter', mfaEnabled: true, tokenVersion: 0 },
  });
  const req = fakeReq();
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(
    nextCalled,
    true,
    'existing MFA users must not be locked out while enforcement is disabled'
  );
  assert.equal(res.statusCode, null);
});

test('enforcement flag explicitly "false" (not just unset) also stays disabled', async () => {
  process.env.MFA_ENFORCEMENT_ENABLED = 'false';
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({
      uid: 'u-flag-false',
      email: 'a@b.com',
      auth_time: AUTH_TIME,
      iat: IAT,
    }),
    firestoreData: { tier: 'starter', mfaEnabled: true, tokenVersion: 0 },
  });
  const req = fakeReq();
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test('enforcement flag "true" activates the check -- an MFA-enabled account without an assertion IS blocked', async () => {
  enableEnforcement();
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({
      uid: 'u-flag-on',
      email: 'a@b.com',
      auth_time: AUTH_TIME,
      iat: IAT,
    }),
    firestoreData: { tier: 'starter', mfaEnabled: true, tokenVersion: 0 },
  });
  const req = fakeReq();
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'MFA_REQUIRED');
});

test('enforcement flag "true" -- a correctly bound assertion still passes (fails closed, not fails shut)', async () => {
  enableEnforcement();
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({
      uid: 'u-flag-on-2',
      email: 'a@b.com',
      auth_time: AUTH_TIME,
      iat: IAT,
    }),
    firestoreData: { tier: 'starter', mfaEnabled: true, tokenVersion: 0 },
  });
  const assertion = issueMfaAssertion({ uid: 'u-flag-on-2', authTime: AUTH_TIME, tokenVersion: 0 });
  const req = fakeReq({ mfaHeader: assertion });
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

// --- assertion validation (enforcement enabled) ---

test('MFA-enabled account, no assertion header -> 403 MFA_REQUIRED on a protected route', async () => {
  enableEnforcement();
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({ uid: 'u1', email: 'a@b.com', auth_time: AUTH_TIME, iat: IAT }),
    firestoreData: { tier: 'starter', mfaEnabled: true, tokenVersion: 0 },
  });
  const req = fakeReq();
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'MFA_REQUIRED');
});

test('non-MFA account is completely unaffected (no header needed, passes through) regardless of the flag', async () => {
  enableEnforcement();
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({ uid: 'u2', email: 'b@b.com', auth_time: AUTH_TIME, iat: IAT }),
    firestoreData: { tier: 'starter', mfaEnabled: false, tokenVersion: 0 },
  });
  const req = fakeReq();
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('a Google-provider account with MFA not enabled is not accidentally blocked', async () => {
  enableEnforcement();
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({
      uid: 'u-google',
      email: 'g@b.com',
      auth_time: AUTH_TIME,
      iat: IAT,
    }),
    firestoreData: {
      tier: 'professional',
      mfaEnabled: false,
      tokenVersion: 0,
      provider: 'google.com',
    },
  });
  const req = fakeReq();
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(
    nextCalled,
    true,
    'MFA enforcement is keyed only on mfaEnabled, never on sign-in provider'
  );
});

test('a correctly bound assertion is accepted', async () => {
  enableEnforcement();
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({ uid: 'u3', email: 'c@b.com', auth_time: AUTH_TIME, iat: IAT }),
    firestoreData: { tier: 'starter', mfaEnabled: true, tokenVersion: 0 },
  });
  const assertion = issueMfaAssertion({ uid: 'u3', authTime: AUTH_TIME, tokenVersion: 0 });
  const req = fakeReq({ mfaHeader: assertion });
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(req.user.uid, 'u3');
});

test('an assertion issued for a different uid is rejected (403, not silently accepted)', async () => {
  enableEnforcement();
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({ uid: 'u4', email: 'd@b.com', auth_time: AUTH_TIME, iat: IAT }),
    firestoreData: { tier: 'starter', mfaEnabled: true, tokenVersion: 0 },
  });
  const assertion = issueMfaAssertion({
    uid: 'someone-else',
    authTime: AUTH_TIME,
    tokenVersion: 0,
  });
  const req = fakeReq({ mfaHeader: assertion });
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'MFA_REQUIRED');
});

test('an assertion from a different sign-in event (different auth_time) is rejected', async () => {
  enableEnforcement();
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({ uid: 'u5', email: 'e@b.com', auth_time: AUTH_TIME, iat: IAT }),
    firestoreData: { tier: 'starter', mfaEnabled: true, tokenVersion: 0 },
  });
  const assertion = issueMfaAssertion({ uid: 'u5', authTime: AUTH_TIME - 5000, tokenVersion: 0 });
  const req = fakeReq({ mfaHeader: assertion });
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'MFA_REQUIRED');
});

test('an assertion with an outdated tokenVersion is rejected (logout/password-change revokes it)', async () => {
  enableEnforcement();
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({ uid: 'u6', email: 'f@b.com', auth_time: AUTH_TIME, iat: IAT }),
    firestoreData: { tier: 'starter', mfaEnabled: true, tokenVersion: 1 }, // bumped since assertion was issued
  });
  const assertion = issueMfaAssertion({ uid: 'u6', authTime: AUTH_TIME, tokenVersion: 0 });
  const req = fakeReq({ mfaHeader: assertion });
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'MFA_REQUIRED');
});

test('a malformed assertion header is rejected the same as a missing one', async () => {
  enableEnforcement();
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({ uid: 'u7', email: 'g@b.com', auth_time: AUTH_TIME, iat: IAT }),
    firestoreData: { tier: 'starter', mfaEnabled: true, tokenVersion: 0 },
  });
  const req = fakeReq({ mfaHeader: 'garbage-not-a-jwt' });
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('an expired assertion is rejected with 403 MFA_REQUIRED (not a different error shape)', async () => {
  enableEnforcement();
  const jwt = require('jsonwebtoken');
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({ uid: 'u7b', email: 'g2@b.com', auth_time: AUTH_TIME, iat: IAT }),
    firestoreData: { tier: 'starter', mfaEnabled: true, tokenVersion: 0 },
  });
  const secret = `${process.env.JWT_SECRET}::mfa-session`;
  const expired = jwt.sign(
    { typ: 'mfa_session_v1', uid: 'u7b', authTime: AUTH_TIME, tokenVersion: 0 },
    secret,
    { expiresIn: -10 }
  );
  const req = fakeReq({ mfaHeader: expired });
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'MFA_REQUIRED');
});

test('a wrong-purpose token (e.g. the pre-login MFA challenge token) is rejected the same as a missing assertion', async () => {
  enableEnforcement();
  const jwt = require('jsonwebtoken');
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({ uid: 'u7c', email: 'g3@b.com', auth_time: AUTH_TIME, iat: IAT }),
    firestoreData: { tier: 'starter', mfaEnabled: true, tokenVersion: 0 },
  });
  const secret = `${process.env.JWT_SECRET}::mfa-session`;
  const wrongPurpose = jwt.sign(
    { typ: 'mfa_challenge_v1', uid: 'u7c', authTime: AUTH_TIME, tokenVersion: 0 },
    secret,
    { expiresIn: '5m' }
  );
  const req = fakeReq({ mfaHeader: wrongPurpose });
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'MFA_REQUIRED');
});

// --- bootstrap exemption list: exact METHOD + path ---

test('bootstrap MFA endpoints remain reachable without an assertion even when mfaEnabled is true and enforcement is on', async () => {
  enableEnforcement();
  const exemptRoutes = [
    ['GET', '/mfa/status'],
    ['POST', '/mfa/verify'],
    ['POST', '/mfa/verify-setup'],
    ['POST', '/mfa/disable'],
    ['POST', '/logout'],
    ['POST', '/verify'],
    ['POST', '/send-verification'],
  ];
  for (const [method, path] of exemptRoutes) {
    const auth = installFakeFirebase({
      verifyIdToken: async () => ({ uid: 'u8', email: 'h@b.com', auth_time: AUTH_TIME, iat: IAT }),
      firestoreData: { tier: 'starter', mfaEnabled: true, tokenVersion: 0 },
    });
    const req = fakeReq({ baseUrl: '/api/v1/auth', method, path });
    const res = fakeRes();
    let nextCalled = false;
    await auth.authenticateToken(req, res, () => {
      nextCalled = true;
    });
    assert.equal(
      nextCalled,
      true,
      `${method} ${path} must remain reachable without an assertion (bootstrap deadlock)`
    );
  }
});

test('exemption is exact METHOD + path -- the same path with a different, unexempted method still requires the assertion', async () => {
  enableEnforcement();
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({ uid: 'u8b', email: 'h2@b.com', auth_time: AUTH_TIME, iat: IAT }),
    firestoreData: { tier: 'starter', mfaEnabled: true, tokenVersion: 0 },
  });
  // '/mfa/status' is only exempt as GET -- a hypothetical POST to the same path must not
  // inherit the exemption by path name alone.
  const req = fakeReq({ baseUrl: '/api/v1/auth', method: 'POST', path: '/mfa/status' });
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('the exemption is scoped to the auth router only -- a same-named route on a different router still requires the assertion', async () => {
  enableEnforcement();
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({ uid: 'u9', email: 'i@b.com', auth_time: AUTH_TIME, iat: IAT }),
    firestoreData: { tier: 'starter', mfaEnabled: true, tokenVersion: 0 },
  });
  // 'POST /verify' is exempt under /auth, but must NOT be exempt under an unrelated router.
  const req = fakeReq({ baseUrl: '/api/v1/reports', method: 'POST', path: '/verify' });
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('isMfaAssertionExempt matches both /api and /api/v1 mount prefixes identically', () => {
  const auth = installFakeFirebase({ verifyIdToken: async () => ({}), firestoreData: {} });
  assert.equal(
    auth.isMfaAssertionExempt({ method: 'GET', baseUrl: '/api/auth', path: '/mfa/status' }),
    true
  );
  assert.equal(
    auth.isMfaAssertionExempt({ method: 'GET', baseUrl: '/api/v1/auth', path: '/mfa/status' }),
    true
  );
  assert.equal(
    auth.isMfaAssertionExempt({
      method: 'POST',
      baseUrl: '/api/v1/auth',
      path: '/change-password',
    }),
    false
  );
});

// --- password-change revocation of already-issued Firebase ID tokens ---
// (NOT ordinary /auth/logout -- see that route's own header comment. This
// middleware-level check is intentionally always-active/unflagged: it is
// harmless and inert unless something actually sets tokenValidAfter, which
// only /auth/change-password and /users/change-password do.)

test('a Firebase ID token issued before tokenValidAfter is rejected as revoked (password-change revocation)', async () => {
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({
      uid: 'u10',
      email: 'j@b.com',
      auth_time: AUTH_TIME,
      iat: AUTH_TIME,
    }),
    firestoreData: {
      tier: 'starter',
      mfaEnabled: false,
      tokenVersion: 0,
      tokenValidAfter: AUTH_TIME + 100,
    },
  });
  const req = fakeReq();
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'TOKEN_REVOKED');
});

test('a Firebase ID token issued AFTER tokenValidAfter (a fresh re-login post-revocation) is accepted', async () => {
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({
      uid: 'u11',
      email: 'k@b.com',
      auth_time: AUTH_TIME + 200,
      iat: AUTH_TIME + 200,
    }),
    firestoreData: {
      tier: 'starter',
      mfaEnabled: false,
      tokenVersion: 0,
      tokenValidAfter: AUTH_TIME + 100,
    },
  });
  const req = fakeReq();
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test('SAME-SECOND edge case: a token issued in the exact same second as the revocation is NOT rejected', async () => {
  // iat === tokenValidAfter (both whole Unix seconds) -- a legitimate fresh login that
  // happens to land in the same second as a password-change revocation must not be
  // falsely locked out. The middleware uses strict `<`, not `<=`, specifically for this.
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({
      uid: 'u11b',
      email: 'k2@b.com',
      auth_time: AUTH_TIME,
      iat: AUTH_TIME,
    }),
    firestoreData: {
      tier: 'starter',
      mfaEnabled: false,
      tokenVersion: 0,
      tokenValidAfter: AUTH_TIME,
    },
  });
  const req = fakeReq();
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true, 'a same-second legitimate login must not be rejected');
  assert.equal(res.statusCode, null);
});

test('an account that has never changed its password through these endpoints (no tokenValidAfter field) is unaffected -- fully backward compatible', async () => {
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({
      uid: 'u12',
      email: 'l@b.com',
      auth_time: AUTH_TIME,
      iat: AUTH_TIME,
    }),
    firestoreData: { tier: 'starter', mfaEnabled: false, tokenVersion: 0 },
  });
  const req = fakeReq();
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});
