// Phase 46 (Property Intelligence: Address Normalization & Google Integration).
// Server-only config reader for the Google address/location integration.
// Modeled on config/openai.js's shape (lazy, never throws at require-time,
// warns + degrades to "unavailable" when unconfigured).
//
// Key separation (deliberate): GOOGLE_MAPS_SERVER_KEY is read here and used
// ONLY by backend/services/addressProviders/googleAddressProvider.js for
// server-side Geocoding confirmation -- it is never logged, never returned
// in any API response, and never sent to the browser. The BROWSER key
// (VITE_GOOGLE_MAPS_BROWSER_KEY) lives entirely in frontend build-time env
// config (frontend/.env.example) and is never read by this backend -- a
// browser key is a public, referrer-restricted identifier by design, but
// backend code still has no reason to hold it, so it doesn't. See
// backend/routes/reports.js's GET /property-lookup/config for the sanitized
// status this config exposes to the frontend (never the server key itself).
require('dotenv').config();

const SERVER_TIMEOUT_MS = Number(process.env.GOOGLE_MAPS_TIMEOUT_MS) || 8000;
const MAX_RETRIES = Number(process.env.GOOGLE_MAPS_MAX_RETRIES) || 1;

const getServerKey = () => {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  return key && key.trim() ? key.trim() : null;
};

// Explicit opt-out even when a key is present (operational kill-switch) --
// defaults to enabled whenever a server key is configured.
const isFeatureEnabled = () => {
  if (process.env.ADDRESS_LOOKUP_ENABLED === 'false') return false;
  return true;
};

const isServerGeocodingConfigured = () => isFeatureEnabled() && !!getServerKey();

// The browser key's PRESENCE is derived from an unprefixed server-side env
// var only for the purpose of driving the sanitized public-config endpoint's
// `browserAutocompleteConfigured` flag -- this never reads or forwards the
// actual VITE_-prefixed frontend value (that one is compiled directly into
// the frontend bundle by Vite and this backend process never sees it). An
// operator sets GOOGLE_MAPS_BROWSER_KEY_CONFIGURED=true once they've set the
// frontend's own VITE_GOOGLE_MAPS_BROWSER_KEY, so the backend can advertise
// "autocomplete is available" without ever holding the key.
const isBrowserAutocompleteConfigured = () =>
  isFeatureEnabled() && process.env.GOOGLE_MAPS_BROWSER_KEY_CONFIGURED === 'true';

module.exports = {
  SERVER_TIMEOUT_MS,
  MAX_RETRIES,
  getServerKey,
  isFeatureEnabled,
  isServerGeocodingConfigured,
  isBrowserAutocompleteConfigured,
};
