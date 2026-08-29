const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getFirestore } = require('../config/firebase');
const { authenticateAny, requireApiScope, requireTeamCapability } = require('../middleware/auth');
const requireCanGenerate = requireTeamCapability('canGenerate');
const requireCanEditReports = requireTeamCapability('canEditReports');
const requireCanApprove = requireTeamCapability('canApprove');
const requireCanExport = requireTeamCapability('canExport');
const { hasCapability, resolveOrganizationId } = require('../utils/orgRoles');
const { isNotificationEnabled } = require('../utils/notificationPrefs');
const { notifyUser, NOTIFICATION_TYPES } = require('../utils/notificationService');
const {
  sendReportApprovedEmail,
  sendReportSharedEmail,
  sendReviewRequestedEmail,
  sendReviewResponseEmail,
  sendReportAccessGrantedEmail,
} = require('../services/emailService');
const {
  isValidPermission,
  getReportAccess,
  hasReportAccess,
  computeExpiresAt,
  isShareExpired,
  slugifySectionTitle,
  sanitizeCommentBody,
  sanitizeGuestName,
} = require('../utils/reportAccess');
const reportsRead = requireApiScope('reports:read');
const reportsWrite = requireApiScope('reports:write');
const reportsGenerate = requireApiScope('reports:generate');
const reportsExport = requireApiScope('reports:export');
const {
  analyzeImages,
  checkAIHealth,
  suggestReportSection,
  assistReportSection,
  SECTION_ASSIST_ACTIONS,
  // Phase 36 (Mold Assessment Supplemental Report): the supplement's single
  // structured AI call is synchronous within its own request handler (no
  // photo upload/analysis pipeline needed -- it reuses the linked report's
  // already-analyzed, reviewed photo data), so these are imported directly
  // rather than only reached via photoJobService as every other document
  // type's generation is.
  generateReport,
  checkQuality,
  buildEffectiveImageAnalysis,
} = require('../services/aiService');
const { generatePDF } = require('../utils/properPdfGenerator');
const { generateDOCX } = require('../utils/documentGenerator');
// Phase 37 (Repair Estimate with Depreciation Schedule): pure, non-AI
// dollar-math + markdown assembly -- see each module's own header comment.
const { validateAndComputeEstimate } = require('../utils/estimateCalculations');
const { buildEstimateContent } = require('../utils/estimateContent');
// Phase 38 (Invoice Document): pure, non-AI dollar-math + markdown assembly
// for an Invoice generated from an existing Repair Estimate -- see each
// module's own header comment.
const { validateAndComputeInvoice } = require('../utils/invoiceCalculations');
const { buildInvoiceContent } = require('../utils/invoiceContent');
// Phase 39 (Coverage Determination Letter): approved authoring model --
// adjuster enters every coverage decision through a structured form; AI
// drafts zero coverage/policy/payment/rights content. See each module's own
// header comment.
const { validateAndComputeCoverageLetter, validateSourceEligibility } = require('../utils/coverageLetterCalculations');
const { buildCoverageLetterContent } = require('../utils/coverageLetterContent');
const { addWatermarkToPDF } = require('../services/watermarkService');
const {
  reportDocumentObject,
  exportObject,
  uploadBuffer,
  downloadBuffer,
  deleteObjects,
} = require('../config/storage');
const {
  sanitizeReportContent,
  sanitizeInstructions,
  collectReferencedPhotoIds,
  tokenizeInline,
  parseBlockToken,
} = require('../utils/richContent');
const { isValidImageBuffer } = require('../utils/imageValidation');
const { isValidDocumentBuffer } = require('../utils/documentValidation');
const { processPhotoBatch } = require('../utils/photoBatchProcessor');
const { appendStagedPhoto, claimDraftPhotos } = require('../utils/photoDraftStaging');
const { downloadPhotosForAnalysis } = require('../utils/photoRetrieval');
const photoJobService = require('../services/photoJobService');
const { aiLimiter } = require('../middleware/rateLimiters');
const { getTier, canGenerate } = require('../config/tiers');
const { recordAuditLog } = require('../services/auditLogService');
const { emitEvent } = require('../services/webhookService');
const { getClaim, getClient } = require('../services/crmService');
const templateService = require('../services/templateService');

// Phase 5 (Generate Report Wizard Completion) -- enum allowlists for the new
// optional claim/inspection fields, validated server-side alongside the
// existing required-field checks below. Kept in sync with the frontend's
// matching constants in Dashboard.jsx.
const CLAIM_TYPES = ['Property', 'Auto', 'Commercial', 'Liability', 'Other'];
const PROPERTY_TYPES = [
  'Single-Family Home',
  'Multi-Family',
  'Condo/Townhouse',
  'Commercial',
  'Other',
];
const INSPECTION_TYPES = ['Interior', 'Exterior', 'Interior & Exterior', 'Virtual/Remote'];
const WEATHER_CONDITIONS = [
  'Clear/Sunny',
  'Partly Cloudy',
  'Overcast',
  'Rain',
  'Snow',
  'High Wind',
  'Extreme Heat',
  'Other',
];
const OCCUPANCY_STATUSES = ['Occupied', 'Vacant', 'Under Renovation', 'Unknown'];
// Mirrors the frontend's MAX_PHOTOS (Dashboard.jsx) -- enforced here too since
// photo staging (POST /photos/stage) writes directly to Storage/Firestore
// outside the /generate request that used to be the only server-side check.
const MAX_PHOTOS = 100;
const MAX_PHOTOS_MESSAGE = 'Maximum of 100 photos reached. Remove a photo to upload another.';

// Reject any uploaded file whose actual bytes aren't a real image (defeats a
// spoofed mimetype). Returns the offending filename, or null if all are valid.
const firstInvalidImage = (files = []) => {
  for (const f of files) {
    if (!isValidImageBuffer(f.buffer)) return f.originalname || 'unnamed file';
  }
  return null;
};

// Same idea for supporting documents (PDF/DOC/DOCX/TXT) -- see utils/documentValidation.js.
const firstInvalidDocument = (files = []) => {
  for (const f of files) {
    if (!isValidDocumentBuffer(f.buffer, f.originalname || ''))
      return f.originalname || 'unnamed file';
  }
  return null;
};

// Multer holds uploads in memory; buffers are then persisted to Firebase Storage.
// Phase 6 (Photo Upload & Per-Photo UX Hardening): the image fileFilter no
// longer rejects based on client-supplied mimetype -- a single mislabeled or
// unsupported file used to abort the ENTIRE multipart parse before the route
// handler ever ran (a raw 500, not even a clean 400). Every file is now
// accepted here and validated individually per-photo (magic bytes, via
// processPhotoBatch/isValidImageBuffer below), so one bad file never blocks
// the rest of the batch.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 100, fileSize: 10 * 1024 * 1024 },
});

// Single-file upload for the photo-staging endpoint below (one HTTP request
// per captured/selected photo, not a batch).
const singleImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// POST /generate accepts both photos and supporting documents in one multipart
// request (same atomic-with-report-creation pattern photos already use) -- a
// combined field-based instance, kept separate from `imageUpload` above so the
// other image-only routes (/:id/images, /analyze-images) are untouched.
// Documents keep their existing allowlisted fileFilter (unchanged, out of
// Phase 6 scope -- that phase's per-file isolation applies to photos only).
const generateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'images') return cb(null, true);
    const allowedDocs = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    if (file.fieldname !== 'documents') return cb(new Error(`Unexpected field: ${file.fieldname}`));
    if (allowedDocs.includes(file.mimetype)) return cb(null, true);
    return cb(new Error(`File type ${file.mimetype} not allowed`));
  },
}).fields([
  { name: 'images', maxCount: 100 },
  { name: 'documents', maxCount: 10 },
]);

// Upload supporting documents to Storage under the report; returns metadata
// records (not just paths, since the UI needs filename/size to display them).
const persistReportDocuments = async (uid, reportId, files = []) => {
  const uploads = files.map((f) => {
    const safeName = (f.originalname || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${safeName}`;
    const objectPath = reportDocumentObject(uid, reportId, name);
    return uploadBuffer(objectPath, f.buffer, f.mimetype).then(() => ({
      fileName: f.originalname || safeName,
      size: f.size,
      mimeType: f.mimetype,
      objectPath,
      uploadedAt: new Date().toISOString(),
    }));
  });
  return Promise.all(uploads);
};

// Shape multer memory files for the vision API (buffers, no disk reads).
const toImageInputs = (files = []) =>
  files.map((f) => ({ buffer: f.buffer, mimetype: f.mimetype }));

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

// Phase 19: reportShares is a top-level collection keyed by reportId (not a
// subcollection -- see its own header comment near POST /:id/shares), so a
// hard-deleted report must have its shares cleaned up explicitly rather than
// relying on Firestore to cascade-delete a subcollection. Best-effort, like
// recordVersion above -- never blocks the delete itself.
const deleteReportShares = async (db, reportId) => {
  try {
    const snap = await db.collection('reportShares').where('reportId', '==', reportId).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  } catch (e) {
    console.warn('[reportShares] cleanup failed:', e.message);
  }
};

// Helper: check and reset monthly usage
const checkAndResetMonthly = async (db, userId) => {
  const userDoc = await db.collection('users').doc(userId).get();
  const data = userDoc.data() || {};

  if (data.monthResetDate && new Date() > new Date(data.monthResetDate)) {
    const nextReset = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      1
    ).toISOString();
    await db
      .collection('users')
      .doc(userId)
      .update({ reportsThisMonth: 0, monthResetDate: nextReset });
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

// POST /api/reports/archived/delete-all — Phase 18 (Settings Completion,
// Data tab "file-deletion controls"). A real, bounded bulk-delete action
// distinct from full account deletion: permanently removes every report the
// caller has already archived (and its Storage files: display/original/
// thumbnail images, versions subcollection) -- deliberately scoped to
// ALREADY-ARCHIVED reports only, since Archive (Phase 12) is the user's own
// prior signal that a report is no longer wanted, not an ambiguous new
// destructive surface. Defined BEFORE the /:id routes so 'archived' is never
// captured as a report id.
router.post('/archived/delete-all', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const snap = await db.collection('reports')
      .where('userId', '==', req.user.uid)
      .where('status', '==', 'archived')
      .get();

    if (snap.empty) {
      return res.json({ success: true, deletedCount: 0, message: 'No archived reports to delete' });
    }

    for (const d of snap.docs) {
      const data = d.data();
      const paths = [
        ...(data.imagePaths || []),
        ...(data.photos || []).map((p) => p.thumbnailPath).filter(Boolean),
        ...(data.photos || []).map((p) => p.originalPath).filter(Boolean),
      ];
      if (paths.length) await deleteObjects(paths);
      // Phase 19: reportShares is top-level, not a subcollection -- recursiveDelete
      // below only cleans up reports/{id}/versions and reports/{id}/comments.
      await deleteReportShares(db, d.id);
      await db.recursiveDelete(d.ref);
    }

    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'reports_bulk_deleted',
      targetType: 'report',
      meta: { count: snap.size, statusFilter: 'archived' },
      req,
    });

    return res.json({ success: true, deletedCount: snap.size, message: `${snap.size} archived report(s) permanently deleted` });
  } catch (err) {
    console.error('[reports] archived/delete-all error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to delete archived reports', code: 'BULK_DELETE_ERROR' });
  }
});

// GET /api/reports/dashboard-summary — Phase 4 dashboard-home metrics.
// Deliberately minimal (3 numbers): "Reports This Month" already lives on the
// user profile doc and is read there by the client directly, so it isn't
// duplicated here. Broader breakdowns/trends/charts are Phase 15's job
// (Analytics) — this must not grow into a duplicate of that. Defined BEFORE
// the /:id routes so it isn't captured by GET /:id.
router.get('/dashboard-summary', authenticateAny, reportsRead, async (req, res) => {
  try {
    const db = getFirestore();
    const baseQuery = db.collection('reports').where('userId', '==', req.user.uid);

    const [awaitingSnap, completedSnap, photosSnap] = await Promise.all([
      baseQuery.where('status', '==', 'draft').count().get(),
      // Legacy statuses ('completed'/'approved') predate the current
      // draft/finalized model (see isReviewed() below) but may still exist
      // on older reports — counted as completed for accuracy.
      baseQuery.where('status', 'in', ['finalized', 'completed', 'approved']).count().get(),
      // Not using .aggregate({sum(...)}) here: summing a field alongside an
      // equality filter needs a composite Firestore index that isn't
      // provisioned for this project (confirmed via FAILED_PRECONDITION in
      // live testing). A field-masked projection scoped to this user's own
      // reports avoids that dependency without fetching full documents.
      baseQuery.select('imageCount').get(),
    ]);

    const photosAnalyzed = photosSnap.docs.reduce(
      (sum, doc) => sum + (doc.get('imageCount') || 0),
      0
    );

    return res.json({
      success: true,
      summary: {
        reportsAwaitingReview: awaitingSnap.data().count,
        reportsCompleted: completedSnap.data().count,
        photosAnalyzed,
        // Storage usage isn't tracked anywhere in this system yet (no
        // per-file/per-report byte-size accounting exists in Firestore or
        // Storage metadata reads). Reporting this honestly as unavailable
        // rather than fabricating a number (Golden Rule #1) — the frontend
        // must show this as "not yet available", not a computed 0 or guess.
        storageAvailable: false,
      },
    });
  } catch (err) {
    console.error('[Dashboard Summary] error:', err.message);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to load dashboard summary', code: 'SUMMARY_ERROR' });
  }
});

// ── REPORT TEMPLATES (T-2.10) ────────────────────────────────────────────────
// Saved, reusable sets of wizard field values, scoped per user. Defined BEFORE
// the /:id routes so GET /templates isn't captured by GET /:id.
const TEMPLATE_FIELDS = [
  'lossType',
  'reportType',
  'propertyDetails',
  'lossDescription',
  'damagesObserved',
  'recommendations',
  'additionalNotes',
];

// GET /api/reports/templates — list the user's templates
router.get('/templates', authenticateAny, reportsRead, async (req, res) => {
  try {
    const db = getFirestore();
    const snap = await db.collection('reportTemplates').where('userId', '==', req.user.uid).get();
    const templates = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return res.json({ success: true, templates });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Failed to fetch templates', code: 'TEMPLATES_ERROR' });
  }
});

// POST /api/reports/templates — save a template
router.post('/templates', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name)
      return res
        .status(400)
        .json({ success: false, error: 'Template name is required', code: 'VALIDATION_ERROR' });

    const fields = {};
    TEMPLATE_FIELDS.forEach((f) => {
      if (req.body.fields?.[f] !== undefined) fields[f] = req.body.fields[f];
    });

    const db = getFirestore();
    const id = uuidv4();
    const template = {
      id,
      userId: req.user.uid,
      name,
      fields,
      createdAt: new Date().toISOString(),
    };
    await db.collection('reportTemplates').doc(id).set(template);
    return res.status(201).json({ success: true, template });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Failed to save template', code: 'TEMPLATE_SAVE_ERROR' });
  }
});

// DELETE /api/reports/templates/:tid — delete a template
router.delete('/templates/:tid', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reportTemplates').doc(req.params.tid);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res
        .status(404)
        .json({ success: false, error: 'Template not found', code: 'NOT_FOUND' });
    }
    await ref.delete();
    return res.json({ success: true, message: 'Template deleted' });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Failed to delete template', code: 'TEMPLATE_DELETE_ERROR' });
  }
});

// ── PHOTO STAGING (mobile-capture immediate upload) ─────────────────────
// The wizard collects all required claim fields (steps 1-3) before the
// Photos step, but the report doc itself (and its once-per-report quota
// charge) is only ever created at Generate. Staging lets each captured/
// selected photo upload to Storage the moment it's ready instead of
// batching every photo into the final POST /generate request. `draftId` is
// client-generated once per wizard session; POST /generate below folds a
// draft's already-uploaded photos into the new report by downloading their
// stored bytes for analysis (same pattern as retryFailedAnalysis), so
// nothing the client already uploaded is ever re-sent.
router.post(
  '/photos/stage',
  authenticateAny,
  reportsGenerate,
  requireCanGenerate,
  singleImageUpload.single('image'),
  async (req, res) => {
    try {
      const draftId = (req.body.draftId || '').trim();
      if (!draftId) {
        return res
          .status(400)
          .json({ success: false, error: 'draftId is required', code: 'VALIDATION_ERROR' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No image provided', code: 'NO_IMAGE' });
      }

      const db = getFirestore();
      const ref = db.collection('reportDrafts').doc(draftId);
      const doc = await ref.get();
      if (doc.exists && doc.data().userId !== req.user.uid) {
        return res.status(403).json({ success: false, error: 'Not your draft', code: 'FORBIDDEN' });
      }
      const existingPhotos = doc.exists ? doc.data().photos || [] : [];
      if (existingPhotos.length >= MAX_PHOTOS) {
        return res.status(400).json({ success: false, error: MAX_PHOTOS_MESSAGE, code: 'MAX_PHOTOS' });
      }

      const existingHashes = existingPhotos
        .filter((p) => p.contentHash)
        .map((p) => ({ hash: p.contentHash, fileName: p.fileName }));
      const { records } = await processPhotoBatch(
        req.user.uid,
        draftId,
        [req.file],
        existingHashes,
        existingPhotos.length
      );
      const record = records[0];

      // Transactional append -- see backend/utils/photoDraftStaging.js for
      // why this must be a transaction (fixes a silent-data-loss race on
      // concurrent multi-file uploads to the same draftId).
      const photos = await appendStagedPhoto(db, {
        draftId,
        uid: req.user.uid,
        record,
        maxPhotos: MAX_PHOTOS,
      });

      return res.status(201).json({
        success: true,
        photo: record,
        uploadedCount: photos.filter((p) => p.status === 'uploaded').length,
      });
    } catch (err) {
      if (err.code === 'MAX_PHOTOS') {
        return res.status(400).json({ success: false, error: err.message, code: 'MAX_PHOTOS' });
      }
      return res.status(500).json({ success: false, error: 'Photo upload failed', code: 'STAGE_ERROR' });
    }
  }
);

// GET /api/reports/photos/stage/:draftId — resume after a page refresh.
router.get('/photos/stage/:draftId', authenticateAny, reportsGenerate, async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('reportDrafts').doc(req.params.draftId).get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.json({ success: true, photos: [] });
    }
    return res.json({ success: true, photos: doc.data().photos || [] });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load draft', code: 'STAGE_GET_ERROR' });
  }
});

// GET /api/reports/photos/stage/:draftId/:photoId/image — serves a staged
// photo's bytes (thumbnail or display) so the wizard can re-render it after
// a resume, mirroring GET /:id/photos/:photoId/image for real reports.
router.get('/photos/stage/:draftId/:photoId/image', authenticateAny, reportsGenerate, async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('reportDrafts').doc(req.params.draftId).get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Photo not found', code: 'PHOTO_NOT_FOUND' });
    }
    const record = (doc.data().photos || []).find((p) => p.id === req.params.photoId);
    const objectPath =
      req.query.variant === 'thumbnail' && record?.thumbnailPath ? record.thumbnailPath : record?.objectPath;
    if (!objectPath) {
      return res.status(404).json({ success: false, error: 'Photo not found', code: 'PHOTO_NOT_FOUND' });
    }
    const buffer = await downloadBuffer(objectPath);
    res.setHeader('Content-Type', record.mimeType || 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(buffer);
  } catch {
    return res.status(404).json({ success: false, error: 'Photo not found or expired', code: 'PHOTO_NOT_FOUND' });
  }
});

// DELETE /api/reports/photos/stage/:draftId/:photoId — remove one staged photo.
router.delete('/photos/stage/:draftId/:photoId', authenticateAny, reportsGenerate, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reportDrafts').doc(req.params.draftId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Draft not found', code: 'NOT_FOUND' });
    }
    const photos = doc.data().photos || [];
    const target = photos.find((p) => p.id === req.params.photoId);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Photo not found', code: 'PHOTO_NOT_FOUND' });
    }
    await ref.update({
      photos: photos.filter((p) => p.id !== req.params.photoId),
      updatedAt: new Date().toISOString(),
    });
    deleteObjects([target.originalPath, target.objectPath, target.thumbnailPath].filter(Boolean)).catch(() => {});
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to remove photo', code: 'STAGE_DELETE_ERROR' });
  }
});

// POST /api/reports/generate
router.post(
  '/generate',
  authenticateAny,
  reportsGenerate,
  requireCanGenerate,
  aiLimiter,
  (req, res, next) => {
    req.reportId = uuidv4();
    next();
  },
  generateUpload,
  async (req, res) => {
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

      let { claimNumber, insuredName, insuredEmail, propertyAddress, lossDate, lossType } =
        req.body;
      const {
        reportType,
        additionalNotes,
        propertyDetails,
        lossDescription,
        damagesObserved,
        recommendations,
      } = req.body;

      // Phase 5 (Generate Report Wizard Completion) -- all optional, additive
      // claim/inspection fields. Backward-compatible: omitted entirely by any
      // older client, and never added to the required-fields check below.
      const {
        policyNumber,
        insuranceCompany,
        insuredFirstName,
        insuredLastName,
        claimType,
        propertyType,
        propertyStreet,
        propertyCity,
        propertyState,
        propertyZip,
        inspectionDate,
        inspectionTime,
        inspectorName,
        inspectorId,
        inspectionType,
        weatherConditions,
        occupancyStatus,
        contactPresent,
        contactName,
        // Phase 31 (Liability Investigation Report): optional, only meaningful
        // when claimType === 'Liability' -- validated the same way as the
        // rest of the optionalFieldLimits block below.
        claimantName,
        claimantContact,
        // Phase 32 (Commercial Property Inspection Report): optional, only
        // meaningful when claimType === 'Commercial' -- same validation
        // pattern.
        propertyManagerName,
        propertyManagerContact,
        roofType,
        roofAge,
        tenantSuiteCount,
        // Phase 33 (Flood (NFIP) Inspection Report): optional, only meaningful
        // when lossType === 'Flood' -- same validation pattern. NFIP policy
        // number reuses `policyNumber` above with a contextual label rather
        // than adding a duplicate field.
        floodZone,
        lowestFloorElevation,
        baseFloodElevation,
        floodEventSource,
        reportedCrest,
        // Phase 34 (Theft/Burglary Inspection Report): optional, only
        // meaningful when lossType === 'Theft' -- same validation pattern.
        policeIncidentNumber,
        pointsOfEntry,
        // Phase 35 (Vehicle/Auto Inspection Report): optional, only
        // meaningful when claimType === 'Auto' -- same validation pattern.
        vin,
        vehicleMakeModelYear,
        odometer,
        licensePlate,
        vehicleColor,
      } = req.body;

      // If generating against a real CRM claim (Agency/Enterprise), the server -- not
      // the client -- is the source of truth for these fields, so the report can never
      // drift from the claim it's linked to.
      let linkedClientId = req.body.clientId || null;
      if (req.body.claimId) {
        let claim;
        try {
          claim = await getClaim(req.user.uid, req.body.claimId);
        } catch {
          return res
            .status(404)
            .json({ success: false, error: 'Claim not found', code: 'CLAIM_NOT_FOUND' });
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
            if (client.email) insuredEmail = client.email;
          } catch {
            /* linked client may have been deleted since -- keep whatever was submitted */
          }
        }
      }

      // Validate required fields. The claimant's name and email are required
      // here -- before any photo is persisted or the report doc is created --
      // so a report can never exist without knowing who it's for.
      insuredEmail = (insuredEmail || '').trim();
      if (
        !claimNumber ||
        !insuredName ||
        !insuredEmail ||
        !propertyAddress ||
        !lossDate ||
        !lossType
      ) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          code: 'VALIDATION_ERROR',
          required: [
            'claimNumber',
            'insuredName',
            'insuredEmail',
            'propertyAddress',
            'lossDate',
            'lossType',
          ],
        });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(insuredEmail)) {
        return res.status(400).json({
          success: false,
          error: 'Insured email must be a valid email address',
          code: 'VALIDATION_ERROR',
        });
      }

      // Reject obviously malformed/oversized input before it reaches the AI prompt.
      // Checked against the resolved values (claim/client data when claimId was used,
      // otherwise the raw submission) -- not req.body directly, since those may differ.
      const fieldValues = {
        claimNumber,
        insuredName,
        insuredEmail,
        propertyAddress,
        lossType,
        reportType,
        additionalNotes,
        propertyDetails,
        lossDescription,
        damagesObserved,
        recommendations,
      };
      const fieldLimits = {
        claimNumber: 50,
        insuredName: 200,
        insuredEmail: 200,
        propertyAddress: 300,
        lossType: 100,
        reportType: 100,
        additionalNotes: 5000,
        propertyDetails: 5000,
        lossDescription: 5000,
        damagesObserved: 5000,
        recommendations: 5000,
      };
      for (const [field, max] of Object.entries(fieldLimits)) {
        const value = fieldValues[field];
        if (typeof value === 'string' && value.length > max) {
          return res
            .status(400)
            .json({
              success: false,
              error: `${field} exceeds the ${max}-character limit`,
              code: 'VALIDATION_ERROR',
            });
        }
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(lossDate)) {
        return res
          .status(400)
          .json({
            success: false,
            error: 'Date of loss must be a valid date (YYYY-MM-DD)',
            code: 'VALIDATION_ERROR',
          });
      }

      // Phase 5 additions -- validated only when provided (all optional).
      const optionalFieldLimits = {
        policyNumber: 50,
        insuranceCompany: 150,
        insuredFirstName: 100,
        insuredLastName: 100,
        propertyStreet: 200,
        propertyCity: 100,
        propertyState: 50,
        propertyZip: 20,
        inspectorName: 150,
        inspectorId: 50,
        contactName: 150,
        claimantName: 150,
        claimantContact: 150,
        propertyManagerName: 150,
        propertyManagerContact: 150,
        roofType: 150,
        roofAge: 50,
        tenantSuiteCount: 20,
        floodZone: 50,
        lowestFloorElevation: 50,
        baseFloodElevation: 50,
        floodEventSource: 200,
        reportedCrest: 50,
        policeIncidentNumber: 50,
        pointsOfEntry: 300,
        vin: 50,
        vehicleMakeModelYear: 150,
        odometer: 30,
        licensePlate: 30,
        vehicleColor: 50,
      };
      const optionalFieldValues = {
        policyNumber,
        insuranceCompany,
        insuredFirstName,
        insuredLastName,
        propertyStreet,
        propertyCity,
        propertyState,
        propertyZip,
        inspectorName,
        inspectorId,
        contactName,
        claimantName,
        claimantContact,
        propertyManagerName,
        propertyManagerContact,
        roofType,
        roofAge,
        tenantSuiteCount,
        floodZone,
        lowestFloorElevation,
        baseFloodElevation,
        floodEventSource,
        reportedCrest,
        policeIncidentNumber,
        pointsOfEntry,
        vin,
        vehicleMakeModelYear,
        odometer,
        licensePlate,
        vehicleColor,
      };
      for (const [field, max] of Object.entries(optionalFieldLimits)) {
        const value = optionalFieldValues[field];
        if (typeof value === 'string' && value.length > max) {
          return res
            .status(400)
            .json({
              success: false,
              error: `${field} exceeds the ${max}-character limit`,
              code: 'VALIDATION_ERROR',
            });
        }
      }
      const enumChecks = {
        claimType: CLAIM_TYPES,
        propertyType: PROPERTY_TYPES,
        inspectionType: INSPECTION_TYPES,
        weatherConditions: WEATHER_CONDITIONS,
        occupancyStatus: OCCUPANCY_STATUSES,
        contactPresent: ['Yes', 'No'],
      };
      const enumValues = {
        claimType,
        propertyType,
        inspectionType,
        weatherConditions,
        occupancyStatus,
        contactPresent,
      };
      for (const [field, allowed] of Object.entries(enumChecks)) {
        const value = enumValues[field];
        if (value && !allowed.includes(value)) {
          return res
            .status(400)
            .json({ success: false, error: `Invalid ${field}`, code: 'VALIDATION_ERROR' });
        }
      }
      if (inspectionDate && !/^\d{4}-\d{2}-\d{2}$/.test(inspectionDate)) {
        return res
          .status(400)
          .json({
            success: false,
            error: 'Inspection date must be a valid date (YYYY-MM-DD)',
            code: 'VALIDATION_ERROR',
          });
      }
      if (inspectionTime && !/^\d{2}:\d{2}$/.test(inspectionTime)) {
        return res
          .status(400)
          .json({
            success: false,
            error: 'Inspection time must be in HH:MM format',
            code: 'VALIDATION_ERROR',
          });
      }

      // Phase 13 (Real Template Builder): an optional templateId starts this
      // report from a saved template's structure/defaults. The wizard already
      // applies the template's `fields` to its own form state before
      // submitting (so a normal submission looks identical to any other), but
      // the server re-validates independently -- a template's own
      // `requiredFields` are enforced here, and its custom sections/branding/
      // photo-layout defaults are only ever read from the server's own stored
      // template doc, never trusted from the client.
      let template = null;
      const templateId = req.body.templateId || null;
      if (templateId) {
        template = await templateService.getTemplateForUse(req.user, templateId);
        if (!template) {
          return res
            .status(404)
            .json({ success: false, error: 'Template not found', code: 'TEMPLATE_NOT_FOUND' });
        }
        const templateFieldValues = {
          policyNumber, insuranceCompany, propertyDetails, lossDescription,
          damagesObserved, recommendations, inspectionDate, inspectorName,
          weatherConditions, occupancyStatus,
        };
        const missingRequired = (template.requiredFields || []).filter(
          (f) => !String(templateFieldValues[f] || '').trim()
        );
        if (missingRequired.length > 0) {
          return res.status(400).json({
            success: false,
            error: `This template requires: ${missingRequired.join(', ')}`,
            code: 'TEMPLATE_REQUIRED_FIELD_MISSING',
            missingFields: missingRequired,
          });
        }
      }

      const reportId = req.reportId;

      // Documents keep an all-or-nothing validity check (unchanged, out of
      // Phase 6 scope -- per-file isolation below applies to photos only).
      const badDoc = firstInvalidDocument(req.files?.documents);
      if (badDoc) {
        return res
          .status(400)
          .json({
            success: false,
            error: `"${badDoc}" is not a valid PDF, Word, or text document`,
            code: 'INVALID_DOCUMENT',
          });
      }

      // Phase 6 (Photo Upload & Per-Photo UX Hardening): each photo gets its own
      // record and its own pass/fail outcome (corrupt/disguised file, duplicate
      // within this batch, or a genuine upload) instead of one bad file
      // rejecting the whole request. imagePaths/imageCount below are derived
      // from only the successfully uploaded photos, so every existing consumer
      // of those two fields (exports, dashboard counts) is unaffected.
      // Upload/storage stays synchronous here (fast, deterministic Storage I/O) --
      // Phase 7 backgrounds only the slow, AI-bound stages (vision analysis +
      // report generation), run by photoJobService AFTER this handler responds.
      let photoRecords = [];
      let analyzableImages = [];

      // Phase 25 (mobile immediate-upload): a draftId means some or all
      // photos were already uploaded to Storage during the wizard's Photos
      // step (POST /photos/stage), not attached to this multipart request.
      // Fold them in by re-downloading each one's already-stored bytes for
      // vision analysis -- same pattern as retryFailedAnalysis's "already-
      // uploaded, nothing re-sent" retry.
      //
      // Perf fix (production incident: generation "takes excessively long"):
      // claimDraftPhotos atomically marks the draft consumed in the SAME
      // Firestore transaction that reads its photos (see photoDraftStaging.js)
      // -- a genuine duplicate submission for this draftId (page refresh
      // mid-request, two tabs, a double click that raced past the frontend's
      // own in-flight guard) is rejected outright below instead of silently
      // re-downloading and re-analyzing the same photos into a second report.
      // The actual Storage downloads then run with bounded concurrency
      // (downloadPhotosForAnalysis) instead of one-at-a-time -- this loop used
      // to run sequentially BEFORE the response was sent, so N staged photos
      // meant N sequential Storage round-trips added directly to the
      // "Generate" button's spinner time, defeating Phase 7's "the client
      // never waits" design.
      const draftId = (req.body.draftId || '').trim() || null;
      if (draftId) {
        const claim = await claimDraftPhotos(db, { draftId, uid: req.user.uid });
        if (claim.alreadyClaimed) {
          return res.status(409).json({
            success: false,
            error:
              'This photo upload session was already used to generate a report. Refresh the page and start a new report if you need to submit again.',
            code: 'DUPLICATE_GENERATE_REQUEST',
          });
        }
        photoRecords = claim.photos;
        const stagedCandidates = photoRecords.filter((p) => p.status === 'uploaded' && p.objectPath);
        analyzableImages = await downloadPhotosForAnalysis(stagedCandidates, downloadBuffer);
        db.collection('reportDrafts').doc(draftId).delete().catch(() => {});
      }

      if (req.files?.images?.length > 0) {
        // Any photo that never made it into the staged draft (e.g. offline at
        // capture time) is still accepted here as a fallback, exactly like
        // the pre-staging all-in-one-request flow.
        const existingHashes = photoRecords
          .filter((p) => p.contentHash)
          .map((p) => ({ hash: p.contentHash, fileName: p.fileName }));
        const { records, analyzable } = await processPhotoBatch(
          req.user.uid,
          reportId,
          req.files.images,
          existingHashes,
          photoRecords.length
        );
        photoRecords = [...photoRecords, ...records];
        analyzableImages = [...analyzableImages, ...analyzable];
      }
      const imagePaths = photoRecords
        .filter((r) => r.status === 'uploaded')
        .map((r) => r.objectPath);

      // Supporting documents -- stored alongside the report, no text extraction
      // or AI-prompt integration in this phase (explicitly deferred, see PHASES.md
      // Phase 5). Purely additive metadata for the human reviewer to reference.
      let documentRecords = [];
      if (req.files?.documents?.length > 0) {
        documentRecords = await persistReportDocuments(req.user.uid, reportId, req.files.documents);
      }

      // Phase 13: a short AI-prompt nudge plus the template's own custom
      // sections (appended deterministically after generation, never left to
      // the prompt alone -- see richContent.js's appendTemplateSections).
      const templateGuidance = template ? templateService.buildTemplateGuidance(template) : null;
      const templateSections = template ? template.sections : null;

      const reportData = {
        claimNumber,
        insuredName,
        insuredEmail,
        propertyAddress,
        lossDate,
        lossType,
        reportType: reportType || 'Initial',
        additionalNotes,
        propertyDetails,
        lossDescription,
        damagesObserved,
        recommendations,
        templateGuidance,
        templateSections,
        // Phase 31 (Liability Investigation Report): `claimType` selects the
        // document architecture inside generateReport() -- generic path is
        // untouched when this isn't 'Liability'. `claimantName`/
        // `claimantContact` are only used by that path.
        claimType: claimType || '',
        claimantName: claimantName || '',
        claimantContact: claimantContact || '',
        // Phase 32 (Commercial Property Inspection Report): only used by that
        // path (claimType === 'Commercial').
        propertyManagerName: propertyManagerName || '',
        propertyManagerContact: propertyManagerContact || '',
        roofType: roofType || '',
        roofAge: roofAge || '',
        tenantSuiteCount: tenantSuiteCount || '',
        // Phase 33 (Flood (NFIP) Inspection Report): only used by that path
        // (lossType === 'Flood'), including when folded into a Commercial
        // claim's Flood report per the approved precedence rule.
        policyNumber: policyNumber || '',
        floodZone: floodZone || '',
        lowestFloorElevation: lowestFloorElevation || '',
        baseFloodElevation: baseFloodElevation || '',
        floodEventSource: floodEventSource || '',
        reportedCrest: reportedCrest || '',
        // Phase 34 (Theft/Burglary Inspection Report): only used by that path
        // (lossType === 'Theft').
        policeIncidentNumber: policeIncidentNumber || '',
        pointsOfEntry: pointsOfEntry || '',
        // Phase 35 (Vehicle/Auto Inspection Report): only used by that path
        // (claimType === 'Auto').
        vin: vin || '',
        vehicleMakeModelYear: vehicleMakeModelYear || '',
        odometer: odometer || '',
        licensePlate: licensePlate || '',
        vehicleColor: vehicleColor || '',
      };

      const reportDoc = {
        id: reportId,
        userId: req.user.uid,
        claimNumber,
        insuredName,
        insuredEmail,
        propertyAddress,
        lossDate,
        lossType,
        reportType: reportType || 'Initial',
        additionalNotes: additionalNotes || '',
        propertyDetails: propertyDetails || '',
        lossDescription: lossDescription || '',
        damagesObserved: damagesObserved || '',
        recommendations: recommendations || '',
        // Phase 5 additions -- all optional, additive raw claim/inspection data.
        // Not read by generateReport()/buildReportPrompt() (no AI-prompt change
        // in this phase, see PHASES.md Phase 5) -- persisted for the human
        // reviewer and for future phases (e.g. structured exports/analytics).
        policyNumber: policyNumber || '',
        insuranceCompany: insuranceCompany || '',
        insuredFirstName: insuredFirstName || '',
        insuredLastName: insuredLastName || '',
        claimType: claimType || '',
        propertyType: propertyType || '',
        propertyStreet: propertyStreet || '',
        propertyCity: propertyCity || '',
        propertyState: propertyState || '',
        propertyZip: propertyZip || '',
        inspectionDate: inspectionDate || '',
        inspectionTime: inspectionTime || '',
        inspectorName: inspectorName || '',
        inspectorId: inspectorId || '',
        inspectionType: inspectionType || '',
        weatherConditions: weatherConditions || '',
        occupancyStatus: occupancyStatus || '',
        contactPresent: contactPresent || '',
        contactName: contactName || '',
        // Phase 31 (Liability Investigation Report): optional, only meaningful
        // when claimType === 'Liability'.
        claimantName: claimantName || '',
        claimantContact: claimantContact || '',
        // Phase 32 (Commercial Property Inspection Report): optional, only
        // meaningful when claimType === 'Commercial'.
        propertyManagerName: propertyManagerName || '',
        propertyManagerContact: propertyManagerContact || '',
        roofType: roofType || '',
        roofAge: roofAge || '',
        tenantSuiteCount: tenantSuiteCount || '',
        // Phase 33 (Flood (NFIP) Inspection Report): optional, only meaningful
        // when lossType === 'Flood'.
        floodZone: floodZone || '',
        lowestFloorElevation: lowestFloorElevation || '',
        baseFloodElevation: baseFloodElevation || '',
        floodEventSource: floodEventSource || '',
        reportedCrest: reportedCrest || '',
        // Phase 34 (Theft/Burglary Inspection Report): optional, only
        // meaningful when lossType === 'Theft'.
        policeIncidentNumber: policeIncidentNumber || '',
        pointsOfEntry: pointsOfEntry || '',
        // Phase 35 (Vehicle/Auto Inspection Report): optional, only
        // meaningful when claimType === 'Auto'.
        vin: vin || '',
        vehicleMakeModelYear: vehicleMakeModelYear || '',
        odometer: odometer || '',
        licensePlate: licensePlate || '',
        vehicleColor: vehicleColor || '',
        documents: documentRecords,
        // Phase 7: content/analysis don't exist yet -- they're filled in by the
        // background pipeline once it completes. `status: 'processing'` (a
        // previously-unused, now-real value in the existing status vocabulary)
        // is what tells the frontend to show analysis progress instead of
        // report content, and what export/approve correctly refuse to act on.
        content: null,
        modelUsed: null,
        imageAnalysis: null,
        // Phase 6: per-photo records (status/thumbnail/size/etc. -- now also
        // analysisStatus, Phase 7), the primary photo data model. imagePaths/
        // imageCount are kept in lockstep, derived from only the 'uploaded'
        // records, since every pre-existing reader (export image embedding,
        // dashboard-summary photo counts) depends on that flat shape.
        photos: photoRecords,
        imagePaths,
        imageCount: imagePaths.length,
        qualityScore: null,
        pipelineError: null,
        // Golden Rule #3: AI output is a DRAFT (once generated) until a human
        // reviews + approves it. 'processing' is a new, real pipeline state
        // (Phase 7) -- distinct from 'draft', which now means "generated and
        // awaiting review", not "still being generated".
        status: 'processing',
        reviewedBy: null,
        reviewedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        clientId: linkedClientId,
        claimId: req.body.claimId || null,
        // Phase 12 (My Reports & Claims Management Completion): real, non-fabricated
        // creator attribution -- every report in one account's list is generated by
        // that account today (no shared team report pool exists yet, see Phase 14),
        // so this filter only ever has one distinct value per account right now, but
        // it's genuine stored data, not a placeholder, and becomes immediately useful
        // once team-shared report pools land.
        createdByEmail: req.user.email || null,
        // Phase 13 (Real Template Builder): denormalized template linkage --
        // `templateSections`/`templateGuidance` are re-read on every retry/
        // regenerate (photoJobService.js) so a template's structure survives
        // those, not just the initial generation. `exportDefaults`/
        // `templateBranding` are read-only fallbacks consumed by the export
        // route and ExportOptionsModal below; they never override an
        // explicit user/org branding choice.
        templateId: template ? template.id : null,
        templateName: template ? template.name : null,
        templateGuidance,
        templateSections,
        exportDefaults: template ? template.photoLayout : null,
        templateBranding: template
          ? {
              logoObjectPath: template.branding?.logoObjectPath || null,
              companyName: template.branding?.companyName || '',
              footerText: template.branding?.footerText || '',
            }
          : null,
      };

      await db.collection('reports').doc(reportId).set(reportDoc);

      // Phase 7: create the job records the analysis-status endpoint reads,
      // then respond to the client immediately -- the client never waits for
      // AI analysis/generation to finish. The pipeline itself runs after the
      // response is sent (fire-and-forget; a failure anywhere inside it is
      // caught internally and turns into `status: 'failed'` on the report, so
      // it can never leave a report stuck in 'processing' forever).
      const analyzablePhotoIds = analyzableImages.map((img) => img.photoId);
      await photoJobService.createAnalysisJobs(reportId, analyzablePhotoIds);
      await photoJobService.createGenerationJob(reportId);

      res.status(201).json({ success: true, report: reportDoc });

      photoJobService
        .runReportPipeline({
          reportId,
          uid: req.user.uid,
          analyzableImages,
          reportData,
          userEmail: req.user.email,
        })
        .catch((err) =>
          console.error(`[POST /generate] background pipeline threw for report ${reportId}:`, err)
        );
      return undefined;
    } catch (err) {
      console.error('Report generation error:', err);
      return res
        .status(500)
        .json({
          success: false,
          error: err.message || 'Report generation failed',
          code: 'GENERATION_ERROR',
        });
    }
  }
);

// ── ASYNC ANALYSIS PIPELINE (Phase 7) ───────────────────────────────────────

// GET /api/reports/:id/analysis-status — real-time progress for the
// background pipeline kicked off by POST /generate (or /:id/images).
// Registering this literal path before the generic GET /:id route below
// isn't strictly required (Express already matches the more specific literal
// path first), but it's kept up here near the other :id sub-routes for readability.
router.get('/:id/analysis-status', authenticateAny, reportsRead, async (req, res) => {
  try {
    const status = await photoJobService.getAnalysisStatus(req.params.id, req.user.uid);
    if (!status) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    return res.json({ success: true, ...status });
  } catch (err) {
    return res
      .status(500)
      .json({
        success: false,
        error: 'Failed to load analysis status',
        code: 'ANALYSIS_STATUS_ERROR',
      });
  }
});

// POST /api/reports/:id/analysis/retry — manually retry photos stuck in
// 'needs_attention' and/or a failed report-generation stage (spec §47's
// "Retry Analysis" action). Re-uses the photos' already-uploaded Storage
// bytes; nothing is re-uploaded from the client.
router.post(
  '/:id/analysis/retry',
  authenticateAny,
  reportsGenerate,
  requireCanGenerate,
  aiLimiter,
  async (req, res) => {
    try {
      const result = await photoJobService.retryFailedAnalysis(req.params.id, req.user.uid);
      if (!result.success) {
        // ALREADY_PROCESSING (idempotency guard) is a conflict with an
        // in-flight run, not a bad request -- 409, matching the export
        // in-progress lock's status code for the same "try again shortly"
        // semantics.
        const statusCode =
          result.code === 'NOT_FOUND' ? 404 : result.code === 'ALREADY_PROCESSING' ? 409 : 400;
        return res
          .status(statusCode)
          .json({ success: false, error: result.error || 'Report not found', code: result.code });
      }
      return res.json({ success: true, message: 'Retrying analysis' });
    } catch (err) {
      return res
        .status(500)
        .json({ success: false, error: 'Failed to retry analysis', code: 'RETRY_ERROR' });
    }
  }
);

// GET /api/reports
router.get('/', authenticateAny, reportsRead, async (req, res) => {
  try {
    const db = getFirestore();
    const {
      limit = 20,
      page = 1,
      lossType,
      status,
      startDate,
      endDate,
      search,
      // Phase 12 (My Reports & Claims Management Completion)
      reportType,
      creator,
      clientId,
      claimNumber,
      // Phase 39 (Coverage Determination Letter): lets the frontend look up
      // which Repair Estimate(s) are linked to a given base report, to offer
      // as the letter's required source estimate.
      relatedReportId,
      documentType,
    } = req.query;
    const lim = Math.min(parseInt(limit), 100);

    const snapshot = await db.collection('reports').where('userId', '==', req.user.uid).get();
    let reports = snapshot.docs.map((d) => {
      const data = d.data();
      // Don't return full content in list view
      return {
        id: d.id,
        ...data,
        content: data.content ? data.content.substring(0, 300) + '...' : '',
      };
    });

    reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    // Hide archived reports by default unless the caller explicitly requests them
    if (status !== 'archived') {
      reports = reports.filter((r) => r.status !== 'archived');
    }
    if (search) {
      const q = search.toLowerCase();
      reports = reports.filter(
        (r) =>
          (r.claimNumber || '').toLowerCase().includes(q) ||
          (r.insuredName || '').toLowerCase().includes(q) ||
          (r.propertyAddress || '').toLowerCase().includes(q) ||
          (r.lossType || '').toLowerCase().includes(q)
      );
    }
    if (lossType) reports = reports.filter((r) => r.lossType === lossType);
    if (status) reports = reports.filter((r) => r.status === status);
    if (startDate) reports = reports.filter((r) => r.createdAt >= startDate);
    if (endDate) reports = reports.filter((r) => r.createdAt <= endDate);
    if (reportType) reports = reports.filter((r) => r.reportType === reportType);
    if (relatedReportId) reports = reports.filter((r) => r.relatedReportId === relatedReportId);
    if (documentType) reports = reports.filter((r) => r.documentType === documentType);
    if (clientId) reports = reports.filter((r) => r.clientId === clientId);
    if (claimNumber) {
      const q = claimNumber.toLowerCase();
      reports = reports.filter((r) => (r.claimNumber || '').toLowerCase().includes(q));
    }
    if (creator) {
      const q = creator.toLowerCase();
      reports = reports.filter((r) => (r.createdByEmail || '').toLowerCase().includes(q));
    }

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
    return res
      .status(500)
      .json({ success: false, error: 'Failed to fetch reports', code: 'FETCH_ERROR' });
  }
});

// GET /api/reports/assigned-to-me — Phase 19: reports another user (owner or
// org admin/manager) has specifically granted this caller access to, via
// direct-invite sharing or a supervisor review request. Deliberately scoped
// to a single array-contains query on THIS user's own uid -- it can never
// return another organization's, or even the same organization's, full
// report pool (see PHASES.md Phase 19's explicit "do not expose the entire
// organization's report pool" requirement). Defined before GET /:id so
// 'assigned-to-me' is never captured as a report id.
router.get('/assigned-to-me', authenticateAny, reportsRead, async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db
      .collection('reports')
      .where('assignedUserUids', 'array-contains', req.user.uid)
      .get();
    const reports = snapshot.docs
      .filter((d) => d.data().status !== 'archived')
      .map((d) => {
        const data = d.data();
        const grant = (data.assignedUsers || []).find((a) => a.uid === req.user.uid);
        return {
          id: d.id,
          claimNumber: data.claimNumber || null,
          insuredName: data.insuredName || null,
          propertyAddress: data.propertyAddress || null,
          lossType: data.lossType || null,
          status: data.status || null,
          updatedAt: data.updatedAt || null,
          myPermission: grant?.permission || null,
          reviewRequestStatus:
            grant?.viaReviewRequest && data.reviewRequest?.reviewerUid === req.user.uid
              ? data.reviewRequest.status
              : null,
        };
      })
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    return res.json({ success: true, reports });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Failed to fetch assigned reports', code: 'FETCH_ERROR' });
  }
});

// GET /api/reports/:id
router.get('/:id', authenticateAny, reportsRead, async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('reports').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    // Phase 19: a non-owner may view this specific report if they hold a
    // direct-invite or review-request grant (assignedUsers) -- this never
    // exposes any OTHER report the owner has, only this one by id.
    const access = getReportAccess(doc.data(), req.user);
    if (!access) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    // Phase 22 (Photo Analysis Library): this route hands the full report doc
    // to anyone with any access tier (view/comment/review/owner) -- strip raw
    // Storage object paths before it leaves the server. Nothing in the
    // frontend reads these (images are always fetched through the
    // authenticated /:id/photos/:photoId/image proxy below), so this is pure
    // redaction, not a behavior change.
    const reportOut = { id: doc.id, ...doc.data() };
    delete reportOut.imagePaths;
    if (Array.isArray(reportOut.photos)) {
      reportOut.photos = reportOut.photos.map((p) => {
        const photoOut = { ...p };
        delete photoOut.objectPath;
        delete photoOut.thumbnailPath;
        delete photoOut.originalPath;
        return photoOut;
      });
    }
    return res.json({ success: true, report: reportOut, myAccess: access });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Failed to fetch report', code: 'FETCH_ERROR' });
  }
});

// Shared by /sections/suggest and /sections/assist below.
const buildSectionReportContext = (report) =>
  [
    `Claim number: ${report.claimNumber || 'not provided'}`,
    `Loss type: ${report.lossType || 'not provided'}`,
    `Loss date: ${report.lossDate || 'not provided'}`,
    `Property address: ${report.propertyAddress || 'not provided'}`,
  ].join('\n');

// A compact per-photo summary for the "Review Photo Documentation" AI
// function -- reviewed state (not raw AI output), capped so it can't blow the
// prompt budget on a 100-photo report.
const buildPhotosSummary = (photos = []) => {
  const active = (photos || []).filter((p) => p.analysis);
  if (!active.length) return '';
  return active
    .slice(0, 60)
    .map((p, i) => {
      const status = p.review?.status || 'pending';
      const observation =
        status === 'edited' && p.review?.observation
          ? p.review.observation
          : p.analysis?.observation;
      return `${i + 1}. [${status}] ${p.analysis?.location || 'Unspecified area'} — ${p.analysis?.category || 'Other'}: ${observation || 'No observation.'}`;
    })
    .join('\n');
};

const loadOwnedReport = async (db, reportId, uid) => {
  const doc = await db.collection('reports').doc(reportId).get();
  if (!doc.exists || doc.data().userId !== uid) return null;
  return doc;
};

// POST /api/reports/:id/sections/suggest — "Regenerate Section" backend.
// Generates a detached proposal only. It never writes report content or changes status;
// the reviewer must explicitly accept it in the editor and then save (Golden Rule #3).
// `instructions` (Phase 9) is the reviewer's own open-ended request for what to
// change -- the distinct Regenerate Section workflow (instructions textarea +
// generated comparison + explicit approval before replacement), as opposed to
// the 6 fixed writing-assistance functions on /sections/assist below.
router.post(
  '/:id/sections/suggest',
  authenticateAny,
  reportsGenerate,
  requireCanEditReports,
  aiLimiter,
  async (req, res) => {
    try {
      const title = String(req.body?.title || '').trim();
      const body = String(req.body?.body || '').trim();
      const instructions = sanitizeInstructions(req.body?.instructions);
      if (!title || title.length > 200 || body.length > 12000) {
        return res
          .status(400)
          .json({
            success: false,
            error: 'A valid section title and body of at most 12,000 characters are required.',
            code: 'INVALID_SECTION',
          });
      }
      const db = getFirestore();
      const doc = await loadOwnedReport(db, req.params.id, req.user.uid);
      if (!doc) {
        return res
          .status(404)
          .json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
      }
      const report = doc.data();
      const result = await suggestReportSection({
        title,
        body,
        instructions,
        reportContext: buildSectionReportContext(report),
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      console.error('Section suggestion error:', err);
      return res
        .status(503)
        .json({
          success: false,
          error: 'Section suggestion is temporarily unavailable.',
          code: 'SECTION_SUGGESTION_UNAVAILABLE',
        });
    }
  }
);

// POST /api/reports/:id/sections/assist — Phase 9: the 6 additional FLACRON
// ENGINE writing-assistance functions (Improve Writing, Shorten, Expand,
// Rewrite Professionally, Check Consistency, Check Missing Information, Review
// Photo Documentation). Same never-auto-overwrite contract as /suggest above —
// this only ever returns a detached proposal for the editor's Apply/Discard UI.
router.post(
  '/:id/sections/assist',
  authenticateAny,
  reportsGenerate,
  requireCanEditReports,
  aiLimiter,
  async (req, res) => {
    try {
      const action = String(req.body?.action || '');
      const title = String(req.body?.title || '').trim();
      const body = String(req.body?.body || '').trim();
      if (!SECTION_ASSIST_ACTIONS.has(action)) {
        return res
          .status(400)
          .json({ success: false, error: 'Invalid action', code: 'INVALID_ACTION' });
      }
      if (!title || title.length > 200 || body.length > 12000) {
        return res
          .status(400)
          .json({
            success: false,
            error: 'A valid section title and body of at most 12,000 characters are required.',
            code: 'INVALID_SECTION',
          });
      }
      const db = getFirestore();
      const doc = await loadOwnedReport(db, req.params.id, req.user.uid);
      if (!doc) {
        return res
          .status(404)
          .json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
      }
      const report = doc.data();
      const reportContext = buildSectionReportContext(report);
      const needsFullContent = action === 'check_consistency';
      const needsPhotos = action === 'review_photos';
      const result = await assistReportSection({
        action,
        title,
        body,
        reportContext,
        fullContent: needsFullContent ? report.content || '' : '',
        photosSummary: needsPhotos ? buildPhotosSummary(report.photos) : '',
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      console.error('Section assist error:', err);
      return res
        .status(503)
        .json({
          success: false,
          error: 'This action is temporarily unavailable.',
          code: 'SECTION_ASSIST_UNAVAILABLE',
        });
    }
  }
);

// PUT /api/reports/:id
// Phase 19: requireCanEditReports (a check of the CALLER's own account role)
// was removed from this route's middleware chain and is now applied inline,
// ONLY on the owner path -- a Phase 19 grantee's capability comes entirely
// from their per-report `assignedUsers` grant (getReportAccess), never from
// their own account role, since every solo account resolves to "owner" of
// itself in orgRoles.js and would otherwise leak full edit rights onto a
// report they were only ever given e.g. comment-only access to.
router.put('/:id', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const access = getReportAccess(doc.data(), req.user);
    if (!access) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const isOwnerPath = access === 'owner';
    if (isOwnerPath && !hasCapability(req.user, 'canEditReports')) {
      return res.status(403).json({
        success: false,
        error: 'Your team role does not have permission to do this (canEditReports).',
        code: 'TEAM_PERMISSION_DENIED',
        capability: 'canEditReports',
      });
    }
    if (!isOwnerPath && access !== 'review') {
      return res.status(403).json({
        success: false,
        error: 'You only have view or comment access to this report.',
        code: 'SHARE_PERMISSION_DENIED',
      });
    }
    // Phase 7: editing content while the background pipeline is still running
    // would race with (and likely be overwritten by) the pipeline's own final
    // write once it completes -- reject rather than silently losing the edit.
    if (doc.data().status === 'processing' && req.body.content !== undefined) {
      return res
        .status(409)
        .json({
          success: false,
          error:
            'This report is still being analyzed. Please wait for it to finish before editing.',
          code: 'REPORT_PROCESSING',
        });
    }
    // Phase 8: same reasoning for a photo-review regeneration in flight --
    // its own final write would otherwise race with (and likely clobber) a
    // manual content edit made at the same moment.
    if (doc.data().regenerating && req.body.content !== undefined) {
      return res
        .status(409)
        .json({
          success: false,
          error:
            'This report is being regenerated from photo review. Please wait for it to finish before editing.',
          code: 'REPORT_REGENERATING',
        });
    }

    // 'status' is intentionally excluded: it is system-controlled (set by
    // generation, /approve, and delete/archive) and must never be client-settable.
    const allowed = ['content', 'additionalNotes', 'clientId'];
    const updates = { updatedAt: new Date().toISOString() };
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });
    // Phase 9: bound/normalize client-supplied content (defense in depth --
    // export generators already escape hostile text at render time; this just
    // caps size and strips non-printable control characters that could
    // corrupt PDF/DOCX layout).
    if (typeof updates.content === 'string')
      updates.content = sanitizeReportContent(updates.content);

    const contentChanged =
      typeof req.body.content === 'string' && req.body.content !== doc.data().content;

    // Editing the content of an already-approved report invalidates that
    // approval — it no longer reflects what the adjuster actually reviewed.
    // Reopen it as a draft so it must be re-reviewed and re-approved before
    // it can export clean again (Golden Rule #3).
    const wasReviewed = isReviewed(doc.data().status);

    // Phase 14: a role that can edit but never approve (Inspector) may only
    // edit a report before it's been reviewed -- reopening an already-
    // approved report for editing is reserved for roles that could also
    // re-approve it (everyone else with canEditReports also has canApprove).
    // Phase 19: this only applies on the owner path -- a grantee only ever
    // reaches this handler with 'review'-tier access (checked above), which
    // already implies re-approve rights on this one report.
    if (isOwnerPath && contentChanged && wasReviewed && !hasCapability(req.user, 'canApprove')) {
      return res.status(403).json({
        success: false,
        error: 'Your role can only edit this report before it has been approved.',
        code: 'TEAM_PERMISSION_DENIED',
        capability: 'canApprove',
      });
    }

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
        note: wasReviewed
          ? 'Edited after approval — report reopened as draft; prior approval invalidated.'
          : '',
      });
    }
    if (contentChanged && wasReviewed) {
      recordAuditLog({
        actorUid: req.user.uid,
        actorEmail: req.user.email,
        action: 'report_reopened_after_edit',
        targetType: 'report',
        targetId: req.params.id,
        meta: { claimNumber: doc.data().claimNumber, previousStatus: doc.data().status },
        req,
      });
    }
    return res.json({ success: true, message: 'Report updated', updates });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Failed to update report', code: 'UPDATE_ERROR' });
  }
});

// POST /api/reports/:id/approve — human review gate (Golden Rule #3).
// Marks a reviewed draft as finalized; only a finalized report exports clean.
// Phase 19: requireCanApprove was removed from this route's middleware chain
// (same reasoning as PUT /:id above) -- a grantee's ability to approve comes
// entirely from holding 'review'-tier per-report access, never from their
// own account role.
router.post('/:id/approve', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const access = getReportAccess(doc.data(), req.user);
    if (!access) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const isOwnerPath = access === 'owner';
    if (isOwnerPath && !hasCapability(req.user, 'canApprove')) {
      return res.status(403).json({
        success: false,
        error: 'Your team role does not have permission to do this (canApprove).',
        code: 'TEAM_PERMISSION_DENIED',
        capability: 'canApprove',
      });
    }
    if (!isOwnerPath && access !== 'review') {
      return res.status(403).json({
        success: false,
        error: 'You only have view or comment access to this report.',
        code: 'SHARE_PERMISSION_DENIED',
      });
    }
    // Phase 7: a report still being analyzed/generated has no content yet to
    // approve -- reject explicitly rather than approving an empty draft.
    if (doc.data().status === 'processing') {
      return res
        .status(409)
        .json({
          success: false,
          error:
            'This report is still being analyzed. Please wait for it to finish before approving.',
          code: 'REPORT_PROCESSING',
        });
    }
    // Phase 8: approving mid-regeneration would attest to content that's
    // about to be overwritten by the in-flight regenerate's own write.
    if (doc.data().regenerating) {
      return res
        .status(409)
        .json({
          success: false,
          error:
            'This report is being regenerated from photo review. Please wait for it to finish before approving.',
          code: 'REPORT_REGENERATING',
        });
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
        error:
          'Full name, license number, license state, and company/firm are required to approve a report.',
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
      updates.content = sanitizeReportContent(req.body.content);
    }
    updates.signature = {
      name: name.slice(0, 120),
      title: String(sig.title || '').slice(0, 120),
      licenseNumber: licenseNumber.slice(0, 60),
      licenseState: licenseState.slice(0, 60),
      company: company.slice(0, 200),
      confirmedAt: new Date().toISOString(),
    };
    // Phase 19: an assigned reviewer approving via a pending review request
    // resolves that request too, so it stops showing up as "awaiting your
    // review" for them and the owner is told who signed off.
    const reviewRequest = doc.data().reviewRequest;
    const isReviewerCompletingRequest =
      !isOwnerPath && reviewRequest?.status === 'pending' && reviewRequest?.reviewerUid === req.user.uid;
    if (isReviewerCompletingRequest) {
      updates.reviewRequest = { ...reviewRequest, status: 'approved', respondedAt: new Date().toISOString() };
    }
    await ref.update(updates);
    await recordVersion(ref, {
      action: 'approved',
      by: req.user.email || req.user.uid,
      content: updates.content || doc.data().content,
      note: `Reviewed and finalized by ${name} (${licenseState} ${licenseNumber}, ${company})`,
    });
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'report_approved_finalized',
      targetType: 'report',
      targetId: req.params.id,
      meta: {
        claimNumber: doc.data().claimNumber,
        reviewerName: name,
        licenseState,
        licenseNumber,
        company,
      },
      req,
    });
    // Fire-and-forget outbound webhook (never blocks/breaks the response).
    emitEvent(req.user.uid, 'report.finalized', {
      reportId: req.params.id,
      status: 'finalized',
      claimNumber: doc.data().claimNumber || null,
      reviewedBy: updates.reviewedBy,
      reviewedAt: updates.reviewedAt,
    }).catch(() => {});
    // Phase 18 (Notifications): fire-and-forget, gated by the caller's own
    // 'reportApproved' preference (defaults enabled).
    if (req.user.email && isNotificationEnabled(req.user.notifications, 'reportApproved')) {
      sendReportApprovedEmail(req.user.email, req.user.displayName, {
        reportId: req.params.id,
        claimNumber: doc.data().claimNumber || null,
      }).catch((err) => console.warn('[Email] report-approved notification failed:', err.message));
    }
    if (isNotificationEnabled(req.user.notifications, 'reportApproved')) {
      notifyUser(db, req.user.uid, NOTIFICATION_TYPES.REPORT_APPROVED, {
        reportId: req.params.id,
        claimNumber: doc.data().claimNumber || null,
      }).catch((err) => console.warn('[Notifications] report-approved notification failed:', err.message));
    }
    // Phase 19: when a Phase-19 grantee (not the owner) approves -- e.g. a
    // supervisor completing a review request -- the OWNER is a distinct
    // person from req.user and would otherwise never hear about it. Gated by
    // the owner's own 'reportApproved' preference, read fresh (never trust a
    // stale copy on the report doc).
    if (!isOwnerPath) {
      db.collection('users').doc(doc.data().userId).get()
        .then((ownerDoc) => {
          const owner = ownerDoc.exists ? ownerDoc.data() : null;
          if (owner?.email && isNotificationEnabled(owner.notifications, 'reportApproved')) {
            return sendReportApprovedEmail(owner.email, owner.displayName, {
              reportId: req.params.id,
              claimNumber: doc.data().claimNumber || null,
            });
          }
        })
        .catch((err) => console.warn('[Email] report-approved owner notification failed:', err.message));
      db.collection('users').doc(doc.data().userId).get()
        .then((ownerDoc) => {
          const owner = ownerDoc.exists ? ownerDoc.data() : null;
          if (owner && isNotificationEnabled(owner.notifications, 'reportApproved')) {
            return notifyUser(db, doc.data().userId, NOTIFICATION_TYPES.REPORT_APPROVED, {
              reportId: req.params.id,
              claimNumber: doc.data().claimNumber || null,
            });
          }
        })
        .catch((err) => console.warn('[Notifications] report-approved owner notification failed:', err.message));
    }
    if (isReviewerCompletingRequest) {
      recordAuditLog({
        actorUid: req.user.uid,
        actorEmail: req.user.email,
        action: 'report_review_approved',
        targetType: 'report',
        targetId: req.params.id,
        meta: { claimNumber: doc.data().claimNumber },
        req,
      });
    }
    return res.json({
      success: true,
      message: 'Report approved and finalized',
      report: { id: doc.id, ...doc.data(), ...updates },
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Failed to approve report', code: 'APPROVE_ERROR' });
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
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.at < b.at ? 1 : -1)); // newest first
    return res.json({ success: true, versions });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Failed to fetch versions', code: 'VERSIONS_ERROR' });
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
      return res
        .status(400)
        .json({
          success: false,
          error: 'Finalize the report before sharing.',
          code: 'NOT_FINALIZED',
        });
    }
    let shareToken = doc.data().shareToken;
    if (!shareToken) {
      shareToken = uuidv4();
      await ref.update({ shareToken, sharedAt: new Date().toISOString() });
      recordAuditLog({
        actorUid: req.user.uid,
        actorEmail: req.user.email,
        action: 'report_shared',
        targetType: 'report',
        targetId: req.params.id,
        meta: { claimNumber: doc.data().claimNumber },
        req,
      });
      const freshUrl = `${process.env.FRONTEND_URL || ''}/shared/${shareToken}`;
      // Phase 18 (Notifications): gated by 'reportShared', only on first
      // creation of the link (not every time the owner re-opens the Share
      // dialog for an already-shared report).
      if (req.user.email && isNotificationEnabled(req.user.notifications, 'reportShared')) {
        sendReportSharedEmail(req.user.email, req.user.displayName, {
          claimNumber: doc.data().claimNumber || null,
          shareUrl: freshUrl,
        }).catch((err) => console.warn('[Email] report-shared notification failed:', err.message));
      }
      return res.json({ success: true, shareToken, url: freshUrl });
    }
    return res.json({ success: true, shareToken, url: `${process.env.FRONTEND_URL || ''}/shared/${shareToken}` });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Failed to create share link', code: 'SHARE_ERROR' });
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
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'report_share_revoked',
      targetType: 'report',
      targetId: req.params.id,
      req,
    });
    return res.json({ success: true, message: 'Share link revoked' });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Failed to revoke share link', code: 'SHARE_ERROR' });
  }
});

// ── SHARES (Phase 19) — permission-leveled, expiring share links, layered
// on top of the legacy single-token link above (kept fully working for
// backward compatibility). New shares live in a top-level `reportShares`
// collection (not a subcollection) so a public token lookup stays a single
// equality query with no composite/collection-group index requirement --
// the same shape the legacy `shareToken` lookup on `reports` already uses.

// POST /api/reports/:id/shares — create a new permission-leveled, optionally
// expiring share link. Distinct from POST /:id/share (legacy, view-only,
// finalized-only, single link) -- any number of these can coexist alongside
// the legacy link and each other.
router.post('/:id/shares', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const report = doc.data();
    const permission = String(req.body?.permission || 'view');
    if (!isValidPermission(permission)) {
      return res
        .status(400)
        .json({ success: false, error: 'permission must be view, comment, or review', code: 'INVALID_PERMISSION' });
    }
    // Golden Rule #3: a View link must never expose an unreviewed draft.
    // Comment/Review links MAY target a draft -- that's what makes a
    // pre-finalize collaborative review possible -- but the shared page
    // always labels an unreviewed report as a draft, never as final.
    if (permission === 'view' && !isReviewed(report.status)) {
      return res
        .status(400)
        .json({ success: false, error: 'Finalize the report before creating a view-only link.', code: 'NOT_FINALIZED' });
    }
    if (report.status === 'archived') {
      return res.status(400).json({ success: false, error: 'This report is archived.', code: 'REPORT_ARCHIVED' });
    }
    let expiresAt;
    try {
      expiresAt = computeExpiresAt(req.body?.expiresIn);
    } catch {
      return res
        .status(400)
        .json({ success: false, error: 'expiresIn must be 24h, 7d, 30d, or omitted', code: 'INVALID_EXPIRY' });
    }
    const token = uuidv4();
    const shareData = {
      reportId: req.params.id,
      token,
      permission,
      expiresAt,
      createdBy: req.user.uid,
      createdByEmail: req.user.email || null,
      createdAt: new Date().toISOString(),
      revoked: false,
      revokedAt: null,
      revokedBy: null,
    };
    const shareRef = await db.collection('reportShares').add(shareData);
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'report_share_created',
      targetType: 'report',
      targetId: req.params.id,
      meta: { claimNumber: report.claimNumber, permission, expiresAt, shareId: shareRef.id },
      req,
    });
    return res.json({
      success: true,
      share: { id: shareRef.id, ...shareData },
      url: `${process.env.FRONTEND_URL || ''}/shared/${token}`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to create share link', code: 'SHARE_ERROR' });
  }
});

// GET /api/reports/:id/shares — list every share (legacy single-link +
// Phase 19 multi-link) for the owner's management UI.
router.get('/:id/shares', authenticateAny, reportsRead, async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('reports').doc(req.params.id).get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const report = doc.data();
    const shares = [];
    if (report.shareToken) {
      shares.push({
        id: 'legacy',
        permission: 'view',
        expiresAt: null,
        revoked: false,
        expired: false,
        createdAt: report.sharedAt || null,
        createdByEmail: null,
        url: `${process.env.FRONTEND_URL || ''}/shared/${report.shareToken}`,
        legacy: true,
      });
    }
    const snap = await db.collection('reportShares').where('reportId', '==', req.params.id).get();
    snap.docs.forEach((d) => {
      const s = d.data();
      shares.push({
        id: d.id,
        permission: s.permission,
        expiresAt: s.expiresAt,
        revoked: !!s.revoked,
        expired: isShareExpired(s),
        createdAt: s.createdAt,
        createdByEmail: s.createdByEmail,
        url: `${process.env.FRONTEND_URL || ''}/shared/${s.token}`,
        legacy: false,
      });
    });
    shares.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return res.json({ success: true, shares });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to list shares', code: 'SHARES_ERROR' });
  }
});

// DELETE /api/reports/:id/shares/:shareId — revoke one Phase 19 share
// (the legacy link is still revoked via DELETE /:id/share above).
router.delete('/:id/shares/:shareId', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('reports').doc(req.params.id).get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const shareRef = db.collection('reportShares').doc(req.params.shareId);
    const shareDoc = await shareRef.get();
    if (!shareDoc.exists || shareDoc.data().reportId !== req.params.id) {
      return res.status(404).json({ success: false, error: 'Share not found', code: 'SHARE_NOT_FOUND' });
    }
    await shareRef.update({ revoked: true, revokedAt: new Date().toISOString(), revokedBy: req.user.uid });
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'report_share_revoked',
      targetType: 'report',
      targetId: req.params.id,
      meta: { shareId: req.params.shareId },
      req,
    });
    return res.json({ success: true, message: 'Share link revoked' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to revoke share link', code: 'SHARE_ERROR' });
  }
});

// ── DIRECT INVITE SHARING (Phase 19) — distinct from the anonymous links
// above: grants a NAMED, existing FlacronAI account access to this one
// report, independent of team membership/organization. Scoped to existing
// accounts only for this phase (a deliberate, documented scope decision --
// inviting a stranger by email with no account yet, mirroring teams.js's
// pending-invite-by-email flow, is a follow-up, not built here).
router.post('/:id/share/invite', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const report = doc.data();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const permission = String(req.body?.permission || 'view');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'A valid email is required', code: 'INVALID_EMAIL' });
    }
    if (!isValidPermission(permission)) {
      return res
        .status(400)
        .json({ success: false, error: 'permission must be view, comment, or review', code: 'INVALID_PERMISSION' });
    }
    if (email === (req.user.email || '').toLowerCase()) {
      return res.status(400).json({ success: false, error: 'You already have access to your own report.', code: 'SELF_INVITE' });
    }
    const userSnap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (userSnap.empty) {
      return res.status(404).json({
        success: false,
        error: 'No FlacronAI account found for that email. Invite them to sign up, or use a secure share link instead.',
        code: 'USER_NOT_FOUND',
      });
    }
    const invitedDoc = userSnap.docs[0];
    const invitedUid = invitedDoc.id;
    const invitedData = invitedDoc.data();
    const existing = (report.assignedUsers || []).filter((a) => a.uid !== invitedUid);
    const grant = {
      uid: invitedUid,
      email,
      permission,
      addedBy: req.user.uid,
      addedAt: new Date().toISOString(),
      viaReviewRequest: false,
    };
    const assignedUsers = [...existing, grant];
    const assignedUserUids = assignedUsers.map((a) => a.uid);
    await ref.update({ assignedUsers, assignedUserUids });
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'report_access_granted',
      targetType: 'report',
      targetId: req.params.id,
      meta: { claimNumber: report.claimNumber, grantedToUid: invitedUid, permission },
      req,
    });
    if (invitedData.email && isNotificationEnabled(invitedData.notifications, 'reportShared')) {
      sendReportAccessGrantedEmail(invitedData.email, invitedData.displayName, {
        reportId: req.params.id,
        claimNumber: report.claimNumber || null,
        grantedByName: req.user.displayName || req.user.email,
        permission,
      }).catch((err) => console.warn('[Email] report-access-granted notification failed:', err.message));
    }
    if (isNotificationEnabled(invitedData.notifications, 'reportShared')) {
      notifyUser(db, invitedUid, NOTIFICATION_TYPES.REPORT_SHARED, {
        reportId: req.params.id,
        claimNumber: report.claimNumber || null,
        grantedByName: req.user.displayName || req.user.email,
        permission,
      }).catch((err) => console.warn('[Notifications] report-access-granted notification failed:', err.message));
    }
    return res.json({ success: true, message: 'Access granted', assignedUsers });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to invite user', code: 'INVITE_ERROR' });
  }
});

// DELETE /api/reports/:id/share/invite/:uid — revoke a direct invite or any
// assigned-user grant (including one added via a review request).
router.delete('/:id/share/invite/:uid', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const report = doc.data();
    const assignedUsers = (report.assignedUsers || []).filter((a) => a.uid !== req.params.uid);
    const assignedUserUids = assignedUsers.map((a) => a.uid);
    const updates = { assignedUsers, assignedUserUids };
    if (report.reviewRequest?.reviewerUid === req.params.uid && report.reviewRequest?.status === 'pending') {
      updates.reviewRequest = { ...report.reviewRequest, status: 'rejected', respondedAt: new Date().toISOString() };
    }
    await ref.update(updates);
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'report_access_revoked',
      targetType: 'report',
      targetId: req.params.id,
      meta: { revokedUid: req.params.uid },
      req,
    });
    return res.json({ success: true, message: 'Access revoked' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to revoke access', code: 'REVOKE_ERROR' });
  }
});

// ── SUPERVISOR REVIEW REQUESTS (Phase 19) ───────────────────────────────────
// POST /api/reports/:id/request-review — owner assigns an in-organization
// reviewer. Deliberately org-scoped (not any arbitrary email) -- an external
// reviewer belongs on the "Invite User" path above instead. Grants
// 'review'-tier assignedUsers access, the same mechanism the invite path
// uses, so the reviewer can view/edit/comment/approve this ONE report
// without ever seeing the rest of the organization's report pool.
router.post('/:id/request-review', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const report = doc.data();
    if (isReviewed(report.status)) {
      return res.status(400).json({ success: false, error: 'This report is already finalized.', code: 'ALREADY_FINALIZED' });
    }
    if (report.reviewRequest?.status === 'pending') {
      return res
        .status(400)
        .json({ success: false, error: 'A review is already pending on this report.', code: 'REVIEW_ALREADY_PENDING' });
    }
    const reviewerUid = String(req.body?.reviewerUid || '').trim();
    if (!reviewerUid) {
      return res.status(400).json({ success: false, error: 'reviewerUid is required', code: 'REVIEWER_REQUIRED' });
    }
    if (reviewerUid === req.user.uid) {
      return res.status(400).json({ success: false, error: 'You cannot request a review from yourself.', code: 'SELF_REVIEW' });
    }
    const reviewerDoc = await db.collection('users').doc(reviewerUid).get();
    if (!reviewerDoc.exists) {
      return res.status(404).json({ success: false, error: 'Reviewer account not found', code: 'REVIEWER_NOT_FOUND' });
    }
    const reviewerData = reviewerDoc.data();
    // Confirm the reviewer is genuinely a member of the SAME organization as
    // the report's owner before granting per-report access -- this workflow
    // is for internal sign-off, not a way to reach across organizations.
    if (resolveOrganizationId(reviewerData) !== resolveOrganizationId(req.user)) {
      return res.status(403).json({
        success: false,
        error: 'The reviewer must be a member of your organization. Use a secure share link or Invite User for an external reviewer.',
        code: 'REVIEWER_NOT_IN_ORG',
      });
    }
    const notes = sanitizeCommentBody(req.body?.notes || '').slice(0, 1000);
    const existing = (report.assignedUsers || []).filter((a) => a.uid !== reviewerUid);
    const grant = {
      uid: reviewerUid,
      email: reviewerData.email || null,
      permission: 'review',
      addedBy: req.user.uid,
      addedAt: new Date().toISOString(),
      viaReviewRequest: true,
    };
    const assignedUsers = [...existing, grant];
    const assignedUserUids = assignedUsers.map((a) => a.uid);
    const reviewRequest = {
      reviewerUid,
      reviewerEmail: reviewerData.email || null,
      requestedBy: req.user.uid,
      requestedByEmail: req.user.email || null,
      requestedAt: new Date().toISOString(),
      status: 'pending',
      notes,
      respondedAt: null,
    };
    await ref.update({ assignedUsers, assignedUserUids, reviewRequest });
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'report_review_requested',
      targetType: 'report',
      targetId: req.params.id,
      meta: { claimNumber: report.claimNumber, reviewerUid },
      req,
    });
    // Phase 18/19: the real trigger for the 'reviewRequested' preference,
    // which Phase 18 defined but had no event to fire it.
    if (reviewerData.email && isNotificationEnabled(reviewerData.notifications, 'reviewRequested')) {
      sendReviewRequestedEmail(reviewerData.email, reviewerData.displayName, {
        reportId: req.params.id,
        claimNumber: report.claimNumber || null,
        requestedByName: req.user.displayName || req.user.email,
        notes,
      }).catch((err) => console.warn('[Email] review-requested notification failed:', err.message));
    }
    if (isNotificationEnabled(reviewerData.notifications, 'reviewRequested')) {
      notifyUser(db, reviewerUid, NOTIFICATION_TYPES.REVIEW_REQUESTED, {
        reportId: req.params.id,
        claimNumber: report.claimNumber || null,
        requestedByName: req.user.displayName || req.user.email,
      }).catch((err) => console.warn('[Notifications] review-requested notification failed:', err.message));
    }
    return res.json({ success: true, message: 'Review requested', reviewRequest });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to request review', code: 'REVIEW_REQUEST_ERROR' });
  }
});

// POST /api/reports/:id/review-response — the assigned reviewer declines or
// asks for changes. (Approval itself flows through the existing POST
// /:id/approve, reachable by a 'review'-tier grantee -- see that route.)
router.post('/:id/review-response', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const report = doc.data();
    if (!report.reviewRequest || report.reviewRequest.reviewerUid !== req.user.uid) {
      return res
        .status(403)
        .json({ success: false, error: 'You do not have a pending review request on this report.', code: 'NOT_ASSIGNED_REVIEWER' });
    }
    if (report.reviewRequest.status !== 'pending') {
      return res
        .status(400)
        .json({ success: false, error: 'This review request has already been responded to.', code: 'REVIEW_ALREADY_RESOLVED' });
    }
    const decision = String(req.body?.decision || '');
    if (!['rejected', 'changes_requested'].includes(decision)) {
      return res
        .status(400)
        .json({ success: false, error: 'decision must be rejected or changes_requested', code: 'INVALID_DECISION' });
    }
    const notes = sanitizeCommentBody(req.body?.notes || '').slice(0, 1000);
    const reviewRequest = {
      ...report.reviewRequest,
      status: decision,
      notes: notes || report.reviewRequest.notes,
      respondedAt: new Date().toISOString(),
    };
    const updates = { reviewRequest };
    // A report the reviewer sent back stays a draft the owner can edit --
    // never silently left finalized-looking while genuinely unresolved.
    if (isReviewed(report.status)) updates.status = 'draft';
    await ref.update(updates);
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: decision === 'rejected' ? 'report_review_rejected' : 'report_review_changes_requested',
      targetType: 'report',
      targetId: req.params.id,
      meta: { claimNumber: report.claimNumber },
      req,
    });
    db.collection('users')
      .doc(report.userId)
      .get()
      .then((ownerDoc) => {
        const owner = ownerDoc.exists ? ownerDoc.data() : null;
        if (owner?.email && isNotificationEnabled(owner.notifications, 'reviewRequested')) {
          return sendReviewResponseEmail(owner.email, owner.displayName, {
            reportId: req.params.id,
            claimNumber: report.claimNumber || null,
            reviewerName: req.user.displayName || req.user.email,
            decision,
            notes,
          });
        }
      })
      .catch((err) => console.warn('[Email] review-response notification failed:', err.message));
    db.collection('users')
      .doc(report.userId)
      .get()
      .then((ownerDoc) => {
        const owner = ownerDoc.exists ? ownerDoc.data() : null;
        if (owner && isNotificationEnabled(owner.notifications, 'reviewRequested')) {
          return notifyUser(db, report.userId, NOTIFICATION_TYPES.REVIEW_DECLINED, {
            reportId: req.params.id,
            claimNumber: report.claimNumber || null,
            reviewerName: req.user.displayName || req.user.email,
            decision,
          });
        }
      })
      .catch((err) => console.warn('[Notifications] review-response notification failed:', err.message));
    return res.json({ success: true, message: 'Response recorded', reviewRequest });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to record review response', code: 'REVIEW_RESPONSE_ERROR' });
  }
});

// ── COMMENTS (Phase 19) — anchored to a report section by a content-based
// slug (slugifySectionTitle), not position, so a comment survives reordering
// -- only a literal rename/removal of the section breaks the anchor, and
// the frontend falls back to showing it under "General" with the original
// title preserved for context. Stored as a subcollection
// (reports/{id}/comments), matching the existing `versions` precedent.
const MAX_COMMENTS_PER_REPORT = 500;

const buildSectionAnchor = (raw) => {
  if (!raw || !raw.title) return null;
  return { title: String(raw.title).slice(0, 200), slug: slugifySectionTitle(raw.title) };
};

router.get('/:id/comments', authenticateAny, reportsRead, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    if (!getReportAccess(doc.data(), req.user)) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const snap = await ref.collection('comments').orderBy('createdAt', 'asc').get();
    const comments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.json({ success: true, comments });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load comments', code: 'COMMENTS_ERROR' });
  }
});

router.post('/:id/comments', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    const report = doc.data();
    const access = getReportAccess(report, req.user);
    if (!access) return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    if (!hasReportAccess(report, req.user, 'comment')) {
      return res.status(403).json({ success: false, error: 'View-only access cannot add comments.', code: 'SHARE_PERMISSION_DENIED' });
    }
    const body = sanitizeCommentBody(req.body?.body);
    if (!body) return res.status(400).json({ success: false, error: 'Comment body is required', code: 'EMPTY_COMMENT' });
    const existingSnap = await ref.collection('comments').get();
    if (existingSnap.size >= MAX_COMMENTS_PER_REPORT) {
      return res.status(400).json({ success: false, error: 'This report has reached its comment limit.', code: 'COMMENT_LIMIT' });
    }
    let parentId = null;
    if (req.body?.parentId) {
      const parentExists = existingSnap.docs.some((d) => d.id === String(req.body.parentId));
      if (!parentExists) return res.status(404).json({ success: false, error: 'Parent comment not found', code: 'PARENT_NOT_FOUND' });
      parentId = String(req.body.parentId);
    }
    const comment = {
      body,
      sectionAnchor: buildSectionAnchor(req.body?.sectionAnchor),
      parentId,
      authorUid: req.user.uid,
      authorEmail: req.user.email || null,
      authorName: req.user.displayName || req.user.email || 'A FlacronAI user',
      authorIsGuest: false,
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const added = await ref.collection('comments').add(comment);
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'report_comment_added',
      targetType: 'report',
      targetId: req.params.id,
      meta: { commentId: added.id, sectionSlug: comment.sectionAnchor?.slug || null },
      req,
    });
    return res.json({ success: true, comment: { id: added.id, ...comment } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to add comment', code: 'COMMENT_ERROR' });
  }
});

const setCommentResolved = (resolved) => async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    const report = doc.data();
    const access = getReportAccess(report, req.user);
    if (!access) return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    const isOwnerPath = access === 'owner';
    const allowed = isOwnerPath ? hasCapability(req.user, 'canEditReports') : access === 'review';
    if (!allowed) {
      return res
        .status(403)
        .json({ success: false, error: 'You do not have permission to resolve comments on this report.', code: 'SHARE_PERMISSION_DENIED' });
    }
    const commentRef = ref.collection('comments').doc(req.params.commentId);
    const commentDoc = await commentRef.get();
    if (!commentDoc.exists) return res.status(404).json({ success: false, error: 'Comment not found', code: 'COMMENT_NOT_FOUND' });
    await commentRef.update({
      resolved,
      resolvedBy: resolved ? req.user.displayName || req.user.email || req.user.uid : null,
      resolvedAt: resolved ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    });
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: resolved ? 'report_comment_resolved' : 'report_comment_reopened',
      targetType: 'report',
      targetId: req.params.id,
      meta: { commentId: req.params.commentId },
      req,
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update comment', code: 'COMMENT_ERROR' });
  }
};
router.post('/:id/comments/:commentId/resolve', authenticateAny, reportsWrite, setCommentResolved(true));
router.post('/:id/comments/:commentId/reopen', authenticateAny, reportsWrite, setCommentResolved(false));

// A report is "reviewed" (exports clean) only once a human finalizes it.
// Legacy reports saved before the review gate used 'completed' — treat as reviewed.
const isReviewed = (status) =>
  status === 'finalized' || status === 'approved' || status === 'completed';

// Resolves a public share token to its report + effective permission/expiry
// state (Phase 19). Checks the new `reportShares` collection first, then
// falls back to the legacy single-token flat fields on the report doc
// itself, so a link created before Phase 19 keeps working unchanged.
// Expiry/revocation is re-checked live on every call -- never cached, never
// trusted from an earlier response.
const resolveShareToken = async (db, token) => {
  const shareSnap = await db.collection('reportShares').where('token', '==', token).limit(1).get();
  if (!shareSnap.empty) {
    const shareDoc = shareSnap.docs[0];
    const share = shareDoc.data();
    if (isShareExpired(share)) return { status: share.revoked ? 'revoked' : 'expired' };
    const reportDoc = await db.collection('reports').doc(share.reportId).get();
    if (!reportDoc.exists || reportDoc.data().status === 'archived') return { status: 'not_found' };
    const report = reportDoc.data();
    // A View link only ever serves a finalized report -- re-checked live in
    // case the report was reopened to draft (e.g. edited) after the link
    // was created, not just at link-creation time.
    if (share.permission === 'view' && !isReviewed(report.status)) return { status: 'not_found' };
    return {
      status: 'ok',
      reportRef: reportDoc.ref,
      report,
      permission: share.permission,
      shareId: shareDoc.id,
      isDraft: !isReviewed(report.status),
    };
  }
  // Legacy fallback: the original single-token, view-only, finalized-only,
  // no-expiry share (kept working exactly as it did before Phase 19).
  const legacySnap = await db.collection('reports').where('shareToken', '==', token).limit(1).get();
  if (legacySnap.empty) return { status: 'not_found' };
  const reportDoc = legacySnap.docs[0];
  const report = reportDoc.data();
  if (!isReviewed(report.status)) return { status: 'not_found' };
  return { status: 'ok', reportRef: reportDoc.ref, report, permission: 'view', shareId: null, isDraft: false };
};

// GET /api/reports/shared/:token — PUBLIC view (no auth). Permission/expiry
// aware (Phase 19); a bare legacy token still resolves to a view-only,
// finalized-only, non-expiring share exactly as before.
router.get('/shared/:token', async (req, res) => {
  try {
    const db = getFirestore();
    const resolved = await resolveShareToken(db, req.params.token);
    if (resolved.status === 'expired') {
      return res.status(410).json({ success: false, error: 'This share link has expired', code: 'SHARE_EXPIRED' });
    }
    if (resolved.status !== 'ok') {
      return res.status(404).json({ success: false, error: 'Shared report not found', code: 'NOT_FOUND' });
    }
    const r = resolved.report;
    // Expose only presentation fields — never userId, imagePaths, or internal metadata.
    return res.json({
      success: true,
      permission: resolved.permission,
      isDraft: resolved.isDraft,
      report: {
        claimNumber: r.claimNumber,
        insuredName: r.insuredName,
        propertyAddress: r.propertyAddress,
        lossType: r.lossType,
        lossDate: r.lossDate,
        reportType: r.reportType,
        content: r.content,
        signature: r.signature || null,
        reviewedAt: r.reviewedAt || null,
      },
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Failed to load shared report', code: 'SHARED_ERROR' });
  }
});

// ── PUBLIC COMMENTS (Phase 19) — for Comment/Review-permission share links,
// no login required. An anonymous commenter supplies a display name; never
// an authorUid, so a guest comment can never be confused with an
// authenticated grant's identity.
router.get('/shared/:token/comments', async (req, res) => {
  try {
    const db = getFirestore();
    const resolved = await resolveShareToken(db, req.params.token);
    if (resolved.status !== 'ok') {
      return res
        .status(resolved.status === 'expired' ? 410 : 404)
        .json({ success: false, error: 'Shared report not found', code: 'NOT_FOUND' });
    }
    if (resolved.permission === 'view') {
      return res.status(403).json({ success: false, error: 'View-only links cannot access comments.', code: 'SHARE_PERMISSION_DENIED' });
    }
    const snap = await resolved.reportRef.collection('comments').orderBy('createdAt', 'asc').get();
    const comments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.json({ success: true, comments, permission: resolved.permission });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load comments', code: 'COMMENTS_ERROR' });
  }
});

router.post('/shared/:token/comments', async (req, res) => {
  try {
    const db = getFirestore();
    const resolved = await resolveShareToken(db, req.params.token);
    if (resolved.status !== 'ok') {
      return res
        .status(resolved.status === 'expired' ? 410 : 404)
        .json({ success: false, error: 'Shared report not found', code: 'NOT_FOUND' });
    }
    if (resolved.permission === 'view') {
      return res.status(403).json({ success: false, error: 'View-only links cannot add comments.', code: 'SHARE_PERMISSION_DENIED' });
    }
    const body = sanitizeCommentBody(req.body?.body);
    if (!body) return res.status(400).json({ success: false, error: 'Comment body is required', code: 'EMPTY_COMMENT' });
    const guestName = sanitizeGuestName(req.body?.guestName) || 'Anonymous reviewer';
    const existingSnap = await resolved.reportRef.collection('comments').get();
    if (existingSnap.size >= MAX_COMMENTS_PER_REPORT) {
      return res.status(400).json({ success: false, error: 'This report has reached its comment limit.', code: 'COMMENT_LIMIT' });
    }
    let parentId = null;
    if (req.body?.parentId) {
      const parentExists = existingSnap.docs.some((d) => d.id === String(req.body.parentId));
      if (!parentExists) return res.status(404).json({ success: false, error: 'Parent comment not found', code: 'PARENT_NOT_FOUND' });
      parentId = String(req.body.parentId);
    }
    const comment = {
      body,
      sectionAnchor: buildSectionAnchor(req.body?.sectionAnchor),
      parentId,
      authorUid: null,
      authorEmail: null,
      authorName: guestName,
      authorIsGuest: true,
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const added = await resolved.reportRef.collection('comments').add(comment);
    // No raw share token in audit meta (Phase 19 requirement) -- shareId only.
    recordAuditLog({
      actorUid: null,
      actorEmail: null,
      action: 'report_comment_added',
      targetType: 'report',
      targetId: resolved.reportRef.id,
      meta: { commentId: added.id, viaShareId: resolved.shareId, guestName },
      req,
    });
    return res.json({ success: true, comment: { id: added.id, ...comment } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to add comment', code: 'COMMENT_ERROR' });
  }
});

const setSharedCommentResolved = (resolved) => async (req, res) => {
  try {
    const db = getFirestore();
    const tok = await resolveShareToken(db, req.params.token);
    if (tok.status !== 'ok') {
      return res
        .status(tok.status === 'expired' ? 410 : 404)
        .json({ success: false, error: 'Shared report not found', code: 'NOT_FOUND' });
    }
    // An anonymous Review-permission link gets elevated comment-management
    // (resolve/reopen) but never approve/reject -- Golden Rule #3 reserves
    // the actual finalize attestation for an authenticated, identified
    // reviewer (the internal review-request workflow, or a named Invite
    // User grant), never an anonymous link with no login.
    if (tok.permission !== 'review') {
      return res.status(403).json({ success: false, error: 'Only Review-permission links can resolve comments.', code: 'SHARE_PERMISSION_DENIED' });
    }
    const commentRef = tok.reportRef.collection('comments').doc(req.params.commentId);
    const commentDoc = await commentRef.get();
    if (!commentDoc.exists) return res.status(404).json({ success: false, error: 'Comment not found', code: 'COMMENT_NOT_FOUND' });
    await commentRef.update({
      resolved,
      resolvedBy: resolved ? 'Reviewer (shared link)' : null,
      resolvedAt: resolved ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    });
    recordAuditLog({
      actorUid: null,
      actorEmail: null,
      action: resolved ? 'report_comment_resolved' : 'report_comment_reopened',
      targetType: 'report',
      targetId: tok.reportRef.id,
      meta: { commentId: req.params.commentId, viaShareId: tok.shareId },
      req,
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update comment', code: 'COMMENT_ERROR' });
  }
};
router.post('/shared/:token/comments/:commentId/resolve', setSharedCommentResolved(true));
router.post('/shared/:token/comments/:commentId/reopen', setSharedCommentResolved(false));

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
      // Phase 6: also clean up server-generated thumbnails, if any.
      const thumbnailPaths = (data.photos || []).map((p) => p.thumbnailPath).filter(Boolean);
      if (thumbnailPaths.length) {
        await deleteObjects(thumbnailPaths);
      }
      // Phase 6 addendum: the untouched-original tier lives at its own path
      // (separate from imagePaths, which points at the display/optimized copy).
      const originalPaths = (data.photos || []).map((p) => p.originalPath).filter(Boolean);
      if (originalPaths.length) {
        await deleteObjects(originalPaths);
      }
      // Phase 19: reportShares is a top-level collection (not a subcollection
      // of this doc, see its own header comment), so a plain ref.delete()
      // below would never clean it up -- do it explicitly.
      await deleteReportShares(db, req.params.id);
      await ref.delete();
      recordAuditLog({
        actorUid: req.user.uid,
        actorEmail: req.user.email,
        action: 'report_deleted_permanent',
        targetType: 'report',
        targetId: req.params.id,
        meta: { claimNumber: data.claimNumber, status: data.status },
        req,
      });
      return res.json({ success: true, message: 'Report permanently deleted' });
    } else {
      // Phase 12: remember the status this report actually had before archiving
      // (draft vs. finalized) so Restore can put it back exactly where it was --
      // never silently downgrading a legitimately finalized report back to draft.
      const preArchiveStatus = doc.data().status;
      await ref.update({
        status: 'archived',
        preArchiveStatus,
        updatedAt: new Date().toISOString(),
      });
      recordAuditLog({
        actorUid: req.user.uid,
        actorEmail: req.user.email,
        action: 'report_archived',
        targetType: 'report',
        targetId: req.params.id,
        req,
      });
      return res.json({ success: true, message: 'Report archived' });
    }
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Failed to delete report', code: 'DELETE_ERROR' });
  }
});

// POST /api/reports/:id/restore — Phase 12 (My Reports & Claims Management
// Completion): reverses the soft-archive above, putting the report back to
// exactly the status it had before archiving (draft or finalized) rather than
// always resetting to draft, since a finalized report's clean-export state
// (Golden Rule #3) must survive an archive/restore round trip.
router.post('/:id/restore', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const data = doc.data();
    if (data.status !== 'archived') {
      return res
        .status(400)
        .json({ success: false, error: 'This report is not archived', code: 'NOT_ARCHIVED' });
    }
    const restoredStatus = data.preArchiveStatus || 'draft';
    await ref.update({
      status: restoredStatus,
      preArchiveStatus: null,
      updatedAt: new Date().toISOString(),
    });
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'report_restored',
      targetType: 'report',
      targetId: req.params.id,
      meta: { claimNumber: data.claimNumber, restoredStatus },
      req,
    });
    return res.json({ success: true, message: 'Report restored', status: restoredStatus });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Failed to restore report', code: 'RESTORE_ERROR' });
  }
});

// Fields copied into a duplicate (claim/loss/inspection *input* data only --
// never photos/documents/generated content/review-state, per PHASES.md Phase
// 12's explicit "clean/no-photos duplicate" decision).
const DUPLICATE_FIELDS = [
  'insuredName',
  'insuredEmail',
  'propertyAddress',
  'lossDate',
  'lossType',
  'reportType',
  'additionalNotes',
  'propertyDetails',
  'lossDescription',
  'damagesObserved',
  'recommendations',
  'policyNumber',
  'insuranceCompany',
  'insuredFirstName',
  'insuredLastName',
  'claimType',
  'propertyType',
  'propertyStreet',
  'propertyCity',
  'propertyState',
  'propertyZip',
  'inspectionDate',
  'inspectionTime',
  'inspectorName',
  'inspectorId',
  'inspectionType',
  'weatherConditions',
  'occupancyStatus',
  'contactPresent',
  'contactName',
  'clientId',
  'claimId',
  // Phase 35 (Vehicle/Auto Inspection Report)
  'vin',
  'vehicleMakeModelYear',
  'odometer',
  'licensePlate',
  'vehicleColor',
];

// POST /api/reports/:id/duplicate — Phase 12 (My Reports & Claims Management
// Completion): copies the complete Phase 5 claim/inspection field set into a
// brand-new draft. Deliberately does NOT copy photos, supporting documents,
// AI-generated content, or review/approval state -- per PHASES.md's own risk
// note, a duplicate starts as a clean draft the reviewer builds up fresh,
// rather than silently re-using (and paying Storage cost for) the original's
// photo set or carrying over a stale AI analysis.
router.post('/:id/duplicate', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const source = await loadOwnedReport(db, req.params.id, req.user.uid);
    if (!source) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const sourceData = source.data();
    const newId = uuidv4();
    const now = new Date().toISOString();
    const newReport = { id: newId, userId: req.user.uid };
    DUPLICATE_FIELDS.forEach((field) => {
      newReport[field] = sourceData[field] != null ? sourceData[field] : field === 'clientId' || field === 'claimId' ? null : '';
    });
    // A visually distinct claim number avoids the original and the copy looking
    // identical side-by-side in the list -- the reviewer can rename it freely.
    newReport.claimNumber = `${sourceData.claimNumber || 'CLAIM'} (Copy)`;
    Object.assign(newReport, {
      documents: [],
      content: null,
      modelUsed: null,
      imageAnalysis: null,
      photos: [],
      imagePaths: [],
      imageCount: 0,
      qualityScore: null,
      pipelineError: null,
      status: 'draft',
      reviewedBy: null,
      reviewedAt: null,
      preArchiveStatus: null,
      createdAt: now,
      updatedAt: now,
      createdByEmail: req.user.email || null,
      duplicatedFrom: req.params.id,
    });
    await db.collection('reports').doc(newId).set(newReport);
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'report_duplicated',
      targetType: 'report',
      targetId: newId,
      meta: { sourceReportId: req.params.id, claimNumber: newReport.claimNumber },
      req,
    });
    return res.status(201).json({ success: true, report: newReport });
  } catch (err) {
    console.error('Report duplicate error:', err);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to duplicate report', code: 'DUPLICATE_ERROR' });
  }
});

// POST /api/reports/:id/mold-supplement — Phase 36 (Mold Assessment
// Supplemental Report): generates a Mold Assessment — Preliminary Report as
// its OWN report doc, linked back to an already-existing report (`:id`) the
// caller has already generated and opened -- not a primary wizard entry
// point. Reuses the linked report's claim/insured/property fields and its
// REVIEWED (non-excluded, edit-honored) photo observations; no new photo
// upload happens here. Stored in the same `reports` collection as any other
// report, so every existing generic endpoint (GET /:id, preview, approve,
// export, download, photos/regenerate) works on it completely unmodified --
// ownership/authorization is therefore identical to every other report
// (userId match on the new doc itself), including cross-user denial.
router.post(
  '/:id/mold-supplement',
  authenticateAny,
  reportsGenerate,
  requireCanGenerate,
  aiLimiter,
  async (req, res) => {
    try {
      const db = getFirestore();
      const userData = await checkAndResetMonthly(db, req.user.uid);
      const tier = getTier(userData.tier || 'starter');
      const reportsThisMonth = userData.reportsThisMonth || 0;
      // Golden Rule #4: same monthly-limit/tier-capability enforcement as any
      // other report generation -- no new tier restriction for this document
      // type (confirmed 2026-08-24, consistent with Phase 31's precedent).
      if (!canGenerate(userData.tier, reportsThisMonth)) {
        return res.status(429).json({
          success: false,
          error: `Monthly report limit reached (${tier.reportsPerMonth} reports). Upgrade your plan.`,
          code: 'LIMIT_EXCEEDED',
          limit: tier.reportsPerMonth,
          used: reportsThisMonth,
        });
      }

      const parentDoc = await loadOwnedReport(db, req.params.id, req.user.uid);
      if (!parentDoc || parentDoc.data().status === 'archived') {
        return res
          .status(404)
          .json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
      }
      const parent = parentDoc.data();
      if (parent.status === 'processing') {
        return res.status(409).json({
          success: false,
          error: 'The linked report is still being analyzed. Please wait for it to finish first.',
          code: 'REPORT_PROCESSING',
        });
      }

      const dateOfDiscovery = String(req.body.dateOfDiscovery || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfDiscovery)) {
        return res.status(400).json({
          success: false,
          error: 'Date of discovery must be a valid date (YYYY-MM-DD)',
          code: 'VALIDATION_ERROR',
        });
      }
      let relatedClaimId = String(
        req.body.relatedClaimId || req.body.relatedClaimNumber || ''
      ).trim();
      if (relatedClaimId.length > 60) {
        return res.status(400).json({
          success: false,
          error: 'relatedClaimId exceeds the 60-character limit',
          code: 'VALIDATION_ERROR',
        });
      }
      // Defaults to the linked report's own claim number when the caller
      // doesn't supply a distinct related-claim identifier.
      if (!relatedClaimId) relatedClaimId = parent.claimNumber || '';

      // Reuse the linked report's REVIEWED photo data only -- the same
      // reviewer-authoritative transform (excluded photos dropped, edited
      // observations honored) that report generation/regeneration already
      // use, never the raw pre-review AI batch output.
      const parentPhotos = Array.isArray(parent.photos) ? parent.photos : [];
      const imageAnalysis = buildEffectiveImageAnalysis(parent.imageAnalysis, parentPhotos);
      const photoCount = imageAnalysis.totalImagesAnalyzed || 0;

      const newId = uuidv4();
      const claimNumber = `${parent.claimNumber || 'CLAIM'}-M`;
      const reportData = {
        documentType: 'MoldSupplement',
        claimNumber,
        relatedClaimId,
        insuredName: parent.insuredName || '',
        insuredEmail: parent.insuredEmail || '',
        propertyAddress: parent.propertyAddress || '',
        policyNumber: parent.policyNumber || '',
        dateOfDiscovery,
        lossDescription: parent.lossDescription || '',
        damagesObserved: parent.damagesObserved || '',
        additionalNotes: parent.additionalNotes || '',
      };

      let gen;
      try {
        gen = await generateReport(reportData, imageAnalysis, photoCount);
      } catch (err) {
        console.error('Mold supplement generation error:', err);
        return res.status(503).json({
          success: false,
          error:
            err.message || 'Report generation is temporarily unavailable. Please try again shortly.',
          code: 'GENERATION_FAILED',
        });
      }
      const qualityCheck = await checkQuality(gen.content);

      // Reference (not copy) the linked report's Storage objects -- read-only,
      // so the supplement's photo appendix/export renders identically to the
      // parent's reviewed photos without duplicating any Storage bytes.
      const reviewedPhotos = parentPhotos.filter((p) => p.review?.status !== 'excluded');
      const now = new Date().toISOString();
      const newReport = {
        id: newId,
        userId: req.user.uid,
        documentType: 'MoldSupplement',
        relatedReportId: req.params.id,
        relatedClaimId,
        dateOfDiscovery,
        claimNumber,
        insuredName: reportData.insuredName,
        insuredEmail: reportData.insuredEmail,
        propertyAddress: reportData.propertyAddress,
        policyNumber: reportData.policyNumber,
        lossDate: parent.lossDate || dateOfDiscovery,
        lossType: 'Mold',
        reportType: 'Preliminary Visual Assessment',
        content: gen.content,
        modelUsed: gen.modelUsed,
        imageAnalysis,
        photos: reviewedPhotos,
        imagePaths: [],
        imageCount: reviewedPhotos.length,
        qualityScore: qualityCheck.score,
        status: 'draft',
        reviewedBy: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
        createdByEmail: req.user.email || null,
      };
      await db.collection('reports').doc(newId).set(newReport);
      await db
        .collection('users')
        .doc(req.user.uid)
        .update({ reportsThisMonth: (userData.reportsThisMonth || 0) + 1 });
      await recordVersion(db.collection('reports').doc(newId), {
        action: 'generated',
        by: req.user.email || req.user.uid,
        content: gen.content,
        note: `Mold Assessment Supplement generated, linked to report ${req.params.id}.`,
      });
      recordAuditLog({
        actorUid: req.user.uid,
        actorEmail: req.user.email,
        action: 'mold_supplement_generated',
        targetType: 'report',
        targetId: newId,
        meta: { parentReportId: req.params.id, relatedClaimId, claimNumber },
        req,
      });
      return res.status(201).json({ success: true, report: newReport });
    } catch (err) {
      console.error('Mold supplement error:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate mold supplement',
        code: 'MOLD_SUPPLEMENT_ERROR',
      });
    }
  }
);

// POST /api/reports/:id/estimate — Phase 37 (Repair Estimate with
// Depreciation Schedule): creates a NEW Repair Estimate report doc, linked
// back to an already-existing report (`:id`) the caller owns. Every dollar
// figure (line totals, subtotal, O&P, tax, RCV, depreciation $, ACV, grand
// total) is computed deterministically in estimateCalculations.js from the
// adjuster-entered lineItems/percentages/depreciationSchedule in the request
// body -- the AI is NEVER called here (Golden Rule #2 explicitly lists
// "final repair costs" as something AI must not determine). Stored as its
// own `reports` doc (documentType: 'RepairEstimate', relatedReportId), so
// every existing generic endpoint (GET /:id, preview, approve, export,
// download) works on it completely unmodified, same as Phase 36's Mold
// Supplement precedent. Owner-only, like Mold Supplement -- a share
// grantee cannot spawn a new derivative document off someone else's report.
router.post(
  '/:id/estimate',
  authenticateAny,
  reportsGenerate,
  requireCanGenerate,
  async (req, res) => {
    try {
      const db = getFirestore();
      const userData = await checkAndResetMonthly(db, req.user.uid);
      const tier = getTier(userData.tier || 'starter');
      const reportsThisMonth = userData.reportsThisMonth || 0;
      // Golden Rule #4: same monthly-limit/tier-capability enforcement as any
      // other generated report -- no new tier restriction for this document
      // type (consistent with Phase 31/36's precedent).
      if (!canGenerate(userData.tier, reportsThisMonth)) {
        return res.status(429).json({
          success: false,
          error: `Monthly report limit reached (${tier.reportsPerMonth} reports). Upgrade your plan.`,
          code: 'LIMIT_EXCEEDED',
          limit: tier.reportsPerMonth,
          used: reportsThisMonth,
        });
      }

      const parentDoc = await loadOwnedReport(db, req.params.id, req.user.uid);
      if (!parentDoc || parentDoc.data().status === 'archived') {
        return res
          .status(404)
          .json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
      }
      const parent = parentDoc.data();
      if (parent.status === 'processing') {
        return res.status(409).json({
          success: false,
          error: 'The linked report is still being analyzed. Please wait for it to finish first.',
          code: 'REPORT_PROCESSING',
        });
      }

      const computed = validateAndComputeEstimate(req.body);
      if (computed.error) {
        return res
          .status(400)
          .json({ success: false, error: computed.error, code: 'VALIDATION_ERROR' });
      }

      const newId = uuidv4();
      const now = new Date().toISOString();
      const revisionHistory = [
        {
          version: 0,
          date: now.slice(0, 10),
          changeSummary: computed.changeSummary || 'Initial estimate created',
          total: computed.totals.grandTotal,
        },
      ];
      const content = buildEstimateContent(
        {
          claimNumber: parent.claimNumber,
          insuredName: parent.insuredName,
          propertyAddress: parent.propertyAddress,
        },
        computed,
        0,
        revisionHistory
      );
      const qualityCheck = await checkQuality(content);

      const newReport = {
        id: newId,
        userId: req.user.uid,
        documentType: 'RepairEstimate',
        relatedReportId: req.params.id,
        claimNumber: parent.claimNumber || '',
        insuredName: parent.insuredName || '',
        insuredEmail: parent.insuredEmail || '',
        propertyAddress: parent.propertyAddress || '',
        policyNumber: parent.policyNumber || '',
        lossDate: parent.lossDate || '',
        lossType: parent.lossType || '',
        reportType: 'Repair Estimate',
        estimateNumber: computed.estimateNumber,
        revision: 0,
        revisionHistory,
        lineItems: computed.lineItems,
        depreciationSchedule: computed.depreciationSchedule,
        overheadProfitPercent: computed.overheadProfitPercent,
        taxRatePercent: computed.taxRatePercent,
        taxBasis: computed.taxBasis,
        priceListBasis: computed.priceListBasis,
        preparedWith: computed.preparedWith,
        estimateDate: computed.estimateDate,
        totals: computed.totals,
        content,
        modelUsed: 'none (deterministic — no AI)',
        photos: [],
        imagePaths: [],
        imageCount: 0,
        qualityScore: qualityCheck.score,
        status: 'draft',
        reviewedBy: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
        createdByEmail: req.user.email || null,
      };
      await db.collection('reports').doc(newId).set(newReport);
      await db
        .collection('users')
        .doc(req.user.uid)
        .update({ reportsThisMonth: reportsThisMonth + 1 });
      await recordVersion(db.collection('reports').doc(newId), {
        action: 'generated',
        by: req.user.email || req.user.uid,
        content,
        note: `Repair Estimate created, linked to report ${req.params.id}.`,
      });
      recordAuditLog({
        actorUid: req.user.uid,
        actorEmail: req.user.email,
        action: 'repair_estimate_created',
        targetType: 'report',
        targetId: newId,
        meta: { parentReportId: req.params.id, estimateNumber: computed.estimateNumber },
        req,
      });
      return res.status(201).json({ success: true, report: newReport });
    } catch (err) {
      console.error('Repair estimate creation error:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to create repair estimate',
        code: 'ESTIMATE_ERROR',
      });
    }
  }
);

// PUT /api/reports/:id/estimate — revises an EXISTING Repair Estimate
// (`:id` here is the estimate document's OWN id, not the parent report's).
// Recomputes every dollar figure from the new inputs and appends exactly one
// new revisionHistory entry -- prior entries are never mutated, matching the
// client sample's append-only Rev 0/Rev 1/Rev 2 log. Uses the same
// owner-or-review-grantee access check as the generic PUT /:id content edit
// (not the owner-only loadOwnedReport used by POST above), since this is an
// edit to an already-shared document, not spawning a new derivative one.
router.put('/:id/estimate', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const existing = doc.data();
    const access = getReportAccess(existing, req.user);
    if (!access) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const isOwnerPath = access === 'owner';
    if (isOwnerPath && !hasCapability(req.user, 'canEditReports')) {
      return res.status(403).json({
        success: false,
        error: 'Your team role does not have permission to do this (canEditReports).',
        code: 'TEAM_PERMISSION_DENIED',
        capability: 'canEditReports',
      });
    }
    if (!isOwnerPath && access !== 'review') {
      return res.status(403).json({
        success: false,
        error: 'You only have view or comment access to this report.',
        code: 'SHARE_PERMISSION_DENIED',
      });
    }
    if (existing.documentType !== 'RepairEstimate') {
      return res.status(400).json({
        success: false,
        error: 'This endpoint only revises a Repair Estimate document',
        code: 'NOT_AN_ESTIMATE',
      });
    }

    const computed = validateAndComputeEstimate(req.body);
    if (computed.error) {
      return res
        .status(400)
        .json({ success: false, error: computed.error, code: 'VALIDATION_ERROR' });
    }
    if (!String(req.body.changeSummary || '').trim()) {
      return res.status(400).json({
        success: false,
        error: 'changeSummary is required when revising an estimate',
        code: 'VALIDATION_ERROR',
      });
    }

    const nextRevision = (existing.revision || 0) + 1;
    const now = new Date().toISOString();
    const revisionHistory = [
      ...(Array.isArray(existing.revisionHistory) ? existing.revisionHistory : []),
      {
        version: nextRevision,
        date: now.slice(0, 10),
        changeSummary: computed.changeSummary,
        total: computed.totals.grandTotal,
      },
    ];
    const content = buildEstimateContent(
      {
        claimNumber: existing.claimNumber,
        insuredName: existing.insuredName,
        propertyAddress: existing.propertyAddress,
      },
      computed,
      nextRevision,
      revisionHistory
    );
    const qualityCheck = await checkQuality(content);

    const updates = {
      revision: nextRevision,
      revisionHistory,
      estimateNumber: computed.estimateNumber,
      lineItems: computed.lineItems,
      depreciationSchedule: computed.depreciationSchedule,
      overheadProfitPercent: computed.overheadProfitPercent,
      taxRatePercent: computed.taxRatePercent,
      taxBasis: computed.taxBasis,
      priceListBasis: computed.priceListBasis,
      preparedWith: computed.preparedWith,
      estimateDate: computed.estimateDate,
      totals: computed.totals,
      content,
      qualityScore: qualityCheck.score,
      // Golden Rule #3: any content change reopens a finalized report as a
      // draft, same as the generic edit path (PUT /:id above).
      status: 'draft',
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: now,
    };
    await ref.update(updates);
    await recordVersion(ref, {
      action: 'edited',
      by: req.user.email || req.user.uid,
      content,
      note: `Repair Estimate revised to Rev. ${nextRevision}: ${computed.changeSummary}`,
    });
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'repair_estimate_revised',
      targetType: 'report',
      targetId: req.params.id,
      meta: { revision: nextRevision },
      req,
    });
    return res.json({ success: true, report: { ...existing, ...updates, id: req.params.id } });
  } catch (err) {
    console.error('Repair estimate revision error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to revise repair estimate',
      code: 'ESTIMATE_ERROR',
    });
  }
});

// POST /api/reports/:id/invoice — Phase 38 (Invoice Document): creates a NEW
// Invoice report doc from an existing, already-created Repair Estimate
// (`:id` is the ESTIMATE's own id). "Services Rendered" is the estimate's
// own already-validated `lineItems`, reused read-only -- never re-entered,
// re-priced, or AI-generated (Golden Rule #2). Every dollar figure
// (services subtotal, tax, payments-received total, balance due) is
// computed deterministically in invoiceCalculations.js from that reused
// data plus the adjuster-entered billTo/dates/tax-rate/payment-history/
// change-order fields in the request body -- the AI is NEVER called here.
// Stored as its own `reports` doc (documentType: 'Invoice', relatedReportId
// pointing at the estimate), so every existing generic endpoint (GET /:id,
// preview, approve, export, download) works on it completely unmodified,
// same as Phase 36/37's precedent. Owner-only, like Mold Supplement/Repair
// Estimate creation -- a share grantee cannot spawn a new derivative
// document off someone else's estimate.
router.post(
  '/:id/invoice',
  authenticateAny,
  reportsGenerate,
  requireCanGenerate,
  async (req, res) => {
    try {
      const db = getFirestore();
      const userData = await checkAndResetMonthly(db, req.user.uid);
      const tier = getTier(userData.tier || 'starter');
      const reportsThisMonth = userData.reportsThisMonth || 0;
      // Golden Rule #4: same monthly-limit/tier-capability enforcement as any
      // other generated report -- no new tier restriction for this document type.
      if (!canGenerate(userData.tier, reportsThisMonth)) {
        return res.status(429).json({
          success: false,
          error: `Monthly report limit reached (${tier.reportsPerMonth} reports). Upgrade your plan.`,
          code: 'LIMIT_EXCEEDED',
          limit: tier.reportsPerMonth,
          used: reportsThisMonth,
        });
      }

      const estimateDoc = await loadOwnedReport(db, req.params.id, req.user.uid);
      if (!estimateDoc || estimateDoc.data().status === 'archived') {
        return res
          .status(404)
          .json({ success: false, error: 'Repair Estimate not found', code: 'NOT_FOUND' });
      }
      const estimate = estimateDoc.data();
      if (estimate.documentType !== 'RepairEstimate') {
        return res.status(400).json({
          success: false,
          error: 'An invoice can only be generated from an existing Repair Estimate',
          code: 'SOURCE_NOT_ESTIMATE',
        });
      }

      const computed = validateAndComputeInvoice(req.body, estimate.lineItems);
      if (computed.error) {
        return res
          .status(400)
          .json({ success: false, error: computed.error, code: 'VALIDATION_ERROR' });
      }

      const newId = uuidv4();
      const now = new Date().toISOString();
      const revisionHistory = [
        {
          version: 0,
          date: now.slice(0, 10),
          changeSummary: computed.changeSummary || 'Initial invoice created',
          balanceDue: computed.totals.balanceDue,
        },
      ];
      const content = buildInvoiceContent(
        { claimNumber: estimate.claimNumber },
        computed,
        0,
        revisionHistory
      );
      const qualityCheck = await checkQuality(content);

      const newReport = {
        id: newId,
        userId: req.user.uid,
        documentType: 'Invoice',
        relatedReportId: req.params.id,
        claimNumber: estimate.claimNumber || '',
        insuredName: estimate.insuredName || '',
        insuredEmail: estimate.insuredEmail || '',
        propertyAddress: estimate.propertyAddress || '',
        policyNumber: estimate.policyNumber || '',
        lossDate: estimate.lossDate || '',
        lossType: estimate.lossType || '',
        reportType: 'Invoice',
        billTo: computed.billTo,
        remitTo: computed.remitTo,
        invoiceNumber: computed.invoiceNumber,
        invoiceDate: computed.invoiceDate,
        dueDate: computed.dueDate,
        jobNumber: computed.jobNumber,
        taxRatePercent: computed.taxRatePercent,
        changeOrderLog: computed.changeOrderLog,
        paymentHistory: computed.paymentHistory,
        paymentTerms: computed.paymentTerms,
        warrantyText: computed.warrantyText,
        servicesRendered: computed.servicesRendered,
        revision: 0,
        revisionHistory,
        totals: computed.totals,
        content,
        modelUsed: 'none (deterministic — no AI)',
        photos: [],
        imagePaths: [],
        imageCount: 0,
        qualityScore: qualityCheck.score,
        status: 'draft',
        reviewedBy: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
        createdByEmail: req.user.email || null,
      };
      await db.collection('reports').doc(newId).set(newReport);
      await db
        .collection('users')
        .doc(req.user.uid)
        .update({ reportsThisMonth: reportsThisMonth + 1 });
      await recordVersion(db.collection('reports').doc(newId), {
        action: 'generated',
        by: req.user.email || req.user.uid,
        content,
        note: `Invoice created, linked to Repair Estimate ${req.params.id}.`,
      });
      recordAuditLog({
        actorUid: req.user.uid,
        actorEmail: req.user.email,
        action: 'invoice_created',
        targetType: 'report',
        targetId: newId,
        meta: { estimateId: req.params.id, invoiceNumber: computed.invoiceNumber },
        req,
      });
      return res.status(201).json({ success: true, report: newReport });
    } catch (err) {
      console.error('Invoice creation error:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to create invoice',
        code: 'INVOICE_ERROR',
      });
    }
  }
);

// PUT /api/reports/:id/invoice — revises an EXISTING Invoice (`:id` here is
// the invoice document's OWN id). Recomputes every dollar figure from the
// new inputs (the linked estimate's servicesRendered snapshot is never
// re-fetched or altered on revision -- it stays exactly what was approved at
// creation time) and appends exactly one new revisionHistory entry -- prior
// entries are never mutated. Uses the same owner-or-review-grantee access
// check as the generic PUT /:id content edit and PUT /:id/estimate revise
// (not the owner-only loadOwnedReport used by POST above), since this is an
// edit to an already-possibly-shared document, not spawning a new one.
router.put('/:id/invoice', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const existing = doc.data();
    const access = getReportAccess(existing, req.user);
    if (!access) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const isOwnerPath = access === 'owner';
    if (isOwnerPath && !hasCapability(req.user, 'canEditReports')) {
      return res.status(403).json({
        success: false,
        error: 'Your team role does not have permission to do this (canEditReports).',
        code: 'TEAM_PERMISSION_DENIED',
        capability: 'canEditReports',
      });
    }
    if (!isOwnerPath && access !== 'review') {
      return res.status(403).json({
        success: false,
        error: 'You only have view or comment access to this report.',
        code: 'SHARE_PERMISSION_DENIED',
      });
    }
    if (existing.documentType !== 'Invoice') {
      return res.status(400).json({
        success: false,
        error: 'This endpoint only revises an Invoice document',
        code: 'NOT_AN_INVOICE',
      });
    }

    const computed = validateAndComputeInvoice(req.body, existing.servicesRendered);
    if (computed.error) {
      return res
        .status(400)
        .json({ success: false, error: computed.error, code: 'VALIDATION_ERROR' });
    }
    if (!String(req.body.changeSummary || '').trim()) {
      return res.status(400).json({
        success: false,
        error: 'changeSummary is required when revising an invoice',
        code: 'VALIDATION_ERROR',
      });
    }

    const nextRevision = (existing.revision || 0) + 1;
    const now = new Date().toISOString();
    const revisionHistory = [
      ...(Array.isArray(existing.revisionHistory) ? existing.revisionHistory : []),
      {
        version: nextRevision,
        date: now.slice(0, 10),
        changeSummary: computed.changeSummary,
        balanceDue: computed.totals.balanceDue,
      },
    ];
    const content = buildInvoiceContent(
      { claimNumber: existing.claimNumber },
      computed,
      nextRevision,
      revisionHistory
    );
    const qualityCheck = await checkQuality(content);

    const updates = {
      revision: nextRevision,
      revisionHistory,
      billTo: computed.billTo,
      remitTo: computed.remitTo,
      invoiceNumber: computed.invoiceNumber,
      invoiceDate: computed.invoiceDate,
      dueDate: computed.dueDate,
      jobNumber: computed.jobNumber,
      taxRatePercent: computed.taxRatePercent,
      changeOrderLog: computed.changeOrderLog,
      paymentHistory: computed.paymentHistory,
      paymentTerms: computed.paymentTerms,
      warrantyText: computed.warrantyText,
      totals: computed.totals,
      content,
      qualityScore: qualityCheck.score,
      // Golden Rule #3: any content change reopens a finalized report as a
      // draft, same as the generic edit path and the estimate revise path.
      status: 'draft',
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: now,
    };
    await ref.update(updates);
    await recordVersion(ref, {
      action: 'edited',
      by: req.user.email || req.user.uid,
      content,
      note: `Invoice revised to Rev. ${nextRevision}: ${computed.changeSummary}`,
    });
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'invoice_revised',
      targetType: 'report',
      targetId: req.params.id,
      meta: { revision: nextRevision },
      req,
    });
    return res.json({ success: true, report: { ...existing, ...updates, id: req.params.id } });
  } catch (err) {
    console.error('Invoice revision error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to revise invoice',
      code: 'INVOICE_ERROR',
    });
  }
});

// POST /api/reports/:id/coverage-letter — Phase 39 (Coverage Determination
// Letter): creates a NEW Coverage Determination Letter, linked to an
// already-FINALIZED base report (`:id`) AND an already-APPROVED (finalized)
// Repair Estimate (`req.body.estimateId`) that is itself linked to that same
// report. Both eligibility checks are enforced server-side via
// validateSourceEligibility -- neither a draft report nor a draft/un-approved
// estimate can ever be the source (this document type's entire purpose is a
// real coverage/payment determination, so Golden Rule #2/#3 are enforced at
// the strictest point of any document type in the app). Every word of
// coverage decision, policy basis, rights/next-steps, and payment figure is
// either adjuster-entered or computed deterministically in code from the
// linked estimate's own reused, frozen-snapshot line items/depreciation
// schedule -- the AI is NEVER called anywhere in this route. Owner-only,
// same as Repair Estimate/Invoice creation -- a share grantee cannot spawn a
// new derivative document off someone else's report. Additionally requires
// `canApprove` (not just `canGenerate`) since authoring this letter IS making
// a coverage determination, the same authority level as approving a report.
router.post(
  '/:id/coverage-letter',
  authenticateAny,
  reportsGenerate,
  requireCanGenerate,
  requireCanApprove,
  async (req, res) => {
    try {
      const db = getFirestore();
      const userData = await checkAndResetMonthly(db, req.user.uid);
      const tier = getTier(userData.tier || 'starter');
      const reportsThisMonth = userData.reportsThisMonth || 0;
      // Golden Rule #4: same monthly-limit/tier-capability enforcement as any
      // other generated report -- no new tier restriction for this document type.
      if (!canGenerate(userData.tier, reportsThisMonth)) {
        return res.status(429).json({
          success: false,
          error: `Monthly report limit reached (${tier.reportsPerMonth} reports). Upgrade your plan.`,
          code: 'LIMIT_EXCEEDED',
          limit: tier.reportsPerMonth,
          used: reportsThisMonth,
        });
      }

      const parentDoc = await loadOwnedReport(db, req.params.id, req.user.uid);
      if (!parentDoc || parentDoc.data().status === 'archived') {
        return res
          .status(404)
          .json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
      }
      const parent = parentDoc.data();

      const estimateId = String(req.body?.estimateId || '').trim();
      if (!estimateId) {
        return res.status(400).json({ success: false, error: 'estimateId is required', code: 'VALIDATION_ERROR' });
      }
      const estimateDoc = await loadOwnedReport(db, estimateId, req.user.uid);
      const estimate = estimateDoc ? estimateDoc.data() : null;

      const eligibility = validateSourceEligibility({
        parentStatus: parent.status,
        estimate,
        expectedRelatedReportId: req.params.id,
      });
      if (eligibility.error) {
        return res.status(400).json({ success: false, error: eligibility.error, code: eligibility.code });
      }

      const computed = validateAndComputeCoverageLetter(req.body, estimate.lineItems, estimate.depreciationSchedule);
      if (computed.error) {
        return res
          .status(400)
          .json({ success: false, error: computed.error, code: 'VALIDATION_ERROR' });
      }

      const newId = uuidv4();
      const now = new Date().toISOString();
      const revisionHistory = [
        {
          version: 0,
          date: now.slice(0, 10),
          changeSummary: computed.changeSummary || 'Initial coverage determination letter created',
          initialPayment: computed.totals.initialPayment,
        },
      ];
      const content = buildCoverageLetterContent(
        {
          claimNumber: parent.claimNumber,
          policyNumber: parent.policyNumber,
          lossDate: parent.lossDate,
          propertyAddress: parent.propertyAddress,
        },
        computed,
        0,
        revisionHistory
      );
      const qualityCheck = await checkQuality(content);

      const newReport = {
        id: newId,
        userId: req.user.uid,
        documentType: 'CoverageDeterminationLetter',
        relatedReportId: req.params.id,
        relatedEstimateId: estimateId,
        claimNumber: parent.claimNumber || '',
        insuredName: parent.insuredName || '',
        insuredEmail: parent.insuredEmail || '',
        propertyAddress: parent.propertyAddress || '',
        policyNumber: parent.policyNumber || '',
        lossDate: parent.lossDate || '',
        lossType: parent.lossType || '',
        reportType: 'Coverage Determination Letter',
        addressee: computed.addressee,
        adjusterOfRecord: computed.adjusterOfRecord,
        letterDate: computed.letterDate,
        determinationSummary: computed.determinationSummary,
        deductible: computed.deductible,
        coverageLimits: computed.coverageLimits,
        perItemDetermination: computed.perItemDetermination,
        rightsAndNextSteps: computed.rightsAndNextSteps,
        enclosures: computed.enclosures,
        // Frozen snapshot of the linked estimate's line items/depreciation
        // schedule at creation time -- matches Phase 38's Invoice
        // `servicesRendered` precedent, so a later revision of the ESTIMATE
        // never silently changes an already-issued letter's own numbers.
        estimateLineItemsSnapshot: estimate.lineItems,
        estimateDepreciationScheduleSnapshot: estimate.depreciationSchedule || [],
        revision: 0,
        revisionHistory,
        totals: computed.totals,
        content,
        modelUsed: 'none (deterministic — no AI, no AI-drafted coverage content)',
        photos: [],
        imagePaths: [],
        imageCount: 0,
        qualityScore: qualityCheck.score,
        status: 'draft',
        reviewedBy: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
        createdByEmail: req.user.email || null,
      };
      await db.collection('reports').doc(newId).set(newReport);
      await db
        .collection('users')
        .doc(req.user.uid)
        .update({ reportsThisMonth: reportsThisMonth + 1 });
      await recordVersion(db.collection('reports').doc(newId), {
        action: 'generated',
        by: req.user.email || req.user.uid,
        content,
        note: `Coverage Determination Letter created, linked to report ${req.params.id} and Repair Estimate ${estimateId}.`,
      });
      recordAuditLog({
        actorUid: req.user.uid,
        actorEmail: req.user.email,
        action: 'coverage_letter_created',
        targetType: 'report',
        targetId: newId,
        meta: { parentReportId: req.params.id, estimateId, determinationSummary: computed.determinationSummary },
        req,
      });
      return res.status(201).json({ success: true, report: newReport });
    } catch (err) {
      console.error('Coverage determination letter creation error:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to create coverage determination letter',
        code: 'COVERAGE_LETTER_ERROR',
      });
    }
  }
);

// PUT /api/reports/:id/coverage-letter — revises an EXISTING Coverage
// Determination Letter (`:id` here is the letter's own id). Recomputes every
// dollar figure from the new inputs against the FROZEN estimate snapshot
// taken at creation time (never a live re-fetch of the estimate -- matches
// Phase 38's Invoice revise precedent) and appends exactly one new
// revisionHistory entry -- prior entries are never mutated. Requires
// `canApprove` for the same reason creation does: revising a coverage
// determination is itself making one.
router.put('/:id/coverage-letter', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('reports').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const existing = doc.data();
    const access = getReportAccess(existing, req.user);
    if (!access) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const isOwnerPath = access === 'owner';
    if (isOwnerPath && !(hasCapability(req.user, 'canEditReports') && hasCapability(req.user, 'canApprove'))) {
      return res.status(403).json({
        success: false,
        error: 'Your team role does not have permission to do this (canEditReports + canApprove).',
        code: 'TEAM_PERMISSION_DENIED',
        capability: 'canApprove',
      });
    }
    if (!isOwnerPath && access !== 'review') {
      return res.status(403).json({
        success: false,
        error: 'You only have view or comment access to this report.',
        code: 'SHARE_PERMISSION_DENIED',
      });
    }
    if (existing.documentType !== 'CoverageDeterminationLetter') {
      return res.status(400).json({
        success: false,
        error: 'This endpoint only revises a Coverage Determination Letter document',
        code: 'NOT_A_COVERAGE_LETTER',
      });
    }

    const computed = validateAndComputeCoverageLetter(
      req.body,
      existing.estimateLineItemsSnapshot,
      existing.estimateDepreciationScheduleSnapshot
    );
    if (computed.error) {
      return res
        .status(400)
        .json({ success: false, error: computed.error, code: 'VALIDATION_ERROR' });
    }
    if (!String(req.body.changeSummary || '').trim()) {
      return res.status(400).json({
        success: false,
        error: 'changeSummary is required when revising a coverage determination letter',
        code: 'VALIDATION_ERROR',
      });
    }

    const nextRevision = (existing.revision || 0) + 1;
    const now = new Date().toISOString();
    const revisionHistory = [
      ...(Array.isArray(existing.revisionHistory) ? existing.revisionHistory : []),
      {
        version: nextRevision,
        date: now.slice(0, 10),
        changeSummary: computed.changeSummary,
        initialPayment: computed.totals.initialPayment,
      },
    ];
    const content = buildCoverageLetterContent(
      {
        claimNumber: existing.claimNumber,
        policyNumber: existing.policyNumber,
        lossDate: existing.lossDate,
        propertyAddress: existing.propertyAddress,
      },
      computed,
      nextRevision,
      revisionHistory
    );
    const qualityCheck = await checkQuality(content);

    const updates = {
      revision: nextRevision,
      revisionHistory,
      addressee: computed.addressee,
      adjusterOfRecord: computed.adjusterOfRecord,
      letterDate: computed.letterDate,
      determinationSummary: computed.determinationSummary,
      deductible: computed.deductible,
      coverageLimits: computed.coverageLimits,
      perItemDetermination: computed.perItemDetermination,
      rightsAndNextSteps: computed.rightsAndNextSteps,
      enclosures: computed.enclosures,
      totals: computed.totals,
      content,
      qualityScore: qualityCheck.score,
      // Golden Rule #3: any content change reopens a finalized letter as a
      // draft, same as every other edit path in the app.
      status: 'draft',
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: now,
    };
    await ref.update(updates);
    await recordVersion(ref, {
      action: 'edited',
      by: req.user.email || req.user.uid,
      content,
      note: `Coverage Determination Letter revised to Rev. ${nextRevision}: ${computed.changeSummary}`,
    });
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'coverage_letter_revised',
      targetType: 'report',
      targetId: req.params.id,
      meta: { revision: nextRevision },
      req,
    });
    return res.json({ success: true, report: { ...existing, ...updates, id: req.params.id } });
  } catch (err) {
    console.error('Coverage determination letter revision error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to revise coverage determination letter',
      code: 'COVERAGE_LETTER_ERROR',
    });
  }
});

// Phase 11 (Export Options Modal & PDF Layout Completion): confidentiality
// line shown in every export's footer -- not a checkbox, always present.
const CONFIDENTIALITY_STATEMENT =
  'CONFIDENTIAL — For authorized recipients only. Contains privileged claim information.';
const PHOTO_LAYOUTS = new Set([1, 2, 4]);

// A boolean export-option toggle defaults to `true` (today's existing export
// output) whenever the caller omits it or sends a non-boolean value -- an
// older client (or a direct API caller that predates this phase) gets
// unchanged behavior, per the phase's backward-compatibility requirement.
const parseExportBoolOption = (value) => (typeof value === 'boolean' ? value : true);

// Incident fix (repeated export failures): a cheap server-side guard against
// duplicate/concurrent export jobs for the same report+format. A double-click
// (or two open tabs) on "Export"/"Download" used to fire overlapping
// generate-PDF/DOCX requests for the same report, each independently
// downloading every photo from Storage and holding all of them in memory at
// once -- on a resource-constrained single instance that's a direct path to
// slow/failed exports for both concurrent requests. In-memory only (courtesy
// guard against accidental double-submits, not a cross-instance lock); always
// released in `finally` so a crashed/hung request can never permanently block
// a retry, and any entry older than the TTL is treated as stale and reusable.
const activeExports = new Map(); // `${reportId}:${format}` -> startedAt (ms)
const EXPORT_LOCK_TTL_MS = 5 * 60 * 1000;
const acquireExportLock = (key) => {
  const startedAt = activeExports.get(key);
  if (startedAt && Date.now() - startedAt < EXPORT_LOCK_TTL_MS) return false;
  activeExports.set(key, Date.now());
  return true;
};
const releaseExportLock = (key) => activeExports.delete(key);

// Structured, safe diagnostic logging for export failures -- report id,
// format, stage, and error class/elapsed time only. Never logs err.message,
// err.stack, Storage URLs, or report/claim content (Golden Rule #6).
const logExportFailure = ({ reportId, format, stage, err, startedAt }) => {
  console.error('[Export] failed', {
    reportId,
    format,
    stage,
    errorClass: err?.name || err?.constructor?.name || 'Error',
    elapsedMs: Date.now() - startedAt,
  });
};

// Builds the ordered list of photos for the export's "Photo Documentation"
// appendix. Excludes anything Phase 8 marked 'excluded' and anything that
// never finished uploading -- only ever real, reviewer-approved/edited data
// (Golden Rule #1: no fabricated captions/observations). Legacy pre-Phase-6
// reports have no per-photo record at all, so they fall back to the flat
// `imagePaths` list with no location/observation (never invented).
const buildAppendixPhotoList = async (report) => {
  const items = [];
  if (Array.isArray(report.photos) && report.photos.length) {
    // Phase 24: the export appendix follows the reviewer's saved display
    // order, not raw upload order -- a photo missing `position` (uploaded
    // before this phase existed) falls back to its original array index.
    const orderedPhotos = report.photos
      .map((p, i) => ({ p, sortKey: Number.isFinite(p.position) ? p.position : i }))
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ p }) => p);
    // Perf/timeout fix: these used to download sequentially (await inside a
    // for..of loop), so a 12-20 photo report multiplied Storage round-trip
    // latency roughly linearly -- a real contributor to exports hitting the
    // client's fixed request timeout. Downloading in parallel (order
    // preserved via the index-matched `buffers` array) is a straight win with
    // no behavior change; a failed download is still skipped, not fabricated.
    const candidates = orderedPhotos.filter(
      (p) => p.status === 'uploaded' && p.objectPath && p.review?.status !== 'excluded'
    );
    const buffers = await Promise.all(
      candidates.map((p) =>
        downloadBuffer(p.objectPath).catch((err) => {
          console.warn(
            `[Export] appendix photo ${p.id || 'unknown'} unavailable in Storage (${err?.constructor?.name || 'Error'}) -- skipped`
          );
          return null;
        })
      )
    );
    candidates.forEach((p, i) => {
      const buffer = buffers[i];
      if (!buffer) return; // photo unavailable in Storage -- silently skip, not fabricate
      const observation =
        p.review?.status === 'edited' && p.review?.observation
          ? p.review.observation
          : p.analysis?.observation || null;
      items.push({
        buffer,
        mimeType: p.mimeType || 'image/jpeg',
        caption: p.fileName || null,
        location: p.analysis?.location || null,
        observation,
      });
    });
  } else if ((report.imagePaths || []).length) {
    const buffers = await Promise.all(
      report.imagePaths.map((p, i) =>
        downloadBuffer(p).catch((err) => {
          console.warn(
            `[Export] legacy photo #${i + 1} unavailable in Storage (${err?.constructor?.name || 'Error'}) -- skipped`
          );
          return null;
        })
      )
    );
    buffers.forEach((buffer, i) => {
      if (!buffer) return;
      items.push({
        buffer,
        mimeType: 'image/jpeg',
        caption: `Photo ${i + 1}`,
        location: null,
        observation: null,
      });
    });
  }
  return items;
};

// POST /api/reports/:id/export
router.post('/:id/export', authenticateAny, reportsExport, requireCanExport, async (req, res) => {
  const startedAt = Date.now();
  let stage = 'lookup';
  let exportLockKey = null;
  try {
    const db = getFirestore();
    const doc = await db.collection('reports').doc(req.params.id).get();
    if (!doc.exists || doc.data().userId !== req.user.uid || doc.data().status === 'archived') {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    // Phase 7: nothing to export yet while the pipeline is still running.
    if (doc.data().status === 'processing') {
      return res
        .status(409)
        .json({
          success: false,
          error:
            'This report is still being analyzed. Please wait for it to finish before exporting.',
          code: 'REPORT_PROCESSING',
        });
    }
    // Phase 8: avoid exporting content that's about to be replaced.
    if (doc.data().regenerating) {
      return res
        .status(409)
        .json({
          success: false,
          error:
            'This report is being regenerated from photo review. Please wait for it to finish before exporting.',
          code: 'REPORT_REGENERATING',
        });
    }

    const report = { id: doc.id, ...doc.data() };
    const { format = 'pdf', includeImages = true } = req.body;
    if (!['pdf', 'docx', 'html'].includes(format)) {
      return res
        .status(400)
        .json({
          success: false,
          error: 'Invalid format. Use pdf, docx, or html',
          code: 'INVALID_FORMAT',
        });
    }

    // Get user data for branding
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userData = userDoc.data() || {};
    const tier = getTier(userData.tier || 'starter');

    // Golden Rule #4: entitlements enforced server-side, not just hidden in
    // the UI -- `tier.exportFormats` existed in config but was never actually
    // checked here before this phase, so a starter-tier caller could get a
    // clean DOCX/HTML directly from the API despite the UI only offering PDF.
    if (!tier.exportFormats.includes(format)) {
      return res.status(403).json({
        success: false,
        error: `Your plan does not include ${format.toUpperCase()} export. Upgrade to unlock it.`,
        code: 'EXPORT_FORMAT_NOT_ALLOWED',
      });
    }

    // Incident fix: reject a duplicate/overlapping export for the same
    // report+format instead of letting a double-click (or two tabs) spin up
    // two independent PDF/DOCX generations at once. Always released in the
    // `finally` below so a retry is never blocked by this guard.
    exportLockKey = `${req.params.id}:${format}`;
    if (!acquireExportLock(exportLockKey)) {
      exportLockKey = null; // not ours to release
      return res.status(409).json({
        success: false,
        error:
          'An export for this report in this format is already in progress. Please wait for it to finish, then retry.',
        code: 'EXPORT_IN_PROGRESS',
      });
    }

    // Phase 11: export options -- validated/coerced server-side (Golden Rule
    // #4), never trusted as-is from the client.
    const includeCoverPage = parseExportBoolOption(req.body.includeCoverPage);
    const includePhotoCaptions = parseExportBoolOption(req.body.includePhotoCaptions);
    const includePageNumbers = parseExportBoolOption(req.body.includePageNumbers);
    const includeAppendix = parseExportBoolOption(req.body.includeAppendix);
    const includeCompanyBranding = parseExportBoolOption(req.body.includeCompanyBranding);
    const photoLayoutRaw = parseInt(req.body.photoLayout, 10);
    const photoLayout = PHOTO_LAYOUTS.has(photoLayoutRaw) ? photoLayoutRaw : 2;

    // Golden Rule #3: un-reviewed drafts never export as a clean final document.
    const reviewed = isReviewed(report.status);
    const safeClaimNum = (report.claimNumber || report.id || 'report').replace(
      /[^a-zA-Z0-9]/g,
      '_'
    );
    const filenameBase = `report_${safeClaimNum}${reviewed ? '' : '_DRAFT'}_${Date.now()}`;

    // Get white-label config if enterprise
    let wlConfig = null;
    if (tier.whiteLabel) {
      const wlSnap = await db
        .collection('enterpriseClients')
        .where('userId', '==', req.user.uid)
        .limit(1)
        .get();
      if (!wlSnap.empty) wlConfig = wlSnap.docs[0].data();
    }

    // Phase 18 (Settings Completion): resolve company/footer from the
    // ORGANIZATION, not just this caller's own doc, so a team member's export
    // reflects the org's Settings -> Organization/Branding fields rather than
    // their own likely-blank profile. A solo account is its own organization
    // (resolveOrganizationId returns its own uid), so this never adds an
    // extra read for the common case.
    const orgId = resolveOrganizationId(req.user);
    let orgUserData = userData;
    if (orgId !== req.user.uid) {
      const orgDoc = await db.collection('users').doc(orgId).get();
      if (orgDoc.exists) orgUserData = orgDoc.data();
    }

    // When white-label config exists with a company name, always hide FlacronAI branding
    const hasWhiteLabel = !!wlConfig?.companyName;
    // Phase 13 (Real Template Builder): a template's own branding is the
    // lowest-priority fallback -- it only ever fills in when neither the
    // org's white-label config nor the user's own profile branding is set,
    // so it can never silently override an explicit user/org choice.
    const templateBranding = report.templateBranding || null;
    const logoObjectPath = wlConfig?.logoPath || userData.logoPath || templateBranding?.logoObjectPath || null;
    const draftWatermark = !reviewed; // un-reviewed drafts are always watermarked
    const watermarkText = draftWatermark
      ? 'DRAFT — PENDING ADJUSTER REVIEW'
      : 'Generated by FlacronAI — Upgrade to remove watermark';
    // Phase 13 found (and fixed) that this only ever suppressed the literal
    // "FlacronAI" text for a TEMPLATE's own branding, never for a real
    // company name the user/org had set themselves -- Phase 18 closes that
    // remaining gap: ANY resolved custom name (white-label, org/personal
    // Settings, or template) now suppresses the generic branding, not just
    // the template case.
    const resolvedCompanyName = wlConfig?.companyName || orgUserData.company || templateBranding?.companyName || null;
    // Phase 31/32/33/34 (Liability/Commercial/Flood/Theft document types):
    // cover title/subtitle only -- the generic "INSURANCE INSPECTION REPORT"
    // title is unchanged for every other document type (including a future
    // `claimType`/`lossType` this switch doesn't recognize yet). Flood and
    // Theft are keyed off `lossType` and checked FIRST, since a lossType
    // template takes precedence over any claimType template (approved
    // decision, PHASES.md Phase 33, reused for Phase 34).
    const reportTitle =
      report.documentType === 'CoverageDeterminationLetter'
        ? 'COVERAGE DETERMINATION LETTER'
        : report.documentType === 'Invoice'
        ? 'INVOICE'
        : report.documentType === 'RepairEstimate'
        ? 'REPAIR ESTIMATE'
        : report.documentType === 'MoldSupplement'
        ? 'MOLD ASSESSMENT — PRELIMINARY REPORT'
        : report.lossType === 'Flood'
        ? 'FLOOD (NFIP) INSPECTION REPORT'
        : report.lossType === 'Theft'
          ? 'THEFT / BURGLARY INSPECTION REPORT'
          : report.claimType === 'Liability'
            ? 'LIABILITY INVESTIGATION REPORT'
            : report.claimType === 'Commercial'
              ? 'COMMERCIAL PROPERTY INSPECTION REPORT'
              : report.claimType === 'Auto'
                ? 'VEHICLE DAMAGE INSPECTION REPORT'
                : 'INSURANCE INSPECTION REPORT';
    // Table of Contents labels for the PDF cover -- only overridden for
    // Liability/Commercial/Flood/Theft (matches each's actual manifest);
    // every other document type keeps generatePDF's own generic default.
    const tocSections =
      report.documentType === 'CoverageDeterminationLetter'
        ? [
            'Section 1: Applicable Policy Coverages',
            'Section 2: Item-by-Item Coverage Rationale',
            'Section 3: Items Pending Further Review',
            'Section 4: Payment Calculation',
            'Section 5: Understanding Depreciation',
            'Section 6: Your Rights & Next Steps',
            'Section 7: Enclosures',
            'Section 8: Revision History',
            'Section 9: Adjuster Review & Sign-Off',
          ]
        : report.documentType === 'Invoice'
        ? [
            'Section 1: Invoice Details',
            'Section 2: Services Rendered',
            'Section 3: Invoice Totals',
            'Section 4: Payment History',
            'Section 5: Change Order Log',
            'Section 6: Revision History',
            'Section 7: Payment Terms & Remit-To',
            'Section 8: Adjuster Review & Sign-Off',
          ]
        : report.documentType === 'RepairEstimate'
        ? [
            'Section 1: Report Information',
            'Section 2: Line Item Detail',
            'Section 3: Depreciation Schedule',
            'Section 4: Revision History',
            'Section 5: Terms & Conditions',
            'Section 6: Adjuster Review & Sign-Off',
          ]
        : report.documentType === 'MoldSupplement'
        ? [
            'Section 1: Report Information',
            'Section 2: Insured Information',
            'Section 3: Background — Related Claim',
            'Section 4: Important Notice — Scope of This Report',
            'Section 5: Visual Observations',
            'Section 6: Recommended Next Steps',
            'Section 7: Adjuster Review Checklist',
            'Section 8: Conclusion & Adjuster Notes',
            'Section 9: Photo Documentation',
          ]
        : report.lossType === 'Flood'
        ? [
            'Section 1: Insured & Policy Information',
            'Section 2: Property & Flood Zone Data',
            'Section 3: Flood Event Data',
            'Section 4: Property Description',
            'Section 5: Damage Assessment',
            'Section 6: Scope of Work',
            'Section 7: Adjuster Review Checklist',
            'Section 8: Recommendations',
            'Section 9: Conclusion',
            'Section 10: Photo Documentation',
          ]
        : report.lossType === 'Theft'
          ? [
              'Section 1: Insured & Policy Information',
              'Section 2: Property & Loss Information',
              'Section 3: Incident Data',
              'Section 4: Incident Summary',
              'Section 5: Damage Assessment',
              'Section 6: Scope of Work',
              'Section 7: Adjuster Review Checklist',
              'Section 8: Recommendations',
              'Section 9: Conclusion',
              'Section 10: Photo Documentation',
            ]
          : report.claimType === 'Liability'
          ? [
              'Section 1: Parties',
              'Section 2: Incident Data',
              'Section 3: Incident Summary',
              'Section 4: Scene Observations',
              'Section 5: Investigation Checklist',
              'Section 6: Adjuster Review Checklist',
              'Section 7: Recommendations',
              'Section 8: Conclusion',
              'Section 9: Photo Documentation',
            ]
          : report.claimType === 'Commercial'
            ? [
                'Section 1: Insured & Property Information',
                'Section 2: Loss Description',
                'Section 3: Damage Assessment',
                'Section 4: Roof Moisture Scan',
                'Section 5: Scope of Work',
                'Section 6: Adjuster Review Checklist',
                'Section 7: Recommendations',
                'Section 8: Conclusion',
                'Section 9: Photo Documentation',
              ]
            : report.claimType === 'Auto'
              ? [
                  'Section 1: Insured & Policy Information',
                  'Section 2: Vehicle Information',
                  'Section 3: Loss Information',
                  'Section 4: Panel-by-Panel Damage Assessment',
                  'Section 5: Loss Summary',
                  'Section 5B: Repairability Assessment',
                  'Section 6: Adjuster Review Checklist',
                  'Section 7: Recommendations',
                  'Section 8: Conclusion',
                  'Section 9: Photo Documentation',
                ]
              : undefined;
    const pdfOptions = {
      reportTitle,
      ...(tocSections ? { tocSections } : {}),
      companyName: resolvedCompanyName || 'FlacronAI',
      primaryColor: wlConfig?.primaryColor ? hexToRgb(wlConfig.primaryColor) : [253, 68, 3],
      watermark: tier.watermark || draftWatermark,
      watermarkText,
      reportFooter: wlConfig?.reportFooter || orgUserData.reportFooter || templateBranding?.footerText || null,
      hideFlacronBranding:
        hasWhiteLabel ||
        wlConfig?.hideFlacronBranding ||
        !!resolvedCompanyName ||
        false,
      // Phase 11 (Export Options Modal & PDF Layout Completion)
      includeCoverPage,
      includePhotoCaptions,
      includePageNumbers,
      includeCompanyBranding,
      photoLayout,
      confidentialityStatement: CONFIDENTIALITY_STATEMENT,
    };

    // Pull branding logo + report photos from Storage as buffers (best-effort).
    stage = 'photo-resolution';
    if (logoObjectPath) {
      try {
        pdfOptions.logoBuffer = await downloadBuffer(logoObjectPath);
      } catch {
        /* logo optional */
      }
    }
    // Phase 11: the "Photo Documentation" appendix is now a dedicated,
    // layout-aware section (1/2/4 photos per page, each with its own number/
    // caption/area/observation) instead of a fixed 2-column image grid --
    // `includeAppendix` is a real toggle, not just tied to `includeImages`.
    pdfOptions.appendixPhotos =
      includeImages && includeAppendix ? await buildAppendixPhotoList(report) : [];

    // Phase 9: resolve any `![[photo:ID|caption]]`/photo-grid tokens the rich
    // editor may have inserted inline into section content. Only photoIds the
    // report itself already owns (its `photos` array or legacy `imagePaths`
    // index) are ever resolved -- never a client-supplied URL.
    const photoMap = {};
    if (includeImages) {
      const referencedIds = collectReferencedPhotoIds(report.content || '');
      const photoRecords = Array.isArray(report.photos) ? report.photos : [];
      const legacyPaths = report.imagePaths || [];
      await Promise.all(
        referencedIds.map(async (id) => {
          let objectPath = null;
          let mimeType = 'image/jpeg';
          if (id.startsWith('legacy-')) {
            const idx = parseInt(id.slice('legacy-'.length), 10);
            objectPath = legacyPaths[idx] || null;
          } else {
            const rec = photoRecords.find((p) => p.id === id);
            if (rec && rec.status === 'uploaded' && rec.objectPath) {
              objectPath = rec.objectPath;
              mimeType = rec.mimeType || mimeType;
            }
          }
          if (!objectPath) return;
          try {
            const buf = await downloadBuffer(objectPath);
            photoMap[id] = { buffer: buf, mimeType };
          } catch (err) {
            // referenced photo unavailable -- generator renders a placeholder,
            // not a crash. Logged (id only, never the object path) for ops visibility.
            console.warn(
              `[Export] inline photo ${id} unavailable in Storage (${err?.constructor?.name || 'Error'}) -- placeholder will render`
            );
          }
        })
      );
    }
    pdfOptions.photoMap = photoMap;

    let buffer;
    let ext;
    let contentType;

    // Each generation stage gets its own try/catch and error code -- a
    // failure in the PDF library, the DOCX/OOXML builder, or the watermark
    // post-process is diagnostically distinct from a generic "export
    // failed", and from each other (an incident triaging "repeated export
    // failures" needs to be able to tell them apart).
    try {
      if (format === 'pdf') {
        ext = 'pdf';
        contentType = 'application/pdf';
        stage = 'pdf-generation';
        // The final overlay below is the single authoritative PDF watermark.
        // Disable PDFKit's built-in layer here to avoid doubled/illegible marks.
        buffer = await generatePDF(report, { ...pdfOptions, watermark: false });
      } else if (format === 'docx') {
        ext = 'docx';
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        stage = 'docx-generation';
        buffer = await generateDOCX(report, {
          reportTitle: pdfOptions.reportTitle,
          companyName: pdfOptions.companyName,
          hideFlacronBranding: pdfOptions.hideFlacronBranding,
          watermark: pdfOptions.watermark,
          watermarkText: pdfOptions.watermarkText,
          photoMap,
          includeCoverPage,
          includePhotoCaptions,
          includePageNumbers,
          includeCompanyBranding,
          photoLayout,
          appendixPhotos: pdfOptions.appendixPhotos,
          confidentialityStatement: CONFIDENTIALITY_STATEMENT,
        });
      } else if (format === 'html') {
        ext = 'html';
        contentType = 'text/html';
        stage = 'html-generation';
        buffer = Buffer.from(generateHTML(report, { ...pdfOptions, photoMap }), 'utf8');
      } else {
        return res
          .status(400)
          .json({
            success: false,
            error: 'Invalid format. Use pdf, docx, or html',
            code: 'INVALID_FORMAT',
          });
      }
    } catch (genErr) {
      logExportFailure({ reportId: req.params.id, format, stage, err: genErr, startedAt });
      return res.status(500).json({
        success: false,
        error: `Failed to generate the ${format.toUpperCase()} document. Please retry -- if this keeps happening, contact support.`,
        code: `${format.toUpperCase()}_GENERATION_ERROR`,
      });
    }

    // Apply watermark overlay for starter tier and/or un-reviewed drafts.
    // Fail closed: a draft must never be returned as a clean-looking final
    // document just because watermark post-processing failed -- so this is
    // its own stage/error code rather than folded into pdf-generation above.
    if (format === 'pdf' && (tier.watermark || draftWatermark)) {
      try {
        stage = 'watermark';
        buffer = await addWatermarkToPDF(buffer, pdfOptions.watermarkText, null);
      } catch (wmErr) {
        logExportFailure({ reportId: req.params.id, format, stage, err: wmErr, startedAt });
        return res.status(500).json({
          success: false,
          error: 'Failed to finalize the PDF (watermark step). Please retry.',
          code: 'WATERMARK_ERROR',
        });
      }
    }

    const filename = `${filenameBase}.${ext}`;
    try {
      stage = 'storage-upload';
      await uploadBuffer(exportObject(req.user.uid, filename), buffer, contentType);
    } catch (upErr) {
      logExportFailure({ reportId: req.params.id, format, stage, err: upErr, startedAt });
      return res.status(502).json({
        success: false,
        error: 'Failed to save the exported file. Please retry.',
        code: 'EXPORT_UPLOAD_ERROR',
      });
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const downloadUrl = `/api/reports/${req.params.id}/download?file=${filename}`;

    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'report_exported',
      targetType: 'report',
      targetId: req.params.id,
      meta: { format, claimNumber: report.claimNumber, draft: !reviewed },
      req,
    });
    // Phase 20: no dedicated preference key covers export (Phase 18 spec'd 6
    // keys, none named "export") -- this fires ungated, matching Phase 18's
    // own stated posture ("no new toggle key was fabricated for a feature not
    // yet exposed in Settings' UI"). It's also a direct, immediate result of
    // the caller's own click, not a background/async surprise -- closer to a
    // receipt than an alert, so notification-spam risk is minimal.
    notifyUser(db, req.user.uid, NOTIFICATION_TYPES.EXPORT_COMPLETED, {
      reportId: req.params.id,
      claimNumber: report.claimNumber || null,
      format,
    }).catch((err) => console.warn('[Notifications] export-completed notification failed:', err.message));
    return res.json({ success: true, downloadUrl, expiresAt, format, filename });
  } catch (err) {
    // Do not leak stack traces / internals / raw report data to the client or
    // the logs (Rule #6) -- structured diagnostics only.
    logExportFailure({
      reportId: req.params.id,
      format: req.body?.format || 'pdf',
      stage,
      err,
      startedAt,
    });
    return res.status(500).json({
      success: false,
      error: 'Export failed. Please retry -- if this keeps happening, contact support.',
      code: 'EXPORT_ERROR',
    });
  } finally {
    if (exportLockKey) releaseExportLock(exportLockKey);
  }
});

// GET /api/reports/:id/download
router.get('/:id/download', authenticateAny, reportsExport, requireCanExport, async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('reports').doc(req.params.id).get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }

    const filename = req.query.file;
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid filename', code: 'INVALID_FILE' });
    }

    let buffer;
    try {
      buffer = await downloadBuffer(exportObject(req.user.uid, filename));
    } catch {
      return res
        .status(404)
        .json({ success: false, error: 'File not found or expired', code: 'FILE_NOT_FOUND' });
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.html': 'text/html',
    };
    const mime = mimeTypes[ext] || 'application/octet-stream';

    const inline = req.query.inline === 'true';
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (ext === '.html') {
      res.setHeader(
        'Content-Security-Policy',
        "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:"
      );
    }
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${filename}"`
    );
    return res.send(buffer);
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Download failed', code: 'DOWNLOAD_ERROR' });
  }
});

// GET /api/reports/:id/documents/download — fetch a supporting document
// uploaded via the wizard (Phase 5). Mirrors /:id/download's private-object
// proxy pattern; documents are matched by their stored fileName, not a raw
// storage path, so the client only ever needs what it already has.
router.get('/:id/documents/download', authenticateAny, reportsRead, async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('reports').doc(req.params.id).get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }

    const fileName = req.query.file;
    if (!fileName) {
      return res
        .status(400)
        .json({ success: false, error: 'Missing file parameter', code: 'INVALID_FILE' });
    }
    const record = (doc.data().documents || []).find((d) => d.fileName === fileName);
    if (!record) {
      return res
        .status(404)
        .json({ success: false, error: 'Document not found', code: 'FILE_NOT_FOUND' });
    }

    let buffer;
    try {
      buffer = await downloadBuffer(record.objectPath);
    } catch {
      return res
        .status(404)
        .json({ success: false, error: 'File not found or expired', code: 'FILE_NOT_FOUND' });
    }

    res.setHeader('Content-Type', record.mimeType || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${record.fileName}"`);
    return res.send(buffer);
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Download failed', code: 'DOWNLOAD_ERROR' });
  }
});

// ── PER-PHOTO GALLERY (Phase 6: Photo Upload & Per-Photo UX Hardening) ─────
// Photos are private Storage objects (same as documents/exports above), so
// they're served through an authenticated proxy rather than a public/signed
// URL, matching the existing pattern.

// Phase 8 default for a photo with no review activity yet -- matches
// photoJobService's DEFAULT_REVIEW (duplicated here, not imported, purely to
// keep this GET route's shape self-contained for legacy synthesis below).
const DEFAULT_PHOTO_REVIEW = () => ({
  status: 'pending',
  observation: null,
  note: '',
  reviewedBy: null,
  reviewedAt: null,
});

// GET /api/reports/:id/photos — normalized per-photo list for a review gallery.
// Reports created since Phase 6 already have a `photos` array (id/fileName/
// size/status/thumbnail availability), extended (Phase 8) with each photo's
// structured `analysis` and human `review` state. Reports created before
// Phase 6 only have the old flat `imagePaths`/`imageCount` -- this synthesizes
// an equivalent list from that (no thumbnail, status always 'uploaded',
// synthetic "legacy-{index}" ids, `reviewable: false` since there's no real
// photo record to persist a review against) so the frontend gallery never has
// to special-case the old shape at all.
router.get('/:id/photos', authenticateAny, reportsRead, async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('reports').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    // Phase 19/22: any access tier (not just the owner) may view this list --
    // it's already redacted to booleans/ids, never raw Storage paths, so a
    // 'view'/'comment' grantee seeing it is no different from them seeing the
    // report's own content via GET /:id.
    if (!getReportAccess(doc.data(), req.user)) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const data = doc.data();
    let photos;
    if (Array.isArray(data.photos)) {
      // Phase 24: respect the persisted display order (falling back to
      // original array/upload order for any pre-Phase-24 photo that has no
      // `position` yet, via its array index) -- so the reviewer's saved
      // reorder is what every consumer of this list actually sees.
      photos = data.photos
        .map((p, i) => ({
          id: p.id,
          fileName: p.fileName,
          size: p.size,
          mimeType: p.mimeType,
          status: p.status,
          hasThumbnail: !!p.thumbnailPath,
          hasOriginal: !!p.originalPath,
          error: p.error || null,
          uploadedAt: p.uploadedAt,
          analysisStatus: p.analysisStatus || null,
          analysisError: p.analysisError || null,
          analysis: p.analysis || null,
          review: p.review || DEFAULT_PHOTO_REVIEW(),
          reviewable: true,
          position: Number.isFinite(p.position) ? p.position : i,
          qualityWarning: !!p.qualityWarning,
          qualityReasons: p.qualityReasons || [],
          qualityMetrics: p.qualityMetrics || null,
          capturedAt: p.capturedAt || null,
          roomOrArea: p.roomOrArea || null,
          annotations: p.annotations || null,
        }))
        .sort((a, b) => a.position - b.position);
    } else {
      photos = (data.imagePaths || []).map((objectPath, i) => ({
        id: `legacy-${i}`,
        fileName: `Photo ${i + 1}`,
        size: null,
        mimeType: null,
        status: 'uploaded',
        hasThumbnail: false,
        error: null,
        uploadedAt: data.createdAt || null,
        analysisStatus: null,
        analysisError: null,
        analysis: null,
        review: DEFAULT_PHOTO_REVIEW(),
        reviewable: false,
      }));
    }
    return res.json({ success: true, photos });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Failed to fetch photos', code: 'PHOTOS_ERROR' });
  }
});

// PUT /api/reports/:id/photos/:photoId/review — Phase 8 (Per-Photo Analysis
// Review UI): Edit / Approve / Exclude / Include (restore) / Add Note actions
// on one photo's AI observation. Feeds POST /:id/photos/regenerate below.
// Phase 19: requireCanEditReports was removed from this route's middleware
// chain and is now applied inline, ONLY on the owner path -- same reasoning
// as PUT /:id above (a grantee's capability comes entirely from their
// per-report `assignedUsers` grant, never their own account role).
router.put('/:id/photos/:photoId/review', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const action = String(req.body?.action || '');
    if (!['approve', 'edit', 'exclude', 'include', 'note', 'set_area'].includes(action)) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid review action', code: 'INVALID_ACTION' });
    }
    const db = getFirestore();
    const doc = await db.collection('reports').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const access = getReportAccess(doc.data(), req.user);
    if (!access) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const isOwnerPath = access === 'owner';
    if (isOwnerPath && !hasCapability(req.user, 'canEditReports')) {
      return res.status(403).json({
        success: false,
        error: 'Your team role does not have permission to do this (canEditReports).',
        code: 'TEAM_PERMISSION_DENIED',
        capability: 'canEditReports',
      });
    }
    if (!isOwnerPath && access !== 'review') {
      return res.status(403).json({
        success: false,
        error: 'You only have view or comment access to this report.',
        code: 'SHARE_PERMISSION_DENIED',
      });
    }
    const result = await photoJobService.updatePhotoReview(
      req.params.id,
      req.user.uid,
      req.params.photoId,
      action,
      { observation: req.body?.observation, note: req.body?.note, roomOrArea: req.body?.roomOrArea }
    );
    if (!result.success) {
      const statusCode =
        result.code === 'NOT_FOUND' || result.code === 'PHOTO_NOT_FOUND' ? 404 : 400;
      return res
        .status(statusCode)
        .json({ success: false, error: result.error || 'Report not found', code: result.code });
    }
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: `photo_review_${action}`,
      targetType: 'report_photo',
      targetId: `${req.params.id}/${req.params.photoId}`,
      req,
    });
    // Phase 22: same raw-Storage-path redaction as GET /:id -- the caller
    // already has photo-viewing rights on this exact photo (checked above),
    // but the object path itself is never something the frontend needs.
    const photoOut = { ...result.photo };
    delete photoOut.objectPath;
    delete photoOut.thumbnailPath;
    delete photoOut.originalPath;
    return res.json({ success: true, photo: photoOut });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Failed to update photo review', code: 'PHOTO_REVIEW_ERROR' });
  }
});

// PATCH /api/reports/:id/photos/reorder — Phase 24: persist a caller-supplied
// display order across a report's photos. Same dual-path authorization as
// PUT .../review immediately above (owner + canEditReports, OR a Phase 19
// grantee with 'review'-tier access) -- reordering is an edit action, so it
// gets the same permission floor as editing/excluding a photo's observation.
router.patch('/:id/photos/reorder', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const order = req.body?.order;
    const db = getFirestore();
    const doc = await db.collection('reports').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const access = getReportAccess(doc.data(), req.user);
    if (!access) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const isOwnerPath = access === 'owner';
    if (isOwnerPath && !hasCapability(req.user, 'canEditReports')) {
      return res.status(403).json({
        success: false,
        error: 'Your team role does not have permission to do this (canEditReports).',
        code: 'TEAM_PERMISSION_DENIED',
        capability: 'canEditReports',
      });
    }
    if (!isOwnerPath && access !== 'review') {
      return res.status(403).json({
        success: false,
        error: 'You only have view or comment access to this report.',
        code: 'SHARE_PERMISSION_DENIED',
      });
    }
    const result = await photoJobService.reorderPhotos(req.params.id, req.user.uid, order);
    if (!result.success) {
      const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
      return res.status(statusCode).json({ success: false, error: result.error || 'Report not found', code: result.code });
    }
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'photo_reorder',
      targetType: 'report',
      targetId: req.params.id,
      meta: { photoCount: order.length },
      req,
    });
    return res.json({ success: true, photoCount: result.photos.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to reorder photos', code: 'PHOTO_REORDER_ERROR' });
  }
});

// PUT /api/reports/:id/photos/:photoId/annotations — Phase 24: non-destructive
// canvas annotations (arrows/circles/freehand/measurements), stored as
// validated vector JSON alongside the photo record -- NEVER applied to the
// original/display/thumbnail image bytes. Full-list replace per save, with
// `expectedUpdatedAt` guarding against silently overwriting a concurrent
// editor's work (see photoJobService.updatePhotoAnnotations for detail).
router.put('/:id/photos/:photoId/annotations', authenticateAny, reportsWrite, async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('reports').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const access = getReportAccess(doc.data(), req.user);
    if (!access) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const isOwnerPath = access === 'owner';
    if (isOwnerPath && !hasCapability(req.user, 'canEditReports')) {
      return res.status(403).json({
        success: false,
        error: 'Your team role does not have permission to do this (canEditReports).',
        code: 'TEAM_PERMISSION_DENIED',
        capability: 'canEditReports',
      });
    }
    if (!isOwnerPath && access !== 'review') {
      return res.status(403).json({
        success: false,
        error: 'You only have view or comment access to this report.',
        code: 'SHARE_PERMISSION_DENIED',
      });
    }
    const result = await photoJobService.updatePhotoAnnotations(
      req.params.id,
      req.user.uid,
      req.params.photoId,
      req.body?.shapes,
      req.body?.expectedUpdatedAt ?? null
    );
    if (!result.success) {
      const statusCode =
        result.code === 'NOT_FOUND' || result.code === 'PHOTO_NOT_FOUND' ? 404
          : result.code === 'STALE_UPDATE' ? 409
            : 400;
      return res.status(statusCode).json({ success: false, error: result.error || 'Report not found', code: result.code });
    }
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'photo_annotations_updated',
      targetType: 'report_photo',
      targetId: `${req.params.id}/${req.params.photoId}`,
      meta: { shapeCount: result.photo.annotations?.shapes?.length || 0 },
      req,
    });
    const photoOut = { ...result.photo };
    delete photoOut.objectPath;
    delete photoOut.thumbnailPath;
    delete photoOut.originalPath;
    return res.json({ success: true, photo: photoOut });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update annotations', code: 'PHOTO_ANNOTATIONS_ERROR' });
  }
});

// POST /api/reports/:id/photos/regenerate — Phase 8: rebuild report content
// using the CURRENT per-photo review state (approved/edited observations
// used; excluded photos dropped entirely) instead of the raw AI batch output.
router.post(
  '/:id/photos/regenerate',
  authenticateAny,
  reportsGenerate,
  requireCanGenerate,
  aiLimiter,
  async (req, res) => {
    try {
      const result = await photoJobService.regenerateFromPhotoReview(
        req.params.id,
        req.user.uid,
        req.user.email
      );
      if (!result.success) {
        const statusMap = {
          NOT_FOUND: 404,
          REPORT_PROCESSING: 409,
          ALREADY_REGENERATING: 409,
          INVALID_STATE: 409,
          NO_PHOTOS: 400,
        };
        return res
          .status(statusMap[result.code] || 400)
          .json({
            success: false,
            error: result.error || 'Could not regenerate report',
            code: result.code,
          });
      }
      recordAuditLog({
        actorUid: req.user.uid,
        actorEmail: req.user.email,
        action: 'report_regenerated_from_photo_review',
        targetType: 'report',
        targetId: req.params.id,
        req,
      });
      return res.json({ success: true, report: result.report });
    } catch (err) {
      return res
        .status(500)
        .json({ success: false, error: 'Failed to regenerate report', code: 'REGENERATE_ERROR' });
    }
  }
);

// GET /api/reports/:id/photos/:photoId/image?variant=thumbnail|full|original
router.get('/:id/photos/:photoId/image', authenticateAny, reportsRead, async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('reports').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    // Phase 19/22: any access tier may view the image -- viewing a photo is
    // no more sensitive than viewing the report content itself, which every
    // access tier already can (GET /:id).
    if (!getReportAccess(doc.data(), req.user)) {
      return res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
    }
    const data = doc.data();
    const variant = ['thumbnail', 'original'].includes(req.query.variant)
      ? req.query.variant
      : 'full';

    let objectPath = null;
    let contentType = null;
    if (req.params.photoId.startsWith('legacy-')) {
      const idx = parseInt(req.params.photoId.slice('legacy-'.length), 10);
      // Legacy (pre-Phase-6) reports never had a separate original/thumbnail
      // tier -- the one stored image doubles as all three variants.
      objectPath = (data.imagePaths || [])[idx] || null;
      contentType = 'image/jpeg'; // legacy reports predate stored mimeType; a safe default
    } else {
      const record = (data.photos || []).find((p) => p.id === req.params.photoId);
      if (record) {
        if (variant === 'thumbnail' && record.thumbnailPath) {
          objectPath = record.thumbnailPath;
          contentType = 'image/jpeg'; // thumbnails are always re-encoded as JPEG
        } else if (variant === 'original' && record.originalPath) {
          objectPath = record.originalPath;
          contentType = record.mimeType || 'image/jpeg';
        } else {
          // 'full' (display/optimized), or a fallback when the requested
          // variant isn't available for this photo (e.g. thumbnail failed).
          objectPath = record.objectPath;
          contentType = record.mimeType || 'image/jpeg';
        }
      }
    }
    if (!objectPath) {
      return res
        .status(404)
        .json({ success: false, error: 'Photo not found', code: 'PHOTO_NOT_FOUND' });
    }

    let buffer;
    try {
      buffer = await downloadBuffer(objectPath);
    } catch {
      return res
        .status(404)
        .json({ success: false, error: 'Photo not found or expired', code: 'PHOTO_NOT_FOUND' });
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(buffer);
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: 'Failed to load photo', code: 'PHOTO_ERROR' });
  }
});

// POST /api/reports/:id/images — add images to existing report
router.post(
  '/:id/images',
  authenticateAny,
  reportsWrite,
  requireCanGenerate,
  aiLimiter,
  (req, res, next) => {
    req.reportId = req.params.id;
    next();
  },
  imageUpload.array('images', 100),
  async (req, res) => {
    try {
      const db = getFirestore();
      const ref = db.collection('reports').doc(req.params.id);
      const doc = await ref.get();
      if (!doc.exists || doc.data().userId !== req.user.uid) {
        return res
          .status(404)
          .json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
      }

      const existingPaths = doc.data().imagePaths || [];
      const existingPhotos = doc.data().photos || [];

      // Phase 6: per-photo isolation here too (matches POST /generate) -- one
      // corrupt/duplicate file no longer blocks the rest of this add-on batch.
      // Phase 7: the actual vision analysis for these new photos now runs in
      // the background (photoJobService.runPhotoAnalysisOnly), same as the
      // main /generate flow -- this route responds as soon as upload/storage
      // (fast, synchronous) finishes, not after analysis completes.
      let newRecords = [];
      let newPaths = [];
      let analyzableImages = [];
      if (req.files && req.files.length > 0) {
        // Phase 6 addendum: check new uploads against this report's ALREADY-
        // attached photos' content hashes too, not just against each other.
        const existingHashes = existingPhotos
          .filter((p) => p.contentHash)
          .map((p) => ({ hash: p.contentHash, fileName: p.fileName }));
        const { records, analyzable } = await processPhotoBatch(
          req.user.uid,
          req.params.id,
          req.files,
          existingHashes,
          existingPhotos.length
        );
        newRecords = records;
        newPaths = records.filter((r) => r.status === 'uploaded').map((r) => r.objectPath);
        analyzableImages = analyzable;
      }

      await ref.update({
        photos: [...existingPhotos, ...newRecords],
        imagePaths: [...existingPaths, ...newPaths],
        imageCount: existingPaths.length + newPaths.length,
        updatedAt: new Date().toISOString(),
      });

      if (analyzableImages.length > 0) {
        await photoJobService.createAnalysisJobs(
          req.params.id,
          analyzableImages.map((img) => img.photoId)
        );
      }

      res.json({
        success: true,
        message: `${newPaths.length} images added, analyzing in the background`,
        photos: newRecords,
      });

      if (analyzableImages.length > 0) {
        photoJobService
          .runPhotoAnalysisOnly({
            reportId: req.params.id,
            uid: req.user.uid,
            claimNumber: doc.data().claimNumber || null,
            claimType: doc.data().claimType || null,
            analyzableImages,
            existingImageAnalysis: doc.data().imageAnalysis || null,
          })
          .catch((err) =>
            console.error(
              `[POST /:id/images] background analysis threw for report ${req.params.id}:`,
              err
            )
          );
      }
      return undefined;
    } catch (err) {
      return res
        .status(500)
        .json({ success: false, error: 'Failed to add images', code: 'IMAGE_ERROR' });
    }
  }
);

// POST /api/reports/analyze-images — analyze without creating report
router.post(
  '/analyze-images',
  authenticateAny,
  reportsGenerate,
  aiLimiter,
  imageUpload.array('images', 20),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0)
        return res
          .status(400)
          .json({ success: false, error: 'No images provided', code: 'NO_IMAGES' });

      const badFile = firstInvalidImage(req.files);
      if (badFile) {
        return res
          .status(400)
          .json({
            success: false,
            error: `"${badFile}" is not a valid image file`,
            code: 'INVALID_IMAGE',
          });
      }

      // Analysis-only endpoint: buffers stay in memory, nothing persisted.
      const analysis = await analyzeImages(toImageInputs(req.files));
      return res.json({ success: true, analysis });
    } catch (err) {
      return res
        .status(500)
        .json({ success: false, error: 'Image analysis failed', code: 'ANALYSIS_ERROR' });
    }
  }
);

// Helper
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [99, 102, 241];
};

// Phase 9: renders one line's inline runs (bold/italic/underline) to escaped
// HTML -- every run's text goes through escapeHtml individually, so hostile
// text (e.g. a literal "<script>") always ends up as inert escaped text
// inside a `<strong>`/`<em>`/`<u>`/plain span, never raw markup.
const renderInlineHtml = (text) =>
  tokenizeInline(text)
    .map((run) => {
      let t = escapeHtml(run.text);
      if (run.bold) t = `<strong>${t}</strong>`;
      if (run.italic) t = `<em>${t}</em>`;
      if (run.underline) t = `<u>${t}</u>`;
      return t;
    })
    .join('');

// Photos are private Storage objects -- an HTML export is a standalone
// downloaded file, so the only self-contained way to include a photo is to
// embed it as a base64 data URI (same bytes the PDF/DOCX exports embed).
const renderPhotoFigureHtml = (photoMap, photoId, caption, maxWidth = '70%') => {
  const p = photoMap?.[photoId];
  if (!p) return '<div class="photo-missing">[Photo unavailable]</div>';
  const b64 = p.buffer.toString('base64');
  const altText = escapeHtml(caption || 'Report photo');
  return `<figure class="report-photo" style="max-width:${maxWidth};"><img src="data:${escapeHtml(p.mimeType || 'image/jpeg')};base64,${b64}" alt="${altText}" />${caption ? `<figcaption>${renderInlineHtml(caption)}</figcaption>` : ''}</figure>`;
};

// Line-by-line block renderer -- mirrors the parsing properPdfGenerator.js
// does inline, but emits real semantic HTML (headings, `<ul>`/`<ol>`, a real
// `<table>`, embedded photos, page breaks) instead of the old flat
// regex-replace, which had no table/list/photo support at all.
const buildContentHtml = (content, photoMap) => {
  const lines = String(content || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const out = [];
  let listMode = null; // null | 'ul' | 'ol'
  let tableRows = [];

  const closeList = () => {
    if (listMode) out.push(listMode === 'ul' ? '</ul>' : '</ol>');
    listMode = null;
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    const [head, ...rest] = tableRows;
    out.push(
      '<table class="report-table"><thead><tr>' +
        head.map((c) => `<th>${renderInlineHtml(c.trim())}</th>`).join('') +
        '</tr></thead><tbody>' +
        rest
          .map(
            (row) => `<tr>${row.map((c) => `<td>${renderInlineHtml(c.trim())}</td>`).join('')}</tr>`
          )
          .join('') +
        '</tbody></table>'
    );
    tableRows = [];
  };

  let i = 0;
  let inTable = false;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const token = parseBlockToken(raw);

    if (token?.type === 'grid-open') {
      closeList();
      flushTable();
      inTable = false;
      const items = [];
      i += 1;
      while (i < lines.length) {
        const inner = parseBlockToken(lines[i]);
        if (inner?.type === 'grid-close') {
          i += 1;
          break;
        }
        if (inner?.type === 'grid-item') items.push(inner);
        i += 1;
      }
      out.push(
        `<div class="photo-grid" style="grid-template-columns:repeat(${token.cols},1fr);">` +
          items
            .map((it) => renderPhotoFigureHtml(photoMap, it.photoId, it.caption, '100%'))
            .join('') +
          '</div>'
      );
      continue;
    }
    if (token?.type === 'pagebreak') {
      closeList();
      flushTable();
      inTable = false;
      out.push('<div class="page-break"></div>');
      i += 1;
      continue;
    }
    if (token?.type === 'photo') {
      closeList();
      flushTable();
      inTable = false;
      out.push(renderPhotoFigureHtml(photoMap, token.photoId, token.caption));
      i += 1;
      continue;
    }
    if (token?.type === 'numbered') {
      flushTable();
      inTable = false;
      if (listMode !== 'ol') {
        closeList();
        out.push('<ol>');
        listMode = 'ol';
      }
      out.push(`<li>${renderInlineHtml(token.text)}</li>`);
      i += 1;
      continue;
    }
    if (/^###\s/.test(trimmed)) {
      closeList();
      flushTable();
      inTable = false;
      out.push(`<h3>${renderInlineHtml(trimmed.replace(/^###\s*/, ''))}</h3>`);
      i += 1;
      continue;
    }
    if (/^##\s/.test(trimmed)) {
      closeList();
      flushTable();
      inTable = false;
      out.push(`<h2>${renderInlineHtml(trimmed.replace(/^##\s*/, ''))}</h2>`);
      i += 1;
      continue;
    }
    if (/^#\s/.test(trimmed)) {
      closeList();
      flushTable();
      inTable = false;
      out.push(`<h1>${renderInlineHtml(trimmed.replace(/^#\s*/, ''))}</h1>`);
      i += 1;
      continue;
    }
    if (raw.startsWith('|')) {
      closeList();
      inTable = true;
      const cells = raw
        .split('|')
        .slice(1, -1)
        .filter((c) => !c.trim().match(/^[-:]+$/));
      if (cells.length > 0) tableRows.push(cells);
      i += 1;
      continue;
    }
    if (inTable && trimmed === '') {
      i += 1;
      continue;
    }
    if (inTable) {
      flushTable();
      inTable = false;
    }
    if (trimmed === '---') {
      closeList();
      out.push('<hr/>');
      i += 1;
      continue;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (listMode !== 'ul') {
        closeList();
        out.push('<ul>');
        listMode = 'ul';
      }
      out.push(`<li>${renderInlineHtml(trimmed.slice(2))}</li>`);
      i += 1;
      continue;
    }
    closeList();
    if (trimmed === '') {
      out.push('<br/>');
      i += 1;
      continue;
    }
    out.push(`<p>${renderInlineHtml(trimmed)}</p>`);
    i += 1;
  }
  closeList();
  flushTable();
  return out.join('\n');
};

// Phase 11: the HTML "Photo Documentation" appendix -- same source data
// (buffer/caption/location/observation) and layout options (1/2/4 per page)
// as the PDF/DOCX generators, rendered as an inline base64 grid since a
// standalone HTML export has no separate private image URLs to point at.
const buildAppendixHtml = (items, cols, includeCaptions) => {
  if (!items || !items.length) return '';
  const cards = items
    .map((it, i) => {
      const src = it.buffer
        ? `data:${it.mimeType || 'image/jpeg'};base64,${it.buffer.toString('base64')}`
        : null;
      return `<figure class="appendix-photo">
      <div class="appendix-photo-num">Photo ${i + 1}</div>
      ${src ? `<img src="${src}" alt="Photo ${i + 1}" />` : `<div class="photo-missing">Photo unavailable</div>`}
      ${includeCaptions && it.caption ? `<figcaption class="appendix-caption">${escapeHtml(it.caption)}</figcaption>` : ''}
      ${it.location ? `<p class="appendix-meta">Area: ${escapeHtml(it.location)}</p>` : ''}
      ${it.observation ? `<p class="appendix-obs">${escapeHtml(it.observation)}</p>` : '<p class="appendix-obs muted">No reviewed observation available.</p>'}
    </figure>`;
    })
    .join('\n');
  return `<section class="appendix-section"><h2>PHOTO DOCUMENTATION</h2><div class="appendix-grid" style="grid-template-columns: repeat(${cols}, 1fr);">${cards}</div></section>`;
};

const generateHTML = (report, options) => {
  const {
    companyName,
    primaryColor,
    hideFlacronBranding,
    photoMap = {},
    includeCoverPage = true,
    includePhotoCaptions = true,
    includePageNumbers = true,
    includeCompanyBranding = true,
    photoLayout = 2,
    appendixPhotos = [],
    confidentialityStatement = CONFIDENTIALITY_STATEMENT,
  } = options;
  const [r, g, b] = primaryColor;
  const accentHex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

  const contentHtml = buildContentHtml(report.content || '', photoMap);
  const sig = report.signature;
  const signatureHtml = sig?.name
    ? `<section class="signoff">
    <h2>Reviewing Adjuster Sign-Off</h2>
    <p><strong>Electronically signed by:</strong> ${escapeHtml(sig.name)}${sig.title ? `, ${escapeHtml(sig.title)}` : ''}</p>
    <p><strong>License:</strong> ${escapeHtml(sig.licenseState)} ${escapeHtml(sig.licenseNumber)}</p>
    <p><strong>Company / Firm:</strong> ${escapeHtml(sig.company)}</p>
    <p><strong>Approved:</strong> ${escapeHtml(sig.confirmedAt ? new Date(sig.confirmedAt).toLocaleString() : '')}</p>
    <p><strong>Report version:</strong> ${escapeHtml(report.versionApproved || '')}</p>
  </section>`
    : '';

  const brandLabel = hideFlacronBranding ? escapeHtml(companyName).toUpperCase() : 'FLACRONAI';
  const headerHtml = includeCoverPage
    ? `<div class="header">
  ${includeCompanyBranding ? `<p style="margin:0 0 5px 0;font-size:12px;opacity:0.8;letter-spacing:2px;">${brandLabel}</p>` : ''}
  <h1>INSURANCE INSPECTION REPORT</h1>
  <div class="meta-grid">
    <div class="meta-item"><div class="meta-label">Claim Number</div><div class="meta-value">${escapeHtml(report.claimNumber)}</div></div>
    <div class="meta-item"><div class="meta-label">Report Type</div><div class="meta-value">${escapeHtml(report.reportType || 'Initial')}</div></div>
    <div class="meta-item"><div class="meta-label">Insured Name</div><div class="meta-value">${escapeHtml(report.insuredName)}</div></div>
    <div class="meta-item"><div class="meta-label">Insured Email</div><div class="meta-value">${escapeHtml(report.insuredEmail || '')}</div></div>
    <div class="meta-item"><div class="meta-label">Date of Loss</div><div class="meta-value">${escapeHtml(report.lossDate)}</div></div>
    <div class="meta-item"><div class="meta-label">Loss Type</div><div class="meta-value">${escapeHtml(report.lossType)}</div></div>
    <div class="meta-item"><div class="meta-label">Report Date</div><div class="meta-value">${new Date().toLocaleDateString()}</div></div>
  </div>
</div>`
    : `<h1 style="color:${accentHex};">INSURANCE INSPECTION REPORT — ${escapeHtml(report.claimNumber)}</h1>`;

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
  h1 { color: ${accentHex}; }
  h2 { background: ${accentHex}; color: white; padding: 10px 15px; border-radius: 4px; }
  h3 { color: #1e293b; }
  li { margin: 5px 0; }
  u { text-decoration: underline; }
  .report-table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 14px; }
  .report-table th, .report-table td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; vertical-align: top; }
  .report-table th { background: #002A64; color: white; }
  .photo-grid { display: grid; gap: 12px; margin: 16px 0; }
  .report-photo { margin: 12px 0; }
  .report-photo img { width: 100%; border-radius: 8px; border: 1px solid #e2e8f0; display: block; }
  .report-photo figcaption { font-size: 12px; color: #64748b; margin-top: 4px; }
  .photo-missing { padding: 10px; border: 1px dashed #cbd5e1; color: #94a3b8; font-size: 12px; margin: 12px 0; }
  .page-break { border-top: 2px dashed #cbd5e1; margin: 24px 0; }
  .footer { margin-top: 60px; border-top: 2px solid #e2e8f0; padding-top: 20px; color: #94a3b8; font-size: 12px; text-align: center; }
  .watermark { border: 4px solid #b91c1c; color: #991b1b; font-size: 28px; font-weight: 800; letter-spacing: 2px; margin: 0 0 24px; padding: 12px; text-align: center; }
  .appendix-section { margin-top: 40px; }
  .appendix-section h2 { background: #002A64; }
  .appendix-grid { display: grid; gap: 16px; margin: 16px 0; }
  .appendix-photo { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
  .appendix-photo img { width: 100%; border-radius: 6px; display: block; }
  .appendix-photo-num { font-weight: 700; color: #002A64; font-size: 12px; margin-bottom: 4px; }
  .appendix-caption { font-size: 12px; font-weight: 600; color: #374151; margin: 4px 0 0; }
  .appendix-meta { font-size: 11px; color: #64748b; font-style: italic; margin: 2px 0; }
  .appendix-obs { font-size: 12px; color: #374151; margin: 2px 0 0; }
  .appendix-obs.muted { color: #94a3b8; font-style: italic; }
  .confidentiality { font-weight: 600; color: #64748b; }
  @media print {
    body { padding: 0; }
    .page-break { page-break-after: always; border: none; margin: 0; }
    ${includePageNumbers ? '.footer { counter-increment: page; } .footer::after { content: "Page " counter(page); display: block; }' : ''}
  }
</style>
</head>
<body>
${options.watermark ? `<div class="watermark">${escapeHtml(options.watermarkText)}</div>` : ''}
${headerHtml}
${contentHtml}
${signatureHtml}
${buildAppendixHtml(appendixPhotos, photoLayout, includePhotoCaptions)}
<div class="footer">
  <p>Generated by ${hideFlacronBranding ? escapeHtml(companyName) : 'FlacronAI'} | ${new Date().toISOString()}</p>
  <p>Property Address: ${escapeHtml(report.propertyAddress)}</p>
  <p class="confidentiality">Claim ${escapeHtml(report.claimNumber)} — ${escapeHtml(confidentialityStatement)}</p>
</div>
</body>
</html>`;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

router._test = {
  generateHTML,
  escapeHtml,
  // Exposed for the export concurrency-guard tests (backend/test/
  // export-failure-handling.test.js) -- there's no HTTP-level test harness
  // in this codebase (every export/report test calls exported functions
  // directly), so the lock primitives themselves are the testable unit.
  acquireExportLock,
  releaseExportLock,
  activeExports,
};
module.exports = router;
