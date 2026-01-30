// Report Routes for FlacronAI API
const express = require('express');
const router = express.Router();
// Updated to use dual-AI strategy
const { generateInsuranceReport, analyzeDamageImages, getAIStatus } = require('../services/aiService');
const { createReport, getReportById, getUserReports, updateReport, deleteReport, checkUserLimits, trackReportUsage } = require('../services/reportService');
const { uploadImage, uploadReportDocument } = require('../config/storage');
const { generateDOCX, generatePDF, generateHTML } = require('../utils/documentGenerator');
const { generateReportFromTemplate, parseAIContentToStructured, transformAIDataToTemplate } = require('../services/reportTemplateService');
const { processTemplate } = require('../utils/templateProcessor');
const { generateProperPDF } = require('../utils/properPdfGenerator');
const { authenticateToken, optionalAuth, authenticateAny } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads - UNLIMITED photos support
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 100 // Support up to 100 images (effectively unlimited for practical use)
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

/**
 * GET /api/reports/ai-status
 * Check AI providers health and availability
 */
router.get('/ai-status', async (req, res) => {
  try {
    console.log('🔍 Checking AI providers status...');
    const status = await getAIStatus();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      providers: status
    });
  } catch (error) {
    console.error('❌ AI status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/reports/generate
 * Generate new insurance report (PROTECTED - requires authentication)
 */
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId; // From auth middleware
    const reportData = req.body;

    // Validate required fields
    if (!reportData.claimNumber || !reportData.insuredName || !reportData.lossType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: claimNumber, insuredName, lossType'
      });
    }

    // Check user tier limits
    const limitsCheck = await checkUserLimits(userId);
    if (!limitsCheck.canGenerate) {
      return res.status(403).json({
        success: false,
        error: `Report limit reached for ${limitsCheck.tier} tier. Used: ${limitsCheck.reportsUsed}/${limitsCheck.reportsLimit}`
      });
    }

    // Generate report with WatsonX AI (OpenAI fallback)
    console.log('Generating report for claim:', reportData.claimNumber);
    const aiResult = await generateInsuranceReport(reportData);

    if (!aiResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate report with AI'
      });
    }

    // Save report to database with AI metadata
    const saveResult = await createReport(userId, reportData, aiResult.content, aiResult.metadata);

    if (!saveResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to save report'
      });
    }

    // Track usage
    await trackReportUsage(userId);

    res.json({
      success: true,
      reportId: saveResult.reportId,
      report: saveResult.report,
      message: 'Report generated successfully'
    });

  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/reports/:id
 * Get specific report by ID (PROTECTED - requires authentication)
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.id;

    const result = await getReportById(reportId, userId);

    if (!result.success) {
      return res.status(result.error === 'Report not found' ? 404 : 403).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/reports
 * Get all reports for current user (PROTECTED - requires authentication)
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    console.log('Fetching reports for user:', userId, 'limit:', limit, 'offset:', offset);

    const result = await getUserReports(userId, limit, offset);

    console.log('Reports fetched:', result.success ? result.count : 'Failed');

    res.json(result);

  } catch (error) {
    console.error('Get reports error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/reports/my-reports (ALIAS)
 * Get all reports for current user (PROTECTED - requires authentication)
 */
router.get('/my-reports', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    console.log('📋 Fetching MY REPORTS for user:', userId, 'limit:', limit, 'offset:', offset);

    const result = await getUserReports(userId, limit, offset);

    console.log('✅ My Reports fetched:', result.success ? `${result.count} reports` : 'Failed');
    console.log('   User ID:', userId);
    console.log('   Reports Count:', result.reports?.length || 0);

    res.json(result);

  } catch (error) {
    console.error('❌ Get my reports error:', error);
    console.error('   Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/reports/:id
 * Update report (PROTECTED - requires authentication)
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.id;
    const updates = req.body;

    const result = await updateReport(reportId, userId, updates);

    if (!result.success) {
      return res.status(result.error === 'Report not found' ? 404 : 403).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Update report error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/reports/:id
 * Delete report (PROTECTED - requires authentication)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.id;

    const result = await deleteReport(reportId, userId);

    if (!result.success) {
      return res.status(result.error === 'Report not found' ? 404 : 403).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/reports/:id/export
 * Export report to DOCX, PDF, or HTML using CRU Template (PROTECTED - requires authentication)
 */
router.post('/:id/export', authenticateToken, async (req, res) => {
  try {
    console.log('📤 Export endpoint hit - reportId:', req.params.id, 'format:', req.body.format);
    const userId = req.user.userId;
    const reportId = req.params.id;
    const format = req.body.format || 'docx'; // docx, pdf, or html

    console.log('User ID:', userId, 'Report ID:', reportId, 'Format:', format);

    // Get report
    const reportResult = await getReportById(reportId, userId);
    if (!reportResult.success) {
      return res.status(404).json(reportResult);
    }

    const report = reportResult.report;

    // For HTML format, use the old generator (no template needed)
    if (format.toLowerCase() === 'html') {
      const reportData = {
        claimNumber: report.claimNumber,
        insuredName: report.insuredName,
        propertyAddress: report.propertyAddress,
        lossDate: report.lossDate,
        lossType: report.lossType,
        reportType: report.reportType
      };
      const exportResult = generateHTML(reportData, report.content);
      return res.json({
        success: true,
        html: exportResult.html,
        fileName: exportResult.fileName,
        format: 'html'
      });
    }

    // For DOCX and PDF, use the CRU Template Processor
    console.log('📄 Using CRU Template Processor for export...');

    // Parse AI content to structured data
    const parsedAIData = parseAIContentToStructured(report.content || '');
    console.log('   Parsed AI sections:', Object.keys(parsedAIData));

    // Build user input data from report
    const userInputData = {
      claimNumber: report.claimNumber,
      policyNumber: report.policyNumber || '',
      insuredName: report.insuredName,
      insuredPhone: report.insuredPhone || '',
      insuredEmail: report.insuredEmail || '',
      propertyAddress: report.propertyAddress,
      lossDate: report.lossDate,
      lossType: report.lossType,
      reportType: report.reportType || 'Initial Inspection',
      dateReceived: report.dateReceived || '',
      dateContacted: report.dateContacted || '',
      dateInspected: report.dateInspected || '',
      adjusterName: report.adjusterName || '',
      partiesPresent: report.partiesPresent || '',
      propertyDescription: report.propertyDescription || report.propertyDetails || '',
      propertyDetails: report.propertyDetails || '',
      lossDescription: report.lossDescription || '',
      damages: report.damages || '',
      recommendations: report.recommendations || ''
    };

    // Transform to template data
    const templateData = transformAIDataToTemplate(parsedAIData, userInputData);
    console.log('   Template data prepared for:', templateData.claimNumber);

    // Set up output paths
    const TEMPLATE_DIR = path.join(__dirname, '../templates');
    const OUTPUT_DIR = path.join(__dirname, '../uploads');
    const templatePath = path.join(TEMPLATE_DIR, 'CRU_Property_Report_Template.docx');

    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      console.error('❌ CRU Template not found at:', templatePath);
      // Fall back to old generator if template not found
      const reportData = {
        claimNumber: report.claimNumber,
        insuredName: report.insuredName,
        propertyAddress: report.propertyAddress,
        lossDate: report.lossDate,
        lossType: report.lossType,
        reportType: report.reportType
      };
      const exportResult = format.toLowerCase() === 'pdf'
        ? await generatePDF(reportData, report.content)
        : await generateDOCX(reportData, report.content);

      if (!exportResult.success) {
        return res.status(500).json({ success: false, error: 'Failed to export report' });
      }

      const uploadResult = await uploadReportDocument(exportResult.buffer, exportResult.fileName, userId, reportId);
      if (!uploadResult.success) {
        return res.status(500).json({ success: false, error: 'Failed to upload exported report' });
      }

      return res.json({
        success: true,
        fileName: uploadResult.fileName,
        url: uploadResult.url,
        downloadUrl: uploadResult.url,
        format: format
      });
    }

    // Create output directory
    const userOutputDir = path.join(OUTPUT_DIR, userId, 'reports', reportId);
    if (!fs.existsSync(userOutputDir)) {
      fs.mkdirSync(userOutputDir, { recursive: true });
    }

    const timestamp = Date.now();
    const outputDocxPath = path.join(userOutputDir, `${report.claimNumber}_${report.reportType || 'Report'}_${timestamp}.docx`);
    // Always generate PDF alongside DOCX (for identical conversion)
    const outputPdfPath = path.join(userOutputDir, `${report.claimNumber}_${report.reportType || 'Report'}_${timestamp}.pdf`);

    console.log('   Processing template...');
    let result;
    try {
      result = await processTemplate(
        templatePath,
        templateData,
        outputDocxPath,
        outputPdfPath,
        { strictValidation: false }
      );
    } catch (templateError) {
      console.warn('⚠️ Template processing failed:', templateError.message);

      // If PDF was requested and template conversion failed (likely missing LibreOffice)
      if (format.toLowerCase() === 'pdf') {
        console.log('🔄 Falling back to high-fidelity Puppeteer PDF generator...');
        try {
          const pdfBuffer = await generateProperPDF(report, templateData);
          const fileName = `${report.claimNumber}_${report.reportType || 'Report'}_${Date.now()}.pdf`;

          const uploadResult = await uploadReportDocument(pdfBuffer, fileName, userId, reportId);
          return res.json({
            success: true,
            fileName: uploadResult.fileName,
            url: uploadResult.url,
            downloadUrl: uploadResult.url,
            format: 'pdf',
            fallback: true,
            warning: 'LibreOffice not found. Used Puppeteer high-fidelity generator instead.'
          });
        } catch (puppeteerError) {
          console.error('❌ Puppeteer fallback also failed:', puppeteerError.message);
          // If Puppeteer also fails, try the basic PDF generator as a last resort
          const basicResult = await generatePDF(report, report.content);
          if (basicResult.success) {
            const uploadResult = await uploadReportDocument(basicResult.buffer, basicResult.fileName, userId, reportId);
            return res.json({
              success: true,
              url: uploadResult.url,
              format: 'pdf',
              fallback: true,
              warning: 'All high-fidelity generators failed. Used basic generator.'
            });
          }
        }
      }

      // If it wasn't a PDF fallback case or generatePDF also failed, rethrow
      throw templateError;
    }

    console.log('✅ Template processed successfully');

    // Upload DOCX to storage
    const docxBuffer = fs.readFileSync(result.docxPath);
    const docxFileName = path.basename(result.docxPath);
    const docxUploadResult = await uploadReportDocument(docxBuffer, docxFileName, userId, reportId);

    if (!docxUploadResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to upload DOCX report'
      });
    }

    // Upload PDF to storage (converted from DOCX)
    let pdfUploadResult = null;
    if (result.pdfPath && fs.existsSync(result.pdfPath)) {
      const pdfBuffer = fs.readFileSync(result.pdfPath);
      const pdfFileName = path.basename(result.pdfPath);
      pdfUploadResult = await uploadReportDocument(pdfBuffer, pdfFileName, userId, reportId);
    }

    console.log('✅ Documents saved - DOCX:', docxUploadResult.fileName, 'PDF:', pdfUploadResult?.fileName || 'N/A');

    // Return appropriate response based on requested format
    if (format.toLowerCase() === 'pdf') {
      // PDF was explicitly requested
      res.json({
        success: true,
        fileName: pdfUploadResult?.fileName || docxUploadResult.fileName,
        url: pdfUploadResult?.url || docxUploadResult.url,
        downloadUrl: pdfUploadResult?.url || docxUploadResult.url,
        format: 'pdf'
      });
    } else {
      // DOCX requested - return both DOCX and its PDF conversion
      res.json({
        success: true,
        fileName: docxUploadResult.fileName,
        url: docxUploadResult.url,
        downloadUrl: docxUploadResult.url,
        format: 'docx',
        // Include PDF conversion for automatic download
        pdfFileName: pdfUploadResult?.fileName,
        pdfUrl: pdfUploadResult?.url,
        pdfDownloadUrl: pdfUploadResult?.url,
        hasPdfConversion: !!pdfUploadResult
      });
    }

  } catch (error) {
    console.error('Export report error:', error);
    console.error('Export error stack:', error.stack);
    console.error('Export error details:', {
      reportId: req.params.id,
      format: req.body.format,
      userId: req.user?.userId
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export report'
    });
  }
});

/**
 * POST /api/reports/:id/images
 * Upload images for a report (PROTECTED - requires authentication)
 * Now supports unlimited images (up to 100 per batch)
 */
router.post('/:id/images', authenticateToken, upload.array('images', 100), async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.id;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No images provided'
      });
    }

    // Upload images to Firebase Storage
    const uploadPromises = files.map(file =>
      uploadImage({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype
      }, userId, reportId)
    );

    const uploadResults = await Promise.all(uploadPromises);

    const successfulUploads = uploadResults.filter(r => r.success);

    // Update report document with image URLs
    if (successfulUploads.length > 0) {
      const { getFirestore } = require('../config/firebase');
      const db = getFirestore();
      const reportRef = db.collection('reports').doc(reportId);

      const imageUrls = successfulUploads.map(upload => ({
        url: upload.url,
        fileName: upload.fileName
      }));

      await reportRef.update({
        images: imageUrls,
        updatedAt: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      uploaded: successfulUploads.length,
      total: files.length,
      images: successfulUploads
    });

  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/reports/analyze-images
 * Analyze damage images with AI (PROTECTED - requires authentication)
 * Now supports unlimited images for analysis
 */
router.post('/analyze-images', authenticateToken, upload.array('images', 100), async (req, res) => {
  try {
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No images provided'
      });
    }

    const images = files.map((file, index) => ({
      id: `image_${index}`,
      name: file.originalname,
      data: file.buffer.toString('base64')
    }));

    const result = await analyzeDamageImages(images);

    res.json(result);

  } catch (error) {
    console.error('Image analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/reports/:id/export-template
 * Export report using CRU Group template (PROTECTED - requires authentication)
 */
router.post('/:id/export-template', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.id;
    const { templatePath } = req.body;

    console.log('📄 Template export requested - Report ID:', reportId);

    const reportResult = await getReportById(reportId, userId);
    if (!reportResult.success) {
      return res.status(404).json(reportResult);
    }

    const report = reportResult.report;

    const userInputData = {
      claimNumber: report.claimNumber,
      policyNumber: report.policyNumber || '',
      insuredName: report.insuredName,
      insuredPhone: report.insuredPhone || '',
      insuredEmail: report.insuredEmail || '',
      propertyAddress: report.propertyAddress,
      lossDate: report.lossDate,
      lossType: report.lossType,
      reportType: report.reportType || 'Initial Inspection',
      dateReceived: report.dateReceived || '',
      dateContacted: report.dateContacted || '',
      dateInspected: report.dateInspected || '',
      adjusterName: report.adjusterName || '',
      partiesPresent: report.partiesPresent || '',
      propertyDescription: report.propertyDescription || ''
    };

    const aiData = report.aiGeneratedContent || {};

    const result = await generateReportFromTemplate(
      templatePath || null,
      aiData,
      userInputData,
      userId,
      reportId
    );

    res.json({
      success: true,
      reportId: result.reportId,
      docxUrl: result.docxUrl,
      pdfUrl: result.pdfUrl,
      docxPath: result.docxPath,
      pdfPath: result.pdfPath
    });

  } catch (error) {
    console.error('Template export error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export report from template'
    });
  }
});

/**
 * POST /api/reports/generate-from-template
 * Generate a new report directly using template processor (PROTECTED)
 */
router.post('/generate-from-template', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { templateData, userInputData, templatePath } = req.body;

    if (!userInputData || !userInputData.claimNumber) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: claimNumber'
      });
    }

    const limitsCheck = await checkUserLimits(userId);
    if (!limitsCheck.canGenerate) {
      return res.status(403).json({
        success: false,
        error: `Report limit reached for ${limitsCheck.tier} tier.`
      });
    }

    let aiData = templateData || {};

    if (!templateData || Object.keys(templateData).length === 0) {
      console.log('Generating AI content for template...');
      const aiResult = await generateInsuranceReport(userInputData);
      if (aiResult.success) {
        aiData = aiResult.structuredContent || {};
      }
    }

    const result = await generateReportFromTemplate(
      templatePath || null,
      aiData,
      userInputData,
      userId
    );

    await trackReportUsage(userId);

    res.json({
      success: true,
      reportId: result.reportId,
      docxUrl: result.docxUrl,
      pdfUrl: result.pdfUrl
    });

  } catch (error) {
    console.error('Generate from template error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate report from template'
    });
  }
});

module.exports = router;
