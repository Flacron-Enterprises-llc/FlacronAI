const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireApiAccess } = require('../middleware/auth');
const { recordAuditLog } = require('../services/auditLogService');
const { WEBHOOK_EVENTS, DELIVERY_POLICY } = require('../config/webhookEvents');
const {
  registerEndpoint, listEndpoints, deleteEndpoint, rotateSecret,
} = require('../services/webhookService');
// Only allow public HTTPS destinations that don't resolve to a loopback/
// private/link-local address -- see backend/utils/webhookUrlSafety.js for
// the full rationale (SSRF hardening, including DNS-rebinding protection) and
// why the route wires in `assertSafeWebhookUrl` (throws) rather than
// `isSafeWebhookUrl` (returns a boolean) -- express-validator's async
// `.custom()` only treats a REJECTED promise as invalid, not a resolved
// `false`.
const { assertSafeWebhookUrl } = require('../utils/webhookUrlSafety');

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
  body('url').isString().custom(assertSafeWebhookUrl).withMessage('url must be a public HTTPS URL that does not resolve to a private, loopback, or link-local address'),
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
