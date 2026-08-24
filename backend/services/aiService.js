const anthropic = require('../config/anthropic');
const { generateText: watsonxGenerate, checkHealth: checkWatsonx } = require('../config/watsonx');

// Provider strategy (client directive 2026-07-18): Claude (Anthropic) is primary,
// IBM watsonx is the text-only fallback. OpenAI has been removed entirely.
// Returns { text, modelUsed }.
const generateWithFallback = async (prompt, { maxTokens = 4096, temperature = 0.5 } = {}) => {
  try {
    const text = await anthropic.generateText(prompt, { maxTokens });
    return { text, modelUsed: `anthropic/${anthropic.MODEL}` };
  } catch (claudeErr) {
    console.warn('⚠️  Claude failed, falling back to watsonx:', claudeErr.message);
    const text = await watsonxGenerate(prompt, { max_new_tokens: maxTokens, temperature });
    return { text, modelUsed: 'watsonx/ibm/granite-3-8b-instruct' };
  }
};

// Anthropic vision only accepts these image media types.
const CLAUDE_IMAGE_TYPES = new Set(['jpeg', 'png', 'gif', 'webp']);

// Phase 8 (Per-Photo Analysis Review UI): guidance taxonomy passed to the
// vision model so its per-photo `location`/`category` classifications stay
// consistent across photos/batches/reports. Free text, not a strict enum --
// the model may return something outside this list for an unusual photo
// (normalizePhotoEntries below falls back to "Other/Unspecified"/"Other"
// rather than rejecting it). Mirrored in frontend/src/pages/Dashboard.jsx for
// badge display.
const PHOTO_LOCATIONS = [
  'Roof',
  'Exterior - Walls/Siding',
  'Exterior - Foundation',
  'Exterior - Windows/Doors',
  'Attic',
  'Interior - Living Areas',
  'Interior - Bedroom',
  'Interior - Kitchen',
  'Interior - Bathroom',
  'Basement',
  'Interior - Hallway/Stairs',
  'Garage',
  'HVAC/Mechanical',
  'Plumbing',
  'Electrical',
  'Structural/Framing',
  'Other/Unspecified',
];
const PHOTO_CATEGORIES = [
  'Water Damage',
  'Fire/Smoke Damage',
  'Wind/Hail Damage',
  'Structural Damage',
  'Mold/Moisture',
  'Electrical',
  'Plumbing',
  'Roofing',
  'Cosmetic/Wear',
  'No Visible Damage',
  'Other',
];

// Phase 35 (Vehicle/Auto Inspection Report): a distinct panel-selection
// taxonomy used in place of PHOTO_LOCATIONS whenever a photo belongs to an
// Auto claimType report -- both for the vision model's own per-photo
// classification (buildBatchPrompt) and for the human panel-tag override
// (photos[].roomOrArea, same mechanism Phase 24 built for room/area tagging,
// just a different option list + label for this claim type). Mirrored in
// frontend/src/utils/photoTaxonomy.js.
const VEHICLE_PANELS = [
  'Hood',
  'Roof',
  'Trunk/Tailgate',
  'Front Bumper',
  'Rear Bumper',
  'Driver Front Door',
  'Driver Rear Door',
  'Passenger Front Door',
  'Passenger Rear Door',
  'Driver Front Fender',
  'Passenger Front Fender',
  'Driver Rear Quarter Panel',
  'Passenger Rear Quarter Panel',
  'Windshield',
  'Rear Window',
  'Side Mirror',
  'Wheel/Rim',
  'Undercarriage',
  'Interior',
  'Other/Unspecified',
];

const buildReportPrompt = (reportData, imageAnalysis) => {
  const {
    claimNumber,
    insuredName,
    propertyAddress,
    lossDate,
    lossType,
    reportType,
    additionalNotes,
    propertyDetails,
    lossDescription,
    damagesObserved,
    recommendations,
    // Phase 13 (Real Template Builder): an optional short instruction built
    // from a template's own name/description/custom-section titles, so this
    // report's tone/emphasis stays consistent with the template-defined
    // sections that get deterministically appended after generation
    // (see richContent.js's appendTemplateSections) -- never itself the sole
    // guarantee those sections appear.
    templateGuidance,
  } = reportData;
  const imageSection = imageAnalysis
    ? `\n\nIMAGE ANALYSIS RESULTS:\n${JSON.stringify(imageAnalysis, null, 2)}`
    : '';

  return `You are assisting a licensed insurance adjuster by preparing a DRAFT inspection report for their review, editing, and approval. You are NOT the adjuster and you do NOT make final determinations. A qualified professional will review, correct, and sign off on this draft before it is used.

CRITICAL LANGUAGE & SCOPE RULES (follow in every section):
- Use cautious, observational language: "appears", "may indicate", "is consistent with", "the adjuster should verify", "subject to confirmation". Never state conclusions as established fact.
- Do NOT make final determinations about any of the following — instead, note them as items for the licensed adjuster to evaluate and confirm: cause of loss, coverage or exclusions, liability, fault, fraud, policy interpretation, structural safety, mold, engineering conclusions, code compliance, or final/binding repair costs.
- Where a determination would normally be stated, write what the adjuster should assess and flag that no determination has been made.
- Only describe what is reported or visible in the provided details/photos. Do not invent facts not supported by the inputs.
${templateGuidance ? `\nTEMPLATE GUIDANCE (apply throughout, without ever violating the rules above):\n${templateGuidance}\n` : ''}
CLAIM DETAILS:
- Claim Number: ${claimNumber}
- Insured Name: ${insuredName}
- Property Address: ${propertyAddress}
- Date of Loss: ${lossDate}
- Loss Type: ${lossType}
- Report Type: ${reportType}
- Additional Notes: ${additionalNotes || 'None provided'}
${propertyDetails ? `- Property Details: ${propertyDetails}` : ''}
${lossDescription ? `- Loss Description (provided by adjuster): ${lossDescription}` : ''}
${damagesObserved ? `- Damages Observed (provided by adjuster): ${damagesObserved}` : ''}
${recommendations ? `- Adjuster Recommendations: ${recommendations}` : ''}${imageSection}

Generate a thorough, professional DRAFT report following this EXACT structure with all sections fully populated:

# INSURANCE INSPECTION REPORT

> Prepared with the FLACRON ENGINE for review and approval by a licensed insurance adjuster. Observations are preliminary; this report does not constitute a final determination of cause, coverage, liability, or loss value.

## SECTION 1: REPORT INFO
- Report Type: ${reportType} Inspection Report
- Claim Number: ${claimNumber}
- Date of Inspection: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
- Report Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
- Prepared By: FlacronAI (FLACRON ENGINE — for licensed adjuster review)

## SECTION 2: CLAIM INFO & INSURED INFO
- Claim Number: ${claimNumber}
- Insured Name: ${insuredName}
- Property Address: ${propertyAddress}
- Date of Loss: ${lossDate}
- Loss Type: ${lossType}
- Policy Information: [To be completed by adjuster]

## SECTION 3: PROPERTY INFO
${
  propertyDetails
    ? `Based on the following property details provided by the adjuster, expand into a professional property description (describe only what is provided; note assumptions the adjuster should confirm):\n${propertyDetails}`
    : `Write a professional property description for the ${lossType} loss site at ${propertyAddress}. Describe the apparent type of structure (residential/commercial), likely construction type and materials, estimated age and condition, and general layout. Frame characteristics that are not directly provided as apparent/likely and note that the adjuster should confirm on site.`
}

## SECTION 4: INSPECTION DETAILS & OVERVIEW
${
  lossDescription
    ? `Based on the following loss description provided by the adjuster, expand into a professional narrative. Describe what appears to have occurred using cautious language, and list coverage-related considerations the adjuster should evaluate — do NOT make a coverage determination:\n${lossDescription}`
    : `Write a professional narrative of this reported ${lossType} loss at ${propertyAddress} on ${lossDate}, using cautious, non-conclusive language. Cover:
- Possible cause(s) that are consistent with this type of ${lossType} loss and how such losses typically occur — clearly framed as possibilities for the adjuster to confirm, not a finding
- How the damage may have developed, spread, and progressed at this property (apparent, subject to verification)
- The likely sequence of events, noting this is a preliminary reconstruction to be confirmed
- Coverage-related considerations and potential exclusions the adjuster should evaluate — explicitly state that no coverage determination has been made
- Possible contributing factors or pre-existing conditions the adjuster should investigate${additionalNotes ? `\n- Additional context from adjuster notes: ${additionalNotes}` : ''}`
}

## SECTION 5: AREA OBSERVATIONS (DAMAGE ASSESSMENT)
${
  damagesObserved
    ? `Based on the following damages observed by the adjuster, expand into a professional room-by-room assessment. For each area include apparent severity (Minor/Moderate/Severe), affected materials, and estimated square footage — noting that severity and extent are preliminary and subject to the adjuster's confirmation:\n${damagesObserved}`
    : `Provide a detailed room-by-room / area-by-area assessment of apparent damage. For each area, list:
- Location/Room Name
- Type of damage that appears present
- Apparent severity (Minor/Moderate/Severe) — preliminary, to be confirmed
- Affected materials (e.g., drywall, flooring, cabinetry)
- Estimated square footage affected (approximate)

Include at minimum 5-7 areas relevant to the loss type: ${lossType}. Note any conditions (structural, electrical, mold, safety) that a qualified professional should evaluate further — do not conclude on them.`
}

## SECTION 6: SCOPE OF WORK (SUGGESTED REPAIRS FOR REVIEW)
Provide itemized, suggested repair considerations for the adjuster and contractor to confirm:
- Possible immediate mitigation steps
- Temporary repairs that may be needed
- Suggested permanent repair scope by trade (demo, framing, drywall, flooring, painting, mechanical, etc.)
- Material specifications where applicable
- Labor descriptions
Frame these as suggestions to be validated, not directives.

## SECTION 7: PRELIMINARY ESTIMATED COSTS (FOR PLANNING & REVIEW ONLY)
Provide a structured, PRELIMINARY cost estimate table using approximate industry-standard restoration rates for a ${lossType} loss. These figures are for planning and adjuster review only — they are NOT a final, binding, or authoritative estimate, and must be verified against actual contractor bids and the policy. Use realistic approximate numbers (e.g., ~$1,850) rather than placeholders.

| Category | Description | Estimated Cost (approx.) |
|----------|-------------|--------------------------|
[Include 8-12 line items with approximate dollar amounts based on the apparent scope, e.g. ~$1,250]
| **PRELIMINARY ESTIMATED TOTAL** | Subject to verification | [approximate sum of the line items above] |

Note directly beneath the table: "Preliminary estimate for planning only — not a final determination of loss value. Actual costs subject to contractor bids, measurement, and coverage review."

## SECTION 8: PHOTO DOCUMENTATION
List documentation reviewed and recommended:
- Photos provided (reference image analysis if available)
- Documents reviewed
- Additional documentation recommended
- Third-party/professional reports the adjuster may need (if any)

## SECTION 9: ADDITIONAL NOTES & CONCLUSION (ITEMS FOR ADJUSTER REVIEW)
${
  recommendations
    ? `Incorporate the following adjuster recommendations and expand professionally, keeping cautious language:\n${recommendations}\n\nAlso include:`
    : ''
}
- Summary of apparent findings (preliminary)
- Coverage considerations for the adjuster to evaluate — state clearly that no coverage determination has been made
- Recommended next steps and items requiring professional confirmation
- Conditions a qualified professional should further evaluate (structural, mold, safety, engineering, etc.)
- A note that this draft must be reviewed, corrected, and approved by a licensed adjuster before use. Do NOT write a certification or attestation on behalf of the adjuster; leave a blank line for the reviewing adjuster's own sign-off.

---
*Automated draft prepared by FlacronAI for licensed-adjuster review | ${new Date().toISOString()}*

Write the complete DRAFT report now with all sections fully populated, using professional but cautious, non-conclusive language appropriate for a ${lossType} loss. Be specific and detailed where the inputs support it, and flag anything requiring professional confirmation.`;
};

// Checks if the generated content has a complete Section 7 cost table.
// If missing or truncated, makes a focused AI call to generate just the table.
const ensureLossSummary = async (reportData, content) => {
  const section7Re = /##\s*SECTION\s*7[^\n]*\n([\s\S]*?)(?=##\s*SECTION\s*8|$)/i;
  const match = content.match(section7Re);
  const tableRows = ((match ? match[1] : '').match(/^\|.+\|/gm) || []).filter(
    (r) => !r.match(/^\|\s*[-:]+\s*\|/)
  ); // strip separator rows

  // Need header + at least 3 data/total rows
  if (tableRows.length >= 4) return content;

  console.log('⚠️  Section 7 incomplete — generating cost summary separately...');

  const summaryPrompt = `You are assisting a licensed adjuster. Generate ONLY a PRELIMINARY estimated cost table for a ${reportData.lossType} insurance loss claim. These figures are approximate, for planning and adjuster review only — NOT a final or binding determination of loss value.

Property: ${reportData.propertyAddress}
Damages: ${reportData.damagesObserved || 'Typical ' + reportData.lossType + ' damage to a residential property'}
Loss Description: ${reportData.lossDescription || ''}

Output ONLY this markdown section (no preamble, no other text):

## SECTION 7: PRELIMINARY ESTIMATED COSTS (FOR PLANNING & REVIEW ONLY)

| Category | Description | Estimated Cost (approx.) |
|----------|-------------|--------------------------|
[8-10 rows with approximate dollar amounts, e.g. ~$1,850]
| **PRELIMINARY ESTIMATED TOTAL** | Subject to verification | [approximate sum of the rows above] |

_Preliminary estimate for planning only — not a final determination of loss value. Actual costs subject to contractor bids and coverage review._`;

  let summaryText;
  try {
    ({ text: summaryText } = await generateWithFallback(summaryPrompt, {
      maxTokens: 700,
      temperature: 0.3,
    }));
  } catch (err) {
    console.warn('Loss summary generation failed (Claude + watsonx):', err.message);
    return content;
  }

  if (match) {
    return content.replace(section7Re, summaryText.trim() + '\n\n');
  }
  // Content was truncated before reaching section 7 — append it
  return content.trimEnd() + '\n\n' + summaryText.trim();
};

// Checks if the generated content has a real Section 9 (Conclusion / Items for
// Adjuster Review). Section 9 is the last section in the prompt's structure, so
// it's the first casualty if the model's token budget runs out — this repairs
// it the same way `ensureLossSummary` repairs a truncated Section 7 table.
const ensureConclusion = async (reportData, content) => {
  const section9Re = /##\s*SECTION\s*9[^\n]*\n([\s\S]*)$/i;
  const match = content.match(section9Re);
  const body = (match ? match[1] : '').trim();

  // Need a heading plus a reasonably substantive body, not just a stub line.
  if (body.split(/\s+/).filter(Boolean).length >= 25) return content;

  console.log('⚠️  Section 9 missing/incomplete — generating conclusion separately...');

  const conclusionPrompt = `You are assisting a licensed adjuster. Generate ONLY the closing section of a DRAFT insurance inspection report for a ${reportData.lossType} loss at ${reportData.propertyAddress} (Claim ${reportData.claimNumber}). Use cautious, non-conclusive language ("appears", "may indicate", "should be confirmed"). Do NOT determine cause of loss, coverage, liability, fraud, structural safety, mold, or final repair costs — list these as items for the licensed adjuster to evaluate.
${reportData.recommendations ? `\nIncorporate these adjuster recommendations:\n${reportData.recommendations}` : ''}

Output ONLY this markdown section (no preamble, no other text):

## SECTION 9: ADDITIONAL NOTES & CONCLUSION (ITEMS FOR ADJUSTER REVIEW)
- Summary of apparent findings (preliminary)
- Coverage considerations for the adjuster to evaluate — state clearly that no coverage determination has been made
- Recommended next steps and items requiring professional confirmation
- Conditions a qualified professional should further evaluate (structural, mold, safety, engineering, etc.)
- A note that this draft must be reviewed, corrected, and approved by a licensed adjuster before use. Do NOT write a certification or attestation on behalf of the adjuster; leave a blank line for the reviewing adjuster's own sign-off.`;

  let conclusionText;
  try {
    ({ text: conclusionText } = await generateWithFallback(conclusionPrompt, {
      maxTokens: 700,
      temperature: 0.3,
    }));
  } catch (err) {
    console.warn('Conclusion generation failed (Claude + watsonx):', err.message);
    return content;
  }

  if (match) {
    return content.replace(section9Re, conclusionText.trim());
  }
  // Content was truncated before reaching section 9 — append it
  return content.trimEnd() + '\n\n' + conclusionText.trim();
};

const NO_PHOTO_DISCLAIMER =
  'No photographs were provided. Damage observations in this draft are based exclusively on user-entered information and must be independently verified.';

// Deterministic — does not rely on the LLM to remember to say this. Inserted
// right under Section 8 (Supporting Documentation) where photos are referenced.
const insertNoPhotoDisclaimer = (content) => {
  const section8Re = /(##\s*SECTION\s*8[^\n]*\n)/i;
  if (section8Re.test(content)) {
    return content.replace(section8Re, (heading) => `${heading}\n**${NO_PHOTO_DISCLAIMER}**\n`);
  }
  return `${content.trimEnd()}\n\n**${NO_PHOTO_DISCLAIMER}**`;
};

// Phase 8 (Per-Photo Analysis Review UI): a DETERMINISTIC, verbatim list of
// each active (non-excluded) photo's effective observation -- the exact text
// a reviewer approved or edited, not the LLM's own paraphrase of it. The main
// generation call above is free-form prose that may summarize/reword the
// `imageAnalysis` JSON it's given rather than quoting it, which would make a
// reviewer's edit or exclusion easy to miss in the final report. Appending
// this list guarantees task 4's "the final report reflects human-approved
// observations" is verifiably true, independent of model compliance -- the
// same reasoning as insertNoPhotoDisclaimer/ensureLossSummary above.
const buildPhotoObservationsSection = (imageAnalysis) => {
  const damages = imageAnalysis?.damages || [];
  if (!damages.length) return '';
  const lines = damages.map((d, i) => {
    const severity =
      d.severity && d.severity !== 'Unknown' ? `, apparent severity: ${d.severity}` : '';
    return `${i + 1}. **${d.area || 'Unspecified area'}** (${d.type || 'Other'}${severity}): ${d.description}`;
  });
  return `\n**Per-Photo Observations (reviewed):**\n${lines.join('\n')}\n`;
};

const insertPhotoObservations = (content, imageAnalysis) => {
  const section = buildPhotoObservationsSection(imageAnalysis);
  if (!section) return content;
  const section8Re = /(##\s*SECTION\s*8[^\n]*\n)/i;
  if (section8Re.test(content)) {
    return content.replace(section8Re, (heading) => `${heading}${section}`);
  }
  return `${content.trimEnd()}\n\n${section}`;
};

// ── Phase 31: Liability Investigation Report ────────────────────────────────
// Distinct architecture from the generic buildReportPrompt() above: static
// sections (Parties, Incident Data, Adjuster Review Checklist) are built
// directly from report fields with zero AI involvement, and every narrative
// section is requested in ONE structured AI call (not one call per section),
// then stitched together by a deterministic assembler. See PHASES.md Phase 31.
const LIABILITY_NARRATIVE_KEYS = [
  'incidentSummary',
  'sceneObservations',
  'investigationChecklist',
  'recommendations',
  'conclusion',
];

const LIABILITY_LANGUAGE_RULES = `CRITICAL LANGUAGE & SCOPE RULES (follow in every section):
- Use cautious, observational language: "appears", "may indicate", "is consistent with", "the adjuster should verify", "subject to confirmation". Never state conclusions as established fact.
- Do NOT make a final determination of liability, fault, negligence, cause of loss, coverage, or fraud -- instead, note these as items for the licensed adjuster to evaluate and confirm.
- Only describe what is reported or visible in the provided details/photos. Do not invent facts not supported by the inputs.`;

const buildLiabilityNarrativePrompt = (reportData, imageAnalysis) => {
  const {
    claimNumber,
    insuredName,
    claimantName,
    claimantContact,
    propertyAddress,
    lossDate,
    lossType,
    lossDescription,
    damagesObserved,
    recommendations,
    additionalNotes,
  } = reportData;
  const imageSection = imageAnalysis
    ? `\n\nIMAGE ANALYSIS RESULTS:\n${JSON.stringify(imageAnalysis, null, 2)}`
    : '';

  return `You are assisting a licensed insurance adjuster by drafting the narrative sections of a Liability Investigation Report for their review, editing, and approval. You are NOT the adjuster and you do NOT make final determinations.

${LIABILITY_LANGUAGE_RULES}

CLAIM DETAILS:
- Claim Number: ${claimNumber}
- Premises Owner / Insured: ${insuredName}
- Claimant: ${claimantName || 'Not provided'}
- Claimant Contact: ${claimantContact || 'Not provided'}
- Premises Address: ${propertyAddress}
- Date of Incident: ${lossDate}
- Loss Type: ${lossType}
- Incident Description (provided by adjuster): ${lossDescription || 'None provided'}
- Damages/Injuries Observed (provided by adjuster): ${damagesObserved || 'None provided'}
- Adjuster Recommendations: ${recommendations || 'None provided'}
- Additional Notes: ${additionalNotes || 'None provided'}${imageSection}

Return ONLY a JSON object with exactly these 5 keys, each a string, no other text/preamble/code fence:
{
  "incidentSummary": "A professional narrative summary of the reported incident -- what allegedly occurred, when, and where. Cautious language throughout; do not conclude fault.",
  "sceneObservations": "A description of the premises/scene conditions and any visible damage/hazards, drawing on the image analysis if provided. Note apparent conditions the adjuster should verify.",
  "investigationChecklist": "A markdown bullet list (lines starting with '- ') of specific investigation steps/questions the adjuster should pursue for this claim (e.g. witness statements, maintenance records, prior incident history, photos/measurements needed).",
  "recommendations": "A markdown bullet list (lines starting with '- ') of recommended next steps for the adjuster, incorporating any adjuster-provided recommendations above.",
  "conclusion": "A closing paragraph noting this is a preliminary draft for licensed-adjuster review, summarizing what remains to be confirmed, and explicitly stating that no liability or fault determination has been made. Leave a blank line for the reviewing adjuster's own sign-off; do not write a certification on their behalf."
}`;
};

const parseLiabilityNarrative = (text) => {
  try {
    const jsonMatch = String(text || '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const parsed = JSON.parse(jsonMatch[0]);
    const out = {};
    for (const key of LIABILITY_NARRATIVE_KEYS) {
      if (typeof parsed[key] === 'string' && parsed[key].trim()) out[key] = parsed[key].trim();
    }
    return out;
  } catch {
    return {};
  }
};

const LIABILITY_KEY_LABELS = {
  incidentSummary: 'Incident Summary',
  sceneObservations: 'Scene Observations',
  investigationChecklist: 'Investigation Checklist (markdown bullet list)',
  recommendations: 'Recommendations (markdown bullet list)',
  conclusion: 'Conclusion',
};

// One repair retry, scoped to just the missing key -- mirrors the
// ensureLossSummary/ensureConclusion partial-failure repair pattern above, so
// a single malformed key never blanks out the whole report.
const repairLiabilityNarrativeKey = async (key, reportData, imageAnalysis, generateFn) => {
  const prompt = `You are assisting a licensed adjuster with a Liability Investigation Report draft. Generate ONLY the "${LIABILITY_KEY_LABELS[key]}" section for this claim.

${LIABILITY_LANGUAGE_RULES}

Claim Number: ${reportData.claimNumber}
Premises Owner / Insured: ${reportData.insuredName}
Claimant: ${reportData.claimantName || 'Not provided'}
Premises Address: ${reportData.propertyAddress}
Date of Incident: ${reportData.lossDate}
Loss Type: ${reportData.lossType}
${reportData.lossDescription ? `Incident Description: ${reportData.lossDescription}` : ''}
${imageAnalysis ? `Image Analysis: ${JSON.stringify(imageAnalysis)}` : ''}

Return ONLY the section text (plain prose, or a markdown bullet list if this section is a list) -- no heading, no preamble, no JSON, no code fence.`;
  try {
    const { text } = await generateFn(prompt, { maxTokens: 700, temperature: 0.3 });
    const stripped = stripCodeFence(text);
    return stripped || null;
  } catch (err) {
    console.warn(`Liability narrative repair failed for "${key}":`, err.message);
    return null;
  }
};

// Zero-AI, deterministic -- renders exactly right every time from the report's
// own fields.
const buildLiabilityStaticSections = (reportData) => {
  const { claimNumber, insuredName, claimantName, claimantContact, policyNumber, propertyAddress, lossDate, lossType, reportType } =
    reportData;
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const parties = `## SECTION 1: PARTIES
| Role | Details |
|------|---------|
| Premises Owner / Insured | ${insuredName} |
| Claimant | ${claimantName || 'Not provided'} |
| Claimant Contact | ${claimantContact || 'Not provided'} |
| Policy Number | ${policyNumber || 'Not provided'} |
| Claim Number | ${claimNumber} |`;

  const incidentData = `## SECTION 2: INCIDENT DATA
| Field | Value |
|-------|-------|
| Premises Address | ${propertyAddress} |
| Date of Incident | ${lossDate} |
| Loss Type | ${lossType} |
| Report Type | ${reportType || 'Liability Investigation'} |
| Report Date | ${reportDate} |`;

  const checklist = `## SECTION 6: ADJUSTER REVIEW CHECKLIST
- [ ] Confirm policy coverage and applicable exclusions
- [ ] Review premises maintenance/inspection records
- [ ] Confirm claimant statement and any witness statements
- [ ] Verify photographic/documentary evidence of the condition alleged
- [ ] Evaluate comparative/contributory fault considerations
- [ ] Confirm any prior similar incidents at this location
- [ ] Determine liability -- NOT determined by this draft
- [ ] Confirm final reserve/exposure estimate`;

  return { parties, incidentData, checklist };
};

// Deterministic assembler -- stitches static + parsed narrative sections into
// final markdown in manifest order, then hands off to the existing generic
// PDF/DOCX renderers unchanged (same `##`/table/bullet markdown dialect).
const assembleLiabilityReport = (staticSections, narrative, imageAnalysis, photoCount) => {
  const photoSection =
    photoCount === 0
      ? `**${NO_PHOTO_DISCLAIMER}**`
      : buildPhotoObservationsSection(imageAnalysis) ||
        'Photos were provided; see per-photo observations in the report photo library.';

  return `# LIABILITY INVESTIGATION REPORT

> Prepared with the FLACRON ENGINE for review and approval by a licensed insurance adjuster. This draft does not constitute a final determination of liability, fault, or coverage.

${staticSections.parties}

${staticSections.incidentData}

## SECTION 3: INCIDENT SUMMARY
${narrative.incidentSummary}

## SECTION 4: SCENE OBSERVATIONS
${narrative.sceneObservations}

## SECTION 5: INVESTIGATION CHECKLIST
${narrative.investigationChecklist}

${staticSections.checklist}

## SECTION 7: RECOMMENDATIONS
${narrative.recommendations}

## SECTION 8: CONCLUSION
${narrative.conclusion}

## SECTION 9: PHOTO DOCUMENTATION
${photoSection}

---
*Automated draft prepared by FlacronAI for licensed-adjuster review | ${new Date().toISOString()}*`;
};

// `generateFn` is test-only dependency injection (mirrors analyzeImages'
// `callVisionApi`) -- production callers never pass it, so this defaults to
// the real Claude->watsonx fallback chain.
const generateLiabilityReport = async (
  reportData,
  imageAnalysis,
  photoCount = 0,
  { generateFn = generateWithFallback } = {}
) => {
  const prompt = buildLiabilityNarrativePrompt(reportData, imageAnalysis);

  console.log('🤖 Generating Liability Investigation Report narrative (single structured call)...');
  let text, modelUsed;
  try {
    ({ text, modelUsed } = await generateFn(prompt, { maxTokens: 4096, temperature: 0.4 }));
  } catch (err) {
    console.error(
      'Liability report generation providers unavailable (Claude + watsonx both failed):',
      err.message
    );
    throw new Error('Report generation is temporarily unavailable. Please try again shortly.', {
      cause: err,
    });
  }
  console.log(`✅ Liability narrative generated via ${modelUsed}`);

  const narrative = parseLiabilityNarrative(text);

  // One repair retry per missing/malformed key -- never ship a blank section.
  for (const key of LIABILITY_NARRATIVE_KEYS) {
    if (narrative[key]) continue;
    console.log(`⚠️  Liability narrative missing "${key}" — repairing...`);
    const repaired = await repairLiabilityNarrativeKey(key, reportData, imageAnalysis, generateFn);
    if (repaired) narrative[key] = repaired;
  }
  const stillMissing = LIABILITY_NARRATIVE_KEYS.filter((k) => !narrative[k]);
  if (stillMissing.length > 0) {
    throw new Error(
      `Liability report generation failed to produce: ${stillMissing.join(', ')}. Please try again.`
    );
  }

  const staticSections = buildLiabilityStaticSections(reportData);
  const content = assembleLiabilityReport(staticSections, narrative, imageAnalysis, photoCount);

  return { content, modelUsed };
};

// ── Phase 32: Commercial Property Inspection Report ─────────────────────────
// Reuses Phase 31's architecture exactly: static sections built directly from
// report fields (zero AI), one structured AI call for every narrative
// section, deterministic assembler. See PHASES.md Phase 32.
const COMMERCIAL_NARRATIVE_KEYS = [
  'lossDescription',
  'damageAssessment',
  'roofMoistureScan',
  'scopeOfWork',
  'recommendations',
  'conclusion',
];

const COMMERCIAL_LANGUAGE_RULES = `CRITICAL LANGUAGE & SCOPE RULES (follow in every section):
- Use cautious, observational language: "appears", "may indicate", "is consistent with", "the adjuster should verify", "subject to confirmation". Never state conclusions as established fact.
- Do NOT make a final determination of cause of loss, coverage, liability, or final repair costs -- instead, note these as items for the reviewing adjuster (and, where applicable, a roof/structural consultant) to evaluate and confirm.
- Business interruption and tenant-specific claims are OUT OF SCOPE for this structural report. Never offer a business-interruption coverage determination -- only note, if relevant, that BI should be evaluated separately if tenants are affected.
- Only describe what is reported or visible in the provided details/photos. Do not invent facts not supported by the inputs.`;

const buildCommercialNarrativePrompt = (reportData, imageAnalysis) => {
  const {
    claimNumber,
    insuredName,
    propertyAddress,
    lossDate,
    lossType,
    policyNumber,
    propertyManagerName,
    propertyManagerContact,
    roofType,
    roofAge,
    tenantSuiteCount,
    lossDescription,
    damagesObserved,
    recommendations,
    additionalNotes,
  } = reportData;
  const imageSection = imageAnalysis
    ? `\n\nIMAGE ANALYSIS RESULTS:\n${JSON.stringify(imageAnalysis, null, 2)}`
    : '';

  return `You are assisting a licensed insurance adjuster by drafting the narrative sections of a Commercial Property Inspection Report for their review, editing, and approval. You are NOT the adjuster and you do NOT make final determinations.

${COMMERCIAL_LANGUAGE_RULES}

CLAIM DETAILS:
- Claim Number: ${claimNumber}
- Insured: ${insuredName}
- Property Address: ${propertyAddress}
- Date of Loss: ${lossDate}
- Loss Type: ${lossType}
- Policy Number: ${policyNumber || 'Not provided'}
- Property Manager Contact: ${propertyManagerName || 'Not provided'}${propertyManagerContact ? ` (${propertyManagerContact})` : ''}
- Roof Type: ${roofType || 'Not provided'}
- Roof Age: ${roofAge || 'Not provided'}
- Number of Tenant Suites: ${tenantSuiteCount || 'Not provided'}
- Loss Description (provided by adjuster): ${lossDescription || 'None provided'}
- Damages Observed (provided by adjuster): ${damagesObserved || 'None provided'}
- Adjuster Recommendations: ${recommendations || 'None provided'}
- Additional Notes: ${additionalNotes || 'None provided'}${imageSection}

Return ONLY a JSON object with exactly these 6 keys, each a string, no other text/preamble/code fence:
{
  "lossDescription": "A professional narrative of the reported loss -- what was reported and by whom, when, and its visible extent. Mark this as reported/unverified where appropriate; cautious language throughout.",
  "damageAssessment": "A markdown bullet list (lines starting with '- ') of visible-condition damage observations grouped by area (e.g. roof/membrane, rooftop HVAC/RTUs, exterior signage, interior/tenant suites), drawing on the image analysis if provided. Each item should note what a follow-up trade professional should confirm.",
  "roofMoistureScan": "A paragraph or short markdown bullet list recommending a roof moisture scan (or explicitly noting one is not needed, if the described/observed damage doesn't involve the roof), framed as a drafting aid for scoping -- final repair-vs-replace determination rests with a licensed roof consultant.",
  "scopeOfWork": "A markdown bullet list (lines starting with '- ') of draft scope-of-work items corresponding to the damage assessment above, explicitly marked as subject to adjuster/consultant revision. Do not include dollar figures or cost estimates.",
  "recommendations": "A markdown bullet list (lines starting with '- ') of recommended next steps for the adjuster, incorporating any adjuster-provided recommendations above (e.g. moisture scan priority, tenant notification, consultant engagement thresholds).",
  "conclusion": "A closing paragraph noting this is a preliminary draft for licensed-adjuster review, summarizing what remains to be confirmed, and explicitly stating that no coverage or final scope determination has been made. Leave a blank line for the reviewing adjuster's own sign-off; do not write a certification on their behalf."
}`;
};

const parseCommercialNarrative = (text) => {
  try {
    const jsonMatch = String(text || '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const parsed = JSON.parse(jsonMatch[0]);
    const out = {};
    for (const key of COMMERCIAL_NARRATIVE_KEYS) {
      if (typeof parsed[key] === 'string' && parsed[key].trim()) out[key] = parsed[key].trim();
    }
    return out;
  } catch {
    return {};
  }
};

const COMMERCIAL_KEY_LABELS = {
  lossDescription: 'Loss Description',
  damageAssessment: 'Damage Assessment (markdown bullet list)',
  roofMoistureScan: 'Roof Moisture Scan',
  scopeOfWork: 'Scope of Work (markdown bullet list)',
  recommendations: 'Recommendations (markdown bullet list)',
  conclusion: 'Conclusion',
};

// One repair retry, scoped to just the missing key -- mirrors the Liability
// pattern above, so a single malformed key never blanks out the whole report.
const repairCommercialNarrativeKey = async (key, reportData, imageAnalysis, generateFn) => {
  const prompt = `You are assisting a licensed adjuster with a Commercial Property Inspection Report draft. Generate ONLY the "${COMMERCIAL_KEY_LABELS[key]}" section for this claim.

${COMMERCIAL_LANGUAGE_RULES}

Claim Number: ${reportData.claimNumber}
Insured: ${reportData.insuredName}
Property Address: ${reportData.propertyAddress}
Date of Loss: ${reportData.lossDate}
Loss Type: ${reportData.lossType}
${reportData.roofType ? `Roof Type: ${reportData.roofType}` : ''}
${reportData.lossDescription ? `Loss Description: ${reportData.lossDescription}` : ''}
${reportData.damagesObserved ? `Damages Observed: ${reportData.damagesObserved}` : ''}
${imageAnalysis ? `Image Analysis: ${JSON.stringify(imageAnalysis)}` : ''}

Return ONLY the section text (plain prose, or a markdown bullet list if this section is a list) -- no heading, no preamble, no JSON, no code fence.`;
  try {
    const { text } = await generateFn(prompt, { maxTokens: 700, temperature: 0.3 });
    const stripped = stripCodeFence(text);
    return stripped || null;
  } catch (err) {
    console.warn(`Commercial narrative repair failed for "${key}":`, err.message);
    return null;
  }
};

// Zero-AI, deterministic -- renders exactly right every time from the report's
// own fields.
const buildCommercialStaticSections = (reportData) => {
  const {
    claimNumber,
    insuredName,
    propertyAddress,
    lossDate,
    lossType,
    policyNumber,
    reportType,
    propertyManagerName,
    propertyManagerContact,
    roofType,
    roofAge,
    tenantSuiteCount,
  } = reportData;
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const propertyManager = propertyManagerName
    ? `${propertyManagerName}${propertyManagerContact ? ` (${propertyManagerContact})` : ''}`
    : 'Not provided';

  const propertyInfo = `## SECTION 1: INSURED & PROPERTY INFORMATION
| Field | Value |
|-------|-------|
| Claim Number | ${claimNumber} |
| Named Insured | ${insuredName} |
| Property Address | ${propertyAddress} |
| Date of Loss | ${lossDate} |
| Loss Type | ${lossType} |
| Policy Number | ${policyNumber || 'Not provided'} |
| Property Manager Contact | ${propertyManager} |
| Number of Tenant Suites | ${tenantSuiteCount || 'Not provided'} |
| Roof Type | ${roofType || 'Not provided'} |
| Roof Age | ${roofAge || 'Not provided'} |
| Report Type | ${reportType || 'Initial Inspection'} |
| Report Date | ${reportDate} |`;

  const checklist = `## SECTION 6: ADJUSTER REVIEW CHECKLIST
- [ ] Schedule roof moisture scan or other recommended diagnostic testing, if applicable
- [ ] Confirm rooftop HVAC/equipment evaluation with a qualified technician
- [ ] Confirm structural evaluation of any damaged exterior signage or equipment
- [ ] Notify all tenant suites and log any additional damage reports
- [ ] Confirm business interruption coverage applicability if tenants are affected (outside the scope of this report)
- [ ] Confirm scope and pricing with a qualified estimator or consultant
- [ ] Coverage determination under the policy -- NOT determined by this draft`;

  return { propertyInfo, checklist };
};

// Deterministic assembler -- stitches static + parsed narrative sections into
// final markdown in manifest order, then hands off to the existing generic
// PDF/DOCX renderers unchanged.
const assembleCommercialReport = (staticSections, narrative, imageAnalysis, photoCount) => {
  const photoSection =
    photoCount === 0
      ? `**${NO_PHOTO_DISCLAIMER}**`
      : buildPhotoObservationsSection(imageAnalysis) ||
        'Photos were provided; see per-photo observations in the report photo library.';

  return `# COMMERCIAL PROPERTY INSPECTION REPORT

> Prepared with the FLACRON ENGINE for review and approval by a licensed insurance adjuster. This draft does not constitute a final determination of cause, coverage, or scope. Business interruption and tenant-specific claims are outside the scope of this structural report.

${staticSections.propertyInfo}

## SECTION 2: LOSS DESCRIPTION — REPORTED (UNVERIFIED)
${narrative.lossDescription}

## SECTION 3: DAMAGE ASSESSMENT — VISIBLE CONDITIONS
${narrative.damageAssessment}

## SECTION 4: ROOF MOISTURE SCAN — RECOMMENDED SCOPE
${narrative.roofMoistureScan}

## SECTION 5: SCOPE OF WORK — DRAFT FOR REVIEW
${narrative.scopeOfWork}

${staticSections.checklist}

## SECTION 7: RECOMMENDATIONS
${narrative.recommendations}

## SECTION 8: CONCLUSION
${narrative.conclusion}

## SECTION 9: PHOTO DOCUMENTATION
${photoSection}

---
*Automated draft prepared by FlacronAI for licensed-adjuster review | ${new Date().toISOString()}*`;
};

// `generateFn` is test-only dependency injection, mirrors generateLiabilityReport.
const generateCommercialReport = async (
  reportData,
  imageAnalysis,
  photoCount = 0,
  { generateFn = generateWithFallback } = {}
) => {
  const prompt = buildCommercialNarrativePrompt(reportData, imageAnalysis);

  console.log('🤖 Generating Commercial Property Inspection Report narrative (single structured call)...');
  let text, modelUsed;
  try {
    ({ text, modelUsed } = await generateFn(prompt, { maxTokens: 4096, temperature: 0.4 }));
  } catch (err) {
    console.error(
      'Commercial report generation providers unavailable (Claude + watsonx both failed):',
      err.message
    );
    throw new Error('Report generation is temporarily unavailable. Please try again shortly.', {
      cause: err,
    });
  }
  console.log(`✅ Commercial narrative generated via ${modelUsed}`);

  const narrative = parseCommercialNarrative(text);

  // One repair retry per missing/malformed key -- never ship a blank section.
  for (const key of COMMERCIAL_NARRATIVE_KEYS) {
    if (narrative[key]) continue;
    console.log(`⚠️  Commercial narrative missing "${key}" — repairing...`);
    const repaired = await repairCommercialNarrativeKey(key, reportData, imageAnalysis, generateFn);
    if (repaired) narrative[key] = repaired;
  }
  const stillMissing = COMMERCIAL_NARRATIVE_KEYS.filter((k) => !narrative[k]);
  if (stillMissing.length > 0) {
    throw new Error(
      `Commercial report generation failed to produce: ${stillMissing.join(', ')}. Please try again.`
    );
  }

  const staticSections = buildCommercialStaticSections(reportData);
  const content = assembleCommercialReport(staticSections, narrative, imageAnalysis, photoCount);

  return { content, modelUsed };
};

// ── Phase 33: Flood (NFIP) Inspection Report ─────────────────────────────────
// Keyed off `lossType === 'Flood'` (not `claimType`, unlike Phases 31/32) --
// the first document type selected by loss type instead of claim type, per
// PHASES.md Phase 33's approved precedence rule: Flood lossType wins over any
// claimType template, and a Commercial claim with a Flood loss keeps its
// applicable commercial-property fields (folded into the static section
// below rather than getting a wholly separate manifest). Reuses Phase 31's
// static+single-structured-call architecture exactly.
const FLOOD_NARRATIVE_KEYS = [
  'propertyDescription',
  'damageAssessment',
  'scopeOfWork',
  'recommendations',
  'conclusion',
];

// Fixed, deterministic wording (never AI-generated) satisfying the client's
// approved decision that this document must disclose it is a draft, does not
// fully represent federal NFIP requirements, and is not an official coverage
// or claim determination.
const NFIP_FIXED_DISCLAIMER =
  'This is an AI-drafted inspection document for a flood (NFIP) loss. It does not fully represent all National Flood Insurance Program (NFIP) federal claims-handling requirements and is not an official coverage or claim determination -- coverage and claim determinations under the NFIP policy are made by the carrier in accordance with the Standard Flood Insurance Policy and applicable federal guidance.';

const FLOOD_LANGUAGE_RULES = `CRITICAL LANGUAGE & SCOPE RULES (follow in every section):
- Use cautious, observational language: "appears", "may indicate", "is consistent with", "the adjuster should verify", "subject to confirmation". Never state conclusions as established fact.
- Do NOT make a final determination of cause of loss, coverage, liability, fraud, or final repair costs -- instead, note these as items for the licensed adjuster to evaluate and confirm.
- This is a flood (NFIP) loss. NFIP policies commonly limit or exclude basement/below-grade coverage -- flag any below-grade/crawlspace findings as coverage questions for the adjuster to confirm, never as a coverage determination.
- Never represent this draft as satisfying all NFIP federal claims-handling requirements -- it does not, and must not claim to.
- Only describe what is reported or visible in the provided details/photos. Do not invent facts not supported by the inputs.`;

const buildFloodNarrativePrompt = (reportData, imageAnalysis) => {
  const {
    claimNumber,
    insuredName,
    propertyAddress,
    lossDate,
    lossType,
    policyNumber,
    floodZone,
    lowestFloorElevation,
    baseFloodElevation,
    floodEventSource,
    reportedCrest,
    claimType,
    propertyManagerName,
    roofType,
    tenantSuiteCount,
    propertyDetails,
    lossDescription,
    damagesObserved,
    recommendations,
    additionalNotes,
  } = reportData;
  const imageSection = imageAnalysis
    ? `\n\nIMAGE ANALYSIS RESULTS:\n${JSON.stringify(imageAnalysis, null, 2)}`
    : '';
  const commercialContext =
    claimType === 'Commercial'
      ? `\n- Property Manager Contact: ${propertyManagerName || 'Not provided'}\n- Roof Type: ${roofType || 'Not provided'}\n- Number of Tenant Suites: ${tenantSuiteCount || 'Not provided'}`
      : '';

  return `You are assisting a licensed insurance adjuster by drafting the narrative sections of a Flood (NFIP) Inspection Report for their review, editing, and approval. You are NOT the adjuster and you do NOT make final determinations.

${FLOOD_LANGUAGE_RULES}

CLAIM DETAILS:
- Claim Number: ${claimNumber}
- Insured: ${insuredName}
- Property Address: ${propertyAddress}
- Date of Loss: ${lossDate}
- Loss Type: ${lossType}
- NFIP Policy Number: ${policyNumber || 'Not provided'}
- Flood Zone: ${floodZone || 'Not provided'}
- Lowest Floor Elevation: ${lowestFloorElevation || 'Not provided'}
- Base Flood Elevation (BFE): ${baseFloodElevation || 'Not provided'}
- Flood Event Data Source: ${floodEventSource || 'Not provided'}
- Reported Crest: ${reportedCrest || 'Not provided'}${commercialContext}
- Property Details (provided by adjuster): ${propertyDetails || 'None provided'}
- Loss Description (provided by adjuster): ${lossDescription || 'None provided'}
- Damages Observed (provided by adjuster): ${damagesObserved || 'None provided'}
- Adjuster Recommendations: ${recommendations || 'None provided'}
- Additional Notes: ${additionalNotes || 'None provided'}${imageSection}

Return ONLY a JSON object with exactly these 5 keys, each a string, no other text/preamble/code fence:
{
  "propertyDescription": "A professional description of the property (construction type, apparent age/size, and any provided flood-zone/elevation context), noting flood zone and elevation figures are as reported and should be confirmed against the elevation certificate and public records.",
  "damageAssessment": "A markdown bullet list (lines starting with '- ') of visible-condition flood damage observations (e.g. foundation water lines, flooring/drywall, mechanical equipment, crawlspace/basement if applicable), drawing on the image analysis if provided. Each item should note what the adjuster should confirm on site.",
  "scopeOfWork": "A markdown bullet list (lines starting with '- ') of draft mitigation/repair scope items corresponding to the damage assessment above (e.g. flood cut, structural drying, mechanical evaluation, extraction/sanitization), explicitly marked as subject to adjuster revision. Do not include dollar figures or cost estimates.",
  "recommendations": "A markdown bullet list (lines starting with '- ') of recommended next steps for the adjuster, incorporating any adjuster-provided recommendations above (e.g. drying priority, NFIP below-grade coverage check, mechanical technician follow-up).",
  "conclusion": "A closing paragraph noting this is a preliminary draft for licensed-adjuster review, summarizing what remains to be confirmed, and explicitly stating that no coverage or claim determination has been made under the NFIP policy. Leave a blank line for the reviewing adjuster's own sign-off; do not write a certification on their behalf."
}`;
};

const parseFloodNarrative = (text) => {
  try {
    const jsonMatch = String(text || '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const parsed = JSON.parse(jsonMatch[0]);
    const out = {};
    for (const key of FLOOD_NARRATIVE_KEYS) {
      if (typeof parsed[key] === 'string' && parsed[key].trim()) out[key] = parsed[key].trim();
    }
    return out;
  } catch {
    return {};
  }
};

const FLOOD_KEY_LABELS = {
  propertyDescription: 'Property Description',
  damageAssessment: 'Damage Assessment (markdown bullet list)',
  scopeOfWork: 'Scope of Work (markdown bullet list)',
  recommendations: 'Recommendations (markdown bullet list)',
  conclusion: 'Conclusion',
};

// One repair retry, scoped to just the missing key -- mirrors the
// Liability/Commercial pattern above.
const repairFloodNarrativeKey = async (key, reportData, imageAnalysis, generateFn) => {
  const prompt = `You are assisting a licensed adjuster with a Flood (NFIP) Inspection Report draft. Generate ONLY the "${FLOOD_KEY_LABELS[key]}" section for this claim.

${FLOOD_LANGUAGE_RULES}

Claim Number: ${reportData.claimNumber}
Insured: ${reportData.insuredName}
Property Address: ${reportData.propertyAddress}
Date of Loss: ${reportData.lossDate}
Loss Type: ${reportData.lossType}
${reportData.floodZone ? `Flood Zone: ${reportData.floodZone}` : ''}
${reportData.lossDescription ? `Loss Description: ${reportData.lossDescription}` : ''}
${reportData.damagesObserved ? `Damages Observed: ${reportData.damagesObserved}` : ''}
${imageAnalysis ? `Image Analysis: ${JSON.stringify(imageAnalysis)}` : ''}

Return ONLY the section text (plain prose, or a markdown bullet list if this section is a list) -- no heading, no preamble, no JSON, no code fence.`;
  try {
    const { text } = await generateFn(prompt, { maxTokens: 700, temperature: 0.3 });
    const stripped = stripCodeFence(text);
    return stripped || null;
  } catch (err) {
    console.warn(`Flood narrative repair failed for "${key}":`, err.message);
    return null;
  }
};

// Zero-AI, deterministic -- renders exactly right every time from the report's
// own fields. When `claimType === 'Commercial'` (a Commercial claim with a
// Flood loss type), the applicable commercial-property fields are folded
// into the property/flood-zone table rather than producing a separate
// manifest, per the approved Phase 33 precedence decision.
const buildFloodStaticSections = (reportData) => {
  const {
    claimNumber,
    insuredName,
    insuredEmail,
    propertyAddress,
    lossDate,
    lossType,
    reportType,
    policyNumber,
    floodZone,
    lowestFloorElevation,
    baseFloodElevation,
    floodEventSource,
    reportedCrest,
    claimType,
    propertyManagerName,
    propertyManagerContact,
    roofType,
    roofAge,
    tenantSuiteCount,
  } = reportData;
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const insuredInfo = `## SECTION 1: INSURED & POLICY INFORMATION
| Field | Value |
|-------|-------|
| Claim Number | ${claimNumber} |
| Named Insured | ${insuredName} |
| Insured Contact | ${insuredEmail || 'Not provided'} |
| NFIP Policy Number | ${policyNumber || 'Not provided'} |`;

  const commercialRows =
    claimType === 'Commercial'
      ? `
| Property Manager Contact | ${propertyManagerName ? `${propertyManagerName}${propertyManagerContact ? ` (${propertyManagerContact})` : ''}` : 'Not provided'} |
| Roof Type | ${roofType || 'Not provided'} |
| Roof Age | ${roofAge || 'Not provided'} |
| Number of Tenant Suites | ${tenantSuiteCount || 'Not provided'} |`
      : '';

  const propertyFloodData = `## SECTION 2: PROPERTY & FLOOD ZONE DATA
| Field | Value |
|-------|-------|
| Property Address | ${propertyAddress} |
| Date of Loss | ${lossDate} |
| Loss Type | ${lossType} |
| Report Type | ${reportType || 'Initial Inspection'} |
| Flood Zone | ${floodZone || 'Not provided'} |
| Lowest Floor Elevation | ${lowestFloorElevation || 'Not provided'} |
| Base Flood Elevation (BFE) | ${baseFloodElevation || 'Not provided'} |${commercialRows}
| Report Date | ${reportDate} |`;

  const floodEventData = `## SECTION 3: FLOOD EVENT DATA
| Field | Value |
|-------|-------|
| Data Source | ${floodEventSource || 'Not provided'} |
| Event Date | ${lossDate} |
| Reported Crest | ${reportedCrest || 'Not provided'} |
| Event Classification | ${lossType} |`;

  const checklist = `## SECTION 7: ADJUSTER REVIEW CHECKLIST
- [ ] Confirm elevation certificate and lowest floor elevation against public records
- [ ] Cross-reference reported water height with flood event/crest data
- [ ] Confirm NFIP below-grade/basement coverage limitations, if applicable
- [ ] Mechanical equipment technician evaluation, if applicable
- [ ] Track daily moisture readings until dry standard is met
- [ ] Confirm final scope and pricing with a qualified estimator or contractor
- [ ] Coverage determination under the NFIP policy -- NOT determined by this draft`;

  return { insuredInfo, propertyFloodData, floodEventData, checklist };
};

// Deterministic assembler -- stitches static + parsed narrative sections into
// final markdown in manifest order, then hands off to the existing generic
// PDF/DOCX renderers unchanged.
const assembleFloodReport = (staticSections, narrative, imageAnalysis, photoCount) => {
  const photoSection =
    photoCount === 0
      ? `**${NO_PHOTO_DISCLAIMER}**`
      : buildPhotoObservationsSection(imageAnalysis) ||
        'Photos were provided; see per-photo observations in the report photo library.';

  return `# FLOOD (NFIP) INSPECTION REPORT

> Prepared with the FLACRON ENGINE for review and approval by a licensed insurance adjuster. ${NFIP_FIXED_DISCLAIMER}

${staticSections.insuredInfo}

${staticSections.propertyFloodData}

_Elevation and flood-zone figures above are as reported and have not been independently verified. Confirm against the elevation certificate and public records before this report is finalized._

${staticSections.floodEventData}

_Flood event data, where provided, is intended to support -- not establish -- the reported cause of loss. It does not, by itself, establish the height of water inside the structure or the extent of damage._

## SECTION 4: PROPERTY DESCRIPTION
${narrative.propertyDescription}

## SECTION 5: DAMAGE ASSESSMENT — VISIBLE CONDITIONS
${narrative.damageAssessment}

## SECTION 6: SCOPE OF WORK — DRAFT FOR REVIEW
${narrative.scopeOfWork}

${staticSections.checklist}

## SECTION 8: RECOMMENDATIONS
${narrative.recommendations}

## SECTION 9: CONCLUSION
${narrative.conclusion}

## SECTION 10: PHOTO DOCUMENTATION
${photoSection}

---
*Automated draft prepared by FlacronAI for licensed-adjuster review | ${new Date().toISOString()}*`;
};

// `generateFn` is test-only dependency injection, mirrors generateLiabilityReport.
const generateFloodReport = async (
  reportData,
  imageAnalysis,
  photoCount = 0,
  { generateFn = generateWithFallback } = {}
) => {
  const prompt = buildFloodNarrativePrompt(reportData, imageAnalysis);

  console.log('🤖 Generating Flood (NFIP) Inspection Report narrative (single structured call)...');
  let text, modelUsed;
  try {
    ({ text, modelUsed } = await generateFn(prompt, { maxTokens: 4096, temperature: 0.4 }));
  } catch (err) {
    console.error(
      'Flood report generation providers unavailable (Claude + watsonx both failed):',
      err.message
    );
    throw new Error('Report generation is temporarily unavailable. Please try again shortly.', {
      cause: err,
    });
  }
  console.log(`✅ Flood narrative generated via ${modelUsed}`);

  const narrative = parseFloodNarrative(text);

  // One repair retry per missing/malformed key -- never ship a blank section.
  for (const key of FLOOD_NARRATIVE_KEYS) {
    if (narrative[key]) continue;
    console.log(`⚠️  Flood narrative missing "${key}" — repairing...`);
    const repaired = await repairFloodNarrativeKey(key, reportData, imageAnalysis, generateFn);
    if (repaired) narrative[key] = repaired;
  }
  const stillMissing = FLOOD_NARRATIVE_KEYS.filter((k) => !narrative[k]);
  if (stillMissing.length > 0) {
    throw new Error(
      `Flood report generation failed to produce: ${stillMissing.join(', ')}. Please try again.`
    );
  }

  const staticSections = buildFloodStaticSections(reportData);
  const content = assembleFloodReport(staticSections, narrative, imageAnalysis, photoCount);

  return { content, modelUsed };
};

// ── Phase 34: Theft/Burglary Inspection Report ────────────────────────────────
// Keyed off `lossType === 'Theft'`, same precedence pattern as Phase 33's
// Flood manifest -- lossType wins over any claimType template. Scoped to
// visible structural entry-point damage only: contents/valuation/theft
// determination are explicitly out of scope, backstopped by a fixed,
// deterministic (never AI-generated) disclaimer. Reuses Phase 31's
// static+single-structured-call architecture exactly.
const THEFT_NARRATIVE_KEYS = [
  'incidentSummary',
  'damageAssessment',
  'scopeOfWork',
  'recommendations',
  'conclusion',
];

// Fixed, deterministic wording (never AI-generated): the AI must never claim
// what items existed, were stolen, or their value -- that is established
// solely by the insured's contents inventory and the police report.
const THEFT_FIXED_DISCLAIMER =
  "This is an AI-drafted inspection document for a theft/burglary loss. It documents visible structural entry-point damage only. Whether specific items existed prior to the loss, were stolen, and their value are not determined by this draft -- those are established solely by the insured's itemized contents inventory and the police incident report, as confirmed by the reviewing adjuster.";

const THEFT_LANGUAGE_RULES = `CRITICAL LANGUAGE & SCOPE RULES (follow in every section):
- Use cautious, observational language: "appears", "may indicate", "is consistent with", "the adjuster should verify", "subject to confirmation". Never state conclusions as established fact.
- Do NOT make a final determination of cause of loss, coverage, liability, fraud, or final repair costs -- instead, note these as items for the licensed adjuster to evaluate and confirm.
- This is a theft/burglary loss. NEVER state or imply which items were present before the loss, were stolen, or their value -- that is established only by the insured's itemized contents inventory and the police incident report, never by this draft.
- Scope is limited to visible structural entry-point damage (doors, windows, locks, frames) and general visible disturbance. Contents/inventory loss and valuation are explicitly out of scope and handled under a separate personal property claim process.
- Only describe what is reported or visible in the provided details/photos. Do not invent facts not supported by the inputs.`;

const buildTheftNarrativePrompt = (reportData, imageAnalysis) => {
  const {
    claimNumber,
    insuredName,
    propertyAddress,
    lossDate,
    lossType,
    policyNumber,
    policeIncidentNumber,
    pointsOfEntry,
    propertyDetails,
    lossDescription,
    damagesObserved,
    recommendations,
    additionalNotes,
  } = reportData;
  const imageSection = imageAnalysis
    ? `\n\nIMAGE ANALYSIS RESULTS:\n${JSON.stringify(imageAnalysis, null, 2)}`
    : '';

  return `You are assisting a licensed insurance adjuster by drafting the narrative sections of a Theft/Burglary Inspection Report for their review, editing, and approval. You are NOT the adjuster and you do NOT make final determinations.

${THEFT_LANGUAGE_RULES}

CLAIM DETAILS:
- Claim Number: ${claimNumber}
- Insured: ${insuredName}
- Property Address: ${propertyAddress}
- Date of Loss: ${lossDate}
- Loss Type: ${lossType}
- Policy Number: ${policyNumber || 'Not provided'}
- Police Incident Number: ${policeIncidentNumber || 'Not provided'}
- Points of Entry Reported: ${pointsOfEntry || 'Not provided'}
- Property Details (provided by adjuster): ${propertyDetails || 'None provided'}
- Loss Description (provided by adjuster): ${lossDescription || 'None provided'}
- Damages Observed (provided by adjuster): ${damagesObserved || 'None provided'}
- Adjuster Recommendations: ${recommendations || 'None provided'}
- Additional Notes: ${additionalNotes || 'None provided'}${imageSection}

Return ONLY a JSON object with exactly these 5 keys, each a string, no other text/preamble/code fence:
{
  "incidentSummary": "A paragraph summarizing the reported incident as relayed by the insured/adjuster (e.g. reported points of entry, police report filing status), explicitly framed as reported and unverified -- note that item-level inventory, police findings, and coverage determinations are outside the scope of this report.",
  "damageAssessment": "A markdown bullet list (lines starting with '- ') of visible-condition STRUCTURAL entry-point damage observations only (e.g. door/window/lock/frame damage, general visible disturbance), drawing on the image analysis if provided. Never mention specific missing/stolen items or their value.",
  "scopeOfWork": "A markdown bullet list (lines starting with '- ') of draft structural repair scope items corresponding to the damage assessment above (e.g. glass replacement, door frame repair, re-keying), explicitly marked as subject to adjuster revision. Do not include dollar figures or cost estimates, and do not include contents replacement.",
  "recommendations": "A markdown bullet list (lines starting with '- ') of recommended next steps for the adjuster (e.g. confirm police report on file, request itemized contents inventory, consider a follow-up site visit), incorporating any adjuster-provided recommendations above.",
  "conclusion": "A closing paragraph noting this is a preliminary draft for licensed-adjuster review, summarizing what remains to be confirmed, and explicitly stating that contents valuation and any theft/coverage determination are outside the scope of this report. Leave a blank line for the reviewing adjuster's own sign-off; do not write a certification on their behalf."
}`;
};

const parseTheftNarrative = (text) => {
  try {
    const jsonMatch = String(text || '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const parsed = JSON.parse(jsonMatch[0]);
    const out = {};
    for (const key of THEFT_NARRATIVE_KEYS) {
      if (typeof parsed[key] === 'string' && parsed[key].trim()) out[key] = parsed[key].trim();
    }
    return out;
  } catch {
    return {};
  }
};

const THEFT_KEY_LABELS = {
  incidentSummary: 'Incident Summary — Reported (Unverified)',
  damageAssessment: 'Damage Assessment (markdown bullet list)',
  scopeOfWork: 'Scope of Work (markdown bullet list)',
  recommendations: 'Recommendations (markdown bullet list)',
  conclusion: 'Conclusion',
};

// One repair retry, scoped to just the missing key -- mirrors the
// Liability/Commercial/Flood pattern above.
const repairTheftNarrativeKey = async (key, reportData, imageAnalysis, generateFn) => {
  const prompt = `You are assisting a licensed adjuster with a Theft/Burglary Inspection Report draft. Generate ONLY the "${THEFT_KEY_LABELS[key]}" section for this claim.

${THEFT_LANGUAGE_RULES}

Claim Number: ${reportData.claimNumber}
Insured: ${reportData.insuredName}
Property Address: ${reportData.propertyAddress}
Date of Loss: ${reportData.lossDate}
Loss Type: ${reportData.lossType}
${reportData.pointsOfEntry ? `Points of Entry Reported: ${reportData.pointsOfEntry}` : ''}
${reportData.lossDescription ? `Loss Description: ${reportData.lossDescription}` : ''}
${reportData.damagesObserved ? `Damages Observed: ${reportData.damagesObserved}` : ''}
${imageAnalysis ? `Image Analysis: ${JSON.stringify(imageAnalysis)}` : ''}

Return ONLY the section text (plain prose, or a markdown bullet list if this section is a list) -- no heading, no preamble, no JSON, no code fence.`;
  try {
    const { text } = await generateFn(prompt, { maxTokens: 700, temperature: 0.3 });
    const stripped = stripCodeFence(text);
    return stripped || null;
  } catch (err) {
    console.warn(`Theft narrative repair failed for "${key}":`, err.message);
    return null;
  }
};

// Zero-AI, deterministic -- renders exactly right every time from the report's
// own fields.
const buildTheftStaticSections = (reportData) => {
  const {
    claimNumber,
    insuredName,
    insuredEmail,
    propertyAddress,
    lossDate,
    lossType,
    reportType,
    policyNumber,
    policeIncidentNumber,
    pointsOfEntry,
  } = reportData;
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const insuredInfo = `## SECTION 1: INSURED & POLICY INFORMATION
| Field | Value |
|-------|-------|
| Claim Number | ${claimNumber} |
| Named Insured | ${insuredName} |
| Insured Contact | ${insuredEmail || 'Not provided'} |
| Policy Number | ${policyNumber || 'Not provided'} |`;

  const propertyLossInfo = `## SECTION 2: PROPERTY & LOSS INFORMATION
| Field | Value |
|-------|-------|
| Property Address | ${propertyAddress} |
| Date of Loss | ${lossDate} |
| Loss Type | ${lossType} |
| Report Type | ${reportType || 'Initial Inspection'} |
| Report Date | ${reportDate} |`;

  const incidentData = `## SECTION 3: INCIDENT DATA — POLICE REPORT (REPORTED, UNVERIFIED)
| Field | Value |
|-------|-------|
| Police Incident Number | ${policeIncidentNumber || 'Not provided'} |
| Points of Entry Reported | ${pointsOfEntry || 'Not provided'} |
| Date of Loss | ${lossDate} |`;

  const checklist = `## SECTION 7: ADJUSTER REVIEW CHECKLIST
- [ ] Confirm police incident report is on file
- [ ] Request itemized contents inventory from the insured
- [ ] Confirm all reported entry points are documented and addressed in scope
- [ ] Confirm current local pricing before finalizing any repair scope
- [ ] Coverage and theft determination under the policy -- NOT determined by this draft`;

  return { insuredInfo, propertyLossInfo, incidentData, checklist };
};

// Deterministic assembler -- stitches static + parsed narrative sections into
// final markdown in manifest order, then hands off to the existing generic
// PDF/DOCX renderers unchanged.
const assembleTheftReport = (staticSections, narrative, imageAnalysis, photoCount) => {
  const photoSection =
    photoCount === 0
      ? `**${NO_PHOTO_DISCLAIMER}**`
      : buildPhotoObservationsSection(imageAnalysis) ||
        'Photos were provided; see per-photo observations in the report photo library.';

  return `# THEFT / BURGLARY INSPECTION REPORT

> Prepared with the FLACRON ENGINE for review and approval by a licensed insurance adjuster. ${THEFT_FIXED_DISCLAIMER}

${staticSections.insuredInfo}

${staticSections.propertyLossInfo}

${staticSections.incidentData}

_Incident data above is as reported by the insured and/or a third-party police report and has not been independently verified by FlacronAI. It does not, by itself, establish the value or existence of any items reported missing._

## SECTION 4: INCIDENT SUMMARY — REPORTED (UNVERIFIED)
${narrative.incidentSummary}

## SECTION 5: DAMAGE ASSESSMENT — VISIBLE CONDITIONS
${narrative.damageAssessment}

This draft documents structural entry-point damage only. Contents loss and valuation are tracked separately in the insured's contents inventory, not in this report.

## SECTION 6: SCOPE OF WORK — DRAFT FOR REVIEW
${narrative.scopeOfWork}

${staticSections.checklist}

## SECTION 8: RECOMMENDATIONS
${narrative.recommendations}

## SECTION 9: CONCLUSION
${narrative.conclusion}

## SECTION 10: PHOTO DOCUMENTATION
${photoSection}

---
*Automated draft prepared by FlacronAI for licensed-adjuster review | ${new Date().toISOString()}*`;
};

// `generateFn` is test-only dependency injection, mirrors generateFloodReport.
const generateTheftReport = async (
  reportData,
  imageAnalysis,
  photoCount = 0,
  { generateFn = generateWithFallback } = {}
) => {
  const prompt = buildTheftNarrativePrompt(reportData, imageAnalysis);

  console.log('🤖 Generating Theft/Burglary Inspection Report narrative (single structured call)...');
  let text, modelUsed;
  try {
    ({ text, modelUsed } = await generateFn(prompt, { maxTokens: 4096, temperature: 0.4 }));
  } catch (err) {
    console.error(
      'Theft report generation providers unavailable (Claude + watsonx both failed):',
      err.message
    );
    throw new Error('Report generation is temporarily unavailable. Please try again shortly.', {
      cause: err,
    });
  }
  console.log(`✅ Theft narrative generated via ${modelUsed}`);

  const narrative = parseTheftNarrative(text);

  // One repair retry per missing/malformed key -- never ship a blank section.
  for (const key of THEFT_NARRATIVE_KEYS) {
    if (narrative[key]) continue;
    console.log(`⚠️  Theft narrative missing "${key}" — repairing...`);
    const repaired = await repairTheftNarrativeKey(key, reportData, imageAnalysis, generateFn);
    if (repaired) narrative[key] = repaired;
  }
  const stillMissing = THEFT_NARRATIVE_KEYS.filter((k) => !narrative[k]);
  if (stillMissing.length > 0) {
    throw new Error(
      `Theft report generation failed to produce: ${stillMissing.join(', ')}. Please try again.`
    );
  }

  const staticSections = buildTheftStaticSections(reportData);
  const content = assembleTheftReport(staticSections, narrative, imageAnalysis, photoCount);

  return { content, modelUsed };
};

// ── Phase 35: Vehicle/Auto Inspection Report ────────────────────────────────
// Keyed off `claimType === 'Auto'`, checked after the Flood/Theft lossType
// precedence rules below (same precedence position as Liability/Commercial).
// The panel-by-panel damage assessment (Section 4) is DETERMINISTIC, not
// AI-authored -- it's assembled directly from each photo's own reviewed
// panel tag + observation (imageAnalysis.damages, see
// buildEffectiveImageAnalysis's roomOrArea-priority change above), the same
// "quote the human-reviewed data, don't ask the model to restate it"
// reasoning as buildPhotoObservationsSection. Only the narrative sections
// (loss summary, repairability notes, recommendations, conclusion) go
// through the single structured AI call, mirroring Phase 31's architecture.
// Final repair costs are explicitly out of scope for this document (Golden
// Rule #2) -- no cost estimate section is generated; that is deferred to a
// dedicated, deterministic estimate feature (see PHASES.md Phase 37).
const VEHICLE_NARRATIVE_KEYS = ['lossSummary', 'repairabilityNotes', 'recommendations', 'conclusion'];

const VEHICLE_LANGUAGE_RULES = `CRITICAL LANGUAGE & SCOPE RULES (follow in every section):
- Use cautious, observational language: "appears", "may indicate", "is consistent with", "subject to confirmation", "pending in-person assessment". Never state conclusions as established fact.
- NEVER make a final determination of repairability, total-loss status, cause of loss, coverage, liability, or final repair costs -- these are determined only by a licensed auto damage appraiser and the carrier's total-loss evaluation process. Frame PDR/repair/replacement language as preliminary and subject to confirmation (e.g. "may be a PDR candidate, subject to in-person confirmation" rather than "is repairable").
- Do NOT include any dollar figures, cost ranges, or cost estimates anywhere in this document -- cost estimation is explicitly out of scope and is handled by a separate repair-estimate process.
- Only describe panels/conditions actually reported or visible in the provided details/photos. Do not invent damage, parts, or panels not supported by the inputs.`;

const buildVehicleNarrativePrompt = (reportData, imageAnalysis) => {
  const {
    claimNumber,
    insuredName,
    propertyAddress,
    lossDate,
    lossType,
    policyNumber,
    vin,
    vehicleMakeModelYear,
    odometer,
    licensePlate,
    vehicleColor,
    propertyDetails,
    lossDescription,
    damagesObserved,
    recommendations,
    additionalNotes,
  } = reportData;
  const imageSection = imageAnalysis
    ? `\n\nIMAGE ANALYSIS RESULTS (per-photo, reviewed):\n${JSON.stringify(imageAnalysis, null, 2)}`
    : '';

  return `You are assisting a licensed insurance adjuster by drafting the narrative sections of a Vehicle Damage Inspection Report for their review, editing, and approval. You are NOT the adjuster and you do NOT make final determinations.

${VEHICLE_LANGUAGE_RULES}

CLAIM DETAILS:
- Claim Number: ${claimNumber}
- Insured: ${insuredName}
- Inspection Location: ${propertyAddress}
- Date of Loss: ${lossDate}
- Loss Type: ${lossType}
- Policy Number: ${policyNumber || 'Not provided'}
- Vehicle (Year/Make/Model): ${vehicleMakeModelYear || 'Not provided'}
- VIN: ${vin || 'Not provided'}
- License Plate: ${licensePlate || 'Not provided'}
- Vehicle Color: ${vehicleColor || 'Not provided'}
- Odometer at Inspection: ${odometer || 'Not provided'}
- Vehicle Condition Notes (provided by adjuster): ${propertyDetails || 'None provided'}
- Loss Description (provided by adjuster): ${lossDescription || 'None provided'}
- Damages Observed (provided by adjuster): ${damagesObserved || 'None provided'}
- Adjuster Recommendations: ${recommendations || 'None provided'}
- Additional Notes: ${additionalNotes || 'None provided'}${imageSection}

Return ONLY a JSON object with exactly these 4 keys, each a string, no other text/preamble/code fence:
{
  "lossSummary": "A paragraph summarizing the reported loss (date, loss type, how/where it reportedly occurred per the adjuster's description), explicitly framed as reported and unverified where it relies on the insured's/adjuster's account rather than the photos.",
  "repairabilityNotes": "A markdown bullet list (lines starting with '- ') of preliminary, panel-referenced repairability notes drawn from the per-photo observations above (e.g. noting a panel may be a PDR candidate, or that a component's damage typically requires replacement) -- every note must be qualified as preliminary/subject to confirmation by a licensed auto damage appraiser or applicable technician, and must NOT include dollar figures.",
  "recommendations": "A markdown bullet list (lines starting with '- ') of recommended next steps for the adjuster (e.g. obtain a complete photo set of undocumented panels, route specific panels to a PDR-certified shop or glass technician for confirmation, confirm ADAS recalibration needs if applicable), incorporating any adjuster-provided recommendations above.",
  "conclusion": "A closing paragraph noting this is a preliminary draft for licensed-adjuster review, summarizing what remains to be confirmed, and explicitly stating that repairability, total-loss status, coverage, and final repair costs are outside the scope of this draft. Leave the sign-off to the reviewing adjuster; do not write a certification on their behalf."
}`;
};

const parseVehicleNarrative = (text) => {
  try {
    const jsonMatch = String(text || '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const parsed = JSON.parse(jsonMatch[0]);
    const out = {};
    for (const key of VEHICLE_NARRATIVE_KEYS) {
      if (typeof parsed[key] === 'string' && parsed[key].trim()) out[key] = parsed[key].trim();
    }
    return out;
  } catch {
    return {};
  }
};

const VEHICLE_KEY_LABELS = {
  lossSummary: 'Loss Summary — Reported (Unverified)',
  repairabilityNotes: 'Repairability Assessment — Preliminary (markdown bullet list)',
  recommendations: 'Recommendations (markdown bullet list)',
  conclusion: 'Conclusion',
};

// One repair retry, scoped to just the missing key -- mirrors the
// Liability/Commercial/Flood/Theft pattern above.
const repairVehicleNarrativeKey = async (key, reportData, imageAnalysis, generateFn) => {
  const prompt = `You are assisting a licensed adjuster with a Vehicle Damage Inspection Report draft. Generate ONLY the "${VEHICLE_KEY_LABELS[key]}" section for this claim.

${VEHICLE_LANGUAGE_RULES}

Claim Number: ${reportData.claimNumber}
Insured: ${reportData.insuredName}
Vehicle (Year/Make/Model): ${reportData.vehicleMakeModelYear || 'Not provided'}
Date of Loss: ${reportData.lossDate}
Loss Type: ${reportData.lossType}
${reportData.lossDescription ? `Loss Description: ${reportData.lossDescription}` : ''}
${reportData.damagesObserved ? `Damages Observed: ${reportData.damagesObserved}` : ''}
${imageAnalysis ? `Image Analysis: ${JSON.stringify(imageAnalysis)}` : ''}

Return ONLY the section text (plain prose, or a markdown bullet list if this section is a list) -- no heading, no preamble, no JSON, no code fence.`;
  try {
    const { text } = await generateFn(prompt, { maxTokens: 700, temperature: 0.3 });
    const stripped = stripCodeFence(text);
    return stripped || null;
  } catch (err) {
    console.warn(`Vehicle narrative repair failed for "${key}":`, err.message);
    return null;
  }
};

// Deterministic -- groups each reviewed photo's panel tag + observation into
// a per-panel bullet list, and lists any VEHICLE_PANELS entries no photo was
// tagged with, exactly mirroring the sample report's Section 4 structure.
// Never AI-authored, so it can never drift into stating a repairability/
// total-loss conclusion (that risk is confined to repairabilityNotes above,
// which is explicitly qualified language).
const buildVehiclePanelSection = (imageAnalysis) => {
  const damages = imageAnalysis?.damages || [];
  if (!damages.length) return '_No panel-tagged photo observations are available for this draft._';

  const byPanel = new Map();
  for (const d of damages) {
    const panel = (d.area || 'Other/Unspecified').trim() || 'Other/Unspecified';
    if (!byPanel.has(panel)) byPanel.set(panel, []);
    if (d.description) byPanel.get(panel).push(d.description);
  }
  const lines = [...byPanel.entries()].map(
    ([panel, observations]) => `- **${panel}:** ${observations.join(' ') || 'Visible condition noted; see photo documentation.'}`
  );
  const documented = new Set(byPanel.keys());
  const undocumented = VEHICLE_PANELS.filter((p) => p !== 'Other/Unspecified' && !documented.has(p));
  if (undocumented.length) {
    lines.push(
      `- **Not yet documented:** ${undocumented.join(', ')} — not included in this draft's photo set; additional photos are recommended before finalizing scope.`
    );
  }
  return lines.join('\n');
};

const buildVehicleStaticSections = (reportData) => {
  const {
    claimNumber,
    insuredName,
    insuredEmail,
    policyNumber,
    insuranceCompany,
    propertyAddress,
    lossDate,
    lossType,
    reportType,
    vin,
    vehicleMakeModelYear,
    odometer,
    licensePlate,
    vehicleColor,
  } = reportData;
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const insuredInfo = `## SECTION 1: INSURED & POLICY INFORMATION
| Field | Value |
|-------|-------|
| Claim Number | ${claimNumber} |
| Named Insured | ${insuredName} |
| Insured Contact | ${insuredEmail || 'Not provided'} |
| Insurance Company | ${insuranceCompany || 'Not provided'} |
| Policy Number | ${policyNumber || 'Not provided'} |`;

  const vehicleInfo = `## SECTION 2: VEHICLE INFORMATION
| Field | Value |
|-------|-------|
| Vehicle (Year/Make/Model) | ${vehicleMakeModelYear || 'Not provided'} |
| VIN | ${vin || 'Not provided'} |
| License Plate | ${licensePlate || 'Not provided'} |
| Color | ${vehicleColor || 'Not provided'} |
| Odometer at Inspection | ${odometer || 'Not provided'} |
| Inspection Location | ${propertyAddress || 'Not provided'} |`;

  const lossInfo = `## SECTION 3: LOSS INFORMATION
| Field | Value |
|-------|-------|
| Date of Loss | ${lossDate} |
| Loss Type | ${lossType} |
| Report Type | ${reportType || 'Initial Inspection'} |
| Report Date | ${reportDate} |`;

  const checklist = `## SECTION 6: ADJUSTER REVIEW CHECKLIST
- [ ] Obtain a complete photo set of any panels listed as "not yet documented" in Section 4
- [ ] Route panels noted as possible PDR/replacement candidates to a certified body shop or auto glass technician for confirmation
- [ ] Confirm ADAS (driver-assistance camera/sensor) recalibration requirements where applicable
- [ ] Obtain a licensed appraiser's repair estimate using current local labor/parts pricing -- NOT provided by this draft
- [ ] Evaluate total-loss threshold once a full estimate is complete -- NOT determined by this draft
- [ ] Coverage determination under the policy -- NOT determined by this draft`;

  return { insuredInfo, vehicleInfo, lossInfo, checklist };
};

// Deterministic assembler -- stitches static + parsed narrative + the
// deterministic panel-damage section into final markdown in manifest order,
// then hands off to the existing generic PDF/DOCX renderers unchanged.
const assembleVehicleReport = (staticSections, narrative, imageAnalysis, photoCount) => {
  const photoSection =
    photoCount === 0
      ? `**${NO_PHOTO_DISCLAIMER}**`
      : buildPhotoObservationsSection(imageAnalysis) ||
        'Photos were provided; see per-photo observations in the report photo library.';

  return `# VEHICLE DAMAGE INSPECTION REPORT

> Prepared with the FLACRON ENGINE for review and approval by a licensed insurance adjuster. This is an AI-drafted inspection document for a vehicle damage claim. It documents visible panel conditions only, based on the photos provided. This draft does not determine repairability, total-loss status, coverage, or final repair costs -- those determinations are made by a licensed auto damage appraiser and the carrier's total-loss evaluation process.

${staticSections.insuredInfo}

${staticSections.vehicleInfo}

${staticSections.lossInfo}

## SECTION 4: PANEL-BY-PANEL DAMAGE ASSESSMENT
${buildVehiclePanelSection(imageAnalysis)}

This is a partial panel assessment based on the photos provided and their reviewed panel tags. A complete vehicle inspection typically covers all exterior panels, the roof, and glass.

## SECTION 5: LOSS SUMMARY — REPORTED (UNVERIFIED)
${narrative.lossSummary}

## SECTION 5B: REPAIRABILITY ASSESSMENT — PRELIMINARY
${narrative.repairabilityNotes}

Repairability determinations require an in-person or high-resolution photo appraisal by a licensed auto damage appraiser. This section is a drafting aid, not a final determination.

${staticSections.checklist}

## SECTION 7: RECOMMENDATIONS
${narrative.recommendations}

## SECTION 8: CONCLUSION
${narrative.conclusion}

## SECTION 9: PHOTO DOCUMENTATION
${photoSection}

---
*Automated draft prepared by FlacronAI for licensed-adjuster review | ${new Date().toISOString()}*`;
};

// `generateFn` is test-only dependency injection, mirrors generateTheftReport.
const generateVehicleReport = async (
  reportData,
  imageAnalysis,
  photoCount = 0,
  { generateFn = generateWithFallback } = {}
) => {
  const prompt = buildVehicleNarrativePrompt(reportData, imageAnalysis);

  console.log('🤖 Generating Vehicle Damage Inspection Report narrative (single structured call)...');
  let text, modelUsed;
  try {
    ({ text, modelUsed } = await generateFn(prompt, { maxTokens: 4096, temperature: 0.4 }));
  } catch (err) {
    console.error(
      'Vehicle report generation providers unavailable (Claude + watsonx both failed):',
      err.message
    );
    throw new Error('Report generation is temporarily unavailable. Please try again shortly.', {
      cause: err,
    });
  }
  console.log(`✅ Vehicle narrative generated via ${modelUsed}`);

  const narrative = parseVehicleNarrative(text);

  // One repair retry per missing/malformed key -- never ship a blank section.
  for (const key of VEHICLE_NARRATIVE_KEYS) {
    if (narrative[key]) continue;
    console.log(`⚠️  Vehicle narrative missing "${key}" — repairing...`);
    const repaired = await repairVehicleNarrativeKey(key, reportData, imageAnalysis, generateFn);
    if (repaired) narrative[key] = repaired;
  }
  const stillMissing = VEHICLE_NARRATIVE_KEYS.filter((k) => !narrative[k]);
  if (stillMissing.length > 0) {
    throw new Error(
      `Vehicle report generation failed to produce: ${stillMissing.join(', ')}. Please try again.`
    );
  }

  const staticSections = buildVehicleStaticSections(reportData);
  const content = assembleVehicleReport(staticSections, narrative, imageAnalysis, photoCount);

  return { content, modelUsed };
};

// ── Phase 36: Mold Assessment (Supplemental) Report ─────────────────────────
// Keyed off `documentType === 'MoldSupplement'`, checked BEFORE the
// lossType/claimType checks below since it is an orthogonal document-type
// flag, not a loss-type/claim-type template -- a supplement is generated
// from an ALREADY-EXISTING report (see reports.js POST /:id/mold-supplement),
// reusing that report's claim/insured/property/reviewed-photo data rather
// than being entered fresh. Smallest AI narrative surface of any document
// type: exactly 2 slots (Visual Observations, Recommended Next Steps). The
// "NOT a certified mold assessment" scope notice is fixed, deterministic
// code -- never AI-generated -- and forbids species identification, air
// quality/health-risk conclusions, remediation protocols, coverage,
// liability, and cost determinations (Golden Rule #2).
const MOLD_NARRATIVE_KEYS = ['visualObservations', 'recommendedNextSteps'];

// Fixed, deterministic wording (never AI-generated, never paraphrased) --
// exported so its exact-match test can assert it appears verbatim in every
// generated Mold supplement regardless of what the AI narrative says.
const MOLD_SCOPE_NOTICE = `## SECTION 4: IMPORTANT NOTICE — SCOPE OF THIS REPORT

**This is a preliminary AI-drafted visual observation. It is NOT a certified mold assessment.** It is intended to flag the need for professional evaluation and to help the adjuster route the claim appropriately. It does NOT include:

- Species identification (e.g., Stachybotrys, Aspergillus, Penicillium) — visual appearance alone cannot determine mold species.
- Air quality or surface sampling results, or any determination of health risk or habitability.
- A certified remediation protocol or clearance testing plan.
- Any determination of coverage, liability, or repair/remediation cost.

These determinations require a certified mold assessor licensed in the applicable jurisdiction, and/or the reviewing adjuster and carrier. This report's role is limited to flagging visible conditions for professional follow-up.`;

const MOLD_AI_DISCLOSURE =
  "AI DISCLOSURE: This report was generated by the Flacron Engine, FlacronAI's automated drafting engine. It is a preliminary visual observation, not a certified mold assessment. Every AI-drafted observation in this document is subject to review by a licensed adjuster and a certified mold assessor before any remediation is authorized.";

const MOLD_LANGUAGE_RULES = `CRITICAL LANGUAGE & SCOPE RULES (follow in every section):
- Use cautious, observational language: "appears", "may indicate", "is consistent with", "the adjuster should verify", "subject to confirmation". Never state conclusions as established fact.
- NEVER identify or suggest a mold species (e.g. Stachybotrys, Aspergillus, Penicillium) -- visual appearance alone cannot determine species; that requires a certified mold assessor.
- NEVER state or imply a health risk, habitability determination, or air quality/surface sampling result.
- NEVER propose a certified remediation protocol or clearance testing plan -- only flag the need for a certified mold assessor's involvement.
- Do NOT make a determination of coverage, liability, or any repair/remediation cost -- these are outside the scope of this draft.
- Scope is limited to visible surface conditions (e.g. discoloration, staining, visible growth pattern) and general observations (e.g. moisture readings, HVAC involvement) reported or visible in the provided details/photos. Do not invent facts not supported by the inputs.`;

const buildMoldNarrativePrompt = (reportData, imageAnalysis) => {
  const {
    claimNumber,
    relatedClaimId,
    insuredName,
    propertyAddress,
    dateOfDiscovery,
    lossDescription,
    damagesObserved,
    additionalNotes,
  } = reportData;
  const imageSection = imageAnalysis
    ? `\n\nIMAGE ANALYSIS RESULTS:\n${JSON.stringify(imageAnalysis, null, 2)}`
    : '';

  return `You are assisting a licensed insurance adjuster by drafting the narrative sections of a Mold Assessment — Preliminary Report for their review, editing, and approval. You are NOT the adjuster and you are NOT a certified mold assessor. You do NOT make final determinations.

${MOLD_LANGUAGE_RULES}

CLAIM DETAILS:
- Claim Number (this supplement): ${claimNumber}
- Related Claim: ${relatedClaimId || 'Not provided'}
- Insured: ${insuredName}
- Property Address: ${propertyAddress}
- Date of Discovery: ${dateOfDiscovery}
- Related Claim Context (provided by adjuster): ${lossDescription || 'None provided'}
- Damages Previously Observed (provided by adjuster): ${damagesObserved || 'None provided'}
- Additional Notes: ${additionalNotes || 'None provided'}${imageSection}

Return ONLY a JSON object with exactly these 2 keys, each a string, no other text/preamble/code fence:
{
  "visualObservations": "A markdown bullet list (lines starting with '- ') of visible-condition observations only (e.g. discoloration/staining/growth pattern on a surface, elevated moisture reading, HVAC involvement), drawing on the image analysis if provided. Each item must use cautious language and end with an explicit note that species identification and air quality testing require a certified mold assessor, not this report. Never identify a species, never state a health risk, never state a certified finding.",
  "recommendedNextSteps": "A markdown bullet list (lines starting with '- ') of recommended precautionary next steps for the adjuster (e.g. engage a certified mold assessor, precautionary HVAC shutdown pending technician confirmation, do not disturb the area pending sampling, coordinate with the related claim). These are precautionary AI-drafted suggestions, not a certified remediation protocol -- never include a remediation scope, cost figure, or coverage/liability statement."
}`;
};

const parseMoldNarrative = (text) => {
  try {
    const jsonMatch = String(text || '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const parsed = JSON.parse(jsonMatch[0]);
    const out = {};
    for (const key of MOLD_NARRATIVE_KEYS) {
      if (typeof parsed[key] === 'string' && parsed[key].trim()) out[key] = parsed[key].trim();
    }
    return out;
  } catch {
    return {};
  }
};

const MOLD_KEY_LABELS = {
  visualObservations: 'Visual Observations (markdown bullet list)',
  recommendedNextSteps: 'Recommended Next Steps (markdown bullet list)',
};

// One repair retry, scoped to just the missing key -- mirrors the
// Liability/Commercial/Flood/Theft/Vehicle pattern above.
const repairMoldNarrativeKey = async (key, reportData, imageAnalysis, generateFn) => {
  const prompt = `You are assisting a licensed adjuster with a Mold Assessment — Preliminary Report draft. Generate ONLY the "${MOLD_KEY_LABELS[key]}" section for this claim.

${MOLD_LANGUAGE_RULES}

Claim Number (this supplement): ${reportData.claimNumber}
Related Claim: ${reportData.relatedClaimId || 'Not provided'}
Insured: ${reportData.insuredName}
Property Address: ${reportData.propertyAddress}
Date of Discovery: ${reportData.dateOfDiscovery}
${reportData.damagesObserved ? `Damages Previously Observed: ${reportData.damagesObserved}` : ''}
${imageAnalysis ? `Image Analysis: ${JSON.stringify(imageAnalysis)}` : ''}

Return ONLY the section text (a markdown bullet list, lines starting with '- ') -- no heading, no preamble, no JSON, no code fence.`;
  try {
    const { text } = await generateFn(prompt, { maxTokens: 500, temperature: 0.3 });
    const stripped = stripCodeFence(text);
    return stripped || null;
  } catch (err) {
    console.warn(`Mold narrative repair failed for "${key}":`, err.message);
    return null;
  }
};

// Zero-AI, deterministic -- renders exactly right every time from the
// supplement's own fields (which are themselves copied from the linked
// report at creation time, see reports.js).
const buildMoldStaticSections = (reportData) => {
  const {
    claimNumber,
    relatedClaimId,
    insuredName,
    insuredEmail,
    propertyAddress,
    dateOfDiscovery,
    policyNumber,
  } = reportData;
  const relatedClaim = relatedClaimId || 'Not provided';
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const reportInfo = `## SECTION 1: REPORT INFORMATION
| Field | Value |
|-------|-------|
| Claim Number | ${claimNumber} |
| Related Claim | ${relatedClaim} |
| Named Insured | ${insuredName} |
| Property Address | ${propertyAddress} |
| Date of Discovery | ${dateOfDiscovery} |
| Report Type | Preliminary Visual Assessment — AI-assisted draft |
| Report Date | ${reportDate} |`;

  const insuredInfo = `## SECTION 2: INSURED INFORMATION
| Field | Value |
|-------|-------|
| Named Insured | ${insuredName} |
| Insured Contact | ${insuredEmail || 'Not provided'} |
| Policy Number | ${policyNumber || 'Not provided'} |`;

  const background = `## SECTION 3: BACKGROUND — RELATED CLAIM
This preliminary mold observation was filed as a supplement to claim ${relatedClaim}. During a follow-up visit on ${dateOfDiscovery}, visible conditions consistent with mold were reported at the property.

_This report should be read alongside the related claim's original inspection report. It does not repeat that report's findings._`;

  const checklist = `## SECTION 7: ADJUSTER REVIEW CHECKLIST
- [ ] Engage a certified mold assessor
- [ ] Confirm HVAC technician evaluation before system operation resumes, if applicable
- [ ] Confirm applicable mold coverage / exclusions under the policy
- [ ] Coordinate remediation timing with the related claim (${relatedClaim})
- [ ] Coverage determination under the policy -- NOT determined by this draft`;

  return { reportInfo, insuredInfo, background, checklist };
};

// Deterministic assembler -- stitches static + parsed narrative sections into
// final markdown in manifest order, then hands off to the existing generic
// PDF/DOCX renderers unchanged. The scope-notice section is inserted here as
// the fixed MOLD_SCOPE_NOTICE constant, never passed through the AI.
const assembleMoldReport = (staticSections, narrative, imageAnalysis, photoCount) => {
  const photoSection =
    photoCount === 0
      ? `**${NO_PHOTO_DISCLAIMER}**`
      : buildPhotoObservationsSection(imageAnalysis) ||
        'Photos were provided; see per-photo observations in the report photo library.';

  return `# MOLD ASSESSMENT — PRELIMINARY REPORT

> DRAFT — PENDING ADJUSTER & ASSESSOR REVIEW. Prepared with the FLACRON ENGINE for review and approval by a licensed insurance adjuster. AI-drafted observations only — not a certified mold assessment.

${staticSections.reportInfo}

${staticSections.insuredInfo}

${staticSections.background}

${MOLD_SCOPE_NOTICE}

## SECTION 5: VISUAL OBSERVATIONS
${narrative.visualObservations}

## SECTION 6: RECOMMENDED NEXT STEPS
${narrative.recommendedNextSteps}

${staticSections.checklist}

## SECTION 8: CONCLUSION & ADJUSTER NOTES
This preliminary draft flags visible conditions consistent with mold for professional follow-up. It is not a certified assessment and makes no determination of species, health risk, or remediation scope. A certified mold assessor's findings should supersede this draft before any remediation is authorized.

${MOLD_AI_DISCLOSURE}

## SECTION 9: PHOTO DOCUMENTATION
${photoSection}

---
*Automated draft prepared by FlacronAI for licensed-adjuster review | ${new Date().toISOString()}*`;
};

// `generateFn` is test-only dependency injection, mirrors generateTheftReport.
const generateMoldReport = async (
  reportData,
  imageAnalysis,
  photoCount = 0,
  { generateFn = generateWithFallback } = {}
) => {
  const prompt = buildMoldNarrativePrompt(reportData, imageAnalysis);

  console.log('🤖 Generating Mold Assessment Supplemental Report narrative (single structured call)...');
  let text, modelUsed;
  try {
    ({ text, modelUsed } = await generateFn(prompt, { maxTokens: 2048, temperature: 0.4 }));
  } catch (err) {
    console.error(
      'Mold report generation providers unavailable (Claude + watsonx both failed):',
      err.message
    );
    throw new Error('Report generation is temporarily unavailable. Please try again shortly.', {
      cause: err,
    });
  }
  console.log(`✅ Mold narrative generated via ${modelUsed}`);

  const narrative = parseMoldNarrative(text);

  // One repair retry per missing/malformed key -- never ship a blank section.
  for (const key of MOLD_NARRATIVE_KEYS) {
    if (narrative[key]) continue;
    console.log(`⚠️  Mold narrative missing "${key}" — repairing...`);
    const repaired = await repairMoldNarrativeKey(key, reportData, imageAnalysis, generateFn);
    if (repaired) narrative[key] = repaired;
  }
  const stillMissing = MOLD_NARRATIVE_KEYS.filter((k) => !narrative[k]);
  if (stillMissing.length > 0) {
    throw new Error(
      `Mold report generation failed to produce: ${stillMissing.join(', ')}. Please try again.`
    );
  }

  const staticSections = buildMoldStaticSections(reportData);
  const content = assembleMoldReport(staticSections, narrative, imageAnalysis, photoCount);

  return { content, modelUsed };
};

const generateReport = async (
  reportData,
  imageAnalysis,
  photoCount = 0,
  { generateFn } = {}
) => {
  // Phase 36: a Mold supplement is keyed off `documentType`, not
  // lossType/claimType -- it's generated from an already-existing report,
  // not a primary wizard entry point, so it's checked first and takes
  // precedence over every claimType/lossType template below.
  if (reportData.documentType === 'MoldSupplement') {
    return generateMoldReport(reportData, imageAnalysis, photoCount, { generateFn });
  }
  // Phase 33: a Flood lossType takes precedence over any claimType template
  // (approved client decision, PHASES.md Phase 33) -- e.g. a Commercial claim
  // with a Flood loss type still gets the NFIP-specific structure, with
  // applicable commercial-property fields folded into its static section.
  // Checked BEFORE the claimType checks below for that reason.
  if (reportData.lossType === 'Flood') {
    return generateFloodReport(reportData, imageAnalysis, photoCount, { generateFn });
  }
  // Phase 34: a Theft lossType takes precedence over any claimType template,
  // same precedence rule as Phase 33's Flood manifest above.
  if (reportData.lossType === 'Theft') {
    return generateTheftReport(reportData, imageAnalysis, photoCount, { generateFn });
  }
  // Phase 31: Liability claims get a distinct, sample-matched document
  // structure instead of the generic freeform template below. Auto-selected
  // by `claimType`, not a manual document-type picker.
  if (reportData.claimType === 'Liability') {
    return generateLiabilityReport(reportData, imageAnalysis, photoCount, { generateFn });
  }
  // Phase 32: Commercial claims get the same treatment, reusing Phase 31's
  // static+single-structured-call architecture.
  if (reportData.claimType === 'Commercial') {
    return generateCommercialReport(reportData, imageAnalysis, photoCount, { generateFn });
  }
  // Phase 35: Auto claims get a distinct Vehicle Damage Inspection Report
  // structure, same precedence position as Liability/Commercial above (only
  // reached when lossType isn't Flood/Theft).
  if (reportData.claimType === 'Auto') {
    return generateVehicleReport(reportData, imageAnalysis, photoCount, { generateFn });
  }

  const prompt = buildReportPrompt(reportData, imageAnalysis);

  console.log('🤖 Generating report (Claude primary, watsonx fallback)...');
  let content, modelUsed;
  try {
    ({ text: content, modelUsed } = await generateWithFallback(prompt, {
      maxTokens: 8192,
      temperature: 0.5,
    }));
  } catch (err) {
    console.error(
      'Report generation providers unavailable (Claude + watsonx both failed):',
      err.message
    );
    throw new Error('Report generation is temporarily unavailable. Please try again shortly.', {
      cause: err,
    });
  }
  console.log(`✅ Report generated via ${modelUsed}`);

  // Ensure Section 7 cost table and Section 9 conclusion are complete — patch
  // either if the main generation call ran short.
  content = await ensureLossSummary(reportData, content);
  content = await ensureConclusion(reportData, content);

  if (photoCount === 0) {
    content = insertNoPhotoDisclaimer(content);
  } else {
    content = insertPhotoObservations(content, imageAnalysis);
  }

  return { content, modelUsed };
};

// Photo-set analysis is split into fixed-size batches and processed with a small
// concurrency cap instead of one giant request. This is what lets ALL uploaded
// photos (up to the caller's own cap, e.g. 100) get analyzed instead of only the
// first 10. Batches are also individually retried on failure and can report
// progress incrementally via `onBatchComplete` (Phase 7: the actual
// request/response cycle this runs inside is no longer synchronous -- see
// backend/services/photoJobService.js, which drives this from a background
// pipeline instead of awaiting it inline in the route handler).
const VISION_BATCH_SIZE = 10; // proven-safe per-call size from the original implementation
const VISION_BATCH_CONCURRENCY = 3; // keeps a handful of batches in flight without hammering rate limits
const VISION_BATCH_TIMEOUT_MS = 90_000; // hard per-batch timeout so one hung call can't stall the rest
const MAX_BATCH_ATTEMPTS = 3; // Phase 7 addendum (spec §47): retry a failed batch before giving up on it

const SEVERITY_RANK = { Unknown: -1, Minor: 0, Moderate: 1, Severe: 2 };
const higherSeverity = (a, b) =>
  (SEVERITY_RANK[a] ?? -1) >= (SEVERITY_RANK[b] ?? -1) ? a || 'Unknown' : b || 'Unknown';

// Normalizes one multer-shaped image into an Anthropic vision content block.
// Returns null for anything unusable (unsupported type or unreadable buffer) so
// the caller can count it as skipped rather than silently vanishing.
const toImageBlock = (img) => {
  if (!img || !img.buffer) return null;
  try {
    let mediaType = String(img.mimetype || '')
      .toLowerCase()
      .replace('image/', '');
    if (mediaType === 'jpg') mediaType = 'jpeg';
    if (!CLAUDE_IMAGE_TYPES.has(mediaType)) {
      console.warn(`Skipping image: ${mediaType || 'unknown type'} not supported by Claude vision`);
      return null;
    }
    const base64 = Buffer.from(img.buffer).toString('base64');
    return {
      type: 'image',
      source: { type: 'base64', media_type: `image/${mediaType}`, data: base64 },
    };
  } catch (err) {
    console.warn('Could not read image buffer:', err.message);
    return null;
  }
};

// Phase 8: requests ONE structured result per photo (in submission order)
// instead of a single whole-batch summary, so each photo gets its own
// reviewable location/category/severity/observation/confidence -- the raw
// input to the per-photo review UI and, once a human has reviewed it, to
// report generation (see buildEffectiveImageAnalysis below).
const buildBatchPrompt = (
  count,
  batchIndex,
  batchCount,
  total,
  locationOptions = PHOTO_LOCATIONS
) => `You are an expert insurance damage assessor reviewing photos for a draft report that a licensed adjuster will review. Describe only what is visible; use cautious language ("appears", "may indicate") and defer final determinations to the adjuster. These ${count} photo(s) are batch ${batchIndex + 1} of ${batchCount} from a ${total}-photo inspection set.

Analyze EACH of the ${count} photo(s) in this batch INDIVIDUALLY, in the exact order they were provided, and classify each with:
- location: the apparent area/panel shown -- choose the closest match from: ${locationOptions.join(', ')} (use "Other/Unspecified" if unclear)
- category: the apparent primary observation category -- choose the closest match from: ${PHOTO_CATEGORIES.join(', ')}
- severity: apparent severity of what's visible in THIS photo (Minor/Moderate/Severe/Unknown)
- observation: a 1-3 sentence cautious, observational description of what appears visible in THIS photo only (e.g. "Water staining appears present on...") -- never state a conclusion
- confidence: your confidence in this photo's classification (Low/Medium/High)

Also provide, for the batch as a whole:
- summary: a brief assessment summary for these photos
- itemsForProfessionalReview: conditions a professional should evaluate further (structural, safety, mold, etc.)
- documentationNotes: a brief photo-quality/documentation assessment for these photos

Return ONLY JSON with this EXACT structure -- "photos" must contain exactly ${count} entries, one per photo, in order:
{
  "summary": "Assessment summary for these photos",
  "itemsForProfessionalReview": ["List of conditions a professional should confirm"],
  "documentationNotes": "Photo quality assessment",
  "photos": [
    { "location": "Interior - Kitchen", "category": "Water Damage", "severity": "Moderate", "observation": "Water staining appears present on the lower cabinet panels and adjacent flooring.", "confidence": "High" }
  ]
}`;

const VALID_SEVERITIES = new Set(['Minor', 'Moderate', 'Severe']);
const VALID_CONFIDENCE = new Set(['Low', 'Medium', 'High']);

// A defensible placeholder for a photo the model failed to classify (either
// it returned too few entries, or the whole response didn't parse) -- keeps
// a 1:1 correspondence between "photos" entries and actual images in the
// batch, which photoJobService relies on to attribute each entry to the
// right photoId by array position. Never silently drops or duplicates a photo.
const fallbackPhotoEntry = () => ({
  location: 'Other/Unspecified',
  category: 'Other',
  severity: 'Unknown',
  observation: 'Automated analysis could not classify this photo -- manual review recommended.',
  confidence: 'Low',
});

const normalizePhotoEntries = (photos, expectedCount) => {
  const list = Array.isArray(photos) ? photos.slice(0, expectedCount) : [];
  while (list.length < expectedCount) list.push(fallbackPhotoEntry());
  return list.map((p) => ({
    location:
      typeof p?.location === 'string' && p.location.trim()
        ? p.location.trim().slice(0, 100)
        : 'Other/Unspecified',
    category:
      typeof p?.category === 'string' && p.category.trim()
        ? p.category.trim().slice(0, 100)
        : 'Other',
    severity: VALID_SEVERITIES.has(p?.severity) ? p.severity : 'Unknown',
    observation:
      typeof p?.observation === 'string' && p.observation.trim()
        ? p.observation.trim().slice(0, 2000)
        : 'No observation provided.',
    confidence: VALID_CONFIDENCE.has(p?.confidence) ? p.confidence : 'Low',
  }));
};

const parseBatchResult = (content, fallbackCount) => {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        itemsForProfessionalReview: Array.isArray(parsed.itemsForProfessionalReview)
          ? parsed.itemsForProfessionalReview
          : [],
        documentationNotes:
          typeof parsed.documentationNotes === 'string' ? parsed.documentationNotes : '',
        photos: normalizePhotoEntries(parsed.photos, fallbackCount),
      };
    }
  } catch {
    /* fall through to the text-only shape below */
  }
  return {
    summary: content,
    itemsForProfessionalReview: [],
    documentationNotes: '',
    photos: normalizePhotoEntries(null, fallbackCount),
  };
};

// Real network call for one batch. Swappable in tests via `callVisionApi` so the
// batching/aggregation logic can be exercised without hitting the Anthropic API.
const defaultCallVisionApi = (promptText, imageBlocks) =>
  anthropic.analyzeImages(promptText, imageBlocks, {
    maxTokens: 2000,
    timeout: VISION_BATCH_TIMEOUT_MS,
  });

// Never throws -- a failed/timed-out batch is retried internally up to
// MAX_BATCH_ATTEMPTS times (Phase 7 addendum, spec §47) before returning a
// failure marker, so the rest of the photo set can still be analyzed and the
// failure is reported accurately instead of being silently dropped, counted
// as analyzed, or given up on after a single transient blip.
const analyzeBatch = async (imageBlocks, { batchIndex, batchCount, total, callVisionApi, locationOptions }) => {
  const prompt = buildBatchPrompt(imageBlocks.length, batchIndex, batchCount, total, locationOptions);
  let lastError;
  for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt++) {
    try {
      const content = await callVisionApi(prompt, imageBlocks);
      return {
        ok: true,
        count: imageBlocks.length,
        result: parseBatchResult(content, imageBlocks.length),
        attempts: attempt,
      };
    } catch (err) {
      lastError = err;
      console.warn(
        `Vision batch ${batchIndex + 1}/${batchCount} attempt ${attempt}/${MAX_BATCH_ATTEMPTS} failed:`,
        err.message
      );
    }
  }
  return {
    ok: false,
    count: imageBlocks.length,
    error: lastError.message,
    attempts: MAX_BATCH_ATTEMPTS,
  };
};

// Simple wave-based concurrency limiter -- no new dependency, no queue infra.
// Batches are independent, so a slow/failed one never blocks the others.
// `onBatchDone(batchIndex, result)` (Phase 7), if provided, fires the moment
// each batch settles -- not after the whole set finishes -- so a caller can
// persist real incremental progress instead of one all-at-once jump at the end.
const runBatchesLimited = async (batches, concurrency, callVisionApi, onBatchDone) => {
  const results = new Array(batches.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(concurrency, batches.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < batches.length) {
      const i = next++;
      const result = await analyzeBatch(batches[i].blocks, {
        batchIndex: i,
        batchCount: batches.length,
        total: batches[i].total,
        callVisionApi,
        locationOptions: batches[i].locationOptions,
      });
      results[i] = result;
      if (onBatchDone) {
        try {
          await onBatchDone(i, result);
        } catch (hookErr) {
          // A progress-reporting failure must never abort the actual analysis.
          console.warn('onBatchDone hook failed (analysis continues):', hookErr.message);
        }
      }
    }
  });
  await Promise.all(workers);
  return results;
};

// `photos` (Phase 8) is the flat list of every succeeded batch's per-photo
// entries, in batch order -- the raw AI classification before any human
// review. `damages` is derived from it (one entry per photo) purely for
// backward-shape compatibility with anything still expecting the older
// "damages" list (e.g. the standalone POST /analyze-images endpoint, which
// has no persisted per-photo records to attach `photos` to individually).
const aggregateBatchResults = (batchResults, { skipped = 0 } = {}) => {
  const succeeded = batchResults.filter((b) => b.ok);
  const failed = batchResults.filter((b) => !b.ok);
  const analyzedCount = succeeded.reduce((sum, b) => sum + b.count, 0);
  const failedCount = failed.reduce((sum, b) => sum + b.count, 0);

  if (succeeded.length === 0) {
    const summary = batchResults.length
      ? `Image analysis failed for all ${failedCount} photo(s)${failed[0]?.error ? ` — ${failed[0].error}` : ''}`
      : skipped > 0
        ? `${skipped} image(s) were in an unsupported format and could not be analyzed`
        : 'No valid images provided for analysis';
    return {
      summary,
      severity: 'Unknown',
      totalImagesAnalyzed: 0,
      damages: [],
      photos: [],
      itemsForProfessionalReview: [],
      documentationNotes: '',
      imagesSkipped: skipped,
      imagesFailed: failedCount,
    };
  }

  const photos = succeeded.flatMap((b) => (Array.isArray(b.result.photos) ? b.result.photos : []));
  const damages = photos.map((p) => ({
    area: p.location,
    type: p.category,
    severity: p.severity,
    description: p.observation,
  }));
  const itemsForProfessionalReview = [
    ...new Set(
      succeeded.flatMap((b) =>
        Array.isArray(b.result.itemsForProfessionalReview)
          ? b.result.itemsForProfessionalReview
          : []
      )
    ),
  ];
  const severity = damages.reduce((acc, d) => higherSeverity(acc, d.severity), 'Unknown');
  const documentationNotes = succeeded
    .map((b) => b.result.documentationNotes)
    .filter(Boolean)
    .join(' ');
  const summaryParts = succeeded.map((b) => b.result.summary).filter(Boolean);
  let summary = summaryParts.length
    ? summaryParts.join(' ')
    : `Analyzed ${analyzedCount} photo(s).`;
  if (failedCount > 0 || skipped > 0) {
    const notes = [];
    if (failedCount > 0)
      notes.push(`${failedCount} photo(s) could not be analyzed due to an error`);
    if (skipped > 0) notes.push(`${skipped} photo(s) were in an unsupported format`);
    summary += ` (Note: ${notes.join('; ')}.)`;
  }

  return {
    summary,
    severity,
    totalImagesAnalyzed: analyzedCount,
    damages,
    photos,
    itemsForProfessionalReview,
    documentationNotes,
    imagesSkipped: skipped,
    imagesFailed: failedCount,
  };
};

// Phase 8 (Per-Photo Analysis Review UI): builds generateReport()'s
// `imageAnalysis` input from the report's own per-photo records -- each
// photo's HUMAN-REVIEWED state (approved/edited/pending all use the current
// observation text; excluded photos are dropped entirely) -- instead of the
// raw whole-batch AI output `aggregateBatchResults` produces. This is what
// Phase 8's task 4 requires: a report can be regenerated after a reviewer
// edits or excludes photos, and the new content reflects exactly that.
// `baseImageAnalysis` (typically the report's existing `imageAnalysis`)
// supplies the batch-level `summary`/`itemsForProfessionalReview`/
// `documentationNotes` context, which aren't tied to any one photo's review
// state and so aren't recomputed here -- only `damages`/`severity`/
// `totalImagesAnalyzed` are, since those must reflect the current review
// state exactly. Pure function -- no I/O, fully unit-testable.
const buildEffectiveImageAnalysis = (baseImageAnalysis, photos = []) => {
  const active = (photos || []).filter((p) => p.analysis && p.review?.status !== 'excluded');
  const damages = active.map((p) => {
    const hasEdit =
      p.review?.status === 'edited' &&
      typeof p.review.observation === 'string' &&
      p.review.observation.trim();
    const observation = hasEdit ? p.review.observation.trim() : p.analysis.observation;
    // Phase 35: a human-assigned panel/area tag (photos[].roomOrArea, set via
    // the PhotoReview "Room / Area"/"Vehicle Panel" control) takes precedence
    // over the AI's own guess -- this is what makes a reviewer's panel
    // correction actually reach report generation/regeneration and exports,
    // not just the photo library display it was originally scoped to.
    const area = (typeof p.roomOrArea === 'string' && p.roomOrArea.trim()) || p.analysis.location;
    return {
      area,
      type: p.analysis.category,
      severity: p.analysis.severity,
      description: observation,
    };
  });
  const severity = damages.reduce((acc, d) => higherSeverity(acc, d.severity), 'Unknown');
  const excludedByReviewer = (photos || []).filter((p) => p.review?.status === 'excluded').length;
  // Drop the raw per-batch `photos` list from the base (if present) -- it's
  // the pre-review AI output and would otherwise sit alongside `damages`
  // (the reviewed, authoritative version) in the same object, duplicating
  // information and wasting prompt tokens.
  const { photos: _rawPhotos, ...baseRest } = baseImageAnalysis || {};
  return {
    ...baseRest,
    damages,
    severity,
    totalImagesAnalyzed: active.length,
    excludedByReviewer,
  };
};

// `images` is an array of { buffer, mimetype, photoId? } (buffers are held in
// memory at upload time — no disk reads). `photoId` (Phase 7) is optional and
// purely for progress attribution -- passing it lets `onBatchComplete` report
// exactly which photos a given batch covered; omitting it (existing callers)
// changes nothing else about how analysis runs. Analyzes ALL provided images
// (batched, up to whatever the caller's own upload cap is -- e.g. 100), not
// just the first 10.
// `callVisionApi` is test-only dependency injection; production callers never
// pass it. `onBatchComplete(photoIds, result)` (Phase 7), if provided, fires
// once per batch as it completes -- `photoIds` is the list of photoIds (or
// blocks' array indices, if IDs weren't supplied) covered by that batch, and
// `result` is that batch's own `{ok, count, result|error, attempts}`.
// `claimType` (Phase 35), if 'Auto', switches the vision model's per-photo
// `location` classification from the property PHOTO_LOCATIONS taxonomy to
// VEHICLE_PANELS -- every other claimType/lossType is unaffected.
const analyzeImages = async (images, { callVisionApi, onBatchComplete, claimType } = {}) => {
  const locationOptions = claimType === 'Auto' ? VEHICLE_PANELS : PHOTO_LOCATIONS;
  const usingRealClient = !callVisionApi;
  if (usingRealClient && !anthropic.getClient()) {
    // watsonx (granite) has no vision capability, so there is no image-analysis
    // fallback — degrade gracefully rather than blocking report generation.
    return {
      summary: 'Image analysis unavailable — ANTHROPIC_API_KEY not configured',
      damages: [],
      severity: 'Unknown',
      totalImagesAnalyzed: 0,
      imagesSkipped: 0,
      imagesFailed: 0,
    };
  }

  const call = callVisionApi || defaultCallVisionApi;
  const all = images || [];
  const blocks = [];
  const blockPhotoIds = [];
  let skipped = 0;
  for (let i = 0; i < all.length; i++) {
    const img = all[i];
    const block = toImageBlock(img);
    if (block) {
      blocks.push(block);
      blockPhotoIds.push(img.photoId ?? i);
    } else {
      skipped++;
    }
  }

  if (blocks.length === 0) {
    return aggregateBatchResults([], { skipped });
  }

  const total = blocks.length;
  const batches = [];
  const batchPhotoIdGroups = [];
  for (let offset = 0; offset < blocks.length; offset += VISION_BATCH_SIZE) {
    batches.push({ blocks: blocks.slice(offset, offset + VISION_BATCH_SIZE), total, locationOptions });
    batchPhotoIdGroups.push(blockPhotoIds.slice(offset, offset + VISION_BATCH_SIZE));
  }

  const onBatchDone = onBatchComplete
    ? (batchIndex, result) => onBatchComplete(batchPhotoIdGroups[batchIndex], result)
    : undefined;
  const batchResults = await runBatchesLimited(
    batches,
    VISION_BATCH_CONCURRENCY,
    call,
    onBatchDone
  );
  return aggregateBatchResults(batchResults, { skipped });
};

const generateSummary = async (reportContent) => {
  const prompt = `Summarize this insurance inspection report in 3-4 sentences highlighting the key findings, damage assessment, and recommended actions:\n\n${reportContent.substring(0, 3000)}`;
  try {
    const { text } = await generateWithFallback(prompt, { maxTokens: 500, temperature: 0.3 });
    return text;
  } catch {
    return 'Summary unavailable';
  }
};

const generateScopeOfWork = async (reportContent, damageAssessment) => {
  const prompt = `Based on this insurance report and damage assessment, generate a detailed scope of work with itemized repair tasks, materials needed, and labor descriptions:\n\nReport:\n${reportContent.substring(0, 2000)}\n\nDamage Assessment:\n${JSON.stringify(damageAssessment, null, 2).substring(0, 1000)}`;
  try {
    const { text } = await generateWithFallback(prompt, { maxTokens: 2000, temperature: 0.4 });
    return text;
  } catch {
    return 'Scope of work generation unavailable';
  }
};

const checkQuality = async (reportContent) => {
  const wordCount = reportContent.split(/\s+/).length;
  const sections = (reportContent.match(/^##\s/gm) || []).length;

  const checks = {
    hasClaimNumber: /claim\s*(number|#)/i.test(reportContent),
    hasDamageAssessment: /damage\s*assessment|section\s*5/i.test(reportContent),
    hasScopeOfWork: /scope\s*of\s*(work|loss)|section\s*(4|6)/i.test(reportContent),
    hasCostEstimate: /estimated|cost|total|estimate/i.test(reportContent),
    hasConclusion: /conclusion|adjuster|certification|notes|section\s*(8|9)/i.test(reportContent),
    isLongEnough: wordCount >= 300,
    hasSections: sections >= 4,
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const qualityScore = Math.round((passed / Object.keys(checks).length) * 100);

  const suggestions = [];
  if (!checks.hasClaimNumber) suggestions.push('Add claim number to report header');
  if (!checks.hasDamageAssessment) suggestions.push('Include detailed damage assessment section');
  if (!checks.hasScopeOfWork) suggestions.push('Add scope of work/recommended repairs');
  if (!checks.hasCostEstimate) suggestions.push('Include cost estimate table');
  if (!checks.hasConclusion) suggestions.push('Add conclusion/adjuster notes section');
  if (!checks.isLongEnough) suggestions.push('Report appears too brief — add more detail');
  if (!checks.hasSections) suggestions.push('Report should have at least 4 structured sections');

  return { score: qualityScore, suggestions, wordCount, sections };
};

const enhanceContent = async (rawContent) => {
  const prompt = `Improve the professional quality of this insurance inspection report section. Make it more detailed, precise, and industry-standard. Return only the improved text:\n\n${rawContent}`;
  try {
    const { text } = await generateWithFallback(prompt, { maxTokens: 1500, temperature: 0.4 });
    return text;
  } catch {
    return rawContent;
  }
};

// `instructions` (Phase 9's distinct "Regenerate Section" workflow) is the
// reviewer's own free-text request for what to change -- e.g. "make this more
// concise" or "add a note about the exterior siding". Optional; when absent
// this is the original open rewrite behavior ("Suggest").
const buildSectionSuggestionPrompt = ({
  title,
  body,
  reportContext = '',
  instructions = '',
}) => `You are assisting a licensed insurance adjuster with ONE SECTION of a DRAFT inspection report.

SECTION: ${title}
CURRENT SECTION TEXT:
${body || '(empty)'}

LIMITED REPORT CONTEXT:
${reportContext || '(none provided)'}
${instructions ? `\nTHE REVIEWER SPECIFICALLY REQUESTED THIS CHANGE:\n${instructions}\n` : ''}
Return only a proposed replacement for the section body, without a heading or commentary.
- Preserve supported facts and do not invent details.
${instructions ? "- Apply the reviewer's requested change above while keeping the rest of the section intact and consistent.\n" : ''}- Use cautious observational wording such as "appears", "may indicate", "is consistent with", and "should be verified".
- Do not determine coverage, liability, cause of loss, fraud, policy interpretation, structural safety, mold, code compliance, engineering conclusions, or final repair costs.
- Flag professional determinations for qualified human review.
- This is only a suggestion. A human reviewer will explicitly accept, reject, or edit it.`;

const stripCodeFence = (text) =>
  text
    .replace(/^```(?:markdown)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

const suggestReportSection = async (input) => {
  const prompt = buildSectionSuggestionPrompt(input);
  const { text, modelUsed } = await generateWithFallback(prompt, {
    maxTokens: 1200,
    temperature: 0.3,
  });
  const suggestion = stripCodeFence(text);
  if (!suggestion) throw new Error('AI returned an empty section suggestion');
  return { suggestion, modelUsed };
};

// Phase 9: the 7 FLACRON ENGINE writing-assistance functions (distinct from
// "Regenerate Section" above, which is the open-ended instructed rewrite).
// Every action returns a proposed replacement `suggestion` for Apply/Discard
// review -- never auto-applied. `check_consistency`/`check_missing_info`
// return findings as a list AND as a proposed appended "AI Review Notes"
// block (so Apply/Discard stays uniform across all 7 functions instead of
// two different UI shapes for rewrite-style vs. check-style actions).
const SECTION_ASSIST_ACTIONS = new Set([
  'improve',
  'shorten',
  'expand',
  'rewrite_professional',
  'check_consistency',
  'check_missing_info',
  'review_photos',
]);

const SHARED_ASSIST_RULES = `- Preserve supported facts; do not invent details not present in the section or provided context.
- Use cautious observational wording ("appears", "may indicate", "is consistent with", "should be verified").
- Do not determine coverage, liability, cause of loss, fraud, policy interpretation, structural safety, mold, code compliance, engineering conclusions, or final repair costs -- flag these for the licensed adjuster instead.
- This is only a suggestion. A human reviewer will explicitly Apply or Discard it -- never assume it will be used as-is.`;

const buildAssistPrompt = ({
  action,
  title,
  body,
  reportContext = '',
  fullContent = '',
  photosSummary = '',
}) => {
  const header = `You are assisting a licensed insurance adjuster with ONE SECTION of a DRAFT inspection report.\n\nSECTION: ${title}\nCURRENT SECTION TEXT:\n${body || '(empty)'}\n\nLIMITED REPORT CONTEXT:\n${reportContext || '(none provided)'}\n`;

  switch (action) {
    case 'improve':
      return `${header}\nRewrite this section to improve clarity, professional tone, and precision, without changing its meaning or adding new facts. Return only the improved section body, no heading or commentary.\n${SHARED_ASSIST_RULES}`;
    case 'shorten':
      return `${header}\nRewrite this section to be noticeably more concise (aim for roughly half the length) while preserving every distinct fact and required disclaimer. Return only the shortened section body, no heading or commentary.\n${SHARED_ASSIST_RULES}`;
    case 'expand':
      return `${header}\nExpand this section with additional relevant professional detail and structure (without inventing new facts not implied by the existing text or context) -- e.g. more specific, itemized observations. Return only the expanded section body, no heading or commentary.\n${SHARED_ASSIST_RULES}`;
    case 'rewrite_professional':
      return `${header}\nRewrite this section entirely in a more formal, professional insurance-industry tone and structure, keeping all existing facts. Return only the rewritten section body, no heading or commentary.\n${SHARED_ASSIST_RULES}`;
    case 'check_consistency':
      return `${header}\nFULL DRAFT REPORT (for cross-section comparison only):\n${(fullContent || '').slice(0, 6000)}\n\nCompare this section against the rest of the draft report above and identify any factual inconsistencies (e.g. a date, address, or damage description that doesn't match what's stated elsewhere). Return the ORIGINAL section text UNCHANGED, followed by a new final paragraph starting exactly with "AI Review Notes — Consistency Check:" that lists each inconsistency found (or states "No inconsistencies were identified between this section and the rest of the draft." if none). Return only the section body plus that appended note, no heading or extra commentary.\n${SHARED_ASSIST_RULES}`;
    case 'check_missing_info':
      return `${header}\nReview this section for information a licensed adjuster would typically expect but that appears missing or incomplete (e.g. a measurement, an affected material, a date). Return the ORIGINAL section text UNCHANGED, followed by a new final paragraph starting exactly with "AI Review Notes — Missing Information:" that lists what appears missing (or states "No obviously missing information was identified in this section." if none). Return only the section body plus that appended note, no heading or extra commentary.\n${SHARED_ASSIST_RULES}`;
    case 'review_photos':
      return `${header}\nPER-PHOTO DOCUMENTATION STATE (from the reviewer's photo review):\n${photosSummary || '(no photo review data available for this report)'}\n\nReview this section against the photo documentation state above and identify gaps -- e.g. damage mentioned in the text with no supporting photo, or reviewed/approved photo observations not reflected in this section's narrative. Return the ORIGINAL section text UNCHANGED, followed by a new final paragraph starting exactly with "AI Review Notes — Photo Documentation:" listing gaps found (or stating "Photo documentation appears consistent with this section." if none). Return only the section body plus that appended note, no heading or extra commentary.\n${SHARED_ASSIST_RULES}`;
    default:
      throw new Error(`Unknown section assist action: ${action}`);
  }
};

const ASSIST_MAX_TOKENS = {
  improve: 1200,
  shorten: 900,
  expand: 1800,
  rewrite_professional: 1400,
  check_consistency: 1400,
  check_missing_info: 1400,
  review_photos: 1400,
};

const assistReportSection = async (input) => {
  const { action } = input;
  if (!SECTION_ASSIST_ACTIONS.has(action))
    throw new Error(`Unknown section assist action: ${action}`);
  const prompt = buildAssistPrompt(input);
  const { text, modelUsed } = await generateWithFallback(prompt, {
    maxTokens: ASSIST_MAX_TOKENS[action] || 1200,
    temperature: 0.3,
  });
  const suggestion = stripCodeFence(text);
  if (!suggestion) throw new Error('AI returned an empty result for this action');
  return { suggestion, modelUsed };
};

const checkAIHealth = async () => {
  const [claudeOk, watsonxOk] = await Promise.all([anthropic.checkHealth(), checkWatsonx()]);
  return {
    anthropic: claudeOk ? 'online' : 'offline',
    watsonx: watsonxOk ? 'online' : 'offline',
    primary: claudeOk ? 'anthropic' : watsonxOk ? 'watsonx' : 'none',
  };
};

module.exports = {
  generateReport,
  analyzeImages,
  generateSummary,
  generateScopeOfWork,
  checkQuality,
  enhanceContent,
  buildSectionSuggestionPrompt,
  suggestReportSection,
  // Phase 9 (Report Editor Rich-Text & AI Panel Upgrade): the 6 additional
  // writing-assistance functions (Improve/Shorten/Expand/Rewrite
  // Professionally/Check Consistency/Check Missing Information/Review Photo
  // Documentation -- 7 total including one overlap-named action), distinct
  // from the "Regenerate Section" workflow (suggestReportSection + instructions).
  assistReportSection,
  buildAssistPrompt,
  SECTION_ASSIST_ACTIONS,
  checkAIHealth,
  // Exported for direct unit testing of the photo-batching fix (Phase 1, PHASES.md).
  aggregateBatchResults,
  VISION_BATCH_SIZE,
  // Phase 8 (Per-Photo Analysis Review UI): per-photo taxonomy + the pure
  // function that turns a report's per-photo review state into
  // generateReport()'s input, plus the batch-result normalizer for direct
  // unit testing.
  PHOTO_LOCATIONS,
  PHOTO_CATEGORIES,
  buildEffectiveImageAnalysis,
  normalizePhotoEntries,
  insertPhotoObservations,
  // Phase 31 (Liability Investigation Report): exported for direct unit
  // testing of the static-section builder, the single-structured-call
  // narrative generator, and its manifest assembler.
  generateLiabilityReport,
  buildLiabilityStaticSections,
  buildLiabilityNarrativePrompt,
  parseLiabilityNarrative,
  assembleLiabilityReport,
  LIABILITY_NARRATIVE_KEYS,
  // Phase 32 (Commercial Property Inspection Report): same reasoning as
  // Phase 31's exports above, for the Commercial manifest.
  generateCommercialReport,
  buildCommercialStaticSections,
  buildCommercialNarrativePrompt,
  parseCommercialNarrative,
  assembleCommercialReport,
  COMMERCIAL_NARRATIVE_KEYS,
  // Phase 33 (Flood (NFIP) Inspection Report): same reasoning as Phase 31/32's
  // exports above, for the Flood manifest (keyed off `lossType`, not
  // `claimType`).
  generateFloodReport,
  buildFloodStaticSections,
  buildFloodNarrativePrompt,
  parseFloodNarrative,
  assembleFloodReport,
  FLOOD_NARRATIVE_KEYS,
  // Phase 34 (Theft/Burglary Inspection Report): same reasoning as Phase
  // 31/32/33's exports above, for the Theft manifest (keyed off `lossType`,
  // same precedence pattern as Flood).
  generateTheftReport,
  buildTheftStaticSections,
  buildTheftNarrativePrompt,
  parseTheftNarrative,
  assembleTheftReport,
  THEFT_NARRATIVE_KEYS,
  // Phase 35 (Vehicle/Auto Inspection Report): same reasoning as Phase
  // 31-34's exports above, for the Vehicle manifest (keyed off `claimType
  // === 'Auto'`), plus the vehicle panel-selection taxonomy and the
  // deterministic panel-grouping section builder.
  VEHICLE_PANELS,
  generateVehicleReport,
  buildVehicleStaticSections,
  buildVehicleNarrativePrompt,
  parseVehicleNarrative,
  assembleVehicleReport,
  buildVehiclePanelSection,
  VEHICLE_NARRATIVE_KEYS,
  // Phase 36 (Mold Assessment Supplemental Report): same reasoning as Phase
  // 31-35's exports above, for the Mold manifest (keyed off `documentType
  // === 'MoldSupplement'`, generated from an already-existing report rather
  // than the primary wizard). MOLD_SCOPE_NOTICE is exported for the
  // exact-match test asserting the fixed "not a certified mold assessment"
  // notice is never paraphrased away.
  generateMoldReport,
  buildMoldStaticSections,
  buildMoldNarrativePrompt,
  parseMoldNarrative,
  assembleMoldReport,
  MOLD_NARRATIVE_KEYS,
  MOLD_SCOPE_NOTICE,
};
