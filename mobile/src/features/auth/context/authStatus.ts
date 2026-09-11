import type { AuthStatus, UserProfile } from '../types';

export interface AuthStatusInput {
  loading: boolean;
  hasFirebaseUser: boolean;
  profileLoading: boolean;
  profileError: string | null;
  userProfile: UserProfile | null;
  emailVerified: boolean;
  isSocialProvider: boolean;
  mfaVerified: boolean;
}

/**
 * The single, pure decision function behind every route guard in `app/_layout.tsx` and
 * every screen's own gating logic. Extracted out of `AuthProvider` so it can be unit
 * tested without mounting React or touching the Firebase SDK — this function alone
 * encodes "auth-state restoration," "unverified-user blocking," and "MFA routing," the
 * exact three route-guard-decision categories the Phase 3 test requirements call out.
 *
 * Order matters and is deliberate — mirrors `ProtectedRoute.jsx`'s exact gate ordering:
 * loading → signed-out → (blocking) profile fetch in flight → profile genuinely
 * unavailable → email verification → MFA → authenticated.
 */
export function computeAuthStatus(input: AuthStatusInput): AuthStatus {
  if (input.loading) return 'loading';
  if (!input.hasFirebaseUser) return 'signed-out';
  // A blocking profile fetch is in flight (e.g. right after a fresh sign-in) — keep the
  // splash/loading state rather than briefly showing the "Account data unavailable" retry
  // screen, which is reserved for a genuine failure (profileError set) below.
  if (input.profileLoading && !input.userProfile) return 'loading';
  if (input.profileError || !input.userProfile) return 'profile-unavailable';
  if (!input.emailVerified && !input.isSocialProvider) return 'needs-email-verification';
  if (input.userProfile.mfaEnabled && !input.mfaVerified) return 'needs-mfa';
  return 'authenticated';
}
