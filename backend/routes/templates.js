const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const { authenticateToken } = require('../middleware/auth');
const templateService = require('../services/templateService');
const { templateLogoObject, uploadBuffer } = require('../config/storage');

// Phase 13 (Real Template Builder). Browser-only (authenticateToken, not
// authenticateAny) -- templates are a UI-management feature, not part of the
// public reports API surface (no API-key scope exists for them, matching the
// existing precedent in teams.js/whitelabel.js for enterprise-only management
// endpoints).
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, SVG, WebP allowed'));
  },
});

const statusForCode = (code) => {
  if (code === 'NOT_FOUND') return 404;
  if (code === 'FORBIDDEN') return 403;
  return 400;
};

const respondResult = (res, result, successStatus = 200) => {
  if (result.error) {
    return res.status(statusForCode(result.code)).json({ success: false, error: result.error, code: result.code });
  }
  return res.status(successStatus).json({ success: true, ...result });
};

// GET /api/templates — every template visible to the caller (personal, their
// organization's, and the seeded Flacron set), grouped client-side by `scope`.
router.get('/', authenticateToken, async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const templates = await templateService.listTemplates(req.user, { includeArchived });
    return res.json({ success: true, templates });
  } catch (err) {
    console.error('[templates] list error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to load templates', code: 'TEMPLATES_ERROR' });
  }
});

// GET /api/templates/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const template = await templateService.getTemplateForUse(req.user, req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found', code: 'NOT_FOUND' });
    }
    return res.json({ success: true, template });
  } catch (err) {
    console.error('[templates] get error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to load template', code: 'TEMPLATE_ERROR' });
  }
});

// POST /api/templates
router.post('/', authenticateToken, async (req, res) => {
  try {
    const result = await templateService.createTemplate({ user: req.user, ...req.body });
    return respondResult(res, result, 201);
  } catch (err) {
    console.error('[templates] create error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create template', code: 'TEMPLATE_CREATE_ERROR' });
  }
});

// PUT /api/templates/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await templateService.updateTemplate(req.user, req.params.id, req.body);
    return respondResult(res, result);
  } catch (err) {
    console.error('[templates] update error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update template', code: 'TEMPLATE_UPDATE_ERROR' });
  }
});

// POST /api/templates/:id/duplicate — always creates a new personal copy
// owned by the requester, regardless of the source template's own scope.
router.post('/:id/duplicate', authenticateToken, async (req, res) => {
  try {
    const result = await templateService.duplicateTemplate(req.user, req.params.id);
    return respondResult(res, result, 201);
  } catch (err) {
    console.error('[templates] duplicate error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to duplicate template', code: 'TEMPLATE_DUPLICATE_ERROR' });
  }
});

// POST /api/templates/:id/archive · POST /api/templates/:id/restore — kept as
// two explicit actions (not a PATCH toggle) to match this codebase's existing
// Archive/Restore convention for reports (Phase 12) and claims.
router.post('/:id/archive', authenticateToken, async (req, res) => {
  try {
    const result = await templateService.setArchived(req.user, req.params.id, true);
    return respondResult(res, result);
  } catch (err) {
    console.error('[templates] archive error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to archive template', code: 'TEMPLATE_ARCHIVE_ERROR' });
  }
});

router.post('/:id/restore', authenticateToken, async (req, res) => {
  try {
    const result = await templateService.setArchived(req.user, req.params.id, false);
    return respondResult(res, result);
  } catch (err) {
    console.error('[templates] restore error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to restore template', code: 'TEMPLATE_RESTORE_ERROR' });
  }
});

// DELETE /api/templates/:id — permanent delete (personal templates the
// requester owns, or organization templates they have manage rights to).
// Flacron templates can never be deleted (setArchived/deleteTemplate both
// reject any scope:'flacron' doc via canEdit).
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await templateService.deleteTemplate(req.user, req.params.id);
    return respondResult(res, result);
  } catch (err) {
    console.error('[templates] delete error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to delete template', code: 'TEMPLATE_DELETE_ERROR' });
  }
});

// POST /api/templates/:id/logo — the ONLY route that may set a template's
// branding.logoObjectPath (see templateService.sanitizeBrandingText for why
// PUT /:id must never accept it directly from a client body).
router.post('/:id/logo', authenticateToken, logoUpload.single('logo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No logo file provided', code: 'VALIDATION_ERROR' });
  }
  try {
    const check = await templateService.getTemplateForEdit(req.user, req.params.id);
    if (check.error) return respondResult(res, check);

    let objectPath, url;
    if (req.file.mimetype === 'image/svg+xml') {
      objectPath = templateLogoObject(req.user.uid, req.params.id, `logo_${Date.now()}.svg`);
      ({ url } = await uploadBuffer(objectPath, req.file.buffer, 'image/svg+xml', { publicToken: true }));
    } else {
      const buf = await sharp(req.file.buffer)
        .resize(400, 200, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      objectPath = templateLogoObject(req.user.uid, req.params.id, `logo_${Date.now()}.png`);
      ({ url } = await uploadBuffer(objectPath, buf, 'image/png', { publicToken: true }));
    }

    const result = await templateService.setTemplateLogo(req.user, req.params.id, { objectPath, url });
    return respondResult(res, result);
  } catch (err) {
    console.error('[templates] logo upload error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to upload logo', code: 'TEMPLATE_LOGO_ERROR' });
  }
});

// DELETE /api/templates/:id/logo — clears a template's custom logo.
router.delete('/:id/logo', authenticateToken, async (req, res) => {
  try {
    const result = await templateService.setTemplateLogo(req.user, req.params.id, { objectPath: null, url: null });
    return respondResult(res, result);
  } catch (err) {
    console.error('[templates] logo remove error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to remove logo', code: 'TEMPLATE_LOGO_ERROR' });
  }
});

module.exports = router;
