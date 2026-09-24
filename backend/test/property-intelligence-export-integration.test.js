const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const reportsRouter = require('../routes/reports');
const { generateDOCX } = require('../utils/documentGenerator');
const { generatePDF } = require('../utils/properPdfGenerator');
const { extractPerPageText } = require('./helpers/pdfTextExtract');
const {
  buildSection3PropertyBlockMarkdown,
  injectSection3PropertyBlock,
} = require('../utils/propertyIntelligenceContent');
const { SOURCE, VERIFICATION_STATUS, buildEmptyPropertyIntelligence } = require('../utils/propertyIntelligence');

// Phase 47. Representative desktop-preview/PDF/DOCX/HTML consistency test --
// same architecture as watermark-policy.test.js's own cross-surface
// consistency coverage: ONE normalized markdown block, spliced into
// `content`, then fed through the SAME renderers production actually uses.
// Proves the confirmed-only Section 3 block reaches every export format
// identically and that Section 4+ is never disturbed.

const confirmedField = (value) => ({ value, source: SOURCE.THIRD_PARTY, verificationStatus: VERIFICATION_STATUS.USER_CONFIRMED, userOverride: false });

const baseReport = {
  claimNumber: 'CLM-99002',
  reportType: 'Initial',
  insuredName: 'Jordan Rivers',
  propertyAddress: '12 Test Ave',
  lossDate: '2026-09-01',
  lossType: 'Water',
  status: 'draft',
  content: [
    '## SECTION 3: PROPERTY INFO',
    'The property is a two-story single family residence.',
    '',
    '## SECTION 4: INSPECTION DETAILS & OVERVIEW',
    'Visible conditions appear consistent with water intrusion.',
  ].join('\n'),
};

function buildRenderReport(propertyProfile) {
  const block = buildSection3PropertyBlockMarkdown(propertyProfile);
  const content = injectSection3PropertyBlock(baseReport.content, block);
  return { ...baseReport, content };
}

test('a report with NO confirmed property intelligence renders identically to today (no Section 3 block anywhere)', async () => {
  const propertyProfile = { propertyIntelligence: buildEmptyPropertyIntelligence() };
  const renderReport = buildRenderReport(propertyProfile);
  assert.equal(renderReport.content, baseReport.content);

  const pdfBuffer = await generatePDF(renderReport, { companyName: 'Example Firm', watermark: false });
  const pages = await extractPerPageText(pdfBuffer);
  assert.doesNotMatch(pages.join(' '), /Confirmed Property Details/);

  const docxBuffer = await generateDOCX(renderReport, { companyName: 'Example Firm', watermark: false });
  const xml = new PizZip(docxBuffer).file('word/document.xml').asText();
  assert.doesNotMatch(xml, /Confirmed Property Details/);

  const html = reportsRouter._test.generateHTML(renderReport, { companyName: 'Example Firm', primaryColor: [253, 68, 3], watermark: false });
  assert.doesNotMatch(html, /Confirmed Property Details/);
});

test('a report WITH confirmed property intelligence renders the block identically across PDF/DOCX/HTML, beneath the existing narrative, Section 4+ untouched', async () => {
  const propertyProfile = {
    propertyIntelligence: {
      ...buildEmptyPropertyIntelligence(),
      fields: {
        ...buildEmptyPropertyIntelligence().fields,
        yearBuilt: confirmedField(1998),
        roofType: confirmedField('Asphalt Shingle'),
      },
    },
  };
  const renderReport = buildRenderReport(propertyProfile);
  assert.match(renderReport.content, /two-story single family residence/); // original narrative preserved
  assert.match(renderReport.content, /Confirmed Property Details/);

  const pdfBuffer = await generatePDF(renderReport, { companyName: 'Example Firm', watermark: false });
  const pdfText = (await extractPerPageText(pdfBuffer)).join(' ');
  assert.match(pdfText, /1998/);
  assert.match(pdfText, /Asphalt Shingle/);
  assert.match(pdfText, /Visible conditions appear consistent with water intrusion/); // Section 4 untouched

  const docxBuffer = await generateDOCX(renderReport, { companyName: 'Example Firm', watermark: false });
  const xml = new PizZip(docxBuffer).file('word/document.xml').asText();
  assert.match(xml, /1998/);
  assert.match(xml, /Asphalt Shingle/);
  assert.match(xml, /Visible conditions appear consistent with water intrusion/);

  const html = reportsRouter._test.generateHTML(renderReport, { companyName: 'Example Firm', primaryColor: [253, 68, 3], watermark: false });
  assert.match(html, /1998/);
  assert.match(html, /Asphalt Shingle/);
  assert.match(html, /Visible conditions appear consistent with water intrusion/);
});

test('an unconfirmed (provider-supplied-only) field never reaches any export format', async () => {
  const intel = buildEmptyPropertyIntelligence();
  intel.fields.yearBuilt = { value: 1998, source: SOURCE.THIRD_PARTY, verificationStatus: VERIFICATION_STATUS.PROVIDER_SUPPLIED, userOverride: false };
  const renderReport = buildRenderReport({ propertyIntelligence: intel });
  assert.equal(renderReport.content, baseReport.content); // no-op -- nothing confirmed yet

  const pdfBuffer = await generatePDF(renderReport, { companyName: 'Example Firm', watermark: false });
  const pdfText = (await extractPerPageText(pdfBuffer)).join(' ');
  assert.doesNotMatch(pdfText, /1998/);
});
