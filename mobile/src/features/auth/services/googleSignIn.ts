/**
 * Native Google Sign-In, credential-exchanged into Firebase — replaces web's
 * `signInWithPopup`, which is browser-only and does not exist in React Native (see
 * AUTHENTICATION_ARCHITECTURE.md §5.9).
 *
 * REQUIRES AN EAS DEVELOPMENT BUILD, NOT EXPO GO: `@react-native-google-signin/google-signin`
 * is a native (TurboModule) package with no Expo Go support — Expo Go cannot load
 * arbitrary third-party native modules. Attempting to use it inside Expo Go throws
 * immediately from the native layer. This file therefore never statically imports that
 * package (a static import would be evaluated — and crash — the moment ANY screen that
 * imports this file loads, even in Expo Go, even if Google Sign-In is never used). Instead
 * it lazily `require()`s the package only inside `signInWithGoogle()`, which itself is
 * only ever called once `isGoogleSignInConfigured()` is true and the button that calls it
 * is enabled — see SocialSignInButtons.tsx.
 *
 * CONFIGURATION-GATED, NOT COMPLETE: no Google OAuth client ID has been supplied yet (that
 * requires Firebase/Google Cloud console access — see AUTHENTICATION_ARCHITECTURE.md §7,
 * a manual step outside this codebase). `isGoogleSignInConfigured()` is false until
 * `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is set, and the UI must treat that as "blocked," never
 * silently attempt a sign-in with a missing client ID.
 */
import { GoogleAuthProvider, signInWithCredential, type UserCredential } from 'firebase/auth';

import { getFirebaseAuth } from '@/services/firebase/client';

export type GoogleSignInOutcome = { status: 'success'; credential: UserCredential } | { status: 'cancelled' };

/** True only once a real Google Web Client ID has been supplied (see .env.example). This
 * does NOT mean a development build is available — see `README.md` "Expo Go vs.
 * development build" for that separate, non-configurable constraint. */
export function isGoogleSignInConfigured(): boolean {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  return !!webClientId && webClientId.trim().length > 0;
}

export async function signInWithGoogle(): Promise<GoogleSignInOutcome> {
  if (!isGoogleSignInConfigured()) {
    throw new Error(
      'Google Sign-In is not configured yet (missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID). ' +
        'This requires a Google OAuth client ID from Firebase/Google Cloud console — see ' +
        'AUTHENTICATION_ARCHITECTURE.md §7.'
    );
  }

  // Lazy require — see file header. Throws immediately in Expo Go; only reached when a
  // development build is running AND configuration is present.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = require('@react-native-google-signin/google-signin');

  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    ...(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ? { iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID } : {}),
  });

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();

    if (!isSuccessResponse(response)) {
      return { status: 'cancelled' };
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      throw new Error('Google did not return an ID token. Please try again.');
    }

    const firebaseCredential = GoogleAuthProvider.credential(idToken);
    const credential = await signInWithCredential(getFirebaseAuth(), firebaseCredential);
    return { status: 'success', credential };
  } catch (err) {
    // `require()`d above, so these helpers are untyped (`any`) — cast explicitly rather
    // than relying on `isErrorWithCode`'s type-predicate narrowing, which TS can't apply
    // through an `any`-typed call.
    const code = isErrorWithCode(err) ? (err as { code?: string }).code : undefined;
    if (code === statusCodes.SIGN_IN_CANCELLED) {
      return { status: 'cancelled' };
    }
    throw err;
  }
}
