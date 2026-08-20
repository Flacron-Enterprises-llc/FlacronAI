// Phase 20 (Notifications Center & Global Search) -- the bell/feed API.
// Session-only (authenticateToken, no API-key scope), matching users.js's own
// precedent: this is a UI feature for a logged-in human, not something an
// external API-key integration needs.
const express = require('express');
const router = express.Router();
const { getFirestore } = require('../config/firebase');
const { authenticateToken } = require('../middleware/auth');
const { listNotifications, markAsRead, markAllAsRead } = require('../utils/notificationService');

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
