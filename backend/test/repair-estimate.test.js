const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateLineItems,
  validateDepreciationSchedule,
  validatePercent,
  computeTotals,
  validateAndComputeEstimate,
  MAX_LINE_ITEMS,
  MAX_DEPRECIATION_ROWS,
} = require('../utils/estimateCalculations');
const { buildEstimateContent, formatMoney } = require('../utils/estimateContent');

// Phase 37 (Repair Estimate with Depreciation Schedule, PHASES.md): every
// dollar figure -- line totals, subtotal, O&P, tax, RCV, depreciation $, ACV,
// grand total -- is computed HERE in deterministic code from adjuster-entered
// inputs (qty, unitPrice, percentages, which line items back a depreciation
// row). The AI is never called anywhere in this module or route, per the
// approved rule in PHASES.md's Phase 37 entry ("AI must never provide or
// calculate dollar amounts"). All expected totals below are hand-verified.

// ── Line item validation + line totals ──────────────────────────────────

test('validateLineItems computes lineTotal = qty * unitPrice for a well-formed set', () => {
  const { items, error } = validateLineItems([
    { code: 'RFG-100', description: 'Remove & replace shingle roofing', qty: 42, unit: 'SQ', unitPrice: 385 },
    { code: 'GUT-200', description: 'Downspout replacement', qty: 2, unit: 'EA', unitPrice: 95 },
  ]);
  assert.equal(error, undefined);
  assert.equal(items[0].lineTotal, 16170); // 42 * 385
  assert.equal(items[1].lineTotal, 190); // 2 * 95
  assert.equal(items[0].taxable, true); // defaults to taxable
});

test('validateLineItems honors an explicit taxable:false flag', () => {
  const { items } = validateLineItems([
    { code: 'LAB-100', description: 'Labor (not taxed in this jurisdiction)', qty: 8, unit: 'HR', unitPrice: 75, taxable: false },
  ]);
  assert.equal(items[0].taxable, false);
});

test('validateLineItems rejects a missing/empty array', () => {
  assert.match(validateLineItems([]).error, /at least one line item/i);
  assert.match(validateLineItems(null).error, /at least one line item/i);
  assert.match(validateLineItems('nope').error, /at least one line item/i);
});

test('validateLineItems rejects more than the maximum number of line items', () => {
  const rows = Array.from({ length: MAX_LINE_ITEMS + 1 }, (_, i) => ({
    code: `X-${i}`,
    description: 'Item',
    qty: 1,
    unit: 'EA',
    unitPrice: 1,
  }));
  assert.match(validateLineItems(rows).error, new RegExp(`at most ${MAX_LINE_ITEMS}`, 'i'));
});

test('validateLineItems rejects negative, zero, NaN, and Infinity quantities', () => {
  const base = { code: 'A', description: 'Item', unit: 'EA', unitPrice: 10 };
  assert.match(validateLineItems([{ ...base, qty: -1 }]).error, /qty must be a positive finite number/);
  assert.match(validateLineItems([{ ...base, qty: 0 }]).error, /qty must be a positive finite number/);
  assert.match(validateLineItems([{ ...base, qty: NaN }]).error, /qty must be a positive finite number/);
  assert.match(validateLineItems([{ ...base, qty: Infinity }]).error, /qty must be a positive finite number/);
  assert.match(validateLineItems([{ ...base, qty: 2_000_000 }]).error, /qty must be a positive finite number/);
});

test('validateLineItems rejects negative, NaN, and Infinity unit prices, but allows zero', () => {
  const base = { code: 'A', description: 'Item', qty: 1, unit: 'EA' };
  assert.match(validateLineItems([{ ...base, unitPrice: -5 }]).error, /unitPrice must be a non-negative finite number/);
  assert.match(validateLineItems([{ ...base, unitPrice: NaN }]).error, /unitPrice must be a non-negative finite number/);
  assert.match(validateLineItems([{ ...base, unitPrice: Infinity }]).error, /unitPrice must be a non-negative finite number/);
  assert.equal(validateLineItems([{ ...base, unitPrice: 0 }]).error, undefined);
});

test('validateLineItems rejects a missing code, description, or unit', () => {
  const base = { code: 'A', description: 'Item', qty: 1, unit: 'EA', unitPrice: 1 };
  assert.match(validateLineItems([{ ...base, code: '' }]).error, /code is required/);
  assert.match(validateLineItems([{ ...base, description: '' }]).error, /description is required/);
  assert.match(validateLineItems([{ ...base, unit: '' }]).error, /unit is required/);
});

test('validateLineItems rejects duplicate codes', () => {
  const row = { code: 'DUP', description: 'Item', qty: 1, unit: 'EA', unitPrice: 1 };
  assert.match(validateLineItems([row, { ...row }]).error, /duplicate code/);
});

test('validateLineItems ignores a client-supplied lineTotal and recomputes it', () => {
  const { items } = validateLineItems([
    { code: 'A', description: 'Item', qty: 10, unit: 'EA', unitPrice: 5, lineTotal: 999999 },
  ]);
  assert.equal(items[0].lineTotal, 50); // 10 * 5, not the injected 999999
});

// ── Depreciation schedule: RCV/depreciation$/ACV computed in code ───────

test('validateDepreciationSchedule computes RCV from summed related line items, then depreciation $ and ACV', () => {
  const { items } = validateLineItems([
    { code: 'GUT-100', description: 'Gutters', qty: 160, unit: 'LF', unitPrice: 9.25 }, // 1480
    { code: 'GUT-200', description: 'Downspouts', qty: 2, unit: 'EA', unitPrice: 95 }, // 190
  ]);
  const { rows, error } = validateDepreciationSchedule(
    [
      {
        item: 'Gutters & downspouts',
        ageYears: 19,
        lifeExpectancyYears: 20,
        condition: 'Fair',
        depreciationPercent: 80,
        relatedLineItemCodes: ['GUT-100', 'GUT-200'],
      },
    ],
    items
  );
  assert.equal(error, undefined);
  assert.equal(rows[0].rcv, 1670); // 1480 + 190, hand-verified against the sample layout
  assert.equal(rows[0].depreciationAmount, 1336); // 1670 * 0.80
  assert.equal(rows[0].acv, 334); // 1670 - 1336
});

test('validateDepreciationSchedule defaults to an empty schedule when omitted, but rejects a non-array', () => {
  assert.deepEqual(validateDepreciationSchedule(undefined, []).rows, []);
  assert.deepEqual(validateDepreciationSchedule(null, []).rows, []);
  assert.match(validateDepreciationSchedule('nope', []).error, /must be an array/);
});

test('validateDepreciationSchedule rejects more than the maximum number of rows', () => {
  const rows = Array.from({ length: MAX_DEPRECIATION_ROWS + 1 }, () => ({
    item: 'X',
    ageYears: 1,
    lifeExpectancyYears: 10,
    condition: 'Fair',
    depreciationPercent: 10,
    relatedLineItemCodes: ['A'],
  }));
  assert.match(
    validateDepreciationSchedule(rows, [{ code: 'A', lineTotalCents: 100 }]).error,
    new RegExp(`at most ${MAX_DEPRECIATION_ROWS}`, 'i')
  );
});

test('validateDepreciationSchedule rejects a row referencing an unknown line item code', () => {
  const result = validateDepreciationSchedule(
    [{ item: 'X', ageYears: 1, lifeExpectancyYears: 10, condition: 'Fair', depreciationPercent: 10, relatedLineItemCodes: ['NOPE'] }],
    [{ code: 'A', lineTotalCents: 100 }]
  );
  assert.match(result.error, /unknown line item code "NOPE"/);
});

test('validateDepreciationSchedule rejects an empty relatedLineItemCodes list', () => {
  const result = validateDepreciationSchedule(
    [{ item: 'X', ageYears: 1, lifeExpectancyYears: 10, condition: 'Fair', depreciationPercent: 10, relatedLineItemCodes: [] }],
    [{ code: 'A', lineTotalCents: 100 }]
  );
  assert.match(result.error, /at least one line item code/);
});

test('validateDepreciationSchedule rejects out-of-range or non-finite age/life/depreciation values', () => {
  const lineItems = [{ code: 'A', lineTotalCents: 100 }];
  const base = { item: 'X', condition: 'Fair', relatedLineItemCodes: ['A'] };
  assert.match(
    validateDepreciationSchedule([{ ...base, ageYears: -1, lifeExpectancyYears: 10, depreciationPercent: 10 }], lineItems).error,
    /ageYears/
  );
  assert.match(
    validateDepreciationSchedule([{ ...base, ageYears: 1, lifeExpectancyYears: 0, depreciationPercent: 10 }], lineItems).error,
    /lifeExpectancyYears/
  );
  assert.match(
    validateDepreciationSchedule([{ ...base, ageYears: 1, lifeExpectancyYears: 10, depreciationPercent: 101 }], lineItems).error,
    /depreciationPercent/
  );
  assert.match(
    validateDepreciationSchedule([{ ...base, ageYears: 1, lifeExpectancyYears: 10, depreciationPercent: NaN }], lineItems).error,
    /depreciationPercent/
  );
});

// ── Percent validation ───────────────────────────────────────────────────

test('validatePercent requires a value and rejects out-of-range/non-finite input', () => {
  assert.match(validatePercent(undefined, 'taxRatePercent').error, /is required/);
  assert.match(validatePercent(-1, 'taxRatePercent').error, /between 0 and 100/);
  assert.match(validatePercent(101, 'taxRatePercent').error, /between 0 and 100/);
  assert.match(validatePercent(NaN, 'taxRatePercent').error, /between 0 and 100/);
  assert.equal(validatePercent(0, 'taxRatePercent').value, 0);
  assert.equal(validatePercent(8.25, 'taxRatePercent').value, 8.25);
});

// ── Totals math -- hand-verified end to end ──────────────────────────────

test('computeTotals: subtotal, O&P on full subtotal, tax on taxable-only items, grand total', () => {
  const { items } = validateLineItems([
    { code: 'A', description: 'Roofing', qty: 42, unit: 'SQ', unitPrice: 385 }, // 16170, taxable
    { code: 'B', description: 'Labor', qty: 8, unit: 'HR', unitPrice: 75, taxable: false }, // 600, not taxable
  ]);
  const totals = computeTotals(items, 10, 8.25);
  // subtotal = 16170 + 600 = 16770
  assert.equal(totals.subtotal, 16770);
  // O&P = 16770 * 0.10 = 1677.00, applied to the FULL subtotal
  assert.equal(totals.overheadProfit, 1677);
  // taxable base excludes the non-taxable labor line: only 16170
  assert.equal(totals.taxableAmount, 16170);
  // tax = 16170 * 0.0825 = 1334.025 -> rounds to 1334.03 (cents-based rounding)
  assert.equal(totals.tax, 1334.03);
  // grand total = 16770 + 1677 + 1334.03 = 19781.03
  assert.equal(totals.grandTotal, 19781.03);
});

test('computeTotals with 0% O&P and 0% tax returns the subtotal unchanged', () => {
  const { items } = validateLineItems([{ code: 'A', description: 'X', qty: 3, unit: 'EA', unitPrice: 100 }]);
  const totals = computeTotals(items, 0, 0);
  assert.equal(totals.subtotal, 300);
  assert.equal(totals.overheadProfit, 0);
  assert.equal(totals.tax, 0);
  assert.equal(totals.grandTotal, 300);
});

test('cents-based rounding avoids floating-point drift across many fractional-cent line items', () => {
  // 3 items at $0.10/unit x 3 units = $0.30 each; naive float summation of
  // three independently-rounded $0.30 values is exact here, but the
  // qty*unitPrice multiplication itself (0.1 * 3) is the classic float trap
  // this module's cents-first approach avoids.
  const { items } = validateLineItems([
    { code: 'A', description: 'Fastener', qty: 3, unit: 'EA', unitPrice: 0.1 },
    { code: 'B', description: 'Fastener', qty: 3, unit: 'EA', unitPrice: 0.1 },
    { code: 'C', description: 'Fastener', qty: 3, unit: 'EA', unitPrice: 0.1 },
  ]);
  assert.equal(items[0].lineTotal, 0.3);
  const totals = computeTotals(items, 0, 0);
  assert.equal(totals.subtotal, 0.9);
});

// ── Top-level validateAndComputeEstimate ─────────────────────────────────

const VALID_BODY = {
  estimateNumber: 'EST-2024-118-01',
  estimateDate: '2024-03-26',
  priceListBasis: 'Central TX Residential Restoration, March 2024',
  preparedWith: 'Flacron Engine, v2.3',
  overheadProfitPercent: 10,
  taxRatePercent: 8.25,
  taxBasis: 'materials only',
  lineItems: [
    { code: 'RFG-100', description: 'Roofing', qty: 42, unit: 'SQ', unitPrice: 385 },
    { code: 'GUT-100', description: 'Gutters', qty: 160, unit: 'LF', unitPrice: 9.25 },
  ],
  depreciationSchedule: [
    {
      item: 'Roof covering',
      ageYears: 19,
      lifeExpectancyYears: 25,
      condition: 'Fair',
      depreciationPercent: 68,
      relatedLineItemCodes: ['RFG-100'],
    },
  ],
};

test('validateAndComputeEstimate returns a fully computed, storage-ready estimate for a valid body', () => {
  const result = validateAndComputeEstimate(VALID_BODY);
  assert.equal(result.error, undefined);
  assert.equal(result.lineItems.length, 2);
  assert.equal(result.lineItems[0].lineTotal, 16170);
  assert.equal(result.depreciationSchedule[0].rcv, 16170);
  assert.equal(result.depreciationSchedule[0].depreciationAmount, 10995.6);
  assert.equal(result.depreciationSchedule[0].acv, 5174.4);
  assert.equal(result.totals.subtotal, 17650); // 16170 + 1480
  assert.equal(result.totals.grandTotal, 20871.13); // hand-verified above
  // No internal helper field (lineTotalCents) leaks into the stored shape.
  assert.equal(result.lineItems[0].lineTotalCents, undefined);
});

test('validateAndComputeEstimate rejects a missing estimateNumber', () => {
  assert.match(validateAndComputeEstimate({ ...VALID_BODY, estimateNumber: '' }).error, /estimateNumber is required/);
});

test('validateAndComputeEstimate propagates a line-item validation error', () => {
  assert.match(
    validateAndComputeEstimate({ ...VALID_BODY, lineItems: [{ code: 'A', description: '', qty: 1, unit: 'EA', unitPrice: 1 }] }).error,
    /description is required/
  );
});

test('validateAndComputeEstimate ignores any client-supplied computed totals field entirely', () => {
  const result = validateAndComputeEstimate({
    ...VALID_BODY,
    totals: { subtotal: 1, overheadProfit: 1, tax: 1, grandTotal: 1_000_000 },
  });
  assert.equal(result.totals.grandTotal, 20871.13); // recomputed from inputs, not the injected 1,000,000
});

// ── Content assembly (markdown) -- no AI, no dollar computation itself ──

test('buildEstimateContent renders the line item table, totals row, and revision history from already-computed values', () => {
  const computed = validateAndComputeEstimate(VALID_BODY);
  const revisionHistory = [{ version: 0, date: '2024-03-26', changeSummary: 'Initial estimate created', total: computed.totals.grandTotal }];
  const content = buildEstimateContent(
    { claimNumber: 'CLM-2024-WH-118', insuredName: 'Patricia Johnson', propertyAddress: '4127 Meadowbrook Lane' },
    computed,
    0,
    revisionHistory
  );
  assert.match(content, /## REPAIR ESTIMATE/);
  assert.match(content, /CLM-2024-WH-118/);
  assert.match(content, /\| RFG-100 \| Roofing \| 42 \| SQ \| \$385\.00 \| \$16,170\.00 \|/);
  assert.match(content, /TOTAL ESTIMATE \(Draft\) \| \$20,871\.13/);
  assert.match(content, /## DEPRECIATION SCHEDULE \(DRAFT\)/);
  assert.match(content, /\$5,174\.40/); // ACV, formatted
  assert.match(content, /## REVISION HISTORY/);
  assert.match(content, /Rev\. 0 \| 2024-03-26 \| Initial estimate created \| \$20,871\.13/);
  // Golden Rule #2: explicit AI-never-computes-dollars disclosure present.
  assert.match(content, /FlacronAI's AI does not generate, calculate, or determine any dollar amount/);
  assert.match(content, /Not a final report until reviewed and approved by a licensed adjuster/);
});

test('buildEstimateContent shows a plain no-schedule notice when depreciationSchedule is empty', () => {
  const computed = validateAndComputeEstimate({ ...VALID_BODY, depreciationSchedule: [] });
  const content = buildEstimateContent({}, computed, 0, [
    { version: 0, date: '2024-03-26', changeSummary: 'Initial estimate created', total: computed.totals.grandTotal },
  ]);
  assert.match(content, /No depreciation schedule has been entered for this estimate\./);
});

test('formatMoney renders 2-decimal, comma-grouped currency', () => {
  assert.equal(formatMoney(20871.13), '$20,871.13');
  assert.equal(formatMoney(0), '$0.00');
  assert.equal(formatMoney(1000000), '$1,000,000.00');
});
