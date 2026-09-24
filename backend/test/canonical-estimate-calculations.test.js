const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateAndComputeCanonicalEstimate,
  computeReversePhotoIndex,
  CANONICAL_ESTIMATE_SCHEMA_VERSION,
} = require('../utils/canonicalEstimate');

// Phase 41 (Canonical Structured Estimate Data Model & Calculation Engine).
// Pure unit tests for the validation + calculation engine -- no Firestore,
// no HTTP. Every expected total below is hand-computed in integer cents;
// see canonicalEstimate.js's own header comment for the documented roll-up
// order this exercises: line-item subtotal -> permits -> general
// conditions -> manual adjustments -> [direct cost] -> taxable basis (never
// includes O&P -- see the 2026-09-18 correction below) -> tax -> O&P ->
// final total.

const li = (overrides = {}) => ({
  category: 'Drywall',
  room: 'Living Room',
  description: 'Replace water-damaged drywall',
  quantity: 10,
  unit: 'SF',
  materialUnitCost: 2,
  laborUnitCost: 3,
  ...overrides,
});

test('1. valid multi-line structured estimate calculation -- exact totals', () => {
  const body = {
    lineItems: [
      li({ id: 'li-1', quantity: 10, materialUnitCost: 2, laborUnitCost: 3 }), // 10 * 5.00 = 50.00
      li({ id: 'li-2', category: 'Flooring', quantity: 5, unit: 'SY', materialUnitCost: 20, laborUnitCost: 10 }), // 5 * 30.00 = 150.00
    ],
    overheadProfitPercent: 10,
    taxRatePercent: 8,
  };
  const result = validateAndComputeCanonicalEstimate(body);
  assert.equal(result.error, undefined, result.error);
  const t = result.totals;
  assert.equal(t.lineItemSubtotalCents, 20000); // 50 + 150
  assert.equal(t.directCostCents, 20000); // no permits/GC/adjustments
  assert.equal(t.overheadProfitCents, 2000); // 10% of 20000
  assert.equal(t.taxableBasisCents, 20000, 'O&P is never folded into the tax basis'); // both lines taxable, O&P excluded
  assert.equal(t.taxCents, 1600); // 8% of 20000 (NOT of 22000)
  assert.equal(t.grandTotalCents, 23600); // 20000 + 2000 + 1600
  assert.equal(t.grandTotal, 236);
});

test('2. material + labor + equipment unit-price reconciliation', () => {
  const body = {
    lineItems: [
      li({ id: 'li-1', quantity: 1, unit: 'EA', materialUnitCost: 100, laborUnitCost: 50, equipmentUnitCost: 25 }),
    ],
  };
  const result = validateAndComputeCanonicalEstimate(body);
  assert.equal(result.error, undefined, result.error);
  const item = result.lineItems[0];
  assert.equal(item.componentSumCents, 17500);
  assert.equal(item.unitPriceCents, 17500);
  assert.equal(item.lineTotalCents, 17500);
  assert.equal(item.userOverride.active, false);
});

test('2b. a submitted unitPrice that does not reconcile to the component sum is rejected', () => {
  const body = {
    lineItems: [
      li({ id: 'li-1', quantity: 1, unit: 'EA', materialUnitCost: 100, laborUnitCost: 50, equipmentUnitCost: 25, unitPrice: 180 }),
    ],
  };
  const result = validateAndComputeCanonicalEstimate(body);
  assert.equal(result.code, 'VALIDATION_ERROR');
  assert.match(result.error, /does not reconcile/);
});

test('3. explicit manual unit-price override preserves provenance', () => {
  const body = {
    lineItems: [
      li({
        id: 'li-1',
        quantity: 1,
        unit: 'EA',
        materialUnitCost: 100,
        laborUnitCost: 50,
        equipmentUnitCost: 25,
        userOverride: { active: true, unitPrice: 200, reason: 'Contractor quote reflects local material shortage' },
      }),
    ],
  };
  const result = validateAndComputeCanonicalEstimate(body);
  assert.equal(result.error, undefined, result.error);
  const item = result.lineItems[0];
  assert.equal(item.unitPriceCents, 20000);
  assert.equal(item.userOverride.active, true);
  assert.equal(item.userOverride.originalUnitPriceCents, 17500, 'the pre-override reconciled value must be preserved, not discarded');
  assert.equal(item.userOverride.reason, 'Contractor quote reflects local material shortage');
  assert.equal(result.userOverrideIndicators.hasOverrides, true);
  assert.deepEqual(result.userOverrideIndicators.overriddenLineItemIds, ['li-1']);
});

test('3b. an override without a reason is rejected', () => {
  const body = {
    lineItems: [
      li({ id: 'li-1', quantity: 1, unit: 'EA', materialUnitCost: 100, laborUnitCost: 50, userOverride: { active: true, unitPrice: 200 } }),
    ],
  };
  const result = validateAndComputeCanonicalEstimate(body);
  assert.equal(result.code, 'VALIDATION_ERROR');
  assert.match(result.error, /reason is required/);
});

test('4. quantity x unit-price rounding uses integer cents, not float math', () => {
  const body = {
    lineItems: [
      li({ id: 'li-1', quantity: 3, unit: 'SF', materialUnitCost: 0.335, laborUnitCost: 0 }),
    ],
  };
  const result = validateAndComputeCanonicalEstimate(body);
  assert.equal(result.error, undefined, result.error);
  const item = result.lineItems[0];
  assert.equal(item.materialUnitCostCents, 34); // Math.round(33.5) = 34
  assert.equal(item.unitPriceCents, 34);
  assert.equal(item.lineTotalCents, 102); // Math.round(3 * 34)
  assert.equal(item.lineTotal, 1.02);
});

test('5. permits / general conditions / manual adjustments feed into direct cost before overhead/profit', () => {
  const body = {
    lineItems: [li({ id: 'li-1', quantity: 1, unit: 'EA', materialUnitCost: 1000, laborUnitCost: 0 })], // $1000.00
    permits: [{ description: 'Building permit', amount: 150 }], // non-taxable by default
    generalConditions: [{ description: 'Dumpster rental', amount: 300 }], // taxable by default
    manualAdjustments: [{ description: 'Loyalty discount', amount: -50 }], // taxable by default, negative allowed
  };
  const result = validateAndComputeCanonicalEstimate(body);
  assert.equal(result.error, undefined, result.error);
  const t = result.totals;
  assert.equal(t.lineItemSubtotalCents, 100000);
  assert.equal(t.permitsTotalCents, 15000);
  assert.equal(t.generalConditionsTotalCents, 30000);
  assert.equal(t.manualAdjustmentsTotalCents, -5000);
  assert.equal(t.directCostCents, 140000); // 100000 + 15000 + 30000 - 5000
});

test('6. taxable basis excludes non-taxable permits AND overhead/profit, but includes taxable general conditions', () => {
  const body = {
    lineItems: [li({ id: 'li-1', quantity: 1, unit: 'EA', materialUnitCost: 1000, laborUnitCost: 0 })],
    permits: [{ description: 'Building permit', amount: 150 }], // non-taxable
    generalConditions: [{ description: 'Dumpster rental', amount: 300 }], // taxable
    overheadProfitPercent: 10,
    taxRatePercent: 5,
  };
  const result = validateAndComputeCanonicalEstimate(body);
  const t = result.totals;
  // directCost = 100000 + 15000 + 30000 = 145000; OP = 10% of 145000 = 14500
  assert.equal(t.directCostCents, 145000);
  assert.equal(t.overheadProfitCents, 14500);
  // taxable basis = taxable lineItems(100000) + taxable GC(30000) -- permit excluded (non-taxable), O&P excluded (never taxed)
  assert.equal(t.taxableBasisCents, 130000);
  assert.equal(t.taxCents, Math.round(130000 * 0.05));
});

test('7. overhead/profit is computed on direct cost (post permits/GC/adjustments), not on the raw line-item subtotal alone', () => {
  const body = {
    lineItems: [li({ id: 'li-1', quantity: 1, unit: 'EA', materialUnitCost: 1000, laborUnitCost: 0 })],
    permits: [{ description: 'Permit', amount: 150 }],
    generalConditions: [{ description: 'GC', amount: 300 }],
    manualAdjustments: [{ description: 'Discount', amount: -50 }],
    overheadProfitPercent: 10,
  };
  const result = validateAndComputeCanonicalEstimate(body);
  // directCost = 140000 (see test 5); OP must be 10% of 140000 = 14000, not 10% of 100000 = 10000
  assert.equal(result.totals.overheadProfitCents, 14000);
});

test('8. exact final roll-up order end-to-end', () => {
  const body = {
    lineItems: [li({ id: 'li-1', quantity: 1, unit: 'EA', materialUnitCost: 1000, laborUnitCost: 0 })],
    permits: [{ description: 'Permit', amount: 150 }],
    generalConditions: [{ description: 'GC', amount: 300, taxable: true }],
    manualAdjustments: [{ description: 'Discount', amount: -50 }],
    overheadProfitPercent: 10,
    taxRatePercent: 5,
  };
  const result = validateAndComputeCanonicalEstimate(body);
  const t = result.totals;
  assert.equal(t.directCostCents, 140000);
  assert.equal(t.overheadProfitCents, 14000);
  assert.equal(t.taxableBasisCents, 100000 + 30000 - 50 * 100); // taxable lineItem+GC+adjustment -- O&P excluded
  assert.equal(t.taxCents, Math.round(t.taxableBasisCents * 0.05));
  assert.equal(t.grandTotalCents, t.directCostCents + t.overheadProfitCents + t.taxCents, 'final total is exactly directCost + O&P + tax');
});

test('8b. verified reference case: $550.00 taxable services, O&P 10% = $55.00, tax = 8% of $550.00 (not $605.00) = $44.00, final total = $649.00', () => {
  const body = {
    lineItems: [li({ id: 'li-1', quantity: 1, unit: 'EA', materialUnitCost: 550, laborUnitCost: 0 })],
    overheadProfitPercent: 10,
    taxRatePercent: 8,
  };
  const result = validateAndComputeCanonicalEstimate(body);
  const t = result.totals;
  assert.equal(t.lineItemSubtotalCents, 55000);
  assert.equal(t.directCostCents, 55000);
  assert.equal(t.overheadProfitCents, 5500, 'O&P 10% of $550.00 = $55.00');
  assert.equal(t.taxableBasisCents, 55000, 'tax basis is the $550.00 services amount, not $605.00');
  assert.equal(t.taxCents, 4400, 'tax = 8% of $550.00 = $44.00, never 8% of $605.00');
  assert.equal(t.grandTotalCents, 64900);
  assert.equal(t.grandTotal, 649);
});

test('8c. O&P is added to the final total exactly once, and is never itself taxed', () => {
  const body = {
    lineItems: [li({ id: 'li-1', quantity: 1, unit: 'EA', materialUnitCost: 1000, laborUnitCost: 0 })],
    overheadProfitPercent: 20,
    taxRatePercent: 10,
  };
  const result = validateAndComputeCanonicalEstimate(body);
  const t = result.totals;
  // If O&P were (incorrectly) taxed, taxableBasis would be 100000 + 20000 = 120000 and tax would be 12000.
  assert.equal(t.overheadProfitCents, 20000);
  assert.equal(t.taxableBasisCents, 100000, 'O&P must not appear in the tax basis');
  assert.equal(t.taxCents, 10000, '10% of the $1000 services amount only');
  assert.equal(t.grandTotalCents, 100000 + 20000 + 10000);
  // O&P appears exactly once in the final total -- not folded into tax, not added twice.
  assert.equal(t.grandTotalCents, t.directCostCents + t.overheadProfitCents + t.taxCents);
});

test('8d. a non-taxable line item is excluded from the tax basis while a taxable one is included', () => {
  const body = {
    lineItems: [
      li({ id: 'li-1', quantity: 1, unit: 'EA', materialUnitCost: 100, laborUnitCost: 0, taxable: true }),
      li({ id: 'li-2', quantity: 1, unit: 'EA', materialUnitCost: 200, laborUnitCost: 0, taxable: false }),
    ],
    taxRatePercent: 10,
  };
  const result = validateAndComputeCanonicalEstimate(body);
  const t = result.totals;
  assert.equal(t.lineItemSubtotalCents, 30000); // both count toward the subtotal/direct cost
  assert.equal(t.taxableBasisCents, 10000, 'only the taxable $100 line item counts toward tax');
  assert.equal(t.taxCents, 1000);
});

test('8e. an explicitly taxable permit is correctly included in the tax basis (overriding its non-taxable default)', () => {
  const body = {
    lineItems: [li({ id: 'li-1', quantity: 1, unit: 'EA', materialUnitCost: 500, laborUnitCost: 0 })],
    permits: [{ description: 'Taxable inspection fee', amount: 100, taxable: true }],
    taxRatePercent: 10,
  };
  const result = validateAndComputeCanonicalEstimate(body);
  const t = result.totals;
  assert.equal(t.taxableBasisCents, 50000 + 10000, 'the permit was explicitly marked taxable, so it counts');
  assert.equal(t.taxCents, Math.round((50000 + 10000) * 0.1));
});

test('9. server ignores a client-supplied totals/grandTotal payload -- it is never read', () => {
  const body = {
    lineItems: [li({ id: 'li-1', quantity: 1, unit: 'EA', materialUnitCost: 100, laborUnitCost: 0 })],
    totals: { grandTotal: 999999, grandTotalCents: 99999900 },
    grandTotal: 999999,
  };
  const result = validateAndComputeCanonicalEstimate(body);
  assert.equal(result.totals.grandTotalCents, 10000, 'the real computed total (1 x $100.00), not the manipulated payload');
});

test('10. zero-value and optional-component handling (equipmentCost/permits/GC/adjustments all omitted)', () => {
  const body = {
    lineItems: [li({ id: 'li-1', quantity: 1, unit: 'EA', materialUnitCost: 50, laborUnitCost: 0 })],
  };
  const result = validateAndComputeCanonicalEstimate(body);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.lineItems[0].equipmentUnitCostCents, 0);
  assert.deepEqual(result.permits, []);
  assert.deepEqual(result.generalConditions, []);
  assert.deepEqual(result.manualAdjustments, []);
  assert.equal(result.totals.permitsTotalCents, 0);
  assert.equal(result.totals.overheadProfitCents, 0); // percent omitted -> defaults to 0, not an error
  assert.equal(result.totals.taxCents, 0);
});

test('11a. negative/non-finite/excessive quantity is rejected, not silently coerced', () => {
  for (const bad of [-5, NaN, Infinity, 0, 2_000_000]) {
    const body = { lineItems: [li({ id: 'li-1', quantity: bad })] };
    const result = validateAndComputeCanonicalEstimate(body);
    assert.equal(result.code, 'VALIDATION_ERROR', `quantity ${bad} must be rejected`);
  }
});

test('11b. negative money component is rejected', () => {
  const body = { lineItems: [li({ id: 'li-1', materialUnitCost: -10 })] };
  const result = validateAndComputeCanonicalEstimate(body);
  assert.equal(result.code, 'VALIDATION_ERROR');
});

test('11c. an unsupported unit is rejected', () => {
  const body = { lineItems: [li({ id: 'li-1', unit: 'FURLONG' })] };
  const result = validateAndComputeCanonicalEstimate(body);
  assert.equal(result.code, 'VALIDATION_ERROR');
  assert.match(result.error, /not a supported unit/);
});

test('11d. missing required text fields (category/room/description) are rejected', () => {
  assert.equal(validateAndComputeCanonicalEstimate({ lineItems: [li({ id: 'a', category: '' })] }).code, 'VALIDATION_ERROR');
  assert.equal(validateAndComputeCanonicalEstimate({ lineItems: [li({ id: 'b', room: '' })] }).code, 'VALIDATION_ERROR');
  assert.equal(validateAndComputeCanonicalEstimate({ lineItems: [li({ id: 'c', description: '' })] }).code, 'VALIDATION_ERROR');
});

test('11e. an oversized line-item array is rejected', () => {
  const lineItems = Array.from({ length: 501 }, (_, i) => li({ id: `li-${i}` }));
  const result = validateAndComputeCanonicalEstimate({ lineItems });
  assert.equal(result.code, 'VALIDATION_ERROR');
  assert.match(result.error, /At most 500/);
});

test('12a. single-currency enforcement: a matching per-line currency is accepted', () => {
  const body = { currency: 'USD', lineItems: [li({ id: 'li-1', currency: 'USD' })] };
  const result = validateAndComputeCanonicalEstimate(body);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.currency, 'USD');
});

test('12b. mixed-currency line items are rejected, never silently converted', () => {
  const body = { currency: 'USD', lineItems: [li({ id: 'li-1', currency: 'EUR' })] };
  const result = validateAndComputeCanonicalEstimate(body);
  assert.equal(result.code, 'MIXED_CURRENCY');
});

test('13. summary category/room/trade rollups reconcile exactly with the detailed line-item subtotal', () => {
  const body = {
    lineItems: [
      li({ id: 'li-1', category: 'Drywall', room: 'Living Room', quantity: 10, materialUnitCost: 2, laborUnitCost: 3 }),
      li({ id: 'li-2', category: 'Flooring', room: 'Kitchen', quantity: 5, unit: 'SY', materialUnitCost: 20, laborUnitCost: 10 }),
    ],
  };
  const result = validateAndComputeCanonicalEstimate(body);
  const { byCategory, byRoom, lineItemSubtotalCents } = result.totals;
  assert.equal(byCategory.reduce((s, r) => s + r.totalCents, 0), lineItemSubtotalCents);
  assert.equal(byRoom.reduce((s, r) => s + r.totalCents, 0), lineItemSubtotalCents);
});

test('14. no double counting: final total equals directCost + O&P + tax exactly once each', () => {
  const body = {
    lineItems: [li({ id: 'li-1', quantity: 2, materialUnitCost: 5, laborUnitCost: 5 })],
    generalConditions: [{ description: 'GC', amount: 20 }],
    overheadProfitPercent: 15,
    taxRatePercent: 6,
  };
  const result = validateAndComputeCanonicalEstimate(body);
  const t = result.totals;
  assert.equal(t.grandTotalCents, t.directCostCents + t.overheadProfitCents + t.taxCents);
  // The taxable basis and byCategory/byRoom rollups are informational/derived
  // and must never be additionally summed into grandTotal.
  assert.notEqual(t.grandTotalCents, t.directCostCents + t.overheadProfitCents + t.taxCents + t.taxableBasisCents);
});

test('15. duplicate line-item IDs are rejected; explicit IDs are preserved', () => {
  const dup = validateAndComputeCanonicalEstimate({
    lineItems: [li({ id: 'same' }), li({ id: 'same' })],
  });
  assert.equal(dup.code, 'VALIDATION_ERROR');
  assert.match(dup.error, /duplicate line item ID/);

  const ok = validateAndComputeCanonicalEstimate({ lineItems: [li({ id: 'stable-1' })] });
  assert.equal(ok.lineItems[0].id, 'stable-1');
});

test('16. bidirectional evidence contract: evidencePhotoIds must exist on this report and produce a correct reverse index', () => {
  const existingPhotoIds = new Set(['p1', 'p2']);
  const result = validateAndComputeCanonicalEstimate(
    { lineItems: [li({ id: 'li-1', evidencePhotoIds: ['p1', 'p1', 'p2'] })] },
    { existingPhotoIds }
  );
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(result.lineItems[0].evidencePhotoIds, ['p1', 'p2'], 'deduped');

  const photos = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
  const reindexed = computeReversePhotoIndex(photos, result.lineItems);
  assert.deepEqual(reindexed.find((p) => p.id === 'p1').relatedLineItemIds, ['li-1']);
  assert.deepEqual(reindexed.find((p) => p.id === 'p2').relatedLineItemIds, ['li-1']);
  assert.deepEqual(reindexed.find((p) => p.id === 'p3').relatedLineItemIds, [], 'a photo with no referencing line item gets an empty index, not undefined');
});

test('17. a photo ID that does not exist on this report is rejected (the cross-report-reference validation boundary)', () => {
  const existingPhotoIds = new Set(['p1']);
  const result = validateAndComputeCanonicalEstimate(
    { lineItems: [li({ id: 'li-1', evidencePhotoIds: ['p-from-another-report'] })] },
    { existingPhotoIds }
  );
  assert.equal(result.code, 'VALIDATION_ERROR');
  assert.match(result.error, /unknown or unowned photo ID/);
});

test('22a. schemaVersion defaults to the current version when omitted', () => {
  const result = validateAndComputeCanonicalEstimate({ lineItems: [li({ id: 'li-1' })] });
  assert.equal(result.schemaVersion, CANONICAL_ESTIMATE_SCHEMA_VERSION);
});

test('22b. an unsupported future schemaVersion is rejected, not silently accepted or downgraded', () => {
  const result = validateAndComputeCanonicalEstimate({ schemaVersion: 999, lineItems: [li({ id: 'li-1' })] });
  assert.equal(result.code, 'UNSUPPORTED_SCHEMA_VERSION');
});

test('createdAt is preserved across an update when the line item ID already existed; updatedAt always advances', async () => {
  const first = validateAndComputeCanonicalEstimate({ lineItems: [li({ id: 'li-1' })] });
  const previousById = new Map(first.lineItems.map((x) => [x.id, x]));
  await new Promise((r) => setTimeout(r, 5));
  const second = validateAndComputeCanonicalEstimate({ lineItems: [li({ id: 'li-1', quantity: 20 })] }, { previousById });
  assert.equal(second.lineItems[0].createdAt, first.lineItems[0].createdAt);
  assert.notEqual(second.lineItems[0].updatedAt, first.lineItems[0].updatedAt);
});
