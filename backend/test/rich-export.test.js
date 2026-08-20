const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const { PDFDocument } = require('pdf-lib');
const { generateDOCX } = require('../utils/documentGenerator');
const { generatePDF } = require('../utils/properPdfGenerator');
const reportsRouter = require('../routes/reports');

// Phase 9 (Report Editor Rich-Text & AI Panel Upgrade): the rich editor can
// put real content -- photos, tables, page breaks -- into whatever ends up as
// the report's first section, including content the AI's Regenerate Section/
// writing-assistance functions place BEFORE the first `## ` heading (e.g. the
// editor's "Introduction"/preamble pseudo-section, always re-serialized with
// no `##` prefix -- see frontend/src/utils/reportSections.js). Verifies the
// fix for a real bug found during Phase 9 live testing: documentGenerator.js's
// own section splitter silently dropped everything before the first `## `
// heading, so a DOCX export could lose real content that the PDF/HTML
// exporters (which never pre-split into sections) rendered correctly.

const onePxJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64'
);

const contentWithPreambleTokens = `# INSURANCE INSPECTION REPORT

![[photo:p1|Kitchen ceiling]]

[[photos cols=2]]
photo:p1|Wall A
photo:p2|Wall B
[[/photos]]

**Preliminary Findings**

- Claim Number: CLM-100

{{page-break}}

## SECTION 1: REPORT INFO
- Report Type: Initial
`;

const baseReport = {
  claimNumber: 'CLM-100',
  insuredName: 'Jane Doe',
  propertyAddress: '1 Test Way',
  lossDate: '2026-08-01',
  lossType: 'Water',
  status: 'draft',
  content: contentWithPreambleTokens,
};

const photoMap = {
  p1: { buffer: onePxJpeg, mimeType: 'image/jpeg' },
  p2: { buffer: onePxJpeg, mimeType: 'image/jpeg' },
};

test('DOCX: content before the first ## heading is no longer silently dropped', async () => {
  const buf = await generateDOCX(baseReport, { photoMap });
  const zip = new PizZip(buf);
  const documentXml = zip.file('word/document.xml').asText();
  assert.match(documentXml, /Preliminary Findings/, 'preamble text survives into the DOCX body');
  assert.match(documentXml, /Claim Number: CLM-100/);
});

test('DOCX: photo and photo-grid tokens embed real <w:drawing> elements referencing media parts', async () => {
  const buf = await generateDOCX(baseReport, { photoMap });
  const zip = new PizZip(buf);
  const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/'));
  assert.equal(
    media.length,
    2,
    'one media part per unique referenced photoId (p1 is referenced twice, deduped)'
  );
  const documentXml = zip.file('word/document.xml').asText();
  const drawingCount = (documentXml.match(/<w:drawing>/g) || []).length;
  assert.equal(drawingCount, 3, 'one drawing for the single photo + one per grid item (2)');
});

test('DOCX: a photo token with no resolvable entry in photoMap renders a placeholder, not a crash', async () => {
  const buf = await generateDOCX(baseReport, { photoMap: {} });
  const zip = new PizZip(buf);
  const documentXml = zip.file('word/document.xml').asText();
  assert.match(documentXml, /Photo unavailable/);
});

test('DOCX: {{page-break}} becomes a real Word page break', async () => {
  const buf = await generateDOCX(baseReport, { photoMap });
  const zip = new PizZip(buf);
  const documentXml = zip.file('word/document.xml').asText();
  assert.match(documentXml, /<w:br w:type="page"\/>/);
});

test('DOCX: inline bold/italic/underline render as real per-run formatting, not stripped text', async () => {
  const report = {
    ...baseReport,
    content: '## SECTION 1: X\n**bold** and *italic* and ++underlined++ text.',
  };
  const buf = await generateDOCX(report, {});
  const zip = new PizZip(buf);
  const documentXml = zip.file('word/document.xml').asText();
  assert.match(documentXml, /<w:b\/>/);
  assert.match(documentXml, /<w:i\/>/);
  assert.match(documentXml, /<w:u w:val="single"\/>/);
  assert.match(documentXml, />bold</);
  assert.match(documentXml, />italic</);
  assert.match(documentXml, />underlined</);
});

test('DOCX: a numbered list renders each item with its own sequence number', async () => {
  const report = { ...baseReport, content: '## SECTION 1: X\n1. First item\n2. Second item' };
  const buf = await generateDOCX(report, {});
  const zip = new PizZip(buf);
  const documentXml = zip.file('word/document.xml').asText();
  assert.match(documentXml, />1\. First item</);
  assert.match(documentXml, />2\. Second item</);
});

test('PDF: page count increases across a {{page-break}} token, and renders without throwing', async () => {
  const withoutBreak = await generatePDF(
    { ...baseReport, content: '## SECTION 1: X\nSome text.' },
    { photoMap }
  );
  const withBreak = await generatePDF(baseReport, { photoMap });
  const a = await PDFDocument.load(withoutBreak);
  const b = await PDFDocument.load(withBreak);
  assert.ok(
    b.getPageCount() > a.getPageCount(),
    'the page-break + photo/grid content adds at least one page'
  );
});

test('HTML: photo/photo-grid tokens embed as base64 data URIs, page break renders, hostile caption text is escaped', async () => {
  const report = {
    ...baseReport,
    content: `${contentWithPreambleTokens}\n![[photo:p1|<script>alert(1)</script>]]`,
  };
  const html = reportsRouter._test.generateHTML(report, {
    companyName: 'Example Firm',
    primaryColor: [253, 68, 3],
    hideFlacronBranding: true,
    watermark: false,
    watermarkText: '',
    photoMap,
  });
  assert.match(html, /data:image\/jpeg;base64,/);
  assert.match(html, /class="page-break"/);
  assert.doesNotMatch(html, /<script>alert\(1\)/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
