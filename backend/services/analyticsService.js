// Phase 15 (General Analytics Page). Shared aggregation logic for the new
// `/analytics` page, kept as pure, dependency-free functions (no Firestore
// calls) wherever possible so they're unit-testable the same way
// `crmService.buildDashboardAnalytics` already is (see
// backend/test/crm-analytics.test.js) -- only `getAnalytics` at the bottom
// touches Firestore.
//
// Consolidation decision (Phase 15 task 4 -- "avoid duplicating aggregation
// logic across Dashboard-home, CRM analytics, and this page"): this module
// intentionally does NOT reach into `crmService.buildDashboardAnalytics` or
// rewrite it to call in here. That function is already shipped, live-QA'd,
// and covered by a test asserting its exact output shape/values; forcing it
// through this module's slightly different (and more complete -- see
// `normalizeStatus` below) status/turnaround rules would silently change its
// production behavior for any account with legacy 'completed'-status reports,
// which is out of Phase 15's scope. The same is true of reports.js's
// `dashboard-summary` endpoint, which deliberately uses server-side
// `.count()`/`.select()` aggregation instead of a full in-memory fetch for
// performance reasons of its own. Instead, this module mirrors the same
// *pattern* (pure aggregator + thin Firestore-fetching wrapper) so any real
// future consolidation is a straightforward refactor, not a rewrite.
const { getFirestore } = require('../config/firebase');
const { resolveOrganizationId, resolveRole, hasCapability } = require('../utils/orgRoles');

const MS_PER_DAY = 86400000;
const MAX_BUCKETS = 400; // hard safety cap regardless of requested range size
const ORG_QUERY_CHUNK = 30; // Firestore 'in' query limit

const safeDate = (value) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

// Normalizes the legacy pre-Phase-7 statuses ('completed'/'approved') onto
// the current draft/processing/finalized/failed/archived vocabulary, matching
// reports.js's own isReviewed() rule, so a status breakdown chart doesn't
// splinter old and new reports that mean the same thing into separate bars.
const normalizeStatus = (status) => {
  const s = String(status || 'draft').toLowerCase();
  return s === 'completed' || s === 'approved' ? 'finalized' : s;
};

const groupCount = (items, keyFn) => {
  const out = {};
  items.forEach((item) => {
    const key = keyFn(item) || 'Unspecified';
    out[key] = (out[key] || 0) + 1;
  });
  return out;
};

// "Average Report Completion Time" = hours from report creation to the
// moment it was finalized/reviewed (createdAt -> reviewedAt), over reports
// that actually reached that state in the given set. Golden Rule #1: with no
// qualifying reports this returns null ("not enough data"), never a
// fabricated 0.
const computeAverageCompletionHours = (reports) => {
  const samples = reports
    .filter((r) => normalizeStatus(r.status) === 'finalized')
    .map((r) => {
      const created = safeDate(r.createdAt);
      const reviewed = safeDate(r.reviewedAt);
      return created && reviewed && reviewed >= created ? (reviewed - created) / 3600000 : null;
    })
    .filter((v) => v != null);
  if (!samples.length) return { avgCompletionHours: null, sampleSize: 0 };
  const avg = samples.reduce((sum, v) => sum + v, 0) / samples.length;
  return { avgCompletionHours: Math.round(avg * 10) / 10, sampleSize: samples.length };
};

// Rolling N-calendar-month usage trend (default 12), independent of the
// page's own date-range filter -- a "Monthly Usage" chart is inherently a
// multi-month view, so it always shows a fixed trailing window ending "now"
// rather than being re-scoped every time the range filter changes.
const buildMonthlyUsage = (reports, { now = new Date(), months = 12 } = {}) =>
  Array.from({ length: months }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const inMonth = reports.filter((r) => {
      const created = safeDate(r.createdAt);
      return created && created >= date && created < next;
    });
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      reports: inMonth.length,
      photos: inMonth.reduce((sum, r) => sum + (r.imageCount || 0), 0),
    };
  });

// Picks a bucket granularity that keeps a time-series chart readable
// regardless of how wide a range the caller selected.
const pickBucketGranularity = (startDate, endDate) => {
  const days = Math.max(1, (endDate.getTime() - startDate.getTime()) / MS_PER_DAY);
  if (days <= 31) return 'day';
  if (days <= 180) return 'week';
  return 'month';
};

// `tzOffsetMinutes` is the browser's `-new Date().getTimezoneOffset()` (e.g.
// -300 for US Eastern during EST) -- shifting every timestamp by it before
// reading calendar fields means "day"/"week"/"month" boundaries line up with
// the viewer's own local calendar, not the server's or a hardcoded UTC one.
// `getTimezoneOffset()` is positive when local is BEHIND UTC, so
// local = UTC + tzOffsetMinutes (e.g. UTC-4 -> tzOffsetMinutes -240 -> local
// is 4 hours earlier than the UTC instant).
const shiftDate = (date, tzOffsetMinutes) => new Date(date.getTime() + tzOffsetMinutes * 60000);

const bucketKeyAndLabel = (shifted, granularity) => {
  const y = shifted.getUTCFullYear();
  const mo = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  if (granularity === 'month') {
    return {
      key: `${y}-${String(mo + 1).padStart(2, '0')}`,
      label: new Date(Date.UTC(y, mo, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    };
  }
  if (granularity === 'week') {
    const monday = new Date(Date.UTC(y, mo, d));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    return {
      key: monday.toISOString().slice(0, 10),
      label: `Week of ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`,
    };
  }
  return {
    key: `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    label: new Date(Date.UTC(y, mo, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
  };
};

// Builds a complete, gap-free time series between startDate/endDate
// (inclusive) -- every bucket in the window appears even with a zero count,
// so "Reports Over Time"/"Photos Processed Over Time" render a continuous
// axis instead of skipping quiet days. `metric` selects what's summed per
// report: 'count' (Reports Over Time) or 'photos' (Photos Processed Over
// Time, summing imageCount).
const buildTimeSeries = (reports, { startDate, endDate, tzOffsetMinutes = 0, metric = 'count' }) => {
  const granularity = pickBucketGranularity(startDate, endDate);
  const shiftedStart = shiftDate(startDate, tzOffsetMinutes);
  const shiftedEnd = shiftDate(endDate, tzOffsetMinutes);

  let cursor;
  if (granularity === 'month') {
    cursor = new Date(Date.UTC(shiftedStart.getUTCFullYear(), shiftedStart.getUTCMonth(), 1));
  } else if (granularity === 'week') {
    cursor = new Date(Date.UTC(shiftedStart.getUTCFullYear(), shiftedStart.getUTCMonth(), shiftedStart.getUTCDate()));
    cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
  } else {
    cursor = new Date(Date.UTC(shiftedStart.getUTCFullYear(), shiftedStart.getUTCMonth(), shiftedStart.getUTCDate()));
  }

  const buckets = new Map();
  const order = [];
  let guard = 0;
  while (cursor <= shiftedEnd && guard < MAX_BUCKETS) {
    const { key, label } = bucketKeyAndLabel(cursor, granularity);
    if (!buckets.has(key)) {
      buckets.set(key, { key, label, value: 0 });
      order.push(key);
    }
    const next = new Date(cursor);
    if (granularity === 'month') next.setUTCMonth(next.getUTCMonth() + 1);
    else if (granularity === 'week') next.setUTCDate(next.getUTCDate() + 7);
    else next.setUTCDate(next.getUTCDate() + 1);
    cursor = next;
    guard += 1;
  }

  reports.forEach((r) => {
    const created = safeDate(r.createdAt);
    if (!created) return;
    const { key } = bucketKeyAndLabel(shiftDate(created, tzOffsetMinutes), granularity);
    const bucket = buckets.get(key);
    if (!bucket) return; // outside the enumerated window -- caller should already have range-filtered
    bucket.value += metric === 'photos' ? (r.imageCount || 0) : 1;
  });

  return order.map((key) => buckets.get(key));
};

// "Reports Per User" / enterprise "team comparison" chart -- one row per
// roster member (owner + active/suspended team members with a real account),
// zero-filled for members who haven't generated anything in the set given.
// A report whose userId isn't on the current roster (a removed former
// member) is intentionally excluded rather than mis-attributed to someone
// else.
const buildReportsPerUser = (reports, roster) => {
  const byUser = new Map();
  roster.forEach((m) => byUser.set(m.uid, { ...m, reportsGenerated: 0, photosAnalyzed: 0 }));
  reports.forEach((r) => {
    const entry = byUser.get(r.userId);
    if (!entry) return;
    entry.reportsGenerated += 1;
    entry.photosAnalyzed += r.imageCount || 0;
  });
  return [...byUser.values()].sort((a, b) => b.reportsGenerated - a.reportsGenerated);
};

const RANGE_PRESET_DAYS = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };

const resolveRange = ({ range, startDate, endDate } = {}, now) => {
  if (startDate && endDate) {
    const s = safeDate(startDate);
    const e = safeDate(endDate);
    if (s && e && e >= s) return { startDate: s, endDate: e, label: 'Custom range' };
  }
  if (range === 'all') return { startDate: new Date(0), endDate: now, label: 'All time' };
  const days = RANGE_PRESET_DAYS[range] || RANGE_PRESET_DAYS['30d'];
  return { startDate: new Date(now.getTime() - days * MS_PER_DAY), endDate: now, label: `Last ${days} days` };
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// Field-masked projection (not full documents) so a large `content` field on
// each report never has to be read/deserialized for a page that only ever
// shows counts and dates -- same rationale as reports.js's dashboard-summary.
const REPORT_FIELDS = ['userId', 'createdAt', 'reviewedAt', 'status', 'reportType', 'imageCount'];

const fetchReportsForUsers = async (db, uids) => {
  if (!uids.length) return [];
  const groups = chunk(uids, ORG_QUERY_CHUNK);
  const snaps = await Promise.all(
    groups.map((g) => db.collection('reports').where('userId', 'in', g).select(...REPORT_FIELDS).get())
  );
  return snaps.flatMap((snap) => snap.docs.map((d) => d.data()));
};

// Active organization roster: the owner plus every team member who has
// actually accepted (has a real `userId`) -- pending invites have no reports
// to attribute and are excluded. Suspended members are KEPT: suspension is
// about access, not about erasing their real historical contribution from
// analytics (Golden Rule #1 -- their reports really happened).
const getOrgRoster = async (db, orgId) => {
  const [membersSnap, ownerDoc] = await Promise.all([
    db.collection('enterpriseTeams').where('ownerId', '==', orgId).get(),
    db.collection('users').doc(orgId).get(),
  ]);
  const ownerData = ownerDoc.exists ? ownerDoc.data() : {};
  const roster = [{ uid: orgId, email: ownerData.email || '', displayName: ownerData.displayName || '', role: 'owner' }];
  membersSnap.docs.forEach((d) => {
    const m = d.data();
    if (m.userId) {
      roster.push({ uid: m.userId, email: m.email || '', displayName: '', role: m.role });
    }
  });
  return roster;
};

// Orchestrates the Firestore reads and returns the full /analytics payload.
// Scope decision: only an enterprise-tier caller with `canViewAllProfiles`
// (owner/admin/manager) ever triggers the extra `enterpriseTeams` roster
// read -- every other caller (the vast majority: starter/professional/agency
// solo accounts, and restricted team roles) is scoped to their own uid with
// zero extra Firestore round-trips.
const getAnalytics = async (user, options = {}, now = new Date()) => {
  const db = getFirestore();
  const orgId = resolveOrganizationId(user);

  let roster = null;
  if (user.tier === 'enterprise' && hasCapability(user, 'canViewAllProfiles')) {
    roster = await getOrgRoster(db, orgId);
  }

  const scope = roster && roster.length > 1 ? 'organization' : 'personal';
  const uids = scope === 'organization' ? roster.map((m) => m.uid) : [user.uid];

  const allReports = await fetchReportsForUsers(db, uids);
  const resolvedRange = resolveRange(options, now);
  const inRange = allReports.filter((r) => {
    const created = safeDate(r.createdAt);
    return created && created >= resolvedRange.startDate && created <= resolvedRange.endDate;
  });

  const { avgCompletionHours, sampleSize } = computeAverageCompletionHours(inRange);
  const tzOffsetMinutes = Number.isFinite(options.tzOffsetMinutes) ? options.tzOffsetMinutes : 0;

  return {
    scope,
    viewerRole: resolveRole(user),
    teamSize: scope === 'organization' ? roster.length : null,
    range: {
      startDate: resolvedRange.startDate.toISOString(),
      endDate: resolvedRange.endDate.toISOString(),
      label: resolvedRange.label,
    },
    metrics: {
      reportsGenerated: inRange.length,
      photosAnalyzed: inRange.reduce((sum, r) => sum + (r.imageCount || 0), 0),
      avgCompletionHours,
      avgCompletionSampleSize: sampleSize,
      reportsByType: groupCount(inRange, (r) => r.reportType || 'Unspecified'),
      reportsByStatus: groupCount(inRange, (r) => normalizeStatus(r.status)),
    },
    monthlyUsage: buildMonthlyUsage(allReports, { now, months: 12 }),
    reportsOverTime: buildTimeSeries(inRange, { startDate: resolvedRange.startDate, endDate: resolvedRange.endDate, tzOffsetMinutes, metric: 'count' }),
    photosOverTime: buildTimeSeries(inRange, { startDate: resolvedRange.startDate, endDate: resolvedRange.endDate, tzOffsetMinutes, metric: 'photos' }),
    reportsPerUser: scope === 'organization' ? buildReportsPerUser(inRange, roster) : null,
  };
};

module.exports = {
  normalizeStatus,
  groupCount,
  computeAverageCompletionHours,
  buildMonthlyUsage,
  pickBucketGranularity,
  buildTimeSeries,
  buildReportsPerUser,
  resolveRange,
  getOrgRoster,
  getAnalytics,
};
