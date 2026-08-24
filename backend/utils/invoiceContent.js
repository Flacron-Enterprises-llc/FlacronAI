// Phase 38 (Invoice Document): deterministic markdown assembly for an
// Invoice -- no AI call anywhere in this module. All numbers it renders were
// already computed by invoiceCalculations.js from the linked Repair
// Estimate's reused line items and adjuster-entered invoice fields. Output
// uses the same `##` heading / `|...|` pipe-table markdown dialect the
// existing PDF/DOCX generators already parse, so no export-generator changes
// are needed beyond the reportTitle/tocSections mapping in reports.js.

const formatMoney = (amount) =>
  `$${Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const billingSection = ({
  billTo,
  invoiceNumber,
  invoiceDate,
  dueDate,
  claimNumber,
  jobNumber,
}) => `## INVOICE
**SAMPLE VALUES SHOWN ARE ADJUSTER/CONTRACTOR-ENTERED — DRAFT, PENDING REVIEW**

### Bill To
${billTo.name}
${billTo.address}

### Invoice Details
| Field | Value |
|-------|-------|
| Invoice Number | ${invoiceNumber} |
| Invoice Date | ${invoiceDate} |
| Due Date | ${dueDate} |
| Claim Number | ${claimNumber || 'Not provided'} |
| Job Number | ${jobNumber || 'Not provided'} |`;

const servicesSection = ({ servicesRendered, totals }) => {
  const rows = servicesRendered
    .map(
      (li) =>
        `| ${li.code} | ${li.description} | ${li.qty} | ${li.unit} | ${formatMoney(li.unitPrice)} | ${formatMoney(li.lineTotal)} |`
    )
    .join('\n');
  return `## SERVICES RENDERED
*Reused from the approved Repair Estimate linked to this invoice -- not re-entered or re-priced here.*

| Code | Description | Qty | Unit | Rate | Amount |
|------|-------------|-----|------|------|--------|
${rows}
|  |  |  |  | Services Subtotal | ${formatMoney(totals.servicesSubtotal)} |`;
};

const totalsSection = ({ totals, taxRatePercent }) => `## INVOICE TOTALS
| Description | Amount |
|-------------|--------|
| Combined Subtotal | ${formatMoney(totals.combinedSubtotal)} |
| Sales Tax (${taxRatePercent}%) | ${formatMoney(totals.tax)} |
| Payments Received (see history below) | (${formatMoney(totals.paymentsReceivedTotal)}) |
| **TOTAL DUE** | **${formatMoney(totals.balanceDue)}** |

*FlacronAI's AI does not generate, calculate, or determine any dollar amount in this invoice -- every figure above is computed automatically, in code, from the linked Repair Estimate's reused line items and the payment/tax data entered above.*`;

const paymentHistorySection = ({ paymentHistory }) => {
  if (!paymentHistory.length) {
    return `## PAYMENT HISTORY
No payments have been recorded against this invoice yet.`;
  }
  const rows = paymentHistory
    .map((p) => `| ${p.date} | ${p.description} | ${p.method} | ${formatMoney(p.amount)} |`)
    .join('\n');
  return `## PAYMENT HISTORY
| Date | Description | Method | Amount |
|------|-------------|--------|--------|
${rows}`;
};

const changeOrderSection = ({ changeOrderLog }) => {
  if (!changeOrderLog.length) {
    return `## CHANGE ORDER LOG
No change orders have been logged for this invoice.`;
  }
  const rows = changeOrderLog
    .map((co) => `| ${co.coNumber} | ${co.description} | ${co.amount >= 0 ? '+' : ''}${formatMoney(co.amount)} |`)
    .join('\n');
  return `## CHANGE ORDER LOG
| CO # | Description | Amount |
|------|-------------|--------|
${rows}

*Change orders are logged here for reference only. A change order already reflected in the Services Rendered line items above is not counted again in the invoice totals.*`;
};

const termsSection = ({ paymentTerms, remitTo, warrantyText }) => {
  const warranty = warrantyText
    ? `\n\n## WARRANTY\n${warrantyText}`
    : '';
  return `## PAYMENT TERMS
${paymentTerms}

## REMIT PAYMENT TO
${remitTo.name}
${remitTo.instructions}${warranty}`;
};

const signOffSection = () => `## ADJUSTER REVIEW & SIGN-OFF

Reviewed & approved by (licensed adjuster / authorized reviewer): ______________________

*This is an AI-assisted DRAFT invoice. Every dollar amount above is calculated automatically, in code, from the linked Repair Estimate's reused line items and the payment/tax/change-order data entered above -- FlacronAI's AI does not generate, calculate, or determine any dollar amount anywhere in this document. This is not a request for payment until reviewed and approved. Not a final document until reviewed and approved by a licensed adjuster.*`;

// Assembles the full markdown `content` string for an Invoice report
// document. `computed` is the object returned by
// invoiceCalculations.validateAndComputeInvoice; `revision`/`revisionHistory`
// are tracked by the route handler across create + revise calls.
const revisionHistorySection = ({ revisionHistory }) => {
  const rows = revisionHistory
    .map((rev) => `| Rev. ${rev.version} | ${rev.date} | ${rev.changeSummary} | ${formatMoney(rev.balanceDue)} |`)
    .join('\n');
  return `## REVISION HISTORY
| Version | Date | Change Summary | Balance Due |
|---------|------|-----------------|-------------|
${rows}`;
};

const buildInvoiceContent = (reportData, computed, revision, revisionHistory) =>
  [
    billingSection({ ...reportData, ...computed }),
    servicesSection(computed),
    totalsSection(computed),
    paymentHistorySection(computed),
    changeOrderSection(computed),
    revisionHistorySection({ revisionHistory }),
    termsSection(computed),
    signOffSection(),
  ].join('\n\n');

module.exports = {
  formatMoney,
  billingSection,
  servicesSection,
  totalsSection,
  paymentHistorySection,
  changeOrderSection,
  revisionHistorySection,
  termsSection,
  signOffSection,
  buildInvoiceContent,
};
