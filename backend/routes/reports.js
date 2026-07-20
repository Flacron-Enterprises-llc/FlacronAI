const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getFirestore } = require('../config/firebase');
const { authenticateAny, authenticateToken } = require('../middleware/auth');
const { generateReport, analyzeImages, checkQuality, checkAIHealth } = require('../services/aiService');
const { generatePDF } = require('../utils/properPdfGenerator');
const { generateDOCX } = require('../utils/documentGenerator');
const { addWatermarkToPDF } = require('../services/watermarkService');
const {
  reportImageObject, exportObject, uploadBuffer, downloadBuffer, deleteObjects,
} = require('../config/storage');
const { getTier, canGenerate } = require('../config/tiers');

// Multer holds uploads in memory; buffers are then persisted to Firebase Storage.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 100, fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type ${file.mimetype} not allowed`));
  },
});

// Upload multer memory files to Storage under a report; returns object paths.
const persistReportImages = async (uid, reportId, files = []) => {
  const uploads = files.map((f, i) => {
    const ext = (path.extname(f.originalname).toLowerCase() || '.jpg');
    const name = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}${ext}`;
    const objectPath = reportImageObject(uid, reportId, name);
    return uploadBuffer(objectPath, f.buffer, f.mimetype).then(() => objectPath);
  });
  return Promise.all(uploads);
};

// Shape multer memory files for the vision API (buffers, no disk reads).
const toImageInputs = (files = []) => files.map((f) => ({ buffer: f.buffer, mimetype: f.mimetype }));

// Helper: check and reset monthly usage
const checkAndResetMonthly = async (db, userId) => {
  const userDoc = await db.collection('users').doc(userId).get();
  const data = userDoc.data() || {};

  if (data.monthResetDate && new Date() > new Date(data.monthResetDate)) {
    const nextReset = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString();
    await db.collection('users').doc(userId).update({ reportsThisMonth: 0, monthResetDate: nextReset });
    return { ...data, reportsThisMonth: 0 };
  }
  return data;
};

// GET /api/reports/ai-status
router.get('/ai-status', async (req, res) => {
  try {
    const status = await checkAIHealth();
    return res.json({ success: true, ...status });
  } catch (err) {
    return res.json({ success: true, anthropic: 'offline', watsonx: 'offline', primary: 'none' });
  }
});

// POST /api/reports/generate
router.post('/generate', authenticateAny, (req, res, next) => {
  req.reportId = uuidv4();
  next();
}, imageUpload.array('images', 100), async (req, res) => {
  const db = getFirestore();

  try {
    const userData = await checkAndResetMonthly(db, req.user.uid);
    const tier = getTier(userData.tier || 'starter');
    const reportsThisMonth = userData.reportsThisMonth || 0;

    if (!canGenerate(userData.tier, reportsThisMonth)) {
      return res.status(429).json({
        success: false,
        error: `Monthly report limit reached (${tier.reportsPerMonth} reports). Upgrade your plan.`,
        code: 'LIMIT_EXCEEDED',
        limit: tier.reportsPerMonth,
        used: reportsThisMonth,
      });
    }

    const {
      claimNumber, insuredName, propertyAddress, lossDate, lossType, reportType,
      additionalNotes, propertyDetails, lossDescription, damagesObserved, recommendations,
    } = req.body;

    // Validate required fields
    if (!claimNumber || !insuredName || !propertyAddress || !lossDate || !lossType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        code: 'VALIDATION_ERROR',
        required: ['claimNumber', 'insuredName', 'propertyAddress', 'lossDate', 'lossType'],
      });
    }

    const reportId = req.reportId;

    // Analyze images from in-memory buffers, then persist them to Storage.
    let imageAnalysis = null;
    let imagePaths = [];
    if (req.files && req.files.length > 0) {
      try {
        imageAnalysis = await analyzeImages(toImageInputs(req.files));
      } catch (imgErr) {
        console.warn('Image analysis failed:', imgErr.message);
      }
      imagePaths = await persistReportImages(req.user.uid, reportId, req.files);
    }

    const reportData = {
      claimNumber, insuredName, propertyAddress, lossDate, lossType,
      reportType: reportType || 'Initial', additionalNotes,
      propertyDetails, lossDescription, damagesObserved, recommendations,
    };

    // Generate report
    const { content, modelUsed } = await generateReport(reportData, imageAnalysis);
    const qualityCheck = await checkQuality(content);

    const reportDoc = {
      id: reportId,
      userId: req.user.uid,
      claimNumber,
      insuredName,
      propertyAddress,
      lossDate,
      lossType,
      reportType: reportType || 'Initial',
      additionalNotes: additionalNotes || '',
      propertyDetails: propertyDetails || '',
      lossDescription: lossDescription || '',
      damagesObserved: damagesObserved || '',
      recommendations: recommendations || '',
      content,
      modelUsed,
      imageAnalysis,
      imagePaths,
      imageCount: imagePaths.length,
      qualityScore: qualityCheck.score,
      status: 'completed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clientId: req.body.clientId || null,
    };

    await db.collection('reports').doc(reportId).set(reportDoc);
    await db.collection('users').doc(req.user.uid).set({
      reportsGenerated: (userData.reportsGenerated || 0) + 1,
      reportsThisMonth: reportsThisMonth + 1,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return res.status(201).json({ success: true, report: reportDoc });
  } catch (err) {
    console.error('Report generation error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Report generation failed', code: 'GENERATION_ERROR' });
  }
});

// GET /api/reports
router.get('/', authenticateAny, async (req, res) => {
  try {
    const db = getFirestore();
    const { limit = 20, page = 1, lossType, status, startDate, endDate, search } = req.query;
    const lim = Math.min(parseInt(limit), 100);

    const snapshot = await db.collection('reports').where('userId', '==', req.user.uid).get();
    let reports = snapshot.docs.map(d => {
      const data = d.data();
      // Don't return full content in list view
      return { id: d.id, ...data, content: data.content ? data.content.substring(0, 300) + '...' : '' };
    });

    reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    // Hide archived reports by default unless the caller explicitly requests them
    if (status !== 'archived') {
      reports = reports.filter(r => r.status !== 'archived');
    }
    if (search) {
      const q = search.toLowerCase();
      reports = reports.filter(r =>
        (r.claimNumber || '').toLowerCase().includes(q) ||
        (r.insuredName || '').toLowerCase().includes(q) ||
        (r.propertyAddress || '').toLowerCase().includes(q) ||
        (r.lossType || '').toLowerCase().includes(q)
      );
    }
    if (lossType) reports = reports.filter(r => r.lossType === lossType);
    if (status) reports = reports.filter(r => r.status === status);
    if (startDate) reports = reports.filter(r => r.createdAt >= startDate);
    if (endDate) reports = reports.filter(r => r.createdAt <= endDate);

    const total = reports.length;
    const offset = (parseInt(page) - 1) * lim;
    return res.json({
      success: true,
      data: reports.slice(offset, offset + lim),
      total,
      page: parseInt(page),
      limit: lim,
      hasMore: offset + lim < total,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch reports', code: 'FETCH_ERROR' });
  }
});

// GET /api/reports/:id
router.get('/:id', authenticateAny, async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('reports').doc(req.params.id).get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    return res.json({ success: true, report: { id: doc.id, ...doc.data() } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch report', code: 'FETCH_ERROR' });
  }
});

// PUT /api/reports/:id
router.put('/:id', authenticateAny, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }

    const allowed = ['content', 'status', 'additionalNotes', 'clientId'];
    const updates = { updatedAt: new Date().toISOString() };
    allowed.forEach(field => { if (req.body[field] !== undefined) updates[field] = req.body[field]; });

    await ref.update(updates);
    return res.json({ success: true, message: 'Report updated', updates });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update report', code: 'UPDATE_ERROR' });
  }
});

// DELETE /api/reports/:id
router.delete('/:id', authenticateAny, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }

    const permanent = req.query.permanent === 'true';

    if (permanent) {
      const data = doc.data();
      // Delete associated images from Storage
      if (data.imagePaths && data.imagePaths.length) {
        await deleteObjects(data.imagePaths);
      }
      await ref.delete();
      return res.json({ success: true, message: 'Report permanently deleted' });
    } else {
      await ref.update({ status: 'archived', updatedAt: new Date().toISOString() });
      return res.json({ success: true, message: 'Report archived' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to delete report', code: 'DELETE_ERROR' });
  }
});

// POST /api/reports/:id/export
router.post('/:id/export', authenticateAny, async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('reports').doc(req.params.id).get();
    if (!doc.exists || doc.data().userId !== req.user.uid || doc.data().status === 'archived') {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }

    const report = { id: doc.id, ...doc.data() };
    const { format = 'pdf', includeImages = true } = req.body;

    // Get user data for branding
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userData = userDoc.data() || {};
    const tier = getTier(userData.tier || 'starter');

    const safeClaimNum = (report.claimNumber || report.id || 'report').replace(/[^a-zA-Z0-9]/g, '_');
    const filenameBase = `report_${safeClaimNum}_${Date.now()}`;

    // Get white-label config if enterprise
    let wlConfig = null;
    if (tier.whiteLabel) {
      const wlSnap = await db.collection('enterpriseClients').where('userId', '==', req.user.uid).limit(1).get();
      if (!wlSnap.empty) wlConfig = wlSnap.docs[0].data();
    }

    // When white-label config exists with a company name, always hide FlacronAI branding
    const hasWhiteLabel = !!(wlConfig?.companyName);
    const logoObjectPath = wlConfig?.logoPath || userData.logoPath || null;
    const pdfOptions = {
      companyName: wlConfig?.companyName || userData.company || 'FlacronAI',
      primaryColor: wlConfig?.primaryColor ? hexToRgb(wlConfig.primaryColor) : [249, 115, 22],
      watermark: tier.watermark,
      watermarkText: 'Generated by FlacronAI — Upgrade to remove watermark',
      reportFooter: wlConfig?.reportFooter || userData.reportFooter || null,
      hideFlacronBranding: hasWhiteLabel || wlConfig?.hideFlacronBranding || false,
    };

    // Pull branding logo + report photos from Storage as buffers (best-effort).
    if (logoObjectPath) {
      try { pdfOptions.logoBuffer = await downloadBuffer(logoObjectPath); } catch { /* logo optional */ }
    }
    if (includeImages && (report.imagePaths || []).length) {
      const imgs = await Promise.all(
        report.imagePaths.map((p) => downloadBuffer(p).catch(() => null)),
      );
      pdfOptions.images = imgs.filter(Boolean);
    }

    let buffer;
    let ext;
    let contentType;

    if (format === 'pdf') {
      ext = 'pdf';
      contentType = 'application/pdf';
      buffer = await generatePDF(report, pdfOptions);
      // Apply watermark overlay if starter tier
      if (tier.watermark) {
        try {
          buffer = await addWatermarkToPDF(buffer, pdfOptions.watermarkText, null);
        } catch (wmErr) {
          console.warn('Watermark failed, returning unwatermarked PDF:', wmErr.message);
        }
      }
    } else if (format === 'docx') {
      ext = 'docx';
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      buffer = await generateDOCX(report, {
        companyName: pdfOptions.companyName,
        hideFlacronBranding: pdfOptions.hideFlacronBranding,
      });
    } else if (format === 'html') {
      ext = 'html';
      contentType = 'text/html';
      buffer = Buffer.from(generateHTML(report, pdfOptions), 'utf8');
    } else {
      return res.status(400).json({ success: false, error: 'Invalid format. Use pdf, docx, or html', code: 'INVALID_FORMAT' });
    }

    const filename = `${filenameBase}.${ext}`;
    await uploadBuffer(exportObject(req.user.uid, filename), buffer, contentType);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const downloadUrl = `/api/reports/${req.params.id}/download?file=${filename}`;

    return res.json({ success: true, downloadUrl, expiresAt, format, filename });
  } catch (err) {
    console.error('Export error:', err.stack || err.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Export failed', code: 'EXPORT_ERROR', detail: err.stack });
  }
});

// GET /api/reports/:id/download
router.get('/:id/download', authenticateAny, async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('reports').doc(req.params.id).get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }

    const filename = req.query.file;
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid filename', code: 'INVALID_FILE' });
    }

    let buffer;
    try {
      buffer = await downloadBuffer(exportObject(req.user.uid, filename));
    } catch {
      return res.status(404).json({ success: false, error: 'File not found or expired', code: 'FILE_NOT_FOUND' });
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.html': 'text/html' };
    const mime = mimeTypes[ext] || 'application/octet-stream';

    const inline = req.query.inline === 'true';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Download failed', code: 'DOWNLOAD_ERROR' });
  }
});

// POST /api/reports/:id/images — add images to existing report
router.post('/:id/images', authenticateAny, (req, res, next) => {
  req.reportId = req.params.id;
  next();
}, imageUpload.array('images', 100), async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }

    const existingPaths = doc.data().imagePaths || [];

    let newAnalysis = null;
    let newPaths = [];
    if (req.files && req.files.length > 0) {
      try { newAnalysis = await analyzeImages(toImageInputs(req.files)); } catch {}
      newPaths = await persistReportImages(req.user.uid, req.params.id, req.files);
    }

    await ref.update({
      imagePaths: [...existingPaths, ...newPaths],
      imageCount: existingPaths.length + newPaths.length,
      imageAnalysis: newAnalysis || doc.data().imageAnalysis,
      updatedAt: new Date().toISOString(),
    });

    return res.json({ success: true, message: `${newPaths.length} images added`, imageAnalysis: newAnalysis });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to add images', code: 'IMAGE_ERROR' });
  }
});

// POST /api/reports/analyze-images — analyze without creating report
router.post('/analyze-images', authenticateAny, imageUpload.array('images', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, error: 'No images provided', code: 'NO_IMAGES' });

    // Analysis-only endpoint: buffers stay in memory, nothing persisted.
    const analysis = await analyzeImages(toImageInputs(req.files));
    return res.json({ success: true, analysis });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Image analysis failed', code: 'ANALYSIS_ERROR' });
  }
});

// Helper
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [99, 102, 241];
};

const generateHTML = (report, options) => {
  const { companyName, primaryColor, hideFlacronBranding } = options;
  const [r, g, b] = primaryColor;
  const accentHex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;

  const contentHtml = (report.content || '')
    .replace(/^# (.*$)/gm, `<h1 style="color:${accentHex}">$1</h1>`)
    .replace(/^## (.*$)/gm, `<h2 style="background:${accentHex};color:white;padding:10px 15px;border-radius:4px;">$1</h2>`)
    .replace(/^### (.*$)/gm, '<h3 style="color:#1e293b">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Insurance Report — ${report.claimNumber}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 40px 20px; color: #374151; line-height: 1.6; }
  .header { background: ${accentHex}; color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px; }
  .header h1 { margin: 0 0 10px 0; font-size: 24px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px; }
  .meta-item { background: rgba(255,255,255,0.1); padding: 10px; border-radius: 4px; }
  .meta-label { font-size: 11px; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; }
  .meta-value { font-size: 15px; font-weight: 600; }
  h2 { background: ${accentHex}; color: white; padding: 10px 15px; border-radius: 4px; }
  li { margin: 5px 0; }
  .footer { margin-top: 60px; border-top: 2px solid #e2e8f0; padding-top: 20px; color: #94a3b8; font-size: 12px; text-align: center; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="header">
  <p style="margin:0 0 5px 0;font-size:12px;opacity:0.8;letter-spacing:2px;">${hideFlacronBranding ? companyName.toUpperCase() : 'FLACRONAI'}</p>
  <h1>INSURANCE INSPECTION REPORT</h1>
  <div class="meta-grid">
    <div class="meta-item"><div class="meta-label">Claim Number</div><div class="meta-value">${report.claimNumber}</div></div>
    <div class="meta-item"><div class="meta-label">Report Type</div><div class="meta-value">${report.reportType || 'Initial'}</div></div>
    <div class="meta-item"><div class="meta-label">Insured Name</div><div class="meta-value">${report.insuredName}</div></div>
    <div class="meta-item"><div class="meta-label">Date of Loss</div><div class="meta-value">${report.lossDate}</div></div>
    <div class="meta-item"><div class="meta-label">Loss Type</div><div class="meta-value">${report.lossType}</div></div>
    <div class="meta-item"><div class="meta-label">Report Date</div><div class="meta-value">${new Date().toLocaleDateString()}</div></div>
  </div>
</div>
${contentHtml}
<div class="footer">
  <p>Generated by ${hideFlacronBranding ? companyName : 'FlacronAI'} | ${new Date().toISOString()}</p>
  <p>Property Address: ${report.propertyAddress}</p>
</div>
</body>
</html>`;
};

module.exports = router;
