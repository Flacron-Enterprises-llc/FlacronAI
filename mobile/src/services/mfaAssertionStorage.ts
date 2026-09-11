/**
 * Keychain/Keystore-backed storage for the short-lived backend-signed MFA session
 * assertion (see backend `AUTHENTICATION_ARCHITECTURE.md` §12). This is the one thing
 * this app caches itself beyond Firebase's own managed session (see
 * `mobile/src/services/README.md`'s existing note on when `expo-secure-store` would be
 * warranted) — a bearer credential, so it belongs in SecureStore, never AsyncStorage.
 *
 * Deliberately a single-purpose module (one key, three functions) rather than a general
 * secure-storage abstraction — there is exactly one thing that needs this today.
 */
import * as SecureStore from 'expo-secure-store';

const MFA_ASSERTION_KEY = 'flac_mfa_assertion';

export async function getMfaAssertion(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(MFA_ASSERTION_KEY);
  } catch {
    return null;
  }
}

export async function setMfaAssertion(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(MFA_ASSERTION_KEY, token);
  } catch {
    // Storage unavailable — the assertion simply won't be attached to later requests,
    // which fails safely closed (protected routes will 403 MFA_REQUIRED, not silently
    // pass).
  }
}

export async function clearMfaAssertion(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(MFA_ASSERTION_KEY);
  } catch {
    // Nothing to do — see setMfaAssertion.
  }
}
