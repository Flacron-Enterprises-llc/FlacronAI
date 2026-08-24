// Phase 37 (Repair Estimate with Depreciation Schedule): every dollar figure
// in a Repair Estimate -- line totals, subtotal, overhead & profit, tax,
// RCV, depreciation $, ACV, and the grand total -- is computed HERE,
// deterministically, from adjuster/user-entered inputs (qty, unitPrice,
// percentages, which line items back which depreciation row). The AI is
// never called from this module and never supplies or influences any dollar
// amount -- Golden Rule #2 explicitly lists "final repair costs" as something
// AI must not determine. This module has no Firestore/AI/network dependency,
// so it is fully unit-testable in isolation (see backend/test/repair-estimate.test.js).
//
// Rounding: every intermediate amount is computed in integer cents first
// (Math.round(dollars * 100)) and only converted back to a decimal dollar
// amount at the point it's returned. Summing pre-rounded cents avoids the
// floating-point drift that summing rounded-to-2-decimal JS numbers can
// introduce on inputs like $0.005/unit at high quantities.

const MAX_LINE_ITEMS = 200;
const MAX_DEPRECIATION_ROWS = 100;
const MAX_MONEY = 100_000_000; // per-unit-price / total ceiling -- blocks overflow/garbage input
const MAX_QTY = 1_000_000;

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);

const toCents = (amount) => Math.round(amount * 100);
const centsToAmount = (cents) => cents / 100;

const cleanString = (v, maxLen) => String(v ?? '').trim().slice(0, maxLen);

// Validates + normalizes the raw `lineItems` array from a request body.
// `lineTotal`/`lineTotalCents` are always computed here from qty*unitPrice --
// any `lineTotal` a client sent is ignored, never trusted.
const validateLineItems = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'At least one line item is required' };
  }
  if (raw.length > MAX_LINE_ITEMS) {
    return { error: `At most ${MAX_LINE_ITEMS} line items are allowed` };
  }

  const items = [];
  const seenCodes = new Set();
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] && typeof raw[i] === 'object' ? raw[i] : {};
    const code = cleanString(row.code, 20);
    const description = cleanString(row.description, 200);
    const unit = cleanString(row.unit, 10);
    const qty = Number(row.qty);
    const unitPrice = Number(row.unitPrice);
    const taxable = row.taxable !== false;

    if (!code) return { error: `Line item ${i + 1}: code is required` };
    if (seenCodes.has(code)) return { error: `Line item ${i + 1}: duplicate code "${code}"` };
    if (!description) return { error: `Line item ${i + 1}: description is required` };
    if (!unit) return { error: `Line item ${i + 1}: unit is required` };
    if (!isFiniteNumber(qty) || qty <= 0 || qty > MAX_QTY) {
      return {
        error: `Line item ${i + 1}: qty must be a positive finite number no greater than ${MAX_QTY}`,
      };
    }
    if (!isFiniteNumber(unitPrice) || unitPrice < 0 || unitPrice > MAX_MONEY) {
      return {
        error: `Line item ${i + 1}: unitPrice must be a non-negative finite number no greater than ${MAX_MONEY}`,
      };
    }

    seenCodes.add(code);
    const lineTotalCents = toCents(qty * unitPrice);
    items.push({
      code,
      description,
      qty,
      unit,
      unitPrice,
      taxable,
      lineTotal: centsToAmount(lineTotalCents),
      lineTotalCents,
    });
  }
  return { items };
};

// Validates + normalizes `depreciationSchedule`. Each row's RCV is the sum
// of the `lineTotal`s of the line items it names in `relatedLineItemCodes`
// (never a client-supplied number) -- depreciation $ and ACV are then
// derived from that RCV and the row's own (adjuster-judged) depreciationPercent.
const validateDepreciationSchedule = (raw, lineItems) => {
  if (raw === undefined || raw === null) return { rows: [] };
  if (!Array.isArray(raw)) return { error: 'depreciationSchedule must be an array' };
  if (raw.length > MAX_DEPRECIATION_ROWS) {
    return { error: `At most ${MAX_DEPRECIATION_ROWS} depreciation rows are allowed` };
  }

  const byCode = new Map(lineItems.map((li) => [li.code, li]));
  const rows = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] && typeof raw[i] === 'object' ? raw[i] : {};
    const item = cleanString(row.item, 200);
    const condition = cleanString(row.condition, 40);
    const ageYears = Number(row.ageYears);
    const lifeExpectancyYears = Number(row.lifeExpectancyYears);
    const depreciationPercent = Number(row.depreciationPercent);
    const relatedLineItemCodes = Array.isArray(row.relatedLineItemCodes)
      ? [...new Set(row.relatedLineItemCodes.map((c) => cleanString(c, 20)).filter(Boolean))]
      : [];

    if (!item) return { error: `Depreciation row ${i + 1}: item is required` };
    if (!condition) return { error: `Depreciation row ${i + 1}: condition is required` };
    if (!isFiniteNumber(ageYears) || ageYears < 0 || ageYears > 200) {
      return { error: `Depreciation row ${i + 1}: ageYears must be a finite number between 0 and 200` };
    }
    if (!isFiniteNumber(lifeExpectancyYears) || lifeExpectancyYears <= 0 || lifeExpectancyYears > 200) {
      return {
        error: `Depreciation row ${i + 1}: lifeExpectancyYears must be a finite number greater than 0 and no greater than 200`,
      };
    }
    if (!isFiniteNumber(depreciationPercent) || depreciationPercent < 0 || depreciationPercent > 100) {
      return {
        error: `Depreciation row ${i + 1}: depreciationPercent must be a finite number between 0 and 100`,
      };
    }
    if (relatedLineItemCodes.length === 0) {
      return {
        error: `Depreciation row ${i + 1}: relatedLineItemCodes must reference at least one line item code`,
      };
    }
    for (const code of relatedLineItemCodes) {
      if (!byCode.has(code)) {
        return { error: `Depreciation row ${i + 1}: unknown line item code "${code}"` };
      }
    }

    const rcvCents = relatedLineItemCodes.reduce((sum, code) => sum + byCode.get(code).lineTotalCents, 0);
    const depreciationAmountCents = Math.round(rcvCents * (depreciationPercent / 100));
    const acvCents = rcvCents - depreciationAmountCents;

    rows.push({
      item,
      condition,
      ageYears,
      lifeExpectancyYears,
      depreciationPercent,
      relatedLineItemCodes,
      rcv: centsToAmount(rcvCents),
      depreciationAmount: centsToAmount(depreciationAmountCents),
      acv: centsToAmount(acvCents),
    });
  }
  return { rows };
};

// A 0-100 percentage input (overheadProfitPercent / taxRatePercent).
const validatePercent = (value, label) => {
  if (value === undefined || value === null || value === '') {
    return { error: `${label} is required` };
  }
  const n = Number(value);
  if (!isFiniteNumber(n) || n < 0 || n > 100) {
    return { error: `${label} must be a finite number between 0 and 100` };
  }
  return { value: n };
};

// Subtotal = sum of every line item's total, regardless of taxability.
// Overhead & Profit is applied to the full subtotal.
// Tax applies only to line items flagged `taxable` (default true) --
// mirrors the "materials taxed, labor not taxed" split adjusters commonly
// need, without requiring a separate materials/labor line-item type.
const computeTotals = (lineItems, overheadProfitPercent, taxRatePercent) => {
  const subtotalCents = lineItems.reduce((s, li) => s + li.lineTotalCents, 0);
  const overheadProfitCents = Math.round(subtotalCents * (overheadProfitPercent / 100));
  const taxableCents = lineItems
    .filter((li) => li.taxable)
    .reduce((s, li) => s + li.lineTotalCents, 0);
  const taxCents = Math.round(taxableCents * (taxRatePercent / 100));
  const grandTotalCents = subtotalCents + overheadProfitCents + taxCents;
  return {
    subtotal: centsToAmount(subtotalCents),
    overheadProfit: centsToAmount(overheadProfitCents),
    taxableAmount: centsToAmount(taxableCents),
    tax: centsToAmount(taxCents),
    grandTotal: centsToAmount(grandTotalCents),
  };
};

// Top-level entry point the route handler calls with the raw request body
// (create or revise). Returns { error } on any invalid/negative/non-finite/
// out-of-range/unauthorized-reference input, otherwise the fully computed,
// storage-ready estimate fields. Any client-supplied computed field
// (lineTotal, rcv, depreciationAmount, acv, subtotal, tax, grandTotal, ...)
// is ignored -- everything returned here is freshly derived.
const validateAndComputeEstimate = (body = {}) => {
  const { items, error: lineItemsError } = validateLineItems(body.lineItems);
  if (lineItemsError) return { error: lineItemsError };

  const { rows: depreciationSchedule, error: depError } = validateDepreciationSchedule(
    body.depreciationSchedule,
    items
  );
  if (depError) return { error: depError };

  const { value: overheadProfitPercent, error: opError } = validatePercent(
    body.overheadProfitPercent,
    'overheadProfitPercent'
  );
  if (opError) return { error: opError };

  const { value: taxRatePercent, error: taxError } = validatePercent(
    body.taxRatePercent,
    'taxRatePercent'
  );
  if (taxError) return { error: taxError };

  const estimateNumber = cleanString(body.estimateNumber, 40);
  if (!estimateNumber) return { error: 'estimateNumber is required' };

  const changeSummary = cleanString(body.changeSummary, 300);

  const totals = computeTotals(items, overheadProfitPercent, taxRatePercent);

  return {
    lineItems: items.map(({ lineTotalCents, ...rest }) => rest),
    depreciationSchedule,
    overheadProfitPercent,
    taxRatePercent,
    taxBasis: cleanString(body.taxBasis, 200),
    priceListBasis: cleanString(body.priceListBasis, 200),
    preparedWith: cleanString(body.preparedWith, 200),
    estimateDate: cleanString(body.estimateDate, 40),
    estimateNumber,
    changeSummary,
    totals,
  };
};

module.exports = {
  MAX_LINE_ITEMS,
  MAX_DEPRECIATION_ROWS,
  MAX_MONEY,
  MAX_QTY,
  isFiniteNumber,
  toCents,
  centsToAmount,
  validateLineItems,
  validateDepreciationSchedule,
  validatePercent,
  computeTotals,
  validateAndComputeEstimate,
};
