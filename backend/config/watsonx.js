// IBM WatsonX AI Configuration for FlacronAI
// Used for enterprise-grade report generation
const { WatsonXAI } = require('@ibm-cloud/watsonx-ai');
const { IamAuthenticator } = require('ibm-cloud-sdk-core');
require('dotenv').config();

let watsonxClient;

/**
 * Initialize WatsonX AI client
 * Uses API key only - no org/project ID required
 */
function initializeWatsonX() {
  try {
    if (!process.env.WATSONX_API_KEY) {
      throw new Error('WATSONX_API_KEY is not set in environment variables');
    }

    // Initialize WatsonX AI client with API key authentication
    watsonxClient = WatsonXAI.newInstance({
      version: '2024-05-31',
      serviceUrl: process.env.WATSONX_URL || 'https://us-south.ml.cloud.ibm.com',
      authenticator: new IamAuthenticator({
        apikey: process.env.WATSONX_API_KEY,
      }),
    });

    console.log('✅ WatsonX AI initialized successfully');
    return watsonxClient;
  } catch (error) {
    console.error('❌ WatsonX initialization error:', error.message);
    throw error;
  }
}

/**
 * Get WatsonX client instance
 */
function getWatsonXClient() {
  if (!watsonxClient) {
    return initializeWatsonX();
  }
  return watsonxClient;
}

/**
 * Strip markdown formatting from text
 */
function stripMarkdown(text) {
  if (!text) return '';

  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/`{1,3}(.+?)`{1,3}/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Generate insurance report using WatsonX AI
 * Enterprise-grade structured report generation
 */
async function generateReport(reportData) {
  try {
    const client = getWatsonXClient();

    // Construct comprehensive prompt for CRU GROUP report template
    const prompt = `You are a professional insurance adjuster writing the ACTUAL CONTENT for a detailed insurance claim report. Write the full report with complete paragraphs and analysis, not just an outline.

CLAIM INFORMATION:
- Claim Number: ${reportData.claimNumber}
- Insured Name: ${reportData.insuredName}
- Property Address: ${reportData.propertyAddress || 'Not provided'}
- Loss Date: ${reportData.lossDate || 'Not provided'}
- Loss Type: ${reportData.lossType}
- Report Type: ${reportData.reportType}

PROPERTY DETAILS:
${reportData.propertyDetails || 'Not provided'}

LOSS DESCRIPTION:
${reportData.lossDescription || 'Not provided'}

DAMAGES OBSERVED:
${reportData.damages || 'Not provided'}

RECOMMENDATIONS:
${reportData.recommendations || 'Not provided'}

Write a complete, comprehensive insurance claim report with the following sections. For EACH section, write detailed content with full sentences and paragraphs based on the information provided above.

FORMATTING REQUIREMENTS:
- Use markdown formatting (## for section headers, **text** for bold, bullets with - or *)
- Start each main section with ## followed by the section name
- Use **bold** for important terms and subsection headings
- Use bullet points for lists
- Write in complete, professional paragraphs

## EXECUTIVE SUMMARY
Write a detailed executive summary (2-3 paragraphs) that provides an overview of this claim, including the loss type, key findings, and overall assessment.

## CLAIM INFORMATION
Present the claim details in a professional format.

## PROPERTY DETAILS
Write detailed paragraphs describing the property, its condition before the loss, and relevant characteristics.

## LOSS DESCRIPTION
Write 2-3 detailed paragraphs explaining how the loss occurred, when it happened, and the immediate impact.

## SCOPE OF DAMAGE
Write detailed paragraphs describing all areas affected by the loss, the extent of damage to each area, and what was observed during inspection.

## DAMAGE ASSESSMENT
Provide a thorough analysis (3-4 paragraphs) of the damage severity, affected building systems, materials impacted, and professional assessment of the situation.

## COST ESTIMATE
If applicable, provide detailed cost breakdowns with explanations.

## RECOMMENDATIONS
Write specific, actionable recommendations (2-3 paragraphs) for remediation, repairs, and next steps.

## CONCLUSION
Write a concluding paragraph summarizing the report findings and recommendations.

IMPORTANT:
- Write the ACTUAL REPORT CONTENT with full paragraphs, not a template or outline
- Use markdown formatting (##, **, bullets)
- Be specific, factual, and professional
- Use the claim information provided to create realistic, detailed content for each section`;

    // Generate text using WatsonX AI
    const textGenParams = {
      input: prompt,
      modelId: process.env.WATSONX_MODEL || 'ibm/granite-13b-chat-v2',
      parameters: {
        max_new_tokens: 2048,
        temperature: 0.3,
        top_p: 0.9,
        top_k: 50,
        repetition_penalty: 1.1,
      },
    };

    // Add projectId or spaceId if available (optional)
    if (process.env.WATSONX_PROJECT_ID) {
      textGenParams.projectId = process.env.WATSONX_PROJECT_ID;
    }
    if (process.env.WATSONX_SPACE_ID) {
      textGenParams.spaceId = process.env.WATSONX_SPACE_ID;
    }

    console.log('🔵 Calling WatsonX AI for report generation...');
    console.log('   Model:', textGenParams.modelId);
    console.log('   Project ID:', textGenParams.projectId || 'Not set');
    console.log('   Space ID:', textGenParams.spaceId || 'Not set');

    const response = await client.generateText(textGenParams);

    if (!response || !response.result || !response.result.results || response.result.results.length === 0) {
      throw new Error('No response from WatsonX AI');
    }

    const generatedText = response.result.results[0].generated_text;

    // Validate that we have meaningful content
    if (!generatedText || generatedText.trim().length < 100) {
      throw new Error('WatsonX returned insufficient content (less than 100 characters)');
    }

    // DO NOT strip markdown - preserve formatting for document generators
    // const cleanedText = stripMarkdown(generatedText);

    console.log('✅ WatsonX report generated successfully');
    console.log('   Content length:', generatedText.length, 'characters');
    console.log('   Word count:', generatedText.split(/\s+/).length, 'words');

    return generatedText;
  } catch (error) {
    console.error('❌ WatsonX report generation error:', error);
    throw new Error(`Failed to generate report with WatsonX: ${error.message}`);
  }
}

module.exports = {
  initializeWatsonX,
  getWatsonXClient,
  generateReport
};
