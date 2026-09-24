const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

process.env.ADDRESS_LOOKUP_RATE_LIMIT_PER_MIN = '1000';

// Phase 46. Route-level tests for GET /property-lookup/config, POST
// /property-lookup/normalize, and PUT /:id/property-profile -- real Express
// app + the real reports.js router, faking `../config/firebase` (auth) and
// `../services/propertyService` (already covered directly by
// property-service.test.js), matching pricing-route.test.js's own
// established convention for isolating route concerns.

const firebaseConfigPath = require.resolve('../config/firebase');
const auditLogServicePath = require.resolve('../services/auditLogService');
const propertyServicePath = require.resolve('../services/propertyService');
const reportsRoutePath = require.resolve('../routes/reports');

const TEST_UID = 'property-route-uid';
const TEST_EMAIL = 'property-route@example.com';
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

function installFakes({ reportsById, propertyServiceImpl }) {
  delete require.cache[firebaseConfigPath];
  delete require.cache[auditLogServicePath];
  delete require.cache[propertyServicePath];
  delete require.cache[reportsRoutePath];

  const fakeDb = makeFakeDb(reportsById, { [TEST_UID]: { tier: 'starter', email: TEST_EMAIL } });
  const auditLogs = [];
  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath,
    filename: firebaseConfigPath,
    loaded: true,
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
    id: auditLogServicePath,
    filename: auditLogServicePath,
    loaded: true,
    exports: { recordAuditLog: async (entry) => auditLogs.push(entry) },
  };
  require.cache[propertyServicePath] = {
    id: propertyServicePath,
    filename: propertyServicePath,
    loaded: true,
    exports: {
      getPublicConfig: () => ({ enabled: true, browserAutocompleteConfigured: false, serverNormalizationConfigured: true, schemaVersion: 1, capabilities: [] }),
      normalizePlace: async () => ({ normalizationToken: 'an_test', ambiguous: false, profile: { fields: {} } }),
      buildConfirmedPropertyProfile: async () => ({ status: 'confirmed', propertyLookupEligible: true, fields: {} }),
      ...propertyServiceImpl,
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

test('GET /property-lookup/config is public (no auth) and never returns a server key', async () => {
  const { router } = installFakes({ reportsById: {} });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/property-lookup/config`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(typeof body.enabled, 'boolean');
    assert.ok(!('serverKey' in body) && !JSON.stringify(body).toLowerCase().includes('secret'));
  });
});

test('POST /property-lookup/normalize requires auth', async () => {
  const { router } = installFakes({ reportsById: {} });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/property-lookup/normalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeId: 'p1' }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /property-lookup/normalize maps ADDRESS_PROVIDER_UNAVAILABLE to 503 and never blocks -- manual entry is a client-side fallback', async () => {
  const err = Object.assign(new Error('unavailable'), { code: 'ADDRESS_PROVIDER_UNAVAILABLE' });
  const { router } = installFakes({
    reportsById: {},
    propertyServiceImpl: { normalizePlace: async () => { throw err; } },
  });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/property-lookup/normalize`, { method: 'POST', headers: authed, body: JSON.stringify({ placeId: 'p1' }) });
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.equal(body.code, 'ADDRESS_PROVIDER_UNAVAILABLE');
  });
});

test('POST /property-lookup/normalize never echoes a raw permission/billing error message', async () => {
  const err = Object.assign(new Error('This API project is not authorized to bill project 123456'), { code: 'ADDRESS_BILLING_DISABLED' });
  const { router } = installFakes({ reportsById: {}, propertyServiceImpl: { normalizePlace: async () => { throw err; } } });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/property-lookup/normalize`, { method: 'POST', headers: authed, body: JSON.stringify({ placeId: 'p1' }) });
    const body = await res.json();
    assert.equal(res.status, 500);
    assert.equal(body.error.includes('123456'), false);
  });
});

test('PUT /:id/property-profile: 404 NOT_FOUND when the report does not exist', async () => {
  const { router } = installFakes({ reportsById: {} });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/does-not-exist/property-profile`, { method: 'PUT', headers: authed, body: JSON.stringify({ mode: 'manual', overrides: {} }) });
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.code, 'NOT_FOUND');
  });
});

test('PUT /:id/property-profile: a non-owner with no access grant gets 404 (never leaks report existence)', async () => {
  const { router } = installFakes({ reportsById: { 'report-1': seedReport({ userId: 'someone-else' }) } });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1/property-profile`, { method: 'PUT', headers: authed, body: JSON.stringify({ mode: 'manual', overrides: {} }) });
    assert.equal(res.status, 404);
  });
});

test('PUT /:id/property-profile: finalized report is immutable (409 REPORT_FINALIZED)', async () => {
  const { router } = installFakes({ reportsById: { 'report-1': seedReport({ status: 'finalized' }) } });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1/property-profile`, { method: 'PUT', headers: authed, body: JSON.stringify({ mode: 'manual', overrides: {} }) });
    const body = await res.json();
    assert.equal(res.status, 409);
    assert.equal(body.code, 'REPORT_FINALIZED');
  });
});

test('PUT /:id/property-profile: provider_confirmed mode without a normalizationToken is a 400 VALIDATION_ERROR', async () => {
  const { router } = installFakes({ reportsById: { 'report-1': seedReport() } });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1/property-profile`, { method: 'PUT', headers: authed, body: JSON.stringify({ mode: 'provider_confirmed' }) });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.field, 'normalizationToken');
  });
});

test('PUT /:id/property-profile: a forged/unknown normalizationToken is rejected, never persisted', async () => {
  const notFound = Object.assign(new Error('gone'), { code: 'ADDRESS_NORMALIZATION_NOT_FOUND' });
  const reportsById = { 'report-1': seedReport() };
  const { router } = installFakes({
    reportsById,
    propertyServiceImpl: { buildConfirmedPropertyProfile: async () => { throw notFound; } },
  });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1/property-profile`, {
      method: 'PUT',
      headers: authed,
      body: JSON.stringify({ mode: 'provider_confirmed', normalizationToken: 'an_forged' }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.code, 'ADDRESS_NORMALIZATION_NOT_FOUND');
    assert.equal(reportsById['report-1'].propertyProfile, undefined, 'nothing was written to the report');
  });
});

test('PUT /:id/property-profile: manual mode succeeds and persists propertyProfile on the report', async () => {
  const reportsById = { 'report-1': seedReport() };
  const savedProfile = { status: 'confirmed', propertyLookupEligible: true, fields: { city: { value: 'Austin' } } };
  const { router, auditLogs } = installFakes({
    reportsById,
    propertyServiceImpl: { buildConfirmedPropertyProfile: async () => savedProfile },
  });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1/property-profile`, {
      method: 'PUT',
      headers: authed,
      body: JSON.stringify({ mode: 'manual', overrides: { city: 'Austin' } }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(body.propertyProfile, savedProfile);
    assert.deepEqual(reportsById['report-1'].propertyProfile, savedProfile);
    assert.equal(auditLogs.some((a) => a.action === 'property_profile_confirmed'), true);
  });
});

test('GET /:id synthesizes a legacy, unverified propertyProfile view for a pre-Phase-46 report with no propertyProfile', async () => {
  const reportsById = { 'report-1': seedReport({ propertyAddress: '892 Oakwood Drive, Dallas, TX 75201', propertyCity: 'Dallas' }) };
  const { router } = installFakes({ reportsById });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1`, { headers: authed });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.report.propertyProfile.legacy, true);
    assert.equal(body.report.propertyProfile.propertyLookupEligible, false);
    assert.equal(body.report.propertyProfile.fields.city.value, 'Dallas');
  });
});

test('GET /:id leaves an existing (Phase-46-era) propertyProfile untouched, never re-synthesizing over it', async () => {
  const confirmed = { status: 'confirmed', propertyLookupEligible: true, fields: { city: { value: 'Austin' } } };
  const reportsById = { 'report-1': seedReport({ propertyProfile: confirmed }) };
  const { router } = installFakes({ reportsById });
  await withTestServer(router, async (base) => {
    const res = await fetch(`${base}/report-1`, { headers: authed });
    const body = await res.json();
    // The Phase 46 address fields/status are preserved byte-for-byte.
    assert.equal(body.report.propertyProfile.status, confirmed.status);
    assert.equal(body.report.propertyProfile.propertyLookupEligible, confirmed.propertyLookupEligible);
    assert.deepEqual(body.report.propertyProfile.fields, confirmed.fields);
    // Phase 47 additively attaches an empty (never-looked-up) synthesized
    // propertyIntelligence view -- never written back, never claims a lookup happened.
    assert.equal(body.report.propertyProfile.propertyIntelligence.status, 'unavailable');
    // The underlying stored doc-data object itself is never mutated.
    assert.equal(reportsById['report-1'].propertyProfile, confirmed);
    assert.equal('propertyIntelligence' in confirmed, false);
  });
});
