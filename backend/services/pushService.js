// Mobile Phase 6 (Push Notifications). Durable delivery of in-app
// notifications to registered mobile devices via Expo's push service.
//
// OFF BY DEFAULT: unless PUSH_NOTIFICATIONS_ENABLED=true, no outbox job is
// written, the worker never starts, and no provider request is made --
// existing web/in-app/email behavior is unchanged.
//
// Durable outbox (`pushOutbox`, one job per notification, doc id = the
// notification id): the job is written in the SAME Firestore transaction as
// the notification itself (utils/notificationService.js), so a notification
// can't exist without its job or vice versa. A lease-based worker
// (`createPushWorker`) runs in every backend instance; jobs are claimed in a
// transaction with an expiring lease + random lease id, and results are only
// written back if the lease is still held (fencing), so several ECS tasks can
// run the worker concurrently and a crashed worker's job is picked up again
// once its lease expires.
//
// Job lifecycle: pending -> (send) -> awaiting_receipts -> done
//                         \-> pending (retry w/ backoff) -> failed (attempts exhausted)
//                         \-> expired (event older than PUSH_MAX_EVENT_AGE_MS before any send)
// Terminal jobs get `expireAt` and are deleted by the worker's sweep.
//
// Delivery semantics: at-least-once per device, NOT exactly-once. If Expo
// accepts a send but the worker dies (or loses its lease) before recording the
// tickets, the job is retried and that device can get the same notification
// twice. Expo offers no idempotency key, so this window cannot be closed; it
// is bounded by MAX_SEND_ATTEMPTS.
//
// Eligibility is re-checked at every send: notification preference for the
// event, account status, and each device binding (owner, lease, session not
// revoked -- utils/pushDeviceStore.js `bindingIneligibilityReason`).
//
// Content is generic (no claim numbers, names, report content); `data` is
// only { type, reportId }, matching the mobile payload validator. Nothing
// here logs tokens, the Expo access token, or payloads.
const crypto = require('crypto');
const { NOTIFICATION_TYPES } = require('../utils/notificationService');
const { isNotificationEnabled } = require('../utils/notificationPrefs');
const {
  listDevicesForUser,
  removeDeviceIfUnchanged,
  bindingIneligibilityReason,
  sweepExpired,
  bindingTag,
} = require('../utils/pushDeviceStore');

const OUTBOX = 'pushOutbox';
const DIAGNOSTICS_DOC = ['pushDiagnostics', 'credentials'];
const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const ANDROID_CHANNEL_ID = 'report-activity';
const SEND_CHUNK_SIZE = 100; // Expo limit per send request
const RECEIPT_CHUNK_SIZE = 1000; // Expo limit per getReceipts request
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3; // in-request retries for postToExpo's direct callers
const RETRY_BASE_MS = 1000;
const MAX_SEND_ATTEMPTS = 5;
const RECONCILE_BATCH = 25;
const MAX_RECEIPT_ATTEMPTS = 4;
const SEND_BACKOFF_BASE_MS = 30_000;
const SEND_BACKOFF_MAX_MS = 10 * 60_000;
const DEFAULT_RECEIPT_DELAY_MS = 15 * 60_000; // Expo: receipts ready ~15 min after send
const DEFAULT_MAX_EVENT_AGE_MS = 60 * 60_000;
const JOB_RETENTION_MS = 7 * 24 * 60 * 60_000;
const LEASE_MS = 2 * 60_000;
const DEFAULT_WORKER_INTERVAL_MS = 15_000;
const CLAIM_BATCH = 20;
const CREDENTIAL_ERROR_WINDOW_MS = 24 * 60 * 60_000;
const REPORT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const TERMINAL = new Set(['done', 'failed', 'expired']);

const isPushEnabled = () =>
  String(process.env.PUSH_NOTIFICATIONS_ENABLED || '').toLowerCase() === 'true';

const envMs = (name, fallback) => {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const GENERIC_COPY = {
  [NOTIFICATION_TYPES.ANALYSIS_COMPLETED]: [
    'Photo analysis complete',
    'Photo analysis finished for one of your reports.',
  ],
  [NOTIFICATION_TYPES.ANALYSIS_FAILED]: [
    'Photo analysis failed',
    'Photo analysis could not finish. Open FlacronAI to retry.',
  ],
  [NOTIFICATION_TYPES.REPORT_COMPLETED]: [
    'Report ready for review',
    'A draft report is ready for your review.',
  ],
  [NOTIFICATION_TYPES.REVIEW_REQUESTED]: [
    'Review requested',
    'You have been asked to review a report.',
  ],
  [NOTIFICATION_TYPES.REVIEW_DECLINED]: [
    'Review update',
    'A reviewer responded to your review request.',
  ],
  [NOTIFICATION_TYPES.REPORT_APPROVED]: [
    'Report approved',
    'One of your reports was approved and finalized.',
  ],
  [NOTIFICATION_TYPES.REPORT_SHARED]: [
    'Report shared with you',
    'You were given access to a report.',
  ],
  [NOTIFICATION_TYPES.EXPORT_COMPLETED]: [
    'Export ready',
    'Your report export is ready to download.',
  ],
  [NOTIFICATION_TYPES.TEAM_INVITATION]: ['Team invitation', 'You have a new team invitation.'],
  [NOTIFICATION_TYPES.SUBSCRIPTION_ISSUE]: [
    'Billing issue',
    'There is a problem with your subscription payment.',
  ],
};

const REPORT_SCOPED = new Set([
  NOTIFICATION_TYPES.ANALYSIS_COMPLETED,
  NOTIFICATION_TYPES.ANALYSIS_FAILED,
  NOTIFICATION_TYPES.REPORT_COMPLETED,
  NOTIFICATION_TYPES.REVIEW_REQUESTED,
  NOTIFICATION_TYPES.REVIEW_DECLINED,
  NOTIFICATION_TYPES.REPORT_APPROVED,
  NOTIFICATION_TYPES.REPORT_SHARED,
  NOTIFICATION_TYPES.EXPORT_COMPLETED,
]);

// The existing per-category preference (utils/notificationPrefs.js) that
// governs each event; types without one are always eligible.
const PREFERENCE_KEY = {
  [NOTIFICATION_TYPES.ANALYSIS_COMPLETED]: 'analysisCompleted',
  [NOTIFICATION_TYPES.ANALYSIS_FAILED]: 'analysisCompleted',
  [NOTIFICATION_TYPES.REPORT_COMPLETED]: 'reportCompleted',
  [NOTIFICATION_TYPES.REVIEW_REQUESTED]: 'reviewRequested',
  [NOTIFICATION_TYPES.REVIEW_DECLINED]: 'reviewRequested',
  [NOTIFICATION_TYPES.REPORT_APPROVED]: 'reportApproved',
  [NOTIFICATION_TYPES.REPORT_SHARED]: 'reportShared',
  [NOTIFICATION_TYPES.SUBSCRIPTION_ISSUE]: 'billing',
};

const buildPushContent = (type, data = {}) => {
  const copy = GENERIC_COPY[type];
  if (!copy) return null;
  const payload = { type };
  if (REPORT_SCOPED.has(type)) {
    if (
      typeof data.reportId !== 'string' ||
      !REPORT_ID_PATTERN.test(data.reportId) ||
      data.reportId === 'new'
    )
      return null;
    payload.reportId = data.reportId;
  }
  return { title: copy[0], body: copy[1], data: payload };
};

const isPushPreferenceEnabled = (userData, type) => {
  if (userData?.notificationsEnabled === false) return false;
  const key = PREFERENCE_KEY[type];
  return key ? isNotificationEnabled(userData?.notifications, key) : true;
};

// Outbox job for a notification, or null when nothing would ever be sent
// (unknown type / missing report id). Written by notificationService inside
// the notification's own transaction.
const buildOutboxJob = (notificationId, uid, type, data = {}, now = Date.now()) => {
  const content = buildPushContent(type, data);
  if (!content || !uid || !notificationId) return null;
  return {
    notificationId,
    uid,
    type,
    reportId: content.data.reportId || null,
    state: 'pending',
    createdAt: now,
    nextRunAt: now,
    attempts: 0,
    receiptAttempts: 0,
    receiptDueAt: null,
    deliveries: {},
    leaseId: null,
    leaseExpiresAt: 0,
    lastError: null,
    expireAt: null,
    updatedAt: now,
  };
};

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// POSTs JSON to Expo with a timeout and bounded retries for transient
// failures only (network error, timeout, 429, 5xx). Returns parsed JSON or
// null (caller treats null as "unknown" -- never as a reason to delete).
const postToExpo = async (
  url,
  body,
  { fetchImpl = fetch, sleep = defaultSleep, attempts = MAX_ATTEMPTS } = {}
) => {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
  };
  if (process.env.EXPO_ACCESS_TOKEN)
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      res = null;
    }
    if (res && res.ok) {
      try {
        return await res.json();
      } catch {
        return null;
      }
    }
    const transient = !res || res.status === 429 || res.status >= 500;
    if (!transient || attempt === attempts) {
      console.warn(`[Push] Expo request failed (status ${res ? res.status : 'network'})`);
      return null;
    }
    await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
  }
  return null;
};

const errorCode = (details) =>
  details && typeof details.error === 'string' ? details.error.slice(0, 40) : 'unknown';
const isPermanentDeviceError = (details) => errorCode(details) === 'DeviceNotRegistered';
const isRetryableTicketError = (details) => errorCode(details) === 'MessageRateExceeded';

// Sanitized diagnostics: only "a credential error happened for platform X at
// time T" -- never the provider message.
const recordCredentialError = async (db, platform, now) => {
  if (!SUPPORTED(platform)) return;
  try {
    await db
      .collection(DIAGNOSTICS_DOC[0])
      .doc(DIAGNOSTICS_DOC[1])
      .set({ [platform]: { lastCredentialErrorAt: now } }, { merge: true });
  } catch {
    // best-effort
  }
};
const SUPPORTED = (p) => p === 'ios' || p === 'android';

// 'credential-error' when Expo reported InvalidCredentials for that platform
// within the last 24h, else 'unverified' (configuration is never proof of
// delivery). Never exposes provider text.
const getProviderStatus = async (db, platform, now = Date.now()) => {
  if (!SUPPORTED(platform)) return 'unverified';
  try {
    const snap = await db.collection(DIAGNOSTICS_DOC[0]).doc(DIAGNOSTICS_DOC[1]).get();
    const at = snap.exists ? Number(snap.data()?.[platform]?.lastCredentialErrorAt) : 0;
    return at && now - at < CREDENTIAL_ERROR_WINDOW_MS ? 'credential-error' : 'unverified';
  } catch {
    return 'unverified';
  }
};

const backoff = (attempts) =>
  Math.min(SEND_BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), SEND_BACKOFF_MAX_MS);

const defaultGetAuthUser = async (uid) => {
  const { getAuth } = require('../config/firebase');
  return getAuth().getUser(uid);
};

function createPushWorker({
  db,
  workerId = crypto.randomUUID(),
  fetchImpl,
  sleep = defaultSleep,
  getAuthUser = defaultGetAuthUser,
  clock = () => Date.now(),
  intervalMs = envMs('PUSH_WORKER_INTERVAL_MS', DEFAULT_WORKER_INTERVAL_MS),
  receiptDelayMs = envMs('PUSH_RECEIPT_CHECK_DELAY_MS', DEFAULT_RECEIPT_DELAY_MS),
  maxEventAgeMs = envMs('PUSH_MAX_EVENT_AGE_MS', DEFAULT_MAX_EVENT_AGE_MS),
  sendChunkSize = SEND_CHUNK_SIZE,
  receiptChunkSize = RECEIPT_CHUNK_SIZE,
} = {}) {
  const expo = { fetchImpl, sleep, attempts: 1 }; // retries are persisted job attempts, not in-request
  const jobRef = (id) => db.collection(OUTBOX).doc(id);
  let timer = null;
  let ticking = false;
  let tickCount = 0;

  // Transactionally takes the lease on a due, unleased (or lease-expired) job.
  const claim = async (id) => {
    const leaseId = crypto.randomUUID();
    const now = clock();
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(jobRef(id));
      if (!snap.exists) return null;
      const job = snap.data();
      if (TERMINAL.has(job.state) || job.nextRunAt === null || job.nextRunAt > now) return null;
      if (job.leaseId && job.leaseExpiresAt > now) return null;
      tx.update(jobRef(id), {
        leaseId,
        leaseOwner: workerId,
        leaseExpiresAt: now + LEASE_MS,
        updatedAt: now,
      });
      return { ...job, leaseId };
    });
    return claimed;
  };

  // Writes results only if this worker still holds the lease.
  const commit = async (id, leaseId, patch) => {
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(jobRef(id));
      if (!snap.exists || snap.data().leaseId !== leaseId) return false;
      tx.update(jobRef(id), {
        ...patch,
        leaseId: null,
        leaseOwner: null,
        leaseExpiresAt: 0,
        updatedAt: clock(),
      });
      return true;
    });
  };

  const terminal = (state, extra = {}) => ({
    state,
    nextRunAt: null,
    expireAt: clock() + JOB_RETENTION_MS,
    ...extra,
  });

  const afterSendPatch = (job, deliveries, attempts, now) => {
    const values = Object.values(deliveries);
    const needsRetry = values.some((d) => d.status === 'retry');
    const ticketed = values.some((d) => d.status === 'ticketed');
    const receiptDueAt = job.receiptDueAt || (ticketed ? now + receiptDelayMs : null);
    if (needsRetry && attempts < MAX_SEND_ATTEMPTS) {
      return {
        deliveries,
        attempts,
        receiptDueAt,
        state: 'pending',
        nextRunAt: now + backoff(attempts),
      };
    }
    if (ticketed)
      return {
        deliveries,
        attempts,
        receiptDueAt,
        state: 'awaiting_receipts',
        nextRunAt: Math.max(now, receiptDueAt),
      };
    return { deliveries, attempts, receiptDueAt, ...terminal(needsRetry ? 'failed' : 'done') };
  };

  const processSend = async (job) => {
    const now = clock();
    const attempts = (job.attempts || 0) + 1;
    const deliveries = { ...(job.deliveries || {}) };
    const anySent = Object.values(deliveries).some(
      (d) => d.status === 'ticketed' || d.status === 'ok'
    );
    if (!anySent && now - job.createdAt > maxEventAgeMs)
      return terminal('expired', { lastError: 'event-too-old' });

    const content = buildPushContent(job.type, { reportId: job.reportId });
    if (!content) return terminal('done', { lastError: 'invalid-content' });

    let userData;
    let authUser = null;
    try {
      const userSnap = await db.collection('users').doc(job.uid).get();
      userData = userSnap.exists ? userSnap.data() : null;
      if (userData) authUser = await getAuthUser(job.uid);
    } catch (err) {
      if (
        err &&
        (err.code === 'auth/user-not-found' || err.errorInfo?.code === 'auth/user-not-found')
      ) {
        return terminal('done', { lastError: 'account-missing' });
      }
      if (attempts >= MAX_SEND_ATTEMPTS)
        return terminal('failed', { attempts, lastError: 'eligibility-check-failed' });
      return {
        attempts,
        nextRunAt: now + backoff(attempts),
        lastError: 'eligibility-check-failed',
      };
    }
    if (!userData) return terminal('done', { lastError: 'account-missing' });
    if (!isPushPreferenceEnabled(userData, job.type))
      return terminal('done', { lastError: 'preference-off' });

    const devices = await listDevicesForUser(db, job.uid);
    const seen = new Set();
    const targets = [];
    for (const d of devices) {
      const prior = deliveries[d.id];
      if (prior && prior.status !== 'retry') continue; // already resolved for this event
      const reason = bindingIneligibilityReason(d, { uid: job.uid, userData, authUser, now });
      if (reason) {
        if (!prior)
          deliveries[d.id] = {
            status: 'skipped',
            reason,
            registrationId: d.registrationId || null,
          };
        continue;
      }
      if (seen.has(d.token)) continue;
      seen.add(d.token);
      targets.push(d);
    }
    // A device that was retrying but is no longer registered at all.
    for (const [id, d] of Object.entries(deliveries)) {
      if (d.status === 'retry' && !devices.some((x) => x.id === id)) {
        deliveries[id] = { ...d, status: 'skipped', reason: 'unregistered' };
      }
    }
    if (targets.length === 0) return afterSendPatch(job, deliveries, attempts, now);

    for (const group of chunk(targets, sendChunkSize)) {
      const messages = group.map((d) => ({
        to: d.token,
        title: content.title,
        body: content.body,
        // eventId: stable per notification (same on every retry) so the app can
        // de-duplicate handling; bindingTag: lets the app ignore pushes for an
        // ended sign-in. Neither carries account or report content.
        data: { ...content.data, eventId: job.notificationId, bindingTag: bindingTag(d.bindingIdHash) },
        sound: 'default',
        priority: 'default',
        channelId: ANDROID_CHANNEL_ID,
      }));
      const json = await postToExpo(EXPO_SEND_URL, messages, expo);
      const tickets = json && Array.isArray(json.data) ? json.data : null;
      for (let i = 0; i < group.length; i++) {
        const d = group[i];
        const base = { registrationId: d.registrationId, platform: d.platform };
        const ticket = tickets ? tickets[i] : null;
        if (!tickets) {
          deliveries[d.id] = { ...base, status: 'retry', reason: 'request-failed' };
        } else if (ticket && ticket.status === 'ok' && typeof ticket.id === 'string') {
          deliveries[d.id] = { ...base, status: 'ticketed', ticketId: ticket.id.slice(0, 100) };
        } else if (ticket && ticket.status === 'error' && isPermanentDeviceError(ticket.details)) {
          await removeDeviceIfUnchanged(db, d.id, {
            uid: job.uid,
            registrationId: d.registrationId,
          }).catch(() => {});
          deliveries[d.id] = { ...base, status: 'invalid', reason: 'DeviceNotRegistered' };
        } else if (ticket && ticket.status === 'error' && isRetryableTicketError(ticket.details)) {
          deliveries[d.id] = { ...base, status: 'retry', reason: 'MessageRateExceeded' };
        } else {
          const code = ticket ? errorCode(ticket.details) : 'missing-ticket';
          if (code === 'InvalidCredentials') await recordCredentialError(db, d.platform, now);
          deliveries[d.id] = { ...base, status: 'error', reason: code };
          console.warn(`[Push] ticket error: ${code}`);
        }
      }
    }
    return afterSendPatch(job, deliveries, attempts, now);
  };

  const processReceipts = async (job) => {
    const now = clock();
    const receiptAttempts = (job.receiptAttempts || 0) + 1;
    const deliveries = { ...(job.deliveries || {}) };
    const pending = Object.entries(deliveries).filter(([, d]) => d.status === 'ticketed');
    if (pending.length === 0) return terminal('done', { receiptAttempts });
    for (const group of chunk(pending, receiptChunkSize)) {
      const json = await postToExpo(
        EXPO_RECEIPTS_URL,
        { ids: group.map(([, d]) => d.ticketId) },
        expo
      );
      const receipts = json && json.data && typeof json.data === 'object' ? json.data : null;
      if (!receipts) continue;
      for (const [id, d] of group) {
        const receipt = receipts[d.ticketId];
        if (!receipt) continue;
        if (receipt.status === 'ok') {
          deliveries[id] = { ...d, status: 'ok' };
        } else if (receipt.status === 'error' && isPermanentDeviceError(receipt.details)) {
          // Ownership-safe: deletes only the exact registration this ticket was for.
          await removeDeviceIfUnchanged(db, id, {
            uid: job.uid,
            registrationId: d.registrationId,
          }).catch(() => {});
          deliveries[id] = { ...d, status: 'invalid', reason: 'DeviceNotRegistered' };
        } else {
          const code = errorCode(receipt.details);
          if (code === 'InvalidCredentials') await recordCredentialError(db, d.platform, now);
          deliveries[id] = { ...d, status: 'error', reason: code };
          console.warn(`[Push] receipt error: ${code}`);
        }
      }
    }
    const unresolved = Object.values(deliveries).some((d) => d.status === 'ticketed');
    if (unresolved && receiptAttempts < MAX_RECEIPT_ATTEMPTS) {
      return { deliveries, receiptAttempts, nextRunAt: now + receiptDelayMs };
    }
    for (const [id, d] of Object.entries(deliveries)) {
      if (d.status === 'ticketed') deliveries[id] = { ...d, status: 'unconfirmed' };
    }
    return { deliveries, receiptAttempts, ...terminal('done') };
  };

  const processJob = async (job) => {
    try {
      return job.state === 'awaiting_receipts'
        ? await processReceipts(job)
        : await processSend(job);
    } catch (err) {
      const attempts = (job.attempts || 0) + 1;
      console.warn(
        '[Push] job processing error:',
        err && err.message ? err.message.slice(0, 120) : 'unknown'
      );
      if (attempts >= MAX_SEND_ATTEMPTS)
        return terminal('failed', { attempts, lastError: 'processing-error' });
      return { attempts, nextRunAt: clock() + backoff(attempts), lastError: 'processing-error' };
    }
  };

  // Recovery for notifications saved WITHOUT their outbox job (the combined
  // transaction failed; notificationService then wrote the notification alone
  // with `pushPending: true`). Creates the job idempotently (doc id = the
  // notification id, create() so an existing job is never overwritten), then
  // clears the flag. Events already older than maxEventAgeMs are only cleared
  // (never sent late). Runs every tick, bounded.
  const reconcileMissingOutbox = async () => {
    const snap = await db.collection('notifications').where('pushPending', '==', true).limit(RECONCILE_BATCH).get();
    let created = 0;
    for (const doc of snap.docs) {
      const n = doc.data();
      const createdAt = Date.parse(n.createdAt) || clock();
      const tooOld = clock() - createdAt > maxEventAgeMs;
      const job = tooOld
        ? null
        : buildOutboxJob(doc.id, n.uid, n.type, { reportId: n.meta && n.meta.reportId }, clock());
      if (job) {
        job.createdAt = createdAt; // event age is the notification's, not the reconcile time
        try {
          await jobRef(doc.id).create(job);
          created++;
        } catch (err) {
          const exists = err && (err.code === 6 || /already exists/i.test(err.message || ''));
          if (!exists) continue; // leave the flag; retried next tick
        }
      }
      await db.collection('notifications').doc(doc.id).update({ pushPending: false });
    }
    return created;
  };

  const sweepJobs = async () => {
    const snap = await db.collection(OUTBOX).where('expireAt', '<=', clock()).limit(100).get();
    for (const doc of snap.docs) await db.collection(OUTBOX).doc(doc.id).delete();
    return snap.docs.length;
  };

  // One worker pass. Never throws.
  const tick = async () => {
    const stats = { claimed: 0, committed: 0 };
    if (!isPushEnabled() || ticking) return stats;
    ticking = true;
    try {
      await reconcileMissingOutbox().catch(() => {});
      const due = await db
        .collection(OUTBOX)
        .where('nextRunAt', '<=', clock())
        .orderBy('nextRunAt')
        .limit(CLAIM_BATCH)
        .get();
      for (const doc of due.docs) {
        const job = await claim(doc.id).catch(() => null);
        if (!job) continue;
        stats.claimed++;
        const patch = await processJob(job);
        if (await commit(doc.id, job.leaseId, patch).catch(() => false)) stats.committed++;
      }
      tickCount++;
      if (tickCount % 20 === 1) {
        await sweepJobs().catch(() => {});
        await sweepExpired(db, { now: clock() }).catch(() => {});
      }
    } catch (err) {
      console.warn(
        '[Push] worker tick failed:',
        err && err.message ? err.message.slice(0, 120) : 'unknown'
      );
    } finally {
      ticking = false;
    }
    return stats;
  };

  return {
    workerId,
    tick,
    claim,
    commit,
    processJob,
    sweepJobs,
    reconcileMissingOutbox,
    start() {
      if (timer || !isPushEnabled()) return false;
      timer = setInterval(() => {
        tick();
      }, intervalMs);
      if (typeof timer.unref === 'function') timer.unref();
      return true;
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

let sharedWorker = null;
// Called once from server.js. No-op (and no Firestore/provider access) unless enabled.
const startPushWorker = (db) => {
  if (!isPushEnabled() || sharedWorker) return null;
  sharedWorker = createPushWorker({ db });
  sharedWorker.start();
  console.log('[Push] outbox worker started');
  return sharedWorker;
};

module.exports = {
  OUTBOX,
  ANDROID_CHANNEL_ID,
  SEND_CHUNK_SIZE,
  RECEIPT_CHUNK_SIZE,
  MAX_ATTEMPTS,
  MAX_SEND_ATTEMPTS,
  MAX_RECEIPT_ATTEMPTS,
  LEASE_MS,
  EXPO_SEND_URL,
  EXPO_RECEIPTS_URL,
  isPushEnabled,
  isPushPreferenceEnabled,
  buildPushContent,
  buildOutboxJob,
  postToExpo,
  getProviderStatus,
  createPushWorker,
  startPushWorker,
};
