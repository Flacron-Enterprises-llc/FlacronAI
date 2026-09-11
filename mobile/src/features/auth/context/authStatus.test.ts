import { computeAuthStatus, type AuthStatusInput } from './authStatus';
import type { UserProfile } from '../types';

const baseProfile: UserProfile = { uid: 'u1', email: 'user@example.com', tier: 'starter' };

const base: AuthStatusInput = {
  loading: false,
  hasFirebaseUser: true,
  profileLoading: false,
  profileError: null,
  userProfile: baseProfile,
  emailVerified: true,
  isSocialProvider: false,
  mfaVerified: false,
};

describe('computeAuthStatus — the single source of truth behind every route guard', () => {
  it('is "loading" while the first Firebase auth-state resolution is still pending, regardless of everything else', () => {
    expect(computeAuthStatus({ ...base, loading: true, hasFirebaseUser: false, userProfile: null })).toBe('loading');
  });

  it('is "signed-out" once loading resolves with no Firebase user (session restoration found nothing)', () => {
    expect(computeAuthStatus({ ...base, hasFirebaseUser: false, userProfile: null })).toBe('signed-out');
  });

  it('stays "loading" (not "profile-unavailable") while a blocking profile fetch is in flight right after sign-in', () => {
    expect(computeAuthStatus({ ...base, profileLoading: true, userProfile: null, profileError: null })).toBe('loading');
  });

  it('is "profile-unavailable" once the profile fetch has genuinely failed (not merely still loading)', () => {
    expect(
      computeAuthStatus({ ...base, profileLoading: false, userProfile: null, profileError: 'boom' })
    ).toBe('profile-unavailable');
  });

  it('is "profile-unavailable" even without an explicit error string, if the profile is simply missing post-load', () => {
    expect(computeAuthStatus({ ...base, profileLoading: false, userProfile: null, profileError: null })).toBe(
      'profile-unavailable'
    );
  });

  it('blocks an unverified email/password user behind "needs-email-verification"', () => {
    expect(computeAuthStatus({ ...base, emailVerified: false, isSocialProvider: false })).toBe(
      'needs-email-verification'
    );
  });

  it('does NOT block a Google/Apple-authenticated user on email verification, even if emailVerified is false', () => {
    expect(computeAuthStatus({ ...base, emailVerified: false, isSocialProvider: true })).toBe('authenticated');
  });

  it('routes an MFA-enabled, not-yet-verified-this-session user to "needs-mfa"', () => {
    expect(
      computeAuthStatus({ ...base, userProfile: { ...baseProfile, mfaEnabled: true }, mfaVerified: false })
    ).toBe('needs-mfa');
  });

  it('does not re-block an MFA-enabled account once mfaVerified is true for this session', () => {
    expect(
      computeAuthStatus({ ...base, userProfile: { ...baseProfile, mfaEnabled: true }, mfaVerified: true })
    ).toBe('authenticated');
  });

  it('checks email verification BEFORE MFA — an unverified MFA account is not prematurely sent to the MFA screen', () => {
    expect(
      computeAuthStatus({
        ...base,
        emailVerified: false,
        isSocialProvider: false,
        userProfile: { ...baseProfile, mfaEnabled: true },
        mfaVerified: false,
      })
    ).toBe('needs-email-verification');
  });

  it('is "authenticated" only once every gate is satisfied', () => {
    expect(computeAuthStatus(base)).toBe('authenticated');
  });
});
