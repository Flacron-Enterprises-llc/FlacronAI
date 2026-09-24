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
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('Google Maps can only load in a browser environment.'));
      return;
    }
    if (window.google?.maps?.places) {
      resolve(window.google.maps.places);
      return;
    }

    const existing = document.getElementById('google-maps-places-script');
    const onReady = async () => {
      try {
        const places = await window.google.maps.importLibrary('places');
        resolve(places);
      } catch (err) {
        reject(err);
      }
    };

    if (existing) {
      existing.addEventListener('load', onReady, { once: true });
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(BROWSER_KEY)}&libraries=places&loading=async&v=weekly`;
    script.addEventListener('load', onReady, { once: true });
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
};
