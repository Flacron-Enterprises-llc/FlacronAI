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
  });
};

module.exports = { appendStagedPhoto };
