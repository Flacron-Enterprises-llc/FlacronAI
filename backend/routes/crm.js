const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireTier } = require('../middleware/auth');
const crm = require('../services/crmService');
const { body, validationResult } = require('express-validator');
const { recordAuditLog } = require('../services/auditLogService');

const agencyPlus = requireTier('agency');

// Loose but real phone check: digits/spaces/parens/dashes/dots, optional leading +, 7-20 chars.
const PHONE_RE = /^[+]?[\d\s().-]{7,20}$/;

// Factories (not shared arrays) — express-validator chains are stateful builders,
// so reusing the same chain instance across routes would let a `.optional()` call
// on one route's copy leak into another's.
const clientValidators = (requireName) => [
  requireName
    ? body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 200 })
    : body('name').optional().trim().isLength({ max: 200 }),
  body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Enter a valid email').normalizeEmail(),
  body('phone').optional({ checkFalsy: true }).trim().matches(PHONE_RE).withMessage('Enter a valid phone number'),
  body('company').optional().trim().isLength({ max: 200 }),
  body('address').optional().trim().isLength({ max: 300 }),
  body('notes').optional().trim().isLength({ max: 2000 }),
];

// ── CLIENTS ──────────────────────────────────────────────────────────────────

router.get('/clients', authenticateToken, agencyPlus, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const result = await crm.getClients(req.user.uid, { page: parseInt(page), limit: parseInt(limit), search });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, code: 'CRM_ERROR' });
  }
});

router.post('/clients', authenticateToken, agencyPlus, clientValidators(true), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });
  try {
    const client = await crm.createClient(req.user.uid, req.body);
    return res.status(201).json({ success: true, client });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, code: 'CRM_ERROR' });
  }
});

router.get('/clients/:id', authenticateToken, agencyPlus, async (req, res) => {
  try {
    const client = await crm.getClient(req.user.uid, req.params.id);
    return res.json({ success: true, client });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message, code: 'NOT_FOUND' });
  }
});

router.put('/clients/:id', authenticateToken, agencyPlus, clientValidators(false), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });
  try {
    const client = await crm.updateClient(req.user.uid, req.params.id, req.body);
    return res.json({ success: true, client });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message, code: 'NOT_FOUND' });
  }
});

router.delete('/clients/:id', authenticateToken, agencyPlus, async (req, res) => {
  try {
    await crm.deleteClient(req.user.uid, req.params.id);
    recordAuditLog({
      actorUid: req.user.uid, actorEmail: req.user.email, action: 'crm_client_deleted',
      targetType: 'crmClient', targetId: req.params.id, req,
    });
    return res.json({ success: true, message: 'Client deleted' });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message, code: 'NOT_FOUND' });
  }
});

router.get('/clients/:id/reports', authenticateToken, agencyPlus, async (req, res) => {
  try {
    const reports = await crm.getClientReports(req.user.uid, req.params.id);
    return res.json({ success: true, reports });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message, code: 'NOT_FOUND' });
  }
});

const APPT_STATUS_VALUES = ['scheduled', 'completed', 'cancelled'];

const appointmentValidators = (requireFields) => [
  requireFields
    ? body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 })
    : body('title').optional().trim().isLength({ max: 200 }),
  requireFields
    ? body('date').notEmpty().withMessage('Date is required').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be YYYY-MM-DD')
    : body('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be YYYY-MM-DD'),
  body('time').optional({ checkFalsy: true }).matches(/^\d{2}:\d{2}$/).withMessage('Time must be HH:MM'),
  body('location').optional().trim().isLength({ max: 300 }),
  body('notes').optional().trim().isLength({ max: 2000 }),
  body('status').optional({ checkFalsy: true }).isIn(APPT_STATUS_VALUES).withMessage(`Status must be one of: ${APPT_STATUS_VALUES.join(', ')}`),
];

// ── APPOINTMENTS ─────────────────────────────────────────────────────────────

router.get('/appointments', authenticateToken, agencyPlus, async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    const appts = await crm.getAppointments(req.user.uid, { startDate, endDate, status });
    return res.json({ success: true, appointments: appts });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, code: 'CRM_ERROR' });
  }
});

router.post('/appointments', authenticateToken, agencyPlus, appointmentValidators(true), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });
  try {
    const appt = await crm.createAppointment(req.user.uid, req.body);
    return res.status(201).json({ success: true, appointment: appt });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, code: 'CRM_ERROR' });
  }
});

router.put('/appointments/:id', authenticateToken, agencyPlus, appointmentValidators(false), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });
  try {
    const appt = await crm.updateAppointment(req.user.uid, req.params.id, req.body);
    return res.json({ success: true, appointment: appt });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message, code: 'NOT_FOUND' });
  }
});

router.delete('/appointments/:id', authenticateToken, agencyPlus, async (req, res) => {
  try {
    await crm.deleteAppointment(req.user.uid, req.params.id);
    recordAuditLog({
      actorUid: req.user.uid, actorEmail: req.user.email, action: 'crm_appointment_deleted',
      targetType: 'crmAppointment', targetId: req.params.id, req,
    });
    return res.json({ success: true, message: 'Appointment deleted' });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message, code: 'NOT_FOUND' });
  }
});

const CLAIM_STATUS_VALUES = ['open', 'in-progress', 'pending-review', 'closed'];

const claimValidators = (requireFields) => [
  requireFields
    ? body('lossType').trim().notEmpty().withMessage('Loss type required').isLength({ max: 100 })
    : body('lossType').optional().trim().isLength({ max: 100 }),
  body('claimNumber').optional({ checkFalsy: true }).trim()
    .isLength({ max: 50 }).withMessage('Claim number is too long')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Claim number may only contain letters, numbers, and dashes'),
  body('lossDate').optional({ checkFalsy: true }).matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Loss date must be YYYY-MM-DD'),
  body('propertyAddress').optional().trim().isLength({ max: 300 }),
  body('description').optional().trim().isLength({ max: 5000 }),
  body('notes').optional().trim().isLength({ max: 2000 }),
  body('status').optional({ checkFalsy: true }).customSanitizer(v => (v || '').toLowerCase())
    .isIn(CLAIM_STATUS_VALUES).withMessage(`Status must be one of: ${CLAIM_STATUS_VALUES.join(', ')}`),
];

// ── CLAIMS ────────────────────────────────────────────────────────────────────

router.get('/claims', authenticateToken, agencyPlus, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search = '' } = req.query;
    const result = await crm.getClaims(req.user.uid, { page: parseInt(page), limit: parseInt(limit), status, search });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, code: 'CRM_ERROR' });
  }
});

router.post('/claims', authenticateToken, agencyPlus, claimValidators(true), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });
  try {
    if (req.body.claimNumber && await crm.claimNumberExists(req.user.uid, req.body.claimNumber)) {
      return res.status(409).json({ success: false, error: 'A claim with this claim number already exists', code: 'DUPLICATE_CLAIM_NUMBER' });
    }
    const claim = await crm.createClaim(req.user.uid, req.body);
    return res.status(201).json({ success: true, claim });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, code: 'CRM_ERROR' });
  }
});

router.get('/claims/:id', authenticateToken, agencyPlus, async (req, res) => {
  try {
    const claim = await crm.getClaim(req.user.uid, req.params.id);
    return res.json({ success: true, claim });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message, code: 'NOT_FOUND' });
  }
});

router.get('/claims/:id/reports', authenticateToken, agencyPlus, async (req, res) => {
  try {
    const reports = await crm.getClaimReports(req.user.uid, req.params.id);
    return res.json({ success: true, reports });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message, code: 'NOT_FOUND' });
  }
});

router.put('/claims/:id', authenticateToken, agencyPlus, claimValidators(false), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });
  try {
    if (req.body.claimNumber && await crm.claimNumberExists(req.user.uid, req.body.claimNumber, req.params.id)) {
      return res.status(409).json({ success: false, error: 'A claim with this claim number already exists', code: 'DUPLICATE_CLAIM_NUMBER' });
    }
    const claim = await crm.updateClaim(req.user.uid, req.params.id, req.body);
    return res.json({ success: true, claim });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message, code: 'NOT_FOUND' });
  }
});

router.delete('/claims/:id', authenticateToken, agencyPlus, async (req, res) => {
  try {
    await crm.deleteClaim(req.user.uid, req.params.id);
    recordAuditLog({
      actorUid: req.user.uid, actorEmail: req.user.email, action: 'crm_claim_deleted',
      targetType: 'crmClaim', targetId: req.params.id, req,
    });
    return res.json({ success: true, message: 'Claim deleted' });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message, code: 'NOT_FOUND' });
  }
});

module.exports = router;
