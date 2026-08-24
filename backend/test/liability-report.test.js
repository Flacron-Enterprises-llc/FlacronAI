const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateReport,
  generateLiabilityReport,
  buildLiabilityStaticSections,
  buildLiabilityNarrativePrompt,
  parseLiabilityNarrative,
  assembleLiabilityReport,
  LIABILITY_NARRATIVE_KEYS,
} = require('../services/aiService');

// Phase 31 (Liability Investigation Report, PHASES.md): a Liability claim
// gets a distinct, sample-matched document structure instead of the generic
// freeform template -- static sections built directly from report fields
// (zero AI involvement) plus ONE structured AI call for every narrative
// section, never one call per section.

const SAMPLE_REPORT_DATA = {
  claimNumber: 'CLM-9001',
  insuredName: 'Riverside Plaza LLC',
  claimantName: 'Jordan Smith',
  claimantContact: 'jordan.smith@example.com',
  policyNumber: 'POL-7734',
  propertyAddress: '400 Riverside Ave, Columbus, OH',
  lossDate: '2026-08-10',
  lossType: 'Slip and Fall',
  reportType: 'Initial',
};

const NARRATIVE_FIXTURE = {
  incidentSummary: 'The claimant reports a fall that appears to have occurred near the entrance.',
  sceneObservations: 'The entrance surface appears worn; this should be verified by the adjuster.',
  investigationChecklist: '- Obtain witness statements\n- Request maintenance logs',
  recommendations: '- Confirm maintenance schedule\n- Request incident photos',
  conclusion:
    'This is a preliminary draft for licensed-adjuster review. No liability or fault determination has been made.\n\n',
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

test('buildLiabilityStaticSections renders Parties/Incident Data/Adjuster Review Checklist exactly from input fields', () => {
  const { parties, incidentData, checklist } = buildLiabilityStaticSections(SAMPLE_REPORT_DATA);
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  assert.equal(
    parties,
    `## SECTION 1: PARTIES
| Role | Details |
|------|---------|
| Premises Owner / Insured | Riverside Plaza LLC |
| Claimant | Jordan Smith |
| Claimant Contact | jordan.smith@example.com |
| Policy Number | POL-7734 |
| Claim Number | CLM-9001 |`
  );

  assert.equal(
    incidentData,
    `## SECTION 2: INCIDENT DATA
| Field | Value |
|-------|-------|
| Premises Address | 400 Riverside Ave, Columbus, OH |
| Date of Incident | 2026-08-10 |
| Loss Type | Slip and Fall |
| Report Type | Initial |
| Report Date | ${reportDate} |`
  );

  assert.match(checklist, /^## SECTION 6: ADJUSTER REVIEW CHECKLIST/);
  assert.match(checklist, /Determine liability -- NOT determined by this draft/);
});

test('buildLiabilityStaticSections falls back to "Not provided" for missing optional fields', () => {
  const { parties } = buildLiabilityStaticSections({
    ...SAMPLE_REPORT_DATA,
    claimantName: '',
    claimantContact: '',
    policyNumber: '',
  });
  assert.match(parties, /\| Claimant \| Not provided \|/);
  assert.match(parties, /\| Claimant Contact \| Not provided \|/);
  assert.match(parties, /\| Policy Number \| Not provided \|/);
});

test('liability narrative prompt requires cautious language and forbids a hard liability/fault verdict', () => {
  const prompt = buildLiabilityNarrativePrompt(SAMPLE_REPORT_DATA, null);
  assert.match(prompt, /appears.*may indicate.*is consistent with/is);
  assert.match(prompt, /do not make a final determination of liability, fault, negligence/i);
  assert.match(prompt, /Jordan Smith/);
  assert.match(prompt, /CLM-9001/);
});

test('parseLiabilityNarrative extracts exactly the 5 known keys and ignores everything else', () => {
  const text = JSON.stringify({
    ...NARRATIVE_FIXTURE,
    unexpectedKey: 'ignored',
    incidentSummary: '   ',
  });
  const parsed = parseLiabilityNarrative(text);
  assert.deepEqual(Object.keys(parsed).sort(), [
    'conclusion',
    'investigationChecklist',
    'recommendations',
    'sceneObservations',
  ]);
  assert.equal(parsed.unexpectedKey, undefined);
});

test('assembleLiabilityReport stitches static + narrative sections in manifest order with no missing-narrative gaps', () => {
  const staticSections = buildLiabilityStaticSections(SAMPLE_REPORT_DATA);
  const content = assembleLiabilityReport(staticSections, NARRATIVE_FIXTURE, null, 0);

  assert.match(content, /^# LIABILITY INVESTIGATION REPORT/);
  const order = [
    'SECTION 1: PARTIES',
    'SECTION 2: INCIDENT DATA',
    'SECTION 3: INCIDENT SUMMARY',
    'SECTION 4: SCENE OBSERVATIONS',
    'SECTION 5: INVESTIGATION CHECKLIST',
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
});

test('generateLiabilityReport makes exactly ONE AI call per report when every narrative key comes back on the first try', async () => {
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(NARRATIVE_FIXTURE), modelUsed: 'test/mock' },
  ]);
  const { content, modelUsed } = await generateLiabilityReport(SAMPLE_REPORT_DATA, null, 0, {
    generateFn,
  });

  assert.equal(generateFn.calls.length, 1, 'expected exactly one AI call, not one per section');
  assert.equal(modelUsed, 'test/mock');
  assert.match(content, /# LIABILITY INVESTIGATION REPORT/);
  assert.match(content, /No liability or fault determination has been made/);
  // No hard verdict phrases should ever be hardcoded into the deterministic scaffold.
  assert.doesNotMatch(content, /is liable for|found at fault|is responsible for the incident/i);
});

test('generateLiabilityReport does one repair retry for a missing key, then ships a complete report', async () => {
  const incomplete = { ...NARRATIVE_FIXTURE };
  delete incomplete.conclusion;
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(incomplete), modelUsed: 'test/mock' }, // main call: missing "conclusion"
    {
      text: 'This is a preliminary draft for licensed-adjuster review. No liability determination has been made.',
      modelUsed: 'test/mock',
    }, // repair call
  ]);
  const { content } = await generateLiabilityReport(SAMPLE_REPORT_DATA, null, 0, { generateFn });

  assert.equal(generateFn.calls.length, 2, 'expected the main call plus exactly one repair call');
  assert.match(content, /SECTION 8: CONCLUSION\n.*preliminary draft for licensed-adjuster review/s);
});

test('generateLiabilityReport throws a clear generation-failure if a key is still missing after its repair retry', async () => {
  const incomplete = { ...NARRATIVE_FIXTURE };
  delete incomplete.recommendations;
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(incomplete), modelUsed: 'test/mock' },
    { text: '', modelUsed: 'test/mock' }, // repair also fails to produce usable text
  ]);
  await assert.rejects(
    () => generateLiabilityReport(SAMPLE_REPORT_DATA, null, 0, { generateFn }),
    /recommendations/
  );
});

test('generateReport dispatches Liability claimType to the Liability architecture, not the generic template', async () => {
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(NARRATIVE_FIXTURE), modelUsed: 'test/mock' },
  ]);
  const { content } = await generateReport(
    { ...SAMPLE_REPORT_DATA, claimType: 'Liability' },
    null,
    0,
    { generateFn }
  );
  assert.equal(generateFn.calls.length, 1);
  assert.match(content, /^# LIABILITY INVESTIGATION REPORT/);
});

test('LIABILITY_NARRATIVE_KEYS has exactly the 5 documented narrative slots', () => {
  assert.deepEqual([...LIABILITY_NARRATIVE_KEYS].sort(), [
    'conclusion',
    'incidentSummary',
    'investigationChecklist',
    'recommendations',
    'sceneObservations',
  ]);
});
