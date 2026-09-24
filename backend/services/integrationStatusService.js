// Phase 48. Admin-only, safe status display for the Phase 43/45/46/47
// integrations -- derives everything from booleans/env presence, NEVER
// returns a key/secret/Price-ID value, and never claims more than each
// phase's own documented status:
//   - 'not_configured'      -- nothing set up yet.
//   - 'configured'          -- credentials/Price IDs present, but no live
//                              call has ever verified them against the
//                              real provider.
//   - 'verified'             -- reserved for a future phase that actually
//                              performs a live provider check; never
//                              returned by this module today.
//   - 'live_validation_pending' -- configured, but that phase's own status
//                              in PHASES.md explicitly says live validation
//                              hasn't happened yet.
//   - 'contract_pending'    -- reserved for a provider whose request/response
//                              contract is itself still unconfirmed. RealtyAPI
//                              no longer uses this value: its contract was
//                              confirmed and its transport implemented in the
//                              2026-09-22 live-validation session, so it now
//                              follows the same env-driven convention as
//                              every other integration above. (Its own
//                              PHASES.md status still has 2 open items -- a
//                              RealtyAPI ToS/data-retention written
//                              confirmation and production (ECS) key
//                              activation -- but neither is a code/contract
//                              gap, so neither blocks this technical signal.)
const { resolveStripeMode, CATALOGUE: PHOTO_PACK_CATALOGUE } = require('../config/photoAddOnPacks');
const googlePlaces = require('../config/googlePlaces');
const realtyApi = require('../config/realtyApi');

const getOpenAiPricingStatus = () => {
  const configured = !!process.env.OPENAI_API_KEY;
  return { configured, status: configured ? 'live_validation_pending' : 'not_configured' };
};

// Reports test/live separately -- never conflates the two modes, matching
// Phase 45's own environment-separation rule.
const getStripeAddOnsStatus = () => {
  const testConfigured = PHOTO_PACK_CATALOGUE.some((p) => !!p.stripePriceId?.test);
  const liveConfigured = PHOTO_PACK_CATALOGUE.some((p) => !!p.stripePriceId?.live);
  return {
    currentMode: resolveStripeMode(),
    test: { configured: testConfigured, status: testConfigured ? 'live_validation_pending' : 'not_configured' },
    live: { configured: liveConfigured, status: liveConfigured ? 'live_validation_pending' : 'not_configured' },
  };
};

const getGoogleAddressStatus = () => {
  const browserConfigured = googlePlaces.isBrowserAutocompleteConfigured();
  const serverConfigured = googlePlaces.isServerGeocodingConfigured();
  const configured = browserConfigured || serverConfigured;
  return {
    browserConfigured,
    serverConfigured,
    status: configured ? 'live_validation_pending' : 'not_configured',
  };
};

// As of the 2026-09-22 live-validation session, RealtyAPI's request/response
// contract is confirmed and its transport (realtyApiProvider.js) is fully
// implemented -- so this now follows the exact same env-driven convention as
// openaiPricing/googleAddress above, instead of an unconditional
// 'contract_pending'. This makes production-key activation (Phase 47's
// remaining blocker #2) show up here once it happens. It deliberately does
// NOT wait on Phase 47's other remaining blocker (a RealtyAPI ToS/
// data-retention written confirmation) -- that is a legal/ops gate on
// actually USING the integration in production, not a statement about
// whether the code itself is technically wired up, which is all this signal
// claims. Never 'verified' -- no live provider check is ever performed here.
const getRealtyApiStatus = () => {
  const envConfigured = realtyApi.isConfigured();
  return { envConfigured, status: envConfigured ? 'live_validation_pending' : 'not_configured' };
};

const getIntegrationStatus = () => ({
  openaiPricing: getOpenAiPricingStatus(),
  stripeAddOns: getStripeAddOnsStatus(),
  googleAddress: getGoogleAddressStatus(),
  realtyApi: getRealtyApiStatus(),
});

module.exports = { getIntegrationStatus };
