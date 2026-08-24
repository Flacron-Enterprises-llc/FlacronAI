const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateReport,
  generateMoldReport,
  buildMoldStaticSections,
  buildMoldNarrativePrompt,
  parseMoldNarrative,
  assembleMoldReport,
  MOLD_NARRATIVE_KEYS,
  MOLD_SCOPE_NOTICE,
} = require('../services/aiService');

// Phase 36 (Mold Assessment Supplemental Report, PHASES.md): keyed off
// `documentType === 'MoldSupplement'`, generated from an ALREADY-EXISTING
// report rather than the primary wizard. Smallest AI narrative surface of
// any document type -- exactly 2 slots (Visual Observations, Recommended
// Next Steps). The "NOT a certified mold assessment" scope notice is fixed,
// deterministic code, never AI-generated, and must appear byte-for-byte
// identical across every generation (unlike narrative sections elsewhere).

const SAMPLE_REPORT_DATA = {
  documentType: 'MoldSupplement',
  claimNumber: 'CLM-2024-WD-337-M',
  relatedClaimId: 'CLM-2024-WD-337',
  insuredName: 'Priya Nair',
  insuredEmail: 'p.nair@example.com',
  propertyAddress: '58 Cedar Hollow Drive, Cedar Park, TX 78613',
  dateOfDiscovery: '2024-07-19',
  policyNumber: 'HO-663310-TX',
};

const NARRATIVE_FIXTURE = {
  visualObservations:
    '- Utility room wall: dark speckled growth pattern visible, consistent in appearance with mold. Species identification and air quality testing require a certified mold assessor, not this report.\n- HVAC return vent: dark speckled growth visible on the grille. HVAC technician and mold assessor evaluation recommended before system operation continues.',
  recommendedNextSteps:
    '- Engage a certified mold assessor for a full visual inspection, moisture mapping, and sampling.\n- Discontinue HVAC operation in the affected zone, if isolable, until confirmed safe.',
};

const makeGenerateFn = (responses) => {
  const calls = [];
  let i = 0;
  const fn = async (prompt) => {
    calls.push(prompt);
    const next = responses[Math.min(i, responses.length - 1)];
    i++;
    return typeof next === 'function' ? next(prompt) : next;
  };
  fn.calls = calls;
  return fn;
};

test('buildMoldStaticSections renders Report Information / Insured Information / Background exactly from input fields', () => {
  const { reportInfo, insuredInfo, background, checklist } =
    buildMoldStaticSections(SAMPLE_REPORT_DATA);
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  assert.equal(
    reportInfo,
    `## SECTION 1: REPORT INFORMATION
| Field | Value |
|-------|-------|
| Claim Number | CLM-2024-WD-337-M |
| Related Claim | CLM-2024-WD-337 |
| Named Insured | Priya Nair |
| Property Address | 58 Cedar Hollow Drive, Cedar Park, TX 78613 |
| Date of Discovery | 2024-07-19 |
| Report Type | Preliminary Visual Assessment — AI-assisted draft |
| Report Date | ${reportDate} |`
  );

  assert.equal(
    insuredInfo,
    `## SECTION 2: INSURED INFORMATION
| Field | Value |
|-------|-------|
| Named Insured | Priya Nair |
| Insured Contact | p.nair@example.com |
| Policy Number | HO-663310-TX |`
  );

  assert.match(background, /^## SECTION 3: BACKGROUND — RELATED CLAIM/);
  assert.match(background, /CLM-2024-WD-337/);
  assert.match(background, /2024-07-19/);

  assert.match(checklist, /^## SECTION 7: ADJUSTER REVIEW CHECKLIST/);
  assert.match(checklist, /Coverage determination under the policy -- NOT determined by this draft/);
  assert.match(checklist, /Engage a certified mold assessor/);
});

test('buildMoldStaticSections falls back to "Not provided" for missing optional fields', () => {
  const { insuredInfo, reportInfo } = buildMoldStaticSections({
    ...SAMPLE_REPORT_DATA,
    policyNumber: '',
    relatedClaimId: '',
  });
  assert.match(insuredInfo, /\| Policy Number \| Not provided \|/);
  assert.match(reportInfo, /\| Related Claim \| Not provided \|/);
});

test('mold narrative prompt requires cautious language, forbids species/health-risk/remediation/coverage/cost determinations, and carries claim data', () => {
  const prompt = buildMoldNarrativePrompt(SAMPLE_REPORT_DATA, null);
  assert.match(prompt, /appears.*may indicate.*is consistent with/is);
  assert.match(prompt, /NEVER identify or suggest a mold species/i);
  assert.match(prompt, /NEVER state or imply a health risk, habitability determination, or air quality/i);
  assert.match(prompt, /NEVER propose a certified remediation protocol/i);
  assert.match(prompt, /do not make a determination of coverage, liability, or any repair\/remediation cost/i);
  assert.match(prompt, /Priya Nair/);
  assert.match(prompt, /CLM-2024-WD-337-M/);
  assert.match(prompt, /CLM-2024-WD-337/);
});

test('parseMoldNarrative extracts exactly the 2 known keys and ignores everything else', () => {
  const text = JSON.stringify({
    ...NARRATIVE_FIXTURE,
    unexpectedKey: 'ignored',
    visualObservations: '   ',
  });
  const parsed = parseMoldNarrative(text);
  assert.deepEqual(Object.keys(parsed).sort(), ['recommendedNextSteps']);
  assert.equal(parsed.unexpectedKey, undefined);
});

test('assembleMoldReport stitches static + narrative sections in manifest order and includes the fixed scope notice verbatim', () => {
  const staticSections = buildMoldStaticSections(SAMPLE_REPORT_DATA);
  const content = assembleMoldReport(staticSections, NARRATIVE_FIXTURE, null, 0);

  assert.match(content, /^# MOLD ASSESSMENT — PRELIMINARY REPORT/);

  // The scope-notice section must appear byte-for-byte identical to the
  // exported constant -- this is the one section that must NEVER be
  // AI-generated or paraphrased (Golden Rule #2/#3).
  assert.ok(content.includes(MOLD_SCOPE_NOTICE), 'expected the fixed scope notice to appear verbatim');
  assert.match(content, /NOT a certified mold assessment/);
  assert.match(content, /Species identification/);
  assert.match(content, /Air quality or surface sampling results/);
  assert.match(content, /certified remediation protocol/);
  assert.match(content, /determination of coverage, liability, or repair\/remediation cost/);

  const order = [
    'SECTION 1: REPORT INFORMATION',
    'SECTION 2: INSURED INFORMATION',
    'SECTION 3: BACKGROUND',
    'SECTION 4: IMPORTANT NOTICE — SCOPE OF THIS REPORT',
    'SECTION 5: VISUAL OBSERVATIONS',
    'SECTION 6: RECOMMENDED NEXT STEPS',
    'SECTION 7: ADJUSTER REVIEW CHECKLIST',
    'SECTION 8: CONCLUSION',
    'SECTION 9: PHOTO DOCUMENTATION',
  ];
  let lastIndex = -1;
  for (const heading of order) {
    const idx = content.indexOf(heading);
    assert.ok(idx > lastIndex, `expected "${heading}" to appear, in order`);
    lastIndex = idx;
  }
  // No photos provided -- the deterministic disclaimer must appear, not a blank section.
  assert.match(content, /No photographs were provided/);
  // No dollar figures/cost estimate should ever be hardcoded into the deterministic scaffold.
  assert.doesNotMatch(content, /\$[\d,]/);
});

test('assembleMoldReport produces byte-for-byte identical scope-notice/checklist/disclosure sections across two independent generations (deterministic, non-AI)', () => {
  const staticSections1 = buildMoldStaticSections(SAMPLE_REPORT_DATA);
  const staticSections2 = buildMoldStaticSections({ ...SAMPLE_REPORT_DATA });
  const content1 = assembleMoldReport(staticSections1, NARRATIVE_FIXTURE, null, 0);
  const content2 = assembleMoldReport(staticSections2, NARRATIVE_FIXTURE, null, 0);

  const extractSection = (content, heading, nextHeading) => {
    const start = content.indexOf(heading);
    const end = content.indexOf(nextHeading, start);
    return content.slice(start, end === -1 ? undefined : end);
  };
  assert.equal(
    extractSection(content1, '## SECTION 4', '## SECTION 5'),
    extractSection(content2, '## SECTION 4', '## SECTION 5'),
    'the scope-notice section must be an exact match across generations'
  );
});

test('generateMoldReport makes exactly ONE AI call per supplement when both narrative keys come back on the first try', async () => {
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(NARRATIVE_FIXTURE), modelUsed: 'test/mock' },
  ]);
  const { content, modelUsed } = await generateMoldReport(SAMPLE_REPORT_DATA, null, 0, {
    generateFn,
  });

  assert.equal(generateFn.calls.length, 1, 'expected exactly one AI call, not one per section');
  assert.equal(modelUsed, 'test/mock');
  assert.match(content, /# MOLD ASSESSMENT — PRELIMINARY REPORT/);
  assert.doesNotMatch(content, /is covered under the policy|is the confirmed cause|liable for|clearance testing has confirmed/i);
});

test('generateMoldReport does one repair retry for a missing key, then ships a complete report', async () => {
  const incomplete = { ...NARRATIVE_FIXTURE };
  delete incomplete.recommendedNextSteps;
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(incomplete), modelUsed: 'test/mock' }, // main call: missing "recommendedNextSteps"
    {
      text: '- Engage a certified mold assessor for a full inspection.',
      modelUsed: 'test/mock',
    }, // repair call
  ]);
  const { content } = await generateMoldReport(SAMPLE_REPORT_DATA, null, 0, { generateFn });

  assert.equal(generateFn.calls.length, 2, 'expected the main call plus exactly one repair call');
  assert.match(content, /SECTION 6: RECOMMENDED NEXT STEPS\n.*Engage a certified mold assessor/s);
});

test('generateMoldReport throws a clear generation-failure if a key is still missing after its repair retry', async () => {
  const incomplete = { ...NARRATIVE_FIXTURE };
  delete incomplete.visualObservations;
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(incomplete), modelUsed: 'test/mock' },
    { text: '', modelUsed: 'test/mock' }, // repair also fails to produce usable text
  ]);
  await assert.rejects(
    () => generateMoldReport(SAMPLE_REPORT_DATA, null, 0, { generateFn }),
    /visualObservations/
  );
});

test('generateReport dispatches documentType === MoldSupplement to the Mold architecture, not the generic template', async () => {
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(NARRATIVE_FIXTURE), modelUsed: 'test/mock' },
  ]);
  const { content } = await generateReport(SAMPLE_REPORT_DATA, null, 0, { generateFn });
  assert.equal(generateFn.calls.length, 1);
  assert.match(content, /^# MOLD ASSESSMENT — PRELIMINARY REPORT/);
});

test('generateReport: documentType === MoldSupplement takes precedence over any lossType/claimType (Flood/Theft/Liability/Commercial/Auto)', async () => {
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(NARRATIVE_FIXTURE), modelUsed: 'test/mock' },
  ]);
  const { content } = await generateReport(
    { ...SAMPLE_REPORT_DATA, lossType: 'Flood', claimType: 'Commercial' },
    null,
    0,
    { generateFn }
  );
  assert.match(content, /^# MOLD ASSESSMENT — PRELIMINARY REPORT/);
  assert.doesNotMatch(content, /^# FLOOD|^# COMMERCIAL/);
});

test('generateReport still dispatches Theft/Liability/Flood to their own architectures when documentType is not MoldSupplement (no regression)', async () => {
  const theftFixture = {
    incidentSummary: 'x', damageAssessment: '- x', scopeOfWork: '- x',
    recommendations: '- x', conclusion: 'x',
  };
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(theftFixture), modelUsed: 'test/mock' },
  ]);
  const { content } = await generateReport(
    { claimNumber: 'CLM-1', insuredName: 'X', propertyAddress: 'Y', lossDate: '2024-01-01', lossType: 'Theft' },
    null,
    0,
    { generateFn }
  );
  assert.match(content, /^# THEFT \/ BURGLARY INSPECTION REPORT/);
});

test('MOLD_NARRATIVE_KEYS has exactly the 2 documented narrative slots', () => {
  assert.deepEqual([...MOLD_NARRATIVE_KEYS].sort(), [
    'recommendedNextSteps',
    'visualObservations',
  ]);
});

test('MOLD_SCOPE_NOTICE verbatim text prohibits species identification, air quality/health-risk, remediation protocol, coverage/liability, and cost determinations', () => {
  assert.match(MOLD_SCOPE_NOTICE, /NOT a certified mold assessment/);
  assert.match(MOLD_SCOPE_NOTICE, /Species identification/);
  assert.match(MOLD_SCOPE_NOTICE, /Air quality or surface sampling results, or any determination of health risk or habitability/);
  assert.match(MOLD_SCOPE_NOTICE, /certified remediation protocol or clearance testing plan/);
  assert.match(MOLD_SCOPE_NOTICE, /determination of coverage, liability, or repair\/remediation cost/);
});
