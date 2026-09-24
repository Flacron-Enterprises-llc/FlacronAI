// Phase 44 (Central Plan Configuration & Atomic Photo-Capacity Enforcement).
//
// Shared photo-capacity accounting for every report-photo-adding surface.
// Usage-counting rule (defined once here, applied consistently everywhere):
//   - a photo record with status 'uploaded'   -> consumes one capacity unit
//   - a photo record with status 'failed'/'duplicate' -> never consumed
//   - a photo's `review.status` (pending/approved/edited/excluded) is a
//     SEPARATE lifecycle from upload `status` -- an excluded-from-analysis
//     photo is still `status: 'uploaded'` and still consumes a unit (it's
//     still stored and still part of the report)
//   - `thumbnailPath`/`originalPath` are fields ON the same record, never a
//     second record, so a derivative never consumes a second unit
//   - capacity is always DERIVED fresh from the current photos array length
//     (never a separately-maintained counter) -- so a deletion "releases"
//     capacity automatically, by construction, the instant the array shrinks
//   - a retried identical request (same idempotency key + same file content)
//     is a no-op replay, never a second consumption (see
//     appendReportPhotosAtomic's attempt-ledger below)
const crypto = require('crypto');

// Deterministic fingerprint of one upload attempt's file content, used to
// tell "a genuine retry of the same request" (safe, no-op replay) apart from
// "a different request reusing the same idempotency key" (rejected as a
// conflict) -- filename is deliberately excluded (two different filenames
// for byte-identical content is still the same retry; a renamed file isn't a
// meaningfully "different" request).
const computeBatchFingerprint = (records = []) => {
  const hashes = records
    .map((r) => r.contentHash)
    .filter(Boolean)
    .sort();
  return crypto.createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
};

// Pure function -- no I/O, fully unit-testable. Given the photo records
// produced for ONE incoming batch (already validated/uploaded/hashed by
// processPhotoBatch, in original submission order) and the capacity already
// committed on the target report, marks every 'uploaded' record beyond the
// remaining capacity as capacity-rejected (status flips to 'failed', with a
// dedicated `error`/`capacityRejected: true` so the caller can tell a
// capacity rejection apart from a genuine upload/corruption failure and clean
// up its now-orphaned Storage objects). Records that were already
// 'failed'/'duplicate' (corrupt file, in-batch dup) pass through unchanged --
// they never consumed a unit in the first place, so they can't be
// "capacity-rejected" either.
//
// `unlimited: true` short-circuits to "accept everything", matching
// Enterprise's contract (never even runs the arithmetic).
const CAPACITY_ERROR_MESSAGE = 'Report photo capacity reached for your current plan. Remove a photo, delete unused photos, or upgrade your plan.';

const partitionRecordsByCapacity = (records = [], { committedCount = 0, capacity = Infinity, unlimited = false } = {}) => {
  if (unlimited) {
    return { records: records.slice(), acceptedCount: records.filter((r) => r.status === 'uploaded').length, rejectedForCapacity: [] };
  }
  const available = Math.max(0, capacity - committedCount);
  let used = 0;
  const rejectedForCapacity = [];
  const nextRecords = records.map((r) => {
    if (r.status !== 'uploaded') return r;
    if (used < available) {
      used += 1;
      return r;
    }
    rejectedForCapacity.push(r);
    return {
      ...r,
      status: 'failed',
      error: CAPACITY_ERROR_MESSAGE,
      capacityRejected: true,
      analysisStatus: null, // never queue analysis for a photo that isn't actually kept
    };
  });
  return { records: nextRecords, acceptedCount: used, rejectedForCapacity };
};

// Re-checks a fresh batch's content hashes against a report's CURRENT
// (transactionally-fresh) photo hashes -- closes a race that a pre-upload-only
// hash check (processPhotoBatch's `existingHashes` argument, computed BEFORE
// this transaction runs) cannot: two near-simultaneous requests can each
// upload the same bytes before either has committed, so neither's pre-check
// sees the other's hash yet. Re-run inside the transaction, this catches it
// and downgrades the second arrival to 'duplicate' -- never consuming a
// second capacity unit for genuinely identical content, and marking it for
// Storage cleanup outside the transaction (the bytes were already written).
const rehashAgainstFreshState = (records, existingPhotos) => {
  const seen = new Map();
  for (const p of existingPhotos) {
    if (p.contentHash) seen.set(p.contentHash, p.fileName || 'a photo already on this report');
  }
  const rejectedForDuplicate = [];
  const next = records.map((r) => {
    if (r.status !== 'uploaded' || !r.contentHash) return r;
    if (seen.has(r.contentHash)) {
      rejectedForDuplicate.push(r);
      return { ...r, status: 'duplicate', error: `Duplicate of "${seen.get(r.contentHash)}".` };
    }
    seen.set(r.contentHash, r.fileName);
    return r;
  });
  return { records: next, rejectedForDuplicate };
};

// The count that actually matters for capacity: committed 'uploaded' photos
// only (see usage-counting rule above).
const countCommitted = (photos = []) => photos.filter((p) => p.status === 'uploaded').length;

// The atomic idiom (Phase 44 task 4/7), reusing appendStagedPhoto's exact
// `db.runTransaction(tx.get -> validate -> tx.set)` shape from
// photoDraftStaging.js. Storage upload (processPhotoBatch) happens BEFORE
// this is called, outside the transaction -- same reasoning as
// appendStagedPhoto: a transaction may retry its callback on contention, and
// re-running a Storage upload on every retry would be wasteful/could produce
// duplicate objects. Only the cheap Firestore read/partition/write belongs
// inside.
//
// Idempotency: `attemptId` is a client-supplied key (or a server-generated
// uuid for a legacy client that sent none -- see reports.js call site
// comment for why that case is NOT fully replay-safe) scoped to this one
// report's own `photoUploadAttempts` map, so it can never collide across
// reports/users. A retry with an IDENTICAL fingerprint replays the original
// outcome with zero additional capacity consumed; a retry with a DIFFERENT
// fingerprint under the same key is rejected outright (the key was reused
// for a genuinely different request, not a retry).
const appendReportPhotosAtomic = async (
  db,
  { reportId, incomingRecords, effectiveCapacity, unlimited, attemptId, requestFingerprint, nowIso = () => new Date().toISOString() }
) => {
  const ref = db.collection('reports').doc(reportId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) {
      const err = new Error('Report not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const data = doc.data();
    if (data.status === 'finalized') {
      const err = new Error('Finalized reports cannot be edited.');
      err.code = 'REPORT_FINALIZED';
      throw err;
    }

    const attempts = data.photoUploadAttempts || {};
    const prior = attemptId ? attempts[attemptId] : null;
    if (prior) {
      if (prior.fingerprint !== requestFingerprint) {
        const err = new Error('This upload request no longer matches an earlier request that used the same idempotency key.');
        err.code = 'IDEMPOTENCY_KEY_CONFLICT';
        throw err;
      }
      // Pure replay -- no write, no additional capacity consumed. Return the
      // previously-committed records for those photoIds so the response is
      // identical to the original successful response.
      const existingPhotos = data.photos || [];
      const replayedRecords = prior.photoIds
        .map((id) => existingPhotos.find((p) => p.id === id))
        .filter(Boolean);
      return { replayed: true, records: replayedRecords, rejectedForCapacity: [], rejectedForDuplicate: [] };
    }

    const existingPhotos = data.photos || [];
    const { records: dedupedRecords, rejectedForDuplicate } = rehashAgainstFreshState(incomingRecords, existingPhotos);
    const committedCount = countCommitted(existingPhotos);
    const { records: finalRecords, rejectedForCapacity } = partitionRecordsByCapacity(dedupedRecords, {
      committedCount,
      capacity: effectiveCapacity,
      unlimited,
    });

    const acceptedPaths = finalRecords.filter((r) => r.status === 'uploaded').map((r) => r.objectPath).filter(Boolean);
    const acceptedIds = finalRecords.filter((r) => r.status === 'uploaded').map((r) => r.id);
    const mergedPhotos = [...existingPhotos, ...finalRecords];
    const mergedPaths = [...(data.imagePaths || []), ...acceptedPaths];

    tx.set(ref, {
      ...data,
      photos: mergedPhotos,
      imagePaths: mergedPaths,
      imageCount: mergedPaths.length,
      updatedAt: nowIso(),
      // Bounded ledger -- see reports.js's call site for why this map isn't
      // allowed to grow forever (each request's own file batch is small; a
      // pathological client hammering unique attemptIds is already rate
      // limited by aiLimiter on this route).
      photoUploadAttempts: attemptId ? { ...attempts, [attemptId]: { fingerprint: requestFingerprint, photoIds: acceptedIds, createdAt: nowIso() } } : attempts,
    });

    return { replayed: false, records: finalRecords, rejectedForCapacity, rejectedForDuplicate };
  });
};

module.exports = {
  CAPACITY_ERROR_MESSAGE,
  computeBatchFingerprint,
  partitionRecordsByCapacity,
  rehashAgainstFreshState,
  countCommitted,
  appendReportPhotosAtomic,
};
