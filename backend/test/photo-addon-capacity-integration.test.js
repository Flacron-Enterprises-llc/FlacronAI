const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Phase 45 (Stripe Report-Specific Photo Add-Ons) x Phase 44 (Central Plan
// Configuration & Atomic Photo-Capacity Enforcement) integration: proves
// effectiveCapacity = basePlanCapacity + verified fulfilled add-on capacity
// on the two real routes that need it (GET /:id/photo-capacity and
// POST /:id/images), and that a report with no add-on purchases is a
// byte-for-byte regression of Phase 44's own behavior. Follows the exact
// route-test convention photo-capacity-route.test.js already established.
process.env.PLAN_CONFIG_CACHE_TTL_MS = '0';

const firebaseConfigPath = require.resolve('../config/firebase');
const storagePath = require.resolve('../config/storage');
const photoBatchProcessorPath = require.resolve('../utils/photoBatchProcessor');
const photoJobServicePath = require.resolve('../services/photoJobService');
const reportsRoutePath = require.resolve('../routes/reports');
const planConfigPath = require.resolve('../config/planConfig');
const authMiddlewarePath = require.resolve('../middleware/auth');
const tiersPath = require.resolve('../config/tiers');
const photoAddOnPurchasesPath = require.resolve('../utils/photoAddOnPurchases');

const TEST_UID = 'photo-addon-cap-uid';
const TEST_EMAIL = 'photo-addon-cap@example.com';
const AUTH_TIME = 1700000000;

async function fakeProcessPhotoBatch(uid, targetId, files = [], existingHashes = [], startPosition = 0) {
  const seen = new Map();
  for (const { hash, fileName } of existingHashes) if (hash) seen.set(hash, fileName || 'existing');
  const records = [];
  files.forEach((f, i) => {
    const hash = crypto.createHash('sha256').update(f.buffer).digest('hex');
    const id = `rec-${targetId}-${startPosition + i}-${crypto.randomBytes(4).toString('hex')}`;
    const record = {
      id, fileName: f.originalname || `file-${i}`, size: f.buffer.length, mimeType: 'image/jpeg',
      status: seen.has(hash) ? 'duplicate' : 'uploaded', contentHash: hash,
      originalPath: `orig/${targetId}/${id}`, objectPath: `disp/${targetId}/${id}`, thumbnailPath: `thumb/${targetId}/${id}`,
      error: seen.has(hash) ? 'dup' : null, uploadedAt: new Date().toISOString(),
      analysisStatus: seen.has(hash) ? null : 'queued', analysisError: null, analysis: null,
      review: { status: 'pending' }, position: startPosition + i,
    };
    if (!seen.has(hash)) seen.set(hash, record.fileName);
    records.push(record);
  });
  return { records, analyzable: [] };
}

function installFakes({ usersById, reportsSeed = {}, planConfigDoc = null }) {
  [firebaseConfigPath, storagePath, photoBatchProcessorPath, photoJobServicePath, reportsRoutePath, planConfigPath, authMiddlewarePath, tiersPath, photoAddOnPurchasesPath].forEach((p) => {
    delete require.cache[p];
  });

  const db = new FakeFirestore();
  const deletedObjectCalls = [];
  for (const [uid, data] of Object.entries(usersById)) db.store.set(`users/${uid}`, { version: 1, data });
  for (const [id, data] of Object.entries(reportsSeed)) db.store.set(`reports/${id}`, { version: 1, data });
  if (planConfigDoc) db.store.set('planConfig/active', { version: 1, data: planConfigDoc });

  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath, filename: firebaseConfigPath, loaded: true,
    exports: {
      getAuth: () => ({ verifyIdToken: async () => ({ uid: TEST_UID, email: TEST_EMAIL, auth_time: AUTH_TIME, iat: AUTH_TIME }) }),
      getFirestore: () => db,
      FieldValue: { serverTimestamp: () => new Date().toISOString() },
      Timestamp: {}, admin: {}, initFirebase: () => {}, getBucket: () => {},
    },
  };
  require.cache[storagePath] = {
    id: storagePath, filename: storagePath, loaded: true,
    exports: {
      reportDocumentObject: (uid, id, name) => `docs/${id}/${name}`,
      exportObject: (uid, name) => `exports/${uid}/${name}`,
      reportImageObject: (uid, id, name) => `disp/${id}/${name}`,
      reportOriginalObject: (uid, id, name) => `orig/${id}/${name}`,
      reportThumbnailObject: (uid, id, name) => `thumb/${id}/${name}`,
      uploadBuffer: async () => {},
      downloadBuffer: async () => Buffer.from(''),
      deleteObjects: async (paths) => { deletedObjectCalls.push(paths); },
      deleteObject: async () => {},
      getSignedUrl: async () => '',
      tokenUrl: async () => '',
    },
  };
  require.cache[photoBatchProcessorPath] = { id: photoBatchProcessorPath, filename: photoBatchProcessorPath, loaded: true, exports: { processPhotoBatch: fakeProcessPhotoBatch } };
  require.cache[photoJobServicePath] = { id: photoJobServicePath, filename: photoJobServicePath, loaded: true, exports: { createAnalysisJobs: async () => {}, runPhotoAnalysisOnly: async () => {} } };

  const router = require('../routes/reports');
  return { router, db, deletedObjectCalls };
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

const seedReport = (overrides = {}) => ({ id: 'report-1', userId: TEST_UID, status: 'draft', photos: [], imagePaths: [], ...overrides });

async function postImages(base, id, files = [1]) {
  const form = new FormData();
  files.forEach((content, i) => form.append('images', new Blob([Buffer.from(String(content))], { type: 'image/jpeg' }), `photo-${i}.jpg`));
  const res = await fetch(`${base}/${id}/images`, { method: 'POST', headers: { Authorization: 'Bearer faketoken' }, body: form });
  return { res, body: await res.json() };
}

async function getJson(base, path) {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: 'Bearer faketoken' } });
  return { res, body: await res.json() };
}

async function putJson(base, path, payload) {
  const res = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer faketoken', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { res, body: await res.json() };
}

const PLAN_CONFIG_TEST = {
  schemaVersion: 1,
  plans: {
    starter: { reportsPerMonth: 5, basePhotoLimit: 3 },
    professional: { reportsPerMonth: 50, basePhotoLimit: 100 },
    agency: { reportsPerMonth: 200, basePhotoLimit: 250 },
    enterprise: { reportsPerMonth: 'unlimited', basePhotoLimit: 'unlimited' },
  },
  addOnsEnabled: true,
  allowedMimeTypes: ['image/jpeg'],
  maxFileSizeBytes: 10 * 1024 * 1024,
  watermarkPolicyEnabled: true,
  status: 'active',
};

test('GET /:id/photo-capacity: with no add-on purchases, behaves exactly as Phase 44 (regression)', async () => {
  const { router } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: { 'report-1': seedReport() },
    planConfigDoc: PLAN_CONFIG_TEST,
  });
  await withTestServer(router, async (base) => {
    const { body } = await getJson(base, '/report-1/photo-capacity');
    assert.equal(body.basePhotoLimit, 3);
    assert.equal(body.addOnCapacity, 0);
    assert.equal(body.effectiveCapacity, 3);
    assert.deepEqual(body.purchases, []);
  });
});

test('GET /:id/photo-capacity: reflects a fulfilled add-on purchase (base + add-on) and lists it in sanitized purchase history', async () => {
  const { router, db } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: {
      'report-1': seedReport({ purchasedPhotoCapacity: 25, photoAddOnPurchaseIds: ['intent-1'], photoAddOnCapacityGrantedFor: ['intent-1'] }),
    },
    planConfigDoc: PLAN_CONFIG_TEST,
  });
  db.store.set('photoAddOnPurchases/intent-1', {
    version: 1,
    data: {
      packId: 'photos_25', capacity: 25, amountCents: 499, currency: 'usd', status: 'fulfilled',
      fulfillment: { fulfilledAt: '2026-09-19T00:00:00.000Z' }, createdAt: '2026-09-19T00:00:00.000Z', updatedAt: '2026-09-19T00:00:00.000Z',
    },
  });

  await withTestServer(router, async (base) => {
    const { body } = await getJson(base, '/report-1/photo-capacity');
    assert.equal(body.basePhotoLimit, 3);
    assert.equal(body.addOnCapacity, 25);
    assert.equal(body.effectiveCapacity, 28);
    assert.equal(body.purchases.length, 1);
    assert.equal(body.purchases[0].status, 'fulfilled');
    assert.equal(body.purchases[0].capacity, 25);
    assert.equal('priceId' in body.purchases[0], false);
  });
});

test('POST /:id/images: Phase 44 atomic upload enforcement recognizes fulfilled add-on capacity -- a Starter report with a +25 pack accepts more than the base 3', async () => {
  const { router, db } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: {
      'report-1': seedReport({
        photos: [{ id: 'p1', status: 'uploaded', contentHash: 'h1' }, { id: 'p2', status: 'uploaded', contentHash: 'h2' }, { id: 'p3', status: 'uploaded', contentHash: 'h3' }],
        purchasedPhotoCapacity: 25,
      }),
    },
    planConfigDoc: PLAN_CONFIG_TEST,
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postImages(base, 'report-1', ['a', 'b']);
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.photos.filter((p) => p.status === 'uploaded').length, 2, 'both accepted -- base(3, already full) + add-on(25) leaves plenty of room');
    const stored = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(stored.photos.filter((p) => p.status === 'uploaded').length, 5);
  });
});

test('POST /:id/images: without the add-on, the same request would have been capacity-rejected (sanity check for the test above)', async () => {
  const { router, db } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: {
      'report-1': seedReport({ photos: [{ id: 'p1', status: 'uploaded', contentHash: 'h1' }, { id: 'p2', status: 'uploaded', contentHash: 'h2' }, { id: 'p3', status: 'uploaded', contentHash: 'h3' }] }),
    },
    planConfigDoc: PLAN_CONFIG_TEST,
  });
  await withTestServer(router, async (base) => {
    const { body } = await postImages(base, 'report-1', ['a', 'b']);
    assert.equal(body.photos.filter((p) => p.status === 'uploaded').length, 0);
    assert.equal(body.photos.every((p) => p.capacityRejected), true);
    const stored = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(stored.photos.filter((p) => p.status === 'uploaded').length, 3);
  });
});

test('a report over a REDUCED effective capacity (e.g. after a simulated refund) keeps every existing photo and only blocks new uploads', async () => {
  const { router, db } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: {
      'report-1': seedReport({
        // 5 existing photos, base capacity only 3 (as if a pack that granted
        // the extra 2+ was refunded/disputed after they were uploaded).
        photos: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, status: 'uploaded', contentHash: `h${i}` })),
        purchasedPhotoCapacity: 0,
      }),
    },
    planConfigDoc: PLAN_CONFIG_TEST,
  });
  await withTestServer(router, async (base) => {
    const capacity = await getJson(base, '/report-1/photo-capacity');
    assert.equal(capacity.body.used, 5);
    assert.equal(capacity.body.remaining, 0, 'over-capacity clamps to 0, never negative');

    const { body } = await postImages(base, 'report-1', ['new-photo']);
    assert.equal(body.photos.filter((p) => p.status === 'uploaded').length, 0, 'no new upload is accepted while over capacity');
    const stored = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(stored.photos.filter((p) => p.status === 'uploaded').length, 5, 'all 5 pre-existing photos are retained, never deleted');
  });
});

test('Enterprise (unlimited) reports never need add-ons -- purchasedPhotoCapacity is present but irrelevant', async () => {
  const { router } = installFakes({
    usersById: { [TEST_UID]: { tier: 'enterprise' } },
    reportsSeed: { 'report-1': seedReport({ purchasedPhotoCapacity: 25, photoAddOnPurchaseIds: ['intent-1'] }) },
    planConfigDoc: PLAN_CONFIG_TEST,
  });
  await withTestServer(router, async (base) => {
    const { body } = await getJson(base, '/report-1/photo-capacity');
    assert.equal(body.unlimited, true);
    assert.equal(body.basePhotoLimit, null);
    assert.equal(body.effectiveCapacity, null);
  });
});

test('trust-boundary: PUT /:id (generic report content update) cannot inject purchasedPhotoCapacity or any add-on bookkeeping field -- it is not in the field allowlist', async () => {
  const { router, db } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: { 'report-1': seedReport() },
    planConfigDoc: PLAN_CONFIG_TEST,
  });
  await withTestServer(router, async (base) => {
    const { res } = await putJson(base, '/report-1', {
      content: 'updated body text',
      purchasedPhotoCapacity: 999999,
      photoAddOnCapacityGrantedFor: ['forged-intent'],
      photoAddOnHistory: [{ purchaseId: 'forged-intent', capacity: 999999, action: 'granted' }],
    });
    assert.equal(res.status, 200);
    const stored = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(stored.content, 'updated body text', 'the allowlisted field was applied normally');
    assert.equal(stored.purchasedPhotoCapacity || 0, 0, 'a non-allowlisted capacity field is never written by the generic update route');
    assert.equal((stored.photoAddOnCapacityGrantedFor || []).length, 0);

    const capacity = await getJson(base, '/report-1/photo-capacity');
    assert.equal(capacity.body.addOnCapacity, 0, 'effective capacity is unaffected by the injection attempt');
  });
});
