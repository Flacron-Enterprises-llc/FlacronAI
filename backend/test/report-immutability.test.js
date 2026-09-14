const test = require('node:test');
const assert = require('node:assert/strict');

// QA regression: a report with status 'finalized' could still be opened in
// edit mode, modified, and saved -- PUT /:id silently reopened it as a draft
// on any content change (treating 'finalized' the same as the legacy
// 'approved'/'completed' review states), and POST /:id/photos/regenerate
// allowed regenerating (fully overwriting) a finalized report's content too.
// Fixed by making the canonical 'finalized' state (the only status /approve
// itself ever writes) hard-rejected on both mutation paths, independent of
// anything the client sends -- both checks read the CURRENT PERSISTED
// status/content only. This file follows this codebase's existing
// no-HTTP-harness convention (see export-failure-handling.test.js): PUT
// /:id's rule is exercised via the pure predicate reports.js exposes at
// router._test (same mechanism already used for the export concurrency
// lock), and the regenerate route's rule via a minimal fake Firestore around
// photoJobService.regenerateFromPhotoReview.

const { _test } = require('../routes/reports');
const { isFinalizedContentEdit, isReviewed } = _test;

test('isFinalizedContentEdit rejects a content change on a finalized report', () => {
  const current = { status: 'finalized', content: '# Old content', additionalNotes: '' };
  assert.equal(isFinalizedContentEdit(current, { content: '# New content' }), true);
});

test('isFinalizedContentEdit rejects an additionalNotes-only change on a finalized report', () => {
  const current = { status: 'finalized', content: '# Content', additionalNotes: 'old note' };
  assert.equal(isFinalizedContentEdit(current, { additionalNotes: 'new note' }), true);
});

test('isFinalizedContentEdit does not reject a finalized report when nothing would actually change (idempotent resend)', () => {
  const current = { status: 'finalized', content: '# Same', additionalNotes: 'same note' };
  assert.equal(
    isFinalizedContentEdit(current, { content: '# Same', additionalNotes: 'same note' }),
    false
  );
});

test('isFinalizedContentEdit ignores fields other than content/additionalNotes (e.g. clientId) on a finalized report', () => {
  const current = { status: 'finalized', content: '# Content', additionalNotes: '' };
  assert.equal(isFinalizedContentEdit(current, { clientId: 'some-other-client' }), false);
});

test('isFinalizedContentEdit does not reject a content change on a draft report (no regression)', () => {
  const current = { status: 'draft', content: '# Old content', additionalNotes: '' };
  assert.equal(isFinalizedContentEdit(current, { content: '# New content' }), false);
});

test('isFinalizedContentEdit only guards the canonical "finalized" status, not the legacy reviewed states -- those keep the pre-existing reopen-on-edit behavior', () => {
  for (const legacyStatus of ['approved', 'completed']) {
    const current = { status: legacyStatus, content: '# Old content', additionalNotes: '' };
    assert.equal(
      isFinalizedContentEdit(current, { content: '# New content' }),
      false,
      `expected legacy status "${legacyStatus}" to be unaffected by the new guard`
    );
    assert.equal(isReviewed(legacyStatus), true, 'sanity check: still treated as reviewed elsewhere');
  }
});

test('isFinalizedContentEdit cannot be bypassed by a client-supplied "status" field -- only the current persisted status is read', () => {
  const current = { status: 'finalized', content: '# Old content', additionalNotes: '' };
  // A manipulated payload claiming the report is a draft must not matter --
  // PUT /:id never reads req.body.status in the first place (see the
  // "'status' is intentionally excluded" comment just below this check in
  // reports.js), and this predicate only ever looks at `currentReport`,
  // which the route always loads from Firestore itself.
  assert.equal(
    isFinalizedContentEdit(current, { content: '# New content', status: 'draft' }),
    true
  );
});

// --- POST /:id/photos/regenerate (photoJobService.regenerateFromPhotoReview) ---

test('REGENERATABLE_STATUSES no longer includes "finalized" (that case is now a dedicated, more specific rejection -- see below) but still includes "draft" (no regression)', () => {
  const { REGENERATABLE_STATUSES } = require('../services/photoJobService');
  assert.equal(REGENERATABLE_STATUSES.has('finalized'), false);
  assert.equal(REGENERATABLE_STATUSES.has('draft'), true);
});

test('regenerateFromPhotoReview rejects a finalized report with the same clear message PUT /:id uses, before any AI/regeneration work starts', async (t) => {
  const firebaseConfigPath = require.resolve('../config/firebase');
  const photoJobServicePath = require.resolve('../services/photoJobService');
  t.after(() => {
    delete require.cache[firebaseConfigPath];
    delete require.cache[photoJobServicePath];
  });

  const reportsById = {
    'finalized-report': {
      userId: 'uid-1',
      status: 'finalized',
      photos: [{ id: 'p1' }],
      regenerating: false,
    },
  };
  const fakeDb = {
    collection: () => ({ doc: (id) => ({ id }) }),
    runTransaction: async (cb) => {
      const tx = {
        get: async (ref) => {
          const data = reportsById[ref.id];
          return { exists: !!data, data: () => data };
        },
        update: (ref, patch) => Object.assign(reportsById[ref.id], patch),
      };
      return cb(tx);
    },
  };

  delete require.cache[firebaseConfigPath];
  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath,
    filename: firebaseConfigPath,
    loaded: true,
    exports: { getFirestore: () => fakeDb, FieldValue: {} },
  };
  delete require.cache[photoJobServicePath];
  const { regenerateFromPhotoReview } = require('../services/photoJobService');

  const result = await regenerateFromPhotoReview('finalized-report', 'uid-1', 'user@example.com');

  assert.equal(result.success, false);
  assert.equal(result.code, 'REPORT_FINALIZED');
  assert.equal(result.error, 'Finalized reports cannot be edited.');
  // The rejection happens inside the transaction before any content
  // regeneration -- the persisted report's content/status must be untouched.
  assert.equal(reportsById['finalized-report'].status, 'finalized');
  assert.equal(reportsById['finalized-report'].regenerating, false);
});
