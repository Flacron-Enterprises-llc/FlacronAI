// Phase 39 (Coverage Determination Letter): approved authoring model (see
// PHASES.md) -- an authorized licensed adjuster enters every coverage
// decision (per-item approve/deny/pending, policy basis, coverage limits,
// deductible, rights & next steps) through a structured form. FlacronAI
// performs ZERO AI drafting of approval/denial, policy basis, rights, or
// payment decisions anywhere in this document type -- it only validates,
// calculates, formats, stores, and exports what the adjuster entered. This
// is the highest-stakes document type in the app (Golden Rule #2 explicitly
// lists coverage/liability/final-cost determinations as things AI must never
// decide), so nothing here is AI-reachable and every dollar figure is
// computed deterministically from adjuster-entered inputs plus the linked,
// already-approved Repair Estimate's own reused line items/depreciation
// schedule -- never re-entered, re-priced, or invented.
//
// Payment calculation mirrors the client's own sample letter exactly:
//   Approved RCV = sum of the linked estimate's line-item totals for items
//                  the adjuster marked "approved" (a denied/pending item
//                  contributes nothing to RCV).
//   Recoverable Depreciation (withheld) = sum of the linked estimate's
//                  depreciation-schedule rows whose entire related-line-item
//                  set is within the approved set (a row that also touches a
//                  non-approved item is excluded entirely rather than
//                  partially estimated -- see PROGRESS.md design decision).
//   Initial Payment (ACV) = Approved RCV - Deductible - Recoverable Depreciation.
//
// Rounding: integer cents throughout, converted to a decimal dollar amount
// only at the point a figure is returned (same discipline as
// estimateCalculations.js / invoiceCalculations.js).

const MAX_COVERAGE_LIMITS = 20;
const MAX_ITEMS = 200;
const MAX_RIGHTS = 20;
const MAX_ENCLOSURES = 20;
const MAX_MONEY = 100_000_000;
const DETERMINATIONS = new Set(['approved', 'denied', 'pending']);

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);
const toCents = (amount) => Math.round(amount * 100);
const centsToAmount = (cents) => cents / 100;
const cleanString = (v, maxLen) => String(v ?? '').trim().slice(0, maxLen);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Same "reviewed = exports clean" definition reports.js uses (isReviewed) --
// duplicated here (not imported) so this module stays a pure, dependency-free
// function that backend/test/coverage-letter.test.js can exercise directly.
const isReviewedStatus = (status) =>
  status === 'finalized' || status === 'approved' || status === 'completed';

const validateAddressee = (raw) => {
  const row = raw && typeof raw === 'object' ? raw : {};
  const name = cleanString(row.name, 150);
  const address = cleanString(row.address, 300);
  if (!name) return { error: 'addressee.name is required' };
  if (!address) return { error: 'addressee.address is required' };
  return { value: { name, address } };
};

const validateAdjusterOfRecord = (raw) => {
  const row = raw && typeof raw === 'object' ? raw : {};
  const name = cleanString(row.name, 150);
  const title = cleanString(row.title, 150);
  const phone = cleanString(row.phone, 40);
  const email = cleanString(row.email, 150);
  if (!name) return { error: 'adjusterOfRecord.name is required' };
  if (!title) return { error: 'adjusterOfRecord.title is required' };
  return { value: { name, title, phone, email } };
};

const validateLetterDate = (value) => {
  const v = cleanString(value, 10);
  if (!DATE_RE.test(v)) return { error: 'letterDate must be a valid date (YYYY-MM-DD)' };
  return { value: v };
};

const validateDeductible = (raw) => {
  const row = raw && typeof raw === 'object' ? raw : {};
  const description = cleanString(row.description, 200);
  const amount = Number(row.amount);
  if (!description) return { error: 'deductible.description is required' };
  if (!isFiniteNumber(amount) || amount < 0 || amount > MAX_MONEY) {
    return { error: 'deductible.amount must be a non-negative finite number' };
  }
  return { value: { description, amount } };
};

const validateCoverageLimits = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'At least one coverage limit row is required' };
  }
  if (raw.length > MAX_COVERAGE_LIMITS) {
    return { error: `At most ${MAX_COVERAGE_LIMITS} coverage limit rows are allowed` };
  }
  const rows = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] && typeof raw[i] === 'object' ? raw[i] : {};
    const coverageType = cleanString(row.coverageType, 80);
    const description = cleanString(row.description, 300);
    const limit = Number(row.limit);
    if (!coverageType) return { error: `Coverage limit ${i + 1}: coverageType is required` };
    if (!description) return { error: `Coverage limit ${i + 1}: description is required` };
    if (!isFiniteNumber(limit) || limit < 0 || limit > MAX_MONEY) {
      return { error: `Coverage limit ${i + 1}: limit must be a non-negative finite number` };
    }
    rows.push({ coverageType, description, limit });
  }
  return { rows };
};

// Validates + normalizes `perItemDetermination`. `relatedLineItemCodes` are
// required (and must reference real codes on the linked estimate) for an
// "approved" row -- that's what feeds the Approved RCV total below. A
// "pending" row requires its own `pendingNote` (rendered in the "Items
// Pending Further Review" section, adjuster's own words, never invented).
const validatePerItemDetermination = (raw, lineItemCodes) => {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'At least one per-item determination is required' };
  }
  if (raw.length > MAX_ITEMS) {
    return { error: `At most ${MAX_ITEMS} per-item determinations are allowed` };
  }
  const rows = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] && typeof raw[i] === 'object' ? raw[i] : {};
    const item = cleanString(row.item, 200);
    const determination = cleanString(row.determination, 20);
    const policyBasis = cleanString(row.policyBasis, 500);
    const pendingNote = cleanString(row.pendingNote, 500);
    const relatedLineItemCodes = Array.isArray(row.relatedLineItemCodes)
      ? [...new Set(row.relatedLineItemCodes.map((c) => cleanString(c, 20)).filter(Boolean))]
      : [];

    if (!item) return { error: `Item ${i + 1}: item is required` };
    if (!DETERMINATIONS.has(determination)) {
      return { error: `Item ${i + 1}: determination must be one of approved, denied, pending` };
    }
    if (!policyBasis) return { error: `Item ${i + 1}: policyBasis is required` };
    if (determination === 'approved' && relatedLineItemCodes.length === 0) {
      return { error: `Item ${i + 1}: an approved item must reference at least one linked estimate line item code` };
    }
    if (determination === 'pending' && !pendingNote) {
      return { error: `Item ${i + 1}: a pending item requires a pendingNote explaining what is outstanding` };
    }
    for (const code of relatedLineItemCodes) {
      if (!lineItemCodes.has(code)) {
        return { error: `Item ${i + 1}: unknown linked estimate line item code "${code}"` };
      }
    }
    rows.push({ item, determination, policyBasis, relatedLineItemCodes, pendingNote });
  }
  return { rows };
};

const validateRightsAndNextSteps = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'At least one rights & next steps entry is required' };
  }
  if (raw.length > MAX_RIGHTS) {
    return { error: `At most ${MAX_RIGHTS} rights & next steps entries are allowed` };
  }
  const rows = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] && typeof raw[i] === 'object' ? raw[i] : {};
    const heading = cleanString(row.heading, 150);
    const text = cleanString(row.text, 1000);
    if (!heading) return { error: `Rights & next steps entry ${i + 1}: heading is required` };
    if (!text) return { error: `Rights & next steps entry ${i + 1}: text is required` };
    rows.push({ heading, text });
  }
  return { rows };
};

const validateEnclosures = (raw) => {
  if (raw === undefined || raw === null) return { rows: [] };
  if (!Array.isArray(raw)) return { error: 'enclosures must be an array' };
  if (raw.length > MAX_ENCLOSURES) {
    return { error: `At most ${MAX_ENCLOSURES} enclosures are allowed` };
  }
  const rows = raw.map((e) => cleanString(e, 200)).filter(Boolean);
  return { rows };
};

// RCV of an "approved" set of line item codes -- the sum of their lineTotal
// (never a client-supplied number; `lineItems` here is the linked estimate's
// own already-validated array).
const computeApprovedRCVCents = (approvedCodes, lineItems) => {
  const byCode = new Map(lineItems.map((li) => [li.code, li]));
  let cents = 0;
  for (const code of approvedCodes) {
    const li = byCode.get(code);
    if (li) cents += toCents(li.lineTotal);
  }
  return cents;
};

// A depreciation row is only counted toward recoverable depreciation withheld
// if EVERY line item it names is in the approved set -- a row that spans a
// denied/pending item is excluded entirely rather than partially estimated
// (see module header + PROGRESS.md).
const computeRecoverableDepreciationCents = (approvedCodes, depreciationSchedule) => {
  let cents = 0;
  for (const row of depreciationSchedule || []) {
    const codes = row.relatedLineItemCodes || [];
    if (codes.length && codes.every((c) => approvedCodes.has(c))) {
      cents += toCents(row.depreciationAmount);
    }
  }
  return cents;
};

const computeCoverageTotals = (perItemDetermination, lineItems, depreciationSchedule, deductibleAmount) => {
  const approvedCodes = new Set(
    perItemDetermination.filter((r) => r.determination === 'approved').flatMap((r) => r.relatedLineItemCodes)
  );
  const approvedRCVCents = computeApprovedRCVCents(approvedCodes, lineItems);
  const recoverableDepreciationCents = computeRecoverableDepreciationCents(approvedCodes, depreciationSchedule);
  const deductibleCents = toCents(deductibleAmount);
  const initialPaymentCents = approvedRCVCents - deductibleCents - recoverableDepreciationCents;
  return {
    approvedRCV: centsToAmount(approvedRCVCents),
    deductible: centsToAmount(deductibleCents),
    recoverableDepreciationWithheld: centsToAmount(recoverableDepreciationCents),
    initialPayment: centsToAmount(initialPaymentCents),
    approvedCount: perItemDetermination.filter((r) => r.determination === 'approved').length,
    deniedCount: perItemDetermination.filter((r) => r.determination === 'denied').length,
    pendingCount: perItemDetermination.filter((r) => r.determination === 'pending').length,
  };
};

// Server-side eligibility gate: a Coverage Determination Letter may only be
// generated from an already-FINALIZED base report and an already-APPROVED
// (finalized) Repair Estimate that is actually linked to that same report --
// never a draft of either. Pure function so it's directly unit-testable
// without a Firestore mock (see backend/test/coverage-letter.test.js).
const validateSourceEligibility = ({ parentStatus, estimate, expectedRelatedReportId }) => {
  if (!isReviewedStatus(parentStatus)) {
    return { error: 'The linked report must be finalized (reviewed and approved) before a Coverage Determination Letter can be generated.', code: 'REPORT_NOT_FINALIZED' };
  }
  if (!estimate || estimate.documentType !== 'RepairEstimate') {
    return { error: 'A Coverage Determination Letter can only be generated from an existing Repair Estimate.', code: 'SOURCE_NOT_ESTIMATE' };
  }
  if (estimate.relatedReportId !== expectedRelatedReportId) {
    return { error: 'The Repair Estimate is not linked to this report.', code: 'ESTIMATE_NOT_LINKED' };
  }
  if (!isReviewedStatus(estimate.status)) {
    return { error: 'The Repair Estimate must be finalized (approved) before a Coverage Determination Letter can be generated.', code: 'ESTIMATE_NOT_APPROVED' };
  }
  return { ok: true };
};

// Top-level entry point the route handler calls with the raw request body
// (create or revise) plus the linked Repair Estimate's own validated
// `lineItems`/`depreciationSchedule` (a frozen snapshot on revise, matching
// Phase 38's Invoice precedent). Returns { error } on any invalid input,
// otherwise the fully computed, storage-ready letter fields.
const validateAndComputeCoverageLetter = (body = {}, lineItems = [], depreciationSchedule = []) => {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return { error: 'The linked Repair Estimate has no line items to reference' };
  }
  const lineItemCodes = new Set(lineItems.map((li) => li.code));

  const { value: addressee, error: addresseeError } = validateAddressee(body.addressee);
  if (addresseeError) return { error: addresseeError };

  const { value: adjusterOfRecord, error: adjusterError } = validateAdjusterOfRecord(body.adjusterOfRecord);
  if (adjusterError) return { error: adjusterError };

  const { value: letterDate, error: letterDateError } = validateLetterDate(body.letterDate);
  if (letterDateError) return { error: letterDateError };

  const determinationSummary = cleanString(body.determinationSummary, 150);
  if (!determinationSummary) return { error: 'determinationSummary is required' };

  const { value: deductible, error: deductibleError } = validateDeductible(body.deductible);
  if (deductibleError) return { error: deductibleError };

  const { rows: coverageLimits, error: coverageLimitsError } = validateCoverageLimits(body.coverageLimits);
  if (coverageLimitsError) return { error: coverageLimitsError };

  const { rows: perItemDetermination, error: itemsError } = validatePerItemDetermination(
    body.perItemDetermination,
    lineItemCodes
  );
  if (itemsError) return { error: itemsError };

  const { rows: rightsAndNextSteps, error: rightsError } = validateRightsAndNextSteps(body.rightsAndNextSteps);
  if (rightsError) return { error: rightsError };

  const { rows: enclosures, error: enclosuresError } = validateEnclosures(body.enclosures);
  if (enclosuresError) return { error: enclosuresError };

  const changeSummary = cleanString(body.changeSummary, 300);

  const totals = computeCoverageTotals(perItemDetermination, lineItems, depreciationSchedule, deductible.amount);

  return {
    addressee,
    adjusterOfRecord,
    letterDate,
    determinationSummary,
    deductible,
    coverageLimits,
    perItemDetermination,
    rightsAndNextSteps,
    enclosures,
    changeSummary,
    lineItems,
    depreciationSchedule,
    totals,
  };
};

module.exports = {
  MAX_COVERAGE_LIMITS,
  MAX_ITEMS,
  MAX_RIGHTS,
  MAX_ENCLOSURES,
  MAX_MONEY,
  DETERMINATIONS,
  isFiniteNumber,
  toCents,
  centsToAmount,
  isReviewedStatus,
  validateAddressee,
  validateAdjusterOfRecord,
  validateLetterDate,
  validateDeductible,
  validateCoverageLimits,
  validatePerItemDetermination,
  validateRightsAndNextSteps,
  validateEnclosures,
  computeApprovedRCVCents,
  computeRecoverableDepreciationCents,
  computeCoverageTotals,
  validateSourceEligibility,
  validateAndComputeCoverageLetter,
};
