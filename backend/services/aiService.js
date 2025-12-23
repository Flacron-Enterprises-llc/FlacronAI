// AI Service for FlacronAI
// Dual-AI Strategy: OpenAI + IBM WatsonX

const { generateReport: generateWatsonXReport } = require('../config/watsonx');
const {
  analyzeImage,
  generateSummary,
  enhanceInput,
  generateScope,
  reviewReport
} = require('../config/openai');

/**
 * Generate insurance report using WatsonX AI
 */
async function generateInsuranceReport(reportData) {
  try {
    const content = await generateWatsonXReport(reportData);
    return {
      success: true,
      content,
      metadata: {
        provider: 'IBM WatsonX AI',
        model: process.env.WATSONX_MODEL || 'ibm/granite-13b-chat-v2',
        generatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('WatsonX report generation failed:', error);
    throw new Error(`Failed to generate report with WatsonX: ${error.message}`);
  }
}

/**
 * Analyze damage images using OpenAI Vision
 */
async function analyzeDamageImages(images) {
  try {
    const analysisPromises = images.map(async (image) => {
      const analysis = await analyzeImage(
        image.data,
        `Analyze this damage image for an insurance claim. Describe:
        1. Type of damage visible
        2. Severity assessment
        3. Affected areas
        4. Recommended actions`
      );
      return {
        filename: image.filename,
        analysis
      };
    });

    const results = await Promise.all(analysisPromises);

    return {
      success: true,
      content: results,
      metadata: {
        provider: 'OpenAI',
        model: 'gpt-4-vision-preview',
        generatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('OpenAI image analysis failed:', error);
    throw new Error(`Failed to analyze images: ${error.message}`);
  }
}

/**
 * Generate executive summary using OpenAI
 */
async function generateExecutiveSummary(fullReport) {
  try {
    const summary = await generateSummary(fullReport);
    return {
      success: true,
      content: summary,
      metadata: {
        provider: 'OpenAI',
        model: 'gpt-4-turbo-preview',
        generatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('OpenAI summary generation failed:', error);
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

/**
 * Enhance user input using OpenAI
 */
async function enhanceReportInput(userInput) {
  try {
    const enhanced = await enhanceInput(userInput);
    return {
      success: true,
      content: enhanced,
      metadata: {
        provider: 'OpenAI',
        model: 'gpt-4-turbo-preview',
        generatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('OpenAI input enhancement failed:', error);
    throw new Error(`Failed to enhance input: ${error.message}`);
  }
}

/**
 * Generate scope of work using OpenAI
 */
async function generateScopeOfWork(damages, lossType) {
  try {
    const scope = await generateScope(damages, lossType);
    return {
      success: true,
      content: scope,
      metadata: {
        provider: 'OpenAI',
        model: 'gpt-4-turbo-preview',
        generatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('OpenAI scope generation failed:', error);
    throw new Error(`Failed to generate scope: ${error.message}`);
  }
}

/**
 * Quality check report using OpenAI
 */
async function qualityCheckReport(reportContent) {
  try {
    const review = await reviewReport(reportContent);
    return {
      success: true,
      content: review,
      metadata: {
        provider: 'OpenAI',
        model: 'gpt-4-turbo-preview',
        generatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('OpenAI quality check failed:', error);
    throw new Error(`Failed to check quality: ${error.message}`);
  }
}

/**
 * Get AI provider status
 */
async function getAIStatus() {
  return {
    openai: {
      available: !!process.env.OPENAI_API_KEY,
      configured: !!process.env.OPENAI_API_KEY,
      provider: 'OpenAI',
      features: ['Image Analysis', 'Summaries', 'Input Enhancement', 'Scope of Work', 'Quality Check']
    },
    watsonx: {
      available: !!process.env.WATSONX_API_KEY && !!process.env.WATSONX_PROJECT_ID,
      configured: !!process.env.WATSONX_API_KEY && !!process.env.WATSONX_PROJECT_ID,
      provider: 'IBM WatsonX AI',
      features: ['Report Generation']
    }
  };
}

module.exports = {
  generateInsuranceReport,
  analyzeDamageImages,
  generateExecutiveSummary,
  enhanceReportInput,
  generateScopeOfWork,
  qualityCheckReport,
  getAIStatus
};
