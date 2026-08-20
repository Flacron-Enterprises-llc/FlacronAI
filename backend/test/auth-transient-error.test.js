const test = require('node:test');
const assert = require('node:assert/strict');
const { isTransientAuthError } = require('../middleware/auth');

// Regression coverage for the recurring "Account data unavailable" bug
// (PROGRESS.md 2026-08-02 / 2026-08-12 / 2026-08-15): a long-running process's
// Firebase token verification can transiently fail for reasons unrelated to the
// token itself. These tests prove such failures are now classified as
// retryable (503) instead of a dead-end 401, without ever misclassifying a
// genuinely bad token as retryable.

test('isTransientAuthError classifies known transient Firebase error codes', () => {
  assert.equal(isTransientAuthError({ code: 'auth/internal-error' }), true);
  assert.equal(isTransientAuthError({ code: 'auth/network-request-failed' }), true);
  assert.equal(isTransientAuthError({ code: 'auth/insufficient-permission' }), true);
  assert.equal(isTransientAuthError({ code: 'auth/app-not-authorized' }), true);
});

test('isTransientAuthError classifies known transient network error messages', () => {
  assert.equal(isTransientAuthError({ message: 'fetch failed' }), true);
  assert.equal(isTransientAuthError({ message: 'getaddrinfo ENOTFOUND www.googleapis.com' }), true);
  assert.equal(isTransientAuthError({ message: 'connect ETIMEDOUT 142.250.0.1:443' }), true);
  assert.equal(isTransientAuthError({ message: 'read ECONNRESET' }), true);
  assert.equal(isTransientAuthError({ message: 'connect ECONNREFUSED' }), true);
  assert.equal(isTransientAuthError({ message: 'getaddrinfo EAI_AGAIN oauth2.googleapis.com' }), true);
  assert.equal(isTransientAuthError({ message: 'socket hang up' }), true);
});

test('isTransientAuthError classifies raw firebase-admin app/* HttpClient failures (2026-08-20 recurrence)', () => {
  // These are NOT auth/*-prefixed and were the actual gap: fetchPublicKeys()
  // in firebase-admin/lib/utils/jwt.js rethrows the underlying HttpClient
  // error unchanged on a non-JSON-response failure (e.g. a cert-endpoint
  // timeout), so verifyIdToken() can reject with these codes/messages
  // instead of any auth/* code -- this is why the 2026-08-12/08-15 fixes
  // (which only recognized auth/* codes and ENOTFOUND/ETIMEDOUT-style
  // message text) still let the bug recur.
  assert.equal(isTransientAuthError({ code: 'app/network-error' }), true);
  assert.equal(isTransientAuthError({ code: 'app/network-timeout' }), true);
  assert.equal(isTransientAuthError({ message: 'Error while making request: timeout of 10000ms exceeded.' }), true);
});

test('isTransientAuthError does NOT classify a genuinely bad token as transient', () => {
  assert.equal(isTransientAuthError({ code: 'auth/id-token-expired', message: 'Firebase ID token has expired' }), false);
  assert.equal(isTransientAuthError({ code: 'auth/argument-error', message: 'Decoding Firebase ID token failed' }), false);
  assert.equal(isTransientAuthError({ code: 'auth/id-token-revoked' }), false);
  assert.equal(isTransientAuthError({ message: 'jwt malformed' }), false);
});

test('isTransientAuthError handles null/undefined safely', () => {
  assert.equal(isTransientAuthError(null), false);
  assert.equal(isTransientAuthError(undefined), false);
  assert.equal(isTransientAuthError({}), false);
});

// --- authenticateToken integration tests ---
// middleware/auth.js destructures { getAuth, getFirestore } from ../config/firebase
// at require-time, so a fake ../config/firebase module must be installed into
// require.cache BEFORE middleware/auth.js is first required. This is plain
// CommonJS module-cache injection -- no mocking framework, no experimental
// Node flags, and it never touches the real Firebase project.

const firebaseConfigPath = require.resolve('../config/firebase');
const authMiddlewarePath = require.resolve('../middleware/auth');

const installFakeFirebase = ({ verifyIdToken, firestoreGet }) => {
  delete require.cache[firebaseConfigPath];
  delete require.cache[authMiddlewarePath];
  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath,
    filename: firebaseConfigPath,
    loaded: true,
    exports: {
      getAuth: () => ({ verifyIdToken }),
      getFirestore: () => ({ collection: () => ({ doc: () => ({ get: firestoreGet }) }) }),
      FieldValue: {},
      Timestamp: {},
      admin: {},
      initFirebase: () => {},
      getBucket: () => {},
    },
  };
  return require('../middleware/auth');
};

const fakeReq = (token = 'faketoken') => ({ headers: { authorization: `Bearer ${token}` } });
const fakeRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

test('authenticateToken passes through normally when verifyIdToken succeeds first try', async () => {
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({ uid: 'u1', email: 'a@b.com' }),
    firestoreGet: async () => ({ exists: true, data: () => ({ tier: 'starter', displayName: 'A' }) }),
  });
  const req = fakeReq();
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.user.uid, 'u1');
  assert.equal(res.statusCode, null);
});

test('authenticateToken recovers silently when verifyIdToken fails once transiently then succeeds on retry', async () => {
  let calls = 0;
  const auth = installFakeFirebase({
    verifyIdToken: async () => {
      calls += 1;
      if (calls === 1) throw new Error('fetch failed');
      return { uid: 'u2', email: 'b@b.com' };
    },
    firestoreGet: async () => ({ exists: true, data: () => ({ tier: 'starter' }) }),
  });
  const req = fakeReq();
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => { nextCalled = true; });
  assert.equal(calls, 2, 'verifyIdToken must be retried exactly once after a transient failure');
  assert.equal(nextCalled, true);
  assert.equal(req.user.uid, 'u2');
  assert.equal(res.statusCode, null, 'a recovered request must never surface an error to the client');
});

test('authenticateToken returns a retryable 503 when verifyIdToken fails twice with a transient-looking error', async () => {
  const auth = installFakeFirebase({
    verifyIdToken: async () => { throw new Error('fetch failed'); },
    firestoreGet: async () => ({ exists: true, data: () => ({}) }),
  });
  const req = fakeReq(); // not a valid custom JWT either, so the fallback also fails
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 503, 'must be retryable, not a dead-end 401 -- this is the actual bug fix');
  assert.equal(res.body.code, 'AUTH_VERIFY_UNAVAILABLE');
});

test('authenticateToken still returns 401 for a genuinely invalid/expired token (never misclassified as retryable)', async () => {
  const auth = installFakeFirebase({
    verifyIdToken: async () => {
      const e = new Error('Firebase ID token has expired');
      e.code = 'auth/id-token-expired';
      throw e;
    },
    firestoreGet: async () => ({ exists: true, data: () => ({}) }),
  });
  const req = fakeReq();
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'INVALID_TOKEN');
});

// --- wedged-process detection (2026-08-20) ---
// A live repro proved the "transient" classification's core assumption --
// that a retry will clear it -- doesn't always hold: once a long-running
// process's verifyIdToken() path gets stuck, EVERY request fails identically
// forever, no matter how many times it's retried. isAuthVerificationWedged()
// is what lets server.js's /health route report unhealthy so Render's
// existing healthCheckPath-based auto-restart can actually recover from
// this, instead of the service staying "healthy" while every login fails.

test('isAuthVerificationWedged flips true after enough consecutive transient failures, and resets on any success', async () => {
  const auth = installFakeFirebase({
    verifyIdToken: async () => { throw new Error('fetch failed'); },
    firestoreGet: async () => ({ exists: true, data: () => ({}) }),
  });

  assert.equal(auth.isAuthVerificationWedged(), false, 'must start unwedged');

  // Each call: verifyIdToken fails, its immediate retry also fails, the
  // custom-JWT fallback also fails (not a valid JWT either) -> counted as
  // one consecutive transient failure via the 503 AUTH_VERIFY_UNAVAILABLE path.
  for (let i = 0; i < 4; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await auth.authenticateToken(fakeReq(), fakeRes(), () => {});
  }
  assert.equal(auth.isAuthVerificationWedged(), false, 'must not trip below the threshold (4 failures)');

  await auth.authenticateToken(fakeReq(), fakeRes(), () => {});
  assert.equal(auth.isAuthVerificationWedged(), true, 'must trip at the threshold (5 consecutive failures)');
});

test('isAuthVerificationWedged resets to false as soon as verification succeeds again', async () => {
  let shouldFail = true;
  const auth = installFakeFirebase({
    verifyIdToken: async () => {
      if (shouldFail) throw new Error('fetch failed');
      return { uid: 'recovered-user' };
    },
    firestoreGet: async () => ({ exists: true, data: () => ({}) }),
  });

  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await auth.authenticateToken(fakeReq(), fakeRes(), () => {});
  }
  assert.equal(auth.isAuthVerificationWedged(), true);

  shouldFail = false;
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(fakeReq(), res, () => { nextCalled = true; });
  assert.equal(nextCalled, true, 'a real recovery must go through normally');
  assert.equal(auth.isAuthVerificationWedged(), false, 'a single success must clear the wedged state immediately');
});

test('authenticateToken still returns 503 for a downstream Firestore-lookup failure after a verified token (pre-existing 2026-08-12 behavior, unchanged)', async () => {
  const auth = installFakeFirebase({
    verifyIdToken: async () => ({ uid: 'u3', email: 'c@b.com' }),
    firestoreGet: async () => { throw new Error('Firestore unavailable'); },
  });
  const req = fakeReq();
  const res = fakeRes();
  let nextCalled = false;
  await auth.authenticateToken(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'PROFILE_LOOKUP_FAILED');
});
