/**
 * Resolves and validates the Firebase Web SDK config for the mobile app.
 *
 * Mirrors env.ts's fail-fast style: only EXPO_PUBLIC_*-prefixed variables are read
 * (Metro inlines these into the JS bundle — treat every value as PUBLICLY VISIBLE, same
 * as a web Firebase config object already is). This is the standard, public "apiKey" a
 * Firebase client app ships with — it identifies the project, it does not grant elevated
 * access on its own (Firestore/Storage/Auth rules are the real access boundary) — but it
 * is still only valid once an iOS/Android "app" has actually been registered against the
 * flacronai Firebase project (see MOBILE_DEVELOPMENT_PHASES.md Phase 3 scope). As of this
 * phase these values have not been supplied yet, so this module fails clearly instead of
 * initializing Firebase with empty/placeholder strings, which would fail in much more
 * confusing ways deep inside the Firebase SDK.
 *
 * Unlike env.ts's API base URL, there is no "safe local default" for a Firebase config —
 * either the real project config is present, or auth genuinely cannot work. Callers
 * should check `isFirebaseConfigured()` up front and render a clear "Configuration
 * required" state (see features/auth/screens/ConfigRequiredScreen.tsx) rather than
 * calling getFirebaseConfig() and letting it throw during render.
 */

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const REQUIRED_KEYS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
] as const;

function readRaw() {
  return {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
}

/** True only when every required EXPO_PUBLIC_FIREBASE_* value is present and non-empty. */
export function isFirebaseConfigured(): boolean {
  const raw = readRaw();
  return Object.values(raw).every((value) => !!value && value.trim().length > 0);
}

/** Which of the required variable names are currently missing — for a clear diagnostic UI. */
export function missingFirebaseConfigKeys(): string[] {
  const raw = readRaw();
  const values: Record<string, string | undefined> = {
    EXPO_PUBLIC_FIREBASE_API_KEY: raw.apiKey,
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: raw.authDomain,
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: raw.projectId,
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: raw.storageBucket,
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: raw.messagingSenderId,
    EXPO_PUBLIC_FIREBASE_APP_ID: raw.appId,
  };
  return REQUIRED_KEYS.filter((key) => !values[key] || values[key]!.trim().length === 0);
}

/**
 * Resolves the Firebase config, throwing a clear error if incomplete. Only call this once
 * `isFirebaseConfigured()` is true (or you want the descriptive throw as a last resort —
 * e.g. a background service that must fail loudly rather than silently no-op).
 */
export function getFirebaseConfig(): FirebaseWebConfig {
  const raw = readRaw();
  const missing = missingFirebaseConfigKeys();
  if (missing.length > 0) {
    throw new Error(
      `Missing Firebase config: ${missing.join(', ')}. This app's iOS/Android "app" has ` +
        'not been registered against the flacronai Firebase project yet, or .env.local is ' +
        'not populated. See mobile/AUTHENTICATION_ARCHITECTURE.md and mobile/README.md.'
    );
  }
  return {
    apiKey: raw.apiKey!,
    authDomain: raw.authDomain!,
    projectId: raw.projectId!,
    storageBucket: raw.storageBucket!,
    messagingSenderId: raw.messagingSenderId!,
    appId: raw.appId!,
  };
}
