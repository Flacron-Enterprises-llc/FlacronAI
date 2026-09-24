// Phase 47 (Property Intelligence: RealtyAPI U.S. Adapter & Report
// Integration). Provider registry -- mirrors
// backend/services/addressProviders/registry.js and
// backend/services/pricingProviders/registry.js exactly. The provider is
// selected PURELY from server env config (`PROPERTY_INTELLIGENCE_PROVIDER`,
// default 'realty_api'); a client request body can never select provider/
// base URL/key/field mapping (propertyIntelligenceService.js never reads
// any such field from req.body). The mock provider is deliberately NOT
// registered here -- see mockPropertyProvider.js's header comment; tests
// reach it via direct import / require-cache stubbing, never via this
// registry, so it can never be selected in production regardless of env.
const realtyApiProvider = require('./realtyApiProvider');

const PROVIDERS = {
  realty_api: realtyApiProvider,
};

const DEFAULT_PROVIDER = 'realty_api';

const getPropertyIntelligenceProvider = () => {
  const key = (process.env.PROPERTY_INTELLIGENCE_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase();
  return PROVIDERS[key] || null;
};

module.exports = { getPropertyIntelligenceProvider, PROVIDERS, DEFAULT_PROVIDER };
