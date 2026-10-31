/**
 * Web build of the Firebase client (Metro picks `.web.ts` for the web platform only; Android/iOS keep client.ts).
 * `getReactNativePersistence` doesn't exist in Firebase's browser build, so the web target uses browser local
 * persistence instead. Used for Expo web previews / visual review; same app, config and emulator rules as native.
 */
import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, initializeAuth, type Auth } from 'firebase/auth';

import { readAuthEmulatorUrl, resolveAuthEmulatorUrl } from '@/config/authEmulator';
import { getAppEnv } from '@/config/env';
import { getFirebaseConfig } from '@/config/firebaseConfig';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function getApp(): FirebaseApp {
  if (app) return app;
  const existing = getApps().find((a) => a.name === '[DEFAULT]');
  app = existing ?? initializeApp(getFirebaseConfig());
  return app;
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  auth = initializeAuth(getApp(), { persistence: browserLocalPersistence });
  const emulatorUrl = resolveAuthEmulatorUrl(getAppEnv(), readAuthEmulatorUrl());
  if (emulatorUrl) connectAuthEmulator(auth, emulatorUrl, { disableWarnings: true });
  return auth;
}
