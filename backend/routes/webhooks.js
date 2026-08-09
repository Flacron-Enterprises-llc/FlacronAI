const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireApiAccess } = require('../middleware/auth');
const { recordAuditLog } = require('../services/auditLogService');
const { WEBHOOK_EVENTS, DELIVERY_POLICY } = require('../config/webhookEvents');
const {
  registerEndpoint, listEndpoints, deleteEndpoint, rotateSecret,
} = require('../services/webhookService');

// Only allow public HTTPS destinations. Reject http:// and obvious internal
// hosts so a registered webhook can't be pointed at our own metadata service or
// a loopback address (SSRF hardening).
const isSafeWebhookUrl = (value) => {
  let u;
  try { u = new URL(value); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal'];
  if (blocked.includes(host)) return false;
  // Block RFC-1918 / link-local literals.
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  return true;
};

// GET /api/webhooks/events — catalog of events a caller can subscribe to.
router.get('/events', authenticateToken, requireApiAccess, (req, res) => {
  return res.json({
    success: true,
    events: WEBHOOK_EVENTS,
    delivery: {
      timeoutMs: DELIVERY_POLICY.timeoutMs,
      maxAttempts: DELIVERY_POLICY.maxAttempts,
      backoffMs: DELIVERY_POLICY.backoffMs,
      signatureHeader: 'Flacron-Signature',
    },
  });
});

// POST /api/webhooks — register a webhook endpoint (returns signing secret once).
router.post('/', authenticateToken, requireApiAccess, [
  body('url').isString().custom(isSafeWebhookUrl).withMessage('url must be a public HTTPS URL'),
  body('events').isArray({ min: 1 }).withMessage('Subscribe to at least one event'),
  body('events.*').isIn(WEBHOOK_EVENTS).withMessage('Unknown webhook event'),
  body('description').optional().isString().isLength({ max: 200 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });

    const result = await registerEndpoint(req.user.uid, {
      url: req.body.url,
      events: req.body.events,
      description: req.body.description,
    });
    recordAuditLog({
      actorUid: req.user.uid, actorEmail: req.user.email, action: 'webhook_endpoint_created',
      targetType: 'webhookEndpoint', targetId: result.endpointId,
      meta: { url: result.url, events: result.events }, req,
    });
    return res.status(201).json({
      success: true,
      ...result,
      warning: 'Save this signing secret — it will not be shown again',
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to create webhook', code: 'WEBHOOK_ERROR' });
  }
});

// GET /api/webhooks — list active endpoints (secrets masked).
router.get('/', authenticateToken, requireApiAccess, async (req, res) => {
  try {
    const endpoints = await listEndpoints(req.user.uid);
    return res.json({ success: true, endpoints });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to list webhooks', code: 'WEBHOOK_ERROR' });
  }
});

// POST /api/webhooks/:id/rotate-secret — issue a new signing secret.
router.post('/:id/rotate-secret', authenticateToken, requireApiAccess, async (req, res) => {
  try {
    const result = await rotateSecret(req.params.id, req.user.uid);
    recordAuditLog({
      actorUid: req.user.uid, actorEmail: req.user.email, action: 'webhook_secret_rotated',
      targetType: 'webhookEndpoint', targetId: req.params.id, req,
    });
    return res.json({
      success: true,
      ...result,
      warning: 'Save this signing secret — it will not be shown again',
    });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message, code: 'NOT_FOUND' });
  }
});

// DELETE /api/webhooks/:id — deactivate an endpoint.
router.delete('/:id', authenticateToken, requireApiAccess, async (req, res) => {
  try {
    await deleteEndpoint(req.params.id, req.user.uid);
    recordAuditLog({
      actorUid: req.user.uid, actorEmail: req.user.email, action: 'webhook_endpoint_deleted',
      targetType: 'webhookEndpoint', targetId: req.params.id, req,
    });
    return res.json({ success: true, message: 'Webhook endpoint deleted' });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message, code: 'NOT_FOUND' });
  }
});

module.exports = router;
