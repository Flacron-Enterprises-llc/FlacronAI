const jwt = require('jsonwebtoken');

// Signed with a value DERIVED from JWT_SECRET but purpose-suffixed (same
// pattern routes/auth.js already uses for MFA_CHALLENGE_SECRET), so this
// needs no new secret to provision/rotate, and a token signed for one
// purpose can never verify successfully as another.
const MFA_SESSION_SECRET = `${process.env.JWT_SECRET}::mfa-session`;

// Embedded in every assertion and checked on verify, so this token type can
// never be silently accepted anywhere a real session token (Firebase ID
// token or the custom JWT) or the separate pre-login MFA_CHALLENGE_SECRET
// token is expected, and vice versa.
const MFA_ASSERTION_TYPE = 'mfa_session_v1';

// Header clients attach to authenticated requests once MFA is satisfied.
const MFA_ASSERTION_HEADER = 'x-mfa-token';

// 12h. Long enough that a user isn't re-prompted for a TOTP code on every
// silent Firebase ID-token refresh (~1h) within a normal working session;
// short enough to bound how long a leaked assertion stays useful. Not tied
// to the Firebase ID token's own ~1h expiry -- that token is refreshed
// silently and often, while this assertion answers a coarser question ("did
// this sign-in complete MFA") that the auth_time/tokenVersion binding below
// already scopes to one login, so it doesn't need to expire that often.
const MFA_ASSERTION_TTL_SECONDS = 12 * 60 * 60;

// uid + authTime binds the assertion to one Firebase sign-in event (the ID
// token's own `auth_time` claim, stable across silent refreshes of that same
// login, but different for every fresh sign-in -- including a re-login on
// the same device). This is a session-family binding, not a hardware/device
// binding: a party that already holds both a valid Firebase session (ID or
// refresh token) AND this assertion for it can keep using both together
// regardless of physical device, same as any other bearer-token session --
// what it actually prevents is replaying one login's completed MFA against a
// *different* sign-in event (a fresh login, on any device), which always
// gets a new auth_time and therefore requires MFA again.
const issueMfaAssertion = ({ uid, authTime, tokenVersion }) =>
  jwt.sign(
    { typ: MFA_ASSERTION_TYPE, uid, authTime, tokenVersion: tokenVersion || 0 },
    MFA_SESSION_SECRET,
    { expiresIn: MFA_ASSERTION_TTL_SECONDS }
  );

// Returns the decoded assertion iff it is a well-formed, unexpired
// mfa_session_v1 assertion matching the given uid, the Firebase ID token's
// own auth_time, and the user document's current tokenVersion (so logout /
// password change / any other tokenVersion bump revokes it immediately,
// reusing data the caller already loaded -- no extra Firestore read here).
// Returns null on any mismatch or verification failure; never throws.
const verifyMfaAssertion = (token, { uid, authTime, tokenVersion }) => {
  if (!token || typeof token !== 'string') return null;
  let decoded;
  try {
    decoded = jwt.verify(token, MFA_SESSION_SECRET);
  } catch {
    return null;
  }
  if (decoded.typ !== MFA_ASSERTION_TYPE) return null;
  if (decoded.uid !== uid) return null;
  if (decoded.authTime !== authTime) return null;
  if ((decoded.tokenVersion || 0) !== (tokenVersion || 0)) return null;
  return decoded;
};

// Rollout safety flag (2026-09-08 rollout-safety follow-up). NOT a secret --
// a plain feature toggle, safe to log/inspect, documented in `.env.example`.
// Defaults SAFELY DISABLED: unless explicitly set to the literal string
// 'true', enforcement stays off, so backend assertion issuance (this file)
// and both clients' store/attach/clear support can deploy and run in
// production ahead of enforcement -- existing MFA-enabled users are never
// locked out by a deploy alone. Read fresh from `process.env` on every call
// (not cached at module load) so tests can toggle it per-test without
// re-requiring this module. Flipping it to 'true' in production is a
// separate, explicit, later step -- see AUTHENTICATION_ARCHITECTURE.md §12
// for the exact activation procedure and verification checklist.
const isMfaEnforcementEnabled = () => process.env.MFA_ENFORCEMENT_ENABLED === 'true';

module.exports = {
  MFA_ASSERTION_HEADER,
  MFA_ASSERTION_TYPE,
  MFA_ASSERTION_TTL_SECONDS,
  issueMfaAssertion,
  verifyMfaAssertion,
  isMfaEnforcementEnabled,
};
