const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CAPACITY_ERROR_MESSAGE,
  computeBatchFingerprint,
  partitionRecordsByCapacity,
  rehashAgainstFreshState,
  countCommitted,
  appendReportPhotosAtomic,
} = require('../utils/photoCapacity');
const { FakeFirestore } = require('./helpers/fakeFirestore');

const rec = (id, overrides = {}) => ({ id, status: 'uploaded', fileName: `${id}.jpg`, contentHash: `hash-${id}`, objectPath: `disp/${id}`, originalPath: `orig/${id}`, thumbnailPath: `thumb/${id}`, ...overrides });

// ── partitionRecordsByCapacity (pure) ───────────────────────────────────

test('partitionRecordsByCapacity: accepts everything when there is enough remaining capacity', () => {
  const { records, acceptedCount, rejectedForCapacity } = partitionRecordsByCapacity([rec('a'), rec('b')], { committedCount: 0, capacity: 5 });
  assert.equal(acceptedCount, 2);
  assert.equal(rejectedForCapacity.length, 0);
  assert.deepEqual(records.map((r) => r.status), ['uploaded', 'uploaded']);
});

test('partitionRecordsByCapacity: accepts up to the remaining slots, rejects the rest in submission order', () => {
  const { records, acceptedCount, rejectedForCapacity } = partitionRecordsByCapacity([rec('a'), rec('b'), rec('c')], { committedCount: 2, capacity: 3 });
  assert.equal(acceptedCount, 1);
  assert.equal(rejectedForCapacity.map((r) => r.id).join(','), 'b,c');
  assert.equal(records[0].status, 'uploaded');
  assert.equal(records[1].status, 'failed');
  assert.equal(records[1].capacityRejected, true);
  assert.equal(records[1].error, CAPACITY_ERROR_MESSAGE);
  assert.equal(records[1].analysisStatus, null, 'a capacity-rejected photo is never queued for analysis');
});

test('partitionRecordsByCapacity: already at/over capacity rejects every incoming record', () => {
  const { acceptedCount, rejectedForCapacity } = partitionRecordsByCapacity([rec('a'), rec('b')], { committedCount: 5, capacity: 5 });
  assert.equal(acceptedCount, 0);
  assert.equal(rejectedForCapacity.length, 2);
});

test('partitionRecordsByCapacity: unlimited accepts everything, never runs the arithmetic', () => {
  const many = Array.from({ length: 500 }, (_, i) => rec(`u${i}`));
  const { acceptedCount, rejectedForCapacity } = partitionRecordsByCapacity(many, { committedCount: 100000, capacity: 5, unlimited: true });
  assert.equal(acceptedCount, 500);
  assert.equal(rejectedForCapacity.length, 0);
});

test('partitionRecordsByCapacity: a "failed" or "duplicate" record was never consuming a slot and is never capacity-rejected (usage-counting rule)', () => {
  const { records, rejectedForCapacity } = partitionRecordsByCapacity(
    [rec('a', { status: 'failed', error: 'corrupt' }), rec('b', { status: 'duplicate' }), rec('c')],
    { committedCount: 0, capacity: 0 }
  );
  assert.equal(records[0].status, 'failed');
  assert.equal(records[0].error, 'corrupt', 'an already-failed record keeps its ORIGINAL error, never overwritten by the capacity message');
  assert.equal(records[1].status, 'duplicate');
  assert.equal(rejectedForCapacity.length, 1, 'only the genuinely-uploaded one (c) is capacity-rejected');
  assert.equal(rejectedForCapacity[0].id, 'c');
});

test('partitionRecordsByCapacity: an excluded-from-analysis photo (review.status) still consumes -- upload `status`, not review state, drives counting', () => {
  const excluded = rec('a', { review: { status: 'excluded', observation: null, note: '', reviewedBy: 'u1', reviewedAt: 'now' } });
  const { acceptedCount } = partitionRecordsByCapacity([excluded], { committedCount: 0, capacity: 1 });
  assert.equal(acceptedCount, 1, 'status is uploaded, so it still consumes a unit regardless of review.status');
});

test('partitionRecordsByCapacity: a thumbnail/derivative field never counts as a second unit (each record is one unit regardless of how many paths it carries)', () => {
  const { acceptedCount } = partitionRecordsByCapacity([rec('a')], { committedCount: 0, capacity: 1 });
  assert.equal(acceptedCount, 1, 'one record with originalPath+objectPath+thumbnailPath is still exactly one unit');
});

// ── computeBatchFingerprint (pure) ───────────────────────────────────────

test('computeBatchFingerprint: identical content (by hash) produces an identical fingerprint regardless of filename/order', () => {
  const a = computeBatchFingerprint([rec('x', { contentHash: 'h1' }), rec('y', { contentHash: 'h2' })]);
  const b = computeBatchFingerprint([rec('renamed', { contentHash: 'h2' }), rec('other-name', { contentHash: 'h1' })]);
  assert.equal(a, b);
});

test('computeBatchFingerprint: different content produces a different fingerprint', () => {
  const a = computeBatchFingerprint([rec('x', { contentHash: 'h1' })]);
  const b = computeBatchFingerprint([rec('x', { contentHash: 'h2' })]);
  assert.notEqual(a, b);
});

// ── rehashAgainstFreshState (pure) ───────────────────────────────────────

test('rehashAgainstFreshState: a hash matching an existing (already-committed) photo is downgraded to duplicate', () => {
  const { records, rejectedForDuplicate } = rehashAgainstFreshState([rec('new1', { contentHash: 'h-existing' })], [rec('old1', { contentHash: 'h-existing' })]);
  assert.equal(records[0].status, 'duplicate');
  assert.equal(rejectedForDuplicate.length, 1);
});

test('rehashAgainstFreshState: distinct content passes through untouched', () => {
  const { records, rejectedForDuplicate } = rehashAgainstFreshState([rec('new1', { contentHash: 'h-new' })], [rec('old1', { contentHash: 'h-old' })]);
  assert.equal(records[0].status, 'uploaded');
  assert.equal(rejectedForDuplicate.length, 0);
});

// ── countCommitted ───────────────────────────────────────────────────────

test('countCommitted only counts status === "uploaded"', () => {
  assert.equal(countCommitted([rec('a'), rec('b', { status: 'failed' }), rec('c', { status: 'duplicate' })]), 1);
});

// ── appendReportPhotosAtomic (transactional idiom, real contention) ─────

const seedReport = (db, id, data) => db.store.set(`reports/${id}`, { version: 1, data });

test('appendReportPhotosAtomic: NOT_FOUND for a report that does not exist', async () => {
  const db = new FakeFirestore();
  await assert.rejects(
    () => appendReportPhotosAtomic(db, { reportId: 'ghost', incomingRecords: [rec('a')], effectiveCapacity: 10, unlimited: false, attemptId: 'x', requestFingerprint: 'fp' }),
    (err) => err.code === 'NOT_FOUND'
  );
});

test('appendReportPhotosAtomic: REPORT_FINALIZED is rejected before any capacity work', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'r1', { status: 'finalized', photos: [] });
  await assert.rejects(
    () => appendReportPhotosAtomic(db, { reportId: 'r1', incomingRecords: [rec('a')], effectiveCapacity: 10, unlimited: false, attemptId: 'x', requestFingerprint: 'fp' }),
    (err) => err.code === 'REPORT_FINALIZED'
  );
  assert.deepEqual(db.store.get('reports/r1').data.photos, [], 'nothing was written');
});

test('appendReportPhotosAtomic: within capacity, commits and updates imagePaths/imageCount', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'r1', { status: 'draft', photos: [], imagePaths: [] });
  const result = await appendReportPhotosAtomic(db, {
    reportId: 'r1',
    incomingRecords: [rec('a'), rec('b')],
    effectiveCapacity: 10,
    unlimited: false,
    attemptId: 'attempt-1',
    requestFingerprint: computeBatchFingerprint([rec('a'), rec('b')]),
  });
  assert.equal(result.replayed, false);
  assert.equal(result.records.filter((r) => r.status === 'uploaded').length, 2);
  const stored = db.store.get('reports/r1').data;
  assert.equal(stored.photos.length, 2);
  assert.equal(stored.imagePaths.length, 2);
  assert.equal(stored.imageCount, 2);
});

test('appendReportPhotosAtomic: capacity exceeded partially accepts, rejects the rest, both surfaced to the caller', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'r1', { status: 'draft', photos: [rec('existing1')], imagePaths: ['disp/existing1'] });
  const result = await appendReportPhotosAtomic(db, {
    reportId: 'r1',
    incomingRecords: [rec('a'), rec('b')],
    effectiveCapacity: 2,
    unlimited: false,
    attemptId: 'attempt-1',
    requestFingerprint: computeBatchFingerprint([rec('a'), rec('b')]),
  });
  assert.equal(result.rejectedForCapacity.length, 1);
  assert.equal(db.store.get('reports/r1').data.photos.filter((p) => p.status === 'uploaded').length, 2, 'committed count never exceeds capacity');
});

test('appendReportPhotosAtomic: idempotent retry -- same attemptId + same fingerprint replays without double-counting', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'r1', { status: 'draft', photos: [], imagePaths: [] });
  const records = [rec('a')];
  const fp = computeBatchFingerprint(records);
  const first = await appendReportPhotosAtomic(db, { reportId: 'r1', incomingRecords: records, effectiveCapacity: 10, unlimited: false, attemptId: 'attempt-1', requestFingerprint: fp });
  const second = await appendReportPhotosAtomic(db, { reportId: 'r1', incomingRecords: records, effectiveCapacity: 10, unlimited: false, attemptId: 'attempt-1', requestFingerprint: fp });
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(db.store.get('reports/r1').data.photos.length, 1, 'the retry never added a second photo');
});

test('appendReportPhotosAtomic: same attemptId, DIFFERENT fingerprint is a hard conflict, never silently accepted', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'r1', { status: 'draft', photos: [], imagePaths: [] });
  await appendReportPhotosAtomic(db, { reportId: 'r1', incomingRecords: [rec('a')], effectiveCapacity: 10, unlimited: false, attemptId: 'attempt-1', requestFingerprint: 'fp-A' });
  await assert.rejects(
    () => appendReportPhotosAtomic(db, { reportId: 'r1', incomingRecords: [rec('b')], effectiveCapacity: 10, unlimited: false, attemptId: 'attempt-1', requestFingerprint: 'fp-B' }),
    (err) => err.code === 'IDEMPOTENCY_KEY_CONFLICT'
  );
  assert.equal(db.store.get('reports/r1').data.photos.length, 1);
});

test('appendReportPhotosAtomic: duplicate content (matching an existing committed photo\'s hash) never consumes a second unit', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'r1', { status: 'draft', photos: [rec('existing', { contentHash: 'shared-hash' })], imagePaths: ['disp/existing'] });
  const incoming = [rec('new', { contentHash: 'shared-hash' })];
  const result = await appendReportPhotosAtomic(db, { reportId: 'r1', incomingRecords: incoming, effectiveCapacity: 10, unlimited: false, attemptId: 'a1', requestFingerprint: computeBatchFingerprint(incoming) });
  assert.equal(result.records[0].status, 'duplicate');
  assert.equal(db.store.get('reports/r1').data.photos.filter((p) => p.status === 'uploaded').length, 1);
});

test('appendReportPhotosAtomic: REAL concurrency barrier -- two simultaneous requests for the LAST remaining slot, exactly one wins it', async () => {
  const db = new FakeFirestore();
  // Capacity 1, already at 0 committed -- exactly one of two simultaneous
  // single-photo batches can land.
  seedReport(db, 'r1', { status: 'draft', photos: [], imagePaths: [] });
  const batchA = [rec('a')];
  const batchB = [rec('b')];
  const [resA, resB] = await Promise.all([
    appendReportPhotosAtomic(db, { reportId: 'r1', incomingRecords: batchA, effectiveCapacity: 1, unlimited: false, attemptId: 'attempt-A', requestFingerprint: computeBatchFingerprint(batchA) }),
    appendReportPhotosAtomic(db, { reportId: 'r1', incomingRecords: batchB, effectiveCapacity: 1, unlimited: false, attemptId: 'attempt-B', requestFingerprint: computeBatchFingerprint(batchB) }),
  ]);
  const accepted = [...resA.records, ...resB.records].filter((r) => r.status === 'uploaded');
  assert.equal(accepted.length, 1, 'exactly one of the two simultaneous last-slot uploads succeeds');
  const stored = db.store.get('reports/r1').data;
  assert.equal(stored.photos.filter((p) => p.status === 'uploaded').length, 1, 'the committed array never overshoots capacity even under real contention');
});

test('appendReportPhotosAtomic: concurrency barrier at capacity 3 with 6 simultaneous single-photo batches -- exactly 3 win, no overshoot, no duplicates', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'r1', { status: 'draft', photos: [], imagePaths: [] });
  const N = 6;
  const settled = await Promise.all(
    Array.from({ length: N }, (_, i) => {
      const batch = [rec(`p${i}`)];
      return appendReportPhotosAtomic(db, {
        reportId: 'r1',
        incomingRecords: batch,
        effectiveCapacity: 3,
        unlimited: false,
        attemptId: `attempt-${i}`,
        requestFingerprint: computeBatchFingerprint(batch),
      });
    })
  );
  const acceptedIds = settled.flatMap((r) => r.records.filter((x) => x.status === 'uploaded').map((x) => x.id));
  assert.equal(acceptedIds.length, 3, 'exactly capacity worth of photos accepted across all 6 simultaneous requests');
  assert.equal(new Set(acceptedIds).size, 3, 'no duplicates among the accepted set');
  const stored = db.store.get('reports/r1').data;
  assert.equal(stored.photos.filter((p) => p.status === 'uploaded').length, 3);
});
