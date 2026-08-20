const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeImageAnalysis } = require('../services/photoJobService');
const { buildEffectiveImageAnalysis, insertPhotoObservations } = require('../services/aiService');

// Phase 7 (Async Photo Analysis Pipeline): when a user retries analysis for
// just the photos previously stuck in 'needs_attention', the fresh (partial)
// result must be MERGED with whatever already succeeded on the first run --
// never silently replace it (that would discard real findings). These tests
// exercise mergeImageAnalysis directly, no Firestore/network involved.

const analysis = (overrides = {}) => ({
  summary: 'ok', severity: 'Minor', totalImagesAnalyzed: 5,
  damages: [{ area: 'Kitchen', type: 'Water damage', severity: 'Minor', description: 'x' }],
  photos: [{ location: 'Kitchen', category: 'Water Damage', severity: 'Minor', observation: 'x', confidence: 'High' }],
  itemsForProfessionalReview: ['Check subfloor'],
  documentationNotes: 'clear photos',
  imagesSkipped: 0, imagesFailed: 0,
  ...overrides,
});

test('merges two results: sums counts, concatenates damages/photos, dedupes review items', () => {
  const existing = analysis({ totalImagesAnalyzed: 15, itemsForProfessionalReview: ['Check subfloor', 'Confirm mold'] });
  const fresh = analysis({ totalImagesAnalyzed: 5, itemsForProfessionalReview: ['Confirm mold', 'Check roof'] });
  const merged = mergeImageAnalysis(existing, fresh);

  assert.equal(merged.totalImagesAnalyzed, 20);
  assert.equal(merged.damages.length, 2, 'damages from both results are concatenated, not replaced');
  assert.equal(merged.photos.length, 2, 'raw per-photo classifications from both results are concatenated too');
  assert.deepEqual(merged.itemsForProfessionalReview.sort(), ['Check roof', 'Check subfloor', 'Confirm mold'].sort(), 'review items are deduped across both results');
});

test('escalates to the worse severity of the two results', () => {
  const existing = analysis({ severity: 'Minor' });
  const fresh = analysis({ severity: 'Severe' });
  assert.equal(mergeImageAnalysis(existing, fresh).severity, 'Severe');

  const existing2 = analysis({ severity: 'Severe' });
  const fresh2 = analysis({ severity: 'Minor' });
  assert.equal(mergeImageAnalysis(existing2, fresh2).severity, 'Severe', 'the existing (worse) severity is not downgraded by a milder retry result');
});

test('the fresh result\'s failure count supersedes the stale prior one', () => {
  const existing = analysis({ imagesFailed: 3 }); // the count BEFORE this retry
  const fresh = analysis({ imagesFailed: 0 }); // the retry succeeded this time
  assert.equal(mergeImageAnalysis(existing, fresh).imagesFailed, 0);
});

test('returns the other side unchanged when one input is null (first-run / no-existing-analysis cases)', () => {
  const fresh = analysis();
  assert.deepEqual(mergeImageAnalysis(null, fresh), fresh);
  assert.deepEqual(mergeImageAnalysis(fresh, null), fresh);
  assert.equal(mergeImageAnalysis(null, null), null);
});

test('combines summary and documentationNotes text from both results', () => {
  const existing = analysis({ summary: 'First batch looked fine.', documentationNotes: 'Good lighting.' });
  const fresh = analysis({ summary: 'Retried batch also fine.', documentationNotes: 'Some blur present.' });
  const merged = mergeImageAnalysis(existing, fresh);
  assert.match(merged.summary, /First batch looked fine\./);
  assert.match(merged.summary, /Retried batch also fine\./);
  assert.match(merged.documentationNotes, /Good lighting\./);
  assert.match(merged.documentationNotes, /Some blur present\./);
});

// Phase 8 (Per-Photo Analysis Review UI): buildEffectiveImageAnalysis is what
// turns a report's per-photo review state into generateReport()'s actual
// input -- these tests exercise it directly with plain data, no Firestore.

const photo = (overrides = {}) => ({
  id: 'p1',
  analysis: { location: 'Kitchen', category: 'Water Damage', severity: 'Moderate', observation: 'AI text', confidence: 'High' },
  review: { status: 'pending', observation: null, note: '', reviewedBy: null, reviewedAt: null },
  ...overrides,
});

test('buildEffectiveImageAnalysis: a pending (unreviewed) photo uses the AI\'s own observation', () => {
  const result = buildEffectiveImageAnalysis(null, [photo()]);
  assert.equal(result.damages.length, 1);
  assert.equal(result.damages[0].description, 'AI text');
  assert.equal(result.totalImagesAnalyzed, 1);
});

test('buildEffectiveImageAnalysis: an approved photo also uses the AI\'s own observation', () => {
  const result = buildEffectiveImageAnalysis(null, [photo({ review: { status: 'approved', observation: null, note: '', reviewedBy: 'u1', reviewedAt: 'now' } })]);
  assert.equal(result.damages[0].description, 'AI text');
});

test('buildEffectiveImageAnalysis: an edited photo uses the reviewer\'s replacement text, not the AI\'s', () => {
  const result = buildEffectiveImageAnalysis(null, [photo({ review: { status: 'edited', observation: 'Corrected human text', note: '', reviewedBy: 'u1', reviewedAt: 'now' } })]);
  assert.equal(result.damages[0].description, 'Corrected human text');
});

test('buildEffectiveImageAnalysis: an excluded photo is dropped entirely, not just its text blanked', () => {
  const photos = [
    photo({ id: 'p1' }),
    photo({ id: 'p2', review: { status: 'excluded', observation: null, note: '', reviewedBy: 'u1', reviewedAt: 'now' } }),
  ];
  const result = buildEffectiveImageAnalysis(null, photos);
  assert.equal(result.damages.length, 1);
  assert.equal(result.totalImagesAnalyzed, 1);
  assert.equal(result.excludedByReviewer, 1);
});

test('buildEffectiveImageAnalysis: a photo with no analysis yet (still queued/failed) is excluded from damages', () => {
  const photos = [photo({ id: 'p1' }), photo({ id: 'p2', analysis: null })];
  const result = buildEffectiveImageAnalysis(null, photos);
  assert.equal(result.damages.length, 1);
  assert.equal(result.totalImagesAnalyzed, 1);
});

test('buildEffectiveImageAnalysis: severity reflects the worst severity among ACTIVE (non-excluded) photos only', () => {
  const photos = [
    photo({ id: 'p1', analysis: { ...photo().analysis, severity: 'Minor' } }),
    photo({ id: 'p2', analysis: { ...photo().analysis, severity: 'Severe' }, review: { status: 'excluded', observation: null, note: '', reviewedBy: 'u1', reviewedAt: 'now' } }),
  ];
  const result = buildEffectiveImageAnalysis(null, photos);
  assert.equal(result.severity, 'Minor', 'the Severe photo was excluded, so it must not affect overall severity');
});

test('buildEffectiveImageAnalysis: preserves batch-level context (summary/itemsForProfessionalReview) from the base, but drops its raw `photos` list', () => {
  const base = { summary: 'batch summary', itemsForProfessionalReview: ['check X'], photos: [{ location: 'raw', category: 'raw', severity: 'Minor', observation: 'raw', confidence: 'Low' }] };
  const result = buildEffectiveImageAnalysis(base, [photo()]);
  assert.equal(result.summary, 'batch summary');
  assert.deepEqual(result.itemsForProfessionalReview, ['check X']);
  assert.equal(result.photos, undefined, 'the raw pre-review photos list must not leak into the effective analysis fed to generateReport');
});

// Phase 8: insertPhotoObservations is the DETERMINISTIC safety net that
// guarantees a reviewer's edit/exclusion is verbatim visible in the final
// report, independent of whether the LLM's own prose happens to quote it.

test('insertPhotoObservations: lists each active photo\'s exact description verbatim under Section 8', () => {
  const imageAnalysis = { damages: [{ area: 'Kitchen', type: 'Water Damage', severity: 'Moderate', description: 'Reviewer-edited text appears here verbatim.' }] };
  const content = '## SECTION 8: SUPPORTING DOCUMENTATION\nSome existing text.\n\n## SECTION 9: CONCLUSION\nEnd.';
  const result = insertPhotoObservations(content, imageAnalysis);
  assert.match(result, /Reviewer-edited text appears here verbatim\./);
  assert.match(result, /Kitchen/);
  assert.match(result, /Water Damage/);
});

test('insertPhotoObservations: an excluded photo (absent from damages) never appears', () => {
  const imageAnalysis = { damages: [{ area: 'Kitchen', type: 'Water Damage', severity: 'Moderate', description: 'Kept photo text.' }] };
  const content = '## SECTION 8: SUPPORTING DOCUMENTATION\nExisting.';
  const result = insertPhotoObservations(content, imageAnalysis);
  assert.match(result, /Kept photo text\./);
  assert.doesNotMatch(result, /Excluded photo text/);
});

test('insertPhotoObservations: a no-op when there are no active damages (e.g. everything excluded)', () => {
  const content = '## SECTION 8: SUPPORTING DOCUMENTATION\nExisting.';
  assert.equal(insertPhotoObservations(content, { damages: [] }), content);
  assert.equal(insertPhotoObservations(content, null), content);
});

test('insertPhotoObservations: appends at the end when Section 8 heading is missing (truncated content)', () => {
  const imageAnalysis = { damages: [{ area: 'Roof', type: 'Wind/Hail Damage', severity: 'Severe', description: 'Missing-shingles text.' }] };
  const result = insertPhotoObservations('some truncated content', imageAnalysis);
  assert.match(result, /Missing-shingles text\./);
});
