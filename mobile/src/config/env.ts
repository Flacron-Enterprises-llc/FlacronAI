/**
 * Centralized, fail-fast environment configuration for the mobile app.
 *
 * Only EXPO_PUBLIC_*-prefixed variables are read here — Metro inlines these into the
 * JS bundle at build time, so treat every value returned from this module as PUBLICLY
 * VISIBLE inside the shipped app binary. Never read or reference a non-EXPO_PUBLIC_*
 * variable from mobile app code (see MOBILE_DEVELOPMENT_PHASES.md §9).
 *
 * This module intentionally does not build an API client (that's Phase 4) — it only
 * resolves and validates which environment the app is running in and what API origin it
 * should use, failing loudly instead of silently defaulting to an incorrect (or
 * production) origin. See MOBILE_DEVELOPMENT_PHASES.md Phase 2 / Phase 2 addendum and
 * WEB_TO_MOBILE_REUSE_STRATEGY.md §2.2 for why the production API origin cannot be
 * hardcoded here: it has not been confirmed as of Phase 2.
 *
 * IMPORTANT — "localhost" is NOT a universal mobile dev address (Phase 2 addendum):
 * `http://localhost:3000` only reaches a backend running on the SAME machine as the
 * process a client connects from. That is true for the iOS Simulator and for the Expo
 * web target, but it is NOT true for the Android Emulator (whose virtual network maps
 * the host machine to `10.0.2.2`, not `localhost`) and NOT true for a physical phone
 * (which needs the development machine's current LAN IP, or a tunnel — a LAN IP changes
 * between networks/reboots and must never be hardcoded here). See
 * mobile/README.md "Running on different targets" for the exact value to set per target.
 *
 * This module deliberately does not attempt to auto-detect which of those targets the
 * app is running on (that would require importing `react-native`'s `Platform`, which
 * would stop this file from being a plain, dependency-free, directly-testable module —
 * see mobile/src/config/README.md). Instead, it validates whatever URL is supplied and
 * fails clearly when a value is missing or clearly wrong for the environment, and the
 * README documents the exact value for each target.
 */

export type AppEnv = 'development' | 'preview' | 'production';

const VALID_APP_ENVS: readonly AppEnv[] = ['development', 'preview', 'production'];

/** Loopback and RFC1918 private-use IPv4 ranges, plus the Android Emulator/Genymotion
 * host aliases (10.0.2.2 / 10.0.3.2, both already covered by the 10.0.0.0/8 pattern).
 * Deliberately simple hostname/pattern matching — no DNS resolution, no IP-math library. */
const PRIVATE_IPV4_PATTERNS: readonly RegExp[] = [
  /^127\./, // loopback (127.0.0.0/8)
  /^10\./, // 10.0.0.0/8 — includes Android Emulator 10.0.2.2 and Genymotion 10.0.3.2
  /^172\.(1[6-9]|2\d|3[0-1])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
];

/** RFC 2606-reserved TLDs that can never be a real production domain — checked against
 * the parsed hostname, not the raw URL string (a real URL always has a path after the
 * host, e.g. ".../api/v1", so a suffix check against the whole string would never match). */
const PLACEHOLDER_TLDS: readonly string[] = ['invalid', 'example', 'test'];

/** Free-form placeholder markers — checked against the raw URL string since these can
 * appear anywhere in it (e.g. in a subdomain), not just as a TLD. */
const PLACEHOLDER_SUBSTRING_PATTERNS: readonly RegExp[] = [
  /replace[_-]?with/i,
  /your[_-]?(api|domain|origin|backend)/i,
  /change[_-]?me/i,
  /\btodo\b/i,
  /\bxxx+\b/i,
];

/** True for localhost, IPv6 loopback, and any RFC1918 private IPv4 address/emulator alias. */
export function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0') return true;
  return PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(host));
}

/**
 * True if the URL looks like a placeholder rather than a real, confirmed origin.
 * `hostname` should be the already-parsed URL's hostname (see getApiBaseUrl) so the
 * RFC 2606 TLD check is applied to the actual host, not the whole URL string.
 */
export function looksLikePlaceholder(rawUrl: string, hostname: string): boolean {
  if (PLACEHOLDER_SUBSTRING_PATTERNS.some((pattern) => pattern.test(rawUrl))) return true;
  const host = hostname.toLowerCase();
  return PLACEHOLDER_TLDS.some((tld) => host === tld || host.endsWith(`.${tld}`));
}

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function readRawAppEnv(): string | undefined {
  return process.env.EXPO_PUBLIC_APP_ENV;
}

function readRawApiBaseUrl(): string | undefined {
  return process.env.EXPO_PUBLIC_API_BASE_URL;
}

/**
 * Resolves and validates EXPO_PUBLIC_APP_ENV.
 * Throws (rather than assuming "development") if it is unset or unrecognized, so a
 * misconfigured build fails immediately and visibly instead of silently behaving like
 * the wrong environment.
 */
export function getAppEnv(): AppEnv {
  const raw = readRawAppEnv();
  if (!raw) {
    throw new Error(
      'Missing EXPO_PUBLIC_APP_ENV. Set it in .env.local for local development (copy ' +
        'from .env.example), or as an EAS environment variable for preview/production ' +
        `builds. Valid values: ${VALID_APP_ENVS.join(', ')}. See mobile/README.md ` +
        '"Environment configuration".'
    );
  }
  if (!(VALID_APP_ENVS as readonly string[]).includes(raw)) {
    throw new Error(
      `Invalid EXPO_PUBLIC_APP_ENV "${raw}". Valid values: ${VALID_APP_ENVS.join(', ')}.`
    );
  }
  return raw as AppEnv;
}

/**
 * Resolves and validates EXPO_PUBLIC_API_BASE_URL for the current environment.
 *
 * development:
 * - Missing → falls back to `http://localhost:3000/api/v1`. This fallback is explicitly
 *   scoped to same-machine targets (iOS Simulator, Expo web) — it is NOT valid for the
 *   Android Emulator or a physical device, both of which must set
 *   EXPO_PUBLIC_API_BASE_URL explicitly (see mobile/README.md). This module cannot detect
 *   which target is running (see file header), so it cannot fail this case automatically
 *   — the fallback is the documented, restricted default, not a claim that it works
 *   everywhere.
 * - Present → must be a syntactically valid URL. Plain HTTP is allowed only when the host
 *   is a recognized local/private development target (localhost, 127.0.0.1, the Android
 *   Emulator/Genymotion host aliases, or an RFC1918 private LAN address) — HTTP to any
 *   other host throws, since that would send API traffic in the clear to a public host.
 *
 * preview / production:
 * - No fallback of any kind. Throws on a missing value, an unparseable URL, a
 *   placeholder-shaped value, a non-HTTPS URL, or a localhost/emulator/private-LAN host —
 *   none of those can ever be a real, publicly reachable production/preview origin. The
 *   real backend origin has not been confirmed in this repository as of Phase 2
 *   (`flacronai.com` was directly verified on 2026-09-08 to be Vercel's static frontend,
 *   not a reverse-proxied backend — see MOBILE_DEVELOPMENT_PHASES.md §10 item 1) — a
 *   real, confirmed HTTPS value must be supplied explicitly via an EAS environment
 *   variable before a preview/production build can use this function without throwing.
 */
export function getApiBaseUrl(): string {
  const appEnv = getAppEnv();
  const raw = readRawApiBaseUrl();
  const hasRaw = !!raw && raw.trim().length > 0;

  if (appEnv === 'development') {
    if (!hasRaw) {
      // Documented, restricted fallback — see the development JSDoc block above and
      // mobile/README.md "Running on different targets". Not valid for every device.
      return 'http://localhost:3000/api/v1';
    }

    const parsed = parseUrl(raw as string);
    if (!parsed) {
      throw new Error(
        `EXPO_PUBLIC_API_BASE_URL ("${raw}") is not a valid URL. See mobile/README.md ` +
          '"Environment configuration".'
      );
    }
    if (parsed.protocol === 'http:' && !isLocalOrPrivateHost(parsed.hostname)) {
      throw new Error(
        `EXPO_PUBLIC_API_BASE_URL uses plain HTTP for a non-local host ("${parsed.hostname}"). ` +
          'HTTP is only allowed in development for recognized local/private development ' +
          'targets (localhost, 127.0.0.1, the Android Emulator host 10.0.2.2, or a private ' +
          'LAN address such as 192.168.x.x) — use HTTPS for anything else.'
      );
    }
    return raw as string;
  }

  // preview / production — no fallback, strict validation.
  if (!hasRaw) {
    throw new Error(
      `Missing EXPO_PUBLIC_API_BASE_URL for the "${appEnv}" environment. This must be set ` +
        'explicitly (via an EAS environment variable) to a confirmed, publicly reachable ' +
        'HTTPS backend origin — there is no default for preview/production. See ' +
        'mobile/README.md "Environment configuration" and ' +
        'mobile/MOBILE_DEVELOPMENT_PHASES.md §10 item 1.'
    );
  }

  const parsed = parseUrl(raw as string);
  if (!parsed) {
    throw new Error(
      `EXPO_PUBLIC_API_BASE_URL ("${raw}") is not a valid URL for the "${appEnv}" environment.`
    );
  }

  if (looksLikePlaceholder(raw as string, parsed.hostname)) {
    throw new Error(
      `EXPO_PUBLIC_API_BASE_URL ("${raw}") looks like a placeholder value, not a real, ` +
        `confirmed backend origin. Supply the real HTTPS API origin for the "${appEnv}" ` +
        'environment via an EAS environment variable once it has been confirmed — never a ' +
        'placeholder.'
    );
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(
      `EXPO_PUBLIC_API_BASE_URL must use HTTPS for the "${appEnv}" environment (got ` +
        `"${parsed.protocol}"). Refusing to use a non-HTTPS origin.`
    );
  }

  if (isLocalOrPrivateHost(parsed.hostname)) {
    throw new Error(
      `EXPO_PUBLIC_API_BASE_URL ("${raw}") points at a localhost, emulator, or private LAN ` +
        `address, which cannot work for the "${appEnv}" environment. This must be a real, ` +
        'publicly reachable HTTPS origin.'
    );
  }

  return raw as string;
}
