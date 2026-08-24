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

const MAX_CHANGE_ORDERS = 50;
const MAX_PAYMENTS = 100;
const MAX_MONEY = 100_000_000;

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
const computeInvoiceTotals = (servicesRendered, taxRatePercent, paymentHistoryTotalCents) => {
  const servicesSubtotalCents = servicesRendered.reduce(
    (s, li) => s + toCents(li.lineTotal),
    0
  );
  const taxableCents = servicesRendered
    .filter((li) => li.taxable !== false)
    .reduce((s, li) => s + toCents(li.lineTotal), 0);
  const taxCents = Math.round(taxableCents * (taxRatePercent / 100));
  const combinedSubtotalCents = servicesSubtotalCents;
  const balanceDueCents = combinedSubtotalCents + taxCents - paymentHistoryTotalCents;
  return {
    servicesSubtotal: centsToAmount(servicesSubtotalCents),
    combinedSubtotal: centsToAmount(combinedSubtotalCents),
    taxableAmount: centsToAmount(taxableCents),
    tax: centsToAmount(taxCents),
    paymentsReceivedTotal: centsToAmount(paymentHistoryTotalCents),
    balanceDue: centsToAmount(balanceDueCents),
  };
};

// Top-level entry point the route handler calls with the raw request body
// (create or revise) plus the linked Repair Estimate's own validated
// `lineItems`. Returns { error } on any invalid input, otherwise the fully
// computed, storage-ready invoice fields.
const validateAndComputeInvoice = (body = {}, servicesRendered = []) => {
  if (!Array.isArray(servicesRendered) || servicesRendered.length === 0) {
    return { error: 'The linked Repair Estimate has no line items to bill' };
  }

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

  const { value: dueDate, error: dueDateError } = validateInvoiceDate(body.dueDate, 'dueDate');
  if (dueDateError) return { error: dueDateError };

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

  const totals = computeInvoiceTotals(servicesRendered, taxRatePercent, paymentHistoryTotalCents);

  return {
    billTo,
    remitTo,
    invoiceNumber,
    invoiceDate,
    dueDate,
    jobNumber,
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
