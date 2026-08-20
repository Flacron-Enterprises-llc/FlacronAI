// Per-photo upload processing (Phase 6: Photo Upload & Per-Photo UX
// Hardening). Replaces the old all-or-nothing "reject the whole request if
// any single file is bad" behavior: each file gets its own record and its own
// pass/fail outcome, so one corrupt or duplicate photo never blocks the rest
// of a batch. Shared by POST /generate and POST /:id/images so both photo-
// upload surfaces behave identically.
const crypto = require('crypto');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { isValidImageBuffer } = require('./imageValidation');
const { normalizeOrientation, generateThumbnail } = require('./thumbnailService');
const { reportImageObject, reportOriginalObject, reportThumbnailObject, uploadBuffer } = require('../config/storage');
const { assessPhotoQuality } = require('./photoQuality');
const { resolveCapturedAt } = require('./photoCaptureTime');

// Photo uploads run with a concurrency cap (Phase 7 finding, 2026-08-16 live
// verification): each photo needs 2 Storage writes (original + display) plus
// a thumbnail generate-and-write -- doing this one file at a time made a
// 12-photo POST /generate take ~29 seconds before the pipeline even started,
// directly undermining Phase 7's "respond immediately, don't make the client
// wait" goal. Files are independent, so they're processed concurrently
// instead, mirroring the same wave-based-worker pattern aiService.js already
// uses for vision-analysis batches.
const UPLOAD_CONCURRENCY = 8;

// Processes one multipart batch of photo files for a report. Returns:
//   records    -- one entry per input file (in original submission order),
//                  `{ id, fileName, size, mimeType, status, contentHash,
//                  originalPath, objectPath, thumbnailPath, error,
//                  uploadedAt, analysisStatus, analysisError, position,
//                  qualityWarning, qualityReasons, qualityMetrics,
//                  capturedAt, roomOrArea, annotations }`, status is
//                  'uploaded' | 'failed' | 'duplicate'.
//   analyzable -- `{ buffer, mimetype, photoId }` for only the successfully
//                  uploaded photos (normalized bytes), for AI vision analysis.
//
// Storage is 3-tier (Phase 6 addendum, 2026-08-16 -- spec requires the
// original never be altered): `originalPath` holds the untouched uploaded
// bytes; `objectPath` holds the EXIF-normalized "display" version used by AI
// analysis, exports, and full-size preview (unchanged role/name from the
// original Phase 6 ship, kept for backward compatibility with every existing
// reader); `thumbnailPath` is the small preview, as before.
//
// Duplicate detection is a SHA-256 content hash checked against BOTH this
// batch AND `existingHashes` -- content hashes already recorded on the
// report's previously-uploaded photos, passed in by the caller. A report with
// no prior photos (e.g. POST /generate, creating a brand-new report) simply
// passes an empty array. Validation + hashing runs as a fast, CPU-only,
// SEQUENTIAL first pass (deliberately not parallelized) so two copies of the
// same photo can never both slip past the "not seen yet" duplicate check at
// once -- only the actual Storage I/O for files that pass runs concurrently.
//
// `startPosition` (Phase 24) seeds the persisted `position` field so photos
// added via POST /:id/images continue the ordering sequence after whatever
// is already on the report, rather than colliding with 0. Callers pass the
// current photos[].length (including non-'uploaded' records, so position
// values stay monotonically increasing with submission order even though
// they may have gaps -- gaps are harmless for sorting).
//
// `deps` is test-only dependency injection (mirrors aiService.analyzeImages'
// `callVisionApi` pattern) -- production callers never pass it, so real
// Storage/sharp calls always run in the app itself.
const processPhotoBatch = async (uid, reportId, files = [], existingHashes = [], startPosition = 0, deps = {}) => {
  const doUpload = deps.uploadBufferFn || uploadBuffer;
  const doThumbnail = deps.generateThumbnailFn || generateThumbnail;
  const doNormalize = deps.normalizeOrientationFn || normalizeOrientation;
  const doAssessQuality = deps.assessPhotoQualityFn || assessPhotoQuality;
  const doResolveCapturedAt = deps.resolveCapturedAtFn || resolveCapturedAt;

  // Seed with already-attached photos' hashes first, so a duplicate of an
  // EXISTING photo is caught just as reliably as a duplicate within this
  // batch -- both live in the same Map, just added at different times.
  const seenHashes = new Map(); // hash -> a human-readable label for the error message
  for (const { hash, fileName } of existingHashes) {
    if (hash) seenHashes.set(hash, fileName || 'a photo already on this report');
  }

  // ── Pass 1: validate + hash every file (fast, in-memory, sequential) ──
  const prepared = files.map((f, index) => {
    const record = {
      id: uuidv4(),
      fileName: f.originalname || 'unnamed',
      size: f.size,
      mimeType: f.mimetype,
      status: 'uploaded',
      contentHash: null,
      originalPath: null,
      objectPath: null,
      thumbnailPath: null,
      error: null,
      uploadedAt: new Date().toISOString(),
      // Phase 7: analysis lifecycle, separate from `status` above (which is
      // strictly the upload outcome). Stays null for photos that never made
      // it past upload (failed/duplicate) -- there is nothing to analyze.
      analysisStatus: null,
      analysisError: null,
      // Phase 8 (Per-Photo Analysis Review UI): the structured per-photo AI
      // result (`{location, category, severity, observation, confidence}`),
      // filled in by photoJobService once analysis for this photo completes.
      analysis: null,
      // The human reviewer's state for this photo -- starts 'pending' (AI
      // text used as-is) until a reviewer approves/edits/excludes it or adds
      // a note. `observation` is only set when status is 'edited' (null
      // otherwise means "use the AI's own analysis.observation").
      review: { status: 'pending', observation: null, note: '', reviewedBy: null, reviewedAt: null },
      // Phase 24 additions -- all additive, all optional on read (legacy and
      // pre-Phase-24 photos simply have these as null/false/[] and every
      // reader below is written to treat that as "no warning"/"unordered"/
      // "unset", never as an error).
      position: startPosition + index,
      qualityWarning: false,
      qualityReasons: [],
      qualityMetrics: null,
      capturedAt: null,
      roomOrArea: null,
      annotations: null,
    };

    if (!isValidImageBuffer(f.buffer)) {
      record.status = 'failed';
      record.error = 'File is not a valid image (corrupt file or disguised file type).';
      return { index, file: f, record, needsUpload: false };
    }

    const hash = crypto.createHash('sha256').update(f.buffer).digest('hex');
    if (seenHashes.has(hash)) {
      record.status = 'duplicate';
      record.error = `Duplicate of "${seenHashes.get(hash)}".`;
      return { index, file: f, record, needsUpload: false };
    }
    seenHashes.set(hash, record.fileName);
    record.contentHash = hash;
    return { index, file: f, record, needsUpload: true };
  });

  // ── Pass 2: upload/normalize/thumbnail the photos that passed validation,
  // concurrently (capped), since each is fully independent of the others. ──
  const toUpload = prepared.filter((p) => p.needsUpload);
  const analyzable = [];

  const uploadOne = async ({ file: f, record }) => {
    const ext = path.extname(record.fileName).toLowerCase() || '.jpg';
    const baseName = `${Date.now()}-${record.id.slice(0, 8)}-${Math.random().toString(36).slice(2, 9)}`;

    // 1. Original, untouched bytes -- stored first and never re-derived from
    // anything else, so a later failure in normalization/thumbnailing can
    // never cost the user their original photo.
    const originalPath = reportOriginalObject(uid, reportId, `${baseName}${ext}`);
    try {
      await doUpload(originalPath, f.buffer, f.mimetype);
      record.originalPath = originalPath;
    } catch {
      record.status = 'failed';
      record.error = 'Upload to storage failed.';
      return;
    }

    // 2. EXIF-orientation-normalized "display" version -- best-effort; an
    // unsupported/exotic format falls back to the original bytes rather than
    // failing the photo (the original tier above is unaffected either way).
    let storedBuffer = f.buffer;
    try {
      storedBuffer = await doNormalize(f.buffer);
    } catch { /* keep original bytes for the display copy too */ }

    const objectPath = reportImageObject(uid, reportId, `${baseName}${ext}`);
    try {
      await doUpload(objectPath, storedBuffer, f.mimetype);
      record.objectPath = objectPath;
    } catch {
      record.status = 'failed';
      record.error = 'Upload to storage failed.';
      return;
    }

    // 3. Thumbnail -- also best-effort (e.g. a HEIC variant this libvips
    // build can't decode) -- the photo itself is still a success either way.
    try {
      const thumbBuffer = await doThumbnail(storedBuffer);
      const thumbnailPath = reportThumbnailObject(uid, reportId, `${baseName}-thumb.jpg`);
      await doUpload(thumbnailPath, thumbBuffer, 'image/jpeg');
      record.thumbnailPath = thumbnailPath;
    } catch { /* no thumbnail available for this photo */ }

    // 4. Phase 24: a fast, deterministic quality heuristic (resolution +
    // blur) on the display copy -- purely informational, never blocks the
    // upload -- and EXIF capture-time extraction from the ORIGINAL bytes
    // (the display copy has EXIF stripped by normalizeOrientation's
    // re-encode). Both helpers fail open on any error.
    const quality = await doAssessQuality(storedBuffer);
    record.qualityWarning = quality.qualityWarning;
    record.qualityReasons = quality.qualityReasons;
    record.qualityMetrics = quality.qualityMetrics;
    record.capturedAt = await doResolveCapturedAt(f.buffer, record.uploadedAt);

    // Phase 7: every successfully-uploaded photo starts its analysis
    // lifecycle "queued" -- the async pipeline (photoJobService) advances
    // this as it works.
    record.analysisStatus = 'queued';
    analyzable.push({ buffer: storedBuffer, mimetype: f.mimetype, photoId: record.id });
  };

  let next = 0;
  const workerCount = Math.max(1, Math.min(UPLOAD_CONCURRENCY, toUpload.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < toUpload.length) {
      const item = toUpload[next++];
      await uploadOne(item);
    }
  });
  await Promise.all(workers);

  // Preserve the original submission order in the returned records, even
  // though upload completion order (with concurrency) may differ.
  const records = prepared.map((p) => p.record);
  return { records, analyzable };
};

module.exports = { processPhotoBatch };
