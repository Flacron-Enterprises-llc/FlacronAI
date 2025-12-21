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
    const prompt = `You are a professional insurance adjuster creating a detailed insurance claim report.

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

Generate a comprehensive, professional insurance claim report following the CRU GROUP template structure. Include:

1. EXECUTIVE SUMMARY
2. CLAIM INFORMATION
3. PROPERTY DETAILS
4. LOSS DESCRIPTION
5. SCOPE OF DAMAGE
6. DAMAGE ASSESSMENT
7. COST ESTIMATE (if applicable)
8. RECOMMENDATIONS
9. CONCLUSION

Format the report professionally with clear sections and detailed analysis. Be specific, factual, and thorough.`;

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
    const cleanedText = stripMarkdown(generatedText);

    console.log('✅ WatsonX report generated, length:', cleanedText.length);

    return cleanedText;
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
