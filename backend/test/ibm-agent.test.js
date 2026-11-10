const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { FakeFirestore } = require('./helpers/fakeFirestore');

process.env.IBM_BROKER_USERNAME = 'broker-user';
process.env.IBM_BROKER_PASSWORD = 'broker-pass';
process.env.IBM_LINK_SECRET = 'link-secret-for-tests';
process.env.IBM_SERVICE_ID = 'svc-1';
process.env.IBM_FREE_PLAN_ID = 'plan-free';
process.env.IBM_STARTER_PLAN_ID = 'plan-starter';
process.env.IBM_PACK_SIZE = '5';
process.env.FRONTEND_URL = 'https://app.example.test';
process.env.PUBLIC_API_URL = 'https://api.example.test';

let db = new FakeFirestore();
require.cache[require.resolve('../config/firebase')] = {
  id: 'firebase-stub', loaded: true, exports: { getFirestore: () => db },
};

const ibm = require('../services/ibmAgentService');
const { createIbmBrokerRouter } = require('../routes/ibmBroker');
const { buildSpec } = require('../routes/orchestrate');

const basic = (u, p) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;

const withBroker = async (fn) => {
  const app = express();
  app.use(express.json());
  app.use('/ibm-broker', createIbmBrokerRouter({ getDb: () => db }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/ibm-broker`;
  const call = async (method, path, body, auth = basic('broker-user', 'broker-pass')) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  try { await fn(call); } finally { server.close(); }
};

test.beforeEach(() => { db = new FakeFirestore(); });

test('broker rejects missing or wrong basic auth', async () => {
  await withBroker(async (call) => {
    assert.equal((await call('GET', '/v2/catalog', null, null)).status, 401);
    assert.equal((await call('GET', '/v2/catalog', null, basic('broker-user', 'nope'))).status, 401);
    const ok = await call('GET', '/v2/catalog');
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.services[0].plans.map((p) => p.id), ['plan-free', 'plan-starter']);
  });
});

test('provision is idempotent, returns a signed dashboard link, and rejects unknown plans', async () => {
  await withBroker(async (call) => {
    const body = { service_id: 'svc-1', plan_id: 'plan-starter', context: { account_id: 'acc-1' } };
    const first = await call('PUT', '/v2/service_instances/inst-1', body);
    assert.equal(first.status, 201);
    const url = new URL(first.body.dashboard_url);
    assert.equal(url.origin, 'https://app.example.test');
    assert.equal(url.pathname, '/ibm/connect');
    assert.equal(ibm.verifyInstanceSignature('inst-1', url.searchParams.get('sig')), true);
    assert.equal((await call('PUT', '/v2/service_instances/inst-1', body)).status, 200);
    assert.equal((await call('PUT', '/v2/service_instances/inst-1', { ...body, plan_id: 'plan-free' })).status, 409);
    assert.equal((await call('PUT', '/v2/service_instances/inst-2', { ...body, plan_id: 'other' })).status, 400);
    const stored = (await db.collection('ibmInstances').doc('inst-1').get()).data();
    assert.equal(stored.planKind, 'starter');
    assert.equal(stored.accountId, 'acc-1');
  });
});

test('linking requires a valid signature and an unclaimed active instance', async () => {
  await withBroker(async (call) => {
    await call('PUT', '/v2/service_instances/inst-1', { service_id: 'svc-1', plan_id: 'plan-starter' });
  });
  const sig = ibm.signInstance('inst-1');
  assert.equal((await ibm.linkInstanceToUser(db, { instanceId: 'inst-1', sig: 'bad', uid: 'u1' })).code, 'INVALID_LINK');
  assert.equal((await ibm.linkInstanceToUser(db, { instanceId: 'inst-1', sig, uid: 'u1' })).ok, true);
  assert.equal((await ibm.linkInstanceToUser(db, { instanceId: 'inst-1', sig, uid: 'u2' })).code, 'INSTANCE_ALREADY_LINKED');
  const user = (await db.collection('users').doc('u1').get()).data();
  assert.equal(user.ibmPlanKind, 'starter');
  assert.equal(ibm.isIbmMeteredUser(user), true);
});

test('a pack is reported on generations 1, 6, 11 for a starter subscriber, never for free', async () => {
  await db.collection('users').doc('u1').set({ ibmInstanceId: 'inst-1', ibmPlanId: 'plan-starter', ibmPlanKind: 'starter', ibmStatus: 'active' });
  await db.collection('users').doc('u2').set({ ibmInstanceId: 'inst-2', ibmPlanId: 'plan-free', ibmPlanKind: 'free', ibmStatus: 'active' });
  const reported = [];
  const report = async (instanceId, planId, qty) => { reported.push({ instanceId, planId, qty }); return true; };
  for (let i = 0; i < 11; i += 1) await ibm.recordIbmGeneration(db, 'u1', { report });
  for (let i = 0; i < 3; i += 1) await ibm.recordIbmGeneration(db, 'u2', { report });
  assert.equal(reported.length, 3);
  assert.deepEqual(reported[0], { instanceId: 'inst-1', planId: 'plan-starter', qty: 1 });
  assert.equal((await db.collection('users').doc('u1').get()).data().ibmGenerations, 11);
});

test('deprovision stops metering but keeps the account; unknown instance is 410', async () => {
  await withBroker(async (call) => {
    await call('PUT', '/v2/service_instances/inst-1', { service_id: 'svc-1', plan_id: 'plan-starter' });
    await ibm.linkInstanceToUser(db, { instanceId: 'inst-1', sig: ibm.signInstance('inst-1'), uid: 'u1' });
    assert.equal((await call('DELETE', '/v2/service_instances/inst-1')).status, 200);
    assert.equal((await call('DELETE', '/v2/service_instances/missing')).status, 410);
    assert.equal((await call('PUT', '/v2/service_instances/inst-1/service_bindings/b1', {})).status, 422);
  });
  const user = (await db.collection('users').doc('u1').get()).data();
  assert.equal(user.ibmStatus, 'deprovisioned');
  assert.equal(ibm.isIbmMeteredUser(user), false);
});

test('bind returns the OpenAPI and docs URLs; no secrets in credentials', async () => {
  await withBroker(async (call) => {
    await call('PUT', '/v2/service_instances/inst-1', { service_id: 'svc-1', plan_id: 'plan-free' });
    const res = await call('PUT', '/v2/service_instances/inst-1/service_bindings/b1', {});
    assert.equal(res.status, 201);
    assert.equal(res.body.credentials.openapi_url, 'https://api.example.test/api/v1/orchestrate/openapi.json');
    assert.ok(!JSON.stringify(res.body).includes('broker-pass'));
  });
});

test('OpenAPI spec uses x-api-key and points at the versioned API', () => {
  const spec = buildSpec('https://api.example.test');
  assert.equal(spec.servers[0].url, 'https://api.example.test/api/v1');
  assert.deepEqual(spec.components.securitySchemes.ApiKeyAuth, { type: 'apiKey', in: 'header', name: 'x-api-key' });
  const ops = Object.values(spec.paths).flatMap((p) => Object.values(p).map((o) => o.operationId));
  assert.deepEqual(ops.sort(), ['createClaim', 'createClient', 'exportReport', 'generateReport', 'getReport', 'getReportStatus', 'listClaims', 'listClients', 'listReports'].sort());
});

test('API key management is open to IBM-linked users on any tier, still closed otherwise', () => {
  const { requireApiAccess } = require('../middleware/auth');
  const run = (user) => {
    let status = 200; let next = false;
    const res = { status(c) { status = c; return this; }, json() { return this; } };
    requireApiAccess({ user }, res, () => { next = true; });
    return { status, next };
  };
  assert.equal(run({ tier: 'starter' }).status, 403);
  assert.equal(run({ tier: 'starter', ibmInstanceId: 'i', ibmStatus: 'deprovisioned' }).status, 403);
  assert.equal(run({ tier: 'starter', ibmInstanceId: 'i', ibmStatus: 'active' }).next, true);
});
