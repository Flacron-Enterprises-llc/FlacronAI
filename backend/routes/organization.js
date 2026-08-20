const express = require('express');
const router = express.Router();
const { authenticateToken, requireTier } = require('../middleware/auth');
const { hasCapability } = require('../utils/orgRoles');
const {
  getOrgMetrics,
  getOrgSecuritySummary,
  getOrgAuditLogs,
} = require('../services/organizationService');

// Phase 17 (Organization Admin & Audit Log Viewer). Browser-only
// (authenticateToken, not authenticateAny), matching the teams.js/
// templates.js/analytics.js precedent for dashboard-management features --
// no API-key scope exists for organization administration. Every route here
// is enterprise-tier gated (only enterprise accounts can have a team/
// organization at all -- matches teams.js's own `enterpriseOnly`) AND
// further gated to `canViewAllProfiles` (Owner/Admin/Manager) since this
// whole page is inherently an admin surface, not a personal one -- a
// restricted role gets a clear, honest 403, never a broken/empty page.
const enterpriseOnly = requireTier('enterprise');

const requireOrgAdmin = (req, res, next) => {
  if (!hasCapability(req.user, 'canViewAllProfiles')) {
    return res.status(403).json({
      success: false,
      error: 'Organization administration is limited to Owners, Admins, and Managers.',
      code: 'ORG_ADMIN_DENIED',
    });
  }
  return next();
};

router.use(authenticateToken, enterpriseOnly, requireOrgAdmin);

// GET /api/organization/metrics
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await getOrgMetrics(req.user);
    return res.json({ success: true, metrics });
  } catch (err) {
    console.error('[organization] metrics error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to load organization metrics', code: 'ORG_METRICS_ERROR' });
  }
});

// GET /api/organization/security-summary
router.get('/security-summary', async (req, res) => {
  try {
    const summary = await getOrgSecuritySummary(req.user);
    return res.json({ success: true, summary });
  } catch (err) {
    console.error('[organization] security-summary error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to load security summary', code: 'ORG_SECURITY_ERROR' });
  }
});

// GET /api/organization/audit-logs — filterable/paginated, org-scoped.
// Query params: startDate/endDate (ISO instants), action, actorUid,
// targetType, page, limit. Defaults to the last 90 days when no explicit
// range is given, to keep the underlying fetch bounded in practice (see
// organizationService.js's own comment on why a hard server-side cap isn't
// used instead).
router.get('/audit-logs', async (req, res) => {
  try {
    const { startDate, endDate, action, actorUid, targetType, page, limit } = req.query;
    let effectiveStart = startDate;
    if (!startDate && !endDate) {
      effectiveStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    }
    const result = await getOrgAuditLogs(req.user, {
      startDate: effectiveStart,
      endDate,
      action: action || undefined,
      actorUid: actorUid || undefined,
      targetType: targetType || undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[organization] audit-logs error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to load audit logs', code: 'ORG_AUDIT_LOG_ERROR' });
  }
});

module.exports = router;
