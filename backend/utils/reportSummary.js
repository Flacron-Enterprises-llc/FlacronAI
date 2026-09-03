const LIST_CONTENT_PREVIEW_LENGTH = 300;

// GET /api/reports (list view) intentionally never returns full report
// content -- it's a preview snippet only. Callers that need the complete,
// editable content (the Review & Edit Report panel, exports, PDF/DOCX
// generation) MUST fetch the single report via GET /api/reports/:id instead,
// which returns the untruncated `content` field. Naming this explicitly (and
// unit-testing it) documents that contract so a list-row object is never
// mistaken for a complete report elsewhere in the codebase.
// Preserves the exact pre-existing behavior (always appends "..." even when
// content is already shorter than the preview length) -- unrelated to this
// fix, so left as-is rather than "improved" alongside it.
const truncateContentForListView = (content) => {
  if (!content) return '';
  return `${content.substring(0, LIST_CONTENT_PREVIEW_LENGTH)}...`;
};

module.exports = { LIST_CONTENT_PREVIEW_LENGTH, truncateContentForListView };
