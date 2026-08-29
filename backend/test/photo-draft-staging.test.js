const test = require('node:test');
const assert = require('node:assert/strict');
const { appendStagedPhoto, STAGE_TRANSACTION_MAX_ATTEMPTS, claimDraftPhotos } = require('../utils/photoDraftStaging');

// Regression test for a real data-loss bug: POST /api/reports/photos/stage
// used to do a plain (non-transactional) read-append-write on the
// reportDrafts/{draftId} doc. A multi-file wizard selection fires one stage
// request per file near-simultaneously, so two concurrent requests could
// both read the same "before" photos array and the second write would
// silently overwrite -- not merge with -- the first's photo. This is fixed
// by wrapping the append in a Firestore transaction (appendStagedPhoto),
// which retries its whole callback whenever the read snapshot goes stale
// before commit -- exactly what real Firestore's runTransaction does.
//
// FakeFirestore below simulates that same optimistic-concurrency contract
// (version-stamped docs, a transaction re-runs its callback if the doc it
// read was written by someone else before it committed). `tx.get` blocks on
// a shared debounce barrier -- NOT an independent per-call timer -- so every
// `tx.get` requested within the same synchronous burst (exactly what
// `Promise.all([...].map(appendStagedPhoto))` produces) resolves together,
// all reading the SAME pre-commit snapshot before any of them writes. That
// is the actual worst case a multi-file wizard upload hits in production.
// (Verified while writing this test: an independent per-call `setTimeout`
// never actually overlapped, because Node drains all microtasks after each
// timer callback before the next one fires -- each transaction would run to
// completion before the next one's timer even fired, so it "passed" even
// against the old buggy non-transactional code. The shared barrier below
// reliably forces genuine overlapping reads instead.)
class FakeFirestore {
  constructor() {
    this.store = new Map(); // path -> { version, data }
    this._pendingGets = [];
    this._barrier = null;
  }
  _armBarrier() {
    clearTimeout(this._barrier);
    this._barrier = setTimeout(() => {
      const batch = this._pendingGets;
      this._pendingGets = [];
      batch.forEach((resolve) => resolve());
    }, 5);
  }
  collection(name) {
    return { doc: (id) => ({ __path: `${name}/${id}` }) };
  }
  async runTransaction(fn, options = {}) {
    // Real @google-cloud/firestore defaults an untuned transaction to 5
    // attempts. This used to be hardcoded to a lenient 50 here, which masked
    // the actual production bug: appendStagedPhoto never passed maxAttempts,
    // so it ran at the real default of 5 -- nowhere near enough headroom for
    // a 7+-file wizard selection staging with zero client-side concurrency
    // cap, which is exactly what caused "1 uploaded / 6 failed" in
    // production. Honoring the option here lets tests actually reproduce and
    // guard against that gap instead of hiding it.
    const maxAttempts = options.maxAttempts ?? 50;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const readVersions = new Map();
      const pendingWrites = [];
      const tx = {
        get: async (ref) => {
          await new Promise((resolve) => {
            this._pendingGets.push(resolve);
            this._armBarrier();
          });
          const entry = this.store.get(ref.__path);
          readVersions.set(ref.__path, entry ? entry.version : 0);
          return { exists: !!entry, data: () => (entry ? entry.data : undefined) };
        },
        set: (ref, data) => {
          pendingWrites.push({ path: ref.__path, data });
        },
      };
      const result = await fn(tx);
      const stale = [...readVersions.entries()].some(([path, v]) => {
        const current = this.store.get(path);
        return (current ? current.version : 0) !== v;
      });
      if (stale) continue; // real Firestore: silently retries the whole callback
      for (const w of pendingWrites) {
        const prev = this.store.get(w.path);
        this.store.set(w.path, { version: prev ? prev.version + 1 : 1, data: w.data });
      }
      return result;
    }
    throw new Error('transaction retry limit exceeded');
  }
}

const makeRecord = (id) => ({ id, status: 'uploaded', fileName: `${id}.jpg` });

test('appendStagedPhoto: N concurrent stage requests for the same draft all persist, none silently dropped', async () => {
  const db = new FakeFirestore();
  const N = 8;
  const records = Array.from({ length: N }, (_, i) => makeRecord(`p${i}`));

  await Promise.all(
    records.map((record) =>
      appendStagedPhoto(db, { draftId: 'draft1', uid: 'u1', record, maxPhotos: 100 })
    )
  );

  const stored = db.store.get('reportDrafts/draft1').data.photos;
  assert.equal(stored.length, N, 'every concurrently-staged photo must be persisted, none dropped');
  const ids = stored.map((p) => p.id).sort();
  assert.deepEqual(ids, records.map((r) => r.id).sort(), 'every unique photo stored exactly once');
  assert.equal(new Set(ids).size, N, 'no duplicate records');
});

test('appendStagedPhoto: uploadedCount-equivalent (photos.length) reflects the accurate total after concurrent appends, not a stale count', async () => {
  const db = new FakeFirestore();
  const N = 5;
  const records = Array.from({ length: N }, (_, i) => makeRecord(`x${i}`));

  await Promise.all(
    records.map((record) => appendStagedPhoto(db, { draftId: 'draft2', uid: 'u1', record, maxPhotos: 100 }))
  );

  assert.equal(db.store.get('reportDrafts/draft2').data.photos.length, N);
});

test('appendStagedPhoto: enforces maxPhotos even under concurrent contention -- no overshoot, no gaps', async () => {
  const db = new FakeFirestore();
  const CAP = 3;
  const records = Array.from({ length: 6 }, (_, i) => makeRecord(`c${i}`));

  const settled = await Promise.allSettled(
    records.map((record) => appendStagedPhoto(db, { draftId: 'draft3', uid: 'u1', record, maxPhotos: CAP }))
  );

  const fulfilled = settled.filter((s) => s.status === 'fulfilled');
  const rejected = settled.filter((s) => s.status === 'rejected');
  assert.equal(fulfilled.length, CAP, 'exactly maxPhotos requests succeed');
  assert.equal(rejected.length, records.length - CAP);
  for (const r of rejected) assert.equal(r.reason.code, 'MAX_PHOTOS');

  const stored = db.store.get('reportDrafts/draft3').data.photos;
  assert.equal(stored.length, CAP, 'the stored array never exceeds maxPhotos, even racing');
  assert.equal(new Set(stored.map((p) => p.id)).size, CAP, 'no duplicates among the ones that made it in');
});

test('production bug repro: at the real Firestore default of 5 transaction attempts, a 7-file wizard selection with no client-side upload concurrency cap loses requests to retry-budget exhaustion', async () => {
  const db = new FakeFirestore();
  const N = 7;
  const records = Array.from({ length: N }, (_, i) => makeRecord(`bug${i}`));

  const settled = await Promise.allSettled(
    records.map((record) =>
      db.runTransaction(
        async (tx) => {
          const ref = db.collection('reportDrafts').doc('bugDraft');
          const fresh = await tx.get(ref);
          const photos = fresh.exists ? fresh.data().photos || [] : [];
          const next = [...photos, record];
          tx.set(ref, { userId: 'u1', photos: next });
          return next;
        },
        { maxAttempts: 5 } // the real Admin SDK's untuned default
      )
    )
  );

  const fulfilled = settled.filter((s) => s.status === 'fulfilled').length;
  const rejected = settled.filter((s) => s.status === 'rejected').length;
  // This is the actual live symptom this fix responds to: with fully
  // simultaneous, uncapped requests fighting over one draft doc, only a
  // small minority survive a 5-attempt budget -- the rest surface to the
  // user as "upload failed" even though nothing was corrupted, just retried
  // out of budget. Asserting `rejected > 0` (not an exact count, which would
  // make this test flaky against scheduling-order nondeterminism) pins down
  // that the bug is real at the real-world default, not merely theoretical.
  assert.ok(fulfilled >= 1, 'at least one request always wins the very first round');
  assert.ok(rejected > 0, 'uncapped concurrency at the real 5-attempt default drops requests');
});

test('fix verification: STAGE_TRANSACTION_MAX_ATTEMPTS combined with the client-side upload concurrency cap (3 at a time) reliably lands all photos, even for a 20-photo selection', async () => {
  const db = new FakeFirestore();
  const TOTAL = 20;
  const CLIENT_CONCURRENCY_CAP = 3; // mirrors frontend/src/utils/uploadQueue.js
  const records = Array.from({ length: TOTAL }, (_, i) => makeRecord(`fix${i}`));

  // Simulate the frontend's bounded queue: never more than
  // CLIENT_CONCURRENCY_CAP requests in flight at once, same as
  // selectPhotosToUpload enforces in the browser.
  let cursor = 0;
  const results = [];
  const worker = async () => {
    while (cursor < records.length) {
      const record = records[cursor++];
      results.push(
        await appendStagedPhoto(db, { draftId: 'fixDraft', uid: 'u1', record, maxPhotos: 100 })
      );
    }
  };
  await Promise.all(Array.from({ length: CLIENT_CONCURRENCY_CAP }, worker));

  const stored = db.store.get('reportDrafts/fixDraft').data.photos;
  assert.equal(stored.length, TOTAL, 'every photo in a 20-photo selection is retained exactly once');
  assert.equal(new Set(stored.map((p) => p.id)).size, TOTAL, 'no duplicates');
  assert.equal(STAGE_TRANSACTION_MAX_ATTEMPTS, 15, 'guards the tuned constant against an accidental future regression');
});

test('appendStagedPhoto: sequential appends to different drafts never interfere with each other', async () => {
  const db = new FakeFirestore();
  await appendStagedPhoto(db, { draftId: 'a', uid: 'u1', record: makeRecord('a1'), maxPhotos: 100 });
  await appendStagedPhoto(db, { draftId: 'b', uid: 'u1', record: makeRecord('b1'), maxPhotos: 100 });
  await appendStagedPhoto(db, { draftId: 'a', uid: 'u1', record: makeRecord('a2'), maxPhotos: 100 });

  assert.deepEqual(
    db.store.get('reportDrafts/a').data.photos.map((p) => p.id),
    ['a1', 'a2']
  );
  assert.deepEqual(
    db.store.get('reportDrafts/b').data.photos.map((p) => p.id),
    ['b1']
  );
});

// ── claimDraftPhotos (idempotency fix for duplicate POST /generate calls) ──
//
// Production incident: POST /generate used to `get()` a staged draft's
// photos then fire-and-forget `delete()` it -- not atomic. A page refresh
// mid-request (the draftId survives in the browser's localStorage) followed
// by clicking "Generate" again, or two tabs submitting the same wizard
// session, could both `get()` the same still-undeleted draft and each build
// its own report from the SAME photos. claimDraftPhotos closes that race by
// making "who gets the photos" a single atomic transaction.

test('claimDraftPhotos: a fresh, never-claimed draft returns its photos and is marked claimed', async () => {
  const db = new FakeFirestore();
  await appendStagedPhoto(db, { draftId: 'd1', uid: 'u1', record: makeRecord('p0'), maxPhotos: 100 });
  await appendStagedPhoto(db, { draftId: 'd1', uid: 'u1', record: makeRecord('p1'), maxPhotos: 100 });

  const result = await claimDraftPhotos(db, { draftId: 'd1', uid: 'u1' });
  assert.equal(result.found, true);
  assert.equal(result.alreadyClaimed, false);
  assert.deepEqual(result.photos.map((p) => p.id), ['p0', 'p1']);
  assert.equal(db.store.get('reportDrafts/d1').data.claimed, true, 'the draft doc itself is flipped to claimed');
});

test('claimDraftPhotos: a second claim of the same draft gets no photos back, not a re-download of the same set', async () => {
  const db = new FakeFirestore();
  await appendStagedPhoto(db, { draftId: 'd2', uid: 'u1', record: makeRecord('p0'), maxPhotos: 100 });

  const first = await claimDraftPhotos(db, { draftId: 'd2', uid: 'u1' });
  const second = await claimDraftPhotos(db, { draftId: 'd2', uid: 'u1' });

  assert.equal(first.alreadyClaimed, false);
  assert.equal(first.photos.length, 1);
  assert.equal(second.alreadyClaimed, true, 'the second call must see the draft as already consumed');
  assert.deepEqual(second.photos, [], 'no photos are handed out twice');
});

test('claimDraftPhotos: two concurrent claims for the same draftId -- exactly one wins the photos', async () => {
  const db = new FakeFirestore();
  await appendStagedPhoto(db, { draftId: 'd3', uid: 'u1', record: makeRecord('p0'), maxPhotos: 100 });
  await appendStagedPhoto(db, { draftId: 'd3', uid: 'u1', record: makeRecord('p1'), maxPhotos: 100 });

  // Both calls issue their transaction's `tx.get` inside the same synchronous
  // burst, so FakeFirestore's shared barrier forces them to race exactly like
  // two near-simultaneous POST /generate requests would against real
  // Firestore (see the class comment above for why this matters).
  const [a, b] = await Promise.all([
    claimDraftPhotos(db, { draftId: 'd3', uid: 'u1' }),
    claimDraftPhotos(db, { draftId: 'd3', uid: 'u1' }),
  ]);

  const winners = [a, b].filter((r) => !r.alreadyClaimed);
  const losers = [a, b].filter((r) => r.alreadyClaimed);
  assert.equal(winners.length, 1, 'exactly one of the two concurrent requests gets the photos');
  assert.equal(losers.length, 1, 'the other must be told the draft was already claimed');
  assert.equal(winners[0].photos.length, 2, 'the winner gets the full, uncorrupted photo set');
  assert.deepEqual(losers[0].photos, []);
});

test('claimDraftPhotos: an unknown draftId (never staged, or already deleted) is reported as not found, not an error', async () => {
  const db = new FakeFirestore();
  const result = await claimDraftPhotos(db, { draftId: 'nope', uid: 'u1' });
  assert.equal(result.found, false);
  assert.equal(result.alreadyClaimed, false);
  assert.deepEqual(result.photos, []);
});

test('claimDraftPhotos: a draft owned by a different user is never handed out (cross-account access denied)', async () => {
  const db = new FakeFirestore();
  await appendStagedPhoto(db, { draftId: 'd4', uid: 'owner', record: makeRecord('p0'), maxPhotos: 100 });

  const result = await claimDraftPhotos(db, { draftId: 'd4', uid: 'attacker' });
  assert.equal(result.found, false);
  assert.deepEqual(result.photos, []);
  assert.equal(db.store.get('reportDrafts/d4').data.claimed, undefined, "the real owner's draft is untouched");
});
