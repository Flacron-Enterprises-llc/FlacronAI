const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

process.env.ADDRESS_LOOKUP_RATE_LIMIT_PER_MIN = '1000';
process.env.PROPERTY_INTELLIGENCE_RATE_LIMIT_PER_MIN = '1000';

// Phase 47. Route-level tests for the property-intelligence endpoints --
// real Express app + the real reports.js router, faking `../config/firebase`
// (auth) and `../services/propertyIntelligenceService` (already covered
// directly by property-intelligence-service.test.js), matching
// property-profile-route.test.js's own established convention.

const firebaseConfigPath = require.resolve('../config/firebase');
const auditLogServicePath = require.resolve('../services/auditLogService');
const propertyServicePath = require.resolve('../services/propertyService');
const intelligenceServicePath = require.resolve('../services/propertyIntelligenceService');
const reportsRoutePath = require.resolve('../routes/reports');

const TEST_UID = 'intel-route-uid';
const TEST_EMAIL = 'intel-route@example.com';
const AUTH_TIME = 1700000000;

function makeFakeDb(reportsById, usersById) {
  const reportRef = (id) => ({
    get: async () => ({ exists: !!reportsById[id], data: () => reportsById[id] }),
    update: async (patch) => {
      reportsById[id] = { ...reportsById[id], ...patch };
    },
  });
  const userRef = (uid) => ({
    get: async () => ({ exists: !!usersById[uid], data: () => usersById[uid] }),
    update: async (patch) => {
      usersById[uid] = { ...(usersById[uid] || {}), ...patch };
    },
  });
  return {
    collection: (name) => {
      if (name === 'reports') return { doc: reportRef };
      if (name === 'users') return { doc: userRef };
      throw new Error(`fake db: unexpected collection "${name}"`);
    },
  };
}

function installFakes({ reportsById, intelligenceServiceImpl }) {
  delete require.cache[firebaseConfigPath];
  delete require.cache[auditLogServicePath];
  delete require.cache[propertyServicePath];
  delete require.cache[intelligenceServicePath];
  delete require.cache[reportsRoutePath];

  const fakeDb = makeFakeDb(reportsById, { [TEST_UID]: { tier: 'starter', email: TEST_EMAIL } });
  const auditLogs = [];
  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath, filename: firebaseConfigPath, loaded: true,
    exports: {
      getAuth: () => ({ verifyIdToken: async () => ({ uid: TEST_UID, email: TEST_EMAIL, auth_time: AUTH_TIME, iat: AUTH_TIME }) }),
      getFirestore: () => fakeDb,
      FieldValue: { serverTimestamp: () => new Date().toISOString() },
      Timestamp: {},
      admin: {},
      initFirebase: () => {},
      getBucket: () => {},
    },
  };
  require.cache[auditLogServicePath] = {
    id: auditLogServicePath, filename: auditLogServicePath, loaded: true,
    exports: { recordAuditLog: async (entry) => auditLogs.push(entry) },
  };
  require.cache[propertyServicePath] = {
    id: propertyServicePath, filename: propertyServicePath, loaded: true,
    exports: {
      getPublicConfig: () => ({ enabled: true }),
      normalizePlace: async () => ({ normalizationToken: 'an_test', ambiguous: false, profile: { fields: {} } }),
      buildConfirmedPropertyProfile: async () => ({ status: 'confirmed', propertyLookupEligible: true, fields: {} }),
    },
  };
  require.cache[intelligenceServicePath] = {
    id: intelligenceServicePath, filename: intelligenceServicePath, loaded: true,
    exports: {
      getPublicConfig: () => ({ enabled: true, configured: false, schemaVersion: 1, supportedCountryCodes: ['US'], capabilities: [] }),
      buildProviderRequestInput: () => ({}),
      computeEligibility: () => ({ eligible: true, reason: null }),
      requestPropertyIntelligence: async () => ({ status: 'full', lookupId: 'pl_test', fields: {} }),
      applyPropertyIntelligence: async () => ({ status: 'confirmed', fields: {} }),
      staleIfAddressChanged: (intel) => intel,
      ...intelligenceServiceImpl,
    },
  };

  const router = require('../routes/reports');
  return { router, auditLogs };
}

async function withTestServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/reports', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}/api/reports`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function seedReport(overrides = {}) {
  return { id: 'report-1', userId: TEST_UID, status: 'draft', photos: [], ...overrides };
}

const authed = { Authorization: 'Bearer faketoken', 'Content-Type': 'application/json' };

test('GET /property-lookup/intelligence/config is public (no auth) and never leaks a provider name/key', async () => {
  const { router } = installFakes({ reportsById: {} });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/property-lookup/intelligence/config`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(typeof body.enabled, 'boolean');
    const serialized = JSON.stringify(body).toLowerCase();
    assert.ok(!serialized.includes('realty') && !serialized.includes('key'));
  });
});

test('POST /:id/property-lookup/intelligence requires auth', async () => {
  const { router } = installFakes({ reportsById: { 'report-1': seedReport() } });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1/property-lookup/intelligence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 401);
  });
});

test('POST /:id/property-lookup/intelligence: 404 when the report does not exist', async () => {
  const { router } = installFakes({ reportsById: {} });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/does-not-exist/property-lookup/intelligence`, { method: 'POST', headers: authed, body: '{}' });
    assert.equal(res.status, 404);
  });
});

test('POST /:id/property-lookup/intelligence: a non-owner with no access grant gets 404', async () => {
  const { router } = installFakes({ reportsById: { 'report-1': seedReport({ userId: 'someone-else' }) } });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1/property-lookup/intelligence`, { method: 'POST', headers: authed, body: '{}' });
    assert.equal(res.status, 404);
  });
});

test('POST /:id/property-lookup/intelligence: finalized report is immutable (409 REPORT_FINALIZED)', async () => {
  const { router } = installFakes({ reportsById: { 'report-1': seedReport({ status: 'finalized' }) } });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1/property-lookup/intelligence`, { method: 'POST', headers: authed, body: '{}' });
    const body = await res.json();
    assert.equal(res.status, 409);
    assert.equal(body.code, 'REPORT_FINALIZED');
  });
});

test('POST /:id/property-lookup/intelligence: a non-US/unconfirmed address returns 200 with a safe not_eligible status, never an error', async () => {
  const { router } = installFakes({
    reportsById: { 'report-1': seedReport() },
    intelligenceServiceImpl: { requestPropertyIntelligence: async () => ({ status: 'not_eligible', reason: 'country_not_supported', intelligence: {} }) },
  });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1/property-lookup/intelligence`, { method: 'POST', headers: authed, body: '{}' });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.status, 'not_eligible');
  });
});

test('POST /:id/property-lookup/intelligence: provider not configured maps to 503, manual entry remains available', async () => {
  const err = Object.assign(new Error('not configured'), { code: 'PROPERTY_PROVIDER_NOT_CONFIGURED' });
  const { router } = installFakes({
    reportsById: { 'report-1': seedReport() },
    intelligenceServiceImpl: { requestPropertyIntelligence: async () => { throw err; } },
  });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1/property-lookup/intelligence`, { method: 'POST', headers: authed, body: '{}' });
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.equal(body.code, 'PROPERTY_PROVIDER_NOT_CONFIGURED');
  });
});

test('GET /:id/property-lookup/intelligence: a non-owner with no access grant gets 404', async () => {
  const { router } = installFakes({ reportsById: { 'report-1': seedReport({ userId: 'someone-else' }) } });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1/property-lookup/intelligence`, { headers: authed });
    assert.equal(res.status, 404);
  });
});

test('GET /:id/property-lookup/intelligence: returns an empty synthesized view when none exists yet', async () => {
  const { router } = installFakes({ reportsById: { 'report-1': seedReport() } });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1/property-lookup/intelligence`, { headers: authed });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.propertyIntelligence.status, 'unavailable');
  });
});

test('PUT /:id/property-intelligence: provider_confirmed mode without a lookupId is a 400 VALIDATION_ERROR', async () => {
  const { router } = installFakes({ reportsById: { 'report-1': seedReport() } });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1/property-intelligence`, { method: 'PUT', headers: authed, body: JSON.stringify({ mode: 'provider_confirmed' }) });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.field, 'lookupId');
  });
});

test('PUT /:id/property-intelligence: finalized report is immutable', async () => {
  const { router } = installFakes({ reportsById: { 'report-1': seedReport({ status: 'finalized' }) } });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1/property-intelligence`, { method: 'PUT', headers: authed, body: JSON.stringify({ mode: 'manual', overrides: {} }) });
    const body = await res.json();
    assert.equal(res.status, 409);
    assert.equal(body.code, 'REPORT_FINALIZED');
  });
});

test('PUT /:id/property-intelligence: a forged/unknown lookupId is rejected, nothing persisted', async () => {
  const err = Object.assign(new Error('gone'), { code: 'PROPERTY_LOOKUP_NOT_FOUND' });
  const reportsById = { 'report-1': seedReport() };
  const { router } = installFakes({ reportsById, intelligenceServiceImpl: { applyPropertyIntelligence: async () => { throw err; } } });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1/property-intelligence`, {
      method: 'PUT', headers: authed, body: JSON.stringify({ mode: 'provider_confirmed', lookupId: 'pl_forged', selectedKeys: ['yearBuilt'] }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.code, 'PROPERTY_LOOKUP_NOT_FOUND');
    assert.equal(reportsById['report-1'].propertyProfile, undefined);
  });
});

test('PUT /:id/property-intelligence: manual mode succeeds and persists into report.propertyProfile.propertyIntelligence', async () => {
  const reportsById = { 'report-1': seedReport() };
  const savedIntel = { status: 'confirmed', fields: { yearBuilt: { value: 1998 } } };
  const { router, auditLogs } = installFakes({ reportsById, intelligenceServiceImpl: { applyPropertyIntelligence: async () => savedIntel } });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1/property-intelligence`, {
      method: 'PUT', headers: authed, body: JSON.stringify({ mode: 'manual', overrides: { yearBuilt: 1998 } }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(body.propertyIntelligence, savedIntel);
    assert.deepEqual(reportsById['report-1'].propertyProfile.propertyIntelligence, savedIntel);
    assert.equal(auditLogs.some((a) => a.action === 'property_intelligence_confirmed'), true);
  });
});

test('PUT /:id/property-intelligence: preserves the rest of propertyProfile (address fields) untouched', async () => {
  const existingProfile = { status: 'confirmed', fields: { city: { value: 'Austin' } } };
  const reportsById = { 'report-1': seedReport({ propertyProfile: existingProfile }) };
  const { router } = installFakes({ reportsById, intelligenceServiceImpl: { applyPropertyIntelligence: async () => ({ status: 'confirmed', fields: {} }) } });
  await withTestServer(router, async (base) => {
    await fetch(`${base}/report-1/property-intelligence`, { method: 'PUT', headers: authed, body: JSON.stringify({ mode: 'manual', overrides: {} }) });
    assert.equal(reportsById['report-1'].propertyProfile.fields.city.value, 'Austin');
  });
});
