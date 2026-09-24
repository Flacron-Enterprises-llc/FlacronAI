const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const {
  resolveWatermarkPolicy,
  REVIEWED_STATUSES,
  DRAFT_TEXT,
  BRANDING_TEXT,
} = require('../utils/watermarkPolicy');
const reportsRouter = require('../routes/reports');
const { generateDOCX } = require('../utils/documentGenerator');
const { generatePDF } = require('../utils/properPdfGenerator');
const { addWatermarkToPDF } = require('../services/watermarkService');
const { extractPerPageText } = require('./helpers/pdfTextExtract');

// ---------------------------------------------------------------------------
// Pure resolver matrix -- the authoritative policy table from Phase 40.
// ---------------------------------------------------------------------------

test('resolver: draft + free/Starter -> draft watermark', () => {
  const p = resolveWatermarkPolicy({ reportStatus: 'draft', tierWatermark: true });
  assert.deepEqual(p, { show: true, kind: 'draft', text: DRAFT_TEXT });
});

test('resolver: draft + paid -> draft watermark (status wins over tier)', () => {
  const p = resolveWatermarkPolicy({ reportStatus: 'draft', tierWatermark: false });
  assert.deepEqual(p, { show: true, kind: 'draft', text: DRAFT_TEXT });
});

test('resolver: finalized + free/Starter -> branding watermark', () => {
  const p = resolveWatermarkPolicy({ reportStatus: 'finalized', tierWatermark: true });
  assert.deepEqual(p, { show: true, kind: 'branding', text: BRANDING_TEXT });
});

test('resolver: legacy "approved" + free/Starter -> branding watermark', () => {
  const p = resolveWatermarkPolicy({ reportStatus: 'approved', tierWatermark: true });
  assert.deepEqual(p, { show: true, kind: 'branding', text: BRANDING_TEXT });
});

test('resolver: legacy "completed" + free/Starter -> branding watermark', () => {
  const p = resolveWatermarkPolicy({ reportStatus: 'completed', tierWatermark: true });
  assert.deepEqual(p, { show: true, kind: 'branding', text: BRANDING_TEXT });
});

test('resolver: finalized + paid/non-watermarked entitlement -> no watermark', () => {
  const p = resolveWatermarkPolicy({ reportStatus: 'finalized', tierWatermark: false });
  assert.deepEqual(p, { show: false, kind: 'none', text: null });
});

test('resolver: legacy "approved" + paid -> no watermark', () => {
  const p = resolveWatermarkPolicy({ reportStatus: 'approved', tierWatermark: false });
  assert.deepEqual(p, { show: false, kind: 'none', text: null });
});

test('resolver: missing/unknown status fails safe as draft', () => {
  assert.equal(resolveWatermarkPolicy({ reportStatus: undefined, tierWatermark: false }).kind, 'draft');
  assert.equal(resolveWatermarkPolicy({ reportStatus: null, tierWatermark: false }).kind, 'draft');
  assert.equal(resolveWatermarkPolicy({ reportStatus: 'some-unrecognized-status', tierWatermark: false }).kind, 'draft');
  assert.equal(resolveWatermarkPolicy({ reportStatus: 'in_review', tierWatermark: true }).kind, 'draft');
});

test('resolver: extra/manipulated payload fields cannot suppress the watermark', () => {
  // The resolver's signature has no channel for a client-supplied "show" or
  // "watermark" override -- only authoritative status/tier inputs are read,
  // so spoofed extra fields on the input object are simply ignored.
  const spoofed = {
    reportStatus: 'draft',
    tierWatermark: true,
    watermark: false,
    show: false,
    kind: 'none',
    bypassWatermark: true,
  };
  const p = resolveWatermarkPolicy(spoofed);
  assert.equal(p.show, true);
  assert.equal(p.kind, 'draft');
});

test('resolver: REVIEWED_STATUSES matches the documented legacy set exactly', () => {
  assert.deepEqual([...REVIEWED_STATUSES].sort(), ['approved', 'completed', 'finalized']);
});

// ---------------------------------------------------------------------------
// Cross-surface consistency: PDF overlay, DOCX, and HTML must all render the
// same resolved policy, and never both watermark texts at once.
// ---------------------------------------------------------------------------

const baseReport = {
  claimNumber: 'CLM-99001',
  reportType: 'Initial',
  insuredName: 'Jordan Rivers',
  propertyAddress: '12 Test Ave',
  lossDate: '2026-09-01',
  lossType: 'Water',
  content: '## Findings\nVisible conditions appear consistent with water intrusion.',
};

async function renderPdfPages(reportStatus, policy) {
  // Mirrors the production export route: properPdfGenerator's own watermark
  // overlay layer is disabled, and addWatermarkToPDF is the single
  // authoritative overlay applied only when the policy says to show one.
  // `reportStatus` is also set on the report itself, since the cover page's
  // own draft/finalized status badge (Phase 40: now driven by the same
  // REVIEWED_STATUSES set) reads `report.status` independently of the
  // watermark overlay.
  let buffer = await generatePDF(
    { ...baseReport, status: reportStatus },
    { companyName: 'Example Firm', watermark: false }
  );
  if (policy.show) {
    buffer = await addWatermarkToPDF(buffer, policy.text, null);
  }
  return extractPerPageText(buffer);
}

test('PDF: draft policy renders the draft mark and never the branding text', async () => {
  const policy = resolveWatermarkPolicy({ reportStatus: 'draft', tierWatermark: true });
  const pages = await renderPdfPages('draft', policy);
  const allText = pages.join(' ').toUpperCase();
  assert.match(allText, /DRAFT/);
  assert.match(allText, /PENDING ADJUSTER REVIEW/);
  assert.doesNotMatch(allText, /UPGRADE TO REMOVE WATERMARK/);
});

test('PDF: reviewed Starter policy renders the branding mark and never the draft text', async () => {
  const policy = resolveWatermarkPolicy({ reportStatus: 'finalized', tierWatermark: true });
  const pages = await renderPdfPages('finalized', policy);
  const allText = pages.join(' ').toUpperCase();
  assert.match(allText, /UPGRADE TO REMOVE WATERMARK/);
  assert.doesNotMatch(allText, /PENDING ADJUSTER REVIEW/);
});

test('PDF: reviewed paid policy renders no watermark text at all', async () => {
  const policy = resolveWatermarkPolicy({ reportStatus: 'finalized', tierWatermark: false });
  const pages = await renderPdfPages('finalized', policy);
  const allText = pages.join(' ').toUpperCase();
  assert.doesNotMatch(allText, /PENDING ADJUSTER REVIEW/);
  assert.doesNotMatch(allText, /UPGRADE TO REMOVE WATERMARK/);
});

test('PDF: legacy "approved" status cover page shows Finalized, not a draft badge', async () => {
  const policy = resolveWatermarkPolicy({ reportStatus: 'approved', tierWatermark: true });
  const pages = await renderPdfPages('approved', policy);
  const allText = pages.join(' ').toUpperCase();
  assert.match(allText, /FINALIZED .? APPROVED BY LICENSED ADJUSTER/);
  assert.doesNotMatch(allText, /PENDING ADJUSTER REVIEW/);
  assert.match(allText, /UPGRADE TO REMOVE WATERMARK/);
});

test('DOCX: draft policy embeds the draft mark, not the branding text', async () => {
  const policy = resolveWatermarkPolicy({ reportStatus: 'draft', tierWatermark: true });
  const buffer = await generateDOCX(baseReport, {
    companyName: 'Example Firm',
    watermark: policy.show,
    watermarkText: policy.text,
  });
  const zip = new PizZip(buffer);
  const xml = zip.file('word/document.xml').asText();
  assert.match(xml, /PENDING ADJUSTER REVIEW/);
  assert.doesNotMatch(xml, /Upgrade to remove watermark/);
});

test('DOCX: reviewed Starter policy embeds the branding mark, not the draft text', async () => {
  const policy = resolveWatermarkPolicy({ reportStatus: 'completed', tierWatermark: true });
  const buffer = await generateDOCX(baseReport, {
    companyName: 'Example Firm',
    watermark: policy.show,
    watermarkText: policy.text,
  });
  const zip = new PizZip(buffer);
  const xml = zip.file('word/document.xml').asText();
  assert.match(xml, /Upgrade to remove watermark/);
  assert.doesNotMatch(xml, /PENDING ADJUSTER REVIEW/);
});

test('DOCX: reviewed paid policy embeds no watermark paragraph', async () => {
  const policy = resolveWatermarkPolicy({ reportStatus: 'approved', tierWatermark: false });
  const buffer = await generateDOCX(baseReport, {
    companyName: 'Example Firm',
    watermark: policy.show,
    watermarkText: policy.text,
  });
  const zip = new PizZip(buffer);
  const xml = zip.file('word/document.xml').asText();
  assert.doesNotMatch(xml, /PENDING ADJUSTER REVIEW/);
  assert.doesNotMatch(xml, /Upgrade to remove watermark/);
});

test('HTML: draft policy renders the draft banner, not the branding text', () => {
  const policy = resolveWatermarkPolicy({ reportStatus: undefined, tierWatermark: true });
  const html = reportsRouter._test.generateHTML(baseReport, {
    companyName: 'Example Firm',
    primaryColor: [253, 68, 3],
    watermark: policy.show,
    watermarkText: policy.text,
  });
  assert.match(html, /PENDING ADJUSTER REVIEW/);
  assert.doesNotMatch(html, /Upgrade to remove watermark/);
});

test('HTML: reviewed Starter policy renders the branding banner, not the draft text', () => {
  const policy = resolveWatermarkPolicy({ reportStatus: 'finalized', tierWatermark: true });
  const html = reportsRouter._test.generateHTML(baseReport, {
    companyName: 'Example Firm',
    primaryColor: [253, 68, 3],
    watermark: policy.show,
    watermarkText: policy.text,
  });
  assert.match(html, /Upgrade to remove watermark/);
  assert.doesNotMatch(html, /PENDING ADJUSTER REVIEW/);
});

test('HTML: reviewed paid policy renders no watermark banner', () => {
  const policy = resolveWatermarkPolicy({ reportStatus: 'finalized', tierWatermark: false });
  const html = reportsRouter._test.generateHTML(baseReport, {
    companyName: 'Example Firm',
    primaryColor: [253, 68, 3],
    watermark: policy.show,
    watermarkText: policy.text,
  });
  assert.doesNotMatch(html, /PENDING ADJUSTER REVIEW/);
  assert.doesNotMatch(html, /Upgrade to remove watermark/);
});
