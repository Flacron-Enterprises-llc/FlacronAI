const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateReport,
  generateVehicleReport,
  buildVehicleStaticSections,
  buildVehicleNarrativePrompt,
  parseVehicleNarrative,
  assembleVehicleReport,
  buildVehiclePanelSection,
  VEHICLE_PANELS,
  VEHICLE_NARRATIVE_KEYS,
  buildEffectiveImageAnalysis,
  analyzeImages,
} = require('../services/aiService');

// Phase 35 (Vehicle/Auto Inspection Report, PHASES.md): keyed off
// `claimType === 'Auto'`, same precedence position as Liability/Commercial
// (Flood/Theft lossType still wins). The panel-by-panel damage assessment is
// deterministic (built from reviewed per-photo panel tags), not AI-authored;
// only the loss summary/repairability/recommendations/conclusion sections go
// through the single structured AI call.

const SAMPLE_REPORT_DATA = {
  claimNumber: 'CLM-2024-AH-829',
  insuredName: 'Samantha Reyes',
  insuredEmail: 's.reyes@example.com',
  propertyAddress: 'ABC Auto Body, 4400 Burnet Rd, Austin, TX 78756',
  lossDate: '2024-05-02',
  lossType: 'Hail',
  claimType: 'Auto',
  policyNumber: 'AU-441207-TX',
  insuranceCompany: 'Sample Mutual Insurance',
  vin: 'JTMRWRFV1MD012345',
  vehicleMakeModelYear: '2021 Toyota RAV4 XLE',
  odometer: '31,240 mi',
  licensePlate: 'TX ABC1234',
  vehicleColor: 'Magnetic Gray Metallic',
  reportType: 'Initial Inspection',
};

const NARRATIVE_FIXTURE = {
  lossSummary: 'The insured reports the vehicle was parked outdoors during a hailstorm on the date of loss.',
  repairabilityNotes:
    '- Hood: dimple density and spacing may indicate a PDR candidate, subject to in-person confirmation.\n- Windshield: cracking in the driver\'s primary viewing area typically requires replacement, subject to technician confirmation.',
  recommendations: '- Obtain a complete photo set of undocumented panels\n- Route the hood to a PDR-certified shop for confirmation',
  conclusion: 'This draft organizes the documented visible panel conditions for adjuster review.\n\n',
};

const SAMPLE_IMAGE_ANALYSIS = {
  damages: [
    { area: 'Hood', type: 'Wind/Hail Damage', severity: 'Moderate', description: 'Multiple circular dimples appear visible across the hood panel.' },
    { area: 'Driver Front Door', type: 'Wind/Hail Damage', severity: 'Minor', description: 'A dent appears visible on the door panel.' },
    { area: 'Windshield', type: 'Structural Damage', severity: 'Severe', description: 'A star-pattern crack appears visible near the upper-left quadrant.' },
  ],
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

test('buildVehicleStaticSections renders Insured & Policy / Vehicle Information / Loss Information exactly from input fields', () => {
  const { insuredInfo, vehicleInfo, lossInfo, checklist } = buildVehicleStaticSections(SAMPLE_REPORT_DATA);
  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  assert.equal(
    insuredInfo,
    `## SECTION 1: INSURED & POLICY INFORMATION
| Field | Value |
|-------|-------|
| Claim Number | CLM-2024-AH-829 |
| Named Insured | Samantha Reyes |
| Insured Contact | s.reyes@example.com |
| Insurance Company | Sample Mutual Insurance |
| Policy Number | AU-441207-TX |`
  );

  assert.equal(
    vehicleInfo,
    `## SECTION 2: VEHICLE INFORMATION
| Field | Value |
|-------|-------|
| Vehicle (Year/Make/Model) | 2021 Toyota RAV4 XLE |
| VIN | JTMRWRFV1MD012345 |
| License Plate | TX ABC1234 |
| Color | Magnetic Gray Metallic |
| Odometer at Inspection | 31,240 mi |
| Inspection Location | ABC Auto Body, 4400 Burnet Rd, Austin, TX 78756 |`
  );

  assert.equal(
    lossInfo,
    `## SECTION 3: LOSS INFORMATION
| Field | Value |
|-------|-------|
| Date of Loss | 2024-05-02 |
| Loss Type | Hail |
| Report Type | Initial Inspection |
| Report Date | ${reportDate} |`
  );

  assert.match(checklist, /^## SECTION 6: ADJUSTER REVIEW CHECKLIST/);
  assert.match(checklist, /Coverage determination under the policy -- NOT determined by this draft/);
  assert.match(checklist, /Evaluate total-loss threshold once a full estimate is complete -- NOT determined by this draft/);
});

test('buildVehicleStaticSections falls back to "Not provided" for missing optional vehicle fields', () => {
  const { vehicleInfo } = buildVehicleStaticSections({
    ...SAMPLE_REPORT_DATA,
    vin: '', vehicleMakeModelYear: '', odometer: '', licensePlate: '', vehicleColor: '',
  });
  assert.match(vehicleInfo, /\| Vehicle \(Year\/Make\/Model\) \| Not provided \|/);
  assert.match(vehicleInfo, /\| VIN \| Not provided \|/);
  assert.match(vehicleInfo, /\| License Plate \| Not provided \|/);
  assert.match(vehicleInfo, /\| Color \| Not provided \|/);
  assert.match(vehicleInfo, /\| Odometer at Inspection \| Not provided \|/);
});

test('vehicle narrative prompt requires cautious language, forbids a hard repairability/total-loss/cost determination, and carries claim details', () => {
  const prompt = buildVehicleNarrativePrompt(SAMPLE_REPORT_DATA, null);
  assert.match(prompt, /appears.*may indicate.*is consistent with/is);
  assert.match(prompt, /NEVER make a final determination of repairability, total-loss status, cause of loss, coverage, liability, or final repair costs/i);
  assert.match(prompt, /do not include any dollar figures, cost ranges, or cost estimates/i);
  assert.match(prompt, /Samantha Reyes/);
  assert.match(prompt, /CLM-2024-AH-829/);
  assert.match(prompt, /2021 Toyota RAV4 XLE/);
});

test('parseVehicleNarrative extracts exactly the 4 known keys and ignores everything else', () => {
  const text = JSON.stringify({ ...NARRATIVE_FIXTURE, unexpectedKey: 'ignored', lossSummary: '   ' });
  const parsed = parseVehicleNarrative(text);
  assert.deepEqual(Object.keys(parsed).sort(), ['conclusion', 'recommendations', 'repairabilityNotes']);
  assert.equal(parsed.unexpectedKey, undefined);
});

test('buildVehiclePanelSection groups reviewed per-photo observations by panel and lists undocumented panels', () => {
  const section = buildVehiclePanelSection(SAMPLE_IMAGE_ANALYSIS);
  assert.match(section, /\*\*Hood:\*\* Multiple circular dimples appear visible/);
  assert.match(section, /\*\*Driver Front Door:\*\* A dent appears visible/);
  assert.match(section, /\*\*Windshield:\*\* A star-pattern crack appears visible/);
  assert.match(section, /\*\*Not yet documented:\*\*/);
  assert.match(section, /Roof/); // an undocumented panel from VEHICLE_PANELS
  assert.doesNotMatch(section, /Not yet documented:.*Hood/); // documented panels excluded from that list
});

test('buildVehiclePanelSection handles no photos with a clear placeholder, not a blank section', () => {
  const section = buildVehiclePanelSection(null);
  assert.match(section, /No panel-tagged photo observations are available/);
});

test('assembleVehicleReport stitches static + narrative + deterministic panel section in manifest order, carries the fixed disclaimer, and has no cost figures', () => {
  const staticSections = buildVehicleStaticSections(SAMPLE_REPORT_DATA);
  const content = assembleVehicleReport(staticSections, NARRATIVE_FIXTURE, SAMPLE_IMAGE_ANALYSIS, 3);

  assert.match(content, /^# VEHICLE DAMAGE INSPECTION REPORT/);
  assert.match(content, /does not determine repairability, total-loss status, coverage, or final repair costs/);

  const order = [
    'SECTION 1: INSURED & POLICY INFORMATION',
    'SECTION 2: VEHICLE INFORMATION',
    'SECTION 3: LOSS INFORMATION',
    'SECTION 4: PANEL-BY-PANEL DAMAGE ASSESSMENT',
    'SECTION 5: LOSS SUMMARY',
    'SECTION 5B: REPAIRABILITY ASSESSMENT',
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
  assert.doesNotMatch(content, /\$[\d,]/);
});

test('assembleVehicleReport shows the no-photo disclaimer when photoCount is 0', () => {
  const staticSections = buildVehicleStaticSections(SAMPLE_REPORT_DATA);
  const content = assembleVehicleReport(staticSections, NARRATIVE_FIXTURE, null, 0);
  assert.match(content, /No photographs were provided/);
});

test('generateVehicleReport makes exactly ONE AI call per report when every narrative key comes back on the first try', async () => {
  const generateFn = makeGenerateFn([{ text: JSON.stringify(NARRATIVE_FIXTURE), modelUsed: 'test/mock' }]);
  const { content, modelUsed } = await generateVehicleReport(SAMPLE_REPORT_DATA, SAMPLE_IMAGE_ANALYSIS, 3, { generateFn });

  assert.equal(generateFn.calls.length, 1, 'expected exactly one AI call, not one per section');
  assert.equal(modelUsed, 'test/mock');
  assert.match(content, /# VEHICLE DAMAGE INSPECTION REPORT/);
  // No bare final determination should ever appear in the deterministic scaffold.
  assert.doesNotMatch(content, /is a total loss|is repairable\b|is covered under the policy|liable for/i);
});

test('generateVehicleReport does one repair retry for a missing key, then ships a complete report', async () => {
  const incomplete = { ...NARRATIVE_FIXTURE };
  delete incomplete.conclusion;
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(incomplete), modelUsed: 'test/mock' },
    { text: 'This draft organizes the documented visible panel conditions for adjuster review.', modelUsed: 'test/mock' },
  ]);
  const { content } = await generateVehicleReport(SAMPLE_REPORT_DATA, SAMPLE_IMAGE_ANALYSIS, 3, { generateFn });

  assert.equal(generateFn.calls.length, 2, 'expected the main call plus exactly one repair call');
  assert.match(content, /SECTION 8: CONCLUSION\n.*documented visible panel conditions/s);
});

test('generateVehicleReport throws a clear generation-failure if a key is still missing after its repair retry', async () => {
  const incomplete = { ...NARRATIVE_FIXTURE };
  delete incomplete.recommendations;
  const generateFn = makeGenerateFn([
    { text: JSON.stringify(incomplete), modelUsed: 'test/mock' },
    { text: '', modelUsed: 'test/mock' },
  ]);
  await assert.rejects(
    () => generateVehicleReport(SAMPLE_REPORT_DATA, SAMPLE_IMAGE_ANALYSIS, 3, { generateFn }),
    /recommendations/
  );
});

test('generateReport dispatches Auto claimType to the Vehicle architecture, not the generic template', async () => {
  const generateFn = makeGenerateFn([{ text: JSON.stringify(NARRATIVE_FIXTURE), modelUsed: 'test/mock' }]);
  const { content } = await generateReport(SAMPLE_REPORT_DATA, SAMPLE_IMAGE_ANALYSIS, 3, { generateFn });
  assert.equal(generateFn.calls.length, 1);
  assert.match(content, /^# VEHICLE DAMAGE INSPECTION REPORT/);
});

test('generateReport: a Theft/Flood lossType still takes precedence over an Auto claimType (approved precedence rule reused from Phase 33/34)', async () => {
  const theftFixture = {
    incidentSummary: 'x', damageAssessment: '- x', scopeOfWork: '- x', recommendations: '- x', conclusion: 'x',
  };
  const generateFn = makeGenerateFn([{ text: JSON.stringify(theftFixture), modelUsed: 'test/mock' }]);
  const { content } = await generateReport(
    { ...SAMPLE_REPORT_DATA, lossType: 'Theft' },
    null,
    0,
    { generateFn }
  );
  assert.match(content, /^# THEFT \/ BURGLARY INSPECTION REPORT/);
  assert.doesNotMatch(content, /^# VEHICLE DAMAGE INSPECTION REPORT/);
});

test('generateReport still dispatches Liability/Commercial to their own architectures when claimType is not Auto (no regression)', async () => {
  const liabilityFixture = {
    incidentSummary: 'x', sceneObservations: 'x', investigationChecklist: '- x', recommendations: '- x', conclusion: 'x',
  };
  const generateFn = makeGenerateFn([{ text: JSON.stringify(liabilityFixture), modelUsed: 'test/mock' }]);
  const { content } = await generateReport(
    { ...SAMPLE_REPORT_DATA, claimType: 'Liability', lossType: 'Water Damage' },
    null,
    0,
    { generateFn }
  );
  assert.match(content, /^# LIABILITY INVESTIGATION REPORT/);
});

test('VEHICLE_NARRATIVE_KEYS has exactly the 4 documented narrative slots', () => {
  assert.deepEqual([...VEHICLE_NARRATIVE_KEYS].sort(), ['conclusion', 'lossSummary', 'recommendations', 'repairabilityNotes']);
});

test('VEHICLE_PANELS is a non-empty, deduplicated panel taxonomy including "Other/Unspecified"', () => {
  assert.ok(VEHICLE_PANELS.length > 5);
  assert.equal(new Set(VEHICLE_PANELS).size, VEHICLE_PANELS.length);
  assert.ok(VEHICLE_PANELS.includes('Other/Unspecified'));
});

test('buildEffectiveImageAnalysis prefers a reviewer-assigned panel tag (roomOrArea) over the AI-inferred location', () => {
  const photos = [
    {
      analysis: { location: 'Other/Unspecified', category: 'Wind/Hail Damage', severity: 'Moderate', observation: 'Dimples visible on a panel.' },
      roomOrArea: 'Hood',
      review: { status: 'pending' },
    },
    {
      analysis: { location: 'Driver Front Door', category: 'Wind/Hail Damage', severity: 'Minor', observation: 'A dent is visible.' },
      roomOrArea: null,
      review: { status: 'approved' },
    },
  ];
  const effective = buildEffectiveImageAnalysis({}, photos);
  assert.equal(effective.damages[0].area, 'Hood');
  assert.equal(effective.damages[1].area, 'Driver Front Door');
});

test('analyzeImages uses the Vehicle panel taxonomy in its vision prompt when claimType is Auto, and the property taxonomy otherwise', async () => {
  const capturedPrompts = [];
  const callVisionApi = async (promptText) => {
    capturedPrompts.push(promptText);
    return JSON.stringify({ summary: 's', photos: [{ location: 'Hood', category: 'Wind/Hail Damage', severity: 'Moderate', observation: 'x', confidence: 'High' }] });
  };
  const image = { buffer: Buffer.from('fake'), mimetype: 'image/jpeg', photoId: 'p1' };

  await analyzeImages([image], { callVisionApi, claimType: 'Auto' });
  assert.match(capturedPrompts[0], /Hood, Roof, Trunk\/Tailgate/);

  await analyzeImages([image], { callVisionApi });
  assert.match(capturedPrompts[1], /Roof, Exterior - Walls\/Siding/);
});
