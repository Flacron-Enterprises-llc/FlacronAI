// Mobile Phase 6 (Push Notifications). Device-token storage for Expo push.
//
// One document per push token in `pushDevices`, keyed by sha256(token), so a
// token can only ever belong to ONE account; a second account registering it
// moves ownership atomically (transaction).
//
// Session binding. Every registration carries a client-generated `bindingId`
// (a random UUID the app creates per sign-in on that device; only its sha256
// is stored) plus the server-verified session timing from the auth middleware
// (`req.sessionContext`). This gives three server-enforced guarantees:
//   1. Revocation fence -- revoking a bindingId (sign-out, account switch,
//      session ended) writes a tombstone in `pushBindingRevocations`; any
//      registration carrying that bindingId that reaches the server later
//      (e.g. a request already in flight when the user signed out) is
//      rejected inside the same transaction that would have written it. The
//      client cancelling its request is never relied on.
//   2. Stale-request fence -- a registration whose ID token was issued
//      (`iat`) before the session that currently holds the token began
//      (`sessionAuthTime`) cannot overwrite it, so a late request from an
//      older session/account never takes a device back from a newer one.
//   3. Bounded lease -- a binding is only deliverable until `leaseExpiresAt`
//      (LEASE_MS after its last registration); the app renews it at least
//      daily while signed in. Delivery also re-checks the account/session
//      (see `bindingIneligibilityReason`).
//
// Revocation by bindingId needs no auth: proof of possession of the random
// bindingId is the credential, so a device that signed out OFFLINE can still
// revoke its binding once it is back online.
//
// Stored fields are the minimum needed: { uid, token, platform, provider,
// registrationId, bindingIdHash, sessionKind, sessionAuthTime, tokenVersion,
// leaseExpiresAt, createdAt, updatedAt }. `registrationId` changes on every
// (re-)registration so a delayed provider result can only delete the exact
// registration it was produced for.
//
// Cleanup: sign-out/session-end revocation, account deletion
// (routes/users.js), confirmed DeviceNotRegistered, the per-account cap,
// and `sweepExpired` (leases expired > LEASE_GRACE_MS ago, tombstones past
// their expiry). Server-side only -- no Firestore client rule grants access.
const crypto = require('crypto');

const COLLECTION = 'pushDevices';
const REVOCATIONS = 'pushBindingRevocations';
const MAX_DEVICES_PER_USER = 10;
const MAX_TOKEN_LENGTH = 200;
const SUPPORTED_PLATFORMS = ['ios', 'android'];
// Deliverability lease (Mobile Phase 7 follow-up: reduced from a fixed 14 days).
// It is the upper bound on how long a device that signed out OFFLINE and never
// reconnects can keep receiving (generic) pushes. Shorter = smaller window, but
// a signed-in user who doesn't open the app for longer than the lease stops
// getting pushes until they next open it (in-app feed/email unaffected).
// PUSH_BINDING_LEASE_HOURS, clamped to 24..336 h; default 168 h (7 days).
const DEFAULT_LEASE_HOURS = 168;
const leaseMs = () => {
  const h = Number(process.env.PUSH_BINDING_LEASE_HOURS);
  const hours = Number.isFinite(h) && h > 0 ? Math.min(336, Math.max(24, h)) : DEFAULT_LEASE_HOURS;
  return hours * 60 * 60 * 1000;
};
const LEASE_MS = leaseMs();
const LEASE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
// Must outlive any request that could still be in flight with the revoked
// bindingId, and the lease itself.
const REVOCATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SWEEP_LIMIT = 100;
const EXPO_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,180}\]$/;
const BINDING_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const tokenDocId = (token) => sha256(token);
const bindingHash = (bindingId) => sha256(String(bindingId).toLowerCase());
// Short, non-reversible marker sent in each push's data so the app can tell a
// push addressed to an ENDED binding (stale sign-in) from one for its current
// binding. Derived from the stored hash (never the bindingId, which is the
// revocation secret), so it grants nothing.
const bindingTag = (hash) => (hash ? sha256(`${hash}:push-tag`).slice(0, 16) : null);

const isValidExpoToken = (token) =>
  typeof token === 'string' && token.length <= MAX_TOKEN_LENGTH && EXPO_TOKEN_PATTERN.test(token);
const isSupportedPlatform = (platform) =>
  typeof platform === 'string' && SUPPORTED_PLATFORMS.includes(platform);
const isValidBindingId = (bindingId) =>
  typeof bindingId === 'string' && BINDING_ID_PATTERN.test(bindingId);

// Returns { status: 'registered' | 'revoked' | 'stale', moved }.
const registerDevice = async (
  db,
  uid,
  { token, platform, bindingId, session },
  { now = Date.now() } = {}
) => {
  const ref = db.collection(COLLECTION).doc(tokenDocId(token));
  const hash = bindingHash(bindingId);
  const revocationRef = db.collection(REVOCATIONS).doc(hash);
  const issuedAt = Number(session?.issuedAt) || 0;
  const authTime = Number(session?.authTime) || issuedAt;

  const result = await db.runTransaction(async (tx) => {
    const [revocation, snap] = [await tx.get(revocationRef), await tx.get(ref)];
    if (revocation.exists) return { status: 'revoked', moved: false };
    const existing = snap.exists ? snap.data() : null;
    if (
      existing &&
      existing.bindingIdHash !== hash &&
      Number(existing.sessionAuthTime || 0) > issuedAt
    ) {
      return { status: 'stale', moved: false };
    }
    const nowIso = new Date(now).toISOString();
    const moved = !!existing && existing.uid !== uid;
    tx.set(ref, {
      uid,
      token,
      platform,
      provider: 'expo',
      registrationId: crypto.randomUUID(),
      bindingIdHash: hash,
      sessionKind: session?.kind === 'jwt' ? 'jwt' : 'firebase',
      sessionAuthTime: authTime,
      tokenVersion: Number(session?.tokenVersion) || 0,
      leaseExpiresAt: now + leaseMs(),
      createdAt: existing && !moved ? existing.createdAt : nowIso,
      updatedAt: nowIso,
    });
    return { status: 'registered', moved };
  });
  if (result.status === 'registered') await enforceDeviceCap(db, uid).catch(() => {});
  return result;
};

// Idempotent. Fences the bindingId first, then deletes every registration
// still carrying it (each delete re-checks inside a transaction, so a token
// re-registered under another binding is untouched). Returns # removed.
const revokeBinding = async (db, bindingId, { now = Date.now() } = {}) => {
  const hash = bindingHash(bindingId);
  const revocationRef = db.collection(REVOCATIONS).doc(hash);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(revocationRef);
    if (!snap.exists)
      tx.set(revocationRef, {
        createdAt: new Date(now).toISOString(),
        expireAt: now + REVOCATION_TTL_MS,
      });
  });
  const matches = await db
    .collection(COLLECTION)
    .where('bindingIdHash', '==', hash)
    .limit(MAX_DEVICES_PER_USER)
    .get();
  let removed = 0;
  for (const doc of matches.docs) {
    const ref = db.collection(COLLECTION).doc(doc.id);
    const deleted = await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (!current.exists || current.data().bindingIdHash !== hash) return false;
      tx.delete(ref);
      return true;
    });
    if (deleted) removed++;
  }
  return removed;
};

// Authenticated, owner-scoped removal by token (kept for API completeness;
// the app uses revokeBinding). A no-op that looks like success for a token
// the caller doesn't own.
const unregisterDevice = async (db, uid, token) => {
  const ref = db.collection(COLLECTION).doc(tokenDocId(token));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().uid !== uid) return { removed: false };
    tx.delete(ref);
    return { removed: true };
  });
};

// Used by delivery for confirmed-permanent failures only. Deletes the doc
// only if it still holds the exact registration the send was made for.
const removeDeviceIfUnchanged = async (db, docId, { uid, registrationId }) => {
  const ref = db.collection(COLLECTION).doc(docId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const data = snap.data();
    if (data.uid !== uid || data.registrationId !== registrationId) return false;
    tx.delete(ref);
    return true;
  });
};

const listDevicesForUser = async (db, uid) => {
  const snap = await db
    .collection(COLLECTION)
    .where('uid', '==', uid)
    .limit(MAX_DEVICES_PER_USER * 2)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

const enforceDeviceCap = async (db, uid) => {
  const devices = await listDevicesForUser(db, uid);
  if (devices.length <= MAX_DEVICES_PER_USER) return 0;
  const doomed = devices
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(MAX_DEVICES_PER_USER);
  await Promise.all(doomed.map((d) => removeDeviceIfUnchanged(db, d.id, d)));
  return doomed.length;
};

const toSeconds = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
};

// Pure delivery-eligibility decision for one binding. `userData` is the
// users/{uid} doc (null if missing); `authUser` is the Firebase Auth record
// ({ disabled, tokensValidAfterTime }) or null if unknown. Returns null when
// deliverable, otherwise a short reason code.
const bindingIneligibilityReason = (binding, { uid, userData, authUser, now = Date.now() }) => {
  if (!binding || binding.uid !== uid || typeof binding.token !== 'string') return 'not-owner';
  if (!(Number(binding.leaseExpiresAt) > now)) return 'lease-expired';
  if (!userData) return 'account-missing';
  if (userData.teamMembershipStatus === 'suspended') return 'account-suspended';
  const sessionStart = Number(binding.sessionAuthTime) || 0;
  // Password change bumps tokenValidAfter (auth middleware rejects older tokens).
  if (userData.tokenValidAfter && Number(userData.tokenValidAfter) > sessionStart)
    return 'session-revoked';
  if (authUser) {
    if (authUser.disabled) return 'account-disabled';
    // revokeRefreshTokens (web Sign Out, password change, console) ends every
    // Firebase session that started before this instant.
    if (toSeconds(authUser.tokensValidAfterTime) > sessionStart) return 'session-revoked';
  }
  if (
    binding.sessionKind === 'jwt' &&
    (Number(userData.tokenVersion) || 0) !== (Number(binding.tokenVersion) || 0)
  ) {
    return 'session-revoked';
  }
  return null;
};

// Bounded maintenance pass (worker calls it periodically).
const sweepExpired = async (db, { now = Date.now() } = {}) => {
  const stats = { revocations: 0, devices: 0 };
  const tombstones = await db
    .collection(REVOCATIONS)
    .where('expireAt', '<=', now)
    .limit(SWEEP_LIMIT)
    .get();
  for (const doc of tombstones.docs) {
    await db.collection(REVOCATIONS).doc(doc.id).delete();
    stats.revocations++;
  }
  const stale = await db
    .collection(COLLECTION)
    .where('leaseExpiresAt', '<=', now - LEASE_GRACE_MS)
    .limit(SWEEP_LIMIT)
    .get();
  for (const doc of stale.docs) {
    const data = doc.data();
    const ref = db.collection(COLLECTION).doc(doc.id);
    const removed = await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (!current.exists || current.data().registrationId !== data.registrationId) return false;
      if (!(Number(current.data().leaseExpiresAt) <= now - LEASE_GRACE_MS)) return false;
      tx.delete(ref);
      return true;
    });
    if (removed) stats.devices++;
  }
  return stats;
};

module.exports = {
  COLLECTION,
  REVOCATIONS,
  MAX_DEVICES_PER_USER,
  MAX_TOKEN_LENGTH,
  SUPPORTED_PLATFORMS,
  LEASE_MS,
  leaseMs,
  bindingTag,
  LEASE_GRACE_MS,
  REVOCATION_TTL_MS,
  tokenDocId,
  bindingHash,
  isValidExpoToken,
  isSupportedPlatform,
  isValidBindingId,
  registerDevice,
  revokeBinding,
  unregisterDevice,
  removeDeviceIfUnchanged,
  listDevicesForUser,
  enforceDeviceCap,
  bindingIneligibilityReason,
  sweepExpired,
};
