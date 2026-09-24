const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

// This file exercises the route many times against the same TEST_UID within
// well under a minute -- raise the pricing rate limit so the route's OWN
// dedicated limiter (pricingLimiter, separate from pricingService's own
// item-count cap) never interferes with these access-control/error-mapping
// assertions (rate-limit behavior itself is not what this file tests).
process.env.PRICING_RATE_LIMIT_PER_MIN = '1000';

// Phase 43. End-to-end route test for
// POST /:id/estimate-detail/price-suggestions -- real Express app + the
// real reports.js router, faking only `../config/firebase` (auth) and
// `../services/pricingService` (the pricing logic itself, already
// exhaustively covered by pricing-service.test.js). This isolates ROUTE
// concerns -- access control, REPORT_FINALIZED, error-code -> HTTP-status
// mapping, audit logging, response shape -- from pricing-generation logic,
// matching this codebase's existing convention (see
// invoice-estimate-approval.test.js / mfa-verify-route.test.js).

const firebaseConfigPath = require.resolve('../config/firebase');
const auditLogServicePath = require.resolve('../services/auditLogService');
const pricingServicePath = require.resolve('../services/pricingService');
const reportsRoutePath = require.resolve('../routes/reports');

const TEST_UID = 'pricing-route-uid';
const TEST_EMAIL = 'pricing-route@example.com';
const AUTH_TIME = 1700000000;

function makeFakeDb(reportsById, usersById) {
  const reportRef = (id) => ({
    get: async () => ({ exists: !!reportsById[id], data: () => reportsById[id] }),
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

function installFakes({ reportsById, pricingServiceImpl, usersById }) {
  delete require.cache[firebaseConfigPath];
  delete require.cache[auditLogServicePath];
  delete require.cache[pricingServicePath];
  delete require.cache[reportsRoutePath];

  const fakeDb = makeFakeDb(
    reportsById,
    usersById || { [TEST_UID]: { tier: 'starter', email: TEST_EMAIL } }
  );
  const auditLogs = [];
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
  require.cache[auditLogServicePath] = {
    id: auditLogServicePath,
    filename: auditLogServicePath,
    loaded: true,
    exports: { recordAuditLog: async (entry) => auditLogs.push(entry) },
  };
  require.cache[pricingServicePath] = {
    id: pricingServicePath,
    filename: pricingServicePath,
    loaded: true,
    exports: { generatePricingProposal: pricingServiceImpl },
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

async function postPriceSuggestions(base, id, body = {}) {
  const res = await fetch(`${base}/${id}/estimate-detail/price-suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer faketoken' },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json() };
}

// Trust-boundary correction (2026-09-19): `generatePricingProposal` now
// returns `proposalId` and each item's `suggestionId` (renamed from
// `proposalItemId`) -- pricingService.js itself is exhaustively covered by
// pricing-service.test.js, so this route-level fixture just needs to match
// its real (post-correction) response shape.
const okProposal = {
  proposalId: 'pp-1',
  items: [{ suggestionId: 'sug-1', targetLineItemId: null, room: 'Living Room' }],
  cacheStatus: 'miss',
  pricingDate: '2026-09-19',
};

test('404 NOT_FOUND when the report does not exist', async () => {
  const { router } = installFakes({ reportsById: {}, pricingServiceImpl: async () => okProposal });
  await withTestServer(router, async (base) => {
    const { res, body } = await postPriceSuggestions(base, 'does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(body.code, 'NOT_FOUND');
  });
});

test('403 SHARE_PERMISSION_DENIED for a non-owner with no access grant at all (getReportAccess returns null -> mapped to 404, not a permission leak)', async () => {
  const { router } = installFakes({
    reportsById: { 'report-1': seedReport({ userId: 'someone-else' }) },
    pricingServiceImpl: async () => okProposal,
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postPriceSuggestions(base, 'report-1');
    assert.equal(
      res.status,
      404,
      'no access at all reads as NOT_FOUND, never leaking that the report exists'
    );
    assert.equal(body.code, 'NOT_FOUND');
  });
});

test('403 SHARE_PERMISSION_DENIED for a grantee with only "view" access (below "review")', async () => {
  const { router } = installFakes({
    reportsById: {
      'report-1': seedReport({
        userId: 'someone-else',
        assignedUsers: [{ uid: TEST_UID, permission: 'view' }],
      }),
    },
    pricingServiceImpl: async () => okProposal,
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postPriceSuggestions(base, 'report-1');
    assert.equal(res.status, 403);
    assert.equal(body.code, 'SHARE_PERMISSION_DENIED');
  });
});

test('a "review" grantee (non-owner) IS allowed to generate a proposal', async () => {
  const { router } = installFakes({
    reportsById: {
      'report-1': seedReport({
        userId: 'someone-else',
        assignedUsers: [{ uid: TEST_UID, permission: 'review' }],
      }),
    },
    pricingServiceImpl: async () => okProposal,
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postPriceSuggestions(base, 'report-1');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.success, true);
  });
});

test('409 REPORT_FINALIZED blocks generating a new proposal against a finalized report (even though nothing would be persisted)', async () => {
  let called = false;
  const { router } = installFakes({
    reportsById: { 'report-1': seedReport({ status: 'finalized' }) },
    pricingServiceImpl: async () => {
      called = true;
      return okProposal;
    },
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postPriceSuggestions(base, 'report-1');
    assert.equal(res.status, 409);
    assert.equal(body.code, 'REPORT_FINALIZED');
    assert.equal(called, false, 'the pricing service is never even invoked for a finalized report');
  });
});

test('200 success: response shape is {success, proposalId, items, cacheStatus, pricingDate} (never providerModel) and an audit log entry is recorded without the raw prompt/response text', async () => {
  const { router, auditLogs } = installFakes({
    reportsById: { 'report-1': seedReport() },
    pricingServiceImpl: async () => okProposal,
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postPriceSuggestions(base, 'report-1', {
      locationContext: { country: 'US' },
      items: [{}],
    });
    assert.equal(res.status, 200);
    assert.deepEqual(
      Object.keys(body).sort(),
      ['cacheStatus', 'items', 'pricingDate', 'proposalId', 'success'].sort()
    );
    assert.equal(body.proposalId, 'pp-1');
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].suggestionId, 'sug-1');
    assert.ok(!('providerModel' in body.items[0]), 'the route never forwards providerModel to the client');
  });
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, 'pricing_suggestions_generated');
  assert.deepEqual(Object.keys(auditLogs[0].meta).sort(), ['cacheStatus', 'itemCount']);
});

const ERROR_CODE_TO_STATUS = [
  ['PRICING_PROVIDER_UNAVAILABLE', 503],
  ['PRICING_TIMEOUT', 504],
  ['PRICING_RATE_LIMITED', 429],
  ['PRICING_QUOTA_EXCEEDED', 402],
  ['PRICING_AUTH_FAILED', 500],
  ['PRICING_MALFORMED_RESPONSE', 502],
  ['PRICING_LIMIT_EXCEEDED', 429],
  ['VALIDATION_ERROR', 400],
];

// VALIDATION_ERROR/PRICING_LIMIT_EXCEEDED are deliberately different: their
// `err.message` IS forwarded verbatim, because pricingService.js only ever
// throws THOSE two codes with its own safe, server-authored, specific text
// (e.g. "locationContext.country is required...") -- never a raw provider
// SDK error. Every other code's `err.message` is a generic, fixed string
// the route itself writes, regardless of what pricingService/the provider
// actually said (see config/openai.js's categorize(), which already
// discards the raw SDK message before pricingService ever sees it).
const CODES_WHOSE_MESSAGE_IS_FORWARDED = new Set(['VALIDATION_ERROR', 'PRICING_LIMIT_EXCEEDED']);

for (const [code, expectedStatus] of ERROR_CODE_TO_STATUS) {
  const forwarded = CODES_WHOSE_MESSAGE_IS_FORWARDED.has(code);
  test(`pricingService error code "${code}" maps to HTTP ${expectedStatus}${forwarded ? '' : ', with a generic message (never a raw provider error)'}`, async () => {
    const safeMessage = forwarded
      ? `${code}: a specific, server-authored validation message`
      : `raw internal detail for ${code} — sk-should-never-leak`;
    const { router } = installFakes({
      reportsById: { 'report-1': seedReport() },
      pricingServiceImpl: async () => {
        const err = new Error(safeMessage);
        err.code = code;
        throw err;
      },
    });
    await withTestServer(router, async (base) => {
      const { res, body } = await postPriceSuggestions(base, 'report-1');
      assert.equal(res.status, expectedStatus, JSON.stringify(body));
      assert.equal(body.code, code);
      assert.equal(body.success, false);
      if (forwarded) {
        assert.equal(
          body.error,
          safeMessage,
          "this code's own safe message IS forwarded to the client"
        );
      } else {
        assert.doesNotMatch(
          body.error,
          /sk-should-never-leak/,
          'a raw provider error string must never reach the HTTP response'
        );
      }
    });
  });
}

test('missing OPENAI_API_KEY (PRICING_PROVIDER_UNAVAILABLE) never crashes the route, and the rest of report editing keeps working (a sibling GET still succeeds)', async () => {
  const { router } = installFakes({
    reportsById: { 'report-1': seedReport() },
    pricingServiceImpl: async () => {
      const err = new Error('OpenAI not configured (OPENAI_API_KEY missing)');
      err.code = 'PRICING_PROVIDER_UNAVAILABLE';
      throw err;
    },
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postPriceSuggestions(base, 'report-1');
    assert.equal(res.status, 503);
    assert.equal(body.code, 'PRICING_PROVIDER_UNAVAILABLE');

    // The plain report GET (an entirely separate route) is untouched.
    const getRes = await fetch(`${base}/report-1`, {
      headers: { Authorization: 'Bearer faketoken' },
    });
    assert.equal(getRes.status, 200);
  });
});

test('an unrecognized/unthrown-code error still returns a safe generic 500 (defensive fallback, never an unhandled crash)', async () => {
  const { router } = installFakes({
    reportsById: { 'report-1': seedReport() },
    pricingServiceImpl: async () => {
      throw new Error('totally unexpected failure');
    },
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postPriceSuggestions(base, 'report-1');
    assert.equal(res.status, 500);
    assert.equal(body.code, 'PRICING_ERROR');
    assert.equal(body.success, false);
  });
});
