const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeFirestore } = require('./helpers/fakeFirestore');
const {
  createCheckoutIntent,
  markSessionCreated,
  markSessionFailed,
  fulfillCheckoutIntent,
  markExpired,
  applyRefund,
  applyDisputeCreated,
  applyDisputeClosed,
  listSanitizedPurchasesForReport,
} = require('../utils/photoAddOnPurchases');

// Phase 45 (Stripe Report-Specific Photo Add-Ons). Direct transactional tests
// against the same FakeFirestore double the rest of this repo's Phase 41/42/
// 44 store tests trust (photo-draft-staging.test.js, canonical-estimate-
// persistence.test.js, photo-capacity.test.js).

const PACK_25 = { id: 'photos_25', capacity: 25, amountCents: 499, currency: 'usd' };

const seedReport = (db, id, overrides = {}) => {
  db.store.set(`reports/${id}`, { version: 1, data: { id, userId: 'uid-1', status: 'draft', photos: [], ...overrides } });
};

const fakeSession = (overrides = {}) => ({
  id: 'cs_test_123',
  mode: 'payment',
  livemode: false,
  currency: 'usd',
  amount_total: 499,
  payment_status: 'paid',
  payment_intent: 'pi_123',
  metadata: {},
  ...overrides,
});

test('createCheckoutIntent: persists a trusted intent and records it on the report, rejecting a foreign report as NOT_FOUND', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intent = await createCheckoutIntent(db, { uid: 'uid-1', reportId: 'report-1', pack: PACK_25, mode: 'test' });
  assert.equal(intent.status, 'pending');
  assert.equal(intent.capacity, 25);
  assert.equal(intent.amountCents, 499);
  assert.equal(intent.stripeMode, 'test');

  const report = (await db.collection('reports').doc('report-1').get()).data();
  assert.deepEqual(report.photoAddOnPurchaseIds, [intent.id]);

  await assert.rejects(
    createCheckoutIntent(db, { uid: 'someone-else', reportId: 'report-1', pack: PACK_25, mode: 'test' }),
    (err) => err.code === 'NOT_FOUND'
  );
});

test('createCheckoutIntent: rejects a finalized report', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1', { status: 'finalized' });
  await assert.rejects(
    createCheckoutIntent(db, { uid: 'uid-1', reportId: 'report-1', pack: PACK_25, mode: 'test' }),
    (err) => err.code === 'REPORT_FINALIZED'
  );
});

test('createCheckoutIntent: rejects an archived report as NOT_FOUND', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1', { status: 'archived' });
  await assert.rejects(
    createCheckoutIntent(db, { uid: 'uid-1', reportId: 'report-1', pack: PACK_25, mode: 'test' }),
    (err) => err.code === 'NOT_FOUND'
  );
});

test('markSessionFailed then a fresh createCheckoutIntent is a safe, idempotent-in-spirit retry path', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intent = await createCheckoutIntent(db, { uid: 'uid-1', reportId: 'report-1', pack: PACK_25, mode: 'test' });
  const failed = await markSessionFailed(db, intent.id, { reason: 'network error' });
  assert.equal(failed.status, 'failed');
  const retry = await createCheckoutIntent(db, { uid: 'uid-1', reportId: 'report-1', pack: PACK_25, mode: 'test' });
  assert.notEqual(retry.id, intent.id);
  assert.equal(retry.status, 'pending');
});

test('fulfillCheckoutIntent: happy path grants capacity exactly once and updates the report snapshot', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intent = await createCheckoutIntent(db, { uid: 'uid-1', reportId: 'report-1', pack: PACK_25, mode: 'test' });
  await markSessionCreated(db, intent.id, { stripeSessionId: 'cs_test_123' });

  const result = await fulfillCheckoutIntent(db, intent.id, { stripeSession: fakeSession(), eventId: 'evt_1' });
  assert.equal(result.fulfilled, true);
  assert.equal(result.intent.status, 'fulfilled');

  const report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 25);
  assert.deepEqual(report.photoAddOnCapacityGrantedFor, [intent.id]);
});

test('fulfillCheckoutIntent: duplicate webhook (same event redelivered) grants exactly once', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intent = await createCheckoutIntent(db, { uid: 'uid-1', reportId: 'report-1', pack: PACK_25, mode: 'test' });
  await markSessionCreated(db, intent.id, { stripeSessionId: 'cs_test_123' });

  await fulfillCheckoutIntent(db, intent.id, { stripeSession: fakeSession(), eventId: 'evt_1' });
  const second = await fulfillCheckoutIntent(db, intent.id, { stripeSession: fakeSession(), eventId: 'evt_1' });
  assert.equal(second.alreadyFulfilled, true);
  assert.equal(second.fulfilled, false);

  const report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 25, 'capacity was never granted twice');
});

test('fulfillCheckoutIntent: concurrent duplicate fulfillment attempts (racing webhook + sync) grant exactly once (barrier test)', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intent = await createCheckoutIntent(db, { uid: 'uid-1', reportId: 'report-1', pack: PACK_25, mode: 'test' });
  await markSessionCreated(db, intent.id, { stripeSessionId: 'cs_test_123' });

  const attempts = Array.from({ length: 6 }, () =>
    fulfillCheckoutIntent(db, intent.id, { stripeSession: fakeSession(), eventId: 'evt_race' })
  );
  const results = await Promise.all(attempts);
  const successes = results.filter((r) => r.fulfilled);
  assert.equal(successes.length, 1, 'exactly one of the 6 concurrent attempts actually grants capacity');

  const report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 25, 'capacity was granted exactly once despite 6 concurrent racing calls');
});

test('fulfillCheckoutIntent: amount mismatch is rejected, never fulfilled', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intent = await createCheckoutIntent(db, { uid: 'uid-1', reportId: 'report-1', pack: PACK_25, mode: 'test' });
  await markSessionCreated(db, intent.id, { stripeSessionId: 'cs_test_123' });

  const result = await fulfillCheckoutIntent(db, intent.id, { stripeSession: fakeSession({ amount_total: 999999 }), eventId: 'evt_1' });
  assert.equal(result.fulfilled, false);
  assert.match(result.reason, /MISMATCH:amount/);
  const report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity || 0, 0);
});

test('fulfillCheckoutIntent: currency mismatch is rejected', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intent = await createCheckoutIntent(db, { uid: 'uid-1', reportId: 'report-1', pack: PACK_25, mode: 'test' });
  await markSessionCreated(db, intent.id, { stripeSessionId: 'cs_test_123' });
  const result = await fulfillCheckoutIntent(db, intent.id, { stripeSession: fakeSession({ currency: 'eur' }), eventId: 'evt_1' });
  assert.equal(result.fulfilled, false);
  assert.match(result.reason, /MISMATCH:currency/);
});

test('fulfillCheckoutIntent: environment (test/live) mismatch is rejected', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intent = await createCheckoutIntent(db, { uid: 'uid-1', reportId: 'report-1', pack: PACK_25, mode: 'test' });
  await markSessionCreated(db, intent.id, { stripeSessionId: 'cs_test_123' });
  const result = await fulfillCheckoutIntent(db, intent.id, { stripeSession: fakeSession({ livemode: true }), eventId: 'evt_1' });
  assert.equal(result.fulfilled, false);
  assert.match(result.reason, /MISMATCH:environment/);
});

test('fulfillCheckoutIntent: session/intent id mismatch is rejected', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intent = await createCheckoutIntent(db, { uid: 'uid-1', reportId: 'report-1', pack: PACK_25, mode: 'test' });
  await markSessionCreated(db, intent.id, { stripeSessionId: 'cs_test_ORIGINAL' });
  const result = await fulfillCheckoutIntent(db, intent.id, { stripeSession: fakeSession({ id: 'cs_test_DIFFERENT' }), eventId: 'evt_1' });
  assert.equal(result.fulfilled, false);
  assert.match(result.reason, /MISMATCH:session_id/);
});

test('fulfillCheckoutIntent: tampered metadata checkoutIntentId cannot redirect capacity to a different intent', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intent = await createCheckoutIntent(db, { uid: 'uid-1', reportId: 'report-1', pack: PACK_25, mode: 'test' });
  await markSessionCreated(db, intent.id, { stripeSessionId: 'cs_test_123' });
  const result = await fulfillCheckoutIntent(db, intent.id, {
    stripeSession: fakeSession({ metadata: { checkoutIntentId: 'some-other-intent' } }),
    eventId: 'evt_1',
  });
  assert.equal(result.fulfilled, false);
  assert.match(result.reason, /MISMATCH:checkoutIntentId/);
});

test('fulfillCheckoutIntent: an unpaid session never fulfills', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intent = await createCheckoutIntent(db, { uid: 'uid-1', reportId: 'report-1', pack: PACK_25, mode: 'test' });
  await markSessionCreated(db, intent.id, { stripeSessionId: 'cs_test_123' });
  const result = await fulfillCheckoutIntent(db, intent.id, { stripeSession: fakeSession({ payment_status: 'unpaid' }), eventId: 'evt_1' });
  assert.equal(result.fulfilled, false);
});

test('markExpired: an expired checkout grants nothing and never downgrades an already-fulfilled purchase', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intent = await createCheckoutIntent(db, { uid: 'uid-1', reportId: 'report-1', pack: PACK_25, mode: 'test' });
  await markSessionCreated(db, intent.id, { stripeSessionId: 'cs_test_123' });

  const expired = await markExpired(db, intent.id, { eventId: 'evt_exp' });
  assert.equal(expired.intent.status, 'expired');
  const fulfillAfterExpiry = await fulfillCheckoutIntent(db, intent.id, { stripeSession: fakeSession(), eventId: 'evt_1' });
  assert.equal(fulfillAfterExpiry.fulfilled, false);

  // Never downgrade a genuinely fulfilled purchase.
  const intent2 = await createCheckoutIntent(db, { uid: 'uid-1', reportId: 'report-1', pack: PACK_25, mode: 'test' });
  await markSessionCreated(db, intent2.id, { stripeSessionId: 'cs_test_456' });
  await fulfillCheckoutIntent(db, intent2.id, { stripeSession: fakeSession({ id: 'cs_test_456' }), eventId: 'evt_2' });
  const noop = await markExpired(db, intent2.id, { eventId: 'evt_late_expiry' });
  assert.equal(noop.changed, false);
  const report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 25, 'the fulfilled purchase capacity is untouched');
});

async function fulfillHelper(db, reportId, uid = 'uid-1') {
  const intent = await createCheckoutIntent(db, { uid, reportId, pack: PACK_25, mode: 'test' });
  await markSessionCreated(db, intent.id, { stripeSessionId: `cs_${intent.id}` });
  await fulfillCheckoutIntent(db, intent.id, { stripeSession: fakeSession({ id: `cs_${intent.id}` }), eventId: `evt_${intent.id}` });
  return intent.id;
}

test('applyRefund: full refund revokes capacity, is idempotent, and never deletes photos (no photo field touched)', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1', { photos: [{ id: 'p1', status: 'uploaded' }] });
  const intentId = await fulfillHelper(db, 'report-1');

  const refund = await applyRefund(db, intentId, { eventId: 'evt_r1', amountRefundedCents: 499, fullyRefunded: true });
  assert.equal(refund.revoked, true);
  let report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 0);
  assert.equal(report.photos.length, 1, 'existing photos are never deleted by a refund');

  // Idempotent replay.
  const again = await applyRefund(db, intentId, { eventId: 'evt_r1', amountRefundedCents: 499, fullyRefunded: true });
  assert.equal(again.revoked, false);
  report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 0, 'capacity is never double-decremented');
});

test('applyRefund: partial refund is flagged for manual review, capacity is unchanged', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intentId = await fulfillHelper(db, 'report-1');

  const result = await applyRefund(db, intentId, { eventId: 'evt_p1', amountRefundedCents: 200, fullyRefunded: false });
  assert.equal(result.flagged, true);
  assert.equal(result.revoked, false);
  const report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 25, 'a partial refund never silently changes capacity');
  const purchases = await listSanitizedPurchasesForReport(db, report);
  assert.equal(purchases[0].needsManualReview, true);
});

test('applyDisputeCreated then applyDisputeClosed(won): suspends then restores exactly once', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intentId = await fulfillHelper(db, 'report-1');

  await applyDisputeCreated(db, intentId, { eventId: 'evt_d1', disputeId: 'dp_1' });
  let report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 0, 'a created dispute suspends the entitlement');

  await applyDisputeClosed(db, intentId, { eventId: 'evt_d2', disputeId: 'dp_1', outcome: 'won' });
  report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 25, 'a won dispute restores the entitlement');

  // Restoring exactly once -- a duplicate "won" event is a no-op.
  await applyDisputeClosed(db, intentId, { eventId: 'evt_d2_dup', disputeId: 'dp_1', outcome: 'won' });
  report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 25, 'restoring twice does not double-grant');
});

test('applyDisputeCreated then applyDisputeClosed(lost): keeps the revocation permanently', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intentId = await fulfillHelper(db, 'report-1');

  await applyDisputeCreated(db, intentId, { eventId: 'evt_d1', disputeId: 'dp_1' });
  await applyDisputeClosed(db, intentId, { eventId: 'evt_d2', disputeId: 'dp_1', outcome: 'lost' });
  const report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 0);

  // A later "won" for the SAME already-lost dispute must never resurrect it.
  await applyDisputeClosed(db, intentId, { eventId: 'evt_d3', disputeId: 'dp_1', outcome: 'won' });
  const report2 = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report2.purchasedPhotoCapacity, 0);
});

test('out-of-order dispute events converge correctly: closed(lost) arriving BEFORE created still ends in dispute_lost, and a later created is a no-op', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intentId = await fulfillHelper(db, 'report-1');

  await applyDisputeClosed(db, intentId, { eventId: 'evt_closed', disputeId: 'dp_1', outcome: 'lost' });
  let report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 0, 'closed(lost) alone already revokes, even without a prior created event');

  await applyDisputeCreated(db, intentId, { eventId: 'evt_created_late', disputeId: 'dp_1' });
  report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 0, 'a late-arriving created for an already-resolved dispute never re-suspends/changes state');
});

test('out-of-order dispute events converge correctly: closed(won) arriving BEFORE created never suspends capacity when it later arrives', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intentId = await fulfillHelper(db, 'report-1');

  await applyDisputeClosed(db, intentId, { eventId: 'evt_closed', disputeId: 'dp_1', outcome: 'won' });
  let report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 25, 'won without a prior created never touches capacity (it was never suspended)');

  await applyDisputeCreated(db, intentId, { eventId: 'evt_created_late', disputeId: 'dp_1' });
  report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 25, 'the late-arriving created for an already-won dispute is a no-op');
});

test('multiple valid purchases on one report accumulate; a purchase on one report never affects another', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  seedReport(db, 'report-2');

  await fulfillHelper(db, 'report-1');
  await fulfillHelper(db, 'report-1');
  const report1 = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report1.purchasedPhotoCapacity, 50, 'two valid purchases on the same report accumulate');

  const report2 = (await db.collection('reports').doc('report-2').get()).data();
  assert.equal(report2.purchasedPhotoCapacity || 0, 0, 'report-2 is completely unaffected by report-1 purchases');
});

// Real-Firestore transaction-ordering regression (found via live Stripe
// test-mode validation, 2026-09-22): real Firestore -- and this emulator --
// throws "Firestore transactions require all reads to be executed before all
// writes" if a transaction calls tx.get() after any tx.set()/update() in the
// same attempt. applyRefund/applyDisputeCreated/applyDisputeClosed each
// wrote the intent doc BEFORE reading the report doc, which the ordinary
// (order-blind) FakeFirestore above never caught -- live validation did.
// `strictTransactionOrder: true` reproduces that real constraint so this
// exact bug class can never hide behind a passing mocked suite again.
test('applyRefund (full): read-before-write ordering matches real Firestore\'s transaction rule', async () => {
  const db = new FakeFirestore({ strictTransactionOrder: true });
  seedReport(db, 'report-1');
  const intentId = await fulfillHelper(db, 'report-1');

  const refund = await applyRefund(db, intentId, { eventId: 'evt_r1', amountRefundedCents: 499, fullyRefunded: true });
  assert.equal(refund.revoked, true);
  const report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 0);
});

test('applyDisputeCreated: read-before-write ordering matches real Firestore\'s transaction rule', async () => {
  const db = new FakeFirestore({ strictTransactionOrder: true });
  seedReport(db, 'report-1');
  const intentId = await fulfillHelper(db, 'report-1');

  const result = await applyDisputeCreated(db, intentId, { eventId: 'evt_d1', disputeId: 'dp_1' });
  assert.equal(result.suspended, true);
  const report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 0);
});

test('applyDisputeClosed (won): read-before-write ordering matches real Firestore\'s transaction rule', async () => {
  const db = new FakeFirestore({ strictTransactionOrder: true });
  seedReport(db, 'report-1');
  const intentId = await fulfillHelper(db, 'report-1');
  await applyDisputeCreated(db, intentId, { eventId: 'evt_d1', disputeId: 'dp_1' });

  const result = await applyDisputeClosed(db, intentId, { eventId: 'evt_d2', disputeId: 'dp_1', outcome: 'won' });
  assert.equal(result.changed, true);
  const report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 25);
});

test('applyDisputeClosed (lost): read-before-write ordering matches real Firestore\'s transaction rule', async () => {
  const db = new FakeFirestore({ strictTransactionOrder: true });
  seedReport(db, 'report-1');
  const intentId = await fulfillHelper(db, 'report-1');
  await applyDisputeCreated(db, intentId, { eventId: 'evt_d1', disputeId: 'dp_1' });

  const result = await applyDisputeClosed(db, intentId, { eventId: 'evt_d2', disputeId: 'dp_1', outcome: 'lost' });
  assert.equal(result.changed, true);
  const report = (await db.collection('reports').doc('report-1').get()).data();
  assert.equal(report.purchasedPhotoCapacity, 0);
});

test('toSanitizedPurchase / listSanitizedPurchasesForReport: never exposes raw Stripe ids, prices, or payment data', async () => {
  const db = new FakeFirestore();
  seedReport(db, 'report-1');
  const intentId = await fulfillHelper(db, 'report-1');
  const report = (await db.collection('reports').doc('report-1').get()).data();
  const purchases = await listSanitizedPurchasesForReport(db, report);
  assert.equal(purchases.length, 1);
  const p = purchases[0];
  assert.equal(p.id, intentId);
  assert.equal(p.status, 'fulfilled');
  assert.equal(p.capacity, 25);
  for (const forbidden of ['stripeSessionId', 'stripePaymentIntentId', 'eventLog', 'reportOwnershipSnapshot']) {
    assert.equal(forbidden in p, false, `${forbidden} must never appear in sanitized output`);
  }
});
