const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateReport,
  generateFloodReport,
  buildFloodStaticSections,
  buildFloodNarrativePrompt,
  parseFloodNarrative,
  assembleFloodReport,
  FLOOD_NARRATIVE_KEYS,
} = require('../services/aiService');

// Phase 33 (Flood (NFIP) Inspection Report, PHASES.md): keyed off
// `lossType === 'Flood'` (not `claimType`, unlike Phases 31/32) -- the
// approved precedence rule is that a Flood lossType wins over any claimType
// template, and a Commercial claim with a Flood loss keeps its applicable
// commercial-property fields folded into the Flood static section. Reuses
// Phase 31's static+single-structured-call architecture exactly.

const SAMPLE_REPORT_DATA = {
  claimNumber: 'CLM-2024-FL-902',
  insuredName: 'James Whitfield',
  insuredEmail: 'j.whitfield@example.com',
  propertyAddress: '77 Riverbend Drive, Pflugerville, TX 78660',
  lossDate: '2024-05-28',
  lossType: 'Flood',
  policyNumber: 'FL-889213-TX',
  floodZone: 'AE',
  lowestFloorElevation: '512.4 ft',
  baseFloodElevation: '514.0 ft',
  floodEventSource: 'NWS river forecast / local flood gauge report',
  reportedCrest: '3.2 ft above flood stage',
  reportType: 'Initial Inspection',
};

const NARRATIVE_FIXTURE = {
  propertyDescription: 'Single-story slab-on-grade residence, approximately 2,200 sq ft.',
  damageAssessment: '- Foundation: discoloration band appears consistent with a standing water line.\n- Garage floor: silt/mud residue visible.',
  scopeOfWork: '- Whole-house flood cut to 2 ft above the documented water line\n- Structural drying and dehumidification',
  recommendations: '- Begin structural drying immediately\n- Confirm NFIP below-grade coverage limitations',
  conclusion:
    'This is a preliminary draft for licensed-adjuster review. No coverage or claim determination has been made under the NFIP policy.\n\n',
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

test('buildFloodStaticSections renders Insured & Policy Information / Property & Flood Zone Data / Flood Event Data exactly from input fields', () => {
  const { insuredInfo, propertyFloodData, floodEventData, checklist } =
    buildFloodStaticSections(SAMPLE_REPORT_DATA);
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
| Claim Number | CLM-2024-FL-902 |
| Named Insured | James Whitfield |
| Insured Contact | j.whitfield@example.com |
| NFIP Policy Number | FL-889213-TX |`
  );

  assert.equal(
    propertyFloodData,
    `## SECTION 2: PROPERTY & FLOOD ZONE DATA
| Field | Value |
|-------|-------|
| Property Address | 77 Riverbend Drive, Pflugerville, TX 78660 |
| Date of Loss | 2024-05-28 |
| Loss Type | Flood |
| Report Type | Initial Inspection |
| Flood Zone | AE |
| Lowest Floor Elevation | 512.4 ft |
| Base Flood Elevation (BFE) | 514.0 ft |
| Report Date | ${reportDate} |`
  );

  assert.equal(
    floodEventData,
    `## SECTION 3: FLOOD EVENT DATA
| Field | Value |
|-------|-------|
| Data Source | NWS river forecast / local flood gauge report |
| Event Date | 2024-05-28 |
| Reported Crest | 3.2 ft above flood stage |
| Event Classification | Flood |`
  );

  assert.match(checklist, /^## SECTION 7: ADJUSTER REVIEW CHECKLIST/);
  assert.match(checklist, /Coverage determination under the NFIP policy -- NOT determined by this draft/);
});

test('buildFloodStaticSections falls back to "Not provided" for missing optional fields', () => {
  const { insuredInfo, propertyFloodData, floodEventData } = buildFloodStaticSections({
    ...SAMPLE_REPORT_DATA,
    policyNumber: '',
    floodZone: '',
    lowestFloorElevation: '',
    baseFloodElevation: '',
    floodEventSource: '',
    reportedCrest: '',
  });
  assert.match(insuredInfo, /\| NFIP Policy Number \| Not provided \|/);
  assert.match(propertyFloodData, /\| Flood Zone \| Not provided \|/);
  assert.match(propertyFloodData, /\| Lowest Floor Elevation \| Not provided \|/);
  assert.match(propertyFloodData, /\| Base Flood Elevation \(BFE\) \| Not provided \|/);
  assert.match(floodEventData, /\| Data Source \| Not provided \|/);
  assert.match(floodEventData, /\| Reported Crest \| Not provided \|/);
});

test('buildFloodStaticSections folds in applicable commercial-property fields when claimType is Commercial', () => {
  const { propertyFloodData } = buildFloodStaticSections({
    ...SAMPLE_REPORT_DATA,
    claimType: 'Commercial',
    propertyManagerName: 'K. Sullivan, CBRE Property Management',
    propertyManagerContact: 'k.sullivan@example.com',
    roofType: 'Single-ply TPO membrane',
    roofAge: '8 years',
    tenantSuiteCount: '6',
  });
  assert.match(propertyFloodData, /\| Property Manager Contact \| K\. Sullivan, CBRE Property Management \(k\.sullivan@example\.com\) \|/);
  assert.match(propertyFloodData, /\| Roof Type \| Single-ply TPO membrane \|/);
  assert.match(propertyFloodData, /\| Roof Age \| 8 years \|/);
  assert.match(propertyFloodData, /\| Number of Tenant Suites \| 6 \|/);
});

test('buildFloodStaticSections omits commercial-property fields for a non-Commercial claim', () => {
  const { propertyFloodData } = buildFloodStaticSections(SAMPLE_REPORT_DATA);
  assert.doesNotMatch(propertyFloodData, /Property Manager Contact/);
  assert.doesNotMatch(propertyFloodData, /Roof Type/);
  assert.doesNotMatch(propertyFloodData, /Roof Age/);
  assert.doesNotMatch(propertyFloodData, /Number of Tenant Suites/);
});

test('flood narrative prompt requires cautious language, forbids a hard coverage/cost verdict, and carries the NFIP disclaimer rule', () => {
  const prompt = buildFloodNarrativePrompt(SAMPLE_REPORT_DATA, null);
  assert.match(prompt, /appears.*may indicate.*is consistent with/is);
  assert.match(prompt, /do not make a final determination of cause of loss, coverage, liability, fraud, or final repair costs/i);
  assert.match(prompt, /never represent this draft as satisfying all nfip federal claims-handling requirements/i);
  assert.match(prompt, /James Whitfield/);
  assert.match(prompt, /CLM-2024-FL-902/);
});

test('parseFloodNarrative extracts exactly the 5 known keys and ignores everything else', () => {
  const text = JSON.stringify({
    ...NARRATIVE_FIXTURE,
    unexpectedKey: 'ignored',
    propertyDescription: '   ',
  });
  const parsed = parseFloodNarrative(text);
  assert.deepEqual(Object.keys(parsed).sort(), [
    'conclusion',
    'damageAssessment',
    'recommendations',
    'scopeOfWork',
  ]);
  assert.equal(parsed.unexpectedKey, undefined);
});

test('assembleFloodReport stitches static + narrative sections in manifest order, carries the fixed NFIP disclaimer, and has no missing-narrative gaps', () => {
  const staticSections = buildFloodStaticSections(SAMPLE_REPORT_DATA);
  const content = assembleFloodReport(staticSections, NARRATIVE_FIXTURE, null, 0);

  assert.match(content, /^# FLOOD \(NFIP\) INSPECTION REPORT/);
  // Fixed, deterministic disclaimer (client decision, PHASES.md Phase 33) --
  // must appear verbatim regardless of what the AI narrative says.
  assert.match(content, /does not fully represent all National Flood Insurance Program \(NFIP\) federal claims-handling requirements/);
  assert.match(content, /is not an official coverage or claim determination/);

  const order = [
    'SECTION 1: INSURED & POLICY INFORMATION',
    'SECTION 2: PROPERTY & FLOOD ZONE DATA',
    'SECTION 3: FLOOD EVENT DATA',
    'SECTION 4: PROPERTY DESCRIPTION',
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

test('generateFloodReport makes exactly ONE AI call per report when every narrative key comes back on the first try', async () => {
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(NARRATIVE_FIXTURE), modelUsed: 'test/mock' },
  ]);
  const { content, modelUsed } = await generateFloodReport(SAMPLE_REPORT_DATA, null, 0, {
    generateFn,
  });

  assert.equal(generateFn.calls.length, 1, 'expected exactly one AI call, not one per section');
  assert.equal(modelUsed, 'test/mock');
  assert.match(content, /# FLOOD \(NFIP\) INSPECTION REPORT/);
  assert.match(content, /No coverage or claim determination has been made under the NFIP policy/);
  // No hard verdict phrases should ever be hardcoded into the deterministic scaffold.
  assert.doesNotMatch(content, /is covered under the policy|is the confirmed cause|liable for/i);
});

test('generateFloodReport does one repair retry for a missing key, then ships a complete report', async () => {
  const incomplete = { ...NARRATIVE_FIXTURE };
  delete incomplete.conclusion;
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(incomplete), modelUsed: 'test/mock' }, // main call: missing "conclusion"
    {
      text: 'This is a preliminary draft for licensed-adjuster review. No coverage determination has been made under the NFIP policy.',
      modelUsed: 'test/mock',
    }, // repair call
  ]);
  const { content } = await generateFloodReport(SAMPLE_REPORT_DATA, null, 0, { generateFn });

  assert.equal(generateFn.calls.length, 2, 'expected the main call plus exactly one repair call');
  assert.match(content, /SECTION 9: CONCLUSION\n.*preliminary draft for licensed-adjuster review/s);
});

test('generateFloodReport throws a clear generation-failure if a key is still missing after its repair retry', async () => {
  const incomplete = { ...NARRATIVE_FIXTURE };
  delete incomplete.scopeOfWork;
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(incomplete), modelUsed: 'test/mock' },
    { text: '', modelUsed: 'test/mock' }, // repair also fails to produce usable text
  ]);
  await assert.rejects(
    () => generateFloodReport(SAMPLE_REPORT_DATA, null, 0, { generateFn }),
    /scopeOfWork/
  );
});

test('generateReport dispatches Flood lossType to the Flood architecture, not the generic template', async () => {
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(NARRATIVE_FIXTURE), modelUsed: 'test/mock' },
  ]);
  const { content } = await generateReport(SAMPLE_REPORT_DATA, null, 0, { generateFn });
  assert.equal(generateFn.calls.length, 1);
  assert.match(content, /^# FLOOD \(NFIP\) INSPECTION REPORT/);
});

test('generateReport: a Flood lossType takes precedence over a Commercial claimType (approved precedence rule)', async () => {
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(NARRATIVE_FIXTURE), modelUsed: 'test/mock' },
  ]);
  const { content } = await generateReport(
    {
      ...SAMPLE_REPORT_DATA,
      claimType: 'Commercial',
      propertyManagerName: 'K. Sullivan, CBRE Property Management',
      roofType: 'Single-ply TPO membrane',
      tenantSuiteCount: '6',
    },
    null,
    0,
    { generateFn }
  );
  assert.match(content, /^# FLOOD \(NFIP\) INSPECTION REPORT/);
  assert.doesNotMatch(content, /^# COMMERCIAL PROPERTY INSPECTION REPORT/);
  // The applicable commercial-property fields are retained in the Flood report.
  assert.match(content, /Single-ply TPO membrane/);
  assert.match(content, /Number of Tenant Suites \| 6/);
});

test('generateReport still dispatches Liability/Commercial claimType to their own architectures when lossType is not Flood (no regression)', async () => {
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

test('FLOOD_NARRATIVE_KEYS has exactly the 5 documented narrative slots', () => {
  assert.deepEqual([...FLOOD_NARRATIVE_KEYS].sort(), [
    'conclusion',
    'damageAssessment',
    'propertyDescription',
    'recommendations',
    'scopeOfWork',
  ]);
});
