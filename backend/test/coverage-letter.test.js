const test = require('node:test');
const assert = require('node:assert/strict');
const {
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
  MAX_COVERAGE_LIMITS,
  MAX_ITEMS,
  MAX_RIGHTS,
} = require('../utils/coverageLetterCalculations');
const { buildCoverageLetterContent, RCV_ACV_GLOSSARY, ATTESTATION_NOTICE } = require('../utils/coverageLetterContent');
const { hasCapability } = require('../utils/orgRoles');

// Phase 39 (Coverage Determination Letter, PHASES.md): approved authoring
// model -- the licensed adjuster enters every coverage decision through a
// structured form; AI drafts zero approval/denial, policy basis, rights, or
// payment content anywhere in this document type. Every dollar figure below
// is hand-verified against the module's own documented formula:
//   Approved RCV = sum of the linked estimate's line totals for items marked "approved"
//   Recoverable Depreciation withheld = sum of depreciation rows fully within the approved set
//   Initial Payment (ACV) = Approved RCV - Deductible - Recoverable Depreciation

// A small, hand-built "linked Repair Estimate" fixture, structurally like a
// real estimateCalculations.js output (code + lineTotal is all these
// functions read).
const LINE_ITEMS = [
  { code: 'RFG-100', description: 'Roof covering, gutters, downspouts', lineTotal: 16170 },
  { code: 'STU-200', description: 'Front elevation stucco', lineTotal: 4200 },
  { code: 'SKY-300', description: 'Skylights (2 units)', lineTotal: 1800 },
  { code: 'GAR-400', description: 'Garage door panels', lineTotal: 2175.8 },
  { code: 'HVAC-500', description: 'HVAC condenser', lineTotal: 5400 }, // pending -- must not count
  { code: 'CEI-600', description: 'Interior ceiling & attic decking', lineTotal: 4000 },
];
const DEPRECIATION_SCHEDULE = [
  // Fully within the approved set (RFG-100 + STU-200 + SKY-300 + GAR-400 + CEI-600) -> counted.
  { item: 'Roof/Stucco/Skylights/Garage/Ceiling', relatedLineItemCodes: ['RFG-100', 'STU-200', 'SKY-300', 'GAR-400', 'CEI-600'], depreciationAmount: 4182.6 },
  // Touches the pending HVAC item too -> excluded entirely, not partially estimated.
  { item: 'HVAC + Roof (mixed)', relatedLineItemCodes: ['HVAC-500', 'RFG-100'], depreciationAmount: 900 },
];
const APPROVED_CODES = ['RFG-100', 'STU-200', 'SKY-300', 'GAR-400', 'CEI-600'];
// 16170 + 4200 + 1800 + 2175.8 + 4000 = 28345.8 -- matches the client's own sample RCV exactly.
const EXPECTED_RCV = 28345.8;

const validAddressee = { name: 'Patricia Johnson', address: '4127 Meadowbrook Lane, Austin, TX 78745' };
const validAdjuster = { name: 'D. Ramirez', title: 'Senior Claims Adjuster' };
const validCoverageLimits = [{ coverageType: 'Dwelling (Cov. A)', description: 'The dwelling structure', limit: 385000 }];
const validRights = [{ heading: 'Request review', text: 'You may request a re-inspection within 60 days.' }];

const validPerItem = () => [
  { item: 'Roof covering, gutters, downspouts', determination: 'approved', policyBasis: 'Direct physical loss from a covered wind/hail peril.', relatedLineItemCodes: ['RFG-100'] },
  { item: 'Front elevation stucco', determination: 'approved', policyBasis: 'Cracking consistent with reported impact event.', relatedLineItemCodes: ['STU-200'] },
  { item: 'Skylights (2 units)', determination: 'approved', policyBasis: 'Visible pane cracking documented and confirmed.', relatedLineItemCodes: ['SKY-300'] },
  { item: 'Garage door panels', determination: 'approved', policyBasis: 'Attached structure, denting consistent with reported event.', relatedLineItemCodes: ['GAR-400'] },
  { item: 'HVAC condenser', determination: 'pending', policyBasis: 'Coverage deferred pending independent technician evaluation.', relatedLineItemCodes: [], pendingNote: 'Awaiting independent HVAC technician evaluation.' },
  { item: 'Interior ceiling & attic decking', determination: 'approved', policyBasis: 'Water intrusion secondary to the approved roof damage.', relatedLineItemCodes: ['CEI-600'] },
];

const validBody = () => ({
  addressee: validAddressee,
  adjusterOfRecord: validAdjuster,
  letterDate: '2024-05-03',
  determinationSummary: 'Partial Approval',
  deductible: { description: 'Percentage deductible applicable to this loss type', amount: 1500 },
  coverageLimits: validCoverageLimits,
  perItemDetermination: validPerItem(),
  rightsAndNextSteps: validRights,
  enclosures: ['Repair Estimate, EST-2024-118-01, Revision 2'],
});

// ── Field validators ────────────────────────────────────────────────────

test('validateAddressee requires both name and address', () => {
  assert.match(validateAddressee({}).error, /name is required/);
  assert.match(validateAddressee({ name: 'A' }).error, /address is required/);
  assert.deepEqual(validateAddressee({ name: ' A ', address: ' B ' }).value, { name: 'A', address: 'B' });
});

test('validateAdjusterOfRecord requires name and title, phone/email optional', () => {
  assert.match(validateAdjusterOfRecord({}).error, /name is required/);
  assert.match(validateAdjusterOfRecord({ name: 'A' }).error, /title is required/);
  assert.equal(validateAdjusterOfRecord({ name: 'A', title: 'B' }).error, undefined);
});

test('validateLetterDate rejects a malformed date', () => {
  assert.match(validateLetterDate('05/03/2024').error, /valid date/);
  assert.match(validateLetterDate('').error, /valid date/);
  assert.equal(validateLetterDate('2024-05-03').error, undefined);
});

test('validateDeductible rejects a negative or non-finite amount, requires a description', () => {
  assert.match(validateDeductible({ description: '', amount: 1500 }).error, /description is required/);
  assert.match(validateDeductible({ description: 'x', amount: -1 }).error, /non-negative finite number/);
  assert.match(validateDeductible({ description: 'x', amount: NaN }).error, /non-negative finite number/);
  assert.equal(validateDeductible({ description: 'x', amount: 0 }).error, undefined);
});

test('validateCoverageLimits requires at least one row and rejects an invalid limit', () => {
  assert.match(validateCoverageLimits([]).error, /at least one coverage limit/i);
  assert.match(validateCoverageLimits([{ coverageType: 'A', description: 'B', limit: -1 }]).error, /non-negative finite number/);
  const big = Array.from({ length: MAX_COVERAGE_LIMITS + 1 }, () => ({ coverageType: 'A', description: 'B', limit: 1 }));
  assert.match(validateCoverageLimits(big).error, new RegExp(`at most ${MAX_COVERAGE_LIMITS}`, 'i'));
});

test('validatePerItemDetermination rejects an invalid determination enum', () => {
  const codes = new Set(['RFG-100']);
  assert.match(
    validatePerItemDetermination([{ item: 'A', determination: 'maybe', policyBasis: 'x' }], codes).error,
    /must be one of approved, denied, pending/
  );
});

test('validatePerItemDetermination requires a non-empty policyBasis on every row (never invented)', () => {
  const codes = new Set(['RFG-100']);
  assert.match(
    validatePerItemDetermination([{ item: 'A', determination: 'denied', policyBasis: '' }], codes).error,
    /policyBasis is required/
  );
});

test('validatePerItemDetermination requires an approved row to link at least one known line item code', () => {
  const codes = new Set(['RFG-100']);
  assert.match(
    validatePerItemDetermination([{ item: 'A', determination: 'approved', policyBasis: 'x', relatedLineItemCodes: [] }], codes).error,
    /must reference at least one linked estimate line item code/
  );
  assert.match(
    validatePerItemDetermination([{ item: 'A', determination: 'approved', policyBasis: 'x', relatedLineItemCodes: ['NOPE'] }], codes).error,
    /unknown linked estimate line item code/
  );
});

test('validatePerItemDetermination requires a pending row to have a pendingNote', () => {
  const codes = new Set(['RFG-100']);
  assert.match(
    validatePerItemDetermination([{ item: 'A', determination: 'pending', policyBasis: 'x', pendingNote: '' }], codes).error,
    /pendingNote/
  );
  assert.equal(
    validatePerItemDetermination([{ item: 'A', determination: 'pending', policyBasis: 'x', pendingNote: 'Awaiting X' }], codes).error,
    undefined
  );
});

test('validatePerItemDetermination rejects more than the maximum number of items', () => {
  const codes = new Set(['RFG-100']);
  const rows = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => ({ item: `Item ${i}`, determination: 'denied', policyBasis: 'x' }));
  assert.match(validatePerItemDetermination(rows, codes).error, new RegExp(`at most ${MAX_ITEMS}`, 'i'));
});

test('validateRightsAndNextSteps requires at least one entry with both heading and text', () => {
  assert.match(validateRightsAndNextSteps([]).error, /at least one rights/i);
  assert.match(validateRightsAndNextSteps([{ heading: '', text: 'x' }]).error, /heading is required/);
  assert.match(validateRightsAndNextSteps([{ heading: 'x', text: '' }]).error, /text is required/);
  const big = Array.from({ length: MAX_RIGHTS + 1 }, () => ({ heading: 'A', text: 'B' }));
  assert.match(validateRightsAndNextSteps(big).error, new RegExp(`at most ${MAX_RIGHTS}`, 'i'));
});

test('validateEnclosures is optional and drops blank entries', () => {
  assert.deepEqual(validateEnclosures(undefined).rows, []);
  assert.deepEqual(validateEnclosures(['A', '', '  ', 'B']).rows, ['A', 'B']);
  assert.match(validateEnclosures('nope').error, /must be an array/);
});

// ── Payment calculation (hand-verified against the client's own sample) ──

test('computeApprovedRCVCents sums only the codes an "approved" row actually links, ignoring pending/denied line items', () => {
  const cents = computeApprovedRCVCents(new Set(APPROVED_CODES), LINE_ITEMS);
  assert.equal(cents, Math.round(EXPECTED_RCV * 100));
});

test('computeRecoverableDepreciationCents excludes a row that touches ANY non-approved item, even partially', () => {
  const cents = computeRecoverableDepreciationCents(new Set(APPROVED_CODES), DEPRECIATION_SCHEDULE);
  // Only the fully-approved-set row (4182.60) counts; the mixed HVAC/roof row (900) is excluded entirely.
  assert.equal(cents, 418260);
});

test('computeCoverageTotals matches the client sample\'s exact figures: RCV 28345.80, depreciation 4182.60, deductible 1500, ACV 22663.20', () => {
  const totals = computeCoverageTotals(validPerItem(), LINE_ITEMS, DEPRECIATION_SCHEDULE, 1500);
  assert.equal(totals.approvedRCV, 28345.8);
  assert.equal(totals.deductible, 1500);
  assert.equal(totals.recoverableDepreciationWithheld, 4182.6);
  assert.equal(totals.initialPayment, 22663.2);
  assert.equal(totals.approvedCount, 5);
  assert.equal(totals.deniedCount, 0);
  assert.equal(totals.pendingCount, 1);
});

test('computeCoverageTotals: a denied item never contributes to RCV even if it names a real line item code', () => {
  const perItem = [
    { item: 'X', determination: 'denied', policyBasis: 'Excluded peril.', relatedLineItemCodes: ['RFG-100'] },
  ];
  const totals = computeCoverageTotals(perItem, LINE_ITEMS, [], 0);
  assert.equal(totals.approvedRCV, 0);
  assert.equal(totals.initialPayment, 0);
});

test('computeCoverageTotals avoids floating-point drift by rounding in cents throughout', () => {
  const items = [{ code: 'A', lineTotal: 0.1 }, { code: 'B', lineTotal: 0.2 }];
  const perItem = [
    { item: 'a', determination: 'approved', policyBasis: 'x', relatedLineItemCodes: ['A'] },
    { item: 'b', determination: 'approved', policyBasis: 'x', relatedLineItemCodes: ['B'] },
  ];
  const totals = computeCoverageTotals(perItem, items, [], 0);
  assert.equal(totals.approvedRCV, 0.3); // NOT 0.30000000000000004
});

// ── Top-level validate+compute entry point ──────────────────────────────

test('validateAndComputeCoverageLetter accepts a fully valid body and returns computed totals', () => {
  const result = validateAndComputeCoverageLetter(validBody(), LINE_ITEMS, DEPRECIATION_SCHEDULE);
  assert.equal(result.error, undefined);
  assert.equal(result.totals.initialPayment, 22663.2);
  assert.equal(result.determinationSummary, 'Partial Approval');
});

test('validateAndComputeCoverageLetter rejects when the linked estimate has no line items', () => {
  const result = validateAndComputeCoverageLetter(validBody(), [], []);
  assert.match(result.error, /no line items to reference/);
});

test('validateAndComputeCoverageLetter rejects a missing determinationSummary', () => {
  const body = { ...validBody(), determinationSummary: '' };
  assert.match(validateAndComputeCoverageLetter(body, LINE_ITEMS, DEPRECIATION_SCHEDULE).error, /determinationSummary is required/);
});

// ── Server-side source eligibility gate (Golden Rule #2/#3 enforcement) ──

test('validateSourceEligibility rejects a non-finalized (draft) base report', () => {
  const result = validateSourceEligibility({
    parentStatus: 'draft',
    estimate: { documentType: 'RepairEstimate', relatedReportId: 'report-1', status: 'finalized' },
    expectedRelatedReportId: 'report-1',
  });
  assert.equal(result.code, 'REPORT_NOT_FINALIZED');
});

test('validateSourceEligibility rejects when the source document is not a Repair Estimate', () => {
  const result = validateSourceEligibility({
    parentStatus: 'finalized',
    estimate: { documentType: 'Invoice', relatedReportId: 'report-1', status: 'finalized' },
    expectedRelatedReportId: 'report-1',
  });
  assert.equal(result.code, 'SOURCE_NOT_ESTIMATE');
});

test('validateSourceEligibility rejects an estimate that is not linked to THIS report (cross-report reuse blocked)', () => {
  const result = validateSourceEligibility({
    parentStatus: 'finalized',
    estimate: { documentType: 'RepairEstimate', relatedReportId: 'some-other-report', status: 'finalized' },
    expectedRelatedReportId: 'report-1',
  });
  assert.equal(result.code, 'ESTIMATE_NOT_LINKED');
});

test('validateSourceEligibility rejects a draft (un-approved) estimate', () => {
  const result = validateSourceEligibility({
    parentStatus: 'finalized',
    estimate: { documentType: 'RepairEstimate', relatedReportId: 'report-1', status: 'draft' },
    expectedRelatedReportId: 'report-1',
  });
  assert.equal(result.code, 'ESTIMATE_NOT_APPROVED');
});

test('validateSourceEligibility accepts a finalized report + finalized, correctly-linked estimate', () => {
  const result = validateSourceEligibility({
    parentStatus: 'finalized',
    estimate: { documentType: 'RepairEstimate', relatedReportId: 'report-1', status: 'finalized' },
    expectedRelatedReportId: 'report-1',
  });
  assert.equal(result.ok, true);
  assert.equal(result.error, undefined);
});

test('validateSourceEligibility also accepts the legacy "completed" reviewed status on either side', () => {
  const result = validateSourceEligibility({
    parentStatus: 'completed',
    estimate: { documentType: 'RepairEstimate', relatedReportId: 'report-1', status: 'completed' },
    expectedRelatedReportId: 'report-1',
  });
  assert.equal(result.ok, true);
});

// ── Server-side role authorization (Golden Rule #4-adjacent) ────────────
// Creating/revising a Coverage Determination Letter requires `canApprove`
// (not just `canGenerate`) because authoring it IS making a coverage
// determination -- the same authority level as approving a report.

test('hasCapability: owner/admin/manager/adjuster/reviewer can approve (and thus author a coverage letter); inspector/viewer cannot', () => {
  const org = { uid: 'org-1' }; // resolves to 'owner' of themselves
  assert.equal(hasCapability(org, 'canApprove'), true);
  assert.equal(hasCapability({ uid: 'm1', teamOwnerId: 'org-1', teamRole: 'admin' }, 'canApprove'), true);
  assert.equal(hasCapability({ uid: 'm2', teamOwnerId: 'org-1', teamRole: 'manager' }, 'canApprove'), true);
  assert.equal(hasCapability({ uid: 'm3', teamOwnerId: 'org-1', teamRole: 'adjuster' }, 'canApprove'), true);
  assert.equal(hasCapability({ uid: 'm4', teamOwnerId: 'org-1', teamRole: 'reviewer' }, 'canApprove'), true);
  assert.equal(hasCapability({ uid: 'm5', teamOwnerId: 'org-1', teamRole: 'inspector' }, 'canApprove'), false);
  assert.equal(hasCapability({ uid: 'm6', teamOwnerId: 'org-1', teamRole: 'viewer' }, 'canApprove'), false);
});

// ── Content assembly (deterministic markdown -- no AI) ──────────────────

test('buildCoverageLetterContent renders every adjuster-entered word verbatim and includes the fixed glossary + attestation notice', () => {
  const computed = validateAndComputeCoverageLetter(validBody(), LINE_ITEMS, DEPRECIATION_SCHEDULE);
  const content = buildCoverageLetterContent(
    { claimNumber: 'CLM-2024-WH-118', policyNumber: 'HO-558214-TX', lossDate: '2024-03-22', propertyAddress: validAddressee.address },
    computed,
    0,
    [{ version: 0, date: '2024-05-03', changeSummary: 'Initial coverage determination letter created', initialPayment: computed.totals.initialPayment }]
  );
  assert.match(content, /Partial Approval/);
  assert.match(content, /Patricia Johnson/);
  assert.match(content, /D\. Ramirez, Senior Claims Adjuster/);
  assert.match(content, /\$28,345\.80/);
  assert.match(content, /\$22,663\.20/);
  assert.match(content, /Awaiting independent HVAC technician evaluation\./);
  assert.equal(content.includes(RCV_ACV_GLOSSARY), true);
  assert.equal(content.includes(ATTESTATION_NOTICE), true);
});

test('the fixed RCV/ACV glossary and attestation notice never state a coverage/legal determination (Golden Rule #2)', () => {
  const forbidden = /\bcovered\b|\bnot covered\b|\bdenied\b|\bapproved\b|\bliable\b|\bfraud\b/i;
  assert.equal(forbidden.test(RCV_ACV_GLOSSARY), false);
  // ATTESTATION_NOTICE intentionally instructs review/approval workflow language
  // ("reviewed and approved by a licensed adjuster") -- that's a process
  // instruction, not a coverage decision, so only check it never states an
  // outcome verdict word.
  assert.equal(/\bis covered\b|\bis not covered\b|\bis denied\b|\bis liable\b/i.test(ATTESTATION_NOTICE), false);
});
