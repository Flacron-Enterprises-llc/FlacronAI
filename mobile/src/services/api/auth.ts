/**
 * Typed wrappers for the backend auth/MFA endpoints mobile actually uses (see
 * AUTHENTICATION_ARCHITECTURE.md §4/§10). Deliberately does NOT include `/auth/login`,
 * `/auth/register`, or `/auth/mfa/login-verify` — mobile authenticates via the Firebase
 * Client SDK directly (see features/auth/context/AuthProvider.tsx), mirroring the web
 * app's actual, proven pattern rather than the backend's unexercised REST auth surface.
 */
import { apiRequest } from './client';

export interface MfaVerifyResult {
  success: true;
  method?: 'totp' | 'recovery_code';
  mfaEnabled?: false;
  /** Short-lived backend-signed MFA session assertion (AUTHENTICATION_ARCHITECTURE.md
   * §12) — present when the account has MFA enabled and the code just verified; absent
   * (mfaEnabled: false response) when the account doesn't have MFA enabled at all. */
  mfaAssertion?: string;
}

export const authApi = {
  /** Records a `login_success` audit-log entry. Fire-and-forget by convention — a
   * failure here must never block or fail the sign-in itself (mirrors
   * `AuthContext.jsx`'s call site exactly). */
  verify: () => apiRequest<{ success: true; user: unknown }>('/auth/verify', { method: 'POST' }),

  logout: () => apiRequest<{ success: true; message: string }>('/auth/logout', { method: 'POST' }),

  forgotPassword: (email: string) =>
    apiRequest<{ success: true; message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
      skipAuth: true,
    }),

  sendVerification: (pendingPlan?: string) =>
    apiRequest<{ success: true; message: string }>('/auth/send-verification', {
      method: 'POST',
      body: { pendingPlan },
    }),

  mfaStatus: () => apiRequest<{ success: true; mfaEnabled: boolean }>('/auth/mfa/status'),

  mfaVerify: (code: string) =>
    apiRequest<MfaVerifyResult>('/auth/mfa/verify', { method: 'POST', body: { code } }),

  /** Phase 8 — TOTP enrolment (same endpoints as web Settings). `qrCode` is a data-URL
   * PNG; `secret` is the base32 key for manual entry. */
  mfaSetup: () => apiRequest<{ success: true; secret: string; qrCode: string }>('/auth/mfa/setup', { method: 'POST' }),

  /** Returns one-time recovery codes (shown once) and a fresh MFA session assertion. */
  mfaVerifySetup: (code: string) =>
    apiRequest<{ success: true; message: string; recoveryCodes: string[]; mfaAssertion?: string }>(
      '/auth/mfa/verify-setup',
      { method: 'POST', body: { code } }
    ),

  /** Disables MFA with a current authenticator or recovery code (works for every sign-in
   * provider; the password variant needs server config and is web-only). */
  mfaDisable: (code: string) =>
    apiRequest<{ success: true; message: string }>('/auth/mfa/disable', { method: 'POST', body: { code } }),

  /** QA federation: production ID token (+ production MFA code) -> staging custom token.
   * Unauthenticated by design (there is no staging session yet). */
  federatedExchange: (idToken: string, mfaCode?: string) =>
    apiRequest<{ success: true; customToken: string; expiresIn: number; mfaVerified: boolean }>('/auth/federated/exchange', {
      method: 'POST',
      body: mfaCode ? { idToken, mfaCode } : { idToken },
      skipAuth: true,
    }),
};
