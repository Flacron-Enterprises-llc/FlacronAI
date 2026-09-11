/**
 * Sign in with Apple, credential-exchanged into Firebase (AUTHENTICATION_ARCHITECTURE.md
 * §5.10). Per Apple App Store policy, this must be offered on iOS wherever Google
 * Sign-In is offered — see SocialSignInButtons.tsx.
 *
 * Unlike Google Sign-In, `expo-apple-authentication` is a first-party Expo SDK module that
 * degrades gracefully to "unavailable" (never throws) when its native module is missing —
 * confirmed by reading its own source (`ExpoAppleAuthentication.js`'s
 * `requireOptionalNativeModule` fallback). It is therefore safe to import statically and
 * IS testable directly in Expo Go on iOS (Apple's own docs: "You can test this library in
 * Expo Go on iOS without following any of the instructions above") — but the identifiers
 * Apple returns in Expo Go will differ from a real standalone build, and completing an
 * actual Firebase sign-in additionally requires the Apple Developer "Sign In with Apple"
 * capability plus Firebase console Apple-provider configuration (AUTHENTICATION_ARCHITECTURE.md
 * §7), neither of which exists yet — so this is "prepared and implemented," not
 * functionally complete, until that manual console/portal configuration is done.
 */
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { OAuthProvider, signInWithCredential, type UserCredential } from 'firebase/auth';

import { getFirebaseAuth } from '@/services/firebase/client';

export type AppleSignInOutcome = { status: 'success'; credential: UserCredential } | { status: 'cancelled' };

/** iOS only — Apple has no Android/web equivalent. Also false on the iOS Simulator for
 * `getCredentialStateAsync` per Apple's own docs, but `isAvailableAsync`/`signInAsync`
 * themselves work on-simulator; the real gate here is device OS support. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

export async function signInWithApple(): Promise<AppleSignInOutcome> {
  if (Platform.OS !== 'ios') {
    throw new Error('Sign in with Apple is only available on iOS.');
  }

  // Anti-replay nonce (Apple + Firebase's documented native-iOS pattern): generate a fresh
  // random raw nonce per sign-in attempt, send Apple only its SHA-256 hash (Apple embeds
  // that hash, unmodified, as the identity token's `nonce` claim), then hand Firebase the
  // original raw value. `signInWithCredential` re-hashes it and checks the match itself —
  // this is what binds one specific identity token to one specific request and prevents an
  // intercepted-but-otherwise-valid token from being replayed into a later sign-in call.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let appleCredential;
  try {
    appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'ERR_REQUEST_CANCELED') {
      return { status: 'cancelled' };
    }
    throw err;
  }

  if (!appleCredential.identityToken) {
    throw new Error('Apple did not return an identity token. Please try again.');
  }

  const provider = new OAuthProvider('apple.com');
  const firebaseCredential = provider.credential({
    idToken: appleCredential.identityToken,
    rawNonce,
  });

  const credential = await signInWithCredential(getFirebaseAuth(), firebaseCredential);
  return { status: 'success', credential };
}
