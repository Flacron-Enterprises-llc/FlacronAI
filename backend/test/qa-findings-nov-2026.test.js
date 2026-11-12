// Regression tests for the Nov 2026 mobile QA tracker (FAI-001/002/005, POT-02/03/12/13).
const test = require('node:test');
const assert = require('node:assert/strict');

const { applyReviewedWording, normalizeExportMarkdown, prepareExportContent, approvedVersionLabel } = require('../utils/exportWording');
const { buildInvoiceContent, dueRows, formatBalance } = require('../utils/invoiceContent');
const { buildMoldStaticSections, assembleMoldReport } = require('../services/aiService');

const invoiceComputed = (balanceDue) => ({
  billTo: { name: 'QA Insured', address: '1 Main St, Dallas, TX 75201' },
  invoiceNumber: 'INV-1',
  invoiceDate: '2026-11-06',
  dueDate: '2026-12-06',
  claimNumber: 'CLM-1',
  jobNumber: '',
  servicesRendered: [{ code: 'A1', description: 'Drywall', qty: 1, unit: 'EA', unitPrice: 100, lineTotal: 100 }],
  totals: { servicesSubtotal: 100, overheadProfitPercent: 0, overheadProfit: 0, combinedSubtotal: 100, tax: 8, paymentsReceivedTotal: 0, balanceDue },
  taxRatePercent: 8,
  paymentHistory: [],
  changeOrderLog: [],
  paymentTerms: 'Net 30',
  remitTo: { name: 'Co', instructions: 'Check' },
  warrantyText: '',
});

test('FAI-001: an approved invoice export carries no DRAFT/PENDING status wording but keeps the AI disclaimer', () => {
  const content = buildInvoiceContent({}, invoiceComputed(108), 1, [{ version: 1, date: '2026-11-06', changeSummary: 'Initial', balanceDue: 108 }]);
  assert.match(content, /DRAFT, PENDING REVIEW/);
  const approved = applyReviewedWording(content, true);
  assert.doesNotMatch(approved, /DRAFT|PENDING REVIEW/);
  assert.match(approved, /REVIEWED & APPROVED/);
  assert.match(approved, /does not generate, calculate, or determine any dollar amount/);
});

test('FAI-001: draft exports are left unchanged', () => {
  const content = buildInvoiceContent({}, invoiceComputed(108), 1, []);
  assert.equal(applyReviewedWording(content, false), content);
});

test('FAI-005: blockquotes and underscore emphasis become renderable Markdown; identifiers and signature lines are untouched', () => {
  const out = normalizeExportMarkdown(
    ['> A notice with _emphasis_', '- _italic_ and __bold__ words', 'ANTHROPIC_API_KEY snake_case_id', 'Signed: ______________', '| a_b | _c_ |'].join('\n')
  );
  const lines = out.split('\n');
  assert.equal(lines[0], '*A notice with *emphasis**');
  assert.equal(lines[1], '- *italic* and **bold** words');
  assert.equal(lines[2], 'ANTHROPIC_API_KEY snake_case_id');
  assert.equal(lines[3], 'Signed: ______________');
  assert.equal(lines[4], '| a_b | _c_ |');
  assert.doesNotMatch(out, /^\s*>/m);
});

test('FAI-001/005: approved mold supplement banner is reviewed wording, not a raw blockquote, and keeps the not-certified disclaimer', () => {
  const content = '> DRAFT — PENDING ADJUSTER & ASSESSOR REVIEW. Prepared with the FLACRON ENGINE for review and approval by a licensed insurance adjuster. Observations drafted by Super Intelligence only — not a certified mold assessment.';
  const out = prepareExportContent(content, { reviewed: true });
  assert.doesNotMatch(out, /^>|PENDING/);
  assert.match(out, /REVIEWED & APPROVED/);
  assert.match(out, /not a certified mold assessment/);
});

test('POT-02: an overpayment shows $0.00 due plus a credit balance, never a negative amount due', () => {
  assert.equal(dueRows(-876), '| **TOTAL DUE** | **$0.00** |\n| **CREDIT BALANCE (OVERPAYMENT)** | **$876.00** |');
  assert.equal(dueRows(12.5), '| **TOTAL DUE** | **$12.50** |');
  assert.equal(formatBalance(-876), '$876.00 credit');
  const content = buildInvoiceContent({}, invoiceComputed(-876), 1, [{ version: 1, date: 'd', changeSummary: 'Paid', balanceDue: -876 }]);
  assert.doesNotMatch(content, /-\$/);
});

test('POT-03: document revision and version-history counter are labelled distinctly', () => {
  assert.equal(approvedVersionLabel({ documentType: 'Invoice', revision: 2, versionApproved: 6 }), 'Rev. 2 (history entry #6)');
  assert.equal(approvedVersionLabel({ versionApproved: 3 }), 'Version 3 (history entry #3)');
  assert.equal(approvedVersionLabel({}), '');
});

test('POT-12: mold Section 5 states where its observations came from', () => {
  const statics = buildMoldStaticSections({ claimNumber: 'C-M', relatedClaimId: 'C', insuredName: 'I', propertyAddress: 'A', dateOfDiscovery: '2026-11-01' });
  const narrative = { visualObservations: '- Per the adjuster notes, staining.', recommendedNextSteps: '- Engage an assessor.' };
  const none = assembleMoldReport(statics, narrative, { totalImagesAnalyzed: 0 }, 0);
  assert.match(none, /## SECTION 5: VISUAL OBSERVATIONS\n\*Source: the adjuster-entered loss description and damage notes from the related report\. No photographs were available/);
  const attached = assembleMoldReport(statics, narrative, { totalImagesAnalyzed: 0 }, 3);
  assert.match(attached, /3 photos are attached for reference/);
  const analyzed = assembleMoldReport(statics, narrative, { totalImagesAnalyzed: 2, damages: [] }, 2);
  assert.match(analyzed, /reviewer-approved observations for 2 photos/);
});
