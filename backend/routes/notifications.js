// Phase 20 (Notifications Center & Global Search) -- the bell/feed API.
// Session-only (authenticateToken, no API-key scope), matching users.js's own
// precedent: this is a UI feature for a logged-in human, not something an
// external API-key integration needs.
const express = require('express');
const router = express.Router();
const { getFirestore } = require('../config/firebase');
const { authenticateToken } = require('../middleware/auth');
const { listNotifications, markAsRead, markAllAsRead } = require('../utils/notificationService');
const { pushDeviceLimiter, pushRevokeLimiter } = require('../middleware/rateLimiters');
const {
  isValidExpoToken,
  isSupportedPlatform,
  isValidBindingId,
  registerDevice,
  revokeBinding,
  unregisterDevice,
} = require('../utils/pushDeviceStore');
const { isPushEnabled, getProviderStatus } = require('../services/pushService');

// GET /api/notifications — bounded, paginated feed for the caller only
// (`where('uid','==', req.user.uid)` -- never any other user's notifications).
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const result = await listNotifications(db, req.user.uid, {
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('List notifications error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch notifications', code: 'FETCH_ERROR' });
  }
});

// ── Mobile Phase 6: push device tokens ───────────────────────────────────────
// The account is always req.user.uid from the verified session -- a uid in the
// body is ignored -- and the binding is tied to that session's timing
// (req.sessionContext) plus the app's per-sign-in `bindingId` (see
// utils/pushDeviceStore.js for the revocation and stale-request fences).
// Tokens are never echoed back. `deliveryEnabled`/`providerStatus` are the
// only server facts exposed: whether pushes are being sent at all, and
// whether the provider recently reported a credential problem for this
// platform -- never a promise of delivery, never provider text.
const invalidDevice = (res, error) =>
  res.status(400).json({ success: false, error, code: 'INVALID_PUSH_DEVICE' });

const pushStatusFor = async (platform) => ({
  deliveryEnabled: isPushEnabled(),
  providerStatus: isPushEnabled() ? await getProviderStatus(getFirestore(), platform) : 'unverified',
});

// POST /api/notifications/devices  { token, platform: 'ios'|'android', bindingId: uuid-v4 }
router.post('/devices', authenticateToken, pushDeviceLimiter, async (req, res) => {
  const { token, platform, bindingId } = req.body || {};
  if (!isValidExpoToken(token)) return invalidDevice(res, 'A valid Expo push token is required');
  if (!isSupportedPlatform(platform)) return invalidDevice(res, "platform must be 'ios' or 'android'");
  if (!isValidBindingId(bindingId)) return invalidDevice(res, 'A valid bindingId is required');
  try {
    const result = await registerDevice(getFirestore(), req.user.uid, {
      token,
      platform,
      bindingId,
      session: req.sessionContext,
    });
    if (result.status === 'revoked') {
      return res.status(409).json({ success: false, error: 'This device binding was signed out', code: 'PUSH_BINDING_REVOKED' });
    }
    if (result.status === 'stale') {
      return res.status(409).json({ success: false, error: 'A newer session owns this device', code: 'PUSH_REGISTRATION_STALE' });
    }
    return res.json({ success: true, registered: true, ...(await pushStatusFor(platform)) });
  } catch (err) {
    console.error('Register push device error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to register device', code: 'PUSH_DEVICE_ERROR' });
  }
});

// POST /api/notifications/devices/revoke  { bindingId }
// No auth on purpose: the random bindingId is the proof of possession, so a
// device that signed out offline (or whose session already ended) can still
// end its binding later. Idempotent; the response never reveals whether
// anything matched.
router.post('/devices/revoke', pushRevokeLimiter, async (req, res) => {
  const { bindingId } = req.body || {};
  if (!isValidBindingId(bindingId)) return invalidDevice(res, 'A valid bindingId is required');
  try {
    await revokeBinding(getFirestore(), bindingId);
    return res.json({ success: true });
  } catch (err) {
    console.error('Revoke push binding error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to revoke device', code: 'PUSH_DEVICE_ERROR' });
  }
});

// GET /api/notifications/push-status?platform=ios|android
router.get('/push-status', authenticateToken, pushDeviceLimiter, async (req, res) => {
  const platform = isSupportedPlatform(req.query.platform) ? req.query.platform : null;
  return res.json({ success: true, ...(await pushStatusFor(platform)) });
});

// POST /api/notifications/devices/unregister  { token }
// Only removes the token if the caller currently owns it; otherwise a no-op
// that reports success (never reveals another account's ownership).
router.post('/devices/unregister', authenticateToken, pushDeviceLimiter, async (req, res) => {
  const { token } = req.body || {};
  if (!isValidExpoToken(token)) return invalidDevice(res, 'A valid Expo push token is required');
  try {
    await unregisterDevice(getFirestore(), req.user.uid, token);
    return res.json({ success: true });
  } catch (err) {
    console.error('Unregister push device error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to unregister device', code: 'PUSH_DEVICE_ERROR' });
  }
});

// POST /api/notifications/:id/read — mark one notification read. Ownership is
// enforced inside markAsRead (a notification belonging to someone else 404s,
// never a data-revealing 403 or silent no-op).
router.post('/:id/read', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const result = await markAsRead(db, req.user.uid, req.params.id);
    return res.json({ success: true, ...result });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'Notification not found', code: 'NOT_FOUND' });
    }
    console.error('Mark notification read error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to mark notification as read', code: 'MARK_READ_ERROR' });
  }
});

// POST /api/notifications/mark-all-read
router.post('/mark-all-read', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const result = await markAllAsRead(db, req.user.uid);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('Mark all notifications read error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to mark all as read', code: 'MARK_ALL_ERROR' });
  }
});

module.exports = router;
