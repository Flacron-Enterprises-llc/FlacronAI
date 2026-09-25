const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getPropertyIntelligenceProvider,
  DEFAULT_PROVIDER,
  PROVIDERS,
} = require('../services/propertyIntelligenceProviders/registry');
const realtyApiProvider = require('../services/propertyIntelligenceProviders/realtyApiProvider');
const mockPropertyProvider = require('../services/propertyIntelligenceProviders/mockPropertyProvider');
const realtyApiConfig = require('../config/realtyApi');

const withEnv = (vars, fn) => async () => {
  const prev = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  Object.assign(process.env, vars);
  try {
    await fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
};

test('registry: the provider is selected purely from server env config, defaulting to realty_api', () => {
  assert.equal(DEFAULT_PROVIDER, 'realty_api');
  assert.equal(getPropertyIntelligenceProvider().PROVIDER_NAME, 'realty_api');
});

test(
  'registry: an unknown PROPERTY_INTELLIGENCE_PROVIDER value returns null, never throws or falls back silently to a wrong provider',
  withEnv({ PROPERTY_INTELLIGENCE_PROVIDER: 'some_other_service' }, async () => {
    assert.equal(getPropertyIntelligenceProvider(), null);
  })
);

test('registry: the mock provider is never registered -- it cannot be selected via any env value', () => {
  assert.ok(!('mock' in PROVIDERS));
});

test(
  'realtyApiProvider.lookupProperty fails safe with PROPERTY_PROVIDER_NOT_CONFIGURED when unconfigured, and NEVER touches the real global.fetch',
  // Explicitly forces the unconfigured state via withEnv rather than relying
  // on ambient process.env -- config/realtyApi.js loads backend/.env via
  // dotenv at require-time, so this must not assume REALTY_API_KEY/
  // PROPERTY_INTELLIGENCE_ENABLED are absent from whatever .env the test
  // runner's process happens to have loaded.
  withEnv(
    { PROPERTY_INTELLIGENCE_ENABLED: 'false', REALTY_API_KEY: '', REALTY_API_BASE_URL: '' },
    async () => {
      const originalFetch = global.fetch;
      let fetchCalled = false;
      global.fetch = async () => {
        fetchCalled = true;
        throw new Error(
          'a real network call was attempted via the global fetch -- the test suite must never do this'
        );
      };
      try {
        assert.equal(
          realtyApiConfig.isConfigured(),
          false,
          'precondition: config seam reports NOT configured'
        );
        await assert.rejects(
          () =>
            realtyApiProvider.lookupProperty(
              {
                addressLine1: '123 Main St',
                city: 'Austin',
                state: 'TX',
                postalCode: '78701',
                countryCode: 'US',
              },
              {}
            ),
          (err) => err.code === 'PROPERTY_PROVIDER_NOT_CONFIGURED'
        );
        assert.equal(fetchCalled, false, 'no network call was attempted');
      } finally {
        global.fetch = originalFetch;
      }
    }
  )
);

// 2026-09-22 live-validation session: the request/error contract below is
// built from RealtyAPI's own confirmed OpenAPI spec + docs (base URL
// `https://realtor.realtyapi.io`, `GET /details/byaddress`, `address` query
// param, `x-realtyapi-key` header) and cross-checked against 3 real,
// controlled calls (2 real US properties + 1 synthetic no-match). Every test
// below injects `fetchImpl` (never touches the real `global.fetch`), so the
// automated suite makes zero real network calls -- same guarantee the old
// "transport not implemented" test enforced, now exercising the real logic
// instead of a hardcoded throw.
test(
  'realtyApiProvider.lookupProperty builds the confirmed request contract when configured',
  withEnv(
    {
      PROPERTY_INTELLIGENCE_ENABLED: 'true',
      REALTY_API_KEY: 'fake-key-should-never-be-used',
      REALTY_API_BASE_URL: 'https://example.invalid',
    },
    async () => {
      assert.equal(
        realtyApiConfig.isConfigured(),
        true,
        'precondition: config seam reports configured'
      );
      let capturedUrl, capturedHeaders;
      const fetchImpl = async (url, opts) => {
        capturedUrl = url;
        capturedHeaders = opts.headers;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message: 'Success',
            source: 'realtor.com',
            detail: { property_id: '1', details: {} },
          }),
        };
      };
      await realtyApiProvider.lookupProperty(
        {
          addressLine1: '123 Main St',
          city: 'Austin',
          state: 'TX',
          postalCode: '78701',
          countryCode: 'US',
        },
        { fetchImpl }
      );
      assert.equal(
        capturedUrl,
        'https://example.invalid/details/byaddress?address=123+Main+St%2C+Austin%2C+TX+78701'
      );
      assert.equal(capturedHeaders['x-realtyapi-key'], 'fake-key-should-never-be-used');
    }
  )
);

// Confirmed by live evidence: a no-match is HTTP 200 with an empty `detail`
// object (RealtyAPI does NOT return a 404 status for this case, despite the
// human-readable `message` string embedding the text "404").
test(
  'realtyApiProvider.lookupProperty treats an empty `detail` (real no-match shape) as PROPERTY_NO_MATCH',
  withEnv(
    {
      PROPERTY_INTELLIGENCE_ENABLED: 'true',
      REALTY_API_KEY: 'k',
      REALTY_API_BASE_URL: 'https://example.invalid',
    },
    async () => {
      const fetchImpl = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          message: '404: address not found on realtor.com',
          source: 'realtor.com',
          detail: {},
        }),
      });
      await assert.rejects(
        () =>
          realtyApiProvider.lookupProperty(
            { addressLine1: '0 Nowhere', city: 'Springfield', state: 'IL', postalCode: '62704' },
            { fetchImpl }
          ),
        (err) => err.code === 'PROPERTY_NO_MATCH'
      );
    }
  )
);

test(
  'realtyApiProvider.lookupProperty maps the confirmed RealtyAPI status/error taxonomy',
  withEnv(
    {
      PROPERTY_INTELLIGENCE_ENABLED: 'true',
      REALTY_API_KEY: 'k',
      REALTY_API_BASE_URL: 'https://example.invalid',
    },
    async () => {
      const cases = [
        [401, {}, 'PROPERTY_PROVIDER_UNAVAILABLE'],
        [402, { error: 'no credits' }, 'PROPERTY_QUOTA_EXCEEDED'],
        [403, {}, 'PROPERTY_PERMISSION_DENIED'],
        [429, { error: 'rate limited', retryAfter: 30 }, 'PROPERTY_RATE_LIMITED'],
        [400, {}, 'PROPERTY_INVALID_INPUT'],
        [500, {}, 'PROPERTY_PROVIDER_ERROR'],
      ];
      for (const [status, body, expectedCode] of cases) {
        const fetchImpl = async () => ({ ok: false, status, json: async () => body });
        await assert.rejects(
          () =>
            realtyApiProvider.lookupProperty(
              { addressLine1: 'x', city: 'y', state: 'TX', postalCode: '1' },
              { fetchImpl, timeoutMs: 10 }
            ),
          // providerStatus: server-side diagnostics only (logged by the route).
          (err) => err.code === expectedCode && err.providerStatus === status,
          `status ${status} should map to ${expectedCode} and carry providerStatus`
        );
      }
    }
  )
);

test(
  'realtyApiProvider.lookupProperty retries a transient 5xx up to REALTY_API_MAX_RETRIES, then fails safe',
  withEnv(
    {
      PROPERTY_INTELLIGENCE_ENABLED: 'true',
      REALTY_API_KEY: 'k',
      REALTY_API_BASE_URL: 'https://example.invalid',
      REALTY_API_MAX_RETRIES: '1',
    },
    async () => {
      let calls = 0;
      const fetchImpl = async () => {
        calls += 1;
        return { ok: false, status: 503, json: async () => ({}) };
      };
      await assert.rejects(
        () =>
          realtyApiProvider.lookupProperty(
            { addressLine1: 'x', city: 'y', state: 'TX', postalCode: '1' },
            { fetchImpl }
          ),
        (err) => err.code === 'PROPERTY_PROVIDER_ERROR'
      );
      assert.equal(calls, 2, 'one initial attempt + one retry (REALTY_API_MAX_RETRIES=1)');
    }
  )
);

// SANITIZED fixture below, shaped exactly like the real RealtyAPI
// /details/byaddress response observed in this session's live-validation
// calls (top-level `message`/`source`/`detail`, `detail.details`,
// `detail.tax_history[]`, `detail.details_sections[].text` "Label: Value"
// bullets, `detail.local.flood`) -- every VALUE below is synthetic/fake, no
// key, no real address, no real owner/financial data. This is what
// `normalizePropertyResult` actually parses in production.
const SANITIZED_FULL_FIXTURE = {
  raw: {
    message: 'Success',
    source: 'realtor.com',
    detail: {
      property_id: '1234567890',
      last_update_date: '2026-01-01T00:00:00Z',
      last_sold_date: '2020-05-01',
      last_sold_price: 300000,
      details: {
        beds: 3,
        baths: '2.5',
        sqft: 1800,
        lot_sqft: 6000,
        stories: 2,
        year_built: 1995,
        garage: 2,
        type: 'single_family',
        heating: null,
        cooling: null,
      },
      tax_history: [
        { year: 2022, tax: 4000, assessment: { building: 150000, land: 50000, total: 200000 } },
        { year: 2023, tax: 4200, assessment: { building: 155000, land: 52000, total: 207000 } },
      ],
      local: {
        flood: {
          fema_zone: ['X (unshaded)'],
          flood_trend_paragraph: 'Flood risk is minimal for this area.',
        },
      },
      details_sections: [
        {
          category: 'Building and Construction',
          text: ['Roof: Composition', 'Construction Materials: Frame', 'Foundation Details: Slab'],
        },
        {
          category: 'Garage and Parking',
          text: ['Garage Spaces: 2', 'Parking Features: Attached'],
        },
        {
          category: 'Heating and Cooling',
          text: ['Heating Features: Forced Air', 'Cooling Features: Central'],
        },
        {
          category: 'Other Property Info',
          text: ['Parcel Number: 12-345-678', 'County: Example County'],
        },
      ],
    },
  },
};

test('realtyApiProvider.normalizePropertyResult maps every FIELD_KEYS-relevant field evidenced in the real response shape (sanitized fixture)', () => {
  const mapped = realtyApiProvider.normalizePropertyResult(SANITIZED_FULL_FIXTURE);
  assert.equal(mapped.parcelNumber, '12-345-678');
  assert.equal(mapped.propertyType, 'single_family');
  assert.equal(mapped.yearBuilt, 1995);
  assert.equal(mapped.livingAreaValue, 1800);
  assert.equal(mapped.livingAreaUnit, 'sqft');
  assert.equal(mapped.lotSizeValue, 6000);
  assert.equal(mapped.bedrooms, 3);
  assert.equal(mapped.bathrooms, 2.5);
  assert.equal(mapped.stories, 2);
  assert.equal(mapped.garageSpaces, 2);
  assert.equal(mapped.garageType, 'Attached');
  assert.equal(mapped.roofType, 'Composition');
  assert.equal(mapped.exteriorConstruction, 'Frame');
  assert.equal(mapped.foundationType, 'Slab');
  // detail.details.heating/cooling are null in the real shape -- the bullet
  // text is the only real source, confirmed by this fixture mirroring that.
  assert.equal(mapped.heatingType, 'Forced Air');
  assert.equal(mapped.coolingType, 'Central');
  // Picks the HIGHEST year entry (2023), not array index 0 (2022).
  assert.equal(mapped.assessedValue, 207000);
  assert.equal(mapped.assessedValueCurrency, 'USD');
  assert.equal(mapped.propertyTaxAnnual, 4200);
  assert.equal(mapped.propertyTaxCurrency, 'USD');
  assert.equal(mapped.lastSaleDate, '2020-05-01');
  assert.equal(mapped.lastSalePrice, 300000);
  assert.equal(mapped.lastSalePriceCurrency, 'USD');
  assert.equal(mapped.floodZone, 'X (unshaded)');
  assert.equal(mapped.hazardSummary, 'Flood risk is minimal for this area.');
  assert.equal(mapped.providerRecordId, '1234567890');
  assert.equal(mapped.providerEffectiveDate, '2026-01-01T00:00:00Z');
  // Never fabricated: no evidence of these fields exists anywhere in any
  // real response observed this session.
  assert.equal(mapped.ownerOnRecord, undefined);
  assert.equal(mapped.footprintAreaValue, undefined);

  // Every mapped value must survive the REAL validators unchanged (proves
  // the mapping is validator-compatible, not just shape-compatible).
  const { normalizeProviderFields, FIELD_KEYS } = require('../utils/propertyIntelligence');
  const fields = normalizeProviderFields(mapped);
  const rejected = FIELD_KEYS.filter((k) => mapped[k] !== undefined && fields[k].value === null);
  assert.deepEqual(rejected, [], 'no mapped value should be rejected by the real field validators');
});

test('realtyApiProvider.normalizePropertyResult handles a "+"-suffixed bathroom count ("7.5+") via parseFloat, not Number()', () => {
  const fixture = {
    raw: {
      ...SANITIZED_FULL_FIXTURE.raw,
      detail: {
        ...SANITIZED_FULL_FIXTURE.raw.detail,
        details: { ...SANITIZED_FULL_FIXTURE.raw.detail.details, baths: '7.5+' },
      },
    },
  };
  assert.equal(realtyApiProvider.normalizePropertyResult(fixture).bathrooms, 7.5);
});

test('realtyApiProvider.normalizePropertyResult throws PROPERTY_MALFORMED_RESPONSE for a missing/malformed `detail`', () => {
  assert.throws(
    () => realtyApiProvider.normalizePropertyResult({ raw: { message: 'Success' } }),
    (err) => err.code === 'PROPERTY_MALFORMED_RESPONSE'
  );
  assert.throws(
    () => realtyApiProvider.normalizePropertyResult({}),
    (err) => err.code === 'PROPERTY_MALFORMED_RESPONSE'
  );
});

test('mockPropertyProvider satisfies the same PropertyDataProvider contract shape as realtyApiProvider', async () => {
  assert.equal(typeof mockPropertyProvider.PROVIDER_NAME, 'string');
  assert.equal(typeof mockPropertyProvider.lookupProperty, 'function');
  assert.equal(typeof mockPropertyProvider.normalizePropertyResult, 'function');
  const raw = await mockPropertyProvider.lookupProperty({}, { fixture: 'full' });
  const values = mockPropertyProvider.normalizePropertyResult(raw);
  assert.equal(values.parcelNumber, 'PARC-0001-A');
});

test('mockPropertyProvider: no-match/ambiguous/malformed/error fixtures behave as documented', async () => {
  await assert.rejects(
    () => mockPropertyProvider.lookupProperty({}, { fixture: 'no_match' }),
    (err) => err.code === 'PROPERTY_NO_MATCH'
  );
  const ambiguous = await mockPropertyProvider.lookupProperty({}, { fixture: 'ambiguous' });
  assert.equal(ambiguous.ambiguous, true);
  assert.throws(
    () => mockPropertyProvider.normalizePropertyResult({ raw: null }),
    (err) => err.code === 'PROPERTY_MALFORMED_RESPONSE'
  );
  await assert.rejects(
    () => mockPropertyProvider.lookupProperty({}, { fixture: 'error' }),
    (err) => err.code === 'PROPERTY_PROVIDER_ERROR' && err.transient === true
  );
});
