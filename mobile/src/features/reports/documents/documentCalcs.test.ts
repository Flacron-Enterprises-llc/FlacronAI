import { coverageTotals, depreciationRow, estimateTotals, invoiceTotals } from './documentCalcs';
import { buildCanonicalEstimatePayload, computeEstimatePreviewTotals, emptyCanonicalLineItem, mergeProposedPricingIntoLineItems, validateCanonicalEstimateDraft } from './canonicalEstimate';

const lines = [
  { code: 'RFG1', description: 'Tear off', qty: 24, unit: 'SQ', unitPrice: 85, taxable: false },
  { code: 'DRY1', description: 'Drywall', qty: 10.5, unit: 'SF', unitPrice: 3.33, taxable: true },
];

describe('document preview math (mirrors backend *Calculations.js)', () => {
  it('repair estimate: O&P on subtotal, tax on taxable lines only, never on O&P', () => {
    // 24*85 = 2040.00; 10.5*3.33 = 34.965 -> 34.97
    expect(estimateTotals(lines, 10, 8.25)).toEqual({ subtotal: 2074.97, overheadProfit: 207.5, taxableAmount: 34.97, tax: 2.89, grandTotal: 2285.36 });
    expect(depreciationRow({ item: 'Roof', condition: 'Fair', ageYears: 12, lifeExpectancyYears: 25, depreciationPercent: 48, relatedLineItemCodes: ['RFG1'] }, lines)).toEqual({
      rcv: 2040,
      depreciationAmount: 979.2,
      acv: 1060.8,
    });
  });

  it('invoice: payments reduce the balance; O&P from the estimate', () => {
    const t = invoiceTotals(lines, 10, 0, [{ date: '2026-10-01', description: 'Deposit', method: 'Check', amount: 500 }]);
    expect(t.combinedSubtotal).toBe(2282.47);
    expect(t.balanceDue).toBe(1782.47);
  });

  it('coverage letter: withheld depreciation only when every code of the row is approved', () => {
    const dep = [
      { item: 'Roof', condition: 'Fair', ageYears: 12, lifeExpectancyYears: 25, depreciationPercent: 50, relatedLineItemCodes: ['RFG1'] },
      { item: 'Mixed', condition: 'Fair', ageYears: 1, lifeExpectancyYears: 10, depreciationPercent: 50, relatedLineItemCodes: ['RFG1', 'DRY1'] },
    ];
    const t = coverageTotals(lines, dep, [
      { item: 'Roof', determination: 'approved', policyBasis: 'Dwelling', relatedLineItemCodes: ['RFG1'] },
      { item: 'Drywall', determination: 'denied', policyBasis: 'Excluded', relatedLineItemCodes: [] },
    ], 1000);
    expect(t).toMatchObject({ approvedRCV: 2040, recoverableDepreciationWithheld: 1020, initialPayment: 20, approvedCount: 1, deniedCount: 1 });
  });
});

describe('detailed estimate (port of canonicalEstimateEditor.js)', () => {
  it('validates, previews and builds the same payload shape as the web', () => {
    const li = { ...emptyCanonicalLineItem(), room: 'Kitchen', category: 'Drywall', description: 'Replace', quantity: '10', materialUnitCost: '2', laborUnitCost: '1.5' };
    expect(validateCanonicalEstimateDraft([{ ...li, room: '' }])).toBe('Every line item needs a room/area.');
    const draft = { currency: 'usd', region: 'TX', lineItems: [li], permits: [{ id: 'p', description: 'Permit', amount: '100', taxable: false }], generalConditions: [], manualAdjustments: [], overheadProfitPercent: '10', taxRatePercent: '5' };
    expect(computeEstimatePreviewTotals(draft).grandTotal).toBeCloseTo(135 * 1.1 + 35 * 0.05);
    const payload = buildCanonicalEstimatePayload({ revision: 3, schemaVersion: 1 }, draft, ' first ');
    expect(payload).toMatchObject({ currency: 'USD', baseRevision: 3, changeSummary: 'first', appliedProposals: [] });
    expect(payload.lineItems[0]).toMatchObject({ room: 'Kitchen', quantity: 10, materialUnitCost: 2, pricingSource: 'manual' });
  });

  it('merges accepted suggestions but never over an active manual override', () => {
    const a = { ...emptyCanonicalLineItem(), id: 'a' };
    const b = { ...emptyCanonicalLineItem(), id: 'b', overrideActive: true };
    const { lineItems, applied, skipped } = mergeProposedPricingIntoLineItems([a, b], 'prop1', [
      { suggestionId: 's1', targetLineItemId: 'a', laborUnitCost: 4 },
      { suggestionId: 's2', targetLineItemId: 'b', laborUnitCost: 9 },
      { suggestionId: 's3', targetLineItemId: 'zzz' },
    ], ['s1', 's2']);
    expect(applied.map((x) => x.suggestionId)).toEqual(['s1']);
    expect(skipped.map((x) => x.suggestionId)).toEqual(['s2']);
    expect(lineItems[0]).toMatchObject({ laborUnitCost: '4', pricingSource: 'ai_suggested', appliedProposalId: 'prop1', appliedSuggestionId: 's1' });
    expect(lineItems).toHaveLength(2);
  });
});
