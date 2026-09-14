import { describe, it, expect } from 'vitest';
import { computeInvoicePreviewTotals } from '../utils/invoiceTotals.js';

// QA regression: the "Generate Invoice" modal preview (and the saved
// Invoice it produces) showed Combined Subtotal $550, Sales Tax $44, Total
// Due $594 -- silently dropping the linked Repair Estimate's 10% ($55)
// Overhead & Profit. This mirrors the server's authoritative formula
// (backend/utils/invoiceCalculations.js's computeInvoiceTotals) so the
// client-side preview never disagrees with what actually gets saved.

const services = (overrides = []) =>
  overrides.length
    ? overrides
    : [
        {
          code: 'REP-001',
          description: 'Floor covering replacement',
          qty: 22,
          unit: 'EA',
          unitPrice: 25,
          lineTotal: 550,
          taxable: true,
        },
      ];

describe('computeInvoicePreviewTotals', () => {
  it('confirmed reproduction: 550 + 55 (10% O&P) + 44 (8% tax on the $550 services base) = 649', () => {
    const totals = computeInvoicePreviewTotals(services(), 10, 8, []);
    expect(totals.subtotal).toBe(550);
    expect(totals.overheadProfit).toBe(55);
    expect(totals.combinedSubtotal).toBe(605);
    expect(totals.tax).toBe(44);
    expect(totals.balanceDue).toBe(649);
  });

  it('tax is computed on the services base only, never expanded to include O&P', () => {
    const totals = computeInvoicePreviewTotals(services(), 10, 8, []);
    // 8% of 605 would be 48.4 -- must stay 44 (8% of 550).
    expect(totals.tax).toBe(44);
  });

  it('a payment reduces the O&P-inclusive total', () => {
    const totals = computeInvoicePreviewTotals(services(), 10, 8, [{ amount: 200 }]);
    expect(totals.balanceDue).toBe(449); // 649 - 200
  });

  it('0% O&P adds nothing to the total', () => {
    const totals = computeInvoicePreviewTotals(services(), 0, 8, []);
    expect(totals.overheadProfit).toBe(0);
    expect(totals.combinedSubtotal).toBe(550);
    expect(totals.balanceDue).toBe(594);
  });

  it('a missing/undefined overheadProfitPercent (legacy invoice with no O&P field) defaults to 0, not NaN', () => {
    const totals = computeInvoicePreviewTotals(services(), undefined, 8, []);
    expect(totals.overheadProfit).toBe(0);
    expect(Number.isNaN(totals.balanceDue)).toBe(false);
    expect(totals.balanceDue).toBe(594);
  });

  it('non-taxable services are excluded from the tax base but still counted in the subtotal/O&P', () => {
    const mixed = [
      { lineTotal: 550, taxable: true },
      { lineTotal: 100, taxable: false },
    ];
    const totals = computeInvoicePreviewTotals(mixed, 10, 8, []);
    expect(totals.subtotal).toBe(650);
    expect(totals.overheadProfit).toBe(65); // 10% of the full 650 subtotal
    expect(totals.tax).toBe(44); // 8% of only the taxable 550
  });
});
