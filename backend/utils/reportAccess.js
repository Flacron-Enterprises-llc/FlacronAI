// Phase 19 (Sharing Permissions, Expiry, Comments & Review Requests).
// Pure helpers shared by backend/routes/reports.js -- kept dependency-free
// (no Firestore) so they can be unit-tested directly, matching the
// organizationService.js precedent (backend/test/organization-service.test.js).

// Three-tier permission model for anyone who isn't the report's owner:
// a Phase 19 grant (assignedUsers entry or an active share) is authoritative
// on its own and deliberately does NOT consult the grantee's own account
// role/tier -- every solo account resolves to "owner" of itself in
// orgRoles.js, which would otherwise leak full capability onto someone
// else's report just because they happen to own their own account.
const PERMISSION_RANK = { view: 1, comment: 2, review: 3 };

const isValidPermission = (value) => Object.prototype.hasOwnProperty.call(PERMISSION_RANK, value);

const rankOf = (permission) => PERMISSION_RANK[permission] || 0;

// Resolves what a non-owner `user` may do on `report`, or null if they have
// no grant at all. Never consults the requester's own role/tier.
const getAssignedPermission = (report, uid) => {
  if (!uid) return null;
  const grant = (report && report.assignedUsers ? report.assignedUsers : []).find(
    (a) => a && a.uid === uid
  );
  return grant ? grant.permission : null;
};

// 'owner' | 'view' | 'comment' | 'review' | null (no access at all).
const getReportAccess = (report, user) => {
  if (!report || !user) return null;
  if (report.userId === user.uid) return 'owner';
  return getAssignedPermission(report, user.uid);
};

const hasReportAccess = (report, user, minPermission) => {
  const access = getReportAccess(report, user);
  if (access === 'owner') return true;
  if (!access) return false;
  return rankOf(access) >= rankOf(minPermission);
};

const EXPIRY_OPTIONS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

// null/undefined/'never' -> no expiry. Anything else must be one of the 3
// named options -- throws so the route can turn it into a 400, never
// silently falling back to "no expiry" on a typo.
const computeExpiresAt = (expiresIn, now) => {
  const at = now || new Date();
  if (expiresIn === undefined || expiresIn === null || expiresIn === 'never' || expiresIn === '') {
    return null;
  }
  const ms = EXPIRY_OPTIONS[expiresIn];
  if (!ms) {
    const err = new Error('Invalid expiresIn value: ' + expiresIn);
    err.code = 'INVALID_EXPIRY';
    throw err;
  }
  return new Date(at.getTime() + ms).toISOString();
};

const isShareExpired = (share, now) => {
  const at = now || new Date();
  if (!share) return true;
  if (share.revoked) return true;
  if (!share.expiresAt) return false;
  return new Date(share.expiresAt).getTime() <= at.getTime();
};

// A lowercase, punctuation-stripped, whitespace-collapsed slug of a section
// title. Deliberately content-based (not positional) so a comment survives
// reordering -- only a literal rename/removal of the section breaks the
// anchor, at which point the UI falls back to showing the comment under
// "General" with its original title preserved for context.
const slugifySectionTitle = (title) => {
  const slug = String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return slug || 'general';
};

const MAX_COMMENT_LENGTH = 4000;
const CONTROL_CHARS_RE = new RegExp(
  '[' +
    String.fromCharCode(0) + '-' + String.fromCharCode(8) +
    String.fromCharCode(11) + String.fromCharCode(12) +
    String.fromCharCode(14) + '-' + String.fromCharCode(31) +
    String.fromCharCode(127) +
  ']',
  'g'
);

// Defense-in-depth plain-text sanitizer for comment bodies. Comments are
// always rendered as plain React text nodes (never dangerouslySetInnerHTML/
// markdown), so React already escapes '<'/'>' at render time -- this only
// strips control characters and caps length, deliberately leaving the
// visible text (including '<'/'>') untouched so a user's own comment is
// never silently mangled.
const sanitizeCommentBody = (value) => {
  const str = String(value || '')
    .replace(CONTROL_CHARS_RE, '')
    .trim();
  return str.slice(0, MAX_COMMENT_LENGTH);
};

const sanitizeGuestName = (value) =>
  String(value || '')
    .replace(CONTROL_CHARS_RE, '')
    .trim()
    .slice(0, 120);

module.exports = {
  PERMISSION_RANK,
  isValidPermission,
  rankOf,
  getAssignedPermission,
  getReportAccess,
  hasReportAccess,
  EXPIRY_OPTIONS,
  computeExpiresAt,
  isShareExpired,
  slugifySectionTitle,
  MAX_COMMENT_LENGTH,
  sanitizeCommentBody,
  sanitizeGuestName,
};
