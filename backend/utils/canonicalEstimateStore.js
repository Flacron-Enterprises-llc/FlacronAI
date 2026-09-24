// Phase 41. Firestore persistence for the canonical structured estimate.
// Follows `appendStagedPhoto`'s proven transactional idiom
// (backend/utils/photoDraftStaging.js) so a concurrent write is serialized
// (retried by the Admin SDK), never lost or half-applied.
//
// Storage shape (additive; touches no existing collection/field):
//   reports/{reportId}                        -- unchanged doc, except its
//                                                 `photos[].relatedLineItemIds`
//                                                 reverse index (see below)
//   reports/{reportId}/canonicalEstimate/current   -- singleton estimate doc
//   reports/{reportId}/canonicalEstimateAudit/*    -- bounded-by-design audit
//                                                 trail (a subcollection, not
//                                                 an unbounded array field --
//                                                 the exact gap this phase
//                                                 was told not to repeat from
//                                                 RepairEstimate.revisionHistory)
//
// The parent report's `photos` array already exists (Phase 6+); this module
// only adds an optional `relatedLineItemIds` field to each entry, recomputed
// fresh from the just-validated line items on every write -- never a
// separately maintained, driftable copy.
const { validateAndComputeCanonicalEstimate, computeReversePhotoIndex } = require('./canonicalEstimate');
const { resolveAppliedProposals } = require('./pricingProposalStore');

const ESTIMATE_DOC_ID = 'current';
const AUDIT_SUBCOLLECTION = 'canonicalEstimateAudit';
const ESTIMATE_TRANSACTION_MAX_ATTEMPTS = 15;
const MAX_AUDIT_LIST = 100;

const estimateRefFor = (db, reportId) =>
  db.collection('reports').doc(reportId).collection('canonicalEstimate').doc(ESTIMATE_DOC_ID);

const makeError = (message, code) => {
  const err = new Error(message);
  err.code = code;
  return err;
};

// Read-only fetch, used by GET. Returns null (not an error) when the report
// has no structured estimate yet -- the legacy-fallback contract.
const getCanonicalEstimate = async (db, reportId) => {
  const snap = await estimateRefFor(db, reportId).get();
  return snap.exists ? snap.data() : null;
};

const listCanonicalEstimateAudit = async (db, reportId, limit = 50) => {
  const cappedLimit = Math.min(Math.max(1, Number(limit) || 50), MAX_AUDIT_LIST);
  const snap = await db
    .collection('reports')
    .doc(reportId)
    .collection(AUDIT_SUBCOLLECTION)
    .orderBy('revision', 'desc')
    .limit(cappedLimit)
    .get();
  return snap.docs.map((d) => d.data());
};

// Validates + recomputes + persists the canonical estimate for `reportId` in
// one transaction. Throws an Error with `.code` set to one of:
//   NOT_FOUND            -- report doesn't exist / isn't owned by the caller
//                            (ownership itself is checked by the route, this
//                            is only reached with an already-verified report)
//   REPORT_FINALIZED     -- the parent report is finalized (Golden Rule #3 /
//                            the existing isFinalizedContentEdit precedent)
//   VALIDATION_ERROR      -- malformed/out-of-range/mixed-currency input
//   UNSUPPORTED_SCHEMA_VERSION
//   MIXED_CURRENCY
//   REVISION_CONFLICT     -- Phase 42: `body.baseRevision` (the revision the
//                            editor last loaded) doesn't match the currently
//                            persisted revision -- someone else's write got
//                            there first. `err.currentRevision` carries the
//                            real current value so the caller can offer a
//                            reload instead of silently overwriting it.
//                            Optional: a caller that omits `baseRevision`
//                            (e.g. a future non-interactive integration)
//                            gets today's last-write-wins behavior. Phase 43's
//                            correction reuses this EXACT code/shape when a
//                            proposal's own `baseRevision` is stale, rather
//                            than inventing a parallel conflict mechanism.
//   PRICING_PROPOSAL_NOT_FOUND / PRICING_PROPOSAL_EXPIRED /
//   PRICING_PROPOSAL_FORBIDDEN / PRICING_SUGGESTION_NOT_FOUND /
//   PRICING_SUGGESTION_ALREADY_CONSUMED -- Phase 43 trust-boundary
//                            correction (2026-09-19): thrown by
//                            resolveAppliedProposals (pricingProposalStore.js)
//                            when `body.appliedProposals` references an
//                            unknown/expired/cross-user/already-consumed-
//                            elsewhere proposal/suggestion. See that
//                            module's header comment for the full policy.
// The server NEVER persists a client-submitted total -- `computed` is the
// only source of truth written, and it comes entirely from
// validateAndComputeCanonicalEstimate's own fresh calculation. As of the
// Phase 43 correction, the server likewise never persists a client-submitted
// `providerModel`/AI-pricing-sourced cost component -- see
// canonicalEstimate.js's validateLineItems, which now reads those ONLY from
// `trustedOverridesByRowId` (built below) or a legitimate prior revision's
// own already-trusted value, never from the request body directly.
const upsertCanonicalEstimate = async (db, { reportId, body, actor }) => {
  const reportRef = db.collection('reports').doc(reportId);
  const estimateRef = estimateRefFor(db, reportId);

  const result = await db.runTransaction(
    async (tx) => {
      const [reportSnap, estimateSnap] = await Promise.all([tx.get(reportRef), tx.get(estimateRef)]);
      if (!reportSnap.exists) throw makeError('Report not found', 'NOT_FOUND');
      const report = reportSnap.data();
      // REPORT_FINALIZED must fire before ANY proposal-resolution work below
      // -- a finalized report is blocked from being repriced even via an
      // otherwise-valid appliedProposal (Golden Rule #3 precedent, unchanged).
      if (report.status === 'finalized') {
        throw makeError('Finalized reports cannot be edited.', 'REPORT_FINALIZED');
      }

      const existingPhotoIds = new Set((report.photos || []).map((p) => p.id).filter(Boolean));
      const previous = estimateSnap.exists ? estimateSnap.data() : null;
      const previousById = previous ? new Map(previous.lineItems.map((li) => [li.id, li])) : undefined;
      const actualRevision = previous?.revision || 0;

      if (body?.baseRevision !== undefined && body?.baseRevision !== null) {
        const expected = Number(body.baseRevision);
        if (expected !== actualRevision) {
          const err = makeError(
            `This estimate has changed since it was loaded (current revision ${actualRevision}, expected ${expected}). Reload to see the latest version before saving.`,
            'REVISION_CONFLICT'
          );
          err.currentRevision = actualRevision;
          throw err;
        }
      }

      // Phase 43 trust-boundary correction (2026-09-19). `body.appliedProposals`
      // is an array of `{proposalId, acceptedSuggestionIds}` entries -- a
      // minor, documented generalization of the originally-suggested
      // singular `{proposalId, acceptedSuggestionIds}` shape, so a user can
      // Generate + Apply more than once (necessarily against the SAME
      // baseRevision, since generating never advances it) before a single
      // Save without losing AI-sourced provenance on the earlier batch. Each
      // entry is independently re-verified (existence/ownership/expiry/
      // revision) against this report's OWN pricingProposals subcollection,
      // atomically with the rest of this transaction.
      const appliedProposals = Array.isArray(body?.appliedProposals) ? body.appliedProposals : [];
      const { trustedOverridesByRowId, pendingProposalWrites } = await resolveAppliedProposals(tx, {
        reportRef,
        reportId,
        appliedProposals,
        requestedByUid: actor?.uid || null,
        actualRevision,
        submittedLineItems: Array.isArray(body?.lineItems) ? body.lineItems : [],
      });

      const computed = validateAndComputeCanonicalEstimate(body, {
        existingPhotoIds,
        previousById,
        trustedOverridesByRowId,
      });
      if (computed.error) throw makeError(computed.error, computed.code || 'VALIDATION_ERROR');

      const now = new Date().toISOString();
      const revision = actualRevision + 1;
      const estimateDoc = {
        id: ESTIMATE_DOC_ID,
        reportId,
        status: 'draft',
        revision,
        schemaVersion: computed.schemaVersion,
        currency: computed.currency,
        lineItems: computed.lineItems,
        permits: computed.permits,
        generalConditions: computed.generalConditions,
        manualAdjustments: computed.manualAdjustments,
        totals: computed.totals,
        pricingStatus: computed.pricingStatus,
        userOverrideIndicators: computed.userOverrideIndicators,
        locationContext: computed.locationContext,
        pricingSourceMeta: computed.pricingSourceMeta,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
        updatedBy: actor?.uid || null,
      };

      tx.set(estimateRef, estimateDoc);

      const nextPhotos = computeReversePhotoIndex(report.photos || [], computed.lineItems);
      tx.update(reportRef, { photos: nextPhotos, updatedAt: now });

      const auditRef = reportRef.collection(AUDIT_SUBCOLLECTION).doc();
      tx.set(auditRef, {
        revision,
        changeSummary: String(body?.changeSummary || '').trim().slice(0, 300),
        actorUid: actor?.uid || null,
        actorEmail: actor?.email || null,
        grandTotalCents: computed.totals.grandTotalCents,
        createdAt: now,
      });

      // Phase 43 trust-boundary correction: mark applied suggestions
      // consumed ONLY now that validation has actually succeeded -- a
      // rejected save (e.g. a VALIDATION_ERROR on an unrelated field) must
      // never burn a suggestion's single-use consumption.
      for (const write of pendingProposalWrites) tx.set(write.ref, write.data);

      return estimateDoc;
    },
    { maxAttempts: ESTIMATE_TRANSACTION_MAX_ATTEMPTS }
  );

  return result;
};

module.exports = {
  ESTIMATE_DOC_ID,
  AUDIT_SUBCOLLECTION,
  getCanonicalEstimate,
  listCanonicalEstimateAudit,
  upsertCanonicalEstimate,
};
