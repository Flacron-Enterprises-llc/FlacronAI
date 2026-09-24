// Phase 43 (OpenAI Preliminary Pricing Service) -- trust-boundary correction,
// 2026-09-19. Server-side, short-lived "proposal" record: the opaque
// handle a generated pricing proposal is identified by (`proposalId`), and
// the ONLY place a line item's trusted AI-pricing metadata
// (materialUnitCost/laborUnitCost/equipmentUnitCost/providerModel/etc.)
// ever comes from when a proposal is later applied to a saved estimate.
//
// Why a NEW sibling subcollection instead of overloading the existing
// `pricingSuggestionsCache/{fingerprint}` doc (pricingService.js): that
// cache is deliberately report/user-agnostic BY DESIGN -- its whole safety
// property (see pricingFingerprint.js's header comment) is that it holds
// only generic, non-PII, non-report-specific PRICE DATA that can be
// legitimately reused across unrelated reports/users, proven by a dedicated
// existing test asserting no reportId/userId ever appears in that doc.
// Putting `reportId`/`requestedByUid`/consumption bookkeeping into that same
// doc would either break that guarantee (contaminate a cross-report-shared
// doc with report-scoped fields) or force awkward per-report copies of it,
// duplicating the SAME price data as a second source of truth. A proposal
// envelope is a fundamentally different, report/user-SCOPED concept (who
// asked, for which report, against which estimate revision, expiring soon,
// single-use) -- so it gets its own collection,
// `reports/{reportId}/pricingProposals/{proposalId}`, matching this
// codebase's existing subcollection-per-report-scoped-concept pattern
// (canonicalEstimate.js's own `canonicalEstimate`/`canonicalEstimateAudit`
// subcollections).
const crypto = require('crypto');
const { Timestamp } = require('../config/firebase');

const PROPOSAL_SUBCOLLECTION = 'pricingProposals';

// How long a generated proposal stays applicable, enforced at apply time
// (see the `expiresAt` check in resolveAppliedProposals below) regardless of
// whether Firestore's own TTL deletion has run yet -- this application-level
// check is what actually makes an expired proposal unusable; TTL below is
// only about reclaiming storage for documents nothing will ever read again.
// Configurable/documented in backend/.env.example.
const PROPOSAL_TTL_MINUTES = Number(process.env.PRICING_PROPOSAL_TTL_MINUTES) || 20;

// `expiresAt` is stored as a Firestore Timestamp (not an ISO string) so it
// is eligible to be the target field of a Firestore TTL policy -- Firestore
// only auto-deletes documents via a TTL policy declared on a Timestamp-typed
// field; a string field is silently ignored by TTL and would leak expired
// proposal documents forever. The 20-minute application-level expiry check
// above is what actually blocks USE of an expired proposal; this Timestamp
// choice is what makes automatic Firestore-side DELETION of the document
// possible once the TTL policy documented in PHASES.md's Phase 43 entry is
// enabled on the target Firestore database (a one-time `gcloud`/console
// step -- not something this codebase can declare/deploy for itself, since
// no Firestore infra-as-config file (firebase.json / firestore.indexes.json)
// exists in this repo to add it to).
const expiresAtTimestamp = (date) => Timestamp.fromDate(date);
const toEpochMs = (value) => {
  if (!value) return NaN;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime();
};

const makeError = (message, code, extra) => Object.assign(new Error(message), { code }, extra || {});

const proposalRefFor = (db, reportId, proposalId) =>
  db.collection('reports').doc(reportId).collection(PROPOSAL_SUBCOLLECTION).doc(proposalId);

// Persists a freshly-generated proposal. `items` is the FULL, trusted item
// set pricingService.js just computed (each already carrying a unique
// `suggestionId` and its real `providerModel`) -- never a client-supplied
// value. Returns the public handle (`proposalId`/`expiresAt`); the route
// strips `providerModel` before echoing anything back to the client (see
// pricingService.js's generatePricingProposal).
const createPricingProposal = async (
  db,
  { reportId, requestedByUid, baseRevision, locationContext, currency, pricingDate, items }
) => {
  const proposalId = `pp_${crypto.randomBytes(12).toString('hex')}`;
  const now = new Date();
  const expiresAtDate = new Date(now.getTime() + PROPOSAL_TTL_MINUTES * 60 * 1000);
  const expiresAt = expiresAtTimestamp(expiresAtDate);

  const itemsById = {};
  for (const item of items) {
    itemsById[item.suggestionId] = {
      ...item,
      consumed: false,
      consumedLineItemId: null,
      consumedAt: null,
    };
  }

  const doc = {
    proposalId,
    reportId,
    requestedByUid: requestedByUid || null,
    createdAt: now.toISOString(),
    expiresAt,
    baseRevision: baseRevision || 0,
    locationContext: locationContext || null,
    currency: currency || null,
    pricingDate: pricingDate || null,
    items: itemsById,
  };

  await proposalRefFor(db, reportId, proposalId).set(doc);
  // The PUBLIC handle returned to the route (and from there, the API
  // response) uses the plain ISO string -- a Firestore Timestamp doesn't
  // JSON-serialize to anything a client should parse as a date; only the
  // Firestore-stored copy needs the Timestamp type, for TTL eligibility.
  return { proposalId, expiresAt: expiresAtDate.toISOString() };
};

// Resolves `appliedProposals` (an array of `{proposalId, acceptedSuggestionIds}`
// entries -- see canonicalEstimateStore.js's upsertCanonicalEstimate for the
// exact request-body shape) against this report's OWN pricingProposals
// subcollection, entirely INSIDE the caller's existing transaction (`tx`) --
// so a stale-revision, expired, or cross-user read is checked atomically
// with the estimate write it's gating, matching the existing REVISION_CONFLICT
// mechanism/semantics rather than inventing a parallel one.
//
// Never mutates Firestore itself -- returns what the caller (upsertCanonical
// Estimate) should additionally `tx.set()` ONLY after validateAndComputeCanon
// icalEstimate has already succeeded, so a rejected save never marks a
// suggestion consumed.
//
// Access policy (deliberate, documented choice -- see this correction's
// PHASES.md entry for the fuller reasoning): only the uid that GENERATED a
// proposal may apply it. Generating a proposal already requires the same
// owner-with-canEditReports/review-grantee write access as saving the
// estimate, so this is a narrower, additional check on top of that existing
// access model, not a replacement for it -- a different, otherwise-authorized
// editor can simply generate their own proposal for the same scope (a cache
// hit makes this cheap) rather than reuse someone else's.
const resolveAppliedProposals = async (
  tx,
  { reportRef, reportId, appliedProposals, requestedByUid, actualRevision, submittedLineItems }
) => {
  const trustedOverridesByRowId = new Map();
  const pendingProposalWrites = []; // [{ ref, data }] -- written by the caller after validation succeeds

  for (const entry of appliedProposals || []) {
    const proposalId = String(entry?.proposalId || '').trim();
    const acceptedSuggestionIds = Array.isArray(entry?.acceptedSuggestionIds)
      ? [...new Set(entry.acceptedSuggestionIds.map((s) => String(s || '').trim()).filter(Boolean))]
      : [];
    if (!proposalId || acceptedSuggestionIds.length === 0) continue;

    const ref = reportRef.collection(PROPOSAL_SUBCOLLECTION).doc(proposalId);
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw makeError(
        'Preliminary pricing proposal not found or already expired.',
        'PRICING_PROPOSAL_NOT_FOUND'
      );
    }
    const data = snap.data();

    // Defense in depth only -- a proposal generated for a DIFFERENT report
    // lives at a structurally different Firestore path
    // (reports/{otherReportId}/pricingProposals/{proposalId}), so this
    // report's own subcollection lookup above already can't find it; a
    // mismatch here should be unreachable in practice.
    if (data.reportId !== reportId) {
      throw makeError(
        'Preliminary pricing proposal not found or already expired.',
        'PRICING_PROPOSAL_NOT_FOUND'
      );
    }
    if (data.requestedByUid !== requestedByUid) {
      throw makeError(
        'You do not have permission to apply this pricing proposal.',
        'PRICING_PROPOSAL_FORBIDDEN'
      );
    }
    if (!data.expiresAt || toEpochMs(data.expiresAt) < Date.now()) {
      throw makeError(
        'This preliminary pricing proposal has expired. Generate a new one.',
        'PRICING_PROPOSAL_EXPIRED'
      );
    }
    // The baseRevision check below is deliberately deferred until AFTER we
    // know whether this call is freshly consuming any suggestion (see
    // `needsFreshRevisionCheck`) -- see that variable's own comment for why
    // checking it unconditionally here would be a real bug, not just overly
    // strict.
    const nextItems = { ...data.items };
    let mutated = false;
    let needsFreshRevisionCheck = false;

    for (const suggestionId of acceptedSuggestionIds) {
      const trusted = data.items?.[suggestionId];
      if (!trusted) {
        throw makeError(
          `Preliminary pricing suggestion "${suggestionId}" was not found in this proposal.`,
          'PRICING_SUGGESTION_NOT_FOUND'
        );
      }

      // Matching scheme deliberately mirrors pricingSuggestions.js's
      // mergeProposedPricingIntoLineItems (frontend): first by the
      // suggestion's own id (a client-supplied `appliedSuggestionId` on the
      // submitted row -- the server-side equivalent of the frontend's local
      // `sourceProposalId`/`appliedSuggestionId` bookkeeping field), then by
      // `targetLineItemId` (the item originally selected for repricing).
      const matchedRow =
        submittedLineItems.find((row) => row && row.appliedSuggestionId === suggestionId) ||
        (trusted.targetLineItemId
          ? submittedLineItems.find((row) => row && row.id === trusted.targetLineItemId)
          : undefined);

      // Accepted but no longer present in this save (e.g. the user removed
      // the line item locally before saving) -- a documented no-op, not an
      // error; nothing to inject trust onto.
      if (!matchedRow) continue;

      if (trusted.consumed) {
        if (trusted.consumedLineItemId !== matchedRow.id) {
          // Replay-protection: the SAME suggestion was already applied to a
          // DIFFERENT line item in an earlier save -- a second application
          // (e.g. a raw repeated API call trying to append it again as a
          // new item) is rejected, never silently duplicated.
          throw makeError(
            `Preliminary pricing suggestion "${suggestionId}" has already been applied to a different line item.`,
            'PRICING_SUGGESTION_ALREADY_CONSUMED'
          );
        }
        // Same suggestion, same already-consumed target line item: an
        // idempotent re-apply (e.g. a literal repeated API call, or simply
        // re-saving the estimate later without changing this item -- the
        // frontend keeps `appliedSuggestionId` on the draft item
        // indefinitely, so EVERY later save of that item re-submits this
        // same appliedProposals entry, not just an immediate retry). This
        // intentionally does NOT require a fresh baseRevision match -- we
        // are not injecting any NEW trust here, only re-affirming an
        // already-settled fact, which stays valid no matter how far the
        // estimate's revision has moved on for unrelated reasons since.
      } else {
        // A suggestion being consumed for the FIRST time is the only case
        // that actually needs the estimate to still be at the revision the
        // proposal was generated against -- otherwise a proposal generated
        // against stale line-item state could inject trust onto data it
        // never actually saw.
        needsFreshRevisionCheck = true;
        nextItems[suggestionId] = {
          ...trusted,
          consumed: true,
          consumedLineItemId: matchedRow.id,
          consumedAt: new Date().toISOString(),
        };
        mutated = true;
      }

      trustedOverridesByRowId.set(matchedRow.id, trusted);
    }

    if (needsFreshRevisionCheck && (data.baseRevision || 0) !== actualRevision) {
      const err = makeError(
        `This estimate has changed since preliminary pricing was generated (current revision ${actualRevision}, expected ${data.baseRevision || 0}). Reload to see the latest version before applying.`,
        'REVISION_CONFLICT'
      );
      err.currentRevision = actualRevision;
      throw err;
    }

    if (mutated) pendingProposalWrites.push({ ref, data: { ...data, items: nextItems } });
  }

  return { trustedOverridesByRowId, pendingProposalWrites };
};

module.exports = {
  PROPOSAL_SUBCOLLECTION,
  PROPOSAL_TTL_MINUTES,
  proposalRefFor,
  createPricingProposal,
  resolveAppliedProposals,
};
