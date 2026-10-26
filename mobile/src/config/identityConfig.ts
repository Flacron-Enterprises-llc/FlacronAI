/**
 * QA federation: which Firebase project PROVES WHO THE USER IS.
 *
 * The `qa` build sets these to the PRODUCTION project's public web config so existing
 * FlacronAI website accounts can sign in, while EXPO_PUBLIC_FIREBASE_* and
 * EXPO_PUBLIC_API_BASE_URL stay staging: the backend exchanges the production sign-in
 * for a short-lived staging session (backend/services/federatedIdentity.js), and every
 * profile, report, file, bill and notification stays in staging. When these are unset
 * (every other build) the app signs in directly to its own Firebase project as before.
 *
 * Literal `process.env.EXPO_PUBLIC_*` reads only — Expo inlines exactly these at build time.
 */
import type { FirebaseWebConfig } from './firebaseConfig';

export const WEBSITE_URL = 'https://flacronai.com';
export const WEBSITE_LOGIN_URL = `${WEBSITE_URL}/login`;
export const WEBSITE_SIGNUP_URL = `${WEBSITE_URL}/signup`;

function readIdentityRaw() {
  return {
    apiKey: process.env.EXPO_PUBLIC_IDENTITY_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_IDENTITY_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_IDENTITY_FIREBASE_PROJECT_ID,
    appId: process.env.EXPO_PUBLIC_IDENTITY_FIREBASE_APP_ID,
  };
}

/** True only when the full identity config is present AND names a different project. */
export function isFederatedLoginEnabled(): boolean {
  const raw = readIdentityRaw();
  const complete = Object.values(raw).every((v) => !!v && v.trim().length > 0);
  return complete && raw.projectId !== process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
}

/** Auth-only config for the identity project (no storage/messaging: nothing else is used). */
export function getIdentityFirebaseConfig(): Pick<FirebaseWebConfig, 'apiKey' | 'authDomain' | 'projectId'> & { appId: string } {
  if (!isFederatedLoginEnabled()) throw new Error('Federated sign-in is not configured for this build.');
  const raw = readIdentityRaw();
  return { apiKey: raw.apiKey!, authDomain: raw.authDomain!, projectId: raw.projectId!, appId: raw.appId! };
}
