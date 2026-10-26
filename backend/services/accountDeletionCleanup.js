// Mobile Phase 10 -- recoverable account-deletion cleanup.
//
// DELETE /users/account confirms Stripe cancellation, writes the
// deletedAccounts/{uid} tombstone (completed:false), then calls
// purgeAccountData(). Every step here is idempotent, so the same function
// finishes a deletion that failed half-way -- including after the profile doc
// or the Firebase Auth user is already gone, when the user can no longer sign in
// to retry (authenticateToken answers ACCOUNT_DELETED from then on).
//
// The sweeper re-runs purgeAccountData() for tombstones still `completed:false`
// after STALE_MS. A tombstone only exists once Stripe cancellation was confirmed,
// so the sweeper never needs to touch Stripe (delayed Stripe webhooks for the uid
// are already cancelled by the payment webhook backstop). Claims are lease-based
// (same pattern as the push outbox worker), so every ECS task can run it.
const { getAuth } = require('../config/firebase');
const { deletePrefix } = require('../config/storage');

const TOMBSTONES = 'deletedAccounts';
const STALE_MS = Number(process.env.ACCOUNT_DELETION_SWEEP_STALE_MS) || 10 * 60 * 1000; // > the 5-min deletion lease
const SWEEP_INTERVAL_MS = Number(process.env.ACCOUNT_DELETION_SWEEP_INTERVAL_MS) || 5 * 60 * 1000;
const SWEEP_LEASE_MS = 5 * 60 * 1000;
const SWEEP_BATCH = 10;
const MAX_SWEEP_ATTEMPTS = 20;

const FLAT_COLLECTIONS = [
  { name: 'reportTemplates', field: 'userId' },
  { name: 'reportDrafts', field: 'userId' },
  { name: 'apiKeys', field: 'userId' },
  { name: 'apiUsage', field: 'userId' },
  { name: 'webhookEndpoints', field: 'userId' },
  { name: 'crmClients', field: 'userId' },
  { name: 'crmAppointments', field: 'userId' },
  { name: 'crmClaims', field: 'userId' },
  { name: 'enterpriseClients', field: 'userId' },
  // In-app notifications + Mobile Phase 6 push state for this account.
  { name: 'notifications', field: 'uid' },
  { name: 'pushOutbox', field: 'uid' },
  { name: 'pushDevices', field: 'uid' },
];

// Steps 3-6 of account deletion. Throws on any failure; the tombstone then stays
// completed:false and the next user retry or sweep resumes from the start.
async function purgeAccountData(db, uid, { nowIso = new Date().toISOString() } = {}) {
  // Lock store purchases to this deleted owner (never reassignable).
  const storeSnap = await db.collection('storeSubscriptions').where('ownerUid', '==', uid).get();
  for (const d of storeSnap.docs) {
    if (d.data().ownerDeleted === true) continue;
    await db
      .collection('storeSubscriptions')
      .doc(d.id)
      .update({ ownerDeleted: true, ownerDeletedAt: nowIso, accountToken: null });
  }

  // Reports (+ their versions subcollection) need a recursive delete.
  const reportsSnap = await db.collection('reports').where('userId', '==', uid).get();
  await Promise.all(reportsSnap.docs.map((d) => db.recursiveDelete(d.ref)));

  for (const { name, field } of FLAT_COLLECTIONS) {
    const snap = await db.collection(name).where(field, '==', uid).get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  // All Storage objects (report photos, exports, logos). Strict: a failure keeps
  // the deletion incomplete rather than silently leaving files behind.
  await deletePrefix(`users/${uid}/`, { strict: true });

  // Profile, then the sign-in itself (already gone on a retry = fine).
  await db.collection('users').doc(uid).delete();
  try {
    await getAuth().deleteUser(uid);
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }
  await db
    .collection(TOMBSTONES)
    .doc(uid)
    .update({ completed: true, completedAt: new Date().toISOString() });
}

// Claims one stale, incomplete tombstone; false if another worker/request has it.
async function claimTombstone(db, uid, now) {
  const ref = db.collection(TOMBSTONES).doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const t = snap.data();
    if (t.completed === true) return false;
    if (Date.parse(t.lastAttemptAt || 0) > now - STALE_MS) return false; // a user retry may be running
    if (Date.parse(t.sweepLeaseUntil || 0) > now) return false;
    if ((t.sweepAttempts || 0) >= MAX_SWEEP_ATTEMPTS) return false; // needs a human; see lastSweepError
    tx.update(ref, {
      sweepLeaseUntil: new Date(now + SWEEP_LEASE_MS).toISOString(),
      sweepAttempts: (t.sweepAttempts || 0) + 1,
      lastAttemptAt: new Date(now).toISOString(),
    });
    return true;
  });
}

// One pass: finish up to SWEEP_BATCH incomplete deletions. Returns a summary.
async function sweepIncompleteDeletions(db, { now = Date.now() } = {}) {
  const result = { completed: [], failed: [] };
  const snap = await db
    .collection(TOMBSTONES)
    .where('completed', '==', false)
    .limit(SWEEP_BATCH * 5)
    .get();
  for (const d of snap.docs) {
    if (result.completed.length + result.failed.length >= SWEEP_BATCH) break;
    const uid = d.id;
    if (!(await claimTombstone(db, uid, now))) continue;
    try {
      await purgeAccountData(db, uid);
      await db
        .collection(TOMBSTONES)
        .doc(uid)
        .update({ sweepLeaseUntil: null, lastSweepError: null });
      result.completed.push(uid);
    } catch (err) {
      // Only an error code is stored -- never personal data or messages.
      const code = (err && (err.code || err.name)) || 'unexpected';
      await db
        .collection(TOMBSTONES)
        .doc(uid)
        .update({ sweepLeaseUntil: null, lastSweepError: String(code).slice(0, 100) })
        .catch(() => {});
      result.failed.push(uid);
    }
  }
  if (result.completed.length || result.failed.length) {
    console.log(
      `[AccountDeletion] sweep finished ${result.completed.length}, still incomplete ${result.failed.length}`
    );
  }
  return result;
}

let sharedTimer = null;
const startAccountDeletionSweeper = (db) => {
  if (sharedTimer || process.env.ACCOUNT_DELETION_SWEEP_ENABLED === 'false') return null;
  const run = () =>
    sweepIncompleteDeletions(db).catch((err) =>
      console.warn('[AccountDeletion] sweep failed:', err && err.code ? err.code : 'unexpected')
    );
  sharedTimer = setInterval(run, SWEEP_INTERVAL_MS);
  if (sharedTimer.unref) sharedTimer.unref();
  setTimeout(run, 30 * 1000).unref?.();
  console.log('[AccountDeletion] cleanup sweeper started');
  return sharedTimer;
};

module.exports = {
  STALE_MS,
  MAX_SWEEP_ATTEMPTS,
  purgeAccountData,
  sweepIncompleteDeletions,
  startAccountDeletionSweeper,
};
