const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Contract checks for the calls the mobile app makes (mobile/src/services/api/*). REAL Express routers + REAL auth
// middleware, with only Firebase (FakeFirestore), Storage and the photo job service stubbed. Each request body is the
// exact shape the mobile code builds, and each assertion is on a response field the mobile code reads. The money
// assertions use the same inputs as mobile/src/features/reports/documents/documentCalcs.test.ts, so the app's preview
// math is proven equal to the server's.

process.env.PLAN_CONFIG_CACHE_TTL_MS = '0';

// Search, assigned-to-me and login history use `array-contains` / `in`. The shared FakeFirestore deliberately rejects
// those (other suites rely on it), so this suite adds them in a local subclass only.
class ContractFirestore extends FakeFirestore {
  _query(basePath) {
    const fs = this;
    const filters = [];
    let orderByField = null;
    let dir = 'asc';
    let limitN = null;
    const api = {
      where(field, op, value) {
        filters.push({ field, op, value });
        return api;
      },
      orderBy(field, d = 'asc') {
        orderByField = field;
        dir = d;
        return api;
      },
      limit(n) {
        limitN = n;
        return api;
      },
      async get() {
        const snap = await fs._directChildrenSnapshot(basePath);
        const ok = (f, v) =>
          f.op === 'in' ? f.value.includes(v) : f.op === 'array-contains' ? Array.isArray(v) && v.includes(f.value) : f.op === '<=' ? v <= f.value : v === f.value;
        let docs = snap.docs.filter((d) => filters.every((f) => ok(f, d.data()?.[f.field])));
        if (orderByField) {
          docs = [...docs].sort((a, b) => {
            const av = a.data()[orderByField];
            const bv = b.data()[orderByField];
            const c = av > bv ? 1 : av < bv ? -1 : 0;
            return dir === 'desc' ? -c : c;
          });
        }
        if (limitN) docs = docs.slice(0, limitN);
        return { docs: docs.map((d) => ({ ...d, ref: fs._doc(`${basePath}/${d.id}`) })), empty: docs.length === 0, size: docs.length };
      },
    };
    return api;
  }
}

const OWNER = 'owner-uid';
const MEMBER = 'member-uid';
const OUTSIDER = 'outsider-uid';
const EMAILS = { [OWNER]: 'owner@example.com', [MEMBER]: 'member@example.com', [OUTSIDER]: 'outsider@example.com' };
const AUTH_TIME = 1700000000;

const paths = {
  firebase: require.resolve('../config/firebase'),
  storage: require.resolve('../config/storage'),
  photoJob: require.resolve('../services/photoJobService'),
  audit: require.resolve('../services/auditLogService'),
};
const reload = [
  '../config/planConfig',
  '../middleware/auth',
  '../config/tiers',
  '../routes/reports',
  '../routes/users',
  '../routes/search',
  '../routes/teams',
  '../routes/photos',
].map((p) => require.resolve(p));

function setup() {
  [...Object.values(paths), ...reload].forEach((p) => delete require.cache[p]);
  const db = new ContractFirestore();
  const now = new Date().toISOString();
  db.store.set(`users/${OWNER}`, { version: 1, data: { email: EMAILS[OWNER], tier: 'enterprise', role: 'owner', reportsThisMonth: 0, onboardingCompleted: false, createdAt: now } });
  db.store.set(`users/${MEMBER}`, { version: 1, data: { email: EMAILS[MEMBER], tier: 'enterprise', role: 'reviewer', teamOwnerId: OWNER, reportsThisMonth: 0, createdAt: now } });
  db.store.set(`users/${OUTSIDER}`, { version: 1, data: { email: EMAILS[OUTSIDER], tier: 'professional', reportsThisMonth: 0, createdAt: now } });
  db.store.set('enterpriseTeams/m1', {
    version: 1,
    data: { ownerId: OWNER, email: EMAILS[MEMBER], role: 'reviewer', status: 'active', userId: MEMBER, invitedAt: now, acceptedAt: now },
  });
  const mod = (p, exports) => {
    require.cache[p] = { id: p, filename: p, loaded: true, exports };
  };
  mod(paths.firebase, {
    getAuth: () => ({
      verifyIdToken: async (token) => ({ uid: token, email: EMAILS[token], auth_time: AUTH_TIME, iat: AUTH_TIME, email_verified: true }),
    }),
    getFirestore: () => db,
    FieldValue: { serverTimestamp: () => new Date().toISOString(), increment: (n) => n, arrayUnion: (...a) => a },
    Timestamp: {},
    admin: {},
    initFirebase: () => {},
    getBucket: () => {},
  });
  mod(paths.storage, {
    reportDocumentObject: (u, id, n) => `docs/${id}/${n}`,
    exportObject: (u, n) => `exports/${u}/${n}`,
    reportImageObject: (u, id, n) => `disp/${id}/${n}`,
    reportOriginalObject: (u, id, n) => `orig/${id}/${n}`,
    reportThumbnailObject: (u, id, n) => `thumb/${id}/${n}`,
    uploadBuffer: async () => {},
    downloadBuffer: async () => Buffer.from(''),
    deleteObjects: async () => {},
    deleteObject: async () => {},
    deletePrefix: async () => {},
    getSignedUrl: async () => '',
    tokenUrl: async () => '',
  });
  mod(paths.photoJob, {
    createAnalysisJobs: async () => {},
    runPhotoAnalysisOnly: async () => {},
    getAnalysisStatus: async () => null,
    updatePhotoReview: async () => ({ success: false, code: 'NOT_FOUND' }),
  });
  mod(paths.audit, { recordAuditLog: async () => {} });

  const app = express();
  app.use(express.json());
  app.use('/api/reports', require('../routes/reports'));
  app.use('/api/users', require('../routes/users'));
  app.use('/api/search', require('../routes/search'));
  app.use('/api/teams', require('../routes/teams'));
  app.use('/api/photos', require('../routes/photos'));
  return { app, db };
}

async function serve(app, fn) {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (as, method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${as}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
  };
  try {
    await fn(call);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const seedReport = (db, id, data) =>
  db.store.set(`reports/${id}`, {
    version: 1,
    data: {
      id,
      userId: OWNER,
      claimNumber: `CLM-${id}`,
      insuredName: 'Jordan Rivera',
      insuredEmail: 'j@example.com',
      propertyAddress: '1 Main St, Austin, TX',
      lossType: 'Water Damage',
      reportType: 'Initial',
      lossDate: '2026-10-01',
      status: 'draft',
      content: '## SECTION 1 SUMMARY\nVisible conditions appear consistent with water intrusion.',
      photos: [],
      imageCount: 0,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
      ...data,
    },
  });

// Same lines as mobile documentCalcs.test.ts.
const LINES = [
  { code: 'RFG1', description: 'Tear off', qty: 24, unit: 'SQ', unitPrice: 85, taxable: false },
  { code: 'DRY1', description: 'Drywall', qty: 10.5, unit: 'SF', unitPrice: 3.33, taxable: true },
];

test('report management: archive / restore / duplicate / permanent delete / list filters', async () => {
  const { app, db } = setup();
  seedReport(db, 'r1');
  await serve(app, async (call) => {
    let r = await call(OWNER, 'DELETE', '/reports/r1');
    assert.equal(r.status, 200);
    assert.equal(db.store.get('reports/r1').data.status, 'archived');
    r = await call(OWNER, 'POST', '/reports/r1/restore');
    assert.equal(r.status, 200);
    r = await call(OWNER, 'POST', '/reports/r1/restore');
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'NOT_ARCHIVED');
    r = await call(OWNER, 'POST', '/reports/r1/duplicate');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(typeof r.body.report.id, 'string');
    r = await call(OUTSIDER, 'DELETE', '/reports/r1?permanent=true');
    assert.equal(r.status, 404, 'non-owner cannot delete');
    r = await call(OWNER, 'DELETE', '/reports/r1?permanent=true');
    assert.equal(r.status, 200);
    assert.equal(db.store.has('reports/r1'), false);
  });
});

test('share links: view link needs a finalized report; list + revoke fields the app reads', async () => {
  const { app, db } = setup();
  seedReport(db, 'r2');
  await serve(app, async (call) => {
    let r = await call(OWNER, 'POST', '/reports/r2/shares', { permission: 'view', expiresIn: '7d' });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'NOT_FINALIZED');
    r = await call(OWNER, 'POST', '/reports/r2/shares', { permission: 'comment', expiresIn: '7d' });
    assert.equal(r.status, 200, JSON.stringify(r.body)); // mobile reads `url` only
    assert.match(r.body.url, /\/shared\//);
    r = await call(OWNER, 'GET', '/reports/r2/shares');
    assert.equal(r.status, 200);
    const share = r.body.shares[0];
    for (const k of ['id', 'permission', 'expiresAt', 'url']) assert.ok(k in share, `share.${k}`);
    r = await call(OWNER, 'DELETE', `/reports/r2/shares/${share.id}`);
    assert.equal(r.status, 200);
    r = await call(MEMBER, 'GET', '/reports/r2/shares');
    assert.equal(r.status, 404, 'only the owner lists shares');
  });
});

test('request review: self and outsider rejected; teammate accepted; assigned-to-me + teams list shapes', async () => {
  const { app, db } = setup();
  seedReport(db, 'r3');
  await serve(app, async (call) => {
    const members = await call(OWNER, 'GET', '/teams/members');
    assert.equal(members.status, 200, JSON.stringify(members.body));
    const m = members.body.members.find((x) => x.userId === MEMBER);
    assert.ok(m && m.status === 'active' && m.role === 'reviewer' && m.email === EMAILS[MEMBER]);
    assert.equal(members.body.owner.uid, OWNER);

    let r = await call(OWNER, 'POST', '/reports/r3/request-review', { reviewerUid: OWNER });
    assert.equal(r.body.code, 'SELF_REVIEW');
    r = await call(OWNER, 'POST', '/reports/r3/request-review', { reviewerUid: OUTSIDER });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'REVIEWER_NOT_IN_ORG');
    r = await call(OWNER, 'POST', '/reports/r3/request-review', { reviewerUid: MEMBER, notes: 'Please check section 3' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.reviewRequest.status, 'pending');
    assert.equal(r.body.reviewRequest.reviewerUid, MEMBER);
    r = await call(OWNER, 'POST', '/reports/r3/request-review', { reviewerUid: MEMBER });
    assert.equal(r.body.code, 'REVIEW_ALREADY_PENDING');

    r = await call(MEMBER, 'GET', '/reports/assigned-to-me');
    assert.equal(r.status, 200);
    const a = r.body.reports.find((x) => x.id === 'r3');
    assert.ok(a, 'assigned report listed');
    assert.equal(a.reviewRequestStatus, 'pending');
    assert.equal(a.myPermission, 'review');

    // Section tools are owner-only and need canEditReports: a reviewer-role grantee is refused before any AI call
    // (403 TEAM_PERMISSION_DENIED from the capability check; a grantee with edit rights would get 404).
    r = await call(MEMBER, 'POST', '/reports/r3/sections/assist', { action: 'improve', title: 'SECTION 1 SUMMARY', body: 'x' });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'TEAM_PERMISSION_DENIED');
    r = await call(OWNER, 'POST', '/reports/r3/sections/assist', { action: 'nope', title: 'T', body: 'x' });
    assert.equal(r.body.code, 'INVALID_ACTION');
  });
});

test('repair estimate → invoice → coverage letter: gating, and server totals equal the mobile previews', async () => {
  const { app, db } = setup();
  seedReport(db, 'base', { status: 'draft' });
  await serve(app, async (call) => {
    // Body exactly as RepairEstimateSheet builds it.
    let r = await call(OWNER, 'POST', '/reports/base/estimate', {
      estimateNumber: 'EST-CLM-base-01',
      estimateDate: '2026-10-30',
      priceListBasis: '',
      preparedWith: '',
      taxBasis: '',
      overheadProfitPercent: 10,
      taxRatePercent: 8.25,
      lineItems: LINES,
      depreciationSchedule: [{ item: 'Roof', condition: 'Fair', ageYears: 12, lifeExpectancyYears: 25, depreciationPercent: 48, relatedLineItemCodes: ['RFG1'] }],
      changeSummary: 'Initial estimate created',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const est = r.body.report;
    assert.equal(est.documentType, 'RepairEstimate');
    assert.equal(est.relatedReportId, 'base');
    assert.deepEqual(
      { subtotal: est.totals.subtotal, overheadProfit: est.totals.overheadProfit, tax: est.totals.tax, grandTotal: est.totals.grandTotal },
      { subtotal: 2074.97, overheadProfit: 207.5, tax: 2.89, grandTotal: 2285.36 },
      'matches mobile estimateTotals()'
    );
    assert.equal(est.depreciationSchedule[0].depreciationAmount, 979.2);

    // Linked-document list used by DocumentsPanel / CoverageLetterSheet.
    r = await call(OWNER, 'GET', `/reports?relatedReportId=base&documentType=RepairEstimate&limit=100`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data.map((d) => d.id), [est.id]);

    // Invoice is locked until the estimate is approved.
    const invoiceBody = {
      billTo: { name: 'Jordan Rivera', address: '1 Main St' },
      remitTo: { name: 'Flacron Restoration', instructions: 'Check payable to Flacron' },
      invoiceNumber: 'INV-1',
      invoiceDate: '2026-10-30',
      jobNumber: '',
      taxRatePercent: 0,
      paymentTerms: 'Net 30 days from invoice date.',
      warrantyText: '',
      paymentHistory: [{ date: '2026-10-01', description: 'Deposit', method: 'Check', amount: 500 }],
      changeOrderLog: [],
    };
    r = await call(OWNER, 'POST', `/reports/${est.id}/invoice`, invoiceBody);
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'ESTIMATE_NOT_FINALIZED');

    // Revise without a change summary is rejected (mobile requires it too).
    r = await call(OWNER, 'PUT', `/reports/${est.id}/estimate`, { estimateNumber: 'EST-1', overheadProfitPercent: 10, taxRatePercent: 0, lineItems: LINES });
    assert.equal(r.status, 400);

    // Approve the estimate (ApprovalSheet body), then the invoice works with the mobile-preview balance.
    const signature = { name: 'A. Adjuster', title: 'Adjuster', licenseNumber: 'L-1', licenseState: 'TX', company: 'Flacron' };
    r = await call(OWNER, 'POST', `/reports/${est.id}/approve`, { signature, confirmReview: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    r = await call(OWNER, 'POST', `/reports/${est.id}/invoice`, invoiceBody);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.report.totals.combinedSubtotal, 2282.47);
    assert.equal(r.body.report.totals.balanceDue, 1782.47, 'matches mobile invoiceTotals()');
    assert.equal(r.body.report.dueDate, '2026-11-29', 'due date = invoice date + 30 days');

    // Coverage letter needs the base report reviewed.
    const letter = {
      estimateId: est.id,
      addressee: { name: 'Jordan Rivera', address: '1 Main St' },
      adjusterOfRecord: { name: 'A. Adjuster', title: 'Adjuster', phone: '', email: '' },
      letterDate: '2026-10-30',
      determinationSummary: 'Partial Approval',
      deductible: { description: 'Policy deductible', amount: 1000 },
      coverageLimits: [{ coverageType: 'Dwelling', description: 'Coverage A', limit: 250000 }],
      perItemDetermination: [
        { item: 'Roof', determination: 'approved', policyBasis: 'Covered peril', relatedLineItemCodes: ['RFG1'] },
        { item: 'Drywall', determination: 'denied', policyBasis: 'Excluded', relatedLineItemCodes: [] },
      ],
      rightsAndNextSteps: [{ heading: 'Appeal', text: 'You may request a review.' }],
      enclosures: [],
    };
    r = await call(OWNER, 'POST', '/reports/base/coverage-letter', letter);
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'REPORT_NOT_FINALIZED');
    r = await call(OWNER, 'POST', '/reports/base/approve', { signature, confirmReview: true });
    assert.equal(r.status, 200);
    r = await call(OWNER, 'POST', '/reports/base/coverage-letter', letter);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    // 48% withheld on RFG1 = 979.20 → 2040 − 1000 − 979.20
    assert.equal(r.body.report.totals.initialPayment, 60.8);
    assert.equal(r.body.report.documentType, 'CoverageDeterminationLetter');
  });
});

test('detailed estimate (Section 7): the mobile payload saves, conflicts and finalization are enforced', async () => {
  const { app, db } = setup();
  seedReport(db, 'r7');
  // Exactly what buildCanonicalEstimatePayload(null, draft, '') produces on mobile.
  const payload = {
    schemaVersion: undefined,
    currency: 'USD',
    locationContext: { region: 'TX', source: 'manual' },
    baseRevision: 0,
    changeSummary: '',
    overheadProfitPercent: 10,
    taxRatePercent: 5,
    appliedProposals: [],
    lineItems: [
      {
        id: 'li_mobile_1',
        room: 'Kitchen',
        trade: '',
        category: 'Drywall',
        damageType: '',
        repairAction: '',
        description: 'Replace drywall',
        material: '',
        quantity: 10,
        unit: 'SF',
        materialUnitCost: 2,
        laborUnitCost: 1.5,
        equipmentUnitCost: 0,
        taxable: true,
        assumptions: '',
        confidence: 'medium',
        lineStatus: 'preliminary',
        evidencePhotoIds: [],
        pricingSource: 'manual',
      },
    ],
    permits: [{ id: 'amt_1', description: 'Permit', amount: 100, taxable: false }],
    generalConditions: [],
    manualAdjustments: [],
  };
  await serve(app, async (call) => {
    let r = await call(OWNER, 'PUT', '/reports/r7/canonical-estimate', JSON.parse(JSON.stringify(payload)));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.estimate.revision, 1);
    // mobile computeEstimatePreviewTotals: (35 + 100) * 1.10 + 35 * 0.05 = 150.25
    assert.equal(r.body.estimate.totals.grandTotal, 150.25);
    r = await call(OWNER, 'PUT', '/reports/r7/canonical-estimate', { ...payload, baseRevision: 0 });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'REVISION_CONFLICT');
    r = await call(OWNER, 'GET', '/reports/r7/canonical-estimate');
    assert.equal(r.status, 200);
    assert.equal(typeof r.body.detailMarkdown, 'string');
    // Starter plans can't request Flacron Engine pricing.
    db.store.get(`users/${OWNER}`).data.tier = 'starter';
    r = await call(OWNER, 'POST', '/reports/r7/estimate-detail/price-suggestions', {
      locationContext: { country: 'US', state: 'TX', city: '', postalCode: '' },
      currency: 'USD',
      regenerate: false,
      items: [{ targetLineItemId: 'li_mobile_1', room: 'Kitchen', description: 'Replace drywall', quantity: 10, unit: 'SF' }],
    });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'FEATURE_NOT_IN_PLAN');
  });
});

test('users: mobile tour state is separate from the web tour; onboarding steps; login history page shape', async () => {
  const { app, db } = setup();
  await serve(app, async (call) => {
    let r = await call(OWNER, 'POST', '/users/product-tour', { platform: 'mobile', status: 'completed', source: 'auto', version: 1, lastStepId: 'finish', stepsViewed: 9, totalSteps: 9 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const u = db.store.get(`users/${OWNER}`).data;
    assert.equal(u.productTourMobile.status, 'completed');
    assert.equal(u.productTour, undefined, 'web tour untouched');
    r = await call(OWNER, 'POST', '/users/product-tour', { platform: 'tv', status: 'completed', version: 1 });
    assert.equal(r.body.code, 'INVALID_TOUR_PLATFORM');

    r = await call(OWNER, 'POST', '/users/onboarding/step', { step: 2 });
    assert.equal(r.body.code, 'USER_TYPE_REQUIRED');
    r = await call(OWNER, 'POST', '/users/onboarding/step', { step: 3, userType: 'independent_adjuster', monthlyVolume: '11-50' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    r = await call(OWNER, 'POST', '/users/onboarding/complete', {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(db.store.get(`users/${OWNER}`).data.onboardingCompleted, true);

    r = await call(OWNER, 'GET', '/users/login-history?page=1&limit=10');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    for (const k of ['items', 'total', 'page', 'totalPages']) assert.ok(k in r.body, `login-history.${k}`);
  });
});

test('search and photo library: response groups and paging fields the app reads', async () => {
  const { app, db } = setup();
  seedReport(db, 's1', { claimNumber: 'CLM-ALPHA', photos: [{ id: 'p1', fileName: 'kitchen.jpg', status: 'uploaded', reviewable: true, analysis: { category: 'Water' }, review: { status: 'pending' } }] });
  await serve(app, async (call) => {
    let r = await call(OWNER, 'GET', '/search?q=a');
    assert.deepEqual([r.body.reports.length, r.body.photos.length, r.body.team.length], [0, 0, 0], 'under 2 chars → empty groups');
    r = await call(OWNER, 'GET', '/search?q=alpha');
    assert.equal(r.status, 200);
    assert.equal(r.body.reports[0].id, 's1');
    assert.equal(r.body.reports[0].claimNumber, 'CLM-ALPHA');
    r = await call(OWNER, 'GET', '/search?q=kitchen');
    assert.equal(r.body.photos[0].reportId, 's1');
    assert.equal(r.body.photos[0].photoId, 'p1');

    r = await call(OWNER, 'GET', '/photos?limit=30');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(Array.isArray(r.body.photos));
    assert.ok('nextCursor' in r.body && 'totalCount' in r.body);
    const p = r.body.photos.find((x) => x.photoId === 'p1');
    assert.ok(p && p.reportId === 's1' && p.claimNumber === 'CLM-ALPHA');
  });
});
