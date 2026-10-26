// Account deletion <-> billing coordination.
//
// While DELETE /users/account runs, the user doc carries a short lease
// (`accountDeletionLock`) so no checkout, plan change or delayed Stripe webhook
// can (re)activate billing between "Stripe confirmed cancelled" and "account
// gone". The lease expires on its own if the process dies, and is cleared when
// an attempt fails, so a failed deletion leaves a fully usable account.
// Once Stripe cancellation is confirmed, the deletedAccounts/{uid} tombstone is
// written; from then on the account is treated as deleted for billing.

const LOCK_TTL_MS = 5 * 60 * 1000;

const isLockActive = (user, now = Date.now()) => {
  const until = user?.accountDeletionLock?.until;
  return typeof until === 'number' && until > now;
};

/** Returns { acquired, userExists }. A held, unexpired lease = concurrent deletion. */
async function acquireDeletionLock(db, uid, now = Date.now()) {
  const ref = db.collection('users').doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { acquired: true, userExists: false };
    if (isLockActive(snap.data(), now)) return { acquired: false, userExists: true };
    tx.update(ref, { accountDeletionLock: { startedAt: now, until: now + LOCK_TTL_MS } });
    return { acquired: true, userExists: true };
  });
}

async function releaseDeletionLock(db, uid) {
  const ref = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) tx.update(ref, { accountDeletionLock: null });
  });
}

/** 'deleted' (tombstoned) | 'locked' (deletion in progress) | 'ok'. */
async function billingBlockState(db, uid, now = Date.now()) {
  if (!uid) return 'ok';
  const [tomb, user] = await Promise.all([
    db.collection('deletedAccounts').doc(uid).get(),
    db.collection('users').doc(uid).get(),
  ]);
  if (tomb.exists) return 'deleted';
  if (user.exists && isLockActive(user.data(), now)) return 'locked';
  return 'ok';
}

const ACCOUNT_DELETION_BLOCKED_BODY = {
  success: false,
  error: 'This account is being deleted. Billing changes are not available.',
  code: 'ACCOUNT_DELETION_IN_PROGRESS',
};

module.exports = {
  LOCK_TTL_MS,
  isLockActive,
  acquireDeletionLock,
  releaseDeletionLock,
  billingBlockState,
  ACCOUNT_DELETION_BLOCKED_BODY,
};
