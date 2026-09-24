const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// Phase 44 (Central Plan Configuration & Atomic Photo-Capacity Enforcement).
// Route-level tests for POST /:id/images (the retrofit target -- previously
// had NO capacity check at all) and the two new sanitized capacity read
// endpoints. Follows this repo's own established route-test convention (see
// pricing-route.test.js): a REAL Express app mounting the REAL reports.js
// router, faking only `../config/firebase` (auth + Firestore, using the
// SAME FakeFirestore double photo-draft-staging.test.js/
// canonical-estimate-persistence.test.js already trust for transactional
// semantics), `../config/storage` (no real Firebase Storage in a unit test),
// `../utils/photoBatchProcessor` (bypasses real sharp/image-validation --
// already exhaustively covered by photo-batch-processor.test.js; this file
// tests CAPACITY/route concerns, not image-processing correctness), and
// `../services/photoJobService` (never trigger a real AI analysis pipeline).
process.env.PLAN_CONFIG_CACHE_TTL_MS = '0'; // no cross-test cache bleed

const firebaseConfigPath = require.resolve('../config/firebase');
const storagePath = require.resolve('../config/storage');
const photoBatchProcessorPath = require.resolve('../utils/photoBatchProcessor');
const photoJobServicePath = require.resolve('../services/photoJobService');
const reportsRoutePath = require.resolve('../routes/reports');
const planConfigPath = require.resolve('../config/planConfig');
// middleware/auth.js destructures `getFirestore`/`getAuth` from
// ../config/firebase at ITS OWN module-top-level, once. Since different
// tests in this file give different users different tiers, auth.js's cached
// module (left un-deleted) would otherwise keep resolving every request's
// req.user against the FIRST test's fake Firestore forever -- reproduced and
// confirmed while writing this file (a later test's "enterprise" user kept
// reading back tier 'starter', from an earlier test's seed). tiers.js
// similarly destructures planConfig.js's resolvePlanContext at its own
// top-level; reset both on every install.
const authMiddlewarePath = require.resolve('../middleware/auth');
const tiersPath = require.resolve('../config/tiers');

const TEST_UID = 'photo-cap-route-uid';
const TEST_EMAIL = 'photo-cap-route@example.com';
const AUTH_TIME = 1700000000;

// A deliberately simplified stand-in for the real processPhotoBatch
// (backend/utils/photoBatchProcessor.js) -- same record shape/contract, no
// real Storage/sharp calls. Content-hash dedup logic is real (crypto), so
// duplicate-detection tests against this fake are still meaningful.
async function fakeProcessPhotoBatch(uid, targetId, files = [], existingHashes = [], startPosition = 0) {
  const seen = new Map();
  for (const { hash, fileName } of existingHashes) if (hash) seen.set(hash, fileName || 'existing');
  const records = [];
  const analyzable = [];
  files.forEach((f, i) => {
    const hash = crypto.createHash('sha256').update(f.buffer).digest('hex');
    const id = `rec-${targetId}-${startPosition + i}-${crypto.randomBytes(4).toString('hex')}`;
    const record = {
      id,
      fileName: f.originalname || `file-${i}`,
      size: f.size || f.buffer.length,
      mimeType: f.mimetype || 'image/jpeg',
      status: 'uploaded',
      contentHash: hash,
      originalPath: `orig/${targetId}/${id}`,
      objectPath: `disp/${targetId}/${id}`,
      thumbnailPath: `thumb/${targetId}/${id}`,
      error: null,
      uploadedAt: new Date().toISOString(),
      analysisStatus: 'queued',
      analysisError: null,
      analysis: null,
      review: { status: 'pending', observation: null, note: '', reviewedBy: null, reviewedAt: null },
      position: startPosition + i,
      qualityWarning: false,
      qualityReasons: [],
      qualityMetrics: null,
      capturedAt: null,
      roomOrArea: null,
      annotations: null,
    };
    if (seen.has(hash)) {
      record.status = 'duplicate';
      record.error = `Duplicate of "${seen.get(hash)}".`;
      record.analysisStatus = null;
    } else {
      seen.set(hash, record.fileName);
      analyzable.push({ buffer: f.buffer, mimetype: record.mimeType, photoId: id });
    }
    records.push(record);
  });
  return { records, analyzable };
}

function installFakes({ usersById, reportsSeed = {}, draftsSeed = {}, planConfigDoc = null }) {
  [firebaseConfigPath, storagePath, photoBatchProcessorPath, photoJobServicePath, reportsRoutePath, planConfigPath, authMiddlewarePath, tiersPath].forEach((p) => {
    delete require.cache[p];
  });

  const db = new FakeFirestore();
  const deletedObjectCalls = [];

  // Seed synchronously via the internal store map (avoids needing awaits
  // before the router/app is even constructed).
  for (const [uid, data] of Object.entries(usersById)) {
    db.store.set(`users/${uid}`, { version: 1, data });
  }
  for (const [id, data] of Object.entries(reportsSeed)) {
    db.store.set(`reports/${id}`, { version: 1, data });
  }
  for (const [id, data] of Object.entries(draftsSeed)) {
    db.store.set(`reportDrafts/${id}`, { version: 1, data });
  }
  if (planConfigDoc) {
    db.store.set('planConfig/active', { version: 1, data: planConfigDoc });
  }

  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath,
    filename: firebaseConfigPath,
    loaded: true,
    exports: {
      getAuth: () => ({
        verifyIdToken: async () => ({ uid: TEST_UID, email: TEST_EMAIL, auth_time: AUTH_TIME, iat: AUTH_TIME }),
      }),
      getFirestore: () => db,
      FieldValue: { serverTimestamp: () => new Date().toISOString() },
      Timestamp: {},
      admin: {},
      initFirebase: () => {},
      getBucket: () => {},
    },
  };
  require.cache[storagePath] = {
    id: storagePath,
    filename: storagePath,
    loaded: true,
    exports: {
      reportDocumentObject: (uid, id, name) => `docs/${id}/${name}`,
      exportObject: (uid, name) => `exports/${uid}/${name}`,
      reportImageObject: (uid, id, name) => `disp/${id}/${name}`,
      reportOriginalObject: (uid, id, name) => `orig/${id}/${name}`,
      reportThumbnailObject: (uid, id, name) => `thumb/${id}/${name}`,
      uploadBuffer: async () => {},
      downloadBuffer: async () => Buffer.from(''),
      deleteObjects: async (paths) => {
        deletedObjectCalls.push(paths);
      },
      deleteObject: async () => {},
      getSignedUrl: async () => '',
      tokenUrl: async () => '',
    },
  };
  require.cache[photoBatchProcessorPath] = {
    id: photoBatchProcessorPath,
    filename: photoBatchProcessorPath,
    loaded: true,
    exports: { processPhotoBatch: fakeProcessPhotoBatch },
  };
  require.cache[photoJobServicePath] = {
    id: photoJobServicePath,
    filename: photoJobServicePath,
    loaded: true,
    exports: {
      createAnalysisJobs: async () => {},
      runPhotoAnalysisOnly: async () => {},
    },
  };

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

const committedPhoto = (id, hash) => ({ id, status: 'uploaded', contentHash: hash || crypto.randomBytes(8).toString('hex'), fileName: `${id}.jpg`, objectPath: `disp/x/${id}` });

async function postImages(base, id, { attemptId, files = [1] } = {}) {
  const form = new FormData();
  if (attemptId) form.append('attemptId', attemptId);
  files.forEach((content, i) => {
    form.append('images', new Blob([Buffer.from(String(content))], { type: 'image/jpeg' }), `photo-${i}.jpg`);
  });
  const res = await fetch(`${base}/${id}/images`, {
    method: 'POST',
    headers: { Authorization: 'Bearer faketoken' },
    body: form,
  });
  const body = await res.json();
  return { res, body };
}

async function getJson(base, path) {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: 'Bearer faketoken' } });
  const body = await res.json();
  return { res, body };
}

const PLAN_CONFIG_TEST = {
  schemaVersion: 1,
  plans: {
    starter: { reportsPerMonth: 5, basePhotoLimit: 3 },
    professional: { reportsPerMonth: 50, basePhotoLimit: 100 },
    agency: { reportsPerMonth: 200, basePhotoLimit: 250 },
    enterprise: { reportsPerMonth: 'unlimited', basePhotoLimit: 'unlimited' },
  },
  addOnsEnabled: false,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  maxFileSizeBytes: 10 * 1024 * 1024,
  watermarkPolicyEnabled: true,
  status: 'active',
};

test('POST /:id/images: partial-accept -- exactly enough new photos are admitted to reach the plan capacity, the rest rejected-for-capacity and cleaned up', async () => {
  const { router, db, deletedObjectCalls } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: { 'report-1': seedReport({ photos: [committedPhoto('p1'), committedPhoto('p2')] }) },
    planConfigDoc: PLAN_CONFIG_TEST, // starter basePhotoLimit = 3; 2 already committed -> 1 slot left
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postImages(base, 'report-1', { files: ['a', 'b', 'c'] });
    assert.equal(res.status, 200, JSON.stringify(body));
    const accepted = body.photos.filter((p) => p.status === 'uploaded');
    const rejected = body.photos.filter((p) => p.capacityRejected);
    assert.equal(accepted.length, 1, 'only the one remaining slot is filled');
    assert.equal(rejected.length, 2, 'the rest are explicitly capacity-rejected, not silently dropped');
    const stored = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(stored.photos.filter((p) => p.status === 'uploaded').length, 3, 'committed count never exceeds the plan capacity');
    assert.equal(deletedObjectCalls.length, 1, 'orphaned Storage objects for the 2 rejected photos are cleaned up exactly once');
    assert.equal(deletedObjectCalls[0].length, 6, '3 paths (original/display/thumbnail) x 2 rejected photos');
  });
});

test('POST /:id/images: Enterprise (unlimited) never rejects for capacity even with a large existing count', async () => {
  const existing = Array.from({ length: 500 }, (_, i) => committedPhoto(`existing-${i}`));
  const { router } = installFakes({
    usersById: { [TEST_UID]: { tier: 'enterprise' } },
    reportsSeed: { 'report-1': seedReport({ photos: existing }) },
    planConfigDoc: PLAN_CONFIG_TEST,
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postImages(base, 'report-1', { files: ['a', 'b'] });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.photos.filter((p) => p.status === 'uploaded').length, 2);
    assert.equal(body.photos.some((p) => p.capacityRejected), false);
  });
});

test('POST /:id/images: a finalized report rejects the upload with 409 REPORT_FINALIZED via the cheap advisory pre-check, before ever uploading bytes', async () => {
  const { router, deletedObjectCalls } = installFakes({
    usersById: { [TEST_UID]: { tier: 'professional' } },
    reportsSeed: { 'report-1': seedReport({ status: 'finalized' }) },
    planConfigDoc: PLAN_CONFIG_TEST,
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postImages(base, 'report-1', { files: ['a'] });
    assert.equal(res.status, 409);
    assert.equal(body.code, 'REPORT_FINALIZED');
    // The route's advisory pre-check (reading the report doc BEFORE running
    // processPhotoBatch) catches an already-finalized report before any
    // Storage bytes are written at all -- so there's nothing to clean up
    // here. The harder case -- a report that finalizes concurrently, AFTER
    // upload but BEFORE the transaction commits -- is the actual reason the
    // transactional REPORT_FINALIZED check exists at all (the pre-check is
    // only an optimization, never the authority); that path, including its
    // "nothing gets written" guarantee, is proven directly against
    // appendReportPhotosAtomic in photo-capacity.test.js.
    assert.equal(deletedObjectCalls.length, 0, 'no bytes were ever uploaded for an already-finalized report, so there is nothing to orphan');
  });
});

test('POST /:id/images: retrying the SAME attemptId with identical content replays the original result, no double-counting', async () => {
  const { router, db } = installFakes({
    usersById: { [TEST_UID]: { tier: 'professional' } },
    reportsSeed: { 'report-1': seedReport() },
    planConfigDoc: PLAN_CONFIG_TEST,
  });
  await withTestServer(router, async (base) => {
    const first = await postImages(base, 'report-1', { attemptId: 'attempt-1', files: ['same-bytes'] });
    assert.equal(first.res.status, 200);
    assert.equal(first.body.photos.filter((p) => p.status === 'uploaded').length, 1);

    const second = await postImages(base, 'report-1', { attemptId: 'attempt-1', files: ['same-bytes'] });
    assert.equal(second.res.status, 200, JSON.stringify(second.body));
    assert.match(second.body.message, /replayed retry/);

    const stored = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(stored.photos.filter((p) => p.status === 'uploaded').length, 1, 'the retry never added a second photo');
  });
});

test('POST /:id/images: reusing the SAME attemptId with DIFFERENT content is rejected as a conflict, not silently accepted, and orphan-cleans the bytes that were already uploaded before the transaction caught it', async () => {
  const { router, db, deletedObjectCalls } = installFakes({
    usersById: { [TEST_UID]: { tier: 'professional' } },
    reportsSeed: { 'report-1': seedReport() },
    planConfigDoc: PLAN_CONFIG_TEST,
  });
  await withTestServer(router, async (base) => {
    const first = await postImages(base, 'report-1', { attemptId: 'attempt-1', files: ['bytes-A'] });
    assert.equal(first.res.status, 200);

    const second = await postImages(base, 'report-1', { attemptId: 'attempt-1', files: ['bytes-B-different'] });
    assert.equal(second.res.status, 409);
    assert.equal(second.body.code, 'IDEMPOTENCY_KEY_CONFLICT');

    const stored = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(stored.photos.filter((p) => p.status === 'uploaded').length, 1, 'the conflicting retry never got committed');
    // The 2nd request's bytes DID get uploaded (processPhotoBatch always
    // runs before the transaction, by design -- see photoCapacity.js's
    // header comment) before the transaction rejected them -- this is
    // exactly the orphan the route's catch-block cleanup exists for.
    assert.equal(deletedObjectCalls.length, 1, 'the orphaned upload from the rejected retry is cleaned up');
  });
});

test('POST /:id/images: a report owned by a different user is not found (cross-user access denied), and never touches its photos', async () => {
  const { router, db } = installFakes({
    usersById: { [TEST_UID]: { tier: 'professional' } },
    reportsSeed: { 'report-1': seedReport({ userId: 'someone-else' }) },
    planConfigDoc: PLAN_CONFIG_TEST,
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await postImages(base, 'report-1', { files: ['a'] });
    assert.equal(res.status, 404);
    assert.equal(body.code, 'NOT_FOUND');
    const stored = (await db.collection('reports').doc('report-1').get()).data();
    assert.equal(stored.photos.length, 0);
  });
});

test('GET /photos/capacity: sanitized plan-level response for a fresh wizard (no draft yet), fallback config (no PlanConfig doc) enforces the ACCEPTED mapping, not the old flat-100', async () => {
  const { router } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    // No planConfigDoc -- exercises the safe built-in-default fallback path.
  });
  await withTestServer(router, async (base) => {
    const { res, body } = await getJson(base, '/photos/capacity');
    assert.equal(res.status, 200);
    assert.equal(body.plan, 'starter');
    assert.equal(body.basePhotoLimit, 25, 'a normal deployment with no seeded doc yet must enforce Starter=25, not the legacy flat 100');
    assert.equal(body.unlimited, false);
    assert.equal(body.used, 0);
    assert.equal(body.remaining, 25);
    assert.equal(body.uploadAllowed, true);
    assert.equal(body.configSource, 'fallback');
    // Never leaks internal-only fields.
    assert.equal('addOnPackPrices' in body, false);
    assert.equal('status' in body, false);
  });
});

test('GET /photos/capacity: the REAL configured per-tier values (25/100/250/unlimited) are enforced once PlanConfig is populated -- acceptance test, not just the fallback', async () => {
  const configured = {
    ...PLAN_CONFIG_TEST,
    plans: {
      starter: { reportsPerMonth: 5, basePhotoLimit: 25 },
      professional: { reportsPerMonth: 50, basePhotoLimit: 100 },
      agency: { reportsPerMonth: 200, basePhotoLimit: 250 },
      enterprise: { reportsPerMonth: 'unlimited', basePhotoLimit: 'unlimited' },
    },
  };
  for (const [tier, expected] of [['starter', 25], ['professional', 100], ['agency', 250]]) {
    const { router } = installFakes({ usersById: { [TEST_UID]: { tier } }, planConfigDoc: configured });
    await withTestServer(router, async (base) => {
      const { body } = await getJson(base, '/photos/capacity');
      assert.equal(body.basePhotoLimit, expected, `${tier} must reflect the real configured value, not the fallback`);
      assert.equal(body.unlimited, false);
    });
  }
  const { router: enterpriseRouter } = installFakes({ usersById: { [TEST_UID]: { tier: 'enterprise' } }, planConfigDoc: configured });
  await withTestServer(enterpriseRouter, async (base) => {
    const { body } = await getJson(base, '/photos/capacity');
    assert.equal(body.unlimited, true);
    assert.equal(body.basePhotoLimit, null, 'unlimited is an explicit representation, never a magic number, and never leaked as one');
    assert.equal(body.remaining, null);
  });
});

test('GET /photos/capacity: a client cannot influence its own capacity by passing extra query params (server ignores anything but draftId)', async () => {
  const { router } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    planConfigDoc: PLAN_CONFIG_TEST,
  });
  await withTestServer(router, async (base) => {
    const { body } = await getJson(base, '/photos/capacity?basePhotoLimit=999999&unlimited=true&effectiveCapacity=999999');
    assert.equal(body.basePhotoLimit, 3, 'client-supplied capacity-shaped fields are never read');
    assert.equal(body.unlimited, false);
  });
});

test('GET /photos/capacity?draftId=...: reflects the wizard draft\'s own current staged count, owned-draft only', async () => {
  const { router } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    draftsSeed: {
      'draft-1': { userId: TEST_UID, photos: [committedPhoto('d1'), committedPhoto('d2'), { id: 'd3', status: 'duplicate', contentHash: 'x' }] },
      'draft-foreign': { userId: 'someone-else', photos: [committedPhoto('f1')] },
    },
    planConfigDoc: PLAN_CONFIG_TEST,
  });
  await withTestServer(router, async (base) => {
    const own = await getJson(base, '/photos/capacity?draftId=draft-1');
    assert.equal(own.body.used, 2, 'only genuinely uploaded photos count -- the duplicate entry never consumed a slot');
    assert.equal(own.body.remaining, 1);

    const foreign = await getJson(base, '/photos/capacity?draftId=draft-foreign');
    assert.equal(foreign.body.used, 0, "a draft owned by someone else is treated as empty, never leaking its real count");
  });
});

test('GET /:id/photo-capacity: report-specific used/remaining, 404 for a report the caller cannot access', async () => {
  const { router } = installFakes({
    usersById: { [TEST_UID]: { tier: 'starter' } },
    reportsSeed: {
      'report-1': seedReport({ photos: [committedPhoto('p1')] }),
      'report-2': seedReport({ id: 'report-2', userId: 'someone-else' }),
    },
    planConfigDoc: PLAN_CONFIG_TEST,
  });
  await withTestServer(router, async (base) => {
    const mine = await getJson(base, '/report-1/photo-capacity');
    assert.equal(mine.res.status, 200);
    assert.equal(mine.body.used, 1);
    assert.equal(mine.body.remaining, 2);

    const notMine = await getJson(base, '/report-2/photo-capacity');
    assert.equal(notMine.res.status, 404);
    assert.equal(notMine.body.code, 'NOT_FOUND');
  });
});
