// Unified AI Service for FlacronAI
// Implements dual-AI strategy: OpenAI for general features, WatsonX for enterprise reports

const openaiConfig = require('../config/openai');
const watsonxConfig = require('../config/watsonx');

/**
 * Generate insurance report using IBM WatsonX AI
 * Enterprise-grade, structured output for business-critical reports
 */
async function generateInsuranceReport(reportData) {
  try {
    console.log('🔵 Generating report with IBM WatsonX AI (Enterprise)...');
    console.log('Report data:', {
      claimNumber: reportData.claimNumber,
      insuredName: reportData.insuredName,
      lossType: reportData.lossType
    });

    const reportText = await watsonxConfig.generateReport(reportData);

    console.log('✅ Report generated successfully with WatsonX, length:', reportText?.length || 0);

    return {
      success: true,
      content: reportText,
      metadata: {
        generatedAt: new Date().toISOString(),
        provider: 'IBM WatsonX AI',
        model: process.env.WATSONX_MODEL || 'ibm/granite-13b-chat-v2',
        reportType: reportData.reportType,
        claimNumber: reportData.claimNumber
      }
    };
  } catch (error) {
    console.error('❌ WatsonX report generation failed:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      body: error.body
    });
    return {
      success: false,
      error: `WatsonX Error: ${error.message}`,
      provider: 'IBM WatsonX AI',
      details: error.code || 'Unknown error code'
    };
  }
}

/**
 * Analyze property damage images using OpenAI Vision
 * User-facing AI interaction for image analysis
 */
async function analyzeDamageImages(images) {
  try {
    console.log('🟢 Analyzing images with OpenAI Vision...');
    const analyses = [];

    for (const image of images) {
      const prompt = `You are an expert property damage assessor. Analyze this image of property damage and provide:
1. Type of damage visible
2. Severity assessment (minor, moderate, severe, catastrophic)
3. Affected areas/materials
4. Potential causes
5. Recommended actions

Be specific and professional in your assessment.`;

      const analysis = await openaiConfig.analyzeImage(image.data, prompt);
      analyses.push({
        imageId: image.id,
        imageName: image.name,
        analysis: analysis
      });
    }

    console.log('✅ Image analysis completed with OpenAI');

    return {
      success: true,
      analyses: analyses,
      metadata: {
        provider: 'OpenAI',
        model: 'gpt-4-vision-preview'
      }
    };
  } catch (error) {
    console.error('❌ OpenAI image analysis failed:', error);
    return {
      success: false,
      error: error.message,
      provider: 'OpenAI'
    };
  }
}

/**
 * Generate executive summary using OpenAI
 * Fast, conversational summary generation
 */
async function generateExecutiveSummary(fullReport) {
  try {
    console.log('🟢 Generating executive summary with OpenAI...');
    const summary = await openaiConfig.generateExecutiveSummary(fullReport);

    console.log('✅ Summary generated successfully');

    return {
      success: true,
      summary: summary,
      metadata: {
        provider: 'OpenAI',
        model: 'gpt-4-turbo-preview'
      }
    };
  } catch (error) {
    console.error('❌ OpenAI summary generation failed:', error);
    return {
      success: false,
      error: error.message,
      provider: 'OpenAI'
    };
  }
}

/**
 * Enhance user input using OpenAI
 * User-facing content improvement
 */
async function enhanceReportInput(userInput) {
  try {
    console.log('🟢 Enhancing input with OpenAI...');
    const enhanced = await openaiConfig.enhanceReportInput(userInput);

    console.log('✅ Input enhanced successfully');

    return {
      success: true,
      enhanced: enhanced,
      metadata: {
        provider: 'OpenAI',
        model: 'gpt-4-turbo-preview'
      }
    };
  } catch (error) {
    console.error('❌ OpenAI input enhancement failed:', error);
    return {
      success: false,
      error: error.message,
      provider: 'OpenAI'
    };
  }
}

/**
 * Generate scope of work using OpenAI
 * General AI feature for construction planning
 */
async function generateScopeOfWork(damages, lossType) {
  try {
    console.log('🟢 Generating scope of work with OpenAI...');
    const scope = await openaiConfig.generateScopeOfWork(damages, lossType);

    console.log('✅ Scope of work generated successfully');

    return {
      success: true,
      scope: scope,
      metadata: {
        provider: 'OpenAI',
        model: 'gpt-4-turbo-preview'
      }
    };
  } catch (error) {
    console.error('❌ OpenAI scope generation failed:', error);
    return {
      success: false,
      error: error.message,
      provider: 'OpenAI'
    };
  }
}

/**
 * Quality check report using OpenAI
 * General AI feature for quality assurance
 */
async function qualityCheckReport(reportContent) {
  try {
    console.log('🟢 Performing quality check with OpenAI...');
    const review = await openaiConfig.qualityCheckReport(reportContent);

    console.log('✅ Quality check completed successfully');

    return {
      success: true,
      review: review,
      metadata: {
        provider: 'OpenAI',
        model: 'gpt-4-turbo-preview'
      }
    };
  } catch (error) {
    console.error('❌ OpenAI quality check failed:', error);
    return {
      success: false,
      error: error.message,
      provider: 'OpenAI'
    };
  }
}

/**
 * Get AI provider status
 * Health check for both AI services
 */
async function getAIStatus() {
  const status = {
    openai: {
      available: false,
      configured: !!process.env.OPENAI_API_KEY,
      features: ['Image Analysis', 'Summaries', 'Input Enhancement', 'Scope of Work', 'Quality Check']
    },
    watsonx: {
      available: false,
      configured: !!process.env.WATSONX_API_KEY,
      features: ['Report Generation']
    }
  };

  // Test OpenAI
  try {
    openaiConfig.getOpenAIClient();
    status.openai.available = true;
  } catch (error) {
    status.openai.error = error.message;
  }

  // Test WatsonX
  try {
    watsonxConfig.getWatsonXClient();
    status.watsonx.available = true;
  } catch (error) {
    status.watsonx.error = error.message;
  }

  return status;
}

module.exports = {
  // WatsonX AI functions (Enterprise, Business-Critical)
  generateInsuranceReport,

  // OpenAI functions (General, User-Facing)
  analyzeDamageImages,
  generateExecutiveSummary,
  enhanceReportInput,
  generateScopeOfWork,
  qualityCheckReport,

  // Utility functions
  getAIStatus
};
