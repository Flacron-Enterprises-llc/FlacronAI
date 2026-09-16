/** Feature-local auth types (see src/features/README.md convention). */

/** Per-category opt-out notification preferences (`backend/utils/notificationPrefs.js`) —
 * all default `true` (opt-out, not opt-in) when absent. Read/written through
 * `GET`/`PUT /users/profile`'s `notifications` field, not a dedicated endpoint (Phase 4
 * confirmed no such endpoint exists — see `services/api/notifications.ts`). */
export interface NotificationPreferences {
  reportCompleted?: boolean;
  analysisCompleted?: boolean;
  reviewRequested?: boolean;
  reportApproved?: boolean;
  reportShared?: boolean;
  billing?: boolean;
}

/** The backend `users/{uid}` profile shape, narrowed to the fields this app reads/writes.
 * Mirrors `backend/routes/users.js`'s profile doc — not exhaustive (this app doesn't need
 * every admin/enterprise field the web dashboard shows). Extended in Phase 4
 * (`services/api/users.ts`) with the fields `PUT /users/profile` actually accepts and the
 * legacy/granular notification-preference fields, beyond the Phase 3 subset. */
export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  address?: string;
  tier?: 'starter' | 'professional' | 'agency' | 'enterprise';
  mfaEnabled?: boolean;
  onboardingCompleted?: boolean;
  /** Legacy account-creation-time flag, distinct from the granular `notifications` object
   * below — an account that never called `PUT /users/profile` with `notifications` will
   * have this but not that (confirmed in `backend/routes/users.js`). */
  notificationsEnabled?: boolean;
  /** Only present once the account has called `PUT /users/profile` with this field at
   * least once — the backend does not backfill defaults on `GET`. Callers must apply their
   * own defaults (all opt-out categories default to enabled) when this is absent. */
  notifications?: NotificationPreferences;
}

/** Auth flow state derived from Firebase + the backend profile — computed in
 * AuthProvider, consumed by route guards and screens. Never derived twice independently. */
export type AuthStatus =
  | 'loading'
  | 'signed-out'
  | 'needs-email-verification'
  | 'needs-mfa'
  | 'profile-unavailable'
  | 'authenticated';

export interface SignUpFormValues {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  password: string;
  confirmPassword: string;
  agreedToTerms: boolean;
}

export interface LoginFormValues {
  email: string;
  password: string;
}
