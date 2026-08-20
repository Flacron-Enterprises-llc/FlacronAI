// Phase 20 (Notifications Center & Global Search). Single source of truth for
// writing to the top-level `notifications` collection and reading it back for
// the bell/feed UI. Deliberately reuses Phase 18's `notificationPrefs.js` gate
// (`isNotificationEnabled`) at every call site that already has a preference
// key, so "does this user want this" always means the same thing for the
// email and the in-app bell entry -- never a silently-drifting second opinion.
const { FieldValue } = require('../config/firebase');

// Every recipient's unread count lives on `users/{uid}.unreadNotificationCount`
// (a plain integer, kept in sync by every write below) instead of a live
// `.where('read','==',false)` count query on every page load -- O(1) reads for
// the badge instead of an ever-growing scan, and it survives the same
// "bounded queries only" constraint the rest of this phase follows.
const NOTIFICATION_TYPES = {
  ANALYSIS_COMPLETED: 'analysis_completed',
  ANALYSIS_FAILED: 'analysis_failed',
  REPORT_COMPLETED: 'report_completed', // also covers "report ready for review" -- see notes below
  REVIEW_REQUESTED: 'review_requested',
  REVIEW_DECLINED: 'review_declined',
  REPORT_APPROVED: 'report_approved',
  REPORT_SHARED: 'report_shared',
  EXPORT_COMPLETED: 'export_completed',
  TEAM_INVITATION: 'team_invitation',
  SUBSCRIPTION_ISSUE: 'subscription_issue',
};

// Bounded read window for the bell/feed -- a single-field equality query
// (`where('uid','==',uid)`) combined with `.orderBy('createdAt')` would need a
// composite index this project has no way to deploy this session (same
// documented constraint as teams.js's RECENT_ACTIVITY_WINDOW / Phase 19's
// assigned-to-me). Sorting the bounded window in JS avoids that entirely,
// at the honest cost of never surfacing anything older than the window for a
// very high-volume account -- `windowCapped` in the response flags exactly
// when that trim is in effect.
const NOTIFICATIONS_WINDOW = 200;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// Firestore batch writes cap at 500. "Mark all read" is bounded to one batch
// per call rather than an unbounded loop -- an account with more than 500
// unread notifications (not a realistic case in practice) simply needs a
// second click, which is far safer than an uncapped write loop.
const MARK_ALL_BATCH_CAP = 500;

const nowIso = () => new Date().toISOString();

// Centralizes notification copy (title/body/click-through link) per type, the
// same role emailService.js's templates play for outbound email -- so wording
// lives in exactly one place instead of being re-typed at every call site.
const buildNotification = (type, data = {}) => {
  const reportLink = data.reportId ? `/reports/${data.reportId}/preview` : null;
  const claim = data.claimNumber ? `claim ${data.claimNumber}` : 'your report';
  switch (type) {
    case NOTIFICATION_TYPES.ANALYSIS_COMPLETED:
      return {
        title: 'Photo analysis complete',
        body: `Analysis finished for ${claim} (${data.photoCount || 0} photo${data.photoCount === 1 ? '' : 's'}).`,
        link: reportLink,
      };
    case NOTIFICATION_TYPES.ANALYSIS_FAILED:
      return {
        title: 'Photo analysis failed',
        body: `Analysis could not complete for ${claim}. You can retry it from the report.`,
        link: reportLink,
      };
    case NOTIFICATION_TYPES.REPORT_COMPLETED:
      return {
        title: 'Report ready for review',
        body: `Your draft report for ${claim} has been generated and is ready for your review.`,
        link: reportLink,
      };
    case NOTIFICATION_TYPES.REVIEW_REQUESTED:
      return {
        title: 'Review requested',
        body: `${data.requestedByName || 'A teammate'} asked you to review ${claim}.`,
        link: reportLink,
      };
    case NOTIFICATION_TYPES.REVIEW_DECLINED:
      return {
        title: data.decision === 'rejected' ? 'Review declined' : 'Changes requested',
        body:
          data.decision === 'rejected'
            ? `${data.reviewerName || 'Your reviewer'} declined to review ${claim}.`
            : `${data.reviewerName || 'Your reviewer'} requested changes to ${claim}.`,
        link: reportLink,
      };
    case NOTIFICATION_TYPES.REPORT_APPROVED:
      return {
        title: 'Report approved',
        body: `${claim[0].toUpperCase()}${claim.slice(1)} was approved and finalized.`,
        link: reportLink,
      };
    case NOTIFICATION_TYPES.REPORT_SHARED:
      return {
        title: 'Report access granted',
        body: `${data.grantedByName || 'Someone'} gave you ${data.permission || 'view'} access to ${claim}.`,
        link: reportLink,
      };
    case NOTIFICATION_TYPES.EXPORT_COMPLETED:
      return {
        title: 'Export ready',
        body: `Your ${String(data.format || '').toUpperCase()} export for ${claim} is ready to download.`,
        link: reportLink,
      };
    case NOTIFICATION_TYPES.TEAM_INVITATION:
      return {
        title: 'Team invitation',
        body: `${data.ownerName || 'A team owner'} invited you to join their team as ${data.role || 'a member'}.`,
        link: '/dashboard',
      };
    case NOTIFICATION_TYPES.SUBSCRIPTION_ISSUE:
      return {
        title: 'Payment issue',
        body: 'We were unable to process your subscription payment. Please update your billing details.',
        link: '/subscriptions',
      };
    default:
      return { title: 'Notification', body: '', link: null };
  }
};

// Writes one notification doc + increments the recipient's unread counter.
// Best-effort and self-swallowing (like recordAuditLog) -- a notification
// failure must never break the real action it's describing.
//
// `dedupeKey`, when given, is used as the literal Firestore doc id via
// `.create()` (which fails if the doc already exists) instead of `.add()` --
// giving true at-most-once semantics for the handful of call sites that could
// otherwise double-fire (a redelivered Stripe webhook, a double-submitted
// team invite). Every other event site already has its own natural one-shot
// guard upstream (e.g. Phase 19's REVIEW_ALREADY_PENDING check, a single
// approve/export call, one pipeline run per generation) -- documented at each
// call site rather than re-derived here.
const createNotification = async (db, { uid, type, title, body, meta = {}, link = null, dedupeKey = null }) => {
  if (!uid || !type) return;
  try {
    const payload = { uid, type, title, body, link, meta, read: false, createdAt: nowIso(), readAt: null };
    if (dedupeKey) {
      try {
        await db.collection('notifications').doc(dedupeKey).create(payload);
      } catch (err) {
        // ALREADY_EXISTS (gRPC code 6) -- a genuine duplicate, not a failure.
        if (err.code === 6 || /already exists/i.test(err.message || '')) return;
        throw err;
      }
    } else {
      await db.collection('notifications').add(payload);
    }
    await db
      .collection('users')
      .doc(uid)
      .set({ unreadNotificationCount: FieldValue.increment(1) }, { merge: true });
  } catch (err) {
    console.warn('[Notifications] failed to create notification:', err.message);
  }
};

// meta is deliberately a minimal, non-secret projection -- never a raw share
// token, invite token, or webhook payload -- just enough for the bell UI to
// display/group by (mirrors Phase 19's audit-log meta discipline).
const notifyUser = async (db, uid, type, data = {}, opts = {}) => {
  const { title, body, link } = buildNotification(type, data);
  return createNotification(db, {
    uid,
    type,
    title,
    body,
    link,
    meta: { reportId: data.reportId || null, claimNumber: data.claimNumber || null },
    dedupeKey: opts.dedupeKey || null,
  });
};

const clampPage = (value, fallback, max) => {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return max ? Math.min(n, max) : n;
};

const listNotifications = async (db, uid, { page, limit } = {}) => {
  const lim = clampPage(limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const pg = clampPage(page, 1, null);

  const [snap, userDoc] = await Promise.all([
    db.collection('notifications').where('uid', '==', uid).limit(NOTIFICATIONS_WINDOW).get(),
    db.collection('users').doc(uid).get(),
  ]);
  const all = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const offset = (pg - 1) * lim;
  const unreadCount = Math.max(0, userDoc.data()?.unreadNotificationCount || 0);

  return {
    notifications: all.slice(offset, offset + lim),
    page: pg,
    limit: lim,
    total: all.length,
    hasMore: offset + lim < all.length,
    unreadCount,
    windowCapped: snap.size >= NOTIFICATIONS_WINDOW,
  };
};

const NOT_FOUND_ERROR = () => {
  const err = new Error('Notification not found');
  err.code = 'NOT_FOUND';
  return err;
};

// Transactional so the notification's read flag and the recipient's unread
// counter can never drift apart under concurrent requests (two tabs, a
// stale-response race) -- the same reasoning as Phase 8's per-photo review
// transaction. Counter is clamped at 0, never allowed to go negative.
const markAsRead = async (db, uid, notificationId) => {
  const notifRef = db.collection('notifications').doc(notificationId);
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async (tx) => {
    const notifDoc = await tx.get(notifRef);
    if (!notifDoc.exists || notifDoc.data().uid !== uid) throw NOT_FOUND_ERROR();
    if (notifDoc.data().read) return { alreadyRead: true };
    const userDoc = await tx.get(userRef);
    const current = userDoc.data()?.unreadNotificationCount || 0;
    tx.update(notifRef, { read: true, readAt: nowIso() });
    tx.set(userRef, { unreadNotificationCount: Math.max(0, current - 1) }, { merge: true });
    return { alreadyRead: false };
  });
};

// Bounded to one batch (see MARK_ALL_BATCH_CAP). If more unread remain beyond
// the cap, the counter is decremented by exactly what was cleared (never
// zeroed out under-counting what's left) so a second call finishes the rest.
const markAllAsRead = async (db, uid) => {
  const snap = await db
    .collection('notifications')
    .where('uid', '==', uid)
    .where('read', '==', false)
    .limit(MARK_ALL_BATCH_CAP)
    .get();

  const userRef = db.collection('users').doc(uid);
  if (snap.empty) {
    await userRef.set({ unreadNotificationCount: 0 }, { merge: true });
    return { updated: 0, more: false };
  }

  const batch = db.batch();
  const now = nowIso();
  snap.docs.forEach((d) => batch.update(d.ref, { read: true, readAt: now }));
  await batch.commit();

  const more = snap.size >= MARK_ALL_BATCH_CAP;
  if (more) {
    await db.runTransaction(async (tx) => {
      const userDoc = await tx.get(userRef);
      const current = userDoc.data()?.unreadNotificationCount || 0;
      tx.set(userRef, { unreadNotificationCount: Math.max(0, current - snap.size) }, { merge: true });
    });
  } else {
    await userRef.set({ unreadNotificationCount: 0 }, { merge: true });
  }
  return { updated: snap.size, more };
};

module.exports = {
  NOTIFICATION_TYPES,
  NOTIFICATIONS_WINDOW,
  MARK_ALL_BATCH_CAP,
  buildNotification,
  createNotification,
  notifyUser,
  listNotifications,
  markAsRead,
  markAllAsRead,
};
