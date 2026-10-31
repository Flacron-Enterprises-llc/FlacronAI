// QA federation: production identity -> isolated staging session.
//
// Lets the QA APK sign in with an existing FlacronAI website account while every
// profile, report, file, billing record, notification and job stays in staging.
// Enabled ONLY on a backend whose own Firebase project differs from the identity
// project (the staging API); the production API can never turn this on.
//
// Flow: the app signs in to the PRODUCTION Firebase project (client SDK, public web
// config), sends that ID token here, and gets back a STAGING custom token for a
// staging "shadow" user (same uid, no password, custom claim `federated: true`).
//
// - The production ID token is verified by firebase-admin (RS256 signature against
//   Google's keys, issuer, audience = identity project, expiry, issued-at, auth_time)
//   using an app that holds ONLY the project id: this backend has no production
//   credential and cannot read or change production identities or data.
// - Production MFA is the app's own TOTP. It is checked BY PRODUCTION: this service
//   calls the production API with the user's own ID token (`GET /auth/mfa/status`,
//   `POST /auth/mfa/verify`, both MFA-exempt there). The same call also enforces
//   production's revocation (tokenValidAfter, deletion tombstone). Any failure to
//   reach production fails closed.
// - A satisfied MFA check is bound to the production sign-in (`auth_time`) for 12h,
//   mirroring production's own assertion binding, so hourly re-exchanges of the same
//   sign-in don't re-prompt; any new production sign-in needs the code again.
// - Staging sessions carry `fedAt`; middleware rejects them FEDERATED_SESSION_MAX_AGE
//   (<= 1h) after the exchange, so a production password change, sign-out-everywhere,
//   disable or deletion ends QA access within that window (the app re-exchanges
//   while production still accepts the session).
// - The shadow gets no profile here: GET /users/profile creates it with the normal
//   staging defaults, so no production tier, role or admin right is ever copied.
const axios = require('axios');
const admin = require('firebase-admin');

const IDENTITY_APP_NAME = 'prod-identity';
const DEFAULT_SESSION_MAX_AGE_SECONDS = 3600;
const MIN_SESSION_MAX_AGE_SECONDS = 300;
const MFA_BINDING_TTL_SECONDS = 12 * 60 * 60;
const CLOCK_SKEW_SECONDS = 60;
const PROD_API_TIMEOUT_MS = 8000;
const ALLOWED_PROVIDERS = new Set(['password', 'google.com']);
const SESSIONS = 'federatedSessions';

const MANAGED_BY_PRODUCTION_BODY = {
  success: false,
  error: 'This QA app signs in with your FlacronAI website account. Change your password or two-factor settings on flacronai.com.',
  code: 'MANAGED_BY_PRODUCTION_ACCOUNT',
};

const getFederationConfig = () => {
  const projectId = (process.env.PROD_IDENTITY_PROJECT_ID || '').trim();
  const apiBase = (process.env.PROD_IDENTITY_API_BASE_URL || '').trim().replace(/\/+$/, '');
  const ownProject = (process.env.FIREBASE_PROJECT_ID || '').trim();
  const requested = Number(process.env.FEDERATED_SESSION_MAX_AGE_SECONDS) || DEFAULT_SESSION_MAX_AGE_SECONDS;
  const enabled =
    process.env.FEDERATED_PROD_LOGIN_ENABLED === 'true' &&
    !!projectId &&
    /^https:\/\//.test(apiBase) &&
    !!ownProject &&
    ownProject !== projectId;
  return {
    enabled,
    projectId,
    apiBase,
    sessionMaxAge: Math.min(Math.max(requested, MIN_SESSION_MAX_AGE_SECONDS), DEFAULT_SESSION_MAX_AGE_SECONDS),
  };
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

// Verification-only admin app for the identity project (no credential).
const verifyIdentityToken = async (idToken, projectId) => {
  const app =
    admin.apps.find((a) => a && a.name === IDENTITY_APP_NAME) ||
    admin.initializeApp({ projectId }, IDENTITY_APP_NAME);
  return app.auth().verifyIdToken(idToken);
};

const callProductionApi = async (apiBase, path, idToken, { method = 'GET', body } = {}) => {
  const res = await axios({
    method,
    url: `${apiBase}${path}`,
    data: body,
    headers: { Authorization: `Bearer ${idToken}` },
    timeout: PROD_API_TIMEOUT_MS,
    validateStatus: () => true,
  });
  return { status: res.status, data: res.data || {} };
};

// Reason a decoded STAGING token from an exchange may not be used, or null.
const federatedSessionProblem = (decoded, now = nowSeconds()) => {
  const cfg = getFederationConfig();
  if (!cfg.enabled) return 'FEDERATED_LOGIN_DISABLED';
  if (decoded.firebase?.sign_in_provider !== 'custom') return 'FEDERATED_SESSION_INVALID';
  const fedAt = decoded.fedAt;
  if (typeof fedAt !== 'number' || !Number.isFinite(fedAt)) return 'FEDERATED_SESSION_INVALID';
  if (fedAt > now + CLOCK_SKEW_SECONDS || now - fedAt > cfg.sessionMaxAge) return 'FEDERATED_SESSION_EXPIRED';
  if (typeof decoded.prodAuthTime !== 'number') return 'FEDERATED_SESSION_INVALID';
  return null;
};

const rejectIfFederated = (req, res) => {
  if (!req.sessionContext?.federated) return false;
  res.status(409).json(MANAGED_BY_PRODUCTION_BODY);
  return true;
};

// Route guard: password / MFA management belongs to the production account.
const blockFederatedSession = (req, res, next) => {
  if (rejectIfFederated(req, res)) return undefined;
  return next();
};

// True when a staging account is a federation shadow (no staging password may exist).
const isFederatedStagingEmail = async (stagingAuth, email) => {
  try {
    const user = await stagingAuth.getUserByEmail(email);
    return user.customClaims?.federated === true;
  } catch {
    return false;
  }
};

const fail = (status, code, error) => ({ status, body: { success: false, code, error } });

const hasMfaBinding = (sessionData, authTime, now) => {
  const verifiedAt = sessionData?.mfa?.[String(authTime)];
  return typeof verifiedAt === 'number' && now - verifiedAt <= MFA_BINDING_TTL_SECONDS;
};

const recordMfaBinding = async (db, uid, authTime, now, previous) => {
  const kept = {};
  for (const [k, v] of Object.entries(previous?.mfa || {})) {
    if (typeof v === 'number' && now - v <= MFA_BINDING_TTL_SECONDS) kept[k] = v;
  }
  kept[String(authTime)] = now;
  await db.collection(SESSIONS).doc(uid).set({ mfa: kept, updatedAt: new Date(now * 1000).toISOString() });
};

// Finds or creates the staging shadow for a verified production identity.
const ensureShadowUser = async (stagingAuth, decoded) => {
  const { uid, email } = decoded;
  let user = null;
  try {
    user = await stagingAuth.getUser(uid);
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }
  if (user) {
    if (user.customClaims?.federated !== true) return fail(409, 'STAGING_UID_CONFLICT', 'This account cannot be used in the QA app.');
    if (user.disabled) return fail(403, 'ACCOUNT_DISABLED', 'This QA account has been disabled.');
    if (user.email !== email) {
      try {
        await stagingAuth.updateUser(uid, { email, emailVerified: true });
      } catch (err) {
        if (err?.code === 'auth/email-already-exists') return fail(409, 'STAGING_EMAIL_IN_USE', 'A separate QA test account already uses this email. Ask the QA admin to remove it.');
        throw err;
      }
    }
    return null;
  }
  try {
    await stagingAuth.getUserByEmail(email);
    return fail(409, 'STAGING_EMAIL_IN_USE', 'A separate QA test account already uses this email. Ask the QA admin to remove it.');
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }
  await stagingAuth.createUser({ uid, email, emailVerified: true, ...(decoded.name ? { displayName: decoded.name } : {}) });
  await stagingAuth.setCustomUserClaims(uid, { federated: true });
  return null;
};

/**
 * Exchanges a production ID token (+ optional MFA code) for a staging custom token.
 * Returns `{ status, body }`; never throws for expected outcomes. `deps` is for tests.
 */
const exchangeForStagingSession = async ({ idToken, mfaCode }, deps) => {
  const cfg = getFederationConfig();
  if (!cfg.enabled) return fail(404, 'FEDERATED_LOGIN_DISABLED', 'Sign-in with a FlacronAI website account is not available here.');
  const verify = deps.verifyIdentityToken || verifyIdentityToken;
  const prodApi = deps.callProductionApi || callProductionApi;
  const { db, stagingAuth } = deps;

  let decoded;
  try {
    decoded = await verify(idToken, cfg.projectId);
  } catch {
    return fail(401, 'INVALID_IDENTITY_TOKEN', 'Your sign-in could not be verified. Please sign in again.');
  }
  const issuer = `https://securetoken.google.com/${cfg.projectId}`;
  if (decoded.aud !== cfg.projectId || decoded.iss !== issuer || !decoded.uid) {
    return fail(401, 'INVALID_IDENTITY_TOKEN', 'Your sign-in could not be verified. Please sign in again.');
  }
  const provider = decoded.firebase?.sign_in_provider;
  if (!ALLOWED_PROVIDERS.has(provider)) return fail(403, 'IDENTITY_PROVIDER_NOT_ALLOWED', 'Sign in with your email and password or with Google.');
  if (!decoded.email || decoded.email_verified !== true) {
    return fail(403, 'IDENTITY_EMAIL_NOT_VERIFIED', 'Verify your email address on flacronai.com first, then sign in here.');
  }

  // Production decides MFA and revocation for its own identity.
  let status;
  try {
    status = await prodApi(cfg.apiBase, '/auth/mfa/status', idToken);
  } catch {
    return fail(503, 'IDENTITY_UNAVAILABLE', 'FlacronAI sign-in is temporarily unavailable. Please try again.');
  }
  if (status.status === 401 || status.status === 403) {
    return fail(401, 'IDENTITY_SESSION_REJECTED', 'Your FlacronAI session is no longer valid. Please sign in again.');
  }
  if (status.status !== 200 || status.data.success !== true) {
    return fail(503, 'IDENTITY_UNAVAILABLE', 'FlacronAI sign-in is temporarily unavailable. Please try again.');
  }

  const now = nowSeconds();
  const sessionRef = db.collection(SESSIONS).doc(decoded.uid);
  let mfaVerified = false;
  if (status.data.mfaEnabled === true) {
    const sessionSnap = await sessionRef.get();
    const sessionData = sessionSnap.exists ? sessionSnap.data() : null;
    if (hasMfaBinding(sessionData, decoded.auth_time, now)) {
      mfaVerified = true;
    } else {
      if (!mfaCode) return fail(401, 'FEDERATED_MFA_REQUIRED', 'Enter the code from your authenticator app.');
      let result;
      try {
        result = await prodApi(cfg.apiBase, '/auth/mfa/verify', idToken, { method: 'POST', body: { code: mfaCode } });
      } catch {
        return fail(503, 'IDENTITY_UNAVAILABLE', 'FlacronAI sign-in is temporarily unavailable. Please try again.');
      }
      if (result.status === 401 && result.data.code === 'INVALID_MFA_CODE') return fail(401, 'INVALID_MFA_CODE', 'Invalid authentication code.');
      if (result.status === 429) return fail(429, 'MFA_RATE_LIMITED', 'Too many attempts. Wait a few minutes and try again.');
      if (result.status === 401 || result.status === 403) {
        return fail(401, 'IDENTITY_SESSION_REJECTED', 'Your FlacronAI session is no longer valid. Please sign in again.');
      }
      if (result.status !== 200 || result.data.success !== true) {
        return fail(503, 'IDENTITY_UNAVAILABLE', 'FlacronAI sign-in is temporarily unavailable. Please try again.');
      }
      if (result.data.mfaEnabled !== false) {
        await recordMfaBinding(db, decoded.uid, decoded.auth_time, now, sessionData);
        mfaVerified = true;
      }
    }
  }

  if ((await db.collection('deletedAccounts').doc(decoded.uid).get()).exists) {
    return fail(401, 'ACCOUNT_DELETED', 'This QA account was deleted.');
  }

  const shadowProblem = await ensureShadowUser(stagingAuth, decoded);
  if (shadowProblem) return shadowProblem;

  const customToken = await stagingAuth.createCustomToken(decoded.uid, {
    federated: true,
    fedAt: now,
    prodAuthTime: decoded.auth_time,
    fedProvider: provider,
  });
  return {
    status: 200,
    body: { success: true, customToken, expiresIn: cfg.sessionMaxAge, mfaVerified },
    audit: { uid: decoded.uid, email: decoded.email, provider, mfaVerified },
  };
};

module.exports = {
  MANAGED_BY_PRODUCTION_BODY,
  MFA_BINDING_TTL_SECONDS,
  getFederationConfig,
  federatedSessionProblem,
  rejectIfFederated,
  blockFederatedSession,
  isFederatedStagingEmail,
  exchangeForStagingSession,
};
