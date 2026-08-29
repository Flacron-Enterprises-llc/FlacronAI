// Perf fix (production incident: report generation "takes excessively
// long"). Two call sites -- POST /generate folding in Phase-25 staged draft
// photos (backend/routes/reports.js), and Retry Analysis re-fetching photos
// stuck in 'needs_attention' (photoJobService.retryFailedAnalysis) -- used to
// re-download each already-uploaded photo's bytes from Storage ONE AT A TIME
// in a plain `for...of` loop with an `await` inside it. Each iteration is a
// full network round-trip to Firebase Storage; for the /generate case this
// loop ran BEFORE the response was sent to the client, so a report with
// N staged photos added N sequential round-trips directly to the "Generate"
// button's spinner time -- exactly the "generation takes excessively long"
// complaint, and a straight contradiction of Phase 7's stated goal ("the
// client never waits" -- see reports.js's own comment above the background-
// pipeline handoff).
//
// Storage reads for independent photos have no ordering dependency on each
// other (unlike the draft-append transaction, which genuinely must
// serialize), so this replaces the sequential loop with the same bounded-
// concurrency "wave of workers pulling from a shared cursor" pattern already
// used for uploads (photoBatchProcessor.UPLOAD_CONCURRENCY) and for vision
// batches (aiService.runBatchesLimited) -- a small, deliberate cap, not an
// unbounded `Promise.all` fan-out that could open dozens of simultaneous
// Storage connections for a 100-photo report.
//
// A photo whose object is genuinely missing/unreadable in Storage is still
// silently skipped (not fabricated, and never aborts the rest of the batch)
// -- identical behavior to the sequential loops this replaces.
const PHOTO_DOWNLOAD_CONCURRENCY = 8; // mirrors processPhotoBatch's UPLOAD_CONCURRENCY

// `photos` is any list of `{ id, objectPath, mimeType }`-shaped records
// (report.photos[] entries). `downloadFn` defaults to the real Storage
// downloadBuffer but is injectable for tests. Returns `{ buffer, mimetype,
// photoId }` entries -- the exact shape aiService.analyzeImages expects --
// in COMPLETION order, not submission order; every caller of this function
// attributes results back to a photo by `photoId`, not by array position, so
// this reordering (an inherent side effect of concurrency) is harmless.
const downloadPhotosForAnalysis = async (
  photos,
  downloadFn,
  concurrency = PHOTO_DOWNLOAD_CONCURRENCY
) => {
  const analyzable = [];
  let next = 0;
  const workerCount = Math.max(1, Math.min(concurrency, photos.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < photos.length) {
      const p = photos[next++];
      try {
        const buffer = await downloadFn(p.objectPath);
        analyzable.push({ buffer, mimetype: p.mimeType, photoId: p.id });
      } catch {
        // Object genuinely missing/unreadable -- that one photo just has no
        // analysis, matching the sequential loops' original behavior.
      }
    }
  });
  await Promise.all(workers);
  return analyzable;
};

module.exports = { downloadPhotosForAnalysis, PHOTO_DOWNLOAD_CONCURRENCY };
