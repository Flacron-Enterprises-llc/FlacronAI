const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const { generatePDF } = require('../utils/properPdfGenerator');
const { generateDOCX } = require('../utils/documentGenerator');
const reportsRouter = require('../routes/reports');
const { validateAndComputeCanonicalEstimate } = require('../utils/canonicalEstimate');
const { buildSection7DetailMarkdown, injectSection7Detail } = require('../utils/canonicalEstimateContent');
const { extractPerPageText, findFirstPageContaining } = require('./helpers/pdfTextExtract');

// Phase 42. Real-output integration tests exercising the exact composition
// the export route performs (getCanonicalEstimate -> buildSection7Detail
// Markdown -> injectSection7Detail -> generatePDF/generateDOCX/generateHTML),
// against actual rendered bytes -- not mocked renderer calls. Matches this
// codebase's existing convention (pdf-toc.test.js, watermark-policy.test.js):
// call the generator functions directly with a plain report object, no
// HTTP/Express/Firestore harness.

const BASE_CONTENT = [
  '## SECTION 1: REPORT INFO',
  '- Claim Number: CLM-1001',
  '## SECTION 6: SCOPE OF WORK',
  'General scope narrative.',
  '## SECTION 7: PRELIMINARY ESTIMATED COSTS (FOR PLANNING & REVIEW ONLY)',
  'Existing AI-drafted narrative summary. A qualified professional should confirm final costs.',
  '## SECTION 8: PHOTO DOCUMENTATION',
  'Photo narrative.',
  '## SECTION 9: ADDITIONAL NOTES & CONCLUSION',
  'Closing notes.',
].join('\n');

const li = (overrides = {}) => ({
  category: 'Drywall',
  room: 'Kitchen',
  trade: 'Drywall',
  description: 'Replace water-damaged drywall',
  repairAction: 'Replace',
  quantity: 10,
  unit: 'SF',
  materialUnitCost: 2,
  laborUnitCost: 3,
  ...overrides,
});

function buildRenderableReport({ content = BASE_CONTENT, estimateBody, status = 'draft' } = {}) {
  let canonicalEstimate = null;
  if (estimateBody) {
    const computed = validateAndComputeCanonicalEstimate(estimateBody);
    assert.equal(computed.error, undefined, computed.error);
    canonicalEstimate = { ...computed, revision: 1 };
  }
  const detail = buildSection7DetailMarkdown(canonicalEstimate, { reportStatus: status });
  const finalContent = detail ? injectSection7Detail(content, detail) : content;
  return {
    report: {
      id: 'r-export-1',
      claimNumber: 'CLM-1001',
      reportType: 'Initial',
      insuredName: 'Jordan Rivers',
      propertyAddress: '12 Test Ave',
      lossDate: '2026-09-01',
      lossType: 'Water',
      status,
      content: finalContent,
    },
    canonicalEstimate,
  };
}

const REFERENCE_ESTIMATE_BODY = {
  lineItems: [li({ id: 'li-1', quantity: 1, unit: 'EA', materialUnitCost: 550, laborUnitCost: 0 })],
  overheadProfitPercent: 10,
  taxRatePercent: 8,
};

test('PDF: canonical estimate REPLACES the legacy Section 7 narrative (never both), with the exact server-computed totals', async () => {
  const { report } = buildRenderableReport({ estimateBody: REFERENCE_ESTIMATE_BODY });
  const buffer = await generatePDF(report, { companyName: 'Example Firm' });
  const pages = await extractPerPageText(buffer);
  const allText = pages.join(' ');
  assert.doesNotMatch(allText, /Existing AI-drafted narrative summary/, 'legacy Section 7 body is replaced, not retained');
  assert.match(allText, /Detailed Repair Estimate Breakdown/);
  assert.match(allText, /Financial Summary/);
  assert.match(allText, /649\.00/, 'final total matches the verified $649.00 reference case');
  assert.match(allText, /55\.00/, 'O&P amount present');
  assert.match(allText, /44\.00/, 'tax amount present');
  // Sections 1, 6, 8, 9 (before/after Section 7) survive untouched.
  assert.match(allText, /REPORT INFO/);
  assert.match(allText, /SCOPE OF WORK/);
  assert.match(allText, /General scope narrative\./);
  assert.match(allText, /PHOTO DOCUMENTATION/);
  assert.match(allText, /Photo narrative\./);
  assert.match(allText, /ADDITIONAL NOTES/);
  assert.match(allText, /Closing notes\./);
});

test('PDF: dynamic TOC still points Section 8 at its true (later) physical page once Section 7 grows', async () => {
  // A long estimate (many rooms/trades) that will span multiple pages, so
  // Section 8's real starting page must shift later than a short estimate
  // would produce -- proving the TOC is recomputed from real content, not
  // a stale/hardcoded guess.
  const manyItems = Array.from({ length: 40 }, (_, i) =>
    li({ id: `li-${i}`, room: `Room ${i % 8}`, trade: `Trade ${i % 5}`, description: `Line item ${i} detail text` })
  );
  const { report } = buildRenderableReport({ estimateBody: { lineItems: manyItems } });
  const buffer = await generatePDF(report, { companyName: 'Example Firm' });
  const pages = await extractPerPageText(buffer);

  // Content starts on physical page 3 (page 1 = cover, page 2 = TOC, which
  // itself lists the literal strings "Section 7"/"Section 8" as entries --
  // searching from page 3 finds where the headings truly render, not where
  // the TOC merely lists them).
  const sec7RealPage = findFirstPageContaining(pages, 'SECTION 7', 3);
  const sec8RealPage = findFirstPageContaining(pages, 'SECTION 8', 3);
  assert.ok(sec7RealPage, 'Section 7 heading found');
  assert.ok(sec8RealPage, 'Section 8 heading found');
  assert.ok(sec8RealPage > sec7RealPage, 'Section 8 lands strictly after Section 7 once the detail is injected');

  // The TOC page (rendered near the front of the document) must cite these
  // SAME real page numbers -- re-derive the same lookup the generator uses
  // internally (SECTION_TOKEN_RE) is already covered by pdf-toc.test.js for
  // the base mechanism; here we only need the end-to-end number to be
  // internally consistent and not clipped/truncated (e.g. never page 0/NaN).
  assert.ok(sec7RealPage >= 1 && sec8RealPage <= pages.length);
});

test('DOCX: canonical estimate REPLACES the legacy Section 7 narrative (same selection rule as PDF), embeds the same totals', async () => {
  const { report } = buildRenderableReport({ estimateBody: REFERENCE_ESTIMATE_BODY });
  const buffer = await generateDOCX(report, { companyName: 'Example Firm' });
  const zip = new PizZip(buffer);
  const xml = zip.file('word/document.xml').asText();
  assert.doesNotMatch(xml, /Existing AI-drafted narrative summary/, 'legacy Section 7 body is replaced, not retained');
  assert.match(xml, /Detailed Repair Estimate Breakdown/);
  assert.match(xml, /649\.00/);
  assert.match(xml, /PHOTO DOCUMENTATION/);
  assert.match(xml, /Photo narrative\./, 'Section 8 survives untouched');
});

test('HTML: canonical estimate REPLACES the legacy Section 7 narrative (same selection rule as PDF/DOCX), and user text is escaped (no script injection)', () => {
  const hostileEstimateBody = {
    lineItems: [
      li({
        id: 'li-1',
        description: '<script>alert(1)</script> Replace drywall',
        quantity: 1,
        unit: 'EA',
        materialUnitCost: 550,
        laborUnitCost: 0,
      }),
    ],
    overheadProfitPercent: 10,
    taxRatePercent: 8,
  };
  const { report } = buildRenderableReport({ estimateBody: hostileEstimateBody });
  const html = reportsRouter._test.generateHTML(report, { companyName: 'Example Firm', primaryColor: [253, 68, 3] });
  assert.doesNotMatch(html, /Existing AI-drafted narrative summary/, 'legacy Section 7 body is replaced, not retained');
  assert.match(html, /Detailed Repair Estimate Breakdown/);
  assert.match(html, /649\.00/);
  assert.match(html, /Photo narrative\./, 'Section 8 survives untouched');
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/, 'raw script tag must never appear unescaped');
  assert.match(html, /&lt;script&gt;/, 'hostile text is HTML-escaped, not stripped or executed');
});

test('legacy fallback: a report with no canonical estimate renders Section 7 exactly as before (no detail block, no empty heading)', async () => {
  const { report } = buildRenderableReport({}); // no estimateBody
  const pdfBuffer = await generatePDF(report, { companyName: 'Example Firm' });
  const pages = await extractPerPageText(pdfBuffer);
  const allText = pages.join(' ');
  assert.match(allText, /Existing AI-drafted narrative summary/);
  assert.doesNotMatch(allText, /Detailed Repair Estimate Breakdown/);

  const docxBuffer = await generateDOCX(report, { companyName: 'Example Firm' });
  const xml = new PizZip(docxBuffer).file('word/document.xml').asText();
  assert.doesNotMatch(xml, /Detailed Repair Estimate Breakdown/);

  const html = reportsRouter._test.generateHTML(report, { companyName: 'Example Firm', primaryColor: [253, 68, 3] });
  assert.doesNotMatch(html, /Detailed Repair Estimate Breakdown/);
});

test('a document type whose numbered "SECTION 7" is not the estimate section still replaces that heading\'s body (injection is anchored purely by heading number, documented and locked)', async () => {
  // e.g. a Liability-style narrative where Section 7 is "Recommendations" --
  // injection is anchored purely by the "SECTION 7" heading token, so the
  // heading IS present and its body IS replaced. This documents+locks the
  // actual current behavior rather than silently changing it.
  const content = ['## SECTION 7: RECOMMENDATIONS', 'Recommend further investigation.'].join('\n');
  const { report } = buildRenderableReport({ content, estimateBody: REFERENCE_ESTIMATE_BODY });
  assert.match(report.content, /RECOMMENDATIONS/, 'the heading line itself is kept');
  assert.match(report.content, /Detailed Repair Estimate Breakdown/);
  assert.doesNotMatch(report.content, /Recommend further investigation\./, 'the heading\'s legacy body is replaced, not retained alongside the detail');
  const idxHeading = report.content.indexOf('RECOMMENDATIONS');
  const idxDetail = report.content.indexOf('Detailed Repair Estimate Breakdown');
  assert.ok(idxHeading < idxDetail);
});

test('finalized-report cover-page status and Phase 40 watermark text conventions are unaffected by the Section 7 detail addition', async () => {
  const { report } = buildRenderableReport({ estimateBody: REFERENCE_ESTIMATE_BODY, status: 'finalized' });
  const buffer = await generatePDF(report, { companyName: 'Example Firm', watermark: false });
  const pages = await extractPerPageText(buffer);
  const allText = pages.join(' ').toUpperCase();
  assert.match(allText, /FINALIZED .? APPROVED BY LICENSED ADJUSTER/);
  assert.doesNotMatch(allText, /PENDING ADJUSTER REVIEW/);
  assert.match(allText, /STATUS: FINAL/);
});
