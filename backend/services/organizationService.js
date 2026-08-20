// Phase 17 (Organization Admin & Audit Log Viewer). Pure, dependency-free
// aggregation/shaping functions (unit-tested the same way analyticsService.js
// already is) plus thin Firestore-orchestrating wrappers used by
// backend/routes/organization.js and, for the personal login-history view,
// backend/routes/users.js.
const { getFirestore } = require('../config/firebase');
const { resolveOrganizationId, ROLES } = require('../utils/orgRoles');
const { getOrgRoster, getAnalytics } = require('./analyticsService');
const templateService = require('./templateService');

const ORG_QUERY_CHUNK = 30; // Firestore 'in' query limit
const DEFAULT_LOG_LIMIT = 25;
const MAX_LOG_LIMIT = 100;

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const safeDate = (value) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

// ── Safety: never let audit metadata leak a secret/token/credential ────────
// Confirmed by a dedicated code audit (2026-08-18, Phase 17) that none of the
// ~41 existing recordAuditLog() call sites currently pass one -- this is
// defense-in-depth against a FUTURE call site being added carelessly, not a
// fix for an existing leak. Applied to every meta object before it ever
// leaves the server, recursively (one level of nested objects is enough for
// every meta shape this codebase actually produces).
const SENSITIVE_KEY_PATTERN = /secret|token|password|credential|api[-_]?key|private[-_]?key|authorization/i;

const redactMeta = (meta) => {
  if (!meta || typeof meta !== 'object') return meta ?? null;
  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = '[redacted]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redactMeta(value);
    } else {
      out[key] = value;
    }
  }
  return out;
};

// User-agent strings are attacker-influenceable and unsanitized at write
// time (confirmed: auditLogService.js writes it verbatim) -- cap length here
// so a maliciously oversized value can never blow up the viewer's rendering
// or the response payload.
const MAX_USER_AGENT_LENGTH = 300;

const shapeAuditLog = (doc) => ({
  id: doc.id,
  actorUid: doc.actorUid || null,
  actorEmail: doc.actorEmail || null,
  action: doc.action || 'unknown',
  targetType: doc.targetType || null,
  targetId: doc.targetId || null,
  meta: redactMeta(doc.meta),
  ip: doc.ip || null,
  userAgent: typeof doc.userAgent === 'string' ? doc.userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
  timestamp: doc.timestamp || null,
});

// Pure filter over an already-fetched, already-shaped array -- mirrors this
// codebase's established "fetch a bounded equality-scoped set, filter/sort/
// paginate in Node" pattern (reports.js's own list endpoint, crmService.js,
// analyticsService.js) rather than combining a Firestore `in` filter with
// `.orderBy()`, which this exact project has repeatedly confirmed needs a
// composite index that isn't provisioned.
const filterAuditLogs = (logs, { startDate, endDate, action, actorUid, targetType } = {}) => {
  const start = safeDate(startDate);
  const end = safeDate(endDate);
  return logs.filter((log) => {
    if (action && log.action !== action) return false;
    if (actorUid && log.actorUid !== actorUid) return false;
    if (targetType && log.targetType !== targetType) return false;
    const at = safeDate(log.timestamp);
    if (start && (!at || at < start)) return false;
    if (end && (!at || at > end)) return false;
    return true;
  });
};

const sortByTimestampDesc = (logs) =>
  [...logs].sort((a, b) => (safeDate(b.timestamp)?.getTime() || 0) - (safeDate(a.timestamp)?.getTime() || 0));

const paginate = (items, page = 1, limit = DEFAULT_LOG_LIMIT) => {
  const lim = Math.min(Math.max(1, limit), MAX_LOG_LIMIT);
  const p = Math.max(1, page);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / lim));
  const offset = (Math.min(p, totalPages) - 1) * lim;
  return {
    items: items.slice(offset, offset + lim),
    total,
    page: Math.min(p, totalPages),
    totalPages,
    limit: lim,
  };
};

const buildRoleBreakdown = (roster) => {
  const out = {};
  roster.forEach((m) => {
    const label = ROLES[m.role]?.label || m.role;
    out[label] = (out[label] || 0) + 1;
  });
  return out;
};

// ── Firestore-orchestrating wrappers ────────────────────────────────────────

// Fetches every auditLogs doc whose actorUid is in `uids`, chunked at 30 per
// the Firestore 'in' limit, with no `.orderBy()` in the query itself (see
// filterAuditLogs's comment) -- a real, disclosed scaling tradeoff shared
// with this codebase's other full-collection-per-scope reads, not a silent
// unbounded promise: callers are expected to pass a date range (the frontend
// defaults to the last 90 days) to keep the fetched set bounded in practice.
const fetchAuditLogsForActors = async (db, uids) => {
  if (!uids.length) return [];
  const groups = chunk(uids, ORG_QUERY_CHUNK);
  const snaps = await Promise.all(
    groups.map((g) => db.collection('auditLogs').where('actorUid', 'in', g).get())
  );
  return snaps.flatMap((snap) => snap.docs.map((d) => shapeAuditLog({ id: d.id, ...d.data() })));
};

// Org-scoped audit log page. Gated by the caller (organization.js) to
// Owner/Admin/Manager (`canViewAllProfiles`) on an enterprise-tier account --
// this function itself doesn't re-check that, matching the existing
// analyticsService.getAnalytics/getOrgRoster division of responsibility.
const getOrgAuditLogs = async (user, options = {}) => {
  const db = getFirestore();
  const orgId = resolveOrganizationId(user);
  const roster = await getOrgRoster(db, orgId);
  const uids = roster.map((m) => m.uid);
  const all = await fetchAuditLogsForActors(db, uids);
  const filtered = sortByTimestampDesc(filterAuditLogs(all, options));
  const page = paginate(filtered, options.page, options.limit);
  const actionsSeen = [...new Set(all.map((l) => l.action))].sort();
  const targetTypesSeen = [...new Set(all.map((l) => l.targetType).filter(Boolean))].sort();
  return {
    ...page,
    actionsSeen,
    targetTypesSeen,
    roster: roster.map((m) => ({ uid: m.uid, email: m.email, role: m.role })),
  };
};

// Personal login-history: available to EVERY account regardless of tier
// (Golden Rule #1 -- Security.jsx's "Login History" claim only becomes true
// once real data actually backs it, and it does: login_success/login_failed/
// suspicious_login_new_device have been recorded for every account since
// Phase 3, not just enterprise orgs). Deliberately scoped to the caller's
// own uid only -- never another account's, regardless of role.
const LOGIN_ACTIONS = new Set(['login_success', 'login_failed', 'suspicious_login_new_device', 'logout']);
const getLoginHistory = async (user, options = {}) => {
  const db = getFirestore();
  const all = await fetchAuditLogsForActors(db, [user.uid]);
  const loginEvents = all.filter((l) => LOGIN_ACTIONS.has(l.action));
  const filtered = sortByTimestampDesc(filterAuditLogs(loginEvents, options));
  return paginate(filtered, options.page, options.limit || 10);
};

const getOrgMetrics = async (user) => {
  const db = getFirestore();
  const orgId = resolveOrganizationId(user);
  const [roster, analytics, templates] = await Promise.all([
    getOrgRoster(db, orgId),
    getAnalytics(user, { range: 'all' }),
    templateService.listTemplates(user).catch(() => []),
  ]);
  return {
    users: roster.length,
    reports: analytics.metrics.reportsGenerated,
    photos: analytics.metrics.photosAnalyzed,
    templates: templates.filter((t) => t.scope === 'organization').length,
    // Honest per Golden Rule #1: no per-account storage-byte tracking or
    // department/sub-team entity exists anywhere in this codebase yet --
    // report that plainly rather than fabricate a number.
    storage: { available: false },
    departments: { available: false },
    roleBreakdown: buildRoleBreakdown(roster),
  };
};

const getOrgSecuritySummary = async (user) => {
  const db = getFirestore();
  const orgId = resolveOrganizationId(user);
  const [roster, teamDocsSnap] = await Promise.all([
    getOrgRoster(db, orgId),
    db.collection('enterpriseTeams').where('ownerId', '==', orgId).get(),
  ]);
  const userDocs = await Promise.all(roster.map((m) => db.collection('users').doc(m.uid).get()));
  const mfaEnabledCount = userDocs.filter((d) => d.exists && d.data().mfaEnabled).length;
  const suspendedCount = teamDocsSnap.docs.filter((d) => d.data().status === 'suspended').length;
  const legacyRoleCount = teamDocsSnap.docs.filter((d) => d.data().role === 'editor').length
    + (roster.some((m) => m.role === 'editor' && m.uid === orgId) ? 1 : 0);
  return {
    totalMembers: roster.length,
    mfaEnabledCount,
    mfaAdoptionPercent: roster.length ? Math.round((mfaEnabledCount / roster.length) * 100) : 0,
    suspendedCount,
    legacyRoleCount,
  };
};

module.exports = {
  redactMeta,
  shapeAuditLog,
  filterAuditLogs,
  paginate,
  buildRoleBreakdown,
  fetchAuditLogsForActors,
  getOrgAuditLogs,
  getLoginHistory,
  getOrgMetrics,
  getOrgSecuritySummary,
};
