// QA fix: an Invoice may only be generated from a Repair Estimate whose
// persisted status is the project's canonical approved/finalized state.
// Mirrors the backend's own authoritative gate (`isReviewed` in
// backend/routes/reports.js's `POST /:id/invoice`) exactly -- this is
// UI-only, for disabling the Invoice button and showing the same
// explanation before a request is ever sent. The server independently
// re-checks the estimate's current persisted status regardless of what this
// predicate (or a manipulated client) says.
export const REPAIR_ESTIMATE_REVIEWED_STATUSES = ['finalized', 'approved', 'completed'];

export const isRepairEstimateFinalized = (status) =>
  REPAIR_ESTIMATE_REVIEWED_STATUSES.includes(status);

export const INVOICE_BLOCKED_ON_DRAFT_ESTIMATE_MESSAGE =
  'Approve and finalize the Repair Estimate before generating an Invoice.';
