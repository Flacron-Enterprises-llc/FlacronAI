const test = require('node:test');
const assert = require('node:assert/strict');
const { LIST_CONTENT_PREVIEW_LENGTH, truncateContentForListView } = require('../utils/reportSummary');

// Regression coverage for Issue 8 (Review & Edit Report losing sections on
// reopen): GET /api/reports (list view) must keep truncating content to a
// preview snippet -- that's intentional -- but GET /api/reports/:id (used to
// open a report for editing) must never apply this truncation. This pins the
// list-side half of that contract so it can't silently change.

test('truncateContentForListView shortens long content to the preview length plus an ellipsis', () => {
  const full = 'A'.repeat(1000);
  const preview = truncateContentForListView(full);
  assert.equal(preview, `${'A'.repeat(LIST_CONTENT_PREVIEW_LENGTH)}...`);
  assert.ok(preview.length < full.length);
});

test('truncateContentForListView returns an empty string for missing content', () => {
  assert.equal(truncateContentForListView(''), '');
  assert.equal(truncateContentForListView(null), '');
  assert.equal(truncateContentForListView(undefined), '');
});

test('truncateContentForListView never returns content longer than the full report', () => {
  const full = '# Section 1\n\nSome body text.\n\n## Section 2\n\nMore body text.';
  const preview = truncateContentForListView(full);
  assert.ok(preview.length <= full.length + 3); // +3 for the appended "..."
});
