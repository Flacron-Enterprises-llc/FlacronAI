/**
 * Phase 10 cloud device tests: in-memory endpoint override for the e2e test build only.
 * Set once at launch by `e2eRuntimeConfig.ts` (gated: development env AND the e2e-only build flag);
 * otherwise always null. Kept import-free so `env.ts` and `authEmulator.ts` can read it without
 * an import cycle.
 */
export interface E2EEndpoints {
  /** HTTPS API origin, e.g. https://x.trycloudflare.com (no path). */
  apiOrigin: string;
  /** HTTPS Firebase Auth emulator origin. */
  authEmulatorOrigin: string;
}

let current: E2EEndpoints | null = null;

export function setE2EEndpoints(value: E2EEndpoints | null): void {
  current = value;
}

export function getE2EEndpoints(): E2EEndpoints | null {
  return current;
}
