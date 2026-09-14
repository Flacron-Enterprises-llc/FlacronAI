const test = require('node:test');
const assert = require('node:assert/strict');
const { generatePDF } = require('../utils/properPdfGenerator');
const { validateAndComputeInvoice } = require('../utils/invoiceCalculations');
const { buildInvoiceContent } = require('../utils/invoiceContent');
const { validateAndComputeEstimate } = require('../utils/estimateCalculations');
const { buildEstimateContent } = require('../utils/estimateContent');
const { extractPerPageText, findFirstPageContaining } = require('./helpers/pdfTextExtract');

// QA fix: the Table of Contents used to print a hardcoded/sequential page
// number for every entry (`i + 3` -- "section 1 is on page 3, section 2 is
// on page 4, ..."), regardless of how much content actually preceded it.
// Confirmed reproduction: a 5-page Invoice PDF listed Sections 1-8 on pages
// 3-10 (impossible for a 5-page document). These tests generate REAL PDFs
// and parse their actual bytes (see helpers/pdfTextExtract.js) to verify
// every TOC entry now points at the true physical page its heading first
// appears on -- not just that some internal helper computes a number.

// Mirrors reports.js's tocSections mapping for these two document types
// exactly (QA fix: {label, heading} pairs -- see routes/reports.js).
const INVOICE_TOC = [
  { label: 'Section 1: Invoice Details', heading: 'INVOICE' },
  { label: 'Section 2: Services Rendered', heading: 'SERVICES RENDERED' },
  { label: 'Section 3: Invoice Totals', heading: 'INVOICE TOTALS' },
  { label: 'Section 4: Payment History', heading: 'PAYMENT HISTORY' },
  { label: 'Section 5: Change Order Log', heading: 'CHANGE ORDER LOG' },
  { label: 'Section 6: Revision History', heading: 'REVISION HISTORY' },
  { label: 'Section 7: Payment Terms & Remit-To', heading: 'PAYMENT TERMS' },
  { label: 'Section 8: Adjuster Review & Sign-Off', heading: 'ADJUSTER REVIEW & SIGN-OFF' },
];
const ESTIMATE_TOC = [
  { label: 'Section 1: Report Information', heading: 'REPAIR ESTIMATE' },
  { label: 'Section 2: Line Item Detail', heading: 'LINE ITEM DETAIL' },
  { label: 'Section 3: Depreciation Schedule', heading: 'DEPRECIATION SCHEDULE' },
  { label: 'Section 4: Revision History', heading: 'REVISION HISTORY' },
  { label: 'Section 5: Terms & Conditions', heading: 'TERMS & CONDITIONS' },
  { label: 'Section 6: Adjuster Review & Sign-Off', heading: 'ADJUSTER REVIEW & SIGN-OFF' },
];

function buildInvoiceReport({ long }) {
  const count = long ? 40 : 1;
  const lineItems = Array.from({ length: count }, (_, i) => ({
    code: `L${i + 1}`,
    description: `Line item ${i + 1} — general conditions and materials`,
    qty: 1,
    unit: 'EA',
    unitPrice: 137.5,
    lineTotal: 137.5,
    taxable: true,
  }));
  const paymentHistory = long
    ? Array.from({ length: 15 }, (_, i) => ({
        date: '2026-09-01',
        description: `Progress payment ${i + 1}`,
        method: 'ACH',
        amount: 50,
      }))
    : [];
  const changeOrderLog = long
    ? Array.from({ length: 10 }, (_, i) => ({
        coNumber: `CO-${i + 1}`,
        description: `Change order ${i + 1}`,
        amount: 25,
      }))
    : [];
  const revisionHistory = long
    ? Array.from({ length: 8 }, (_, i) => ({
        version: i + 1,
        date: '2026-09-01',
        changeSummary: `Revision ${i + 1}`,
        balanceDue: 100 + i,
      }))
    : [];

  const body = {
    billTo: { name: 'Jane Homeowner', address: '123 Main St, Springfield, ST 00000' },
    remitTo: { name: 'Acme Restoration LLC', instructions: 'Remit via ACH to account 000123456' },
    invoiceNumber: 'INV-1001',
    invoiceDate: '2026-09-13',
    taxRatePercent: 8,
    changeOrderLog,
    paymentHistory,
  };
  const computed = validateAndComputeInvoice(body, lineItems, 10);
  assert.equal(computed.error, undefined, `invoice fixture must be valid: ${computed.error}`);
  const content = buildInvoiceContent(body, computed, 1, revisionHistory);
  return {
    id: `invoice-${long ? 'long' : 'compact'}`,
    documentType: 'Invoice',
    status: 'draft',
    content,
  };
}

function buildEstimateReport({ long }) {
  const count = long ? 40 : 1;
  const lineItems = Array.from({ length: count }, (_, i) => ({
    code: `E${i + 1}`,
    description: `Estimate line ${i + 1}`,
    qty: 2,
    unit: 'EA',
    unitPrice: 75,
  }));
  const depreciationSchedule = long
    ? Array.from({ length: 20 }, (_, i) => ({
        item: `Item ${i + 1}`,
        ageYears: 5,
        lifeExpectancyYears: 20,
        condition: 'Average',
        depreciationPercent: 25,
        relatedLineItemCodes: [`E${(i % count) + 1}`],
      }))
    : [];
  const revisionHistory = long
    ? Array.from({ length: 8 }, (_, i) => ({
        version: i + 1,
        date: '2026-09-01',
        changeSummary: `Revision ${i + 1}`,
        total: 1000 + i,
      }))
    : [];

  const body = {
    lineItems,
    depreciationSchedule,
    overheadProfitPercent: 10,
    taxRatePercent: 8,
    estimateNumber: 'EST-2001',
    estimateDate: '2026-09-01',
  };
  const computed = validateAndComputeEstimate(body);
  assert.equal(computed.error, undefined, `estimate fixture must be valid: ${computed.error}`);
  const content = buildEstimateContent(
    { claimNumber: 'CLM-2', insuredName: 'Jane Homeowner', propertyAddress: '123 Main St' },
    computed,
    1,
    revisionHistory
  );
  return {
    id: `estimate-${long ? 'long' : 'compact'}`,
    documentType: 'RepairEstimate',
    status: 'draft',
    content,
  };
}

// Parses the TOC page's own text back into (label, pageNumber) rows, the
// same way a human reader would. Starts the search at page 3 (skipping the
// cover + TOC pages themselves) when locating each heading's real page,
// since the TOC page's own labels legitimately contain the same words (e.g.
// "Change Order Log") and would otherwise falsely confirm page 2.
function parseTocRows(tocPageText, expectedCount) {
  const withoutTitle = tocPageText.replace(/^TABLE OF CONTENTS\s*/i, '');
  const rowChunks = withoutTitle.split(/(?=SECTION\s+\d+\s*:)/i).filter((s) => s.trim());
  assert.equal(rowChunks.length, expectedCount, 'one TOC row per tocSections entry');
  return rowChunks.map((chunk) => {
    const withoutPrefix = chunk.trim().replace(/^SECTION\s+\S+\s*:\s*/i, '');
    // The last row's chunk also contains the page's own header/footer text
    // (drawn after the TOC rows in the same content stream) -- take the
    // FIRST digit run right after the label, not the last, so trailing
    // footer/branding text (which itself ends in a page number) is ignored.
    const m = /^(.*?)\s+(\d+)\b/.exec(withoutPrefix);
    assert.ok(m, `TOC row should end in a page number: "${chunk}"`);
    return { label: m[1].trim().replace(/\s+/g, ' '), page: Number(m[2]) };
  });
}

async function generateAndVerify(report, tocSections) {
  const pdfBytes = await generatePDF(report, {
    tocSections,
    includeCoverPage: true,
    includeAppendix: false,
  });
  const pagesText = await extractPerPageText(pdfBytes);
  const totalPages = pagesText.length;
  const tocRows = parseTocRows(pagesText[1], tocSections.length);
  return { pdfBytes, pagesText, totalPages, tocRows };
}

for (const long of [false, true]) {
  test(`Invoice PDF (${long ? 'long' : 'compact'}): every TOC entry matches the real page its heading first appears on`, async () => {
    const { pagesText, totalPages, tocRows } = await generateAndVerify(
      buildInvoiceReport({ long }),
      INVOICE_TOC
    );
    INVOICE_TOC.forEach((entry, i) => {
      const actualPage = findFirstPageContaining(pagesText, entry.heading, 3);
      assert.ok(
        actualPage !== null,
        `heading "${entry.heading}" should appear somewhere in the body`
      );
      assert.equal(
        tocRows[i].page,
        actualPage,
        `"${entry.label}" TOC page should equal its real first page`
      );
      assert.ok(tocRows[i].page <= totalPages, 'no TOC entry may exceed the final page count');
    });
  });

  test(`Repair Estimate PDF (${long ? 'long' : 'compact'}): every TOC entry matches the real page its heading first appears on`, async () => {
    const { pagesText, totalPages, tocRows } = await generateAndVerify(
      buildEstimateReport({ long }),
      ESTIMATE_TOC
    );
    ESTIMATE_TOC.forEach((entry, i) => {
      const actualPage = findFirstPageContaining(pagesText, entry.heading, 3);
      assert.ok(
        actualPage !== null,
        `heading "${entry.heading}" should appear somewhere in the body`
      );
      assert.equal(
        tocRows[i].page,
        actualPage,
        `"${entry.label}" TOC page should equal its real first page`
      );
      assert.ok(tocRows[i].page <= totalPages, 'no TOC entry may exceed the final page count');
    });
  });
}

test('Invoice PDF: compact document packs multiple sections onto one shared page (not one-page-per-section)', async () => {
  const { tocRows } = await generateAndVerify(buildInvoiceReport({ long: false }), INVOICE_TOC);
  const pages = tocRows.map((r) => r.page);
  const uniquePages = new Set(pages);
  assert.ok(uniquePages.size < pages.length, 'multiple sections should share at least one page');
});

test('Invoice PDF: a long document spreads sections across more distinct pages than the compact one (page numbers are content-derived, not hardcoded)', async () => {
  const compact = await generateAndVerify(buildInvoiceReport({ long: false }), INVOICE_TOC);
  const long = await generateAndVerify(buildInvoiceReport({ long: true }), INVOICE_TOC);
  assert.ok(
    long.totalPages > compact.totalPages,
    'a long invoice must produce more physical pages'
  );
  assert.notDeepEqual(
    long.tocRows.map((r) => r.page),
    compact.tocRows.map((r) => r.page),
    'TOC page numbers must differ between compact and long content, proving they are computed, not fixed'
  );
});

test('Repair Estimate PDF: a multi-page section (Line Item Detail) is referenced by its FIRST page, not a later continuation page', async () => {
  const { pagesText, tocRows } = await generateAndVerify(
    buildEstimateReport({ long: true }),
    ESTIMATE_TOC
  );
  const lineItemEntryIndex = 1; // "Section 2: Line Item Detail"
  const firstPage = tocRows[lineItemEntryIndex].page;
  // With 40 line items the section must overflow onto at least one more page.
  const laterPage = findFirstPageContaining(pagesText.slice(firstPage), 'E39', 1);
  assert.ok(
    laterPage !== null,
    'a late line item should land on a later page, proving the section spans multiple pages'
  );
  assert.equal(
    findFirstPageContaining(pagesText, 'LINE ITEM DETAIL', 3),
    firstPage,
    'the heading itself is only found starting at the first page, so the TOC correctly cites the first page of a multi-page section'
  );
});

test('Invoice PDF: no TOC entry ever exceeds the actual final page count, for both compact and long documents', async () => {
  for (const long of [false, true]) {
    const { totalPages, tocRows } = await generateAndVerify(
      buildInvoiceReport({ long }),
      INVOICE_TOC
    );
    for (const row of tocRows) {
      assert.ok(
        row.page <= totalPages,
        `TOC page ${row.page} must not exceed ${totalPages} total pages`
      );
      assert.ok(row.page >= 1, 'TOC page must be a real page');
    }
  }
});

test('Invoice PDF: optional/empty sections (no payments, no change orders) still number correctly, not skipped or miscounted', async () => {
  const report = buildInvoiceReport({ long: false }); // compact fixture has empty paymentHistory/changeOrderLog
  const { pagesText, tocRows } = await generateAndVerify(report, INVOICE_TOC);
  const paymentHistoryIdx = INVOICE_TOC.findIndex((e) => e.heading === 'PAYMENT HISTORY');
  const changeOrderIdx = INVOICE_TOC.findIndex((e) => e.heading === 'CHANGE ORDER LOG');
  assert.equal(
    tocRows[paymentHistoryIdx].page,
    findFirstPageContaining(pagesText, 'PAYMENT HISTORY', 3)
  );
  assert.equal(
    tocRows[changeOrderIdx].page,
    findFirstPageContaining(pagesText, 'CHANGE ORDER LOG', 3)
  );
});

test('Invoice PDF: footer page labels match the physical page they are printed on', async () => {
  const { pagesText, totalPages } = await generateAndVerify(
    buildInvoiceReport({ long: true }),
    INVOICE_TOC
  );
  // The cover page (page 1) intentionally has no header/footer/page-number --
  // its own dark/white design is exempt (unrelated, pre-existing behavior).
  for (let i = 1; i < totalPages; i++) {
    const pageNum = i + 1;
    assert.ok(
      pagesText[i].includes(`Page ${pageNum}`),
      `page ${pageNum}'s own footer should read "Page ${pageNum}"`
    );
  }
});
