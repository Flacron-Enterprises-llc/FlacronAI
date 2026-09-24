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

// Minimal fake browser globals (the suite runs in plain Node): records every
// <script> appended to <head> and lets a test fire its load/error events.
const installFakeBrowser = () => {
  const appended = [];
  const makeScript = () => {
    const listeners = {};
    return {
      listeners,
      addEventListener: (type, cb) => {
        listeners[type] = cb;
      },
    };
  };
  const fakeWindow = {};
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('document', {
    getElementById: (id) => appended.find((s) => s.id === id) || null,
    createElement: () => makeScript(),
    head: { appendChild: (el) => appended.push(el) },
  });
  return { appended, fakeWindow };
};

describe('loadPlacesLibrary with a configured browser key', () => {
  const KEY = 'test-only-placeholder-key';
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_MAPS_BROWSER_KEY', KEY);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('injects exactly one Maps JS API script with the Places library, async loading and the key from import.meta.env', async () => {
    const { appended, fakeWindow } = installFakeBrowser();
    const places = { AutocompleteSuggestion: { fetchAutocompleteSuggestions: () => {} } };
    const { loadPlacesLibrary } = await importFreshModule();
    const first = loadPlacesLibrary();
    const second = loadPlacesLibrary();
    expect(appended).toHaveLength(1);
    const url = new URL(appended[0].src);
    expect(url.origin + url.pathname).toBe('https://maps.googleapis.com/maps/api/js');
    expect(url.searchParams.get('key')).toBe(KEY);
    expect(url.searchParams.get('libraries')).toBe('places');
    expect(url.searchParams.get('loading')).toBe('async');
    expect(appended[0].async).toBe(true);
    fakeWindow.google = { maps: { importLibrary: async (name) => (name === 'places' ? places : null) } };
    appended[0].listeners.load();
    await expect(first).resolves.toBe(places);
    await expect(second).resolves.toBe(places);
  });

  it('rejects on a script load error and allows a later retry', async () => {
    const { appended } = installFakeBrowser();
    const { loadPlacesLibrary } = await importFreshModule();
    const attempt = loadPlacesLibrary();
    appended[0].listeners.error();
    await expect(attempt).rejects.toThrow(/Failed to load Google Maps script/);
    await Promise.resolve();
    loadPlacesLibrary().catch(() => {});
    expect(appended.length).toBeGreaterThanOrEqual(1);
  });

  it('a Google key/referrer rejection (gm_authFailure) notifies subscribers and blocks further loads', async () => {
    const { fakeWindow } = installFakeBrowser();
    const { loadPlacesLibrary, onMapsAuthFailure } = await importFreshModule();
    loadPlacesLibrary().catch(() => {});
    let notified = 0;
    onMapsAuthFailure(() => {
      notified += 1;
    });
    expect(typeof fakeWindow.gm_authFailure).toBe('function');
    fakeWindow.gm_authFailure();
    expect(notified).toBe(1);
    // Late subscribers are told immediately; later loads reject.
    onMapsAuthFailure(() => {
      notified += 1;
    });
    expect(notified).toBe(2);
    await expect(loadPlacesLibrary()).rejects.toThrow(/rejected the browser key/);
  });

  it('never writes the key to the console while loading or failing', async () => {
    const { appended, fakeWindow } = installFakeBrowser();
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    try {
      const { loadPlacesLibrary } = await importFreshModule();
      const attempt = loadPlacesLibrary();
      appended[0].listeners.error();
      await attempt.catch(() => {});
      loadPlacesLibrary().catch(() => {});
      fakeWindow.gm_authFailure();
      for (const spy of spies) {
        for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(KEY);
      }
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
