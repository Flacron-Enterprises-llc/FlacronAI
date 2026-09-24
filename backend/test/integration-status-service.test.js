const test = require('node:test');
const assert = require('node:assert/strict');

// Phase 48. Pure env-driven status derivation -- never a secret value,
// never claims more than each phase's own documented live-validation state.
const ORIGINAL_ENV = { ...process.env };

function withEnv(overrides, fn) {
  const before = { ...process.env };
  Object.entries(overrides).forEach(([k, v]) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  });
  // config/googlePlaces.js and config/realtyApi.js call require('dotenv').config()
  // at module scope. dotenv only skips vars that already exist in process.env, so
  // deleting a key above (to simulate "unset") makes it look unset to dotenv too --
  // it then reloads that key straight back from the real backend/.env file on the
  // require() below, silently reintroducing whatever ambient value a developer's
  // local .env happens to have. Neutralize dotenv for the duration of this isolated
  // re-require so the test only ever sees the env this helper explicitly set, never
  // ambient local config. Production startup is unaffected -- this stub is restored
  // before this function returns.
  const dotenv = require('dotenv');
  const realDotenvConfig = dotenv.config;
  dotenv.config = () => ({ parsed: {} });
  try {
    delete require.cache[require.resolve('../services/integrationStatusService')];
    delete require.cache[require.resolve('../config/photoAddOnPacks')];
    delete require.cache[require.resolve('../config/googlePlaces')];
    delete require.cache[require.resolve('../config/realtyApi')];
    return fn(require('../services/integrationStatusService'));
  } finally {
    dotenv.config = realDotenvConfig;
    process.env = before;
    delete require.cache[require.resolve('../services/integrationStatusService')];
  }
}

test.after(() => { process.env = ORIGINAL_ENV; });

test('openaiPricing: not_configured when OPENAI_API_KEY is absent', () => {
  withEnv({ OPENAI_API_KEY: undefined }, ({ getIntegrationStatus }) => {
    const status = getIntegrationStatus();
    assert.equal(status.openaiPricing.configured, false);
    assert.equal(status.openaiPricing.status, 'not_configured');
  });
});

test('openaiPricing: configured + live_validation_pending when the key is present -- never "verified" (no live call is ever made)', () => {
  withEnv({ OPENAI_API_KEY: 'sk-test-fake' }, ({ getIntegrationStatus }) => {
    const status = getIntegrationStatus();
    assert.equal(status.openaiPricing.configured, true);
    assert.equal(status.openaiPricing.status, 'live_validation_pending');
  });
});

test('stripeAddOns: test/live tracked separately, never conflated', () => {
  withEnv(
    {
      STRIPE_PRICE_PHOTOS_25_TEST: 'price_test_abc',
      STRIPE_PRICE_PHOTOS_25_LIVE: undefined,
      STRIPE_PRICE_PHOTOS_50_TEST: undefined,
      STRIPE_PRICE_PHOTOS_50_LIVE: undefined,
      STRIPE_PRICE_PHOTOS_100_TEST: undefined,
      STRIPE_PRICE_PHOTOS_100_LIVE: undefined,
      STRIPE_PRICE_PHOTOS_250_TEST: undefined,
      STRIPE_PRICE_PHOTOS_250_LIVE: undefined,
    },
    ({ getIntegrationStatus }) => {
      const status = getIntegrationStatus();
      assert.equal(status.stripeAddOns.test.configured, true);
      assert.equal(status.stripeAddOns.live.configured, false);
      assert.equal(status.stripeAddOns.live.status, 'not_configured');
    }
  );
});

test('stripeAddOns: neither mode configured -> both not_configured', () => {
  withEnv(
    {
      STRIPE_PRICE_PHOTOS_25_TEST: undefined, STRIPE_PRICE_PHOTOS_25_LIVE: undefined,
      STRIPE_PRICE_PHOTOS_50_TEST: undefined, STRIPE_PRICE_PHOTOS_50_LIVE: undefined,
      STRIPE_PRICE_PHOTOS_100_TEST: undefined, STRIPE_PRICE_PHOTOS_100_LIVE: undefined,
      STRIPE_PRICE_PHOTOS_250_TEST: undefined, STRIPE_PRICE_PHOTOS_250_LIVE: undefined,
    },
    ({ getIntegrationStatus }) => {
      const status = getIntegrationStatus();
      assert.equal(status.stripeAddOns.test.configured, false);
      assert.equal(status.stripeAddOns.live.configured, false);
    }
  );
});

test('googleAddress: not_configured when neither browser nor server key flag is set', () => {
  withEnv({ GOOGLE_MAPS_SERVER_KEY: undefined, GOOGLE_MAPS_BROWSER_KEY_CONFIGURED: undefined }, ({ getIntegrationStatus }) => {
    const status = getIntegrationStatus();
    assert.equal(status.googleAddress.serverConfigured, false);
    assert.equal(status.googleAddress.browserConfigured, false);
    assert.equal(status.googleAddress.status, 'not_configured');
  });
});

test('googleAddress: withEnv isolation holds even when an ambient local .env already sets the key (regression for dotenv re-hydration leak)', () => {
  // Simulates a developer machine where backend/.env legitimately has
  // GOOGLE_MAPS_SERVER_KEY set: pre-seed process.env the way dotenv would have
  // on process start, then ask withEnv to unset it. If config/googlePlaces.js's
  // require('dotenv').config() call were allowed to run for real inside the
  // isolated re-require, it would reload this "ambient" value right back and
  // this test would fail exactly like the original bug.
  process.env.GOOGLE_MAPS_SERVER_KEY = 'ambient-leak-simulated-key';
  try {
    withEnv({ GOOGLE_MAPS_SERVER_KEY: undefined, GOOGLE_MAPS_BROWSER_KEY_CONFIGURED: undefined }, ({ getIntegrationStatus }) => {
      const status = getIntegrationStatus();
      assert.equal(status.googleAddress.serverConfigured, false);
      assert.equal(status.googleAddress.status, 'not_configured');
    });
  } finally {
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
  }
});

test('googleAddress: live_validation_pending once configured (matches Phase 46\'s own status)', () => {
  withEnv({ GOOGLE_MAPS_SERVER_KEY: 'fake-server-key', ADDRESS_LOOKUP_ENABLED: undefined }, ({ getIntegrationStatus }) => {
    const status = getIntegrationStatus();
    assert.equal(status.googleAddress.serverConfigured, true);
    assert.equal(status.googleAddress.status, 'live_validation_pending');
  });
});

test('realtyApi: not_configured when the feature flag/key/base URL are not all set', () => {
  withEnv(
    { REALTY_API_KEY: undefined, REALTY_API_BASE_URL: undefined, PROPERTY_INTELLIGENCE_ENABLED: undefined },
    ({ getIntegrationStatus }) => {
      const status = getIntegrationStatus();
      assert.equal(status.realtyApi.envConfigured, false);
      assert.equal(status.realtyApi.status, 'not_configured');
    }
  );
});

test('realtyApi: live_validation_pending once configured (contract confirmed 2026-09-22 -- no longer hardcoded contract_pending), still never "verified"', () => {
  withEnv(
    { REALTY_API_KEY: 'fake-key', REALTY_API_BASE_URL: 'https://example.test', PROPERTY_INTELLIGENCE_ENABLED: 'true' },
    ({ getIntegrationStatus }) => {
      const status = getIntegrationStatus();
      assert.equal(status.realtyApi.envConfigured, true);
      assert.equal(status.realtyApi.status, 'live_validation_pending');
    }
  );
});

test('realtyApi: the feature flag alone (no key/base URL) is not enough to report configured', () => {
  withEnv(
    { REALTY_API_KEY: undefined, REALTY_API_BASE_URL: undefined, PROPERTY_INTELLIGENCE_ENABLED: 'true' },
    ({ getIntegrationStatus }) => {
      const status = getIntegrationStatus();
      assert.equal(status.realtyApi.envConfigured, false);
      assert.equal(status.realtyApi.status, 'not_configured');
    }
  );
});

test('no field anywhere in the response is or contains a secret/key/Price ID value', () => {
  withEnv(
    {
      OPENAI_API_KEY: 'sk-should-never-leak',
      STRIPE_PRICE_PHOTOS_25_TEST: 'price_should_never_leak',
      GOOGLE_MAPS_SERVER_KEY: 'google-key-should-never-leak',
      REALTY_API_KEY: 'realty-key-should-never-leak',
    },
    ({ getIntegrationStatus }) => {
      const status = getIntegrationStatus();
      const serialized = JSON.stringify(status);
      assert.equal(serialized.includes('should-never-leak') || serialized.includes('never_leak'), false, serialized);
    }
  );
});
