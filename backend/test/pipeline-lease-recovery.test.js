// Restart recovery for the in-process photo-analysis/report pipeline:
// - a live run (fresh lease heartbeat) is never treated as abandoned;
// - an abandoned run (no heartbeat for PIPELINE_STALE_MS) becomes retryable;
// - concurrent Retry calls can start at most ONE pipeline (no duplicate AI spend).
const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeFirestore } = require('./helpers/fakeFirestore');

const firebasePath = require.resolve('../config/firebase');
const storagePath = require.resolve('../config/storage');
const aiPath = require.resolve('../services/aiService');
const jobsPath = require.resolve('../services/photoJobService');

let pipelineCalls = 0;
function install(seed) {
  [firebasePath, storagePath, aiPath, jobsPath].forEach((p) => delete require.cache[p]);
  const db = new FakeFirestore();
  for (const [path, data] of Object.entries(seed)) db.store.set(path, { version: 1, data });
  require.cache[firebasePath] = {
    id: firebasePath, filename: firebasePath, loaded: true,
    exports: {
      getFirestore: () => db,
      FieldValue: { serverTimestamp: () => new Date().toISOString(), increment: (n) => n },
    },
  };
  require.cache[storagePath] = {
    id: storagePath, filename: storagePath, loaded: true,
    exports: { downloadBuffer: async () => Buffer.from('img') },
  };
  pipelineCalls = 0;
  require.cache[aiPath] = {
    id: aiPath, filename: aiPath, loaded: true,
    exports: {
      // Counts real pipeline work; never resolves so the run stays "in flight".
      analyzeImages: () => { pipelineCalls++; return new Promise(() => {}); },
      generateReport: () => { pipelineCalls++; return new Promise(() => {}); },
      checkQuality: async () => ({ score: 100 }),
      buildEffectiveImageAnalysis: (a) => a,
    },
  };
  return { db, jobs: require('../services/photoJobService') };
}

const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString();
const report = (over) => ({
  userId: 'u1', status: 'processing', updatedAt: minutesAgo(1),
  photos: [{ id: 'p1', objectPath: 'x/p1.jpg', mimeType: 'image/jpeg', analysisStatus: 'analyzing' }],
  ...over,
});

test('isPipelineActive: fresh heartbeat is live even if updatedAt is old', () => {
  const { jobs } = install({});
  const r = report({ updatedAt: minutesAgo(120), pipelineLease: { id: 'a', heartbeatAt: minutesAgo(1) } });
  assert.equal(jobs.isPipelineActive(r), true);
  assert.equal(jobs.isPipelineAbandoned(r), false);
});

test('isPipelineAbandoned: stale heartbeat (or legacy stale updatedAt) is abandoned', () => {
  const { jobs } = install({});
  const stale = jobs.PIPELINE_STALE_MS / 60000 + 1;
  assert.equal(jobs.isPipelineAbandoned(report({ pipelineLease: { id: 'a', heartbeatAt: minutesAgo(stale) }, updatedAt: minutesAgo(stale) })), true);
  assert.equal(jobs.isPipelineAbandoned(report({ updatedAt: minutesAgo(stale) })), true);
  assert.equal(jobs.isPipelineAbandoned(report({ status: 'draft', photos: [], updatedAt: minutesAgo(999) })), false);
});

test('retry refuses a live run (ALREADY_PROCESSING) and starts nothing', async () => {
  const { jobs } = install({ 'reports/r1': report({ pipelineLease: { id: 'live', heartbeatAt: minutesAgo(2) } }) });
  const res = await jobs.retryFailedAnalysis('r1', 'u1');
  assert.equal(res.code, 'ALREADY_PROCESSING');
  assert.equal(pipelineCalls, 0);
});

test('retry recovers an abandoned run and takes a fresh lease', async () => {
  const stale = 30;
  const { db, jobs } = install({ 'reports/r1': report({ updatedAt: minutesAgo(stale), pipelineLease: { id: 'dead', heartbeatAt: minutesAgo(stale) } }) });
  const res = await jobs.retryFailedAnalysis('r1', 'u1');
  assert.equal(res.success, true);
  const doc = db.store.get('reports/r1').data;
  assert.equal(doc.status, 'processing');
  assert.notEqual(doc.pipelineLease.id, 'dead');
  assert.equal(doc.photos[0].analysisStatus, 'needs_attention');
});

test('two concurrent retries of an abandoned run start exactly one pipeline', async () => {
  const { jobs } = install({ 'reports/r1': report({ updatedAt: minutesAgo(30) }) });
  const results = await Promise.all([jobs.retryFailedAnalysis('r1', 'u1'), jobs.retryFailedAnalysis('r1', 'u1')]);
  const ok = results.filter((r) => r.success);
  const busy = results.filter((r) => r.code === 'ALREADY_PROCESSING');
  assert.equal(ok.length, 1);
  assert.equal(busy.length, 1);
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(pipelineCalls <= 1, `pipeline started ${pipelineCalls} times`);
});

test('status poll converts an abandoned run into a retryable failure', async () => {
  const { db, jobs } = install({ 'reports/r1': report({ updatedAt: minutesAgo(30) }) });
  const status = await jobs.getAnalysisStatus('r1', 'u1');
  assert.equal(status.reportStatus, 'failed');
  assert.match(status.pipelineError, /interrupted/);
  assert.equal(db.store.get('reports/r1').data.photos[0].analysisStatus, 'needs_attention');
});

test('status poll leaves a live run alone', async () => {
  const { db, jobs } = install({ 'reports/r1': report({ pipelineLease: { id: 'live', heartbeatAt: minutesAgo(1) } }) });
  const status = await jobs.getAnalysisStatus('r1', 'u1');
  assert.equal(status.reportStatus, 'processing');
  assert.equal(db.store.get('reports/r1').data.photos[0].analysisStatus, 'analyzing');
});
