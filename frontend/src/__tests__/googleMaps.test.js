import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Phase 46. Key-separation / missing-config safe-behavior tests from the
// FRONTEND side. This must exercise the "Google not configured" path every
// consumer degrades through to manual entry, REGARDLESS of whether the
// developer running this suite happens to have a real
// VITE_GOOGLE_MAPS_BROWSER_KEY in their own local frontend/.env.local (Vite/
// Vitest auto-load .env.local, so relying on "nothing sets it" is not
// actually isolated -- 2026-09-22 fix, found during Phase 46 live
// validation). `vi.stubEnv` + `vi.resetModules()` + a fresh dynamic import
// per test pins the exact env value this test needs at module-evaluation
// time (where `googleMaps.js` reads `import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY`
// into its module-level constant), independent of any real .env.local on
// disk. Production source is untouched -- this only controls what the test
// process sees, never what a real deployed build reads.
const importFreshModule = async () => {
  vi.resetModules();
  return import('../config/googleMaps');
};

describe('isBrowserAutocompleteConfigured', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false when no browser key is configured (independent of the developer\'s real .env.local)', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_BROWSER_KEY', '');
    const { isBrowserAutocompleteConfigured } = await importFreshModule();
    expect(isBrowserAutocompleteConfigured()).toBe(false);
  });

  it('is true when a browser key is configured', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_BROWSER_KEY', 'test-only-placeholder-key');
    const { isBrowserAutocompleteConfigured } = await importFreshModule();
    expect(isBrowserAutocompleteConfigured()).toBe(true);
  });
});

describe('loadPlacesLibrary', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_MAPS_BROWSER_KEY', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects cleanly (never throws synchronously, never attempts a script load) when unconfigured', async () => {
    const { loadPlacesLibrary } = await importFreshModule();
    await expect(loadPlacesLibrary()).rejects.toThrow(/not configured/i);
  });
});
