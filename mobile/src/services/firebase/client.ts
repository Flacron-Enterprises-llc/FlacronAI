/**
 * Firebase client initialization for the mobile app.
 *
 * Reuses the SAME Firebase project as the web app (see
 * AUTHENTICATION_ARCHITECTURE.md §4) — Firebase remains the single identity provider for
 * both clients. Session persistence uses Firebase's own documented React Native pattern
 * (`getReactNativePersistence` + AsyncStorage) rather than anything hand-rolled — see
 * AUTHENTICATION_ARCHITECTURE.md §6 for the accepted AsyncStorage trade-off (Firebase's
 * session blob is stored unencrypted, OS-sandboxed, same posture as the vast majority of
 * production RN apps using this exact SDK pattern).
 *
 * This module intentionally initializes lazily (`getFirebaseAuth()`), not at import time —
 * `isFirebaseConfigured()` can be false during local development before a real Firebase
 * config is supplied, and initializing with empty strings would throw a much less clear
 * error from deep inside the SDK than `firebaseConfig.ts`'s own explicit check.
 *
 * `initializeAuth`/`getReactNativePersistence` are imported from `@firebase/auth`
 * (installed as an explicit direct dependency), NOT from the `firebase/auth` wrapper
 * used everywhere else in this app. This is a deliberate, verified workaround for a real
 * gap in the `firebase` npm package's own `exports` map: `firebase/auth`'s entry point is
 * just `export * from '@firebase/auth'`, which resolves the RN-specific build correctly
 * AT RUNTIME (Metro re-evaluates package-exports conditions, including `react-native`,
 * fresh for that nested bare specifier) — but `firebase`'s own top-level "./auth" exports
 * map has no `react-native` condition on its "types" entry, so TypeScript statically
 * resolves `getReactNativePersistence` to the generic/browser `.d.ts`, which doesn't
 * declare it (confirmed by inspecting both packages' `exports` maps directly; matches
 * multiple long-standing firebase-js-sdk GitHub issues). Importing straight from
 * `@firebase/auth` sidesteps the gap entirely rather than papering over it with an
 * ambient `.d.ts` override that could silently drift from the real runtime behavior.
 */
import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import { getReactNativePersistence, initializeAuth } from '@firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getFirebaseConfig } from '@/config/firebaseConfig';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function getApp(): FirebaseApp {
  if (app) return app;
  // Re-use an already-initialized app if one exists (Fast Refresh in dev can otherwise
  // throw "Firebase App named '[DEFAULT]' already exists").
  const existing = getApps();
  app = existing.length > 0 ? existing[0] : initializeApp(getFirebaseConfig());
  return app;
}

/** The shared Firebase Auth instance, initialized once with RN persistence. */
export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  auth = initializeAuth(getApp(), {
    persistence: getReactNativePersistence(AsyncStorage),
  });
  return auth;
}
