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

const generateReport = async (reportData, imageAnalysis, photoCount = 0) => {
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
  total
) => `You are an expert insurance damage assessor reviewing photos for a draft report that a licensed adjuster will review. Describe only what is visible; use cautious language ("appears", "may indicate") and defer final determinations to the adjuster. These ${count} photo(s) are batch ${batchIndex + 1} of ${batchCount} from a ${total}-photo inspection set.

Analyze EACH of the ${count} photo(s) in this batch INDIVIDUALLY, in the exact order they were provided, and classify each with:
- location: the apparent area/room shown -- choose the closest match from: ${PHOTO_LOCATIONS.join(', ')} (use "Other/Unspecified" if unclear)
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
const analyzeBatch = async (imageBlocks, { batchIndex, batchCount, total, callVisionApi }) => {
  const prompt = buildBatchPrompt(imageBlocks.length, batchIndex, batchCount, total);
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
    return {
      area: p.analysis.location,
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
const analyzeImages = async (images, { callVisionApi, onBatchComplete } = {}) => {
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
    batches.push({ blocks: blocks.slice(offset, offset + VISION_BATCH_SIZE), total });
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
};
