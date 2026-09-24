// Phase 47 (Property Intelligence: RealtyAPI U.S. Adapter & Report
// Integration). Server-only config reader/validated seam for the
// RealtyAPI-family integration. Modeled on config/googlePlaces.js's shape
// (lazy, never throws at require-time, warns + degrades to "unavailable"
// when unconfigured).
//
// STATUS (updated 2026-09-22 after the live-validation session): the exact
// RealtyAPI product, base URL, authentication header/method, and request
// contract ARE now confirmed directly against RealtyAPI's own OpenAPI spec
// + real live calls (see PHASES.md Phase 47's live-validation session
// entries). `propertyIntelligenceProviders/realtyApiProvider.js`'s
// `lookupProperty` now makes a real authenticated request whenever
// `isConfigured()` below is true -- it no longer unconditionally throws
// PROPERTY_PROVIDER_NOT_CONFIGURED. What remains open are two external
// items unrelated to this contract: a RealtyAPI ToS/data-retention written
// confirmation, and activating the real key in the production deployment's
// secrets (this module only ever reads local/deployment env, same as
// every sibling config). No hostname/endpoint path is hardcoded outside
// realtyApiProvider.js, by design.
require('dotenv').config();

const TIMEOUT_MS = Number(process.env.REALTY_API_TIMEOUT_MS) || 8000;
const MAX_RETRIES = Number(process.env.REALTY_API_MAX_RETRIES) || 1;

const getApiKey = () => {
  const key = process.env.REALTY_API_KEY;
  return key && key.trim() ? key.trim() : null;
};

const getBaseUrl = () => {
  const url = process.env.REALTY_API_BASE_URL;
  return url && url.trim() ? url.trim() : null;
};

// Explicit opt-out even when a key/URL are present -- defaults to disabled
// until the client/ops explicitly turns this on (unlike Google/OpenAI's
// "enabled by default once a key exists" convention) because the provider
// contract itself is still unconfirmed; there is nothing safe to enable yet.
const isFeatureEnabled = () => process.env.PROPERTY_INTELLIGENCE_ENABLED === 'true';

// "Configured" means the operator has filled in the seam (feature flag +
// key + base URL) -- realtyApiProvider.lookupProperty will make a real
// request whenever this is true. It does NOT mean a live call has actually
// verified those credentials (see integrationStatusService.js's
// 'live_validation_pending' vs 'verified' distinction) or that the two
// remaining external items (ToS confirmation, production activation) are
// resolved -- both are tracked separately in PHASES.md, not here.
const isConfigured = () => isFeatureEnabled() && !!getApiKey() && !!getBaseUrl();

module.exports = {
  TIMEOUT_MS,
  MAX_RETRIES,
  getApiKey,
  getBaseUrl,
  isFeatureEnabled,
  isConfigured,
};
