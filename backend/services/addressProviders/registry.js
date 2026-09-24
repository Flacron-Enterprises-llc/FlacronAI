// Phase 46 (Property Intelligence: Address Normalization & Google Integration).
// Provider registry -- mirrors backend/services/pricingProviders/registry.js
// exactly. The provider is selected PURELY from server env config
// (`ADDRESS_PROVIDER`, default 'google'); a client request body can never
// select provider/base URL/key/field mapping (propertyService.js never
// reads any such field from req.body). Adding a future provider only
// requires registering it in PROVIDERS below.
const googleAddressProvider = require('./googleAddressProvider');

const PROVIDERS = {
  google: googleAddressProvider,
};

const DEFAULT_PROVIDER = 'google';

const getAddressProvider = () => {
  const key = (process.env.ADDRESS_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase();
  return PROVIDERS[key] || null;
};

module.exports = { getAddressProvider, PROVIDERS, DEFAULT_PROVIDER };
