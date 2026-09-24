// Phase 47 (Property Intelligence: RealtyAPI U.S. Adapter & Report
// Integration). Test/mock provider satisfying the same `PropertyDataProvider`
// contract as realtyApiProvider.js (see that file's header comment) --
// NEVER registered in propertyIntelligenceProviders/registry.js, so it can
// never be selected by any request/config in production. It exists purely
// so backend/test/property-intelligence-service.test.js and
// property-intelligence-route.test.js can exercise the full
// request->normalize->apply pipeline (full/partial/no-match/ambiguous/
// malformed) without a real provider -- tests inject it directly (same
// require-cache-stubbing convention as property-profile-route.test.js's
// `propertyServiceImpl` override), matching the phase brief's explicit
// "test/mock provider" requirement.
const PROVIDER_NAME = 'mock';

const makeError = (message, code, extra) => Object.assign(new Error(message), { code }, extra || {});

// `fixture` lets a test pick which canned scenario to return; production
// code never sets this (there is no caller that could -- it's not read from
// any request/env). Defaults to a full, valid result.
const lookupProperty = async (_normalizedAddress, { fixture = 'full' } = {}) => {
  switch (fixture) {
    case 'no_match':
      throw makeError('No property record found for this address.', 'PROPERTY_NO_MATCH');
    case 'ambiguous':
      return { raw: { candidates: 2 }, ambiguous: true };
    case 'malformed':
      return { raw: null };
    case 'partial':
      return {
        raw: {
          parcelNumber: 'PARC-0001',
          yearBuilt: 1998,
          bedrooms: 3,
          // every other field intentionally absent -- a real "partial result"
        },
      };
    case 'error':
      throw makeError('The property data provider is temporarily unavailable.', 'PROPERTY_PROVIDER_ERROR', { transient: true });
    case 'full':
    default:
      return {
        raw: {
          parcelNumber: 'PARC-0001-A',
          propertyType: 'Single Family Residence',
          yearBuilt: 1998,
          livingAreaValue: 2100,
          livingAreaUnit: 'sqft',
          lotSizeValue: 0.25,
          lotSizeUnit: 'acres',
          bedrooms: 3,
          bathrooms: 2.5,
          stories: 2,
          garageType: 'Attached',
          garageSpaces: 2,
          roofType: 'Asphalt Shingle',
          exteriorConstruction: 'Brick Veneer',
          foundationType: 'Slab',
          heatingType: 'Forced Air',
          coolingType: 'Central',
          assessedValue: 285000,
          assessedValueCurrency: 'USD',
          propertyTaxAnnual: 5400,
          propertyTaxCurrency: 'USD',
          lastSaleDate: '2019-06-14',
          lastSalePrice: 310000,
          lastSalePriceCurrency: 'USD',
          ownerOnRecord: 'On file with county records',
          floodZone: 'Zone X (minimal flood hazard)',
          hazardSummary: 'No elevated wildfire or flood hazard reported.',
          footprintAreaValue: 1850,
          footprintAreaUnit: 'sqft',
          providerRecordId: 'mock-rec-0001',
          providerEffectiveDate: '2026-06-01',
        },
      };
  }
};

// Mock results are already flat and field-key-shaped (see fixtures above),
// so normalization is an identity pass-through -- propertyIntelligence.js's
// normalizeProviderFields still runs every value through the real
// validators; this function only extracts the flat map from `{raw}`.
const normalizePropertyResult = (rawResult) => {
  if (!rawResult || !rawResult.raw || typeof rawResult.raw !== 'object') {
    throw makeError('Malformed provider response.', 'PROPERTY_MALFORMED_RESPONSE');
  }
  return rawResult.raw;
};

module.exports = { PROVIDER_NAME, lookupProperty, normalizePropertyResult };
