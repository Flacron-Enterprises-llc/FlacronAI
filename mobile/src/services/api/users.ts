/**
 * Typed wrappers for the `users/profile`-adjacent endpoints this app needs. Phase 3 built
 * `getProfile`/`updateProfile`/`recordRegistrationConsent`, mirroring the exact real
 * signup contract `frontend/src/pages/Auth.jsx` uses (`backend/routes/users.js:36-93,
 * 96-138,311-360`). Phase 4 adds `getUsage` (the tier/entitlement source of truth every
 * screen needs for server-verified feature gating — Golden Rule #4: never trust a locally
 * cached tier value as the enforcement decision) — confirmed at
 * `backend/routes/users.js` (`GET /users/usage`).
 *
 * Deliberately NOT covered here (confirmed to exist in `users.js` but out of Phase 5's
 * stated scope — settings/profile + dashboard/report/tier screens only): account
 * deletion, login history, organization info, API keys, logo upload, onboarding-step
 * tracking. Add typed wrappers for these only when a phase actually needs the screen that
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

  /** Thin, explicitly-named wrapper over `updateProfile` for the one field a
   * notification-settings screen needs to change — kept separate so that call site reads
   * as "update notification prefs," not "update profile with some object." */
  updateNotificationPreferences: (notifications: NotificationPreferences) =>
    apiRequest<{ success: true; message: string; updates: unknown }>('/users/profile', {
      method: 'PUT',
      body: { notifications },
    }),
};
