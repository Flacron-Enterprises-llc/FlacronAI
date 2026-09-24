// Phase 45 (Stripe Report-Specific Photo Add-Ons).
//
// Firestore-backed lifecycle store for report-specific photo add-on
// purchases. One document per purchase attempt in `photoAddOnPurchases`
// doubles as BOTH the "checkout intent" (PHASES.md's term for the
// server-side record created before Stripe even knows about the purchase)
// AND the "purchase record" once paid -- a single lifecycle object, rather
// than two collections kept in sync by hand, so a purchase can never end up
// recorded in one place but not the other.
//
// Server authority: this document -- never Stripe webhook `metadata` and
// never the browser -- is what every capacity decision is checked against.
// A webhook/session's own fields are re-validated against the ALREADY-STORED
// values here before anything is trusted (see fulfillCheckoutIntent).
//
// Capacity bookkeeping: rather than a separately-queried collection scan
// (this repo's lightweight FakeFirestore test double has no `.where()`, and
// a real per-report query would need a composite index), the report document
// itself carries a small, transaction-updated snapshot:
//   - `purchasedPhotoCapacity` (number) -- the CURRENT sum of every
//     fulfilled-and-not-reversed purchase's capacity for this report. Only
//     ever changed inside the SAME transaction as the owning intent's own
//     status flip, so it can never drift from the intents that justify it.
//   - `photoAddOnCapacityGrantedFor` (string[] of intent ids) -- which
//     intents are CURRENTLY counted in that sum, so grant/revoke is always
//     idempotent (checked with a Set, never blindly +=/-=twice).
//   - `photoAddOnPurchaseIds` (string[], bounded) -- every intent ever
//     created for this report, oldest-evicted, so the purchase-history read
//     endpoint can fetch each doc directly by id (no query needed).
//   - `photoAddOnHistory` (array, bounded) -- a compact audit trail of each
//     grant/revoke/restore, no sensitive payment data.
const COLLECTION = 'photoAddOnPurchases';
const SCHEMA_VERSION = 1;
const MAX_HISTORY_ENTRIES = 50;
// Matches Stripe Checkout's own default Session expiry window.
const CHECKOUT_EXPIRY_MS = 24 * 60 * 60 * 1000;

const nowIsoDefault = () => new Date().toISOString();
const appendBounded = (list = [], entry) => [...list, entry].slice(-MAX_HISTORY_ENTRIES);

const notFoundError = (message = 'Report not found') => {
  const err = new Error(message);
  err.code = 'NOT_FOUND';
  return err;
};

// Task: "authorize access to the report" + "reject finalized/archived/
// ineligible reports" + "persist a checkoutIntent record" as one atomic step
// -- a report can never end up eligible-but-unrecorded or
// recorded-against-an-ineligible-report.
const createCheckoutIntent = async (db, { uid, reportId, pack, mode, nowIso = nowIsoDefault }) => {
  const reportRef = db.collection('reports').doc(reportId);
  const intentRef = db.collection(COLLECTION).doc();
  return db.runTransaction(async (tx) => {
    const reportDoc = await tx.get(reportRef);
    if (!reportDoc.exists) throw notFoundError();
    const report = reportDoc.data();
    // Never distinguish "exists but isn't yours" from "doesn't exist" --
    // same convention as loadOwnedReport in routes/reports.js.
    if (report.userId !== uid || report.status === 'archived') throw notFoundError();
    if (report.status === 'finalized') {
      const err = new Error('This report is finalized and no longer accepts photo capacity purchases.');
      err.code = 'REPORT_FINALIZED';
      throw err;
    }

    const createdAt = nowIso();
    const expiresAt = new Date(new Date(createdAt).getTime() + CHECKOUT_EXPIRY_MS).toISOString();
    const intentData = {
      schemaVersion: SCHEMA_VERSION,
      uid,
      reportId,
      packId: pack.id,
      capacity: pack.capacity,
      amountCents: pack.amountCents,
      currency: pack.currency,
      stripeMode: mode,
      status: 'pending', // pending -> session_created -> fulfilled | expired | failed
                          //  fulfilled -> disputed -> fulfilled (won) | dispute_lost
                          //  fulfilled -> refunded
      reportOwnershipSnapshot: { uid: report.userId, reportStatusAtCreation: report.status },
      stripeSessionId: null,
      stripePaymentIntentId: null,
      fulfillment: null,
      reversal: null,
      manualReview: null,
      activeDisputeId: null,
      resolvedDisputeId: null,
      disputeOutcome: null,
      eventLog: [],
      createdAt,
      updatedAt: createdAt,
      expiresAt,
    };
    tx.set(intentRef, intentData);

    const nextIds = appendBounded(report.photoAddOnPurchaseIds || [], intentRef.id);
    tx.set(reportRef, { ...report, photoAddOnPurchaseIds: nextIds, updatedAt: createdAt });

    return { id: intentRef.id, ...intentData };
  });
};

const markSessionCreated = async (db, intentId, { stripeSessionId, nowIso = nowIsoDefault }) => {
  const ref = db.collection(COLLECTION).doc(intentId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw notFoundError('Checkout intent not found');
    const data = doc.data();
    if (data.status !== 'pending') return { id: intentId, ...data }; // idempotent no-op if already advanced
    const updated = { ...data, status: 'session_created', stripeSessionId, updatedAt: nowIso() };
    tx.set(ref, updated);
    return { id: intentId, ...updated };
  });
};

// "If Stripe session creation fails after an intent is stored, mark it
// failed safely and allow an idempotent retry" -- the caller simply calls
// createCheckoutIntent again for a fresh attempt; this only records why the
// prior one didn't make it, and never overwrites an intent that DID succeed.
const markSessionFailed = async (db, intentId, { reason, nowIso = nowIsoDefault }) => {
  const ref = db.collection(COLLECTION).doc(intentId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return null;
    const data = doc.data();
    if (data.status === 'fulfilled') return { id: intentId, ...data };
    const updated = { ...data, status: 'failed', updatedAt: nowIso(), lastError: reason ? String(reason).slice(0, 500) : null };
    tx.set(ref, updated);
    return { id: intentId, ...updated };
  });
};

const getCheckoutIntent = async (db, intentId) => {
  const doc = await db.collection(COLLECTION).doc(intentId).get();
  return doc.exists ? { id: intentId, ...doc.data() } : null;
};

// Applies (+capacity) or reverses (-capacity) exactly once, keyed by intentId
// via the report's own `photoAddOnCapacityGrantedFor` set -- shared by every
// grant/revoke/restore path below so the bookkeeping rule lives in one place.
const applyCapacityDelta = (report, { intentId, capacity, direction, nowStr, packId, action, reason }) => {
  const grantedIds = new Set(report.photoAddOnCapacityGrantedFor || []);
  const alreadyGranted = grantedIds.has(intentId);
  if (direction === 'grant' && alreadyGranted) return null;
  if (direction === 'revoke' && !alreadyGranted) return null;

  if (direction === 'grant') grantedIds.add(intentId);
  else grantedIds.delete(intentId);

  const delta = direction === 'grant' ? capacity : -capacity;
  const nextPurchasedCapacity = Math.max(0, (report.purchasedPhotoCapacity || 0) + delta);
  const history = appendBounded(report.photoAddOnHistory || [], {
    purchaseId: intentId,
    packId,
    capacity,
    action,
    reason: reason || null,
    at: nowStr,
  });
  return {
    ...report,
    purchasedPhotoCapacity: nextPurchasedCapacity,
    photoAddOnCapacityGrantedFor: [...grantedIds],
    photoAddOnHistory: history,
    updatedAt: nowStr,
  };
};

// The atomic fulfillment step (Phase 45 core requirement). Re-validates the
// Stripe object against the TRUSTED stored intent -- amount/currency/mode/
// payment status/session id/metadata are all corroborated here; a webhook's
// own metadata alone never fulfills anything. Idempotent: an intent already
// `fulfilled` (whether by this same event redelivered, a concurrent racing
// call, or the sync-after-redirect path below) is a pure no-op, and a
// terminal non-fulfillable status (expired/failed/refunded/disputed/
// dispute_lost) is never resurrected from here.
const fulfillCheckoutIntent = async (db, intentId, { stripeSession, eventId, source = 'webhook', nowIso = nowIsoDefault }) => {
  const intentRef = db.collection(COLLECTION).doc(intentId);
  return db.runTransaction(async (tx) => {
    const intentDoc = await tx.get(intentRef);
    if (!intentDoc.exists) return { fulfilled: false, alreadyFulfilled: false, reason: 'CHECKOUT_INTENT_NOT_FOUND' };
    const intent = intentDoc.data();
    const nowStr = nowIso();

    if (intent.status === 'fulfilled') {
      return { fulfilled: false, alreadyFulfilled: true, intent: { id: intentId, ...intent } };
    }
    if (!['pending', 'session_created'].includes(intent.status)) {
      return { fulfilled: false, alreadyFulfilled: false, reason: `INTENT_NOT_FULFILLABLE:${intent.status}` };
    }

    const mismatches = [];
    if (stripeSession.mode !== 'payment') mismatches.push('mode');
    if (typeof stripeSession.livemode === 'boolean' && stripeSession.livemode !== (intent.stripeMode === 'live')) {
      mismatches.push('environment');
    }
    if (stripeSession.currency && stripeSession.currency !== intent.currency) mismatches.push('currency');
    if (Number.isFinite(stripeSession.amount_total) && stripeSession.amount_total !== intent.amountCents) mismatches.push('amount');
    if (!['paid', 'no_payment_required'].includes(stripeSession.payment_status)) mismatches.push('payment_status');
    if (intent.stripeSessionId && stripeSession.id && stripeSession.id !== intent.stripeSessionId) mismatches.push('session_id');
    const metaIntentId = stripeSession.metadata && stripeSession.metadata.checkoutIntentId;
    if (metaIntentId && metaIntentId !== intentId) mismatches.push('checkoutIntentId');

    if (mismatches.length) {
      const updated = {
        ...intent,
        status: 'failed',
        updatedAt: nowStr,
        lastError: `Fulfillment rejected: mismatch on ${mismatches.join(', ')}`,
        eventLog: appendBounded(intent.eventLog, { eventId: eventId || null, type: 'fulfillment_rejected', at: nowStr }),
      };
      tx.set(intentRef, updated);
      return { fulfilled: false, alreadyFulfilled: false, reason: `MISMATCH:${mismatches.join(',')}`, intent: { id: intentId, ...updated } };
    }

    const reportRef = db.collection('reports').doc(intent.reportId);
    const reportDoc = await tx.get(reportRef);

    const updatedIntent = {
      ...intent,
      status: 'fulfilled',
      stripePaymentIntentId: stripeSession.payment_intent || intent.stripePaymentIntentId || null,
      updatedAt: nowStr,
      fulfillment: { fulfilledAt: nowStr, fulfilledByEventId: eventId || null, fulfilledBySource: source },
      eventLog: appendBounded(intent.eventLog, { eventId: eventId || null, type: 'fulfilled', at: nowStr }),
    };
    tx.set(intentRef, updatedIntent);

    if (reportDoc.exists) {
      const nextReport = applyCapacityDelta(reportDoc.data(), {
        intentId, capacity: intent.capacity, direction: 'grant', nowStr, packId: intent.packId, action: 'granted',
      });
      if (nextReport) tx.set(reportRef, nextReport);
    }

    return { fulfilled: true, alreadyFulfilled: false, intent: { id: intentId, ...updatedIntent } };
  });
};

// checkout.session.expired -- grants nothing, ever (an expired session
// cannot have been fulfilled first; if it somehow already was, this is a
// pure no-op, never downgrading a real purchase).
const markExpired = async (db, intentId, { eventId, nowIso = nowIsoDefault }) => {
  const ref = db.collection(COLLECTION).doc(intentId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return { found: false };
    const intent = doc.data();
    if (intent.status === 'fulfilled' || intent.status === 'expired') {
      return { found: true, changed: false, intent: { id: intentId, ...intent } };
    }
    const nowStr = nowIso();
    const updated = { ...intent, status: 'expired', updatedAt: nowStr, eventLog: appendBounded(intent.eventLog, { eventId: eventId || null, type: 'expired', at: nowStr }) };
    tx.set(ref, updated);
    return { found: true, changed: true, intent: { id: intentId, ...updated } };
  });
};

// charge.refunded -- only a FULL refund revokes capacity. A partial refund
// is flagged for manual review; capacity is deliberately left unchanged (no
// fractional photo credits invented) per Phase 45's documented policy.
const applyRefund = async (db, intentId, { eventId, amountRefundedCents, fullyRefunded, nowIso = nowIsoDefault }) => {
  const intentRef = db.collection(COLLECTION).doc(intentId);
  return db.runTransaction(async (tx) => {
    const intentDoc = await tx.get(intentRef);
    if (!intentDoc.exists) return { found: false };
    const intent = intentDoc.data();
    const nowStr = nowIso();

    if (intent.status === 'refunded') {
      return { found: true, revoked: false, flagged: false, intent: { id: intentId, ...intent } };
    }

    if (!fullyRefunded) {
      const updated = {
        ...intent,
        manualReview: { reason: 'partial_refund', amountRefundedCents, flaggedAt: nowStr, eventId: eventId || null },
        updatedAt: nowStr,
        eventLog: appendBounded(intent.eventLog, { eventId: eventId || null, type: 'partial_refund_flagged', at: nowStr }),
      };
      tx.set(intentRef, updated);
      return { found: true, revoked: false, flagged: true, intent: { id: intentId, ...updated } };
    }

    const wasGranted = intent.status === 'fulfilled' || intent.status === 'disputed';

    // Firestore transactions require every read to happen before any write --
    // read the report (if we'll need it) before writing the intent below.
    let reportRef, reportDoc;
    if (wasGranted) {
      reportRef = db.collection('reports').doc(intent.reportId);
      reportDoc = await tx.get(reportRef);
    }

    const updatedIntent = {
      ...intent,
      status: 'refunded',
      updatedAt: nowStr,
      reversal: { revokedAt: nowStr, revokedByEventId: eventId || null, reason: 'refund' },
      eventLog: appendBounded(intent.eventLog, { eventId: eventId || null, type: 'refunded', at: nowStr }),
    };
    tx.set(intentRef, updatedIntent);

    if (wasGranted && reportDoc.exists) {
      const nextReport = applyCapacityDelta(reportDoc.data(), {
        intentId, capacity: intent.capacity, direction: 'revoke', nowStr, packId: intent.packId, action: 'revoked', reason: 'refund',
      });
      if (nextReport) tx.set(reportRef, nextReport);
    }

    return { found: true, revoked: wasGranted, intent: { id: intentId, ...updatedIntent } };
  });
};

// charge.dispute.created -- suspends a currently-fulfilled entitlement.
// `disputeId` lets a later-arriving (or earlier-arriving, out of order)
// charge.dispute.closed for the SAME dispute converge correctly regardless
// of delivery order -- see applyDisputeClosed.
const applyDisputeCreated = async (db, intentId, { eventId, disputeId, nowIso = nowIsoDefault }) => {
  const intentRef = db.collection(COLLECTION).doc(intentId);
  return db.runTransaction(async (tx) => {
    const intentDoc = await tx.get(intentRef);
    if (!intentDoc.exists) return { found: false };
    const intent = intentDoc.data();
    const nowStr = nowIso();

    if (disputeId && intent.disputeOutcome && intent.resolvedDisputeId === disputeId) {
      // This exact dispute was already resolved (closed arrived first, out
      // of order) -- never re-suspend a settled dispute.
      return { found: true, suspended: false, intent: { id: intentId, ...intent } };
    }
    if (intent.status !== 'fulfilled') {
      return { found: true, suspended: false, intent: { id: intentId, ...intent } };
    }

    // Firestore transactions require every read to happen before any write --
    // read the report before writing the intent below.
    const reportRef = db.collection('reports').doc(intent.reportId);
    const reportDoc = await tx.get(reportRef);

    const updatedIntent = {
      ...intent,
      status: 'disputed',
      activeDisputeId: disputeId || null,
      updatedAt: nowStr,
      eventLog: appendBounded(intent.eventLog, { eventId: eventId || null, type: 'dispute_created', at: nowStr }),
    };
    tx.set(intentRef, updatedIntent);

    if (reportDoc.exists) {
      const nextReport = applyCapacityDelta(reportDoc.data(), {
        intentId, capacity: intent.capacity, direction: 'revoke', nowStr, packId: intent.packId, action: 'suspended', reason: 'dispute_created',
      });
      if (nextReport) tx.set(reportRef, nextReport);
    }

    return { found: true, suspended: true, intent: { id: intentId, ...updatedIntent } };
  });
};

// charge.dispute.closed -- `outcome` is Stripe's own Dispute.status ('won' |
// 'lost'), never an invented event name. Won restores exactly once; lost
// keeps/reapplies revocation permanently. Converges correctly no matter
// whether `charge.dispute.created` for this same dispute was ever processed,
// or arrives after this event.
const applyDisputeClosed = async (db, intentId, { eventId, disputeId, outcome, nowIso = nowIsoDefault }) => {
  const intentRef = db.collection(COLLECTION).doc(intentId);
  return db.runTransaction(async (tx) => {
    const intentDoc = await tx.get(intentRef);
    if (!intentDoc.exists) return { found: false };
    const intent = intentDoc.data();
    const nowStr = nowIso();

    const bookkeeping = {
      disputeOutcome: outcome,
      resolvedDisputeId: disputeId || intent.activeDisputeId || null,
      activeDisputeId: null,
    };

    if (outcome === 'won') {
      if (intent.status === 'dispute_lost' || intent.status === 'refunded') {
        // Already permanently settled the other way -- do not resurrect.
        const updated = { ...intent, ...bookkeeping, updatedAt: nowStr, eventLog: appendBounded(intent.eventLog, { eventId: eventId || null, type: 'dispute_won_noop', at: nowStr }) };
        tx.set(intentRef, updated);
        return { found: true, changed: false, intent: { id: intentId, ...updated } };
      }
      // Firestore transactions require every read to happen before any write --
      // read the report before writing the intent below.
      const wonReportRef = db.collection('reports').doc(intent.reportId);
      const wonReportDoc = await tx.get(wonReportRef);

      const updatedIntent = { ...intent, ...bookkeeping, status: 'fulfilled', updatedAt: nowStr, eventLog: appendBounded(intent.eventLog, { eventId: eventId || null, type: 'dispute_won', at: nowStr }) };
      tx.set(intentRef, updatedIntent);

      if (wonReportDoc.exists) {
        const nextReport = applyCapacityDelta(wonReportDoc.data(), {
          intentId, capacity: intent.capacity, direction: 'grant', nowStr, packId: intent.packId, action: 'restored', reason: 'dispute_won',
        });
        if (nextReport) tx.set(wonReportRef, nextReport);
      }
      return { found: true, changed: true, intent: { id: intentId, ...updatedIntent } };
    }

    // outcome === 'lost'
    if (intent.status === 'dispute_lost') {
      return { found: true, changed: false, intent: { id: intentId, ...intent } };
    }

    // Firestore transactions require every read to happen before any write --
    // read the report before writing the intent below.
    const lostReportRef = db.collection('reports').doc(intent.reportId);
    const lostReportDoc = await tx.get(lostReportRef);

    const updatedIntent = {
      ...intent,
      ...bookkeeping,
      status: 'dispute_lost',
      reversal: { revokedAt: nowStr, revokedByEventId: eventId || null, reason: 'dispute_lost' },
      updatedAt: nowStr,
      eventLog: appendBounded(intent.eventLog, { eventId: eventId || null, type: 'dispute_lost', at: nowStr }),
    };
    tx.set(intentRef, updatedIntent);

    if (lostReportDoc.exists) {
      const nextReport = applyCapacityDelta(lostReportDoc.data(), {
        intentId, capacity: intent.capacity, direction: 'revoke', nowStr, packId: intent.packId, action: 'revoked', reason: 'dispute_lost',
      });
      if (nextReport) tx.set(lostReportRef, nextReport);
    }

    return { found: true, changed: true, intent: { id: intentId, ...updatedIntent } };
  });
};

// Sanitized shape for the purchase-history read surface -- never a raw
// Stripe id/price/customer/card field.
const toSanitizedPurchase = (intent) => ({
  id: intent.id,
  packId: intent.packId,
  capacity: intent.capacity,
  amountCents: intent.amountCents,
  currency: intent.currency,
  status: intent.status,
  needsManualReview: !!intent.manualReview,
  createdAt: intent.createdAt,
  updatedAt: intent.updatedAt,
  fulfilledAt: intent.fulfillment ? intent.fulfillment.fulfilledAt : null,
  refundedAt: intent.status === 'refunded' && intent.reversal ? intent.reversal.revokedAt : null,
  disputeStatus: intent.status === 'disputed' ? 'open' : intent.disputeOutcome,
});

// Reads every purchase ever created for a report by id (bounded list stored
// on the report doc itself -- see header comment) -- no collection query
// needed, works identically against the real Firestore SDK and this repo's
// query-less FakeFirestore test double.
const listSanitizedPurchasesForReport = async (db, report) => {
  const ids = report.photoAddOnPurchaseIds || [];
  if (ids.length === 0) return [];
  const docs = await Promise.all(ids.map((id) => getCheckoutIntent(db, id)));
  return docs.filter(Boolean).map(toSanitizedPurchase);
};

module.exports = {
  COLLECTION,
  SCHEMA_VERSION,
  CHECKOUT_EXPIRY_MS,
  createCheckoutIntent,
  markSessionCreated,
  markSessionFailed,
  getCheckoutIntent,
  fulfillCheckoutIntent,
  markExpired,
  applyRefund,
  applyDisputeCreated,
  applyDisputeClosed,
  toSanitizedPurchase,
  listSanitizedPurchasesForReport,
};
