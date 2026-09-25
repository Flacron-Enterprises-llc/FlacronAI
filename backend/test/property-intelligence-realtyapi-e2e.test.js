const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeFirestore } = require('./helpers/fakeFirestore');
const { ValidatingFakeFirestore } = require('./helpers/firestoreValidation');
const { LOOKUP_STATUS, VERIFICATION_STATUS } = require('../utils/propertyIntelligence');
const {
  buildSection3PropertyBlockMarkdown,
  injectSection3PropertyBlock,
} = require('../utils/propertyIntelligenceContent');
const { generatePDF } = require('../utils/properPdfGenerator');
const { extractPerPageText } = require('./helpers/pdfTextExtract');

// 2026-09-22 live-validation session: end-to-end pass of the REAL Phase 47
// pipeline (not a mocked provider) -- exercises realtyApiProvider.js's
// actual lookupProperty/normalizePropertyResult (only `fetchImpl` is
// injected, so zero real network calls) through propertyIntelligenceService
// (FakeFirestore -- no Firebase emulator binary is installed in this
// environment; FakeFirestore is the same in-memory Firestore double every
// other Phase 47 persistence test in this suite already uses, and never
// touches production/real Firestore) all the way to a rendered PDF export.
// This is the practical substitute for a live-browser/emulator run:
// verifies the CODE PATH end-to-end, not a live account/network condition.
const registryPath = require.resolve('../services/propertyIntelligenceProviders/registry');
const servicePath =
  require.resolve('../services/propertyIntelligenceProviders/../propertyIntelligenceService');
const realtyApiProviderReal = require('../services/propertyIntelligenceProviders/realtyApiProvider');

// realtyApiProvider.lookupProperty checks realtyApiConfig.isConfigured()
// (PROPERTY_INTELLIGENCE_ENABLED/REALTY_API_KEY/REALTY_API_BASE_URL) before
// anything else -- this test must not depend on whatever the real
// backend/.env happens to contain (those vars are cleared from .env at the
// end of this live-validation session), so it force-sets them for its own
// duration only, same withEnv convention as
// property-intelligence-provider-registry.test.js.
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
const REALTY_ENV = {
  PROPERTY_INTELLIGENCE_ENABLED: 'true',
  REALTY_API_KEY: 'test-only-fake-key',
  REALTY_API_BASE_URL: 'https://example.invalid',
};

// SANITIZED fixture, same shape as the real /details/byaddress response
// observed live this session (see property-intelligence-provider-registry
// .test.js's SANITIZED_FULL_FIXTURE header comment for the provenance note)
// -- every value here is synthetic.
const SANITIZED_RAW_RESPONSE = {
  message: 'Success',
  source: 'realtor.com',
  detail: {
    property_id: '9998887770',
    last_update_date: '2026-02-01T00:00:00Z',
    last_sold_date: '2021-08-15',
    last_sold_price: 415000,
    details: {
      beds: 4,
      baths: '3',
      sqft: 2400,
      lot_sqft: 8500,
      stories: 2,
      year_built: 2001,
      garage: 2,
      type: 'single_family',
      heating: null,
      cooling: null,
    },
    tax_history: [
      { year: 2025, tax: 6100, assessment: { building: 220000, land: 80000, total: 300000 } },
    ],
    local: {
      flood: {
        fema_zone: ['X'],
        flood_trend_paragraph: 'Minimal flood risk reported for this area.',
      },
    },
    details_sections: [
      {
        category: 'Building and Construction',
        text: ['Roof: Composition', 'Construction Materials: Brick', 'Foundation Details: Slab'],
      },
      { category: 'Garage and Parking', text: ['Garage Spaces: 2', 'Parking Features: Attached'] },
      {
        category: 'Heating and Cooling',
        text: ['Heating Features: Forced Air', 'Cooling Features: Central'],
      },
      { category: 'Other Property Info', text: ['Parcel Number: 99-000-111'] },
    ],
  },
};

// Wraps the REAL realtyApiProvider so its lookupProperty always receives an
// injected fetchImpl (the fixture above) -- production code path, zero
// network. normalizePropertyResult is called completely unmodified.
let fetchCallCount = 0;
const realProviderWithStubbedTransport = {
  PROVIDER_NAME: realtyApiProviderReal.PROVIDER_NAME,
  lookupProperty: (normalizedAddress, options = {}) => {
    fetchCallCount += 1;
    return realtyApiProviderReal.lookupProperty(normalizedAddress, {
      ...options,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => SANITIZED_RAW_RESPONSE }),
    });
  },
  normalizePropertyResult: realtyApiProviderReal.normalizePropertyResult,
};

function loadServiceWithRealProvider() {
  delete require.cache[registryPath];
  delete require.cache[servicePath];
  require.cache[registryPath] = {
    id: registryPath,
    filename: registryPath,
    loaded: true,
    exports: {
      getPropertyIntelligenceProvider: () => realProviderWithStubbedTransport,
      PROVIDERS: {},
      DEFAULT_PROVIDER: 'realty_api',
    },
  };
  return require('../services/propertyIntelligenceService');
}

const CONFIRMED_US_PROFILE = {
  status: 'confirmed',
  propertyLookupEligible: true,
  fields: {
    addressLine1: { value: '77 Oak Hill Dr' },
    city: { value: 'Round Rock' },
    state: { value: 'Texas' },
    stateCode: { value: 'TX' },
    postalCode: { value: '78664' },
    countryCode: { value: 'US' },
  },
};

test(
  'real Phase 47 pipeline end-to-end: lookup -> cache reuse -> selective apply -> user-override preserved -> Firestore persistence -> confirmed-only Section 3 export',
  withEnv(REALTY_ENV, async () => {
    fetchCallCount = 0;
    const service = loadServiceWithRealProvider();
    const db = new FakeFirestore();

    // 1. Lookup via the REAL provider (stubbed transport only).
    const lookup = await service.requestPropertyIntelligence(db, {
      reportId: 'report-e2e-1',
      propertyProfile: CONFIRMED_US_PROFILE,
      requestedByUid: 'uid-e2e',
    });
    // PARTIAL, not FULL, is the correct/expected outcome: ownerOnRecord and
    // footprintAreaValue/Unit are never mapped by this provider (no evidence
    // of them exists in any real RealtyAPI response observed this session --
    // see realtyApiProvider.js's normalizePropertyResult header comment), so
    // even a "complete" real response can never populate 100% of FIELD_KEYS.
    assert.equal(lookup.status, LOOKUP_STATUS.PARTIAL);
    assert.equal(fetchCallCount, 1);
    assert.equal(lookup.fields.yearBuilt.value, 2001);
    assert.equal(lookup.fields.roofType.value, 'Composition');
    assert.equal(lookup.fields.parcelNumber.value, '99-000-111');
    // Never fabricated -- no evidence of these anywhere in the real response.
    assert.equal(lookup.fields.ownerOnRecord.value, null);
    assert.equal(lookup.fields.footprintAreaValue.value, null);

    // 2. Cache reuse -- a second request for the SAME address must not call
    // the provider again (address-fingerprint cache, 30-day TTL).
    const secondLookup = await service.requestPropertyIntelligence(db, {
      reportId: 'report-e2e-1',
      propertyProfile: CONFIRMED_US_PROFILE,
      requestedByUid: 'uid-e2e',
    });
    assert.equal(fetchCallCount, 1, 'no second provider call -- served from the shared cache');
    assert.equal(secondLookup.cacheHit, true);

    // 3. Selective apply (provider_confirmed mode) -- user accepts only
    // yearBuilt/roofType, everything else stays unconfirmed.
    const applied1 = await service.applyPropertyIntelligence(db, {
      reportId: 'report-e2e-1',
      existingIntelligence: null,
      mode: 'provider_confirmed',
      lookupId: lookup.lookupId,
      selectedKeys: ['yearBuilt', 'roofType'],
      overrides: {},
      requestedByUid: 'uid-e2e',
    });
    assert.equal(applied1.fields.yearBuilt.verificationStatus, VERIFICATION_STATUS.USER_CONFIRMED);
    assert.equal(applied1.fields.roofType.verificationStatus, VERIFICATION_STATUS.USER_CONFIRMED);
    assert.equal(
      applied1.fields.bedrooms.verificationStatus,
      VERIFICATION_STATUS.UNAVAILABLE,
      'not selected -- stays unconfirmed'
    );

    // 4. User overrides yearBuilt by hand; a LATER apply (re-accepting the
    // same lookup, without re-overriding yearBuilt) must never clobber it.
    const applied2 = await service.applyPropertyIntelligence(db, {
      reportId: 'report-e2e-1',
      existingIntelligence: applied1,
      mode: 'manual',
      overrides: { yearBuilt: 1999 },
      requestedByUid: 'uid-e2e',
    });
    assert.equal(applied2.fields.yearBuilt.value, 1999);
    assert.equal(applied2.fields.yearBuilt.userOverride, true);

    const applied3 = await service.applyPropertyIntelligence(db, {
      reportId: 'report-e2e-1',
      existingIntelligence: applied2,
      mode: 'provider_confirmed',
      lookupId: lookup.lookupId,
      selectedKeys: ['yearBuilt', 'bedrooms'], // re-selecting yearBuilt again, plus a new field
      overrides: {},
      requestedByUid: 'uid-e2e',
    });
    assert.equal(
      applied3.fields.yearBuilt.value,
      1999,
      'user override survives a later apply that did not explicitly re-override it'
    );
    assert.equal(applied3.fields.yearBuilt.userOverride, true);
    assert.equal(applied3.fields.bedrooms.value, 4, 'newly-selected field is applied normally');

    // 5. Persist into a report doc (FakeFirestore -- never real/production
    // Firestore) and read it back, mirroring how routes/reports.js actually
    // stores `report.propertyProfile.propertyIntelligence`.
    await db
      .collection('reports')
      .doc('report-e2e-1')
      .set({
        status: 'draft',
        content: [
          '## SECTION 3: PROPERTY INFO',
          'Two-story single family residence.',
          '',
          '## SECTION 4: INSPECTION DETAILS & OVERVIEW',
          'Visible conditions appear consistent with water intrusion.',
        ].join('\n'),
        propertyProfile: { fields: CONFIRMED_US_PROFILE.fields, propertyIntelligence: applied3 },
      });
    const persisted = (await db.collection('reports').doc('report-e2e-1').get()).data();
    assert.equal(persisted.propertyProfile.propertyIntelligence.fields.yearBuilt.value, 1999);

    // 6. Confirmed-only Section 3 block reaches the PDF export; an unconfirmed
    // (still just provider-supplied) field never does.
    const block = buildSection3PropertyBlockMarkdown(persisted.propertyProfile);
    const renderedContent = injectSection3PropertyBlock(persisted.content, block);
    assert.match(renderedContent, /Confirmed Property Details/);
    assert.match(renderedContent, /1999/); // the user's override value, not the provider's 2001
    assert.match(renderedContent, /Composition/); // confirmed roofType

    const pdfBuffer = await generatePDF(
      { ...persisted, content: renderedContent },
      { companyName: 'Example Firm', watermark: false }
    );
    const pdfText = (await extractPerPageText(pdfBuffer)).join(' ');
    assert.match(pdfText, /1999/);
    assert.match(pdfText, /Composition/);
    assert.doesNotMatch(
      pdfText,
      /99-000-111/,
      'parcelNumber was never selected/confirmed -- must not leak into the export'
    );
  })
);

test(
  'real Phase 47 pipeline: a provider-side no-match (real empty-detail shape) resolves to a safe NO_MATCH status, never an error, report creation never blocked',
  withEnv(REALTY_ENV, async () => {
    const emptyDetailProvider = {
      PROVIDER_NAME: realtyApiProviderReal.PROVIDER_NAME,
      lookupProperty: (normalizedAddress, options = {}) =>
        realtyApiProviderReal.lookupProperty(normalizedAddress, {
          ...options,
          fetchImpl: async () => ({
            ok: true,
            status: 200,
            json: async () => ({
              message: '404: address not found on realtor.com',
              source: 'realtor.com',
              detail: {},
            }),
          }),
        }),
      normalizePropertyResult: realtyApiProviderReal.normalizePropertyResult,
    };
    delete require.cache[registryPath];
    delete require.cache[servicePath];
    require.cache[registryPath] = {
      id: registryPath,
      filename: registryPath,
      loaded: true,
      exports: {
        getPropertyIntelligenceProvider: () => emptyDetailProvider,
        PROVIDERS: {},
        DEFAULT_PROVIDER: 'realty_api',
      },
    };
    const service = require('../services/propertyIntelligenceService');
    const db = new FakeFirestore();

    const result = await service.requestPropertyIntelligence(db, {
      reportId: 'report-e2e-nomatch',
      propertyProfile: CONFIRMED_US_PROFILE,
      requestedByUid: 'uid-e2e',
    });
    assert.equal(result.status, LOOKUP_STATUS.NO_MATCH);
    // Manual entry must remain fully available -- an empty result, not a
    // thrown/blocking error.
    assert.equal(result.intelligence.fields.yearBuilt.value, null);
  })
);

// Production regression (2026-09-25): a real, SPARSE 200 response (null
// sale price, no tax history, no details_sections bullets, no flood data)
// normalizes to many `undefined` values, which real Firestore rejected on
// the cache write -- an uncoded error -> generic 500
// PROPERTY_INTELLIGENCE_ERROR after the billed provider call had already
// succeeded. ValidatingFakeFirestore applies the real SDK's document
// validation (offline, never committed) to every write, which the plain
// FakeFirestore never did.
const SANITIZED_SPARSE_RESPONSE = {
  message: 'Success',
  source: 'realtor.com',
  detail: {
    property_id: '9998887771',
    last_update_date: '2026-03-01T00:00:00Z',
    last_sold_date: null,
    last_sold_price: null,
    details: {
      beds: 3,
      baths: '2',
      sqft: 1500,
      lot_sqft: null,
      stories: 1,
      year_built: 1998,
      garage: 0,
      type: 'single_family',
      heating: null,
      cooling: null,
    },
    tax_history: [],
    details_sections: [],
  },
};

test(
  'real Phase 47 pipeline: a sparse provider response resolves to PARTIAL and every write passes real Firestore validation (no generic 500)',
  withEnv(REALTY_ENV, async () => {
    const sparseProvider = {
      PROVIDER_NAME: realtyApiProviderReal.PROVIDER_NAME,
      lookupProperty: (normalizedAddress, options = {}) =>
        realtyApiProviderReal.lookupProperty(normalizedAddress, {
          ...options,
          fetchImpl: async () => ({ ok: true, status: 200, json: async () => SANITIZED_SPARSE_RESPONSE }),
        }),
      normalizePropertyResult: realtyApiProviderReal.normalizePropertyResult,
    };
    delete require.cache[registryPath];
    delete require.cache[servicePath];
    require.cache[registryPath] = {
      id: registryPath,
      filename: registryPath,
      loaded: true,
      exports: {
        getPropertyIntelligenceProvider: () => sparseProvider,
        PROVIDERS: {},
        DEFAULT_PROVIDER: 'realty_api',
      },
    };
    const service = require('../services/propertyIntelligenceService');
    const db = new ValidatingFakeFirestore();

    const result = await service.requestPropertyIntelligence(db, {
      reportId: 'report-e2e-sparse',
      propertyProfile: CONFIRMED_US_PROFILE,
      requestedByUid: 'uid-e2e',
    });
    assert.equal(result.status, LOOKUP_STATUS.PARTIAL);
    assert.equal(result.fields.yearBuilt.value, 1998);
    assert.equal(result.fields.garageSpaces.value, 0, 'a real 0 survives the cache write and validation');
    assert.equal(result.fields.lastSalePrice.value, null);
    assert.equal(result.fields.roofType.value, null);

    // The cache doc was actually written (and validated) -- a second request
    // is served from it, not re-billed.
    const second = await service.requestPropertyIntelligence(db, {
      reportId: 'report-e2e-sparse',
      propertyProfile: CONFIRMED_US_PROFILE,
      requestedByUid: 'uid-e2e',
    });
    assert.equal(second.cacheHit, true);
    assert.equal(second.fields.garageSpaces.value, 0);
  })
);
