// Phase 46 (Property Intelligence: Address Normalization & Google Integration).
// Lazy loader for the Google Maps JavaScript API (Places library), using the
// BROWSER-restricted key only (never the backend's server key -- this
// backend key is never present in frontend code/env at all). The key is
// delivered via Vite build-time config (VITE_GOOGLE_MAPS_BROWSER_KEY, same
// pattern as VITE_FIREBASE_*), not fetched from the backend -- see
// CONTEXT.md's Phase 46 entry for why: a browser key is a public identifier
// by design, and avoiding a round trip keeps autocomplete latency lower and
// keeps this loader simple to reason about with no runtime dependency on
// the API being reachable. The sanitized `GET /reports/property-lookup/config`
// endpoint still exists and is what the UI checks for the SERVER-side
// normalization capability (and as a redundant enabled/disabled feature
// flag independent of whether the browser key happens to be set).
const BROWSER_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY || '';

export const isBrowserAutocompleteConfigured = () => !!BROWSER_KEY;

let loadPromise = null;

// Global function name Google calls (via the script URL's `callback=`) once
// the Maps JS API has finished initialising.
const READY_CALLBACK = '__flacronGoogleMapsReady';

// Google reports a rejected key (wrong key, API not enabled, referrer not
// allowed) by calling the global `gm_authFailure` hook AFTER the script has
// loaded -- the script's own `error` event never fires for it. Track it so
// callers can drop back to manual entry instead of a silently dead widget.
let authFailed = false;
const authFailureListeners = new Set();
const installAuthFailureHook = () => {
  if (typeof window === 'undefined' || window.__flacronMapsAuthHookInstalled) return;
  window.__flacronMapsAuthHookInstalled = true;
  const previous = window.gm_authFailure;
  window.gm_authFailure = () => {
    authFailed = true;
    authFailureListeners.forEach((cb) => cb());
    if (typeof previous === 'function') previous();
  };
};

// Subscribe to a Maps authentication failure. Fires immediately if one has
// already happened. Returns an unsubscribe function.
export const onMapsAuthFailure = (cb) => {
  if (authFailed) {
    cb();
    return () => {};
  }
  authFailureListeners.add(cb);
  return () => authFailureListeners.delete(cb);
};

// Loads the Maps JS API once (cached promise -- a second call while
// loading, or after success, resolves immediately/reuses the in-flight
// load rather than injecting a second <script> tag). Resolves to the
// `google.maps.places` library namespace, or throws if the key is missing
// or the script fails to load (network/offline/ad-blocker) -- callers treat
// a throw exactly like "provider unavailable" and fall back to manual entry.
export const loadPlacesLibrary = () => {
  if (!BROWSER_KEY) {
    return Promise.reject(new Error('Google Maps browser key is not configured.'));
  }
  if (authFailed) {
    return Promise.reject(new Error('Google Maps rejected the browser key.'));
  }
  if (loadPromise) return loadPromise;
  installAuthFailureHook();

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('Google Maps can only load in a browser environment.'));
      return;
    }
    const onReady = async () => {
      try {
        const places = await window.google.maps.importLibrary('places');
        resolve(places);
      } catch (err) {
        reject(err);
      }
    };

    // API already initialised (e.g. a retry after an unrelated failure).
    if (typeof window.google?.maps?.importLibrary === 'function') {
      onReady();
      return;
    }
    if (window.google?.maps?.places) {
      resolve(window.google.maps.places);
      return;
    }

    // With `loading=async` the script's `load` event fires as soon as the
    // bootstrap file has downloaded -- BEFORE `google.maps.importLibrary`
    // exists. Calling it from `load` threw, rejected this promise and
    // silently switched the widget to manual entry (no Places requests ever
    // sent). Google's readiness signal for this mode is the `callback` URL
    // parameter, so resolve from there instead.
    window[READY_CALLBACK] = () => {
      delete window[READY_CALLBACK];
      onReady();
    };

    const existing = document.getElementById('google-maps-places-script');
    if (existing) {
      // Still loading from an earlier attempt: its URL already names the
      // same callback, which was just re-pointed at this attempt.
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps script.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-places-script';
    script.async = true;
    script.defer = true;
    // `loading=async` + importLibrary is Google's currently-recommended
    // pattern; `libraries=places` primes the classic bootstrap loader too
    // for broader compatibility across Maps JS API versions.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(BROWSER_KEY)}&libraries=places&loading=async&v=weekly&callback=${READY_CALLBACK}`;
    script.addEventListener('error', () => reject(new Error('Failed to load Google Maps script.')), { once: true });
    document.head.appendChild(script);
  });

  // A failed load must not be cached forever -- allow a later retry (e.g.
  // the user's connection recovers) to attempt loading again.
  loadPromise.catch(() => {
    loadPromise = null;
  });

  return loadPromise;
};

export const __resetForTests = () => {
  loadPromise = null;
  authFailed = false;
  authFailureListeners.clear();
  if (typeof window !== 'undefined') {
    delete window.__flacronMapsAuthHookInstalled;
    delete window[READY_CALLBACK];
  }
};
