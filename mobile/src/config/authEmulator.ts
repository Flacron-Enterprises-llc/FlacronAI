/**
 * Firebase Auth EMULATOR hook — development builds only (Phase 10 cloud device tests).
 *
 * The end-to-end test build signs in against a local Firebase Auth emulator (reached through a
 * temporary tunnel) so no production Firebase project is involved. `preview` and `production`
 * builds ignore the variable completely, so a stray value can never point a release build at an
 * emulator.
 */
import { getE2EEndpoints } from './e2eOverride';
import type { AppEnv } from './env';

/** Returns the emulator URL to connect to, or null. Pure — unit-tested. */
export function resolveAuthEmulatorUrl(appEnv: AppEnv, raw: string | undefined): string | null {
  if (appEnv !== 'development') return null;
  const value = (raw ?? '').trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** Literal `process.env.EXPO_PUBLIC_…` access so Expo inlines it at build time. */
export function readAuthEmulatorUrl(): string | undefined {
  // Launch-time e2e override wins (set only in the gated e2e test build).
  return getE2EEndpoints()?.authEmulatorOrigin ?? process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_URL;
}
