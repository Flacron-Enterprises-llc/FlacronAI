// Phase 37 (Repair Estimate with Depreciation Schedule): deterministic
// markdown assembly for a Repair Estimate document -- no AI call anywhere in
// this module. All numbers it renders were already computed by
// estimateCalculations.js from adjuster-entered inputs. Output uses the same
// `##` heading / `|...|` pipe-table markdown dialect the existing PDF/DOCX
// generators (properPdfGenerator.js / documentGenerator.js) already parse,
// so no export-generator changes are needed beyond the reportTitle/
// tocSections mapping in reports.js.

const formatMoney = (amount) =>
  `$${Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const reportInfoSection = ({
  claimNumber,
  insuredName,
  propertyAddress,
  estimateNumber,
  revision,
  estimateDate,
  priceListBasis,
  preparedWith,
}) => `## REPAIR ESTIMATE
**DRAFT — PRELIMINARY PRICING, PENDING ADJUSTER CONFIRMATION**

| Field | Value |
|-------|-------|
| Claim Number | ${claimNumber || 'Not provided'} |
| Insured | ${insuredName || 'Not provided'} |
| Property Address | ${propertyAddress || 'Not provided'} |
| Estimate Number | ${estimateNumber}, Revision ${revision} |
| Estimate Date | ${estimateDate || 'Not provided'} |
| Price List Basis | ${priceListBasis || 'Not provided'} |
| Prepared With | ${preparedWith || 'Not provided'} |`;

const lineItemSection = ({ lineItems, totals, overheadProfitPercent, taxRatePercent, taxBasis }) => {
  const rows = lineItems
    .map(
      (li) =>
        `| ${li.code} | ${li.description} | ${li.qty} | ${li.unit} | ${formatMoney(li.unitPrice)} | ${formatMoney(li.lineTotal)} |`
    )
    .join('\n');
  const taxLabel = taxBasis ? `Sales Tax (${taxRatePercent}%, ${taxBasis})` : `Sales Tax (${taxRatePercent}%)`;
  return `## LINE ITEM DETAIL
| Code | Description | Qty | Unit | Unit Price | Line Total |
|------|-------------|-----|------|-----------|-----------|
${rows}
|  |  |  |  | Subtotal | ${formatMoney(totals.subtotal)} |
|  |  |  |  | Overhead & Profit (${overheadProfitPercent}%) | ${formatMoney(totals.overheadProfit)} |
|  |  |  |  | ${taxLabel} | ${formatMoney(totals.tax)} |
|  |  |  |  | TOTAL ESTIMATE (Draft) | ${formatMoney(totals.grandTotal)} |

*Pricing shown reflects the quantities, unit rates, and percentages entered by the preparing adjuster/estimator. FlacronAI's AI does not generate, calculate, or determine any dollar amount in this estimate -- every total above is computed automatically from the entered inputs. This estimate does not constitute a coverage determination.*`;
};

const depreciationSection = ({ depreciationSchedule }) => {
  if (!depreciationSchedule.length) {
    return `## DEPRECIATION SCHEDULE (DRAFT)
No depreciation schedule has been entered for this estimate.`;
  }
  const rows = depreciationSchedule
    .map(
      (row) =>
        `| ${row.item} | ${row.ageYears} yrs | ${row.lifeExpectancyYears} yrs | ${row.condition} | ${row.depreciationPercent}% | ${formatMoney(row.rcv)} | ${formatMoney(row.depreciationAmount)} | ${formatMoney(row.acv)} |`
    )
    .join('\n');
  return `## DEPRECIATION SCHEDULE (DRAFT)
| Item | Age | Life Exp. | Cond. | Depr. % | RCV | Depr. $ | ACV |
|------|-----|-----------|-------|---------|-----|---------|-----|
${rows}

*Depreciation percentages are the preparing adjuster/estimator's own entered judgment values, not a coverage determination. Recoverable vs. non-recoverable depreciation treatment is governed by the policy, not by this estimate.*`;
};

const revisionHistorySection = ({ revisionHistory }) => {
  const rows = revisionHistory
    .map((rev) => `| Rev. ${rev.version} | ${rev.date} | ${rev.changeSummary} | ${formatMoney(rev.total)} |`)
    .join('\n');
  return `## REVISION HISTORY
| Version | Date | Change Summary | Total |
|---------|------|-----------------|-------|
${rows}`;
};

const TERMS_SECTION = `## TERMS & CONDITIONS
- **Validity:** This estimate is valid for 30 days from the estimate date shown above. Material and labor pricing may change after this period.
- **Change orders:** Any change to the documented scope of work -- including conditions discovered during repair -- requires a written change order and may affect the total shown.
- **Authorization:** This estimate does not authorize work to begin. Work should not commence until the estimate is approved by the reviewing adjuster and, where applicable, the insured.
- **Field verification:** The quantities, rates, and percentages entered into this draft should be confirmed by a licensed estimator or adjuster before use in a final settlement.`;

const signOffSection = () => `## ADJUSTER REVIEW & SIGN-OFF

Reviewed & approved by (licensed adjuster / estimator): ______________________

*This is an AI-assisted DRAFT repair estimate. Every dollar amount above is calculated automatically, in code, from the quantities, rates, and percentages entered above -- FlacronAI's AI does not generate, calculate, or determine any dollar amount anywhere in this document. Not a final report until reviewed and approved by a licensed adjuster.*`;

// Assembles the full markdown `content` string for a Repair Estimate report
// document. `computed` is the object returned by
// estimateCalculations.validateAndComputeEstimate; `revision`/`revisionHistory`
// are tracked by the route handler across create + revise calls.
const buildEstimateContent = (reportData, computed, revision, revisionHistory) =>
  [
    reportInfoSection({ ...reportData, ...computed, revision }),
    lineItemSection(computed),
    depreciationSection(computed),
    revisionHistorySection({ revisionHistory }),
    TERMS_SECTION,
    signOffSection(),
  ].join('\n\n');

module.exports = {
  formatMoney,
  reportInfoSection,
  lineItemSection,
  depreciationSection,
  revisionHistorySection,
  TERMS_SECTION,
  signOffSection,
  buildEstimateContent,
};
