const test = require('node:test');
const assert = require('node:assert/strict');
const { processPhotoBatch } = require('../utils/photoBatchProcessor');

// Phase 6 (PHASES.md) + its 2026-08-16 post-completion addendum: photo
// uploads used to be all-or-nothing -- one corrupt or spoofed file rejected
// the ENTIRE request. These tests prove each photo now gets its own
// pass/fail outcome, plus duplicate-detection (within-batch AND against
// photos already on the report), EXIF-normalization, 3-tier storage
// (original/display/thumbnail), and thumbnail-generation behavior, all via
// dependency injection so no real Firebase Storage or sharp calls happen in
// tests.

const validJpeg = (label) => ({
  originalname: `${label}.jpg`,
  mimetype: 'image/jpeg',
  size: 12345,
  buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(label), Buffer.alloc(20)]),
});

const corruptFile = (label) => ({
  originalname: `${label}.jpg`,
  mimetype: 'image/jpeg',
  size: 999,
  buffer: Buffer.from('this is not really a jpeg'),
});

const makeDeps = (overrides = {}) => {
  const uploaded = [];
  return {
    // Uploads now run concurrently across files (Phase 7 perf fix), so a
    // simulated failure can no longer be pinned to a raw call INDEX -- two
    // files' uploads can interleave in either order. Instead, `failWhen`
    // matches by content (objectPath tier + which file's bytes/label are
    // present), which is stable regardless of concurrency/ordering.
    uploadBufferFn: async (objectPath, buffer, mimetype) => {
      if (overrides.failWhen && overrides.failWhen(objectPath, buffer)) {
        throw new Error('simulated storage failure');
      }
      uploaded.push({ objectPath, buffer, mimetype });
    },
    // A distinguishable transform (not identity) so tests can prove the
    // "display" copy differs from the untouched original.
    generateThumbnailFn: overrides.generateThumbnailFn || (async (buf) => Buffer.from('thumb-of-' + buf.length)),
    normalizeOrientationFn: overrides.normalizeOrientationFn || (async (buf) => Buffer.concat([Buffer.from('NORM:'), buf])),
    // Phase 24: default to fakes that never touch real sharp/EXIF decoding
    // (the fixture buffers above aren't real images), matching the existing
    // dependency-injection pattern for every other Storage/sharp call.
    assessPhotoQualityFn: overrides.assessPhotoQualityFn || (async () => (
      { qualityWarning: false, qualityReasons: [], qualityMetrics: { width: 4000, height: 3000, laplacianVariance: 500 } }
    )),
    resolveCapturedAtFn: overrides.resolveCapturedAtFn || (async (_buf, uploadedAtIso) => ({ value: uploadedAtIso, source: 'upload' })),
    _uploaded: uploaded,
  };
};

test('a valid photo is uploaded to all 3 tiers, thumbnailed, and marked "uploaded"', async () => {
  const deps = makeDeps();
  const { records, analyzable } = await processPhotoBatch('uid1', 'r1', [validJpeg('a')], [], 0, deps);
  assert.equal(records.length, 1);
  assert.equal(records[0].status, 'uploaded');
  assert.ok(records[0].originalPath);
  assert.ok(records[0].objectPath);
  assert.ok(records[0].thumbnailPath);
  assert.notEqual(records[0].originalPath, records[0].objectPath);
  assert.ok(records[0].contentHash);
  assert.equal(records[0].error, null);
  assert.equal(analyzable.length, 1);
  assert.equal(deps._uploaded.length, 3); // original + display + thumbnail
});

test('the untouched original is stored unmodified; the display copy is the normalized one', async () => {
  const deps = makeDeps(); // default normalizeOrientationFn prefixes bytes with "NORM:"
  const photo = validJpeg('orientme');
  await processPhotoBatch('uid1', 'r1', [photo], [], 0, deps);
  const originalUpload = deps._uploaded[0];
  const displayUpload = deps._uploaded[1];
  assert.deepEqual(originalUpload.buffer, photo.buffer); // byte-for-byte original
  assert.notDeepEqual(displayUpload.buffer, photo.buffer); // normalized, so different
  assert.ok(displayUpload.buffer.toString('latin1').startsWith('NORM:'));
});

test('a corrupt/disguised file is isolated as FAILED, not rejected as a whole request', async () => {
  const deps = makeDeps();
  const { records, analyzable } = await processPhotoBatch('uid1', 'r1', [validJpeg('good'), corruptFile('bad')], [], 0, deps);
  assert.equal(records.length, 2);
  assert.equal(records[0].status, 'uploaded');
  assert.equal(records[1].status, 'failed');
  assert.match(records[1].error, /not a valid image/);
  // The good photo still gets analyzed even though the bad one failed.
  assert.equal(analyzable.length, 1);
});

test('a duplicate photo within the same batch is flagged, not re-uploaded', async () => {
  const deps = makeDeps();
  const same = validJpeg('dup');
  const copy = { ...same, originalname: 'dup-copy.jpg' }; // same bytes, different filename
  const { records, analyzable } = await processPhotoBatch('uid1', 'r1', [same, copy], [], 0, deps);
  assert.equal(records[0].status, 'uploaded');
  assert.equal(records[1].status, 'duplicate');
  assert.match(records[1].error, /Duplicate of "dup.jpg"/);
  assert.equal(analyzable.length, 1); // duplicate excluded from AI analysis/imagePaths
  assert.equal(deps._uploaded.length, 3); // 1 photo's original+display+thumbnail, not 2 photos
});

test('a duplicate of a photo ALREADY ATTACHED to the report (not just this batch) is flagged', async () => {
  const deps = makeDeps();
  const incoming = validJpeg('already-on-report');
  const hash = require('crypto').createHash('sha256').update(incoming.buffer).digest('hex');
  const existingHashes = [{ hash, fileName: 'original-upload.jpg' }];
  const { records, analyzable } = await processPhotoBatch('uid1', 'r1', [incoming], existingHashes, 0, deps);
  assert.equal(records[0].status, 'duplicate');
  assert.match(records[0].error, /Duplicate of "original-upload.jpg"/);
  assert.equal(analyzable.length, 0);
  assert.equal(deps._uploaded.length, 0); // never uploaded at all -- caught before any Storage write
});

test('two photos with different content are never flagged as duplicates of each other', async () => {
  const deps = makeDeps();
  const { records } = await processPhotoBatch('uid1', 'r1', [validJpeg('one'), validJpeg('two')], [], 0, deps);
  assert.equal(records[0].status, 'uploaded');
  assert.equal(records[1].status, 'uploaded');
});

test('a mixed batch (valid + corrupt + duplicate) isolates each outcome independently', async () => {
  const deps = makeDeps();
  const original = validJpeg('mix');
  const files = [original, corruptFile('bad'), { ...original, originalname: 'mix-again.jpg' }, validJpeg('ok2')];
  const { records, analyzable } = await processPhotoBatch('uid1', 'r1', files, [], 0, deps);
  assert.deepEqual(records.map(r => r.status), ['uploaded', 'failed', 'duplicate', 'uploaded']);
  assert.equal(analyzable.length, 2);
});

test('a storage upload failure (original tier) marks that one photo FAILED without throwing', async () => {
  // Fail only the ORIGINAL-tier write for the "fails" photo specifically
  // (matched by objectPath folder + the label embedded in its bytes) -- with
  // concurrent per-file uploads, a raw call-index can no longer identify
  // "the first upload" deterministically across two files.
  const deps = makeDeps({
    failWhen: (objectPath, buffer) => objectPath.includes('/originals/') && buffer.includes(Buffer.from('fails')),
  });
  const failing = validJpeg('fails');
  const { records, analyzable } = await processPhotoBatch('uid1', 'r1', [failing, validJpeg('ok')], [], 0, deps);
  const failedRecord = records.find(r => r.fileName === 'fails.jpg');
  const okRecord = records.find(r => r.fileName === 'ok.jpg');
  assert.equal(failedRecord.status, 'failed');
  assert.match(failedRecord.error, /Upload to storage failed/);
  assert.equal(failedRecord.objectPath, null); // never reached the display-tier upload
  assert.equal(okRecord.status, 'uploaded');
  assert.equal(analyzable.length, 1);
});

test('a storage upload failure on the DISPLAY tier (original already saved) still marks the photo FAILED', async () => {
  // Display tier is the base path (no /originals/ or /thumbnails/ folder).
  const deps = makeDeps({
    failWhen: (objectPath) => !objectPath.includes('/originals/') && !objectPath.includes('/thumbnails/'),
  });
  const { records } = await processPhotoBatch('uid1', 'r1', [validJpeg('displayfail')], [], 0, deps);
  assert.equal(records[0].status, 'failed');
  assert.ok(records[0].originalPath); // the original tier did succeed
  assert.equal(records[0].objectPath, null);
});

test('thumbnail generation failure (e.g. unsupported format) does not fail the photo itself', async () => {
  const deps = makeDeps({ generateThumbnailFn: async () => { throw new Error('unsupported by this libvips build'); } });
  const { records } = await processPhotoBatch('uid1', 'r1', [validJpeg('heicish')], [], 0, deps);
  assert.equal(records[0].status, 'uploaded');
  assert.ok(records[0].originalPath);
  assert.ok(records[0].objectPath);
  assert.equal(records[0].thumbnailPath, null);
});

test('EXIF normalization failure falls back to the original bytes for the display copy too, without failing the photo', async () => {
  const deps = makeDeps({ normalizeOrientationFn: async () => { throw new Error('normalize failed'); } });
  const photo = validJpeg('rotate-me');
  const { records, analyzable } = await processPhotoBatch('uid1', 'r1', [photo], [], 0, deps);
  assert.equal(records[0].status, 'uploaded');
  assert.deepEqual(analyzable[0].buffer, photo.buffer);
  assert.deepEqual(deps._uploaded[0].buffer, photo.buffer); // original tier, always untouched
  assert.deepEqual(deps._uploaded[1].buffer, photo.buffer); // display tier, fell back to original bytes
});

test('an empty batch returns empty records with no calls made', async () => {
  const deps = makeDeps();
  const { records, analyzable } = await processPhotoBatch('uid1', 'r1', [], [], 0, deps);
  assert.deepEqual(records, []);
  assert.deepEqual(analyzable, []);
  assert.equal(deps._uploaded.length, 0);
});

test('Phase 8: a successfully uploaded photo starts with analysis:null and a pending review record', async () => {
  const deps = makeDeps();
  const { records } = await processPhotoBatch('uid1', 'r1', [validJpeg('a')], [], 0, deps);
  assert.equal(records[0].analysis, null);
  assert.deepEqual(records[0].review, { status: 'pending', observation: null, note: '', reviewedBy: null, reviewedAt: null });
});

test('every record has a stable per-photo id distinct from every other photo', async () => {
  const deps = makeDeps();
  const { records } = await processPhotoBatch('uid1', 'r1', [validJpeg('a'), validJpeg('b'), corruptFile('c')], [], 0, deps);
  const ids = records.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach(id => assert.equal(typeof id, 'string'));
});

// ── Phase 24: position, quality warnings, capture time ──────────────────

test('position is assigned sequentially from startPosition, in submission order, regardless of outcome', async () => {
  const deps = makeDeps();
  const files = [validJpeg('a'), corruptFile('bad'), validJpeg('b')];
  const { records } = await processPhotoBatch('uid1', 'r1', files, [], 7, deps);
  assert.deepEqual(records.map(r => r.position), [7, 8, 9]);
});

test('a fresh report (startPosition=0) assigns positions starting at 0', async () => {
  const deps = makeDeps();
  const { records } = await processPhotoBatch('uid1', 'r1', [validJpeg('a'), validJpeg('b')], [], 0, deps);
  assert.deepEqual(records.map(r => r.position), [0, 1]);
});

test('quality fields are populated from the injected quality assessor for an uploaded photo', async () => {
  const deps = makeDeps({
    assessPhotoQualityFn: async () => (
      { qualityWarning: true, qualityReasons: ['blurry'], qualityMetrics: { width: 400, height: 300, laplacianVariance: 5 } }
    ),
  });
  const { records } = await processPhotoBatch('uid1', 'r1', [validJpeg('a')], [], 0, deps);
  assert.equal(records[0].qualityWarning, true);
  assert.deepEqual(records[0].qualityReasons, ['blurry']);
  assert.deepEqual(records[0].qualityMetrics, { width: 400, height: 300, laplacianVariance: 5 });
});

test('a failed/duplicate photo never reaches quality assessment and keeps the "no warning" defaults', async () => {
  const deps = makeDeps({ assessPhotoQualityFn: async () => { throw new Error('should never be called'); } });
  const { records } = await processPhotoBatch('uid1', 'r1', [corruptFile('bad')], [], 0, deps);
  assert.equal(records[0].qualityWarning, false);
  assert.deepEqual(records[0].qualityReasons, []);
  assert.equal(records[0].qualityMetrics, null);
});

test('capture time is resolved from the ORIGINAL bytes, not the normalized display buffer', async () => {
  const seenBuffers = [];
  const deps = makeDeps({
    resolveCapturedAtFn: async (buf, uploadedAtIso) => {
      seenBuffers.push(buf);
      return { value: uploadedAtIso, source: 'upload' };
    },
  });
  const photo = validJpeg('capture-me');
  const { records } = await processPhotoBatch('uid1', 'r1', [photo], [], 0, deps);
  assert.deepEqual(seenBuffers[0], photo.buffer); // the untouched original, not "NORM:"-prefixed
  assert.deepEqual(records[0].capturedAt, { value: records[0].uploadedAt, source: 'upload' });
});

test('roomOrArea and annotations start unset (null) on every newly uploaded photo', async () => {
  const deps = makeDeps();
  const { records } = await processPhotoBatch('uid1', 'r1', [validJpeg('a')], [], 0, deps);
  assert.equal(records[0].roomOrArea, null);
  assert.equal(records[0].annotations, null);
});
