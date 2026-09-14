const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

// QA regression: an Invoice could be generated from a Repair Estimate that
// was still draft/unapproved -- POST /:id/invoice never checked the
// estimate's status at all (only that it wasn't 'archived'), so the
// resulting Invoice's own content falsely claimed its services were "reused
// from the approved Repair Estimate" even though the linked estimate had
// never been through /approve. Fixed by re-checking the estimate's CURRENT
// PERSISTED status (never a client-supplied value) against `isReviewed` --
// the same finalized/approved/completed canonical check every other
// "is this document approved" gate in reports.js already uses (see e.g. the
// Coverage Determination Letter's own estimate-eligibility check). This is
// an end-to-end route test (real Express app + real reports.js router, only
// `../config/firebase` faked) rather than a pure-function test, because the
// bug and the fix both live in the route's own Firestore-read/guard
// sequencing, not in an isolated helper -- same technique as
// backend/test/mfa-verify-route.test.js.

const firebaseConfigPath = require.resolve('../config/firebase');
const auditLogServicePath = require.resolve('../services/auditLogService');
const reportsRoutePath = require.resolve('../routes/reports');

const TEST_UID = 'invoice-eligibility-uid';
const TEST_EMAIL = 'invoice-eligibility@example.com';
const AUTH_TIME = 1700000000;

const VALID_LINE_ITEMS = [
  {
    code: 'L1',
    description: 'General conditions and materials',
    qty: 1,
    unit: 'EA',
    unitPrice: 550,
    lineTotal: 550,
    taxable: true,
  },
];

function baseInvoiceBody() {
  return {
    billTo: { name: 'Jane Homeowner', address: '123 Main St, Springfield, ST 00000' },
    remitTo: { name: 'Acme Restoration LLC', instructions: 'Remit via ACH to account 000123456' },
    invoiceNumber: 'INV-1001',
    invoiceDate: '2026-09-13',
    taxRatePercent: 8,
  };
}

function makeFakeDb(reportsById, usersById) {
  const auditLogs = [];
  const reportRef = (id) => ({
    get: async () => ({ exists: !!reportsById[id], data: () => reportsById[id] }),
    set: async (data) => {
      reportsById[id] = data;
    },
    update: async (patch) => {
      reportsById[id] = { ...(reportsById[id] || {}), ...patch };
    },
    collection: () => ({ add: async () => ({ id: 'fake-version-id' }) }),
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
      if (name === 'auditLogs') return { add: async (data) => auditLogs.push(data) };
      throw new Error(`fake db: unexpected collection "${name}"`);
    },
    _auditLogs: auditLogs,
  };
}

// Installs a fake `../config/firebase` (Firebase ID token always verifies as
// TEST_UID, real reports.js runs against an in-memory Firestore substitute)
// and returns { router, reportsById, usersById } for the caller to seed and
// inspect. `services/auditLogService.js` calls `getFirestore()` itself (not
// passed a `db` param), so it must see the SAME fake module instance.
function installFakes({ reportsById, usersById }) {
  delete require.cache[firebaseConfigPath];
  delete require.cache[auditLogServicePath];
  delete require.cache[reportsRoutePath];

  const fakeDb = makeFakeDb(reportsById, usersById);
  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath,
    filename: firebaseConfigPath,
    loaded: true,
    exports: {
      getAuth: () => ({
        verifyIdToken: async () => ({
          uid: TEST_UID,
          email: TEST_EMAIL,
          auth_time: AUTH_TIME,
          iat: AUTH_TIME,
        }),
      }),
      getFirestore: () => fakeDb,
      FieldValue: { serverTimestamp: () => new Date().toISOString() },
      Timestamp: {},
      admin: {},
      initFirebase: () => {},
      getBucket: () => {},
    },
  };

  const router = require('../routes/reports');
  return { router, fakeDb };
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

function seedEstimate(status, overrides = {}) {
  return {
    id: 'estimate-1',
    userId: TEST_UID,
    documentType: 'RepairEstimate',
    status,
    claimNumber: 'CLM-1',
    insuredName: 'Jane Homeowner',
    insuredEmail: '',
    propertyAddress: '123 Main St',
    policyNumber: '',
    lossDate: '2026-08-01',
    lossType: 'Water',
    lineItems: VALID_LINE_ITEMS,
    overheadProfitPercent: 10,
    ...overrides,
  };
}

function seedUser() {
  return { tier: 'starter', reportsThisMonth: 0, email: TEST_EMAIL };
}

async function postInvoice(base, body = baseInvoiceBody()) {
  const res = await fetch(`${base}/estimate-1/invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json() };
}

for (const status of ['draft', 'processing', 'failed']) {
  test(`POST /:id/invoice rejects a Repair Estimate with status "${status}" (unapproved) with 409 ESTIMATE_NOT_FINALIZED`, async () => {
    const reportsById = { 'estimate-1': seedEstimate(status) };
    const usersById = { [TEST_UID]: seedUser() };
    const { router } = installFakes({ reportsById, usersById });

    await withTestServer(router, async (base) => {
      const { res, body } = await postInvoice(base);
      assert.equal(res.status, 409);
      assert.equal(body.success, false);
      assert.equal(body.code, 'ESTIMATE_NOT_FINALIZED');
      assert.equal(
        body.error,
        'Approve and finalize the Repair Estimate before generating an Invoice.'
      );
      // No partial Invoice document was created -- only the original estimate exists.
      assert.deepEqual(Object.keys(reportsById), ['estimate-1']);
    });
  });
}

test('POST /:id/invoice: a client-supplied fake "finalized" status in the request body cannot bypass the backend -- only the persisted estimate status is read', async () => {
  const reportsById = { 'estimate-1': seedEstimate('draft') };
  const usersById = { [TEST_UID]: seedUser() };
  const { router } = installFakes({ reportsById, usersById });

  await withTestServer(router, async (base) => {
    // The route never reads a "status" field from the body at all, but a
    // manipulated/naive attacker payload might still try to smuggle one in.
    const { res, body } = await postInvoice(base, { ...baseInvoiceBody(), status: 'finalized' });
    assert.equal(res.status, 409);
    assert.equal(body.code, 'ESTIMATE_NOT_FINALIZED');
    assert.equal(reportsById['estimate-1'].status, 'draft', 'the persisted estimate itself must be untouched');
    assert.deepEqual(Object.keys(reportsById), ['estimate-1'], 'no Invoice record was created');
  });
});

for (const status of ['finalized', 'approved', 'completed']) {
  test(`POST /:id/invoice succeeds for a Repair Estimate with canonical reviewed status "${status}"`, async () => {
    const reportsById = { 'estimate-1': seedEstimate(status) };
    const usersById = { [TEST_UID]: seedUser() };
    const { router } = installFakes({ reportsById, usersById });

    await withTestServer(router, async (base) => {
      const { res, body } = await postInvoice(base);
      assert.equal(res.status, 201, JSON.stringify(body));
      assert.equal(body.success, true);
      const newIds = Object.keys(reportsById).filter((id) => id !== 'estimate-1');
      assert.equal(newIds.length, 1, 'exactly one new Invoice document was created');
      const invoice = reportsById[newIds[0]];
      assert.equal(invoice.documentType, 'Invoice');
      assert.equal(invoice.relatedReportId, 'estimate-1');
      assert.equal(invoice.overheadProfitPercent, 10, 'O&P is still carried over unchanged');
      assert.equal(
        invoice.totals.balanceDue,
        649,
        'invoice totals still compute correctly (550 subtotal + 55 O&P + 44 tax = 649, unaffected by this fix)'
      );
    });
  });
}

test('POST /:id/invoice: SOURCE_NOT_ESTIMATE and NOT_FOUND checks still fire before the new status guard (no regression to the existing checks)', async () => {
  const reportsById = {
    'not-an-estimate': { id: 'not-an-estimate', userId: TEST_UID, documentType: 'Report', status: 'finalized' },
  };
  const usersById = { [TEST_UID]: seedUser() };
  const { router } = installFakes({ reportsById, usersById });

  await withTestServer(router, async (base) => {
    const res1 = await fetch(`${base}/does-not-exist/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify(baseInvoiceBody()),
    });
    assert.equal(res1.status, 404);
    assert.equal((await res1.json()).code, 'NOT_FOUND');

    const res2 = await fetch(`${base}/not-an-estimate/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
      body: JSON.stringify(baseInvoiceBody()),
    });
    const body2 = await res2.json();
    assert.equal(res2.status, 400);
    assert.equal(body2.code, 'SOURCE_NOT_ESTIMATE');
  });
});
