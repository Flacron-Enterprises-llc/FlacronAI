/** Feature-local auth types (see src/features/README.md convention). */

/** The backend `users/{uid}` profile shape, narrowed to the fields Phase 3 reads/writes.
 * Mirrors `backend/routes/users.js`'s profile doc — not exhaustive (report counters, tier
 * limits, etc. are out of scope until Phase 4/5). */
export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  tier?: 'starter' | 'professional' | 'agency' | 'enterprise';
  mfaEnabled?: boolean;
  onboardingCompleted?: boolean;
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
