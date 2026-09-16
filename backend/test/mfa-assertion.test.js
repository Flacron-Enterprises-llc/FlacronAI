const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const {
  MFA_ASSERTION_TYPE,
  issueMfaAssertion,
  verifyMfaAssertion,
} = require('../utils/mfaAssertion');

// These prove the actual cryptographic bypass-resistance properties the
// 2026-09-08 follow-up audit required before any server-side MFA enforcement
// could be trusted: an assertion must be rejected for a different account,
// a different sign-in event, an outdated tokenVersion, expiry, or a wrong
// token type -- not just accepted whenever *a* signature happens to verify.

const context = { uid: 'user-1', authTime: 1700000000, tokenVersion: 2 };

test('a correctly bound assertion verifies successfully', () => {
  const assertion = issueMfaAssertion(context);
  const decoded = verifyMfaAssertion(assertion, context);
  assert.ok(decoded);
  assert.equal(decoded.uid, context.uid);
  assert.equal(decoded.authTime, context.authTime);
  assert.equal(decoded.tokenVersion, context.tokenVersion);
  assert.equal(decoded.typ, MFA_ASSERTION_TYPE);
});

test('an assertion for one uid is rejected when checked against a different uid', () => {
  const assertion = issueMfaAssertion(context);
  const decoded = verifyMfaAssertion(assertion, { ...context, uid: 'attacker-uid' });
  assert.equal(decoded, null);
});

test('an assertion is rejected when the Firebase auth_time (sign-in event) differs', () => {
  const assertion = issueMfaAssertion(context);
  // Simulates a fresh login (including a re-login on the same device, or a genuinely
  // different device) -- Firebase always mints a new auth_time for a new sign-in.
  const decoded = verifyMfaAssertion(assertion, { ...context, authTime: context.authTime + 1 });
  assert.equal(decoded, null);
});

test('an assertion is rejected once tokenVersion has moved on (logout/password-change revocation)', () => {
  const assertion = issueMfaAssertion(context);
  const decoded = verifyMfaAssertion(assertion, {
    ...context,
    tokenVersion: context.tokenVersion + 1,
  });
  assert.equal(decoded, null);
});

test('a malformed token is rejected, never throws', () => {
  assert.equal(verifyMfaAssertion('not-a-real-jwt', context), null);
  assert.equal(verifyMfaAssertion('', context), null);
  assert.equal(verifyMfaAssertion(null, context), null);
  assert.equal(verifyMfaAssertion(undefined, context), null);
});

test('an expired assertion is rejected', () => {
  // Sign a token with the same derivation this module uses internally, but with an
  // already-past expiry -- proves expiry is actually enforced, not just present in the
  // payload.
  const secret = `${process.env.JWT_SECRET}::mfa-session`;
  const expired = jwt.sign(
    {
      typ: MFA_ASSERTION_TYPE,
      uid: context.uid,
      authTime: context.authTime,
      tokenVersion: context.tokenVersion,
    },
    secret,
    { expiresIn: -10 }
  );
  assert.equal(verifyMfaAssertion(expired, context), null);
});

test('a token of a different type/purpose (e.g. the pre-login MFA challenge token) is never accepted as an assertion', () => {
  const secret = `${process.env.JWT_SECRET}::mfa-session`;
  const wrongPurpose = jwt.sign(
    {
      typ: 'mfa_challenge_v1',
      uid: context.uid,
      authTime: context.authTime,
      tokenVersion: context.tokenVersion,
    },
    secret,
    { expiresIn: '5m' }
  );
  assert.equal(verifyMfaAssertion(wrongPurpose, context), null);
});

test('a real session JWT (wrong secret entirely) is never accepted as an assertion', () => {
  const sessionLikeToken = jwt.sign(
    { uid: context.uid, email: 'a@b.com', tokenVersion: 0 },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '7d' }
  );
  assert.equal(verifyMfaAssertion(sessionLikeToken, context), null);
});

test('the assertion payload never carries a TOTP code, recovery code, or secret', () => {
  const assertion = issueMfaAssertion(context);
  const decoded = jwt.decode(assertion);
  const keys = Object.keys(decoded);
  assert.deepEqual(keys.sort(), ['authTime', 'exp', 'iat', 'tokenVersion', 'typ', 'uid']);
});
