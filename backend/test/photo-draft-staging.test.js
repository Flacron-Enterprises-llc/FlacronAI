const test = require('node:test');
const assert = require('node:assert/strict');
const { appendStagedPhoto } = require('../utils/photoDraftStaging');

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
  async runTransaction(fn) {
    for (let attempt = 0; attempt < 50; attempt++) {
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
