/**
 * Maps Firebase Auth error codes and backend API error codes to safe, user-facing
 * messages — never surfaces a raw SDK/HTTP error message, a stack trace, or an internal
 * code to the user (see CLAUDE.md/AUTHENTICATION_ARCHITECTURE.md §6 "sanitize
 * user-facing errors"). Ported from `frontend/src/pages/Auth.jsx`'s inline switch.
 */
import { ApiRequestError } from '@/types/api';

interface FirebaseLikeError {
  code?: string;
  message?: string;
}

const FIREBASE_MESSAGES: Record<string, string> = {
  'auth/user-not-found': 'Invalid email or password',
  'auth/wrong-password': 'Invalid email or password',
  'auth/invalid-credential': 'Invalid email or password',
  'auth/email-already-in-use': 'Email already registered. Please sign in instead.',
  'auth/account-exists-with-different-credential':
    'An account with this email already exists. Please sign in with your email and password.',
  'auth/too-many-requests': 'Too many failed attempts. Please try again later or reset your password.',
  'auth/invalid-email': 'Invalid email address',
  'auth/weak-password': 'Please choose a stronger password.',
  'auth/network-request-failed': 'Unable to reach the sign-in service. Check your connection and try again.',
  'auth/user-disabled': 'This account is no longer available.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled.',
};

/** Backend error codes (see backend/routes/auth.js, backend/middleware/auth.js) that need
 * a distinct, non-generic message rather than falling through to the raw `error` string. */
const BACKEND_MESSAGES: Record<string, string> = {
  TOKEN_REVOKED: 'Your session has ended. Please sign in again.',
  AUTH_VERIFY_UNAVAILABLE: 'We are temporarily unable to verify your session. Please try again.',
  PROFILE_LOOKUP_FAILED: 'We could not load your account data. Please try again.',
  TEAM_ACCESS_SUSPENDED: 'Your team access has been suspended.',
  AUTH_RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  MFA_RATE_LIMITED: 'Too many verification attempts. Please try again later.',
  INVALID_MFA_CODE: 'Invalid code. Please try again.',
  MFA_SESSION_EXPIRED: 'This verification session expired. Please sign in again.',
  CONFIG_ERROR: 'This service is temporarily unavailable. Please try again later.',
};

/** True for backend error codes that mean "the backend is having a moment" — never a
 * reason to sign the user out or show a scary error (see AUTHENTICATION_ARCHITECTURE.md §6). */
export function isTransientErrorCode(code: string | null | undefined): boolean {
  return code === 'AUTH_VERIFY_UNAVAILABLE' || code === 'PROFILE_LOOKUP_FAILED';
}

export function getAuthErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.isNetworkError) return err.message;
    if (err.code && BACKEND_MESSAGES[err.code]) return BACKEND_MESSAGES[err.code];
    return err.message || 'Something went wrong. Please try again.';
  }

  const fbErr = err as FirebaseLikeError;
  if (fbErr?.code && FIREBASE_MESSAGES[fbErr.code]) return FIREBASE_MESSAGES[fbErr.code];

  return 'Something went wrong. Please try again.';
}
