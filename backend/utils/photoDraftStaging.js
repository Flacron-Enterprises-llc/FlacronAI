// Extracted from POST /api/reports/photos/stage (backend/routes/reports.js) so
// the transactional append can be unit-tested against a fake Firestore that
// simulates real optimistic-concurrency retry behavior, without spinning up
// Express/auth/Storage. Fixes a data-loss bug: two near-simultaneous stage
// requests for the same draftId (a multi-file wizard selection fires one
// request per file) used to both read the same "before" photos array and the
// second plain `ref.set()` would silently overwrite -- not merge with -- the
// first's photo. Wrapping the read-append-write in a Firestore transaction
// (which retries its callback whenever the read snapshot goes stale before
// commit) makes every concurrent append serialize correctly instead.
//
// The Storage upload itself (processPhotoBatch) must stay OUTSIDE this
// transaction -- a transaction can retry its callback on contention, and
// re-running a Storage upload on every retry would be wasteful and could
// produce duplicate objects. Only the cheap, idempotent Firestore
// read/append/write belongs inside.
//
// The Admin SDK defaults an untuned transaction to 5 attempts before giving
// up and rejecting the whole request. A multi-file wizard selection can
// still put several stage requests in real contention over the same draft
// doc even with the client-side upload concurrency cap (uploadQueue.js), so
// this is raised well above that default -- each retry only costs one more
// cheap read/write of a tiny doc, not a re-upload.
const STAGE_TRANSACTION_MAX_ATTEMPTS = 15;

const appendStagedPhoto = async (db, { draftId, uid, record, maxPhotos, nowIso = () => new Date().toISOString() }) => {
  const ref = db.collection('reportDrafts').doc(draftId);
  return db.runTransaction(async (tx) => {
    const freshDoc = await tx.get(ref);
    const freshPhotos = freshDoc.exists ? freshDoc.data().photos || [] : [];
    if (freshPhotos.length >= maxPhotos) {
      const err = new Error(`Maximum of ${maxPhotos} photos reached. Remove a photo to upload another.`);
      err.code = 'MAX_PHOTOS';
      throw err;
    }
    const nextPhotos = [...freshPhotos, record];
    tx.set(ref, {
      userId: uid,
      photos: nextPhotos,
      createdAt: freshDoc.exists ? freshDoc.data().createdAt : nowIso(),
      updatedAt: nowIso(),
    });
    return nextPhotos;
  }, { maxAttempts: STAGE_TRANSACTION_MAX_ATTEMPTS });
};

// Idempotency fix (production incident: report generation "takes excessively
// long", partly caused by duplicate generation jobs). POST /generate used to
// fold in a draft's staged photos with a plain `ref.get()` followed by a
// fire-and-forget `ref.delete()` -- two unrelated operations, not atomic. A
// page refresh mid-request (the draftId survives in localStorage, see
// Dashboard.jsx's PHOTO_DRAFT_LS_KEY) followed by clicking "Generate" again,
// or two browser tabs submitting the same wizard session, could both `get()`
// the same still-undeleted draft before either `delete()` landed -- each
// building its OWN report from the SAME staged photos: double the Storage
// downloads, double the Claude vision batches, double the report-generation
// calls, and a duplicate report the user never asked for.
//
// This makes "who gets the photos" atomic: the transaction reads the draft
// and, if it hasn't already been claimed, marks it `claimed: true` in the
// same commit before returning its photos. A second call for the same
// draftId (concurrent or a later resubmit before the draft doc's own
// eventual delete) sees `alreadyClaimed: true` and gets an EMPTY photos
// list back -- the caller (POST /generate) treats that as a full duplicate
// submission and rejects it outright (409 DUPLICATE_GENERATE_REQUEST)
// instead of silently creating a second, photo-less-or-duplicated report.
// The draft doc is left in place (not deleted here) so this stays safely
// idempotent no matter how many times it's called after the first -- the
// caller still does its own best-effort `delete()` afterward for cleanup.
const claimDraftPhotos = async (db, { draftId, uid }) => {
  const ref = db.collection('reportDrafts').doc(draftId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists || doc.data().userId !== uid) {
      return { photos: [], alreadyClaimed: false, found: false };
    }
    const data = doc.data();
    if (data.claimed) {
      return { photos: [], alreadyClaimed: true, found: true };
    }
    // A full-document `set` (not `update`) here, matching appendStagedPhoto
    // above -- preserves every existing field while flipping `claimed`.
    tx.set(ref, { ...data, claimed: true, claimedAt: new Date().toISOString() });
    return { photos: data.photos || [], alreadyClaimed: false, found: true };
  });
};

module.exports = { appendStagedPhoto, STAGE_TRANSACTION_MAX_ATTEMPTS, claimDraftPhotos };
