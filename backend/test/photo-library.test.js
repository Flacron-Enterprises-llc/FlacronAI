const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidSort,
  isValidInclusionState,
  computeAnalysisStatus,
  toLibraryEntry,
  matchesFilters,
  sortEntries,
  encodeCursor,
  decodeCursor,
  clampLimit,
  paginate,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} = require('../utils/photoLibrary');

test('isValidSort/isValidInclusionState accept only their known enums', () => {
  assert.equal(isValidSort('newest'), true);
  assert.equal(isValidSort('oldest'), true);
  assert.equal(isValidSort('claim'), true);
  assert.equal(isValidSort('category'), true);
  assert.equal(isValidSort('random'), false);
  assert.equal(isValidSort(undefined), false);
  assert.equal(isValidInclusionState('included'), true);
  assert.equal(isValidInclusionState('excluded'), true);
  assert.equal(isValidInclusionState('pending'), false);
});

test('computeAnalysisStatus: legacy/non-reviewable is always "unavailable", regardless of any stray fields', () => {
  assert.equal(computeAnalysisStatus({ reviewable: false, analysis: { location: 'Roof' } }), 'unavailable');
});

test('computeAnalysisStatus: queued/analyzing/needs_attention pass through, completed requires real analysis, else unavailable', () => {
  assert.equal(computeAnalysisStatus({ reviewable: true, analysisStatus: 'queued', analysis: null }), 'queued');
  assert.equal(computeAnalysisStatus({ reviewable: true, analysisStatus: 'analyzing', analysis: null }), 'analyzing');
  assert.equal(computeAnalysisStatus({ reviewable: true, analysisStatus: 'needs_attention', analysis: null }), 'needs_attention');
  assert.equal(computeAnalysisStatus({ reviewable: true, analysisStatus: null, analysis: { location: 'Roof' } }), 'completed');
  assert.equal(computeAnalysisStatus({ reviewable: true, analysisStatus: null, analysis: null }), 'unavailable');
});

test('toLibraryEntry never carries a raw Storage path and passes canReview through as given by the route', () => {
  const report = {
    claimNumber: 'CLM-1', insuredName: 'Jane Doe', propertyAddress: '1 Main St', status: 'draft', createdAt: '2026-01-01T00:00:00.000Z',
  };
  const photo = {
    id: 'p1', fileName: 'a.jpg', hasThumbnail: true, uploadedAt: '2026-01-02T00:00:00.000Z', reviewable: true,
    analysisStatus: null, analysis: { location: 'Roof', category: 'Roofing', severity: 'Minor', observation: 'Appears fine', confidence: 'High' },
    review: { status: 'approved' },
    objectPath: 'users/u/reports/r/1.jpg', thumbnailPath: 'users/u/reports/r/1-thumb.jpg', originalPath: 'users/u/reports/r/1-orig.jpg',
  };
  const ownerEntry = toLibraryEntry(report, 'report-1', photo, 'owner', true);
  assert.equal(ownerEntry.objectPath, undefined);
  assert.equal(ownerEntry.thumbnailPath, undefined);
  assert.equal(ownerEntry.originalPath, undefined);
  assert.equal(ownerEntry.canReview, true);
  assert.equal(ownerEntry.analysisStatus, 'completed');
  assert.equal(ownerEntry.claimNumber, 'CLM-1');

  // A restricted-role OWNER (e.g. an Inspector lacking canEditReports) must
  // stay read-only -- canReview is never derived from myPermission alone.
  const restrictedOwnerEntry = toLibraryEntry(report, 'report-1', photo, 'owner', false);
  assert.equal(restrictedOwnerEntry.canReview, false);

  const viewEntry = toLibraryEntry(report, 'report-1', photo, 'view', false);
  assert.equal(viewEntry.canReview, false);
  const reviewEntry = toLibraryEntry(report, 'report-1', photo, 'review', true);
  assert.equal(reviewEntry.canReview, true);
  const commentEntry = toLibraryEntry(report, 'report-1', photo, 'comment', false);
  assert.equal(commentEntry.canReview, false);
});

test('matchesFilters: claim is a case-insensitive substring match', () => {
  const entry = { claimNumber: 'CLM-2026-001' };
  assert.equal(matchesFilters(entry, { claim: 'clm-2026' }), true);
  assert.equal(matchesFilters(entry, { claim: 'CLM-2026' }), true);
  assert.equal(matchesFilters(entry, { claim: 'nope' }), false);
});

test('matchesFilters: location/category are exact matches, not substrings', () => {
  const entry = { location: 'Interior - Kitchen', category: 'Water Damage' };
  assert.equal(matchesFilters(entry, { location: 'Interior - Kitchen' }), true);
  assert.equal(matchesFilters(entry, { location: 'Interior' }), false);
  assert.equal(matchesFilters(entry, { category: 'Water Damage' }), true);
  assert.equal(matchesFilters(entry, { category: 'Water' }), false);
});

test('matchesFilters: analysisStatus filter matches the pre-computed status exactly', () => {
  const entry = { analysisStatus: 'completed' };
  assert.equal(matchesFilters(entry, { analysisStatus: 'completed' }), true);
  assert.equal(matchesFilters(entry, { analysisStatus: 'queued' }), false);
});

test('matchesFilters: inclusion state reflects review.status === "excluded", not any other review status', () => {
  const excluded = { review: { status: 'excluded' } };
  const approved = { review: { status: 'approved' } };
  const noReview = { review: null };
  assert.equal(matchesFilters(excluded, { inclusion: 'excluded' }), true);
  assert.equal(matchesFilters(excluded, { inclusion: 'included' }), false);
  assert.equal(matchesFilters(approved, { inclusion: 'included' }), true);
  assert.equal(matchesFilters(approved, { inclusion: 'excluded' }), false);
  assert.equal(matchesFilters(noReview, { inclusion: 'included' }), true);
  assert.equal(matchesFilters(noReview, { inclusion: 'excluded' }), false);
});

test('matchesFilters: date range is inclusive on both ends and rejects entries with no uploadedAt', () => {
  const entry = { uploadedAt: '2026-06-15T00:00:00.000Z' };
  assert.equal(matchesFilters(entry, { dateFrom: '2026-06-15T00:00:00.000Z' }), true);
  assert.equal(matchesFilters(entry, { dateTo: '2026-06-15T00:00:00.000Z' }), true);
  assert.equal(matchesFilters(entry, { dateFrom: '2026-06-16T00:00:00.000Z' }), false);
  assert.equal(matchesFilters(entry, { dateTo: '2026-06-14T00:00:00.000Z' }), false);
  assert.equal(matchesFilters({ uploadedAt: null }, { dateFrom: '2026-01-01' }), false);
});

test('matchesFilters: search matches fileName, claim/insured/address, location/category, and either observation field', () => {
  const base = { fileName: 'roof1.jpg', claimNumber: 'CLM-9', insuredName: 'Jane Doe', propertyAddress: '1 Main St', location: 'Roof', category: 'Roofing', observation: 'Shingles appear worn', review: { observation: null } };
  assert.equal(matchesFilters(base, { search: 'roof1' }), true);
  assert.equal(matchesFilters(base, { search: 'jane' }), true);
  assert.equal(matchesFilters(base, { search: 'main st' }), true);
  assert.equal(matchesFilters(base, { search: 'shingles' }), true);
  assert.equal(matchesFilters(base, { search: 'nonexistent' }), false);
  const edited = { ...base, review: { observation: 'a distinctive edited phrase' } };
  assert.equal(matchesFilters(edited, { search: 'distinctive edited' }), true);
});

test('sortEntries: newest/oldest by uploadedAt, claim/category alphabetical, case-insensitive', () => {
  const entries = [
    { uploadedAt: '2026-01-01T00:00:00.000Z', claimNumber: 'B', category: 'zebra' },
    { uploadedAt: '2026-03-01T00:00:00.000Z', claimNumber: 'a', category: 'Apple' },
  ];
  assert.deepEqual(sortEntries(entries, 'newest').map((e) => e.claimNumber), ['a', 'B']);
  assert.deepEqual(sortEntries(entries, 'oldest').map((e) => e.claimNumber), ['B', 'a']);
  assert.deepEqual(sortEntries(entries, 'claim').map((e) => e.claimNumber), ['a', 'B']);
  assert.deepEqual(sortEntries(entries, 'category').map((e) => e.category), ['Apple', 'zebra']);
});

test('encodeCursor/decodeCursor round-trip; invalid/missing tokens decode to offset 0', () => {
  assert.equal(decodeCursor(encodeCursor(42)), 42);
  assert.equal(decodeCursor(null), 0);
  assert.equal(decodeCursor(undefined), 0);
  assert.equal(decodeCursor('not-valid-base64-!!'), 0);
  assert.equal(decodeCursor(encodeCursor(0)), 0);
});

test('clampLimit: defaults, clamps to MAX_PAGE_SIZE, rejects non-positive/non-numeric', () => {
  assert.equal(clampLimit(undefined), DEFAULT_PAGE_SIZE);
  assert.equal(clampLimit('abc'), DEFAULT_PAGE_SIZE);
  assert.equal(clampLimit(0), DEFAULT_PAGE_SIZE);
  assert.equal(clampLimit(-5), DEFAULT_PAGE_SIZE);
  assert.equal(clampLimit(10), 10);
  assert.equal(clampLimit(9999), MAX_PAGE_SIZE);
});

test('paginate: slices correctly and returns a null nextCursor only when exhausted', () => {
  const entries = Array.from({ length: 25 }, (_, i) => ({ id: i }));
  const p1 = paginate(entries, null, 10);
  assert.equal(p1.page.length, 10);
  assert.equal(p1.page[0].id, 0);
  assert.equal(p1.totalCount, 25);
  assert.notEqual(p1.nextCursor, null);

  const p2 = paginate(entries, p1.nextCursor, 10);
  assert.equal(p2.page[0].id, 10);
  assert.notEqual(p2.nextCursor, null);

  const p3 = paginate(entries, p2.nextCursor, 10);
  assert.equal(p3.page.length, 5);
  assert.equal(p3.page[0].id, 20);
  assert.equal(p3.nextCursor, null);
});

test('paginate: an empty result set returns an empty page and a null cursor, not an error', () => {
  const p = paginate([], null, 10);
  assert.deepEqual(p.page, []);
  assert.equal(p.nextCursor, null);
  assert.equal(p.totalCount, 0);
});
