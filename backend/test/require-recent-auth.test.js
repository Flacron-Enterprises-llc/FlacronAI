const test = require('node:test');
const assert = require('node:assert/strict');
const { requireRecentAuth, RECENT_AUTH_WINDOW_SECONDS, RECENT_AUTH_CLOCK_SKEW_SECONDS } = require('../middleware/auth');

// Unit coverage for the 2026-09-08 requireRecentAuth middleware (see its own
// header comment in middleware/auth.js): must run AFTER authenticateToken and
// reject unless req.mfaContext.authTime -- the verified Firebase ID token's own
// auth_time claim, already decoded by authenticateToken, never anything
// client-supplied -- falls within RECENT_AUTH_WINDOW_SECONDS of "now", allowing
// only RECENT_AUTH_CLOCK_SKEW_SECONDS of slack in either direction. Exercises
// the middleware directly against fake req/res objects (no Express app needed,
// no Firebase to fake) since it is a pure function of req.mfaContext; the
// end-to-end proof that it is actually wired into the real routes lives in
// password-change-contract.test.js.

const fakeRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

test('a genuinely recent auth_time (a few seconds ago) passes and calls next()', () => {
  const now = Math.floor(Date.now() / 1000);
  const req = { mfaContext: { authTime: now - 5 } };
  const res = fakeRes();
  let nextCalled = false;
  requireRecentAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('auth_time at exactly "now" passes', () => {
  const now = Math.floor(Date.now() / 1000);
  const req = { mfaContext: { authTime: now } };
  const res = fakeRes();
  let nextCalled = false;
  requireRecentAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('auth_time just inside the window (window - 1s) passes', () => {
  const now = Math.floor(Date.now() / 1000);
  const req = { mfaContext: { authTime: now - (RECENT_AUTH_WINDOW_SECONDS - 1) } };
  const res = fakeRes();
  let nextCalled = false;
  requireRecentAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('a stale auth_time well past the window is rejected with 403 RECENT_LOGIN_REQUIRED', () => {
  const now = Math.floor(Date.now() / 1000);
  const req = { mfaContext: { authTime: now - RECENT_AUTH_WINDOW_SECONDS - RECENT_AUTH_CLOCK_SKEW_SECONDS - 60 } };
  const res = fakeRes();
  let nextCalled = false;
  requireRecentAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'RECENT_LOGIN_REQUIRED');
});

test('an auth_time exactly at the window+skew boundary is rejected (strict, not off-by-one permissive)', () => {
  const now = Math.floor(Date.now() / 1000);
  const req = { mfaContext: { authTime: now - RECENT_AUTH_WINDOW_SECONDS - RECENT_AUTH_CLOCK_SKEW_SECONDS - 1 } };
  const res = fakeRes();
  let nextCalled = false;
  requireRecentAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('a missing mfaContext (e.g. a custom-JWT-authenticated request) is rejected, not trusted', () => {
  const req = {};
  const res = fakeRes();
  let nextCalled = false;
  requireRecentAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'RECENT_LOGIN_REQUIRED');
});

test('an authTime of undefined on mfaContext is rejected', () => {
  const req = { mfaContext: { tokenVersion: 0 } };
  const res = fakeRes();
  let nextCalled = false;
  requireRecentAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('a malformed (non-numeric) authTime is rejected, not coerced', () => {
  const req = { mfaContext: { authTime: 'not-a-timestamp' } };
  const res = fakeRes();
  let nextCalled = false;
  requireRecentAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('a NaN authTime is rejected', () => {
  const req = { mfaContext: { authTime: NaN } };
  const res = fakeRes();
  let nextCalled = false;
  requireRecentAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('an authTime far in the future is rejected', () => {
  const now = Math.floor(Date.now() / 1000);
  const req = { mfaContext: { authTime: now + 10 * 60 } };
  const res = fakeRes();
  let nextCalled = false;
  requireRecentAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('an authTime slightly in the future, within the clock-skew tolerance, is accepted', () => {
  const now = Math.floor(Date.now() / 1000);
  const req = { mfaContext: { authTime: now + Math.floor(RECENT_AUTH_CLOCK_SKEW_SECONDS / 2) } };
  const res = fakeRes();
  let nextCalled = false;
  requireRecentAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('a client-supplied req.body/query claim of recency cannot substitute for req.mfaContext.authTime', () => {
  const now = Math.floor(Date.now() / 1000);
  const req = {
    // No mfaContext at all -- simulates a custom-JWT-authenticated request, or any
    // path that never went through authenticateToken's Firebase branch -- while the
    // request body/query lie about recency exactly as an attacker would try.
    body: { authTime: now, reauthenticatedAt: now, recentLogin: true },
    query: { authTime: String(now) },
  };
  const res = fakeRes();
  let nextCalled = false;
  requireRecentAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'RECENT_LOGIN_REQUIRED');
});
