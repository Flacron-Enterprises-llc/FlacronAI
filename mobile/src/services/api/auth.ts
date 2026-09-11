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
};
