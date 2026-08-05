const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const { PDFDocument } = require('pdf-lib');
const reportsRouter = require('../routes/reports');
const { generateDOCX } = require('../utils/documentGenerator');
const { generatePDF } = require('../utils/properPdfGenerator');
const { addWatermarkToPDF } = require('../services/watermarkService');

const hostileReport = {
  claimNumber: '<script>alert(1)</script>',
  reportType: 'Initial"><img src=x onerror=alert(2)>',
  insuredName: 'Casey & Morgan',
  propertyAddress: '1 <Internal> Way',
  lossDate: '2026-08-02',
  lossType: 'Water',
  content: '## Findings\n<script>alert(3)</script>\n**Visible & documented**',
  signature: {
    name: 'Alex <Reviewer>',
    title: 'Adjuster',
    licenseNumber: 'LIC-123',
    licenseState: 'TX',
    company: 'Example & Co.',
    confirmedAt: '2026-08-02T12:00:00.000Z',
  },
  versionApproved: 3,
};

test('HTML export escapes hostile report fields and includes draft/sign-off context', () => {
  const html = reportsRouter._test.generateHTML(hostileReport, {
    companyName: 'Example <Firm>',
    primaryColor: [253, 68, 3],
    hideFlacronBranding: true,
    watermark: true,
    watermarkText: 'DRAFT - PENDING ADJUSTER REVIEW',
  });

  assert.doesNotMatch(html, /<script|<img/i);
  assert.match(html, /&lt;script&gt;alert\(3\)&lt;\/script&gt;/);
  assert.match(html, /DRAFT - PENDING ADJUSTER REVIEW/);
  assert.match(html, /LIC-123/);
  assert.match(html, /Report version:<\/strong> 3/);
  assert.doesNotMatch(html, /localhost|\/api\//i);
});

test('DOCX export escapes XML and preserves watermark, sign-off, header, and footer', async () => {
  const buffer = await generateDOCX(hostileReport, {
    companyName: 'Example Firm',
    hideFlacronBranding: true,
    watermark: true,
    watermarkText: 'DRAFT - PENDING ADJUSTER REVIEW',
  });
  const zip = new PizZip(buffer);
  const documentXml = zip.file('word/document.xml').asText();
  const headerXml = zip.file('word/header1.xml').asText();
  const footerXml = zip.file('word/footer1.xml').asText();

  assert.doesNotMatch(documentXml, /<script>/i);
  assert.match(documentXml, /&lt;script&gt;alert\(3\)&lt;\/script&gt;/);
  assert.match(documentXml, /DRAFT - PENDING ADJUSTER REVIEW/);
  assert.match(documentXml, /LIC-123/);
  assert.match(documentXml, /Example &amp; Co\./);
  assert.match(headerXml, /DRAFT - PENDING ADJUSTER REVIEW/);
  assert.match(footerXml, /w:instr="PAGE"/);
  assert.doesNotMatch(`${documentXml}${headerXml}${footerXml}`, /localhost|\/api\//i);
});

test('PDF export and watermark overlay produce a readable multi-page document', async () => {
  const base = await generatePDF(hostileReport, {
    companyName: 'Example Firm',
    watermark: true,
    watermarkText: 'DRAFT - PENDING ADJUSTER REVIEW',
  });
  const basePdf = await PDFDocument.load(base);
  assert.ok(basePdf.getPageCount() >= 4);

  const watermarked = await addWatermarkToPDF(base, 'DRAFT - PENDING ADJUSTER REVIEW');
  const finalPdf = await PDFDocument.load(watermarked);
  assert.equal(finalPdf.getPageCount(), basePdf.getPageCount());
  assert.ok(watermarked.length > 0);
});
