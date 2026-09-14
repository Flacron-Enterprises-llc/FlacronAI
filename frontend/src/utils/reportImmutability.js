// A report's finalized version is immutable once approved. 'finalized' is
// the canonical immutable state -- the only status POST /:id/approve itself
// ever writes (backend/routes/reports.js's own approve handler). Mirrors
// that file's isFinalizedContentEdit/isReviewed distinction: legacy
// 'approved'/'completed' reviewed states are intentionally NOT included here
// -- they keep the pre-existing reopen-on-edit behavior, unaffected by this
// guard.
export const isFinalizedReportStatus = (status) => status === 'finalized';
