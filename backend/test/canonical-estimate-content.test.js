const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSection7DetailMarkdown,
  injectSection7Detail,
  sanitizeForMarkdown,
  formatMoney,
} = require('../utils/canonicalEstimateContent');
const { validateAndComputeCanonicalEstimate } = require('../utils/canonicalEstimate');

// Phase 42. Pure unit tests for the Section 7 markdown builder + injector --
// no Firestore, no PDF/DOCX/HTML rendering (see canonical-estimate-export
// .test.js for real rendered-output coverage). These focus on: empty/legacy
// no-op, grouping, financial-summary reconciliation with Phase 41's own
// totals, the $550/$55/$44/$649 regression case surfacing correctly in the
// rendered summary, and markdown-structure-safety sanitization.

const li = (overrides = {}) => ({
  category: 'Drywall',
  room: 'Living Room',
  description: 'Replace water-damaged drywall',
  quantity: 10,
  unit: 'SF',
  materialUnitCost: 2,
  laborUnitCost: 3,
  ...overrides,
});

const computeEstimate = (body) => {
  const result = validateAndComputeCanonicalEstimate(body);
  assert.equal(result.error, undefined, result.error);
  return { ...result, revision: 1 };
};

test('empty/legacy estimate produces no detail markdown (no-op)', () => {
  assert.equal(buildSection7DetailMarkdown(null), '');
  assert.equal(buildSection7DetailMarkdown({ lineItems: [] }), '');
});

test('injectSection7Detail is a no-op with no detail markdown, or no Section 7 heading present', () => {
  const content = '## SECTION 6: SCOPE OF WORK\nSome text\n## SECTION 8: PHOTOS';
  assert.equal(injectSection7Detail(content, ''), content);
  assert.equal(injectSection7Detail('## SECTION 6: X\ntext', 'detail'), '## SECTION 6: X\ntext');
});

// 2026-09-18 correction (CHECK 1): canonical detail REPLACES the legacy
// Section 7 body -- a report must never render both the old AI-narrative
// estimate summary and the new structured breakdown at once.
const SAMPLE_CONTENT_1_9 = [
  '## SECTION 1: REPORT INFO',
  '- Claim Number: CLM-1',
  '## SECTION 6: SCOPE OF WORK',
  'Scope text',
  '## SECTION 7: PRELIMINARY ESTIMATED COSTS (FOR PLANNING & REVIEW ONLY)',
  'Existing AI narrative summary stays exactly as-is.',
  '## SECTION 8: PHOTO DOCUMENTATION',
  'Photos here',
  '## SECTION 9: ADDITIONAL NOTES & CONCLUSION',
  'Closing notes.',
].join('\n');

test('injectSection7Detail REPLACES the legacy Section 7 body with the canonical detail, never both at once', () => {
  const out = injectSection7Detail(SAMPLE_CONTENT_1_9, '### Detailed Repair Estimate Breakdown\nDetail body');
  const lines = out.split('\n');
  const sec7 = lines.findIndex((l) => l.includes('SECTION 7'));
  const detailIdx = lines.findIndex((l) => l.includes('Detailed Repair Estimate Breakdown'));
  const sec8 = lines.findIndex((l) => l.includes('SECTION 8'));
  assert.ok(sec7 < detailIdx && detailIdx < sec8, 'detail lands between the Section 7 heading and Section 8');
  // 1) canonical data replaces the legacy Section 7 body.
  assert.match(out, /Detail body/);
  // 2) the old Section 7 narrative text is absent from the output.
  assert.doesNotMatch(out, /Existing AI narrative summary stays exactly as-is\./);
});

test('injectSection7Detail preserves Section 1-6 and Section 8-9 completely untouched (only Section 7 body is replaced)', () => {
  const out = injectSection7Detail(SAMPLE_CONTENT_1_9, '### Detail\nBody');
  assert.match(out, /## SECTION 1: REPORT INFO\n- Claim Number: CLM-1/, 'Section 1 untouched');
  assert.match(out, /## SECTION 6: SCOPE OF WORK\nScope text/, 'Section 6 untouched');
  assert.match(out, /## SECTION 8: PHOTO DOCUMENTATION\nPhotos here/, '3) Section 8 remains intact');
  assert.match(out, /## SECTION 9: ADDITIONAL NOTES & CONCLUSION\nClosing notes\./, 'Section 9 remains intact');
});

test('injectSection7Detail does not mutate its input string (the in-memory export transformation is never persisted back)', () => {
  const before = SAMPLE_CONTENT_1_9;
  const snapshot = String(before);
  injectSection7Detail(before, '### Detail\nBody');
  assert.equal(before, snapshot, 'the original content string is untouched -- callers must re-assign the return value, never mutate in place');
});

test('4) a legacy-only report (no canonical estimate, detailMarkdown === "") is byte-identical to its input', () => {
  assert.equal(injectSection7Detail(SAMPLE_CONTENT_1_9, ''), SAMPLE_CONTENT_1_9);
});

test('injectSection7Detail replaces at the end when Section 7 is the last section (no Section 8+ to preserve)', () => {
  const content = '## SECTION 7: PRELIMINARY ESTIMATED COSTS\nSummary text';
  const out = injectSection7Detail(content, '### Detail\nBody');
  assert.match(out, /### Detail[\s\S]*Body/);
  assert.doesNotMatch(out, /Summary text/, 'the legacy summary is replaced, not retained, even when Section 7 is the final section');
});

test("injectSection7Detail never mistakes its own '### ' sub-headings for a new top-level section", () => {
  const content = '## SECTION 7: X\nSummary\n## SECTION 8: Y\nTail';
  const detail = '### Area: Kitchen\nSome line\n### Area: Bathroom\nAnother line';
  const out = injectSection7Detail(content, detail);
  const lines = out.split('\n');
  const sec8 = lines.findIndex((l) => l.includes('SECTION 8'));
  const bathroom = lines.findIndex((l) => l.includes('Area: Bathroom'));
  assert.ok(bathroom < sec8, 'a ### sub-heading inside the detail is not treated as ending Section 7');
});

test('detail markdown groups by room then trade, and shows metadata lines', () => {
  const estimate = computeEstimate({
    lineItems: [
      li({ id: 'li-1', trade: 'Drywall', room: 'Kitchen' }),
      li({ id: 'li-2', trade: 'Plumbing', room: 'Kitchen', category: 'Plumbing' }),
      li({ id: 'li-3', trade: 'Flooring', room: 'Bathroom', category: 'Flooring' }),
    ],
  });
  const md = buildSection7DetailMarkdown(estimate, { reportStatus: 'draft' });
  assert.match(md, /### Area: Kitchen/);
  assert.match(md, /### Area: Bathroom/);
  assert.match(md, /Trade \/ Category: Drywall/);
  assert.match(md, /Trade \/ Category: Plumbing/);
  assert.match(md, /Status: Preliminary \/ Editable/);
  assert.match(md, /Pricing Source: Manually entered by preparer/);
});

test('detail markdown shows "Status: Final — Approved" once the parent report is reviewed', () => {
  const estimate = computeEstimate({ lineItems: [li({ id: 'li-1' })] });
  const md = buildSection7DetailMarkdown(estimate, { reportStatus: 'finalized' });
  assert.match(md, /Status: Final — Approved/);
});

test('financial summary in the rendered markdown exactly matches the $550/$55/$44/$649 verified reference case', () => {
  const estimate = computeEstimate({
    lineItems: [li({ id: 'li-1', quantity: 1, unit: 'EA', materialUnitCost: 550, laborUnitCost: 0 })],
    overheadProfitPercent: 10,
    taxRatePercent: 8,
  });
  const md = buildSection7DetailMarkdown(estimate, { reportStatus: 'draft' });
  assert.match(md, /\| Line-Item Subtotal \| \$550\.00 \|/);
  assert.match(md, /\| Overhead & Profit \(10%\) \| \$55\.00 \|/);
  assert.match(md, /\| Taxable Basis \(excludes Overhead & Profit\) \| \$550\.00 \|/);
  assert.match(md, /\| Tax \(8%\) \| \$44\.00 \|/);
  assert.match(md, /\| Total Estimate \| \$649\.00 \|/);
});

test('a manipulated/client-supplied totals object cannot influence the rendered summary -- only the server-recomputed `totals` on the estimate object is ever read', () => {
  const estimate = computeEstimate({ lineItems: [li({ id: 'li-1', quantity: 1, materialUnitCost: 10, laborUnitCost: 0 })] });
  estimate.attackerSuppliedGrandTotal = 999999999; // not a real field the builder reads
  const md = buildSection7DetailMarkdown(estimate, {});
  assert.match(md, /\| Total Estimate \| \$10\.00 \|/);
  assert.doesNotMatch(md, /999999999|9,999,999\.99/);
});

test('sanitizeForMarkdown neutralizes pipes and newlines so a hostile description cannot corrupt table structure', () => {
  assert.equal(sanitizeForMarkdown('Drywall | extra | columns'), 'Drywall / extra / columns');
  assert.equal(sanitizeForMarkdown('line one\nline two\r\nline three'), 'line one line two line three');
  assert.equal(sanitizeForMarkdown('  padded  '), 'padded');
});

test('a hostile description containing markdown-table/heading control characters renders as a single, well-formed table row', () => {
  const estimate = computeEstimate({
    lineItems: [
      li({
        id: 'li-1',
        description: 'Fake row | ## SECTION 8: INJECTED\n**bold**',
        room: 'Kitchen',
        trade: 'Drywall',
      }),
    ],
  });
  const md = buildSection7DetailMarkdown(estimate, {});
  // The hostile text must never introduce a real "## SECTION 8" heading line,
  // nor extra pipe-delimited columns.
  const lines = md.split('\n');
  assert.ok(!lines.some((l) => /^##\s*SECTION\s+8/i.test(l.trim())), 'no injected heading line');
  const tableLine = lines.find((l) => l.includes('Fake row'));
  assert.ok(tableLine, 'the row still renders');
  assert.equal((tableLine.match(/\|/g) || []).length, 6, 'exactly 5 columns (6 pipes) survive, no extra column from the embedded "|"');
});

test('long descriptions and a large number of line items across multiple areas/trades render without throwing', () => {
  const lineItems = Array.from({ length: 60 }, (_, i) =>
    li({
      id: `li-${i}`,
      room: `Room ${i % 6}`,
      trade: `Trade ${i % 4}`,
      description: `Line item ${i} — ${'x'.repeat(200)}`,
    })
  );
  const estimate = computeEstimate({ lineItems });
  const md = buildSection7DetailMarkdown(estimate, {});
  assert.ok(md.length > 0);
  assert.match(md, /Room 5/);
  assert.match(md, /Trade 3/);
});

test('formatMoney renders a locale currency string from integer cents', () => {
  assert.equal(formatMoney(64900, 'USD'), '$649.00');
  assert.equal(formatMoney(0, 'USD'), '$0.00');
});
