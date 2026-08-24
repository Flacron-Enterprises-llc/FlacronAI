const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateBillTo,
  validateRemitTo,
  validateInvoiceDate,
  validateChangeOrderLog,
  validatePaymentHistory,
  validatePercent,
  computeInvoiceTotals,
  validateAndComputeInvoice,
  MAX_CHANGE_ORDERS,
  MAX_PAYMENTS,
} = require('../utils/invoiceCalculations');
const { buildInvoiceContent, formatMoney } = require('../utils/invoiceContent');

// Phase 38 (Invoice Document, PHASES.md): every dollar figure on an Invoice
// -- services subtotal, taxable amount, tax, payments-received total, and
// balance due -- is computed HERE in deterministic code from the linked
// Repair Estimate's reused line items and adjuster-entered invoice fields
// (tax rate, payment history). The AI is never called anywhere in this
// module or its routes. The fixture below reproduces the client's own
// sample invoice PDF line-for-line so every expected total is hand-verified
// against a real reference document, not just internally self-consistent.

const SAMPLE_SERVICES = [
  { code: 'RFG-100', description: 'Roof covering replacement, composition shingle, incl. underlayment', qty: 42, unit: 'SQ', unitPrice: 385, lineTotal: 16170, taxable: true },
  { code: 'RID-100', description: 'Ridge cap shingles, remove & replace', qty: 60, unit: 'LF', unitPrice: 8.5, lineTotal: 510, taxable: true },
  { code: 'DRP-100', description: 'Drip edge, aluminum, remove & replace', qty: 180, unit: 'LF', unitPrice: 3.75, lineTotal: 675, taxable: true },
  { code: 'GUT-100', description: 'Gutter & downspout replacement, 4 elevations', qty: 1, unit: 'EA', unitPrice: 1670, lineTotal: 1670, taxable: true },
  { code: 'STU-100', description: 'Stucco patch, texture match & repaint — front elevation', qty: 1, unit: 'EA', unitPrice: 3168, lineTotal: 3168, taxable: true },
  { code: 'SKY-100', description: 'Skylight replacement, like kind & quality', qty: 2, unit: 'EA', unitPrice: 975, lineTotal: 1950, taxable: true },
  { code: 'GAR-100', description: 'Garage door panel replacement', qty: 3, unit: 'EA', unitPrice: 410, lineTotal: 1230, taxable: true },
  { code: 'CEI-100', description: 'Ceiling repair & repaint, master bedroom', qty: 1, unit: 'EA', unitPrice: 850, lineTotal: 850, taxable: true },
  { code: 'ATT-100', description: 'Attic decking repair, localized section', qty: 1, unit: 'EA', unitPrice: 1100, lineTotal: 1100, taxable: true },
  { code: 'GEN-100', description: 'General conditions — dumpster, protection, final cleanup', qty: 1, unit: 'EA', unitPrice: 650, lineTotal: 650, taxable: true },
];

// ── billTo / remitTo / date validation ──────────────────────────────────

test('validateBillTo requires both name and address', () => {
  assert.match(validateBillTo({}).error, /name is required/);
  assert.match(validateBillTo({ name: 'Patricia Johnson' }).error, /address is required/);
  assert.deepEqual(validateBillTo({ name: 'Patricia Johnson', address: '4127 Meadowbrook Lane' }).value, {
    name: 'Patricia Johnson',
    address: '4127 Meadowbrook Lane',
  });
});

test('validateRemitTo requires both name and instructions', () => {
  assert.match(validateRemitTo({}).error, /name is required/);
  assert.match(validateRemitTo({ name: 'Flacron Restoration Services' }).error, /instructions is required/);
});

test('validateInvoiceDate rejects malformed dates and accepts YYYY-MM-DD', () => {
  assert.match(validateInvoiceDate('04/30/2024', 'invoiceDate').error, /valid date/);
  assert.match(validateInvoiceDate('', 'invoiceDate').error, /valid date/);
  assert.equal(validateInvoiceDate('2024-04-30', 'invoiceDate').value, '2024-04-30');
});

// ── change order log: informational only, still validated ──────────────

test('validateChangeOrderLog accepts a well-formed log and rejects missing fields', () => {
  const { rows, error } = validateChangeOrderLog([
    { coNumber: 'CO-01', description: 'Added general conditions line per revised estimate Rev. 2', amount: 650 },
  ]);
  assert.equal(error, undefined);
  assert.equal(rows[0].amount, 650);
  assert.match(validateChangeOrderLog([{ description: 'x', amount: 1 }]).error, /coNumber is required/);
  assert.match(validateChangeOrderLog([{ coNumber: 'CO-01', amount: 1 }]).error, /description is required/);
  assert.match(validateChangeOrderLog([{ coNumber: 'CO-01', description: 'x', amount: NaN }]).error, /amount must be a finite number/);
});

test('validateChangeOrderLog rejects more than the maximum number of entries', () => {
  const rows = Array.from({ length: MAX_CHANGE_ORDERS + 1 }, (_, i) => ({
    coNumber: `CO-${i}`,
    description: 'x',
    amount: 1,
  }));
  assert.match(validateChangeOrderLog(rows).error, new RegExp(`at most ${MAX_CHANGE_ORDERS}`, 'i'));
});

test('validateChangeOrderLog defaults to an empty array when omitted', () => {
  assert.deepEqual(validateChangeOrderLog(undefined).rows, []);
  assert.deepEqual(validateChangeOrderLog(null).rows, []);
});

// ── payment history: real amounts, still user-entered not AI/computed ──

test('validatePaymentHistory computes the total in cents and rejects a non-positive amount', () => {
  const { rows, totalCents, error } = validatePaymentHistory([
    { date: '2024-04-02', description: 'Deposit — contract signing', method: 'ACH', amount: 5000 },
    { date: '2024-04-18', description: 'Progress payment — roofing complete', method: 'Check #1042', amount: 5000 },
  ]);
  assert.equal(error, undefined);
  assert.equal(totalCents, 1_000_000); // $10,000.00 in cents
  assert.equal(rows[0].amount, 5000);
  assert.match(validatePaymentHistory([{ date: '2024-04-02', description: 'x', method: 'ACH', amount: 0 }]).error, /positive finite number/);
  assert.match(validatePaymentHistory([{ date: '2024-04-02', description: 'x', method: 'ACH', amount: -5 }]).error, /positive finite number/);
});

test('validatePaymentHistory rejects a malformed date or missing description/method', () => {
  assert.match(validatePaymentHistory([{ date: 'April 2', description: 'x', method: 'ACH', amount: 1 }]).error, /valid date/);
  assert.match(validatePaymentHistory([{ date: '2024-04-02', method: 'ACH', amount: 1 }]).error, /description is required/);
  assert.match(validatePaymentHistory([{ date: '2024-04-02', description: 'x', amount: 1 }]).error, /method is required/);
});

test('validatePaymentHistory rejects more than the maximum number of entries', () => {
  const rows = Array.from({ length: MAX_PAYMENTS + 1 }, () => ({
    date: '2024-04-02',
    description: 'x',
    method: 'ACH',
    amount: 1,
  }));
  assert.match(validatePaymentHistory(rows).error, new RegExp(`at most ${MAX_PAYMENTS}`, 'i'));
});

test('validatePaymentHistory defaults to an empty array/zero total when omitted', () => {
  const { rows, totalCents } = validatePaymentHistory(undefined);
  assert.deepEqual(rows, []);
  assert.equal(totalCents, undefined); // no total key returned for the empty-input shortcut
});

test('validatePercent defaults to 0 when omitted, rejects out-of-range values', () => {
  assert.equal(validatePercent(undefined, 'taxRatePercent').value, 0);
  assert.equal(validatePercent('', 'taxRatePercent').value, 0);
  assert.match(validatePercent(-1, 'taxRatePercent').error, /between 0 and 100/);
  assert.match(validatePercent(101, 'taxRatePercent').error, /between 0 and 100/);
  assert.match(validatePercent(NaN, 'taxRatePercent').error, /between 0 and 100/);
});

// ── computeInvoiceTotals: hand-verified against the client's sample PDF ─

test('computeInvoiceTotals reproduces the client sample invoice exactly', () => {
  const totals = computeInvoiceTotals(SAMPLE_SERVICES, 8.25, 1_000_000 /* $10,000.00 in cents */);
  assert.equal(totals.servicesSubtotal, 27973); // Exterior 25373 + Interior 2600
  assert.equal(totals.combinedSubtotal, 27973);
  assert.equal(totals.taxableAmount, 27973); // all sample items taxable
  assert.equal(totals.tax, 2307.77); // 27973 * 0.0825 = 2307.7725 -> rounds to 2307.77
  assert.equal(totals.paymentsReceivedTotal, 10000);
  assert.equal(totals.balanceDue, 20280.77); // 27973 + 2307.77 - 10000, matches sample TOTAL DUE
});

test('computeInvoiceTotals excludes non-taxable services from the taxable base', () => {
  const services = [
    { lineTotal: 1000, taxable: true },
    { lineTotal: 500, taxable: false },
  ];
  const totals = computeInvoiceTotals(services, 10, 0);
  assert.equal(totals.servicesSubtotal, 1500);
  assert.equal(totals.taxableAmount, 1000);
  assert.equal(totals.tax, 100); // 10% of 1000, not 1500
  assert.equal(totals.balanceDue, 1600); // 1500 + 100 - 0
});

test('computeInvoiceTotals avoids float drift on repeated fractional-cent inputs', () => {
  const services = Array.from({ length: 7 }, () => ({ lineTotal: 0.1, taxable: true }));
  const totals = computeInvoiceTotals(services, 0, 0);
  assert.equal(totals.servicesSubtotal, 0.7); // not 0.7000000000000001
});

// ── validateAndComputeInvoice: top-level entry point ────────────────────

const baseInvoiceBody = () => ({
  billTo: { name: 'Patricia Johnson', address: '4127 Meadowbrook Lane, Austin, TX 78745' },
  remitTo: { name: 'Flacron Restoration Services', instructions: 'Check, ACH, or carrier direct-pay accepted' },
  invoiceNumber: 'INV-2024-0842',
  invoiceDate: '2024-04-30',
  dueDate: '2024-05-30',
  jobNumber: 'JOB-2024-118',
  taxRatePercent: 8.25,
  changeOrderLog: [{ coNumber: 'CO-01', description: 'Added general conditions line per revised estimate Rev. 2', amount: 650 }],
  paymentHistory: [
    { date: '2024-04-02', description: 'Deposit — contract signing', method: 'ACH', amount: 5000 },
    { date: '2024-04-18', description: 'Progress payment — roofing complete', method: 'Check #1042', amount: 5000 },
  ],
  changeSummary: 'Initial invoice created',
});

test('validateAndComputeInvoice rejects an empty/missing servicesRendered source', () => {
  assert.match(validateAndComputeInvoice(baseInvoiceBody(), []).error, /no line items to bill/);
  assert.match(validateAndComputeInvoice(baseInvoiceBody(), undefined).error, /no line items to bill/);
});

test('validateAndComputeInvoice reproduces the sample invoice end to end', () => {
  const result = validateAndComputeInvoice(baseInvoiceBody(), SAMPLE_SERVICES);
  assert.equal(result.error, undefined);
  assert.equal(result.totals.combinedSubtotal, 27973);
  assert.equal(result.totals.tax, 2307.77);
  assert.equal(result.totals.balanceDue, 20280.77);
  assert.equal(result.servicesRendered.length, SAMPLE_SERVICES.length);
  assert.deepEqual(result.billTo, { name: 'Patricia Johnson', address: '4127 Meadowbrook Lane, Austin, TX 78745' });
});

test('validateAndComputeInvoice ignores a client-supplied fake totals object and recomputes it', () => {
  const body = { ...baseInvoiceBody(), totals: { balanceDue: 1 } };
  const result = validateAndComputeInvoice(body, SAMPLE_SERVICES);
  assert.equal(result.totals.balanceDue, 20280.77); // not the injected 1
});

test('validateAndComputeInvoice rejects a missing invoiceNumber/billTo/remitTo/date', () => {
  assert.match(validateAndComputeInvoice({ ...baseInvoiceBody(), invoiceNumber: '' }, SAMPLE_SERVICES).error, /invoiceNumber is required/);
  assert.match(validateAndComputeInvoice({ ...baseInvoiceBody(), billTo: {} }, SAMPLE_SERVICES).error, /billTo.name is required/);
  assert.match(validateAndComputeInvoice({ ...baseInvoiceBody(), remitTo: {} }, SAMPLE_SERVICES).error, /remitTo.name is required/);
  assert.match(validateAndComputeInvoice({ ...baseInvoiceBody(), dueDate: 'not-a-date' }, SAMPLE_SERVICES).error, /dueDate must be a valid date/);
});

test('validateAndComputeInvoice defaults paymentTerms when omitted', () => {
  const body = baseInvoiceBody();
  delete body.paymentTerms;
  const result = validateAndComputeInvoice(body, SAMPLE_SERVICES);
  assert.equal(result.paymentTerms, 'Net 30 days from invoice date.');
});

// ── buildInvoiceContent: deterministic markdown assembly ────────────────

test('buildInvoiceContent renders the totals, disclosure, and change-order non-double-counting note', () => {
  const computed = validateAndComputeInvoice(baseInvoiceBody(), SAMPLE_SERVICES);
  const content = buildInvoiceContent({ claimNumber: 'CLM-2024-WH-118' }, computed, 0, [
    { version: 0, date: '2024-04-30', changeSummary: 'Initial invoice created', balanceDue: computed.totals.balanceDue },
  ]);
  assert.match(content, /## SERVICES RENDERED/);
  assert.match(content, /## INVOICE TOTALS/);
  assert.match(content, /\$27,973\.00/);
  assert.match(content, /\$2,307\.77/);
  assert.match(content, /\$20,280\.77/);
  assert.match(content, /does not generate, calculate, or determine any dollar amount/);
  assert.match(content, /not counted again in the invoice totals/);
  assert.match(content, /Not a final document until reviewed and approved/);
  assert.equal(formatMoney(20280.77), '$20,280.77');
});

test('buildInvoiceContent falls back to explicit empty-state notices with no payments/change orders', () => {
  const computed = validateAndComputeInvoice(
    { ...baseInvoiceBody(), changeOrderLog: [], paymentHistory: [] },
    SAMPLE_SERVICES
  );
  const content = buildInvoiceContent({ claimNumber: 'CLM-1' }, computed, 0, [
    { version: 0, date: '2024-04-30', changeSummary: 'Initial invoice created', balanceDue: computed.totals.balanceDue },
  ]);
  assert.match(content, /No payments have been recorded against this invoice yet\./);
  assert.match(content, /No change orders have been logged for this invoice\./);
});
