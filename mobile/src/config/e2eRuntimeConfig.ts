/**
 * Phase 10 cloud device tests — launch-time endpoint configuration for the e2e TEST build.
 *
 * Free Cloudflare quick tunnels live 40–100 min, shorter than an EAS build, so the test build
 * cannot bake tunnel URLs in. Instead it reads them from the launch link
 * `flacronai://e2e-config?api=<https origin>&auth=<https origin>` before Firebase or the API client
 * initialise. Doubly gated: only when EXPO_PUBLIC_APP_ENV is `development` AND the e2e-only build
 * flag EXPO_PUBLIC_E2E_RUNTIME_CONFIG is `1` (set solely by the `e2e` profile in eas.json).
 * Preview/production builds never read the link.
 */
import * as Linking from 'expo-linking';

import { setE2EEndpoints, type E2EEndpoints } from './e2eOverride';
import type { AppEnv } from './env';

/** Pure gate — unit-tested. */
export function isE2ERuntimeConfigEnabled(appEnv: AppEnv, flag: string | undefined): boolean {
  return appEnv === 'development' && flag === '1';
}

function httpsOrigin(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' ? `${u.protocol}//${u.host}` : null;
  } catch {
    return null;
  }
}

/** Parses the config link; null unless it is exactly the expected shape with two HTTPS origins. */
export function parseE2EConfigUrl(url: string | null): E2EEndpoints | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const target = `${u.hostname}${u.pathname}`.replace(/\/+$/, '');
  if (u.protocol !== 'flacronai:' || target !== 'e2e-config') return null;
  const apiOrigin = httpsOrigin(u.searchParams.get('api'));
  const authEmulatorOrigin = httpsOrigin(u.searchParams.get('auth'));
  return apiOrigin && authEmulatorOrigin ? { apiOrigin, authEmulatorOrigin } : null;
}

/** Reads the launch link once (e2e build only). Never throws. */
export async function loadE2EConfigFromLaunchUrl(appEnv: AppEnv): Promise<void> {
  if (!isE2ERuntimeConfigEnabled(appEnv, process.env.EXPO_PUBLIC_E2E_RUNTIME_CONFIG)) return;
  try {
    setE2EEndpoints(parseE2EConfigUrl(await Linking.getInitialURL()));
  } catch {
    setE2EEndpoints(null);
  }
}
