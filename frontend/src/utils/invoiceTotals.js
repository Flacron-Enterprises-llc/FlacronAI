// Client-side PREVIEW ONLY for the "Generate/Revise Invoice" modal
// (ReportPreviewPage.jsx) -- the server (backend/utils/invoiceCalculations.js)
// independently recomputes and stores the authoritative totals; this must
// stay a faithful mirror of that same formula so the preview never
// disagrees with what actually gets saved.
//
// QA fix: `overheadProfitPercent` is the linked Repair Estimate's own
// authoritative percent (or, when revising an existing invoice, that
// invoice's own already-persisted snapshot of it) -- there is no O&P input
// on this form; it is never user-entered here. Applied to the services
// subtotal only and never itself taxed, mirroring the backend exactly.
export const computeInvoicePreviewTotals = (
  servicesRendered,
  overheadProfitPercent,
  taxRatePercent,
  paymentHistory
) => {
  const subtotal = servicesRendered.reduce((s, li) => s + (Number(li.lineTotal) || 0), 0);
  const overheadProfit = subtotal * ((Number(overheadProfitPercent) || 0) / 100);
  const combinedSubtotal = subtotal + overheadProfit;
  const taxable = servicesRendered
    .filter((li) => li.taxable !== false)
    .reduce((s, li) => s + (Number(li.lineTotal) || 0), 0);
  const tax = taxable * ((Number(taxRatePercent) || 0) / 100);
  const paymentsTotal = paymentHistory.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return {
    subtotal,
    overheadProfit,
    combinedSubtotal,
    tax,
    paymentsTotal,
    balanceDue: combinedSubtotal + tax - paymentsTotal,
  };
};
