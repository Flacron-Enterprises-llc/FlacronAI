/**
 * Typed wrappers for the `users/profile`-adjacent endpoints Phase 3 needs. Mirrors the
 * exact real signup contract used by `frontend/src/pages/Auth.jsx` (`getProfile()` →
 * `updateProfile()` → `recordRegistrationConsent()`), not just the endpoints' own docs —
 * see `backend/routes/users.js:36-93,96-138,311-360`.
 */
import { apiRequest } from './client';
import type { UserProfile } from '@/features/auth/types';

export const usersApi = {
  getProfile: () => apiRequest<{ success: true; user: UserProfile }>('/users/profile'),

  updateProfile: (data: Partial<Pick<UserProfile, 'displayName' | 'firstName' | 'lastName' | 'company'>>) =>
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
};
