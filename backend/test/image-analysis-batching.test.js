const test = require('node:test');
const assert = require('node:assert/strict');
const {
  analyzeImages,
  aggregateBatchResults,
  VISION_BATCH_SIZE,
} = require('../services/aiService');

// Phase 1 fix (PHASES.md): analyzeImages used to hard-cap at the first 10 images
// (`images.slice(0, 10)`) regardless of how many were uploaded. These tests prove
// every uploaded photo (up to 100) is now actually analyzed, in safe batches, with
// no silent drops and accurate reporting when something does fail.
//
// Phase 8 (Per-Photo Analysis Review UI): the vision API now returns ONE
// structured entry per photo (`photos: [...]`, exactly one per image in the
// batch) instead of a single whole-batch summary -- these tests were updated
// to mock/assert that shape (e.g. `damages.length` now equals the number of
// PHOTOS analyzed, not the number of batches).

const JPEG_IMG = { buffer: Buffer.from('fake-jpeg-bytes'), mimetype: 'image/jpeg' };

const makeImages = (count, mimetype = 'image/jpeg') =>
  Array.from({ length: count }, (_, i) => ({
    buffer: Buffer.from(`fake-bytes-${i}`),
    mimetype,
  }));

const photoEntry = (severity = 'Minor') => ({
  location: 'Interior - Kitchen', category: 'Water Damage', severity, observation: 'x', confidence: 'High',
});

// Records every call so tests can assert exact batch counts/sizes; always
// returns a syntactically valid batch-shaped JSON string (like the real API).
// `overrides.fail(batchKey, attemptNumber)` -- keyed by the batch's first
// image's own data (stable across retries of the SAME batch, since a retry
// re-sends the identical imageBlocks) rather than a raw call index, so tests
// can express "this specific batch fails N times" independent of which wave
// concurrent workers happen to process it in (Phase 7: batches now retry
// internally, so a plain call-count index no longer identifies "which batch").
const makeRecordingMock = (overrides = {}) => {
  const calls = [];
  const attemptsByKey = new Map();
  const fn = async (promptText, imageBlocks) => {
    const key = imageBlocks[0]?.source?.data || 'empty';
    const attempt = (attemptsByKey.get(key) || 0) + 1;
    attemptsByKey.set(key, attempt);
    calls.push({ promptText, count: imageBlocks.length, key, attempt });
    if (overrides.fail && overrides.fail(key, attempt)) {
      throw new Error(overrides.failMessage || 'simulated batch failure');
    }
    const batchSeverity = (overrides.severities && overrides.severities[calls.length - 1]) || 'Minor';
    return JSON.stringify({
      summary: `batch ${calls.length} ok`,
      itemsForProfessionalReview: [`Review item ${calls.length}`],
      documentationNotes: `notes ${calls.length}`,
      photos: Array.from({ length: imageBlocks.length }, () => photoEntry(batchSeverity)),
    });
  };
  fn.calls = calls;
  return fn;
};

// The base64 data of a specific fake image's block, used to identify "the
// batch containing this image" across retries in the tests below.
const imageKey = (i) => Buffer.from(`fake-bytes-${i}`).toString('base64');

for (const count of [5, 10, 15, 50, 100]) {
  test(`analyzeImages analyzes all ${count} uploaded photos with no silent drops`, async () => {
    const mock = makeRecordingMock();
    const result = await analyzeImages(makeImages(count), { callVisionApi: mock });

    const expectedBatches = Math.ceil(count / VISION_BATCH_SIZE);
    assert.equal(
      mock.calls.length,
      expectedBatches,
      `expected ${expectedBatches} batch call(s) for ${count} photos`
    );
    assert.equal(
      mock.calls.reduce((sum, c) => sum + c.count, 0),
      count,
      'every uploaded photo must be included across the batches, not just the first 10'
    );
    assert.equal(
      result.totalImagesAnalyzed,
      count,
      'reported total must equal the true analyzed count, not a hardcoded cap'
    );
    assert.equal(result.imagesFailed, 0);
    assert.equal(result.imagesSkipped, 0);
    assert.equal(
      result.damages.length,
      count,
      'one damages entry per successfully analyzed photo, across every batch'
    );
    assert.equal(result.photos.length, count, 'the raw per-photo classifications must also all be present');
  });
}

test('a single batch (<=10 photos) matches the pre-fix single-call shape', async () => {
  const mock = makeRecordingMock();
  const result = await analyzeImages(makeImages(7), { callVisionApi: mock });
  assert.equal(mock.calls.length, 1);
  assert.equal(result.totalImagesAnalyzed, 7);
  assert.ok(Array.isArray(result.damages));
  assert.equal(result.damages.length, 7);
  assert.ok(Array.isArray(result.itemsForProfessionalReview));
  assert.equal(typeof result.severity, 'string');
  assert.equal(typeof result.summary, 'string');
});

test('one batch that fails every attempt is retried up to MAX_BATCH_ATTEMPTS, then reported as failed -- without blocking the rest', async () => {
  // 25 photos -> 3 batches (10, 10, 5); the middle batch (starting at image 10) fails every attempt.
  const key = imageKey(10);
  const mock = makeRecordingMock({ fail: (k) => k === key, failMessage: 'vision request timed out' });
  const result = await analyzeImages(makeImages(25), { callVisionApi: mock });

  const failingBatchCalls = mock.calls.filter((c) => c.key === key);
  assert.equal(failingBatchCalls.length, 3, 'the failing batch should be retried up to MAX_BATCH_ATTEMPTS (3) times');
  assert.equal(
    result.totalImagesAnalyzed,
    15,
    'only the 2 successful batches (10+5) should count as analyzed'
  );
  assert.equal(
    result.imagesFailed,
    10,
    "the failed batch's 10 photos must be reported as failed after exhausting retries, not silently dropped"
  );
  assert.match(result.summary, /could not be analyzed due to an error/i);
});

test('Phase 7: a batch that fails once then succeeds on retry is counted as analyzed, not failed', async () => {
  const key = imageKey(10);
  const mock = makeRecordingMock({
    fail: (k, attempt) => k === key && attempt === 1, // only the FIRST attempt fails
    failMessage: 'transient network blip',
  });
  const result = await analyzeImages(makeImages(25), { callVisionApi: mock });

  const retriedBatchCalls = mock.calls.filter((c) => c.key === key);
  assert.equal(retriedBatchCalls.length, 2, 'the batch should succeed on its 2nd attempt after one transient failure');
  assert.equal(result.totalImagesAnalyzed, 25, 'all photos should be analyzed once the retry succeeds');
  assert.equal(result.imagesFailed, 0);
});

test('Phase 7: onBatchComplete fires once per batch with the correct photoIds and a real attempt count', async () => {
  const key = imageKey(10);
  const mock = makeRecordingMock({ fail: (k, attempt) => k === key && attempt === 1 });
  const images = makeImages(25).map((img, i) => ({ ...img, photoId: `photo-${i}` }));
  const seen = [];
  await analyzeImages(images, { callVisionApi: mock, onBatchComplete: (photoIds, result) => seen.push({ photoIds, result }) });

  // Completion order isn't guaranteed to match batch index (a retried batch
  // may finish after a later, first-try-successful one) -- that's intentional
  // (a slow/retrying batch must never block the others), so match by content.
  assert.equal(seen.length, 3, 'one onBatchComplete call per batch (10, 10, 5)');
  const byFirstId = Object.fromEntries(seen.map((s) => [s.photoIds[0], s]));
  assert.deepEqual(byFirstId['photo-0'].photoIds, Array.from({ length: 10 }, (_, i) => `photo-${i}`));
  assert.deepEqual(byFirstId['photo-10'].photoIds, Array.from({ length: 10 }, (_, i) => `photo-${i + 10}`));
  assert.deepEqual(byFirstId['photo-20'].photoIds, Array.from({ length: 5 }, (_, i) => `photo-${i + 20}`));
  assert.equal(byFirstId['photo-10'].result.ok, true);
  assert.equal(byFirstId['photo-10'].result.attempts, 2, 'the retried batch reports its real attempt count');
  assert.equal(byFirstId['photo-0'].result.attempts, 1);
  // Phase 8: each settled batch's result carries one classified `photos` entry
  // per image in that batch, ready for photoJobService to attribute by index.
  assert.equal(byFirstId['photo-0'].result.result.photos.length, 10);
  assert.equal(byFirstId['photo-20'].result.result.photos.length, 5);
});

test('Phase 7: onBatchComplete falls back to array index when no photoId is supplied (existing callers unaffected)', async () => {
  const mock = makeRecordingMock();
  const seen = [];
  await analyzeImages(makeImages(12), { callVisionApi: mock, onBatchComplete: (photoIds) => seen.push(photoIds) });
  assert.deepEqual(seen[0], Array.from({ length: 10 }, (_, i) => i));
  assert.deepEqual(seen[1], [10, 11]);
});

test('Phase 7: a failure in the onBatchComplete hook itself never aborts the underlying analysis', async () => {
  const mock = makeRecordingMock();
  const result = await analyzeImages(makeImages(5), {
    callVisionApi: mock,
    onBatchComplete: () => { throw new Error('progress-reporting is broken'); },
  });
  assert.equal(result.totalImagesAnalyzed, 5);
  assert.equal(result.imagesFailed, 0);
});

test('if every batch fails, the failure is reported honestly rather than a false success', async () => {
  const mock = makeRecordingMock({ fail: () => true, failMessage: 'network unreachable' });
  const result = await analyzeImages(makeImages(12), { callVisionApi: mock });

  assert.equal(result.totalImagesAnalyzed, 0);
  assert.equal(result.imagesFailed, 12);
  assert.match(result.summary, /failed for all 12 photo/i);
});

test('images in an unsupported format (e.g. HEIC) are counted as skipped, not silently vanished', async () => {
  const mock = makeRecordingMock();
  const images = [...makeImages(3, 'image/jpeg'), ...makeImages(2, 'image/heic')];
  const result = await analyzeImages(images, { callVisionApi: mock });

  assert.equal(mock.calls.length, 1);
  assert.equal(
    mock.calls[0].count,
    3,
    'only the 3 Claude-supported images should reach the vision API'
  );
  assert.equal(result.totalImagesAnalyzed, 3);
  assert.equal(result.imagesSkipped, 2);
  assert.match(result.summary, /2 photo\(s\) were in an unsupported format/i);
});

test('zero valid images returns an honest empty result without calling the vision API', async () => {
  const mock = makeRecordingMock();
  const result = await analyzeImages(makeImages(4, 'image/heic'), { callVisionApi: mock });

  assert.equal(mock.calls.length, 0);
  assert.equal(result.totalImagesAnalyzed, 0);
  assert.equal(result.imagesSkipped, 4);
  assert.match(result.summary, /unsupported format/i);
});

test('empty input array returns an honest "no images" result', async () => {
  const mock = makeRecordingMock();
  const result = await analyzeImages([], { callVisionApi: mock });
  assert.equal(mock.calls.length, 0);
  assert.equal(result.totalImagesAnalyzed, 0);
  assert.match(result.summary, /no valid images/i);
});

test('overall severity escalates to the worst severity seen across any photo', async () => {
  // 100 photos -> 10 batches; batch #4 (index 3) reports Severe for its photos, everything else Minor.
  const mock = makeRecordingMock({ severities: { 3: 'Severe' } });
  const result = await analyzeImages(makeImages(100), { callVisionApi: mock });
  assert.equal(result.severity, 'Severe');
});

test('analyzeImages gracefully reports when ANTHROPIC_API_KEY is not configured (no mock, no network)', async () => {
  const original = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await analyzeImages([JPEG_IMG]);
    assert.match(result.summary, /not configured/i);
    assert.equal(result.totalImagesAnalyzed, 0);
  } finally {
    if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
  }
});

test('aggregateBatchResults (pure) merges per-photo classifications/review-items across batches and dedupes', () => {
  const result = aggregateBatchResults(
    [
      {
        ok: true,
        count: 10,
        result: {
          summary: 'a',
          itemsForProfessionalReview: ['Check wiring'],
          documentationNotes: 'n1',
          photos: [{ location: 'Kitchen', category: 'Water Damage', severity: 'Minor', observation: 'x', confidence: 'High' }],
        },
      },
      {
        ok: true,
        count: 5,
        result: {
          summary: 'b',
          itemsForProfessionalReview: ['Check wiring', 'Check mold'],
          documentationNotes: 'n2',
          photos: [{ location: 'Bathroom', category: 'Mold/Moisture', severity: 'Moderate', observation: 'y', confidence: 'Medium' }],
        },
      },
    ],
    { skipped: 0 }
  );

  assert.equal(result.totalImagesAnalyzed, 15);
  assert.equal(result.damages.length, 2);
  assert.equal(result.damages[0].area, 'Kitchen');
  assert.equal(result.damages[1].area, 'Bathroom');
  assert.deepEqual(result.itemsForProfessionalReview, ['Check wiring', 'Check mold']);
  assert.equal(result.severity, 'Moderate');
  assert.equal(result.imagesFailed, 0);
  assert.equal(result.imagesSkipped, 0);
});

test('aggregateBatchResults (pure) reports partial failure accurately', () => {
  const result = aggregateBatchResults(
    [
      {
        ok: true,
        count: 10,
        result: {
          summary: 'a',
          itemsForProfessionalReview: [],
          documentationNotes: '',
          photos: [],
        },
      },
      { ok: false, count: 8, error: 'timeout' },
    ],
    { skipped: 2 }
  );

  assert.equal(result.totalImagesAnalyzed, 10);
  assert.equal(result.imagesFailed, 8);
  assert.equal(result.imagesSkipped, 2);
  assert.match(result.summary, /8 photo\(s\) could not be analyzed due to an error/);
  assert.match(result.summary, /2 photo\(s\) were in an unsupported format/);
});
