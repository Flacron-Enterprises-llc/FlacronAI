const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateReport,
  generateTheftReport,
  buildTheftStaticSections,
  buildTheftNarrativePrompt,
  parseTheftNarrative,
  assembleTheftReport,
  THEFT_NARRATIVE_KEYS,
} = require('../services/aiService');

// Phase 34 (Theft/Burglary Inspection Report, PHASES.md): keyed off
// `lossType === 'Theft'`, same precedence pattern as Phase 33's Flood
// manifest -- a lossType template wins over any claimType template. Scoped
// to visible structural entry-point damage only; contents/valuation/theft
// determination are explicitly out of scope, backstopped by a fixed,
// deterministic disclaimer. Reuses Phase 31's static+single-structured-call
// architecture exactly.

const SAMPLE_REPORT_DATA = {
  claimNumber: 'CLM-2024-TH-511',
  insuredName: 'David Chen',
  insuredEmail: 'd.chen@example.com',
  propertyAddress: '245 Sunset Terrace, Cedar Park, TX 78613',
  lossDate: '2024-06-08',
  lossType: 'Theft',
  policyNumber: 'HO-664821-TX',
  policeIncidentNumber: 'CPPD-2024-04417',
  pointsOfEntry: 'Rear window, side entry door',
  reportType: 'Initial Inspection',
};

const NARRATIVE_FIXTURE = {
  incidentSummary: 'The insured reports discovering signs of forced entry upon returning home.',
  damageAssessment: '- Rear window: shattered glass pattern visible, consistent with reported forced entry.\n- Side entry door: splintering visible at the frame near the strike plate.',
  scopeOfWork: '- Rear window glass replacement, including sash hardware inspection\n- Side entry door frame repair and strike plate/lockset replacement',
  recommendations: '- Confirm the police incident report is on file\n- Request the insured\'s itemized contents inventory',
  conclusion:
    'This draft organizes the documented structural entry-point conditions for adjuster review. Contents valuation is tracked separately.\n\n',
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

test('buildTheftStaticSections renders Insured & Policy Information / Property & Loss Information / Incident Data exactly from input fields', () => {
  const { insuredInfo, propertyLossInfo, incidentData, checklist } =
    buildTheftStaticSections(SAMPLE_REPORT_DATA);
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  assert.equal(
    insuredInfo,
    `## SECTION 1: INSURED & POLICY INFORMATION
| Field | Value |
|-------|-------|
| Claim Number | CLM-2024-TH-511 |
| Named Insured | David Chen |
| Insured Contact | d.chen@example.com |
| Policy Number | HO-664821-TX |`
  );

  assert.equal(
    propertyLossInfo,
    `## SECTION 2: PROPERTY & LOSS INFORMATION
| Field | Value |
|-------|-------|
| Property Address | 245 Sunset Terrace, Cedar Park, TX 78613 |
| Date of Loss | 2024-06-08 |
| Loss Type | Theft |
| Report Type | Initial Inspection |
| Report Date | ${reportDate} |`
  );

  assert.equal(
    incidentData,
    `## SECTION 3: INCIDENT DATA — POLICE REPORT (REPORTED, UNVERIFIED)
| Field | Value |
|-------|-------|
| Police Incident Number | CPPD-2024-04417 |
| Points of Entry Reported | Rear window, side entry door |
| Date of Loss | 2024-06-08 |`
  );

  assert.match(checklist, /^## SECTION 7: ADJUSTER REVIEW CHECKLIST/);
  assert.match(checklist, /Coverage and theft determination under the policy -- NOT determined by this draft/);
});

test('buildTheftStaticSections falls back to "Not provided" for missing optional fields', () => {
  const { insuredInfo, incidentData } = buildTheftStaticSections({
    ...SAMPLE_REPORT_DATA,
    policyNumber: '',
    policeIncidentNumber: '',
    pointsOfEntry: '',
  });
  assert.match(insuredInfo, /\| Policy Number \| Not provided \|/);
  assert.match(incidentData, /\| Police Incident Number \| Not provided \|/);
  assert.match(incidentData, /\| Points of Entry Reported \| Not provided \|/);
});

test('theft narrative prompt requires cautious language, forbids a hard determination of stolen items/value, and carries the scope rule', () => {
  const prompt = buildTheftNarrativePrompt(SAMPLE_REPORT_DATA, null);
  assert.match(prompt, /appears.*may indicate.*is consistent with/is);
  assert.match(prompt, /do not make a final determination of cause of loss, coverage, liability, fraud, or final repair costs/i);
  assert.match(prompt, /never state or imply which items were present before the loss, were stolen, or their value/i);
  assert.match(prompt, /David Chen/);
  assert.match(prompt, /CLM-2024-TH-511/);
});

test('parseTheftNarrative extracts exactly the 5 known keys and ignores everything else', () => {
  const text = JSON.stringify({
    ...NARRATIVE_FIXTURE,
    unexpectedKey: 'ignored',
    incidentSummary: '   ',
  });
  const parsed = parseTheftNarrative(text);
  assert.deepEqual(Object.keys(parsed).sort(), [
    'conclusion',
    'damageAssessment',
    'recommendations',
    'scopeOfWork',
  ]);
  assert.equal(parsed.unexpectedKey, undefined);
});

test('assembleTheftReport stitches static + narrative sections in manifest order, carries the fixed disclaimer, and has no missing-narrative gaps', () => {
  const staticSections = buildTheftStaticSections(SAMPLE_REPORT_DATA);
  const content = assembleTheftReport(staticSections, NARRATIVE_FIXTURE, null, 0);

  assert.match(content, /^# THEFT \/ BURGLARY INSPECTION REPORT/);
  // Fixed, deterministic disclaimer -- must appear verbatim regardless of
  // what the AI narrative says. The AI must never claim what items existed,
  // were stolen, or their value.
  assert.match(content, /established solely by the insured's itemized contents inventory and the police incident report/);

  const order = [
    'SECTION 1: INSURED & POLICY INFORMATION',
    'SECTION 2: PROPERTY & LOSS INFORMATION',
    'SECTION 3: INCIDENT DATA',
    'SECTION 4: INCIDENT SUMMARY',
    'SECTION 5: DAMAGE ASSESSMENT',
    'SECTION 6: SCOPE OF WORK',
    'SECTION 7: ADJUSTER REVIEW CHECKLIST',
    'SECTION 8: RECOMMENDATIONS',
    'SECTION 9: CONCLUSION',
    'SECTION 10: PHOTO DOCUMENTATION',
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

test('generateTheftReport makes exactly ONE AI call per report when every narrative key comes back on the first try', async () => {
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(NARRATIVE_FIXTURE), modelUsed: 'test/mock' },
  ]);
  const { content, modelUsed } = await generateTheftReport(SAMPLE_REPORT_DATA, null, 0, {
    generateFn,
  });

  assert.equal(generateFn.calls.length, 1, 'expected exactly one AI call, not one per section');
  assert.equal(modelUsed, 'test/mock');
  assert.match(content, /# THEFT \/ BURGLARY INSPECTION REPORT/);
  // No hard verdict phrases, and no claim about specific stolen items/value,
  // should ever be hardcoded into the deterministic scaffold.
  assert.doesNotMatch(content, /is covered under the policy|is the confirmed cause|liable for|items stolen were worth/i);
});

test('generateTheftReport does one repair retry for a missing key, then ships a complete report', async () => {
  const incomplete = { ...NARRATIVE_FIXTURE };
  delete incomplete.conclusion;
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(incomplete), modelUsed: 'test/mock' }, // main call: missing "conclusion"
    {
      text: 'This draft organizes the documented structural entry-point conditions for adjuster review.',
      modelUsed: 'test/mock',
    }, // repair call
  ]);
  const { content } = await generateTheftReport(SAMPLE_REPORT_DATA, null, 0, { generateFn });

  assert.equal(generateFn.calls.length, 2, 'expected the main call plus exactly one repair call');
  assert.match(content, /SECTION 9: CONCLUSION\n.*documented structural entry-point conditions/s);
});

test('generateTheftReport throws a clear generation-failure if a key is still missing after its repair retry', async () => {
  const incomplete = { ...NARRATIVE_FIXTURE };
  delete incomplete.scopeOfWork;
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(incomplete), modelUsed: 'test/mock' },
    { text: '', modelUsed: 'test/mock' }, // repair also fails to produce usable text
  ]);
  await assert.rejects(
    () => generateTheftReport(SAMPLE_REPORT_DATA, null, 0, { generateFn }),
    /scopeOfWork/
  );
});

test('generateReport dispatches Theft lossType to the Theft architecture, not the generic template', async () => {
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(NARRATIVE_FIXTURE), modelUsed: 'test/mock' },
  ]);
  const { content } = await generateReport(SAMPLE_REPORT_DATA, null, 0, { generateFn });
  assert.equal(generateFn.calls.length, 1);
  assert.match(content, /^# THEFT \/ BURGLARY INSPECTION REPORT/);
});

test('generateReport: a Theft lossType takes precedence over a Commercial claimType (approved precedence rule reused from Phase 33)', async () => {
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(NARRATIVE_FIXTURE), modelUsed: 'test/mock' },
  ]);
  const { content } = await generateReport(
    { ...SAMPLE_REPORT_DATA, claimType: 'Commercial', propertyManagerName: 'K. Sullivan, CBRE Property Management' },
    null,
    0,
    { generateFn }
  );
  assert.match(content, /^# THEFT \/ BURGLARY INSPECTION REPORT/);
  assert.doesNotMatch(content, /^# COMMERCIAL PROPERTY INSPECTION REPORT/);
});

test('generateReport still dispatches Liability/Commercial/Flood to their own architectures when lossType is not Theft (no regression)', async () => {
  const liabilityFixture = {
    incidentSummary: 'x', sceneObservations: 'x', investigationChecklist: '- x',
    recommendations: '- x', conclusion: 'x',
  };
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(liabilityFixture), modelUsed: 'test/mock' },
  ]);
  const { content } = await generateReport(
    { ...SAMPLE_REPORT_DATA, lossType: 'Water Damage', claimType: 'Liability' },
    null,
    0,
    { generateFn }
  );
  assert.match(content, /^# LIABILITY INVESTIGATION REPORT/);
});

test('THEFT_NARRATIVE_KEYS has exactly the 5 documented narrative slots', () => {
  assert.deepEqual([...THEFT_NARRATIVE_KEYS].sort(), [
    'conclusion',
    'damageAssessment',
    'incidentSummary',
    'recommendations',
    'scopeOfWork',
  ]);
});
