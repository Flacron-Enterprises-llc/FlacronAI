/**
 * Session-scoped storage for the short-lived backend-signed MFA session assertion (see
 * backend `AUTHENTICATION_ARCHITECTURE.md` §12), plus the MFA_REQUIRED signal api.js's
 * response interceptor raises. Deliberately dependency-free (no axios/firebase imports)
 * so it can be unit-tested in isolation without triggering Firebase app initialization —
 * mirrors mobile's `mfaAssertionStorage.ts` split for the same reason.
 *
 * sessionStorage, NOT localStorage: the assertion should not outlive the browser tab it
 * was issued to, and must never be treated as a permanent credential.
 */
const MFA_ASSERTION_STORAGE_KEY = 'flac_mfa_assertion';

export const getMfaAssertion = () => {
  try {
    return sessionStorage.getItem(MFA_ASSERTION_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setMfaAssertion = (token) => {
  if (!token) return;
  try {
    sessionStorage.setItem(MFA_ASSERTION_STORAGE_KEY, token);
  } catch {
    // Storage unavailable (private mode, quota) -- the assertion simply won't be
    // attached to later requests, which fails safely closed (protected routes will
    // 403 MFA_REQUIRED, not silently pass).
  }
};

export const clearMfaAssertion = () => {
  try {
    sessionStorage.removeItem(MFA_ASSERTION_STORAGE_KEY);
  } catch {
    // Nothing to do -- see setMfaAssertion.
  }
};

// Fired whenever the backend rejects a request with MFA_REQUIRED so AuthContext can drop
// back to the MFA gate without exposing protected content. A plain DOM event, not a
// React import, so this module stays framework-agnostic.
export const MFA_REQUIRED_EVENT = 'flac:mfa-required';

export const notifyMfaRequired = () => {
  try {
    window.dispatchEvent(new Event(MFA_REQUIRED_EVENT));
  } catch {
    // No window (e.g. a non-browser test context) -- nothing to notify.
  }
};
