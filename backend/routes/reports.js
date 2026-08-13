const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getFirestore } = require('../config/firebase');
const { authenticateAny, requireApiScope } = require('../middleware/auth');
const reportsRead = requireApiScope('reports:read');
const reportsWrite = requireApiScope('reports:write');
const reportsGenerate = requireApiScope('reports:generate');
const reportsExport = requireApiScope('reports:export');
const { generateReport, analyzeImages, checkQuality, checkAIHealth, suggestReportSection } = require('../services/aiService');
const { generatePDF } = require('../utils/properPdfGenerator');
const { generateDOCX } = require('../utils/documentGenerator');
const { addWatermarkToPDF } = require('../services/watermarkService');
const {
  reportImageObject, exportObject, uploadBuffer, downloadBuffer, deleteObjects,
} = require('../config/storage');
const { isValidImageBuffer } = require('../utils/imageValidation');
const { getTier, canGenerate } = require('../config/tiers');
const { recordAuditLog } = require('../services/auditLogService');
const { emitEvent } = require('../services/webhookService');
const { getClaim, getClient } = require('../services/crmService');

// Reject any uploaded file whose actual bytes aren't a real image (defeats a
// spoofed mimetype). Returns the offending filename, or null if all are valid.
const firstInvalidImage = (files = []) => {
  for (const f of files) {
    if (!isValidImageBuffer(f.buffer)) return f.originalname || 'unnamed file';
  }
  return null;
};

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

// Append a snapshot to reports/{id}/versions for history + audit trail (T-2.13).
// action: 'generated' | 'edited' | 'approved'. Best-effort — never blocks the request.
const recordVersion = async (ref, { action, by, content = null, note = '' }) => {
  try {
    await ref.collection('versions').add({
      action,
      by: by || 'system',
      note,
      content,
      at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[versions] record failed:', e.message);
  }
};

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

// ── REPORT TEMPLATES (T-2.10) ────────────────────────────────────────────────
// Saved, reusable sets of wizard field values, scoped per user. Defined BEFORE
// the /:id routes so GET /templates isn't captured by GET /:id.
const TEMPLATE_FIELDS = ['lossType', 'reportType', 'propertyDetails', 'lossDescription', 'damagesObserved', 'recommendations', 'additionalNotes'];

// GET /api/reports/templates — list the user's templates
router.get('/templates', authenticateAny, reportsRead, async (req, res) => {
  try {
    const db = getFirestore();
    const snap = await db.collection('reportTemplates').where('userId', '==', req.user.uid).get();
    const templates = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return res.json({ success: true, templates });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch templates', code: 'TEMPLATES_ERROR' });
  }
});

// POST /api/reports/templates — save a template
router.post('/templates', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, error: 'Template name is required', code: 'VALIDATION_ERROR' });

    const fields = {};
    TEMPLATE_FIELDS.forEach(f => { if (req.body.fields?.[f] !== undefined) fields[f] = req.body.fields[f]; });

    const db = getFirestore();
    const id = uuidv4();
    const template = { id, userId: req.user.uid, name, fields, createdAt: new Date().toISOString() };
    await db.collection('reportTemplates').doc(id).set(template);
    return res.status(201).json({ success: true, template });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to save template', code: 'TEMPLATE_SAVE_ERROR' });
  }
});

// DELETE /api/reports/templates/:tid — delete a template
router.delete('/templates/:tid', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reportTemplates').doc(req.params.tid);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Template not found', code: 'NOT_FOUND' });
    }
    await ref.delete();
    return res.json({ success: true, message: 'Template deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to delete template', code: 'TEMPLATE_DELETE_ERROR' });
  }
});

// POST /api/reports/generate
router.post('/generate', authenticateAny, reportsGenerate, (req, res, next) => {
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

    let {
      claimNumber, insuredName, propertyAddress, lossDate, lossType,
    } = req.body;
    const { reportType, additionalNotes, propertyDetails, lossDescription, damagesObserved, recommendations } = req.body;

    // If generating against a real CRM claim (Agency/Enterprise), the server -- not
    // the client -- is the source of truth for these fields, so the report can never
    // drift from the claim it's linked to.
    let linkedClientId = req.body.clientId || null;
    if (req.body.claimId) {
      let claim;
      try {
        claim = await getClaim(req.user.uid, req.body.claimId);
      } catch {
        return res.status(404).json({ success: false, error: 'Claim not found', code: 'CLAIM_NOT_FOUND' });
      }
      claimNumber = claim.claimNumber;
      propertyAddress = claim.propertyAddress || propertyAddress;
      lossDate = claim.lossDate || lossDate;
      lossType = claim.lossType || lossType;
      linkedClientId = claim.clientId || null;
      if (claim.clientId) {
        try {
          const client = await getClient(req.user.uid, claim.clientId);
          insuredName = client.name;
        } catch { /* linked client may have been deleted since -- keep whatever was submitted */ }
      }
    }

    // Validate required fields
    if (!claimNumber || !insuredName || !propertyAddress || !lossDate || !lossType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        code: 'VALIDATION_ERROR',
        required: ['claimNumber', 'insuredName', 'propertyAddress', 'lossDate', 'lossType'],
      });
    }

    // Reject obviously malformed/oversized input before it reaches the AI prompt.
    // Checked against the resolved values (claim/client data when claimId was used,
    // otherwise the raw submission) -- not req.body directly, since those may differ.
    const fieldValues = {
      claimNumber, insuredName, propertyAddress, lossType, reportType,
      additionalNotes, propertyDetails, lossDescription, damagesObserved, recommendations,
    };
    const fieldLimits = {
      claimNumber: 50, insuredName: 200, propertyAddress: 300, lossType: 100, reportType: 100,
      additionalNotes: 5000, propertyDetails: 5000, lossDescription: 5000, damagesObserved: 5000, recommendations: 5000,
    };
    for (const [field, max] of Object.entries(fieldLimits)) {
      const value = fieldValues[field];
      if (typeof value === 'string' && value.length > max) {
        return res.status(400).json({ success: false, error: `${field} exceeds the ${max}-character limit`, code: 'VALIDATION_ERROR' });
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lossDate)) {
      return res.status(400).json({ success: false, error: 'Date of loss must be a valid date (YYYY-MM-DD)', code: 'VALIDATION_ERROR' });
    }

    const reportId = req.reportId;

    // Reject spoofed/non-image uploads before doing any work.
    const badFile = firstInvalidImage(req.files);
    if (badFile) {
      return res.status(400).json({ success: false, error: `"${badFile}" is not a valid image file`, code: 'INVALID_IMAGE' });
    }

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
    const { content, modelUsed } = await generateReport(reportData, imageAnalysis, imagePaths.length);
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
      // Golden Rule #3: AI output is a DRAFT until a human reviews + approves it.
      status: 'draft',
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clientId: linkedClientId,
      claimId: req.body.claimId || null,
    };

    await db.collection('reports').doc(reportId).set(reportDoc);
    await recordVersion(db.collection('reports').doc(reportId), {
      action: 'generated', by: req.user.email || req.user.uid, content, note: `Generated via ${modelUsed}`,
    });
    await db.collection('users').doc(req.user.uid).set({
      reportsGenerated: (userData.reportsGenerated || 0) + 1,
      reportsThisMonth: reportsThisMonth + 1,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    // Fire-and-forget outbound webhook (never blocks/breaks the response).
    emitEvent(req.user.uid, 'report.generated', {
      reportId,
      status: 'draft',
      claimNumber: reportDoc.claimNumber || null,
      createdAt: reportDoc.createdAt,
    }).catch(() => {});

    return res.status(201).json({ success: true, report: reportDoc });
  } catch (err) {
    console.error('Report generation error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Report generation failed', code: 'GENERATION_ERROR' });
  }
});

// GET /api/reports
router.get('/', authenticateAny, reportsRead, async (req, res) => {
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
router.get('/:id', authenticateAny, reportsRead, async (req, res) => {
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

// POST /api/reports/:id/sections/suggest
// Generates a detached proposal only. It never writes report content or changes status;
// the reviewer must explicitly accept it in the editor and then save (Golden Rule #3).
router.post('/:id/sections/suggest', authenticateAny, reportsGenerate, async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!title || title.length > 200 || body.length > 12000) {
      return res.status(400).json({ success: false, error: 'A valid section title and body of at most 12,000 characters are required.', code: 'INVALID_SECTION' });
    }
    const db = getFirestore();
    const doc = await db.collection('reports').doc(req.params.id).get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const report = doc.data();
    const reportContext = [
      `Claim number: ${report.claimNumber || 'not provided'}`,
      `Loss type: ${report.lossType || 'not provided'}`,
      `Loss date: ${report.lossDate || 'not provided'}`,
      `Property address: ${report.propertyAddress || 'not provided'}`,
    ].join('\n');
    const result = await suggestReportSection({ title, body, reportContext });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('Section suggestion error:', err);
    return res.status(503).json({ success: false, error: 'Section suggestion is temporarily unavailable.', code: 'SECTION_SUGGESTION_UNAVAILABLE' });
  }
});

// PUT /api/reports/:id
router.put('/:id', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }

    // 'status' is intentionally excluded: it is system-controlled (set by
    // generation, /approve, and delete/archive) and must never be client-settable.
    const allowed = ['content', 'additionalNotes', 'clientId'];
    const updates = { updatedAt: new Date().toISOString() };
    allowed.forEach(field => { if (req.body[field] !== undefined) updates[field] = req.body[field]; });

    const contentChanged = typeof req.body.content === 'string' && req.body.content !== doc.data().content;

    // Editing the content of an already-approved report invalidates that
    // approval — it no longer reflects what the adjuster actually reviewed.
    // Reopen it as a draft so it must be re-reviewed and re-approved before
    // it can export clean again (Golden Rule #3).
    const wasReviewed = isReviewed(doc.data().status);
    if (contentChanged && wasReviewed) {
      updates.status = 'draft';
      updates.reviewedBy = null;
      updates.reviewedByUid = null;
      updates.reviewedAt = null;
      updates.reviewedFromIp = null;
      updates.versionApproved = null;
      updates.signature = null;
    }

    await ref.update(updates);

    // Record a version snapshot when the report content actually changed.
    if (contentChanged) {
      await recordVersion(ref, {
        action: wasReviewed ? 'edited_reopened' : 'edited',
        by: req.user.email || req.user.uid,
        content: req.body.content,
        note: wasReviewed ? 'Edited after approval — report reopened as draft; prior approval invalidated.' : '',
      });
    }
    if (contentChanged && wasReviewed) {
      recordAuditLog({
        actorUid: req.user.uid, actorEmail: req.user.email, action: 'report_reopened_after_edit',
        targetType: 'report', targetId: req.params.id,
        meta: { claimNumber: doc.data().claimNumber, previousStatus: doc.data().status }, req,
      });
    }
    return res.json({ success: true, message: 'Report updated', updates });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update report', code: 'UPDATE_ERROR' });
  }
});

// POST /api/reports/:id/approve — human review gate (Golden Rule #3).
// Marks a reviewed draft as finalized; only a finalized report exports clean.
router.post('/:id/approve', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }

    // Golden Rule #3: require the reviewing adjuster's identity + an explicit
    // confirmation, not just a typed name — this is the legal attestation, not a UI nicety.
    const sig = req.body?.signature || {};
    const name = String(sig.name || '').trim();
    const licenseNumber = String(sig.licenseNumber || '').trim();
    const licenseState = String(sig.licenseState || '').trim();
    const company = String(sig.company || '').trim();
    if (!name || !licenseNumber || !licenseState || !company) {
      return res.status(400).json({
        success: false,
        error: 'Full name, license number, license state, and company/firm are required to approve a report.',
        code: 'SIGNATURE_INCOMPLETE',
      });
    }
    if (req.body?.confirmReview !== true) {
      return res.status(400).json({
        success: false,
        error: 'You must confirm you have reviewed the report before approving it.',
        code: 'CONFIRMATION_REQUIRED',
      });
    }

    const versionsSoFar = (await ref.collection('versions').get()).size;

    // Persist any final edits passed alongside the approval.
    const updates = {
      status: 'finalized',
      reviewedBy: req.user.email || req.user.uid,
      reviewedByUid: req.user.uid,
      reviewedAt: new Date().toISOString(),
      reviewedFromIp: req.ip,
      versionApproved: versionsSoFar + 1,
      updatedAt: new Date().toISOString(),
    };
    if (typeof req.body?.content === 'string' && req.body.content.trim()) {
      updates.content = req.body.content;
    }
    updates.signature = {
      name: name.slice(0, 120),
      title: String(sig.title || '').slice(0, 120),
      licenseNumber: licenseNumber.slice(0, 60),
      licenseState: licenseState.slice(0, 60),
      company: company.slice(0, 200),
      confirmedAt: new Date().toISOString(),
    };
    await ref.update(updates);
    await recordVersion(ref, {
      action: 'approved',
      by: req.user.email || req.user.uid,
      content: updates.content || doc.data().content,
      note: `Reviewed and finalized by ${name} (${licenseState} ${licenseNumber}, ${company})`,
    });
    recordAuditLog({
      actorUid: req.user.uid, actorEmail: req.user.email, action: 'report_approved_finalized',
      targetType: 'report', targetId: req.params.id,
      meta: { claimNumber: doc.data().claimNumber, reviewerName: name, licenseState, licenseNumber, company }, req,
    });
    // Fire-and-forget outbound webhook (never blocks/breaks the response).
    emitEvent(req.user.uid, 'report.finalized', {
      reportId: req.params.id,
      status: 'finalized',
      claimNumber: doc.data().claimNumber || null,
      reviewedBy: updates.reviewedBy,
      reviewedAt: updates.reviewedAt,
    }).catch(() => {});
    return res.json({ success: true, message: 'Report approved and finalized', report: { id: doc.id, ...doc.data(), ...updates } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to approve report', code: 'APPROVE_ERROR' });
  }
});

// GET /api/reports/:id/versions — version history + audit trail (T-2.13)
router.get('/:id/versions', authenticateAny, reportsRead, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const snap = await ref.collection('versions').get();
    const versions = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.at < b.at ? 1 : -1)); // newest first
    return res.json({ success: true, versions });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch versions', code: 'VERSIONS_ERROR' });
  }
});

// ── SHARE LINKS (T-2.9) ──────────────────────────────────────────────────────
// POST /api/reports/:id/share — create/return a public read-only link.
// Only finalized reports can be shared (never expose an un-reviewed draft).
router.post('/:id/share', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    if (!isReviewed(doc.data().status)) {
      return res.status(400).json({ success: false, error: 'Finalize the report before sharing.', code: 'NOT_FINALIZED' });
    }
    let shareToken = doc.data().shareToken;
    if (!shareToken) {
      shareToken = uuidv4();
      await ref.update({ shareToken, sharedAt: new Date().toISOString() });
      recordAuditLog({
        actorUid: req.user.uid, actorEmail: req.user.email, action: 'report_shared',
        targetType: 'report', targetId: req.params.id, meta: { claimNumber: doc.data().claimNumber }, req,
      });
    }
    const url = `${process.env.FRONTEND_URL || ''}/shared/${shareToken}`;
    return res.json({ success: true, shareToken, url });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to create share link', code: 'SHARE_ERROR' });
  }
});

// DELETE /api/reports/:id/share — revoke the public link.
router.delete('/:id/share', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    await ref.update({ shareToken: null, sharedAt: null });
    recordAuditLog({
      actorUid: req.user.uid, actorEmail: req.user.email, action: 'report_share_revoked',
      targetType: 'report', targetId: req.params.id, req,
    });
    return res.json({ success: true, message: 'Share link revoked' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to revoke share link', code: 'SHARE_ERROR' });
  }
});

// GET /api/reports/shared/:token — PUBLIC read-only view (no auth). Finalized only.
router.get('/shared/:token', async (req, res) => {
  try {
    const db = getFirestore();
    const snap = await db.collection('reports').where('shareToken', '==', req.params.token).limit(1).get();
    if (snap.empty) return res.status(404).json({ success: false, error: 'Shared report not found', code: 'NOT_FOUND' });
    const r = snap.docs[0].data();
    if (!isReviewed(r.status)) return res.status(404).json({ success: false, error: 'Shared report not available', code: 'NOT_AVAILABLE' });
    // Expose only presentation fields — never userId, imagePaths, or internal metadata.
    return res.json({
      success: true,
      report: {
        claimNumber: r.claimNumber, insuredName: r.insuredName, propertyAddress: r.propertyAddress,
        lossType: r.lossType, lossDate: r.lossDate, reportType: r.reportType,
        content: r.content, signature: r.signature || null, reviewedAt: r.reviewedAt || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load shared report', code: 'SHARED_ERROR' });
  }
});

// A report is "reviewed" (exports clean) only once a human finalizes it.
// Legacy reports saved before the review gate used 'completed' — treat as reviewed.
const isReviewed = (status) => status === 'finalized' || status === 'approved' || status === 'completed';

// DELETE /api/reports/:id
router.delete('/:id', authenticateAny, reportsWrite, async (req, res) => {
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
      recordAuditLog({
        actorUid: req.user.uid, actorEmail: req.user.email, action: 'report_deleted_permanent',
        targetType: 'report', targetId: req.params.id,
        meta: { claimNumber: data.claimNumber, status: data.status }, req,
      });
      return res.json({ success: true, message: 'Report permanently deleted' });
    } else {
      await ref.update({ status: 'archived', updatedAt: new Date().toISOString() });
      recordAuditLog({
        actorUid: req.user.uid, actorEmail: req.user.email, action: 'report_archived',
        targetType: 'report', targetId: req.params.id, req,
      });
      return res.json({ success: true, message: 'Report archived' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to delete report', code: 'DELETE_ERROR' });
  }
});

// POST /api/reports/:id/export
router.post('/:id/export', authenticateAny, reportsExport, async (req, res) => {
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

    // Golden Rule #3: un-reviewed drafts never export as a clean final document.
    const reviewed = isReviewed(report.status);
    const safeClaimNum = (report.claimNumber || report.id || 'report').replace(/[^a-zA-Z0-9]/g, '_');
    const filenameBase = `report_${safeClaimNum}${reviewed ? '' : '_DRAFT'}_${Date.now()}`;

    // Get white-label config if enterprise
    let wlConfig = null;
    if (tier.whiteLabel) {
      const wlSnap = await db.collection('enterpriseClients').where('userId', '==', req.user.uid).limit(1).get();
      if (!wlSnap.empty) wlConfig = wlSnap.docs[0].data();
    }

    // When white-label config exists with a company name, always hide FlacronAI branding
    const hasWhiteLabel = !!(wlConfig?.companyName);
    const logoObjectPath = wlConfig?.logoPath || userData.logoPath || null;
    const draftWatermark = !reviewed; // un-reviewed drafts are always watermarked
    const watermarkText = draftWatermark
      ? 'DRAFT — PENDING ADJUSTER REVIEW'
      : 'Generated by FlacronAI — Upgrade to remove watermark';
    const pdfOptions = {
      companyName: wlConfig?.companyName || userData.company || 'FlacronAI',
      primaryColor: wlConfig?.primaryColor ? hexToRgb(wlConfig.primaryColor) : [253, 68, 3],
      watermark: tier.watermark || draftWatermark,
      watermarkText,
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
      // The final overlay below is the single authoritative PDF watermark.
      // Disable PDFKit's built-in layer here to avoid doubled/illegible marks.
      buffer = await generatePDF(report, { ...pdfOptions, watermark: false });
      // Apply watermark overlay for starter tier and/or un-reviewed drafts
      if (tier.watermark || draftWatermark) {
        // Fail closed: a draft must never be returned as a clean-looking final
        // document just because watermark post-processing failed.
        buffer = await addWatermarkToPDF(buffer, pdfOptions.watermarkText, null);
      }
    } else if (format === 'docx') {
      ext = 'docx';
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      buffer = await generateDOCX(report, {
        companyName: pdfOptions.companyName,
        hideFlacronBranding: pdfOptions.hideFlacronBranding,
        watermark: pdfOptions.watermark,
        watermarkText: pdfOptions.watermarkText,
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

    recordAuditLog({
      actorUid: req.user.uid, actorEmail: req.user.email, action: 'report_exported',
      targetType: 'report', targetId: req.params.id,
      meta: { format, claimNumber: report.claimNumber, draft: !reviewed }, req,
    });
    return res.json({ success: true, downloadUrl, expiresAt, format, filename });
  } catch (err) {
    console.error('Export error:', err.stack || err.message || err);
    // Do not leak stack traces / internals to the client (Rule #6).
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'production' ? 'Export failed' : (err.message || 'Export failed'),
      code: 'EXPORT_ERROR',
    });
  }
});

// GET /api/reports/:id/download
router.get('/:id/download', authenticateAny, reportsExport, async (req, res) => {
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
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (ext === '.html') {
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    }
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Download failed', code: 'DOWNLOAD_ERROR' });
  }
});

// POST /api/reports/:id/images — add images to existing report
router.post('/:id/images', authenticateAny, reportsWrite, (req, res, next) => {
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

    const badFile = firstInvalidImage(req.files);
    if (badFile) {
      return res.status(400).json({ success: false, error: `"${badFile}" is not a valid image file`, code: 'INVALID_IMAGE' });
    }

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
router.post('/analyze-images', authenticateAny, reportsGenerate, imageUpload.array('images', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, error: 'No images provided', code: 'NO_IMAGES' });

    const badFile = firstInvalidImage(req.files);
    if (badFile) {
      return res.status(400).json({ success: false, error: `"${badFile}" is not a valid image file`, code: 'INVALID_IMAGE' });
    }

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

  const contentHtml = escapeHtml(report.content || '')
    .replace(/^# (.*$)/gm, `<h1 style="color:${accentHex}">$1</h1>`)
    .replace(/^## (.*$)/gm, `<h2 style="background:${accentHex};color:white;padding:10px 15px;border-radius:4px;">$1</h2>`)
    .replace(/^### (.*$)/gm, '<h3 style="color:#1e293b">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/\n/g, '<br>');
  const sig = report.signature;
  const signatureHtml = sig?.name ? `<section class="signoff">
    <h2>Reviewing Adjuster Sign-Off</h2>
    <p><strong>Electronically signed by:</strong> ${escapeHtml(sig.name)}${sig.title ? `, ${escapeHtml(sig.title)}` : ''}</p>
    <p><strong>License:</strong> ${escapeHtml(sig.licenseState)} ${escapeHtml(sig.licenseNumber)}</p>
    <p><strong>Company / Firm:</strong> ${escapeHtml(sig.company)}</p>
    <p><strong>Approved:</strong> ${escapeHtml(sig.confirmedAt ? new Date(sig.confirmedAt).toLocaleString() : '')}</p>
    <p><strong>Report version:</strong> ${escapeHtml(report.versionApproved || '')}</p>
  </section>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Insurance Report - ${escapeHtml(report.claimNumber)}</title>
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
  .watermark { border: 4px solid #b91c1c; color: #991b1b; font-size: 28px; font-weight: 800; letter-spacing: 2px; margin: 0 0 24px; padding: 12px; text-align: center; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
${options.watermark ? `<div class="watermark">${escapeHtml(options.watermarkText)}</div>` : ''}
<div class="header">
  <p style="margin:0 0 5px 0;font-size:12px;opacity:0.8;letter-spacing:2px;">${hideFlacronBranding ? escapeHtml(companyName).toUpperCase() : 'FLACRONAI'}</p>
  <h1>INSURANCE INSPECTION REPORT</h1>
  <div class="meta-grid">
    <div class="meta-item"><div class="meta-label">Claim Number</div><div class="meta-value">${escapeHtml(report.claimNumber)}</div></div>
    <div class="meta-item"><div class="meta-label">Report Type</div><div class="meta-value">${escapeHtml(report.reportType || 'Initial')}</div></div>
    <div class="meta-item"><div class="meta-label">Insured Name</div><div class="meta-value">${escapeHtml(report.insuredName)}</div></div>
    <div class="meta-item"><div class="meta-label">Date of Loss</div><div class="meta-value">${escapeHtml(report.lossDate)}</div></div>
    <div class="meta-item"><div class="meta-label">Loss Type</div><div class="meta-value">${escapeHtml(report.lossType)}</div></div>
    <div class="meta-item"><div class="meta-label">Report Date</div><div class="meta-value">${new Date().toLocaleDateString()}</div></div>
  </div>
</div>
${contentHtml}
${signatureHtml}
<div class="footer">
  <p>Generated by ${hideFlacronBranding ? escapeHtml(companyName) : 'FlacronAI'} | ${new Date().toISOString()}</p>
  <p>Property Address: ${escapeHtml(report.propertyAddress)}</p>
</div>
</body>
</html>`;
};

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

router._test = { generateHTML, escapeHtml };
module.exports = router;
