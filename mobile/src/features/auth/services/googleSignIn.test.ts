import { isGoogleSignInConfigured, signInWithGoogle } from './googleSignIn';

/**
 * Only the "not configured" path is exercised here (this repo's actual current state —
 * no Google OAuth client ID exists yet). Mutating `process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
 * at test runtime cannot flip this to "configured" within Jest, because Expo's Babel
 * pipeline statically inlines that exact `process.env.EXPO_PUBLIC_*` literal at transform
 * time — see the detailed explanation in `src/config/firebaseConfig.test.ts`'s header,
 * which applies identically here.
 */
describe('isGoogleSignInConfigured', () => {
  it('is false when EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is unset — the real, current state (no Google OAuth client exists yet)', () => {
    expect(isGoogleSignInConfigured()).toBe(false);
  });
});

describe('signInWithGoogle — configuration gating', () => {
  it('throws a clear, actionable error and never attempts to load the native module when unconfigured', async () => {
    // If this reached the lazy require() of @react-native-google-signin/google-signin, it
    // would throw a native-module/TurboModuleRegistry error instead (that package isn't
    // mocked here on purpose — this test's whole point is proving that path is never
    // reached before configuration exists, mirroring the real Expo Go crash risk).
    await expect(signInWithGoogle()).rejects.toThrow(/not configured/i);
  });
});
