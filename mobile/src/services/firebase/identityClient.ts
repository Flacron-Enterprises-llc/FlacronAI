/**
 * Second, AUTH-ONLY Firebase app for QA federation (see config/identityConfig.ts).
 *
 * Used solely to sign in to the production identity project and to obtain fresh ID
 * tokens for the staging exchange. The app never calls sign-up, password, email-change
 * or delete APIs on it — with one exception: rolling back a production account that a
 * first-time Google sign-in just created (see federatedLogin.ts). Persisted like the
 * main app, so the staging session can be re-exchanged after a restart while production
 * still accepts this sign-in.
 */
import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import { getReactNativePersistence, initializeAuth } from '@firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getIdentityFirebaseConfig } from '@/config/identityConfig';

export const IDENTITY_APP_NAME = 'prod-identity';

let identityAuth: Auth | null = null;

function getIdentityApp(): FirebaseApp {
  return getApps().find((a) => a.name === IDENTITY_APP_NAME) ?? initializeApp(getIdentityFirebaseConfig(), IDENTITY_APP_NAME);
}

export function getIdentityAuth(): Auth {
  if (identityAuth) return identityAuth;
  identityAuth = initializeAuth(getIdentityApp(), { persistence: getReactNativePersistence(AsyncStorage) });
  return identityAuth;
}
