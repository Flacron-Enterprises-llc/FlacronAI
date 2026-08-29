const test = require('node:test');
const assert = require('node:assert/strict');
const { downloadPhotosForAnalysis, PHOTO_DOWNLOAD_CONCURRENCY } = require('../utils/photoRetrieval');

// Perf fix (production incident: report generation "takes excessively
// long"). Two real call sites used to re-download already-uploaded photo
// bytes from Storage ONE AT A TIME in a sequential `for..of` loop with an
// `await` inside it:
//   - POST /generate folding in Phase-25 staged draft photos
//     (backend/routes/reports.js) -- this loop ran BEFORE the response was
//     sent, so N staged photos meant N sequential Storage round-trips added
//     directly to the "Generate" button's spinner time.
//   - Retry Analysis re-fetching photos stuck in 'needs_attention'
//     (photoJobService.retryFailedAnalysis) -- delayed how long a retry took
//     to even start its Claude calls.
// downloadPhotosForAnalysis replaces both loops with the same bounded-
// concurrency "wave of workers" pattern already used for uploads
// (photoBatchProcessor.UPLOAD_CONCURRENCY) and vision batches
// (aiService.runBatchesLimited/VISION_BATCH_CONCURRENCY). These tests prove
// the concurrency cap is real (neither fully serial nor an unbounded
// fan-out), that every photo's identity survives the reordering concurrency
// introduces, and that one bad object never aborts the rest.

const photo = (id, objectPath, mimeType = 'image/jpeg') => ({ id, objectPath, mimeType });

test('downloads every photo and maps each to {buffer, mimetype, photoId} correctly', async () => {
  const photos = [photo('p1', 'obj/1'), photo('p2', 'obj/2', 'image/png'), photo('p3', 'obj/3')];
  const downloadFn = async (objectPath) => Buffer.from(`bytes:${objectPath}`);

  const result = await downloadPhotosForAnalysis(photos, downloadFn, 2);

  assert.equal(result.length, 3, 'every photo is downloaded, none dropped');
  const byId = Object.fromEntries(result.map((r) => [r.photoId, r]));
  assert.deepEqual(byId.p1.buffer, Buffer.from('bytes:obj/1'));
  assert.equal(byId.p2.mimetype, 'image/png');
  assert.deepEqual(byId.p3.buffer, Buffer.from('bytes:obj/3'));
});

test('a photo whose Storage object is missing/unreadable is silently skipped, not fabricated, and does not abort the rest', async () => {
  const photos = [photo('ok1', 'obj/ok1'), photo('missing', 'obj/missing'), photo('ok2', 'obj/ok2')];
  const downloadFn = async (objectPath) => {
    if (objectPath === 'obj/missing') throw new Error('object not found');
    return Buffer.from(objectPath);
  };

  const result = await downloadPhotosForAnalysis(photos, downloadFn, 8);

  assert.equal(result.length, 2, 'only the 2 successfully-downloaded photos are returned');
  const ids = result.map((r) => r.photoId).sort();
  assert.deepEqual(ids, ['ok1', 'ok2']);
});

test('respects the concurrency cap -- never more than N downloads in flight at once', async () => {
  const CAP = 3;
  const TOTAL = 12;
  const photos = Array.from({ length: TOTAL }, (_, i) => photo(`p${i}`, `obj/${i}`));

  let inFlight = 0;
  let maxObserved = 0;
  const downloadFn = async () => {
    inFlight++;
    maxObserved = Math.max(maxObserved, inFlight);
    // A short real delay so overlapping calls actually overlap in wall-clock
    // time instead of resolving synchronously before the next one starts.
    await new Promise((resolve) => setTimeout(resolve, 20));
    inFlight--;
    return Buffer.from('x');
  };

  const result = await downloadPhotosForAnalysis(photos, downloadFn, CAP);

  assert.equal(result.length, TOTAL);
  assert.ok(maxObserved <= CAP, `expected at most ${CAP} concurrent downloads, observed ${maxObserved}`);
  assert.equal(maxObserved, CAP, 'with 12 photos and a cap of 3, the cap should actually be reached (not under-utilized)');
});

test('bounded concurrency is faster than fully sequential -- proves downloads actually overlap', async () => {
  const CAP = 4;
  const TOTAL = 8;
  const DELAY_MS = 30;
  const photos = Array.from({ length: TOTAL }, (_, i) => photo(`p${i}`, `obj/${i}`));
  const downloadFn = async () => {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    return Buffer.from('x');
  };

  const started = Date.now();
  await downloadPhotosForAnalysis(photos, downloadFn, CAP);
  const elapsed = Date.now() - started;

  // Fully sequential would take ~TOTAL * DELAY_MS (240ms); bounded concurrency
  // at CAP=4 should take ~ceil(TOTAL/CAP) * DELAY_MS (60ms) plus scheduling
  // slack. Asserting well under the sequential figure demonstrates the
  // downloads genuinely run concurrently, not one-at-a-time.
  const sequentialEstimate = TOTAL * DELAY_MS;
  assert.ok(
    elapsed < sequentialEstimate * 0.6,
    `expected concurrent downloads (~${Math.ceil(TOTAL / CAP) * DELAY_MS}ms) to be well under the sequential estimate (${sequentialEstimate}ms); took ${elapsed}ms`
  );
});

test('never opens more workers than there are photos (small batches do not over-spawn)', async () => {
  const photos = [photo('only-one', 'obj/1')];
  let concurrentCalls = 0;
  let maxObserved = 0;
  const downloadFn = async () => {
    concurrentCalls++;
    maxObserved = Math.max(maxObserved, concurrentCalls);
    await new Promise((resolve) => setTimeout(resolve, 5));
    concurrentCalls--;
    return Buffer.from('x');
  };

  const result = await downloadPhotosForAnalysis(photos, downloadFn, PHOTO_DOWNLOAD_CONCURRENCY);
  assert.equal(result.length, 1);
  assert.equal(maxObserved, 1, 'a single photo should only ever trigger a single download call');
});

test('an empty photo list resolves immediately with no calls', async () => {
  let calls = 0;
  const downloadFn = async () => { calls++; return Buffer.from('x'); };
  const result = await downloadPhotosForAnalysis([], downloadFn, 8);
  assert.deepEqual(result, []);
  assert.equal(calls, 0);
});

test('PHOTO_DOWNLOAD_CONCURRENCY is a sane small bounded cap, not unbounded or serial', () => {
  assert.ok(PHOTO_DOWNLOAD_CONCURRENCY >= 2, 'must allow some real concurrency');
  assert.ok(PHOTO_DOWNLOAD_CONCURRENCY <= 20, 'must stay bounded, not an unbounded fan-out');
});
