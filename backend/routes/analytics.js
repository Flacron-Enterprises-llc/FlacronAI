const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getAnalytics } = require('../services/analyticsService');

// Phase 15 (General Analytics Page). Browser-only (authenticateToken, not
// authenticateAny) -- this is a dashboard-UI feature, not part of the public
// reports API surface, matching the existing precedent in teams.js/
// templates.js/whitelabel.js. Server-side scoping (personal vs. organization)
// and every number/breakdown come from analyticsService.getAnalytics -- see
// that module for the org-isolation and role-permission rules.
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { range, startDate, endDate, tzOffset } = req.query;
    const tzOffsetMinutes = tzOffset !== undefined ? parseInt(tzOffset, 10) : 0;
    const analytics = await getAnalytics(req.user, {
      range,
      startDate,
      endDate,
      tzOffsetMinutes: Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : 0,
    });
    return res.json({ success: true, analytics });
  } catch (err) {
    console.error('[analytics] error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to load analytics', code: 'ANALYTICS_ERROR' });
  }
});

module.exports = router;
