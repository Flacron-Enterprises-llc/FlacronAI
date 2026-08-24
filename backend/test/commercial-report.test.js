const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateReport,
  generateCommercialReport,
  buildCommercialStaticSections,
  buildCommercialNarrativePrompt,
  parseCommercialNarrative,
  assembleCommercialReport,
  COMMERCIAL_NARRATIVE_KEYS,
} = require('../services/aiService');

// Phase 32 (Commercial Property Inspection Report, PHASES.md): a Commercial
// claim gets a distinct, sample-matched document structure instead of the
// generic freeform template -- static sections built directly from report
// fields (zero AI involvement) plus ONE structured AI call for every
// narrative section, never one call per section. Reuses Phase 31's
// architecture exactly.

const SAMPLE_REPORT_DATA = {
  claimNumber: 'CLM-2024-CM-118',
  insuredName: 'Round Rock Retail Holdings LLC',
  propertyAddress: '3400 Commerce Park Drive, Round Rock, TX 78665',
  lossDate: '2024-04-18',
  lossType: 'Wind / Hail',
  policyNumber: 'CP-903471-TX',
  propertyManagerName: 'K. Sullivan, CBRE Property Management',
  propertyManagerContact: 'k.sullivan@example.com',
  roofType: 'Single-ply TPO membrane, mechanically attached',
  roofAge: '8 years',
  tenantSuiteCount: '6',
  reportType: 'Initial Inspection',
};

const NARRATIVE_FIXTURE = {
  lossDescription: 'Property management reports wind and hail impact during a severe thunderstorm.',
  damageAssessment: '- Roof membrane: lifted seam and puncture appear visible.\n- Rooftop HVAC: denting visible.',
  roofMoistureScan: 'A full roof moisture scan is recommended before scope is finalized.',
  scopeOfWork: '- Roof membrane repair, pending moisture scan\n- RTU evaluation and repair',
  recommendations: '- Prioritize the roof moisture scan\n- Notify all tenant suites',
  conclusion:
    'This is a preliminary draft for licensed-adjuster review. No coverage or final scope determination has been made.\n\n',
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

test('buildCommercialStaticSections renders Insured & Property Information / Adjuster Review Checklist exactly from input fields', () => {
  const { propertyInfo, checklist } = buildCommercialStaticSections(SAMPLE_REPORT_DATA);
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  assert.equal(
    propertyInfo,
    `## SECTION 1: INSURED & PROPERTY INFORMATION
| Field | Value |
|-------|-------|
| Claim Number | CLM-2024-CM-118 |
| Named Insured | Round Rock Retail Holdings LLC |
| Property Address | 3400 Commerce Park Drive, Round Rock, TX 78665 |
| Date of Loss | 2024-04-18 |
| Loss Type | Wind / Hail |
| Policy Number | CP-903471-TX |
| Property Manager Contact | K. Sullivan, CBRE Property Management (k.sullivan@example.com) |
| Number of Tenant Suites | 6 |
| Roof Type | Single-ply TPO membrane, mechanically attached |
| Roof Age | 8 years |
| Report Type | Initial Inspection |
| Report Date | ${reportDate} |`
  );

  assert.match(checklist, /^## SECTION 6: ADJUSTER REVIEW CHECKLIST/);
  assert.match(checklist, /Coverage determination under the policy -- NOT determined by this draft/);
});

test('buildCommercialStaticSections falls back to "Not provided" for missing optional fields', () => {
  const { propertyInfo } = buildCommercialStaticSections({
    ...SAMPLE_REPORT_DATA,
    policyNumber: '',
    propertyManagerName: '',
    propertyManagerContact: '',
    roofType: '',
    roofAge: '',
    tenantSuiteCount: '',
  });
  assert.match(propertyInfo, /\| Policy Number \| Not provided \|/);
  assert.match(propertyInfo, /\| Property Manager Contact \| Not provided \|/);
  assert.match(propertyInfo, /\| Number of Tenant Suites \| Not provided \|/);
  assert.match(propertyInfo, /\| Roof Type \| Not provided \|/);
  assert.match(propertyInfo, /\| Roof Age \| Not provided \|/);
});

test('commercial narrative prompt requires cautious language, forbids a hard coverage/cost verdict, and excludes BI/tenant-specific scope', () => {
  const prompt = buildCommercialNarrativePrompt(SAMPLE_REPORT_DATA, null);
  assert.match(prompt, /appears.*may indicate.*is consistent with/is);
  assert.match(prompt, /do not make a final determination of cause of loss, coverage, liability, or final repair costs/i);
  assert.match(prompt, /business interruption and tenant-specific claims are out of scope/i);
  assert.match(prompt, /Round Rock Retail Holdings LLC/);
  assert.match(prompt, /CLM-2024-CM-118/);
});

test('parseCommercialNarrative extracts exactly the 6 known keys and ignores everything else', () => {
  const text = JSON.stringify({
    ...NARRATIVE_FIXTURE,
    unexpectedKey: 'ignored',
    lossDescription: '   ',
  });
  const parsed = parseCommercialNarrative(text);
  assert.deepEqual(Object.keys(parsed).sort(), [
    'conclusion',
    'damageAssessment',
    'recommendations',
    'roofMoistureScan',
    'scopeOfWork',
  ]);
  assert.equal(parsed.unexpectedKey, undefined);
});

test('assembleCommercialReport stitches static + narrative sections in manifest order with no missing-narrative gaps', () => {
  const staticSections = buildCommercialStaticSections(SAMPLE_REPORT_DATA);
  const content = assembleCommercialReport(staticSections, NARRATIVE_FIXTURE, null, 0);

  assert.match(content, /^# COMMERCIAL PROPERTY INSPECTION REPORT/);
  const order = [
    'SECTION 1: INSURED & PROPERTY INFORMATION',
    'SECTION 2: LOSS DESCRIPTION',
    'SECTION 3: DAMAGE ASSESSMENT',
    'SECTION 4: ROOF MOISTURE SCAN',
    'SECTION 5: SCOPE OF WORK',
    'SECTION 6: ADJUSTER REVIEW CHECKLIST',
    'SECTION 7: RECOMMENDATIONS',
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

test('generateCommercialReport makes exactly ONE AI call per report when every narrative key comes back on the first try', async () => {
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(NARRATIVE_FIXTURE), modelUsed: 'test/mock' },
  ]);
  const { content, modelUsed } = await generateCommercialReport(SAMPLE_REPORT_DATA, null, 0, {
    generateFn,
  });

  assert.equal(generateFn.calls.length, 1, 'expected exactly one AI call, not one per section');
  assert.equal(modelUsed, 'test/mock');
  assert.match(content, /# COMMERCIAL PROPERTY INSPECTION REPORT/);
  assert.match(content, /No coverage or final scope determination has been made/);
  // No hard verdict phrases should ever be hardcoded into the deterministic scaffold.
  assert.doesNotMatch(content, /is covered under the policy|is the confirmed cause|liable for/i);
});

test('generateCommercialReport does one repair retry for a missing key, then ships a complete report', async () => {
  const incomplete = { ...NARRATIVE_FIXTURE };
  delete incomplete.conclusion;
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(incomplete), modelUsed: 'test/mock' }, // main call: missing "conclusion"
    {
      text: 'This is a preliminary draft for licensed-adjuster review. No coverage determination has been made.',
      modelUsed: 'test/mock',
    }, // repair call
  ]);
  const { content } = await generateCommercialReport(SAMPLE_REPORT_DATA, null, 0, { generateFn });

  assert.equal(generateFn.calls.length, 2, 'expected the main call plus exactly one repair call');
  assert.match(content, /SECTION 8: CONCLUSION\n.*preliminary draft for licensed-adjuster review/s);
});

test('generateCommercialReport throws a clear generation-failure if a key is still missing after its repair retry', async () => {
  const incomplete = { ...NARRATIVE_FIXTURE };
  delete incomplete.scopeOfWork;
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(incomplete), modelUsed: 'test/mock' },
    { text: '', modelUsed: 'test/mock' }, // repair also fails to produce usable text
  ]);
  await assert.rejects(
    () => generateCommercialReport(SAMPLE_REPORT_DATA, null, 0, { generateFn }),
    /scopeOfWork/
  );
});

test('generateReport dispatches Commercial claimType to the Commercial architecture, not the generic template', async () => {
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(NARRATIVE_FIXTURE), modelUsed: 'test/mock' },
  ]);
  const { content } = await generateReport(
    { ...SAMPLE_REPORT_DATA, claimType: 'Commercial' },
    null,
    0,
    { generateFn }
  );
  assert.equal(generateFn.calls.length, 1);
  assert.match(content, /^# COMMERCIAL PROPERTY INSPECTION REPORT/);
});

test('generateReport still dispatches Liability claimType to the Liability architecture (no regression)', async () => {
  const liabilityFixture = {
    incidentSummary: 'x', sceneObservations: 'x', investigationChecklist: '- x',
    recommendations: '- x', conclusion: 'x',
  };
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(liabilityFixture), modelUsed: 'test/mock' },
  ]);
  const { content } = await generateReport(
    { ...SAMPLE_REPORT_DATA, claimType: 'Liability' },
    null,
    0,
    { generateFn }
  );
  assert.match(content, /^# LIABILITY INVESTIGATION REPORT/);
});

test('COMMERCIAL_NARRATIVE_KEYS has exactly the 6 documented narrative slots', () => {
  assert.deepEqual([...COMMERCIAL_NARRATIVE_KEYS].sort(), [
    'conclusion',
    'damageAssessment',
    'lossDescription',
    'recommendations',
    'roofMoistureScan',
    'scopeOfWork',
  ]);
});
