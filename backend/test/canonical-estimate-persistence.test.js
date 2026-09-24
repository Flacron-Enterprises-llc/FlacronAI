const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeFirestore } = require('./helpers/fakeFirestore');
const {
  getCanonicalEstimate,
  upsertCanonicalEstimate,
} = require('../utils/canonicalEstimateStore');

// Phase 41. Transaction-level persistence tests -- no HTTP harness, matching
// this codebase's existing convention (report-immutability.test.js,
// photo-draft-staging.test.js): the store's exported functions are the
// testable unit, called directly against a FakeFirestore.

const seedReport = async (db, id, overrides = {}) => {
  await db.collection('reports').doc(id).set({
    userId: 'owner-uid',
    status: 'draft',
    photos: [],
    ...overrides,
  });
};

const li = (overrides = {}) => ({
  category: 'Drywall',
  room: 'Living Room',
  description: 'Replace drywall',
  quantity: 1,
  unit: 'SF',
  materialUnitCost: 10,
  laborUnitCost: 5,
  ...overrides,
});

test('upsert creates a new canonical estimate at revision 1 with correct totals', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r1');

  const estimate = await upsertCanonicalEstimate(db, {
    reportId: 'r1',
    body: { lineItems: [li({ id: 'li-1', quantity: 2, materialUnitCost: 10, laborUnitCost: 0 })], changeSummary: 'Initial estimate' },
    actor: { uid: 'owner-uid', email: 'owner@example.com' },
  });

  assert.equal(estimate.revision, 1);
  assert.equal(estimate.totals.grandTotalCents, 2000);
  assert.equal(estimate.status, 'draft');
  assert.equal(estimate.reportId, 'r1');

  const fetched = await getCanonicalEstimate(db, 'r1');
  assert.deepEqual(fetched, estimate);
});

test('a second upsert increments revision, preserves createdAt for an unchanged line item, and records both audit entries', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r2');

  const first = await upsertCanonicalEstimate(db, {
    reportId: 'r2',
    body: { lineItems: [li({ id: 'li-1' })], changeSummary: 'Initial' },
    actor: { uid: 'owner-uid' },
  });

  await new Promise((r) => setTimeout(r, 5)); // ensure the ISO updatedAt timestamp actually advances
  const second = await upsertCanonicalEstimate(db, {
    reportId: 'r2',
    body: { lineItems: [li({ id: 'li-1', quantity: 3 })], changeSummary: 'Revised quantity' },
    actor: { uid: 'owner-uid' },
  });

  assert.equal(second.revision, 2);
  assert.equal(second.createdAt, first.createdAt, 'estimate-level createdAt survives an update');
  assert.equal(second.lineItems[0].createdAt, first.lineItems[0].createdAt, 'line-item createdAt survives an update');
  assert.notEqual(second.updatedAt, first.updatedAt);

  const auditSnap = await db.collection('reports').doc('r2').collection('canonicalEstimateAudit').get();
  assert.equal(auditSnap.docs.length, 2, 'both revisions are recorded in the bounded audit subcollection, not overwritten');
  const summaries = auditSnap.docs.map((d) => d.data().changeSummary).sort();
  assert.deepEqual(summaries, ['Initial', 'Revised quantity']);
});

test('bidirectional evidence contract persists correctly: photo -> relatedLineItemIds is derived fresh on every write', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r3', { photos: [{ id: 'p1' }, { id: 'p2' }] });

  await upsertCanonicalEstimate(db, {
    reportId: 'r3',
    body: { lineItems: [li({ id: 'li-1', evidencePhotoIds: ['p1'] })] },
    actor: { uid: 'owner-uid' },
  });

  let reportDoc = await db.collection('reports').doc('r3').get();
  assert.deepEqual(reportDoc.data().photos.find((p) => p.id === 'p1').relatedLineItemIds, ['li-1']);
  assert.deepEqual(reportDoc.data().photos.find((p) => p.id === 'p2').relatedLineItemIds, []);

  // Removing the evidence reference on a later write must clear the reverse
  // index too -- it is derived fresh, never a separately maintained copy.
  await upsertCanonicalEstimate(db, {
    reportId: 'r3',
    body: { lineItems: [li({ id: 'li-1', evidencePhotoIds: [] })] },
    actor: { uid: 'owner-uid' },
  });
  reportDoc = await db.collection('reports').doc('r3').get();
  assert.deepEqual(reportDoc.data().photos.find((p) => p.id === 'p1').relatedLineItemIds, []);
});

test('a photo ID not belonging to this report is rejected, and neither the report nor the estimate doc is mutated (no partial write)', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r4', { photos: [{ id: 'own-photo' }] });

  await assert.rejects(
    () =>
      upsertCanonicalEstimate(db, {
        reportId: 'r4',
        body: { lineItems: [li({ id: 'li-1', evidencePhotoIds: ['photo-from-another-report'] })] },
        actor: { uid: 'owner-uid' },
      }),
    (err) => err.code === 'VALIDATION_ERROR'
  );

  const estimate = await getCanonicalEstimate(db, 'r4');
  assert.equal(estimate, null, 'no canonical estimate was created on a rejected write');
  const reportDoc = await db.collection('reports').doc('r4').get();
  assert.deepEqual(reportDoc.data().photos, [{ id: 'own-photo' }], 'report doc untouched');
});

test('a finalized report cannot have its canonical estimate written (Golden Rule #3 immutability)', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r5', { status: 'finalized' });

  await assert.rejects(
    () =>
      upsertCanonicalEstimate(db, {
        reportId: 'r5',
        body: { lineItems: [li({ id: 'li-1' })] },
        actor: { uid: 'owner-uid' },
      }),
    (err) => err.code === 'REPORT_FINALIZED'
  );

  assert.equal(await getCanonicalEstimate(db, 'r5'), null);
});

test('a validation failure leaves the previously-persisted estimate and report completely unchanged', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r6');
  const first = await upsertCanonicalEstimate(db, {
    reportId: 'r6',
    body: { lineItems: [li({ id: 'li-1' })] },
    actor: { uid: 'owner-uid' },
  });

  await assert.rejects(
    () =>
      upsertCanonicalEstimate(db, {
        reportId: 'r6',
        body: { lineItems: [li({ id: 'li-1', quantity: -1 })] },
        actor: { uid: 'owner-uid' },
      }),
    (err) => err.code === 'VALIDATION_ERROR'
  );

  const stillFirst = await getCanonicalEstimate(db, 'r6');
  assert.deepEqual(stillFirst, first, 'the failed write must not have partially applied');
});

test('writing to a nonexistent report is rejected as NOT_FOUND', async () => {
  const db = new FakeFirestore();
  await assert.rejects(
    () =>
      upsertCanonicalEstimate(db, {
        reportId: 'ghost',
        body: { lineItems: [li({ id: 'li-1' })] },
        actor: { uid: 'owner-uid' },
      }),
    (err) => err.code === 'NOT_FOUND'
  );
});

test('legacy report fallback: a report that never had a canonical estimate returns null, not an error', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'legacy-report');
  assert.equal(await getCanonicalEstimate(db, 'legacy-report'), null);
});

test('a client-supplied totals payload is never persisted -- the stored estimate always reflects the server-side recomputation', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r7');
  const estimate = await upsertCanonicalEstimate(db, {
    reportId: 'r7',
    body: {
      lineItems: [li({ id: 'li-1', quantity: 1, materialUnitCost: 10, laborUnitCost: 0 })],
      totals: { grandTotalCents: 999999999 },
    },
    actor: { uid: 'owner-uid' },
  });
  assert.equal(estimate.totals.grandTotalCents, 1000);
});

// Concurrency-safety note: upsertCanonicalEstimate reuses the identical
// db.runTransaction(..., { maxAttempts }) contract that
// photoDraftStaging.appendStagedPhoto already has a dedicated
// barrier-forced interleaving repro for (photo-draft-staging.test.js). This
// test only re-confirms the read-before-write sequencing this store relies
// on -- two back-to-back writes correctly build on each other's committed
// state rather than clobbering it.
test('sequential writes to the same report correctly build on the previously committed revision (no lost update)', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r8');
  const a = await upsertCanonicalEstimate(db, {
    reportId: 'r8',
    body: { lineItems: [li({ id: 'li-1' })] },
    actor: { uid: 'owner-uid' },
  });
  const b = await upsertCanonicalEstimate(db, {
    reportId: 'r8',
    body: { lineItems: [li({ id: 'li-1' }), li({ id: 'li-2' })] },
    actor: { uid: 'owner-uid' },
  });
  assert.equal(a.revision, 1);
  assert.equal(b.revision, 2);
  assert.equal(b.lineItems.length, 2);
});

// Phase 42 editor requirement: "handle revision conflicts without
// overwriting newer data" -- the editor sends the revision it loaded
// (`baseRevision`); a write built on a stale revision must be rejected, not
// silently applied on top of someone else's newer change.
test('a write with a stale baseRevision is rejected as REVISION_CONFLICT and never applied', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r9');
  const first = await upsertCanonicalEstimate(db, {
    reportId: 'r9',
    body: { lineItems: [li({ id: 'li-1' })], baseRevision: 0 },
    actor: { uid: 'owner-uid' },
  });
  assert.equal(first.revision, 1);

  // Someone else already saved to revision 1; this caller still thinks it's
  // editing revision 0 (stale).
  await assert.rejects(
    () =>
      upsertCanonicalEstimate(db, {
        reportId: 'r9',
        body: { lineItems: [li({ id: 'li-1', quantity: 99 })], baseRevision: 0 },
        actor: { uid: 'other-uid' },
      }),
    (err) => {
      assert.equal(err.code, 'REVISION_CONFLICT');
      assert.equal(err.currentRevision, 1);
      return true;
    }
  );

  const stillFirst = await getCanonicalEstimate(db, 'r9');
  assert.deepEqual(stillFirst, first, 'the stale write must not have applied');
});

test('a write with a matching baseRevision succeeds and advances the revision', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r10');
  const first = await upsertCanonicalEstimate(db, {
    reportId: 'r10',
    body: { lineItems: [li({ id: 'li-1' })], baseRevision: 0 },
    actor: { uid: 'owner-uid' },
  });
  const second = await upsertCanonicalEstimate(db, {
    reportId: 'r10',
    body: { lineItems: [li({ id: 'li-1', quantity: 5 })], baseRevision: first.revision },
    actor: { uid: 'owner-uid' },
  });
  assert.equal(second.revision, 2);
  assert.equal(second.lineItems[0].quantity, 5);
});

test('omitting baseRevision entirely preserves today\'s last-write-wins behavior (no conflict check)', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r11');
  await upsertCanonicalEstimate(db, { reportId: 'r11', body: { lineItems: [li({ id: 'li-1' })] }, actor: { uid: 'owner-uid' } });
  const second = await upsertCanonicalEstimate(db, {
    reportId: 'r11',
    body: { lineItems: [li({ id: 'li-1', quantity: 2 })] },
    actor: { uid: 'owner-uid' },
  });
  assert.equal(second.revision, 2);
});
