// Phase 39 (Coverage Determination Letter): deterministic markdown assembly
// -- no AI call anywhere in this module. Every word of coverage/legal
// content (policy basis, rights & next steps, pending-item notes) is exactly
// what the licensed adjuster typed into the form; this module only formats
// it, in the same `##` heading / `|...|` pipe-table markdown dialect the
// existing PDF/DOCX generators already parse. All dollar figures were
// already computed by coverageLetterCalculations.js from the linked,
// approved Repair Estimate's reused line items/depreciation schedule.

const formatMoney = (amount) =>
  `$${Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const DETERMINATION_LABELS = { approved: 'Approved', denied: 'Denied', pending: 'Pending' };

// Fixed, generic definitional glossary -- explains standard industry terms
// (RCV/ACV), not any policy-specific or jurisdiction-specific determination.
// Exact-match tested (backend/test/coverage-letter.test.js), same pattern as
// Phase 36's MOLD_SCOPE_NOTICE, so it can never silently drift.
const RCV_ACV_GLOSSARY = `## UNDERSTANDING DEPRECIATION
Replacement Cost Value (RCV) is the estimated cost to repair or replace damaged property with materials of like kind and quality, at current prices, without deduction for depreciation. Actual Cash Value (ACV) is RCV minus depreciation -- the reduction in value due to age, wear, and condition prior to the loss. These are standard industry definitions only; they are not a statement of this policy's specific terms.`;

// Fixed disclaimer covering both Golden Rule #2 (no AI-drafted coverage/
// payment content) and the client-approved authoring model (PHASES.md Phase
// 39): every word of coverage determination, policy basis, and rights/next
// steps content was entered by the named adjuster of record, not generated
// or suggested by AI. Also carries the required legal/compliance-review flag
// for jurisdiction-specific wording -- this is an app-level engineering
// notice, not part of the letter's own legal language.
const ATTESTATION_NOTICE = `## ADJUSTER REVIEW & SIGN-OFF

Reviewed & approved by (licensed adjuster / authorized reviewer): ______________________

*FlacronAI's AI does not draft, suggest, or determine any coverage decision, policy basis, payment figure, or rights/next-steps language anywhere in this document -- every such entry above was typed directly by the named adjuster of record. Every dollar figure is calculated automatically, in code, from the linked, approved Repair Estimate's reused line items and depreciation schedule, restricted to items marked "Approved" above. This letter is not effective, and must not be sent to any recipient, until reviewed and approved by a licensed adjuster through this system's approval step. Jurisdiction-specific wording (rights, appeal/appraisal language, statutory notice periods) has NOT been reviewed by legal/compliance counsel for any specific jurisdiction and must receive that review before production use.*`;

const headerSection = ({
  letterDate,
  addressee,
  claimNumber,
  policyNumber,
  lossDate,
  propertyAddress,
  adjusterOfRecord,
  determinationSummary,
}) => `## COVERAGE DETERMINATION LETTER
**DRAFT — ADJUSTER-ENTERED, PENDING FINAL APPROVAL**

${letterDate}

${addressee.name}
${addressee.address}

| Field | Value |
|-------|-------|
| Claim Number | ${claimNumber || 'Not provided'} |
| Policy Number | ${policyNumber || 'Not provided'} |
| Date of Loss | ${lossDate || 'Not provided'} |
| Property Address | ${propertyAddress || 'Not provided'} |
| Adjuster of Record | ${adjusterOfRecord.name}, ${adjusterOfRecord.title} |

### RE: Coverage Determination — ${determinationSummary}`;

const coverageLimitsSection = ({ coverageLimits, deductible }) => {
  const rows = coverageLimits
    .map((c) => `| ${c.coverageType} | ${c.description} | ${formatMoney(c.limit)} |`)
    .join('\n');
  return `## APPLICABLE POLICY COVERAGES
| Coverage | Description | Limit |
|----------|--------------|-------|
${rows}
| Deductible | ${deductible.description} | ${formatMoney(deductible.amount)} |`;
};

const itemRationaleSection = ({ perItemDetermination }) => {
  const rows = perItemDetermination
    .map((r) => `| ${r.item} | ${DETERMINATION_LABELS[r.determination]} | ${r.policyBasis} |`)
    .join('\n');
  return `## ITEM-BY-ITEM COVERAGE RATIONALE
| Item | Determination | Policy Basis |
|------|----------------|--------------|
${rows}`;
};

const pendingItemsSection = ({ perItemDetermination }) => {
  const pending = perItemDetermination.filter((r) => r.determination === 'pending');
  if (!pending.length) {
    return `## ITEMS PENDING FURTHER REVIEW
No items are currently pending further review.`;
  }
  const bullets = pending.map((r) => `- **${r.item}** — ${r.pendingNote}`).join('\n');
  return `## ITEMS PENDING FURTHER REVIEW
${bullets}`;
};

const paymentCalculationSection = ({ totals }) => `## PAYMENT CALCULATION
| Description | Amount |
|--------------|--------|
| Approved Replacement Cost Value (RCV) | ${formatMoney(totals.approvedRCV)} |
| Less: Deductible | (${formatMoney(totals.deductible)}) |
| Less: Recoverable Depreciation (held pending completion) | (${formatMoney(totals.recoverableDepreciationWithheld)}) |
| **Initial Payment (ACV)** | **${formatMoney(totals.initialPayment)}** |

*Approved RCV includes only items marked "Approved" above (${totals.approvedCount} of ${totals.approvedCount + totals.deniedCount + totals.pendingCount}); denied and pending items contribute nothing to this payment. Recoverable depreciation shown is withheld pending completion and proof of repair, consistent with a replacement-cost policy. Every figure above is calculated automatically, in code, from the linked, approved Repair Estimate -- FlacronAI's AI does not generate, calculate, or determine any dollar amount or coverage outcome in this letter.*`;

const rightsSection = ({ rightsAndNextSteps }) => {
  const bullets = rightsAndNextSteps.map((r) => `- **${r.heading}:** ${r.text}`).join('\n');
  return `## YOUR RIGHTS & NEXT STEPS
${bullets}`;
};

const enclosuresSection = ({ enclosures }) => {
  if (!enclosures.length) {
    return `## ENCLOSURES
No enclosures listed.`;
  }
  return `## ENCLOSURES
${enclosures.map((e) => `- ${e}`).join('\n')}`;
};

const revisionHistorySection = ({ revisionHistory }) => {
  const rows = revisionHistory
    .map((rev) => `| Rev. ${rev.version} | ${rev.date} | ${rev.changeSummary} | ${formatMoney(rev.initialPayment)} |`)
    .join('\n');
  return `## REVISION HISTORY
| Version | Date | Change Summary | Initial Payment (ACV) |
|---------|------|-----------------|------------------------|
${rows}`;
};

// Assembles the full markdown `content` string for a Coverage Determination
// Letter report document. `reportData` supplies the reused parent-report
// facts (claimNumber/policyNumber/lossDate/propertyAddress); `computed` is
// the object returned by coverageLetterCalculations.validateAndComputeCoverageLetter;
// `revisionHistory` is tracked by the route handler across create + revise calls.
const buildCoverageLetterContent = (reportData, computed, revision, revisionHistory) =>
  [
    headerSection({ ...reportData, ...computed }),
    coverageLimitsSection(computed),
    itemRationaleSection(computed),
    pendingItemsSection(computed),
    paymentCalculationSection(computed),
    RCV_ACV_GLOSSARY,
    rightsSection(computed),
    enclosuresSection(computed),
    revisionHistorySection({ revisionHistory }),
    ATTESTATION_NOTICE,
  ].join('\n\n');

module.exports = {
  formatMoney,
  DETERMINATION_LABELS,
  RCV_ACV_GLOSSARY,
  ATTESTATION_NOTICE,
  headerSection,
  coverageLimitsSection,
  itemRationaleSection,
  pendingItemsSection,
  paymentCalculationSection,
  rightsSection,
  enclosuresSection,
  revisionHistorySection,
  buildCoverageLetterContent,
};
