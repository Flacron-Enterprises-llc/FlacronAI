// Phase 38 (Invoice Document): every dollar figure on an Invoice --
// services-rendered subtotal, taxable amount, tax, payments-received total,
// and balance due -- is computed HERE, deterministically, from (a) the
// linked Repair Estimate's own already-computed, already-validated
// `lineItems` (reused read-only as "Services Rendered", never re-entered or
// re-priced by this module) and (b) user/adjuster-entered invoice fields
// (tax rate, payment history, change order log). The AI is never called
// from this module and never supplies or influences any dollar amount --
// Golden Rule #2 explicitly lists "final repair costs" as something AI must
// not determine. This module has no Firestore/AI/network dependency, so it
// is fully unit-testable in isolation (see backend/test/invoice-report.test.js).
//
// Design decision (documented in PROGRESS.md): the Change Order Log is
// informational documentation only -- like the client's own sample invoice,
// where the one logged change order is already folded into a normal
// "General conditions" services-rendered line rather than being summed as a
// separate adjustment -- so `changeOrderLog` entries do NOT feed into the
// totals below. This avoids a real double-counting risk without a job-costing
// subsystem to disambiguate "already-billed" vs. "not-yet-billed" change
// orders, which is explicitly out of this phase's scope.
//
// Rounding: every intermediate amount is computed in integer cents first and
// only converted back to a decimal dollar amount at the point it's returned,
// avoiding floating-point drift when summing independently-rounded values.

const { addDaysToIsoDate } = require('./dateMath');

const MAX_CHANGE_ORDERS = 50;
const MAX_PAYMENTS = 100;
const MAX_MONEY = 100_000_000;
// QA fix: the Due Date is not a separate user-entered field -- it is always
// exactly Invoice Date + this many calendar days, matching the fixed,
// unchanged Payment Terms wording ("Net 30 days from invoice date.").
const DUE_DATE_TERM_DAYS = 30;

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);
const toCents = (amount) => Math.round(amount * 100);
const centsToAmount = (cents) => cents / 100;
const cleanString = (v, maxLen) => String(v ?? '').trim().slice(0, maxLen);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const validateBillTo = (raw) => {
  const row = raw && typeof raw === 'object' ? raw : {};
  const name = cleanString(row.name, 150);
  const address = cleanString(row.address, 300);
  if (!name) return { error: 'billTo.name is required' };
  if (!address) return { error: 'billTo.address is required' };
  return { value: { name, address } };
};

const validateRemitTo = (raw) => {
  const row = raw && typeof raw === 'object' ? raw : {};
  const name = cleanString(row.name, 150);
  const instructions = cleanString(row.instructions, 500);
  if (!name) return { error: 'remitTo.name is required' };
  if (!instructions) return { error: 'remitTo.instructions is required' };
  return { value: { name, instructions } };
};

const validateInvoiceDate = (value, label) => {
  const v = cleanString(value, 10);
  if (!DATE_RE.test(v)) return { error: `${label} must be a valid date (YYYY-MM-DD)` };
  return { value: v };
};

// Purely informational log entries (see header comment) -- amount is not
// summed into any total, but is still validated as a real finite number so
// the rendered document never shows garbage/NaN.
const validateChangeOrderLog = (raw) => {
  if (raw === undefined || raw === null) return { rows: [] };
  if (!Array.isArray(raw)) return { error: 'changeOrderLog must be an array' };
  if (raw.length > MAX_CHANGE_ORDERS) {
    return { error: `At most ${MAX_CHANGE_ORDERS} change order entries are allowed` };
  }
  const rows = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] && typeof raw[i] === 'object' ? raw[i] : {};
    const coNumber = cleanString(row.coNumber, 20);
    const description = cleanString(row.description, 200);
    const amount = Number(row.amount);
    if (!coNumber) return { error: `Change order ${i + 1}: coNumber is required` };
    if (!description) return { error: `Change order ${i + 1}: description is required` };
    if (!isFiniteNumber(amount) || Math.abs(amount) > MAX_MONEY) {
      return { error: `Change order ${i + 1}: amount must be a finite number` };
    }
    rows.push({ coNumber, description, amount });
  }
  return { rows };
};

// `amount` here IS a real dollar figure (a payment the insured/client has
// actually made), but it is user/adjuster-entered data being recorded, not a
// value computed or determined by this system or by AI.
const validatePaymentHistory = (raw) => {
  if (raw === undefined || raw === null) return { rows: [] };
  if (!Array.isArray(raw)) return { error: 'paymentHistory must be an array' };
  if (raw.length > MAX_PAYMENTS) {
    return { error: `At most ${MAX_PAYMENTS} payment history entries are allowed` };
  }
  const rows = [];
  let totalCents = 0;
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] && typeof raw[i] === 'object' ? raw[i] : {};
    const { value: date, error: dateError } = validateInvoiceDate(row.date, `Payment ${i + 1} date`);
    if (dateError) return { error: dateError };
    const description = cleanString(row.description, 200);
    const method = cleanString(row.method, 50);
    const amount = Number(row.amount);
    if (!description) return { error: `Payment ${i + 1}: description is required` };
    if (!method) return { error: `Payment ${i + 1}: method is required` };
    if (!isFiniteNumber(amount) || amount <= 0 || amount > MAX_MONEY) {
      return { error: `Payment ${i + 1}: amount must be a positive finite number` };
    }
    const amountCents = toCents(amount);
    totalCents += amountCents;
    rows.push({ date, description, method, amount: centsToAmount(amountCents) });
  }
  return { rows, totalCents };
};

const validatePercent = (value, label) => {
  if (value === undefined || value === null || value === '') return { value: 0 };
  const n = Number(value);
  if (!isFiniteNumber(n) || n < 0 || n > 100) {
    return { error: `${label} must be a finite number between 0 and 100` };
  }
  return { value: n };
};

// `servicesRendered` is the linked Repair Estimate's OWN already-validated
// `lineItems` (code/description/qty/unit/unitPrice/lineTotal/taxable) --
// passed in by the route, never accepted from the invoice request body, so
// an invoice can never claim services/pricing an approved estimate doesn't
// actually contain.
//
// QA fix: `overheadProfitPercent` is likewise supplied by the route from the
// linked Repair Estimate's own authoritative, already-persisted value (its
// `overheadProfitPercent` field for a new invoice, or this invoice's own
// already-stored snapshot of it for a revision) -- never accepted from the
// invoice request body. It used to be silently dropped entirely, so an
// invoice's total never included the estimate's O&P. Applied to the
// SERVICES subtotal only (mirrors estimateCalculations.js's own
// `computeTotals`, which applies O&P to its subtotal before tax) and, like
// the estimate's own calculation, is never itself taxed -- `taxableCents`
// below is computed purely from the services line items, unchanged.
const computeInvoiceTotals = (
  servicesRendered,
  overheadProfitPercent,
  taxRatePercent,
  paymentHistoryTotalCents
) => {
  const servicesSubtotalCents = servicesRendered.reduce(
    (s, li) => s + toCents(li.lineTotal),
    0
  );
  const overheadProfitCents = Math.round(
    servicesSubtotalCents * ((overheadProfitPercent || 0) / 100)
  );
  const taxableCents = servicesRendered
    .filter((li) => li.taxable !== false)
    .reduce((s, li) => s + toCents(li.lineTotal), 0);
  const taxCents = Math.round(taxableCents * (taxRatePercent / 100));
  // "Combined" = services + O&P, the subtotal tax is applied on top of.
  const combinedSubtotalCents = servicesSubtotalCents + overheadProfitCents;
  const balanceDueCents = combinedSubtotalCents + taxCents - paymentHistoryTotalCents;
  return {
    servicesSubtotal: centsToAmount(servicesSubtotalCents),
    overheadProfitPercent: overheadProfitPercent || 0,
    overheadProfit: centsToAmount(overheadProfitCents),
    combinedSubtotal: centsToAmount(combinedSubtotalCents),
    taxableAmount: centsToAmount(taxableCents),
    tax: centsToAmount(taxCents),
    paymentsReceivedTotal: centsToAmount(paymentHistoryTotalCents),
    balanceDue: centsToAmount(balanceDueCents),
  };
};

// Top-level entry point the route handler calls with the raw request body
// (create or revise), the linked Repair Estimate's own validated
// `lineItems`, and its authoritative `overheadProfitPercent`. Returns
// { error } on any invalid input, otherwise the fully computed,
// storage-ready invoice fields.
//
// QA fix: `overheadProfitPercent` is the estimate's own already-validated
// (0-100) percent -- unlike every other field here, it is NOT re-validated
// against `body` because it never comes from the request body at all (see
// the route handlers in reports.js: creation reads `estimate
// .overheadProfitPercent`, revision reads the invoice's OWN already-stored
// snapshot of it). A missing/non-finite value (an invoice created before
// this fix existed, or an estimate that itself predates the O&P field)
// defaults to 0 rather than erroring -- matches how a Repair Estimate with
// no/0% O&P must keep working, never a thrown validation error.
const validateAndComputeInvoice = (body = {}, servicesRendered = [], overheadProfitPercent = 0) => {
  if (!Array.isArray(servicesRendered) || servicesRendered.length === 0) {
    return { error: 'The linked Repair Estimate has no line items to bill' };
  }
  const safeOverheadProfitPercent =
    isFiniteNumber(Number(overheadProfitPercent)) &&
    Number(overheadProfitPercent) >= 0 &&
    Number(overheadProfitPercent) <= 100
      ? Number(overheadProfitPercent)
      : 0;

  const { value: billTo, error: billToError } = validateBillTo(body.billTo);
  if (billToError) return { error: billToError };

  const { value: remitTo, error: remitToError } = validateRemitTo(body.remitTo);
  if (remitToError) return { error: remitToError };

  const invoiceNumber = cleanString(body.invoiceNumber, 40);
  if (!invoiceNumber) return { error: 'invoiceNumber is required' };

  const { value: invoiceDate, error: invoiceDateError } = validateInvoiceDate(
    body.invoiceDate,
    'invoiceDate'
  );
  if (invoiceDateError) return { error: invoiceDateError };

  // QA fix: Due Date is never accepted from the client -- it is always
  // derived, authoritatively, from the just-validated invoiceDate. Any
  // `body.dueDate` the caller sends (a stale value, a manual edit, or a
  // deliberately manipulated one) is ignored entirely.
  const dueDate = addDaysToIsoDate(invoiceDate, DUE_DATE_TERM_DAYS);

  const { value: taxRatePercent, error: taxError } = validatePercent(
    body.taxRatePercent,
    'taxRatePercent'
  );
  if (taxError) return { error: taxError };

  const { rows: changeOrderLog, error: coError } = validateChangeOrderLog(body.changeOrderLog);
  if (coError) return { error: coError };

  const {
    rows: paymentHistory,
    totalCents: paymentHistoryTotalCents = 0,
    error: paymentError,
  } = validatePaymentHistory(body.paymentHistory);
  if (paymentError) return { error: paymentError };

  const changeSummary = cleanString(body.changeSummary, 300);
  const jobNumber = cleanString(body.jobNumber, 40);
  const paymentTerms = cleanString(body.paymentTerms, 500) || 'Net 30 days from invoice date.';
  const warrantyText = cleanString(body.warrantyText, 1000);

  const totals = computeInvoiceTotals(
    servicesRendered,
    safeOverheadProfitPercent,
    taxRatePercent,
    paymentHistoryTotalCents
  );

  return {
    billTo,
    remitTo,
    invoiceNumber,
    invoiceDate,
    dueDate,
    jobNumber,
    overheadProfitPercent: safeOverheadProfitPercent,
    taxRatePercent,
    changeOrderLog,
    paymentHistory,
    paymentTerms,
    warrantyText,
    changeSummary,
    servicesRendered,
    totals,
  };
};

module.exports = {
  MAX_CHANGE_ORDERS,
  MAX_PAYMENTS,
  MAX_MONEY,
  isFiniteNumber,
  toCents,
  centsToAmount,
  validateBillTo,
  validateRemitTo,
  validateInvoiceDate,
  validateChangeOrderLog,
  validatePaymentHistory,
  validatePercent,
  computeInvoiceTotals,
  validateAndComputeInvoice,
};
