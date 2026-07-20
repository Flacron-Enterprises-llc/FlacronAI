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

const buildReportPrompt = (reportData, imageAnalysis) => {
  const {
    claimNumber, insuredName, propertyAddress, lossDate, lossType, reportType, additionalNotes,
    propertyDetails, lossDescription, damagesObserved, recommendations,
  } = reportData;
  const imageSection = imageAnalysis
    ? `\n\nIMAGE ANALYSIS RESULTS:\n${JSON.stringify(imageAnalysis, null, 2)}`
    : '';

  return `You are a professional insurance adjuster with 20+ years of experience. Generate a complete, professional CRU GROUP standard insurance inspection report in markdown format.

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

Generate a thorough, professional report following this EXACT structure with all sections fully populated:

# INSURANCE INSPECTION REPORT

## SECTION 1: REPORT HEADER
- Report Type: ${reportType} Inspection Report
- Claim Number: ${claimNumber}
- Date of Inspection: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
- Report Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
- Prepared By: FlacronAI Automated Report System

## SECTION 2: INSURED INFORMATION
- Insured Name: ${insuredName}
- Property Address: ${propertyAddress}
- Date of Loss: ${lossDate}
- Loss Type: ${lossType}
- Policy Information: [To be completed by adjuster]

## SECTION 3: PROPERTY DESCRIPTION
${propertyDetails
    ? `Based on the following property details provided by the adjuster, expand into a professional property description:\n${propertyDetails}`
    : `Write a professional property description for the ${lossType} loss site at ${propertyAddress}. Include: the type of structure (residential/commercial), likely construction type and materials, estimated age and condition, general layout, and any physical characteristics relevant to a ${lossType} loss assessment.`}

## SECTION 4: SCOPE OF LOSS / CAUSE OF LOSS
${lossDescription
    ? `Based on the following loss description provided by the adjuster, expand into a professional analysis:\n${lossDescription}\n\nAlso include analysis of coverage implications and contributing factors.`
    : `Write a detailed professional analysis of this ${lossType} loss at ${propertyAddress} on ${lossDate}. Cover all of the following in full sentences and paragraphs:
- The most probable cause of this ${lossType} loss and how it typically occurs
- How the damage developed, spread, and progressed at this property
- The likely sequence of events from the initial incident through discovery
- Coverage analysis: whether this ${lossType} loss is covered under standard insurance policy terms and any relevant exclusions to consider
- Contributing factors, pre-existing conditions, or aggravating circumstances relevant to this loss${additionalNotes ? `\n- Additional context from adjuster notes: ${additionalNotes}` : ''}`}

## SECTION 5: DAMAGE ASSESSMENT
${damagesObserved
    ? `Based on the following damages observed by the adjuster, expand into a professional room-by-room damage assessment:\n${damagesObserved}\n\nFor each area include severity (Minor/Moderate/Severe), affected materials, and estimated square footage.`
    : `Provide a detailed room-by-room / area-by-area damage assessment. For each area, list:
- Location/Room Name
- Type of damage observed
- Severity (Minor/Moderate/Severe)
- Affected materials (e.g., drywall, flooring, cabinetry)
- Square footage affected (estimated)

Include at minimum 5-7 damage areas relevant to the loss type: ${lossType}`}

## SECTION 6: SCOPE OF WORK (RECOMMENDED REPAIRS)
Provide itemized repair recommendations:
- Immediate emergency mitigation steps
- Temporary repairs needed
- Permanent repair scope by trade (demo, framing, drywall, flooring, painting, mechanical, etc.)
- Material specifications where applicable
- Labor descriptions

## SECTION 7: ESTIMATED LOSS SUMMARY
Provide a structured cost estimate table with REAL calculated dollar amounts based on industry-standard restoration rates for a ${lossType} loss. Do NOT use placeholder values like $XXX.XX — use realistic specific numbers (e.g., $1,850.00, $3,200.00). Calculate each line item individually and sum them for the TOTAL.

| Category | Description | Estimated Cost |
|----------|-------------|----------------|
[Include 8-12 line items with REAL dollar amounts based on scope of damage, e.g. $1,250.00]
| **TOTAL ESTIMATED LOSS** | | [sum of all line items above, e.g. $14,750.00] |

IMPORTANT: Every dollar amount must be a specific calculated number. No placeholders. The TOTAL must equal the sum of all line items above it.

## SECTION 8: SUPPORTING DOCUMENTATION
List all documentation reviewed and recommended:
- Photos taken (reference image analysis if available)
- Documents reviewed
- Additional documentation recommended
- Third-party reports needed (if any)

## SECTION 9: CONCLUSION / ADJUSTER NOTES
${recommendations
    ? `Include the following adjuster recommendations and expand professionally:\n${recommendations}\n\nAlso include:`
    : ''}
- Summary of findings
- Coverage determination notes
- Recommended next steps
- Special considerations
- Adjuster certification statement

---
*Report generated by FlacronAI AI System | ${new Date().toISOString()}*

Write the complete report now with all sections fully populated with professional, realistic content appropriate for a ${lossType} loss at a residential/commercial property. Be specific, detailed, and professional.`;
};

// Checks if the generated content has a complete Section 7 cost table.
// If missing or truncated, makes a focused AI call to generate just the table.
const ensureLossSummary = async (reportData, content) => {
  const section7Re = /##\s*SECTION\s*7[^\n]*\n([\s\S]*?)(?=##\s*SECTION\s*8|$)/i;
  const match = content.match(section7Re);
  const tableRows = ((match ? match[1] : '') .match(/^\|.+\|/gm) || [])
    .filter(r => !r.match(/^\|\s*[-:]+\s*\|/)); // strip separator rows

  // Need header + at least 3 data/total rows
  if (tableRows.length >= 4) return content;

  console.log('⚠️  Section 7 incomplete — generating cost summary separately...');

  const summaryPrompt = `You are a professional insurance adjuster. Generate ONLY the estimated cost table for a ${reportData.lossType} insurance loss claim.

Property: ${reportData.propertyAddress}
Damages: ${reportData.damagesObserved || 'Typical ' + reportData.lossType + ' damage to a residential property'}
Loss Description: ${reportData.lossDescription || ''}

Output ONLY this markdown section (no preamble, no other text):

## SECTION 7: ESTIMATED LOSS SUMMARY

| Category | Description | Estimated Cost |
|----------|-------------|----------------|
[8-10 rows with REAL specific dollar amounts, e.g. $1,850.00. No placeholders.]
| **TOTAL ESTIMATED LOSS** | | [exact sum of all rows above] |`;

  let summaryText;
  try {
    ({ text: summaryText } = await generateWithFallback(summaryPrompt, { maxTokens: 700, temperature: 0.3 }));
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

const generateReport = async (reportData, imageAnalysis) => {
  const prompt = buildReportPrompt(reportData, imageAnalysis);

  console.log('🤖 Generating report (Claude primary, watsonx fallback)...');
  let content, modelUsed;
  try {
    ({ text: content, modelUsed } = await generateWithFallback(prompt, { maxTokens: 4096, temperature: 0.5 }));
  } catch (err) {
    throw new Error(`No AI provider available (Claude + watsonx both failed): ${err.message}. Configure ANTHROPIC_API_KEY or WATSONX_API_KEY.`);
  }
  console.log(`✅ Report generated via ${modelUsed}`);

  // Ensure Section 7 cost table is complete — patch it if truncated
  content = await ensureLossSummary(reportData, content);

  return { content, modelUsed };
};

// `images` is an array of { buffer, mimetype } (buffers are held in memory at
// upload time — no disk reads). Limits to 10 images for the vision call.
const analyzeImages = async (images) => {
  if (!anthropic.getClient()) {
    // watsonx (granite) has no vision capability, so there is no image-analysis
    // fallback — degrade gracefully rather than blocking report generation.
    return {
      summary: 'Image analysis unavailable — ANTHROPIC_API_KEY not configured',
      damages: [],
      severity: 'Unknown',
    };
  }

  const toAnalyze = (images || []).slice(0, 10);
  const imageBlocks = [];

  for (const img of toAnalyze) {
    try {
      if (!img || !img.buffer) continue;
      // Normalize "image/jpeg" | "jpg" → "jpeg"
      let mediaType = String(img.mimetype || '').toLowerCase().replace('image/', '');
      if (mediaType === 'jpg') mediaType = 'jpeg';
      if (!CLAUDE_IMAGE_TYPES.has(mediaType)) {
        console.warn(`Skipping image: ${mediaType || 'unknown type'} not supported by Claude vision`);
        continue;
      }
      const base64 = Buffer.from(img.buffer).toString('base64');
      imageBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: `image/${mediaType}`, data: base64 },
      });
    } catch (err) {
      console.warn('Could not read image buffer:', err.message);
    }
  }

  if (imageBlocks.length === 0) {
    return { summary: 'No valid images provided for analysis', damages: [], severity: 'Unknown' };
  }

  const promptText = `You are an expert insurance damage assessor reviewing photos for a draft report that a licensed adjuster will review. Describe only what is visible; use cautious language ("appears", "may indicate") and defer final determinations to the adjuster. Analyze these ${imageBlocks.length} damage photos and provide:
1. A damage assessment for each visible area
2. Overall apparent severity (Minor/Moderate/Severe)
3. Apparent affected areas (rooms, surfaces)
4. Materials that appear damaged (drywall, flooring, roofing, etc.)
5. Conditions a professional should evaluate further (structural, safety, mold)
6. Documentation quality assessment

Return ONLY JSON with this structure:
{
  "summary": "Overall assessment summary",
  "severity": "Moderate",
  "totalImagesAnalyzed": ${imageBlocks.length},
  "damages": [
    { "area": "Living Room", "type": "Water damage", "severity": "Severe", "materials": ["drywall", "flooring"], "description": "Detailed description" }
  ],
  "itemsForProfessionalReview": ["List of conditions a professional should confirm"],
  "estimatedAffectedSqFt": 450,
  "documentationNotes": "Photo quality assessment"
}`;

  let content;
  try {
    content = await anthropic.analyzeImages(promptText, imageBlocks, { maxTokens: 2000 });
  } catch (err) {
    console.warn('Claude image analysis failed:', err.message);
    return { summary: `Image analysis unavailable — ${err.message}`, damages: [], severity: 'Unknown' };
  }

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: content, damages: [], severity: 'Unknown' };
  } catch {
    return { summary: content, damages: [], severity: 'Unknown' };
  }
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

const checkAIHealth = async () => {
  const [claudeOk, watsonxOk] = await Promise.all([anthropic.checkHealth(), checkWatsonx()]);
  return {
    anthropic: claudeOk ? 'online' : 'offline',
    watsonx: watsonxOk ? 'online' : 'offline',
    primary: claudeOk ? 'anthropic' : watsonxOk ? 'watsonx' : 'none',
  };
};

module.exports = { generateReport, analyzeImages, generateSummary, generateScopeOfWork, checkQuality, enhanceContent, checkAIHealth };
