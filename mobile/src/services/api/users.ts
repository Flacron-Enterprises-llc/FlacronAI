/**
 * Typed wrappers for the `users/profile`-adjacent endpoints this app needs. Phase 3 built
 * `getProfile`/`updateProfile`/`recordRegistrationConsent`, mirroring the exact real
 * signup contract `frontend/src/pages/Auth.jsx` uses (`backend/routes/users.js:36-93,
 * 96-138,311-360`). Phase 4 adds `getUsage` (the tier/entitlement source of truth every
 * screen needs for server-verified feature gating — Golden Rule #4: never trust a locally
 * cached tier value as the enforcement decision) — confirmed at
 * `backend/routes/users.js` (`GET /users/usage`).
 *
 * Phase 8 adds `changePassword` (`PUT /users/change-password`, recent sign-in required)
 * and `deleteAccount` (`DELETE /users/account`, recent sign-in + explicit confirmation).
 *
 * Deliberately NOT covered here: login history, organization info, API keys, logo upload,
 * onboarding-step tracking (web-only surfaces). Add typed wrappers for these only when a phase actually needs the screen that
 * calls them, so this file doesn't grow speculative surface.
 */
import { apiRequest } from './client';
import type { NotificationPreferences, UserProfile } from '@/features/auth/types';

export interface UsageFeatures {
  apiAccess: boolean;
  whiteLabel: boolean;
  watermark: boolean;
  customLogo: boolean;
  crmAccess: boolean;
}

export interface UsageSummary {
  reportsThisMonth: number;
  reportsTotal: number;
  tier: string;
  tierName: string;
  /** `-1` means unlimited (matches `backend/config/tiers.js`'s convention — never render
   * this as a literal "-1 reports remaining"). */
  reportsLimit: number;
  reportsRemaining: number;
  features: UsageFeatures;
}

export type ProfileUpdate = Partial<
  Pick<UserProfile, 'displayName' | 'firstName' | 'lastName' | 'company' | 'phone' | 'address' | 'notifications'>
>;

export interface DeleteAccountResult {
  success: true;
  message: string;
  /** Subscriptions that keep billing after deletion. Stripe subscriptions are cancelled (and
   * confirmed with Stripe) before deletion, so `stripe` is false on success; App Store / Google
   * Play subscriptions can only be cancelled by the user in the store. */
  subscriptionsStillBilling?: { stripe: boolean; store: 'ios' | 'android' | null };
  /** Number of Stripe subscriptions this request cancelled (0 if none / already ended). */
  stripeSubscriptionsCancelled?: number;
}

export interface LoginHistoryEntry {
  id?: string;
  action: 'login_success' | 'login_failed' | 'suspicious_login_new_device' | 'logout' | string;
  ip?: string | null;
  userAgent?: string | null;
  timestamp: string;
  [key: string]: unknown;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

/** Same enum values as `backend/utils/productTour.js`. */
export interface ProductTourReport {
  /** `mobile` stores completion in `productTourMobile` (separate from the web tour). */
  platform?: 'web' | 'mobile';
  status: 'completed' | 'skipped';
  source: 'auto' | 'replay';
  version: number;
  lastStepId?: string;
  stepsViewed?: number;
  totalSteps?: number;
}

export const usersApi = {
  getProfile: () => apiRequest<{ success: true; user: UserProfile }>('/users/profile'),

  updateProfile: (data: ProfileUpdate) =>
    apiRequest<{ success: true; message: string; updates: unknown }>('/users/profile', {
      method: 'PUT',
      body: data,
    }),

  /** Records the required Terms + Privacy acceptance at sign-up (Golden Rule #5 —
   * distinct from optional marketing consent, which this app does not collect). */
  recordRegistrationConsent: (policyVersion: string) =>
    apiRequest<{ success: true; consent: unknown }>('/users/consent/registration', {
      method: 'POST',
      body: { policyVersion },
    }),

  /** The server-verified tier/report-quota/feature-entitlement source of truth
   * (`GET /users/usage`) — the ONLY thing an entitlement-gated screen should trust,
   * never a cached `tier` string read once at login (Golden Rule #4). */
  getUsage: () => apiRequest<{ success: true; usage: UsageSummary }>('/users/usage'),

  /** Onboarding questionnaire (same as web /onboarding). Steps 0–4; step ≥2 needs userType, ≥3 needs monthlyVolume. */
  saveOnboardingStep: (step: number, answers: { userType?: string; monthlyVolume?: string } = {}) =>
    apiRequest<{ success: true; onboarding?: unknown; alreadyCompleted?: boolean }>('/users/onboarding/step', {
      method: 'POST',
      body: { step, ...answers },
    }),

  /** Without `skipped`, both answers must already be saved (400 ONBOARDING_INCOMPLETE). */
  completeOnboarding: () => apiRequest<{ success: true; alreadyCompleted?: boolean }>('/users/onboarding/complete', { method: 'POST', body: {} }),

  /** The caller's own sign-in events only (audit log), newest first. */
  getLoginHistory: (page = 1, limit = 10) =>
    apiRequest<{ success: true } & Paged<LoginHistoryEntry>>('/users/login-history', { params: { page, limit } }),

  /** JSON copy of the caller's account data (profile + reports metadata). */
  exportData: () => apiRequest<Record<string, unknown>>('/users/export-data'),

  /** Records that the interactive tour was finished or skipped (shared with the web: one per user). */
  recordProductTour: (report: ProductTourReport) =>
    apiRequest<{ success: true; productTour: unknown }>('/users/product-tour', { method: 'POST', body: report }),

  /** Thin, explicitly-named wrapper over `updateProfile` for the one field a
   * notification-settings screen needs to change — kept separate so that call site reads
   * as "update notification prefs," not "update profile with some object." */
  /** Requires a sign-in within the last 5 minutes (re-authenticate first). On success the
   * server revokes every session, including this one. */
  changePassword: (newPassword: string) =>
    apiRequest<{ success: true; message: string }>('/users/change-password', {
      method: 'PUT',
      body: { newPassword },
    }),

  /** Irreversible. Requires a sign-in within the last 5 minutes + `confirmation: 'DELETE'`.
   * Idempotent server-side, so a retry after a failure/timeout is safe. */
  deleteAccount: () =>
    apiRequest<DeleteAccountResult>('/users/account', {
      method: 'DELETE',
      body: { confirmation: 'DELETE' },
      idempotent: true,
      timeoutMs: 60000,
    }),

  updateNotificationPreferences: (notifications: NotificationPreferences) =>
    apiRequest<{ success: true; message: string; updates: unknown }>('/users/profile', {
      method: 'PUT',
      body: { notifications },
    }),
};
