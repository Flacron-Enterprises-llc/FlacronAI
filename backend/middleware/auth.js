const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getAuth, getFirestore, FieldValue } = require('../config/firebase');
const { isAtLeastTier, getTier } = require('../config/tiers');
const { normalizeApiKeyScopes } = require('../config/apiScopes');
const { hasCapability } = require('../utils/orgRoles');

// Distinguishes "this token is genuinely bad" (expired/malformed/wrong
// audience) from "we couldn't even check it because of a network/infra
// hiccup talking to Firebase" (e.g. a dropped request while fetching
// Google's signing certs). The Admin SDK surfaces both through the same
// verifyIdToken() rejection -- only the latter should ever be treated as
// retryable rather than a login failure. This is the recurring root cause
// behind the intermittent "Account data unavailable" bug (see PROGRESS.md
// 2026-08-02 / 2026-08-12): a long-running process's token verification can
// get stuck failing for reasons unrelated to the token itself.
const TRANSIENT_AUTH_ERROR_CODES = new Set([
  'auth/internal-error',
  'auth/network-request-failed',
  'auth/insufficient-permission',
  'auth/app-not-authorized',
  // Raw firebase-admin SDK errors (not auth/*-prefixed) thrown by the
  // underlying HttpClient when it can't reach Google's cert/JWKS endpoint
  // to verify a token's signature -- e.g. a timeout ("Error while making
  // request: timeout of Xms exceeded.") never surfaces an auth/* code or
  // a recognizable ENOTFOUND/ETIMEDOUT/etc string, so it fell through the
  // checks below and was misclassified as an invalid token. This was the
  // actual root cause behind the "Account data unavailable" bug recurring
  // after the 2026-08-12 and 2026-08-15 fixes.
  'app/network-error',
  'app/network-timeout',
]);
const isTransientAuthError = (err) => {
  if (!err) return false;
  if (TRANSIENT_AUTH_ERROR_CODES.has(err.code)) return true;
  return /fetch failed|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|network error|socket hang up|error while making request|timeout of \d+ms exceeded/i.test(String(err.message || ''));
};

// A "transient" classification above assumes a one-off blip that a retry
// will clear -- but a live repro (2026-08-20) proved that's not always true:
// once a long-running process's verifyIdToken() path gets stuck (confirmed
// by hand -- a brand-new one-shot script verified the exact same real token
// instantly, while the already-running server process rejected it as
// transient on every single attempt, with no recovery over time or across
// requests), EVERY retry, on EVERY request, fails identically forever, since
// what's broken is a process-wide resource, not anything about one request.
// No amount of client-side or per-request retrying can ever fix that -- the
// process itself needs to be restarted. Render already restarts the dyno
// automatically on a failing healthCheckPath (render.yaml) -- this counter
// feeds that: server.js's /health handler reports unhealthy once enough
// consecutive failures pile up, so Render's existing auto-restart actually
// catches this instead of the service staying "healthy" forever while every
// real login silently fails (exactly what happened 2026-08-02, requiring a
// human to notice and manually restart).
const WEDGED_AUTH_FAILURE_THRESHOLD = 5;
let consecutiveTransientAuthFailures = 0;
const noteAuthVerificationOutcome = (wasTransientFailure) => {
  consecutiveTransientAuthFailures = wasTransientFailure ? consecutiveTransientAuthFailures + 1 : 0;
};
const isAuthVerificationWedged = () => consecutiveTransientAuthFailures >= WEDGED_AUTH_FAILURE_THRESHOLD;

// Phase 14 (Team Roles Expansion & Member Profiles): a suspended team member
// must lose access immediately, not just on their next login. `teams.js`
// mirrors an enterpriseTeams member's status onto their OWN `users/{uid}`
// doc's `teamMembershipStatus` field on every suspend/reactivate/remove, so
// this check is free -- it reads data every authenticated request already
// fetches (`db.collection('users').doc(uid).get()`), no extra Firestore read.
// This is the "live per-request check" half of suspension; the other half
// (tokenVersion bump + Firebase revokeRefreshTokens, both done in teams.js at
// suspend time) forces any already-issued token to fail before it would even
// reach this check on its own.
const isTeamMembershipSuspended = (userData) => userData?.teamMembershipStatus === 'suspended';

// Verify Firebase ID token or custom JWT
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided', code: 'NO_TOKEN' });
    }

    const token = authHeader.split(' ')[1];

    // Try Firebase ID token first
    let decoded;
    let firebaseErr = null;
    try {
      decoded = await getAuth().verifyIdToken(token);
      noteAuthVerificationOutcome(false);
    } catch (err) {
      firebaseErr = err;
      // A transient blip verifying against Firebase can look identical to an
      // invalid token on a single attempt -- retry immediately once before
      // concluding anything. This alone resolves most one-off hiccups with
      // zero user-visible impact.
      if (isTransientAuthError(err)) {
        try {
          decoded = await getAuth().verifyIdToken(token);
          firebaseErr = null;
          noteAuthVerificationOutcome(false);
        } catch (retryErr) {
          firebaseErr = retryErr;
        }
      }
    }

    if (firebaseErr) {
      // Try custom JWT fallback
      try {
        const decodedJwt = jwt.verify(token, process.env.JWT_SECRET);
        const db = getFirestore();
        const userDoc = await db.collection('users').doc(decodedJwt.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};

        // tokenVersion is bumped on logout/password-change to revoke all
        // previously issued custom JWTs (they're otherwise stateless for 7 days).
        if ((decodedJwt.tokenVersion || 0) !== (userData.tokenVersion || 0)) {
          return res.status(401).json({ success: false, error: 'Session revoked, please log in again', code: 'TOKEN_REVOKED' });
        }
        if (isTeamMembershipSuspended(userData)) {
          return res.status(403).json({ success: false, error: 'Your team access has been suspended', code: 'TEAM_ACCESS_SUSPENDED' });
        }

        req.user = {
          uid: decodedJwt.uid,
          email: decodedJwt.email,
          tier: userData.tier || 'starter',
          displayName: userData.displayName || '',
          ...userData,
        };
        return next();
      } catch (jwtErr) {
        // Neither a valid Firebase ID token nor a valid custom JWT. If the
        // Firebase attempt failed (twice) for what looks like an infra reason
        // rather than "this token is bad", tell the client to retry instead
        // of forcing a re-login -- the existing 503/network-error retry +
        // background auto-recovery (AuthContext.jsx, api.js) already handles
        // exactly this, it just never used to see this failure as retryable.
        if (isTransientAuthError(firebaseErr)) {
          noteAuthVerificationOutcome(true);
          console.error('Auth middleware: token verification failed twice with a transient-looking error, not treating as an invalid token:', firebaseErr.message);
          return res.status(503).json({ success: false, error: 'Temporarily unable to verify your session, please retry', code: 'AUTH_VERIFY_UNAVAILABLE' });
        }
        return res.status(401).json({ success: false, error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
      }
    }

    // Token itself is verified and valid — a failure past this point is an
    // infrastructure/transient issue, not an auth problem, so it must not be
    // reported as an invalid token (that sent clients into a dead-end retry).
    try {
      const db = getFirestore();
      const userDoc = await db.collection('users').doc(decoded.uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};

      if (isTeamMembershipSuspended(userData)) {
        return res.status(403).json({ success: false, error: 'Your team access has been suspended', code: 'TEAM_ACCESS_SUSPENDED' });
      }

      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        tier: userData.tier || 'starter',
        displayName: userData.displayName || decoded.name || '',
        ...userData,
      };
      return next();
    } catch (lookupErr) {
      console.error('Auth middleware profile lookup error:', lookupErr);
      return res.status(503).json({ success: false, error: 'Temporarily unable to load account data, please retry', code: 'PROFILE_LOOKUP_FAILED' });
    }
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ success: false, error: 'Authentication error', code: 'AUTH_ERROR' });
  }
};

// Verify API Key from X-API-Key header
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({ success: false, error: 'No API key provided', code: 'NO_API_KEY' });
    }

    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
    const db = getFirestore();
    const keySnapshot = await db.collection('apiKeys')
      .where('keyHash', '==', hashedKey)
      .where('active', '==', true)
      .limit(1)
      .get();

    if (keySnapshot.empty) {
      return res.status(401).json({ success: false, error: 'Invalid API key', code: 'INVALID_API_KEY' });
    }

    const keyDoc = keySnapshot.docs[0];
    const keyData = keyDoc.data();

    const userDoc = await db.collection('users').doc(keyData.userId).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    if (isTeamMembershipSuspended(userData)) {
      return res.status(403).json({ success: false, error: 'Your team access has been suspended', code: 'TEAM_ACCESS_SUSPENDED' });
    }

    req.user = {
      uid: keyData.userId,
      email: userData.email || '',
      tier: userData.tier || 'starter',
      displayName: userData.displayName || '',
      ...userData,
    };
    req.apiKey = {
      id: keyDoc.id,
      ...keyData,
      scopes: normalizeApiKeyScopes(keyData.scopes, { legacy: true }),
    };

    return next();
  } catch (err) {
    console.error('API key auth error:', err);
    return res.status(500).json({ success: false, error: 'API key authentication error', code: 'AUTH_ERROR' });
  }
};

// Try token first, then API key
const authenticateAny = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateToken(req, res, next);
  } else if (apiKey) {
    return authenticateApiKey(req, res, next);
  } else {
    return res.status(401).json({ success: false, error: 'Authentication required', code: 'NO_AUTH' });
  }
};

// Optional auth — continues even without token
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = await getAuth().verifyIdToken(token);
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    req.user = isTeamMembershipSuspended(userData)
      ? null
      : { uid: decoded.uid, email: decoded.email, tier: userData.tier || 'starter', ...userData };
  } catch {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const db = getFirestore();
      const userDoc = await db.collection('users').doc(decoded.uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      if ((decoded.tokenVersion || 0) !== (userData.tokenVersion || 0) || isTeamMembershipSuspended(userData)) {
        req.user = null;
      } else {
        req.user = { uid: decoded.uid, email: decoded.email, tier: userData.tier || 'starter', ...userData };
      }
    } catch {
      req.user = null;
    }
  }
  return next();
};

// Require minimum tier
const requireTier = (tierName) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required', code: 'NO_AUTH' });
    }
    if (!isAtLeastTier(req.user.tier, tierName)) {
      return res.status(403).json({
        success: false,
        error: `This feature requires ${getTier(tierName).name} tier or higher`,
        code: 'INSUFFICIENT_TIER',
        requiredTier: tierName,
        currentTier: req.user.tier,
      });
    }
    return next();
  };
};

// Phase 14: gate report actions (generate/approve/export) by the caller's
// team-role capability. A solo account (no `teamOwnerId`) is unaffected --
// they're the implicit "owner" of their own reports either way. Only
// enterprise team members who accepted an invite with a role that lacks the
// capability (e.g. Inspector cannot approve/export, Reviewer cannot
// generate) are actually restricted by this.
const requireTeamCapability = (capability) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required', code: 'NO_AUTH' });
  }
  if (!hasCapability(req.user, capability)) {
    return res.status(403).json({
      success: false,
      error: `Your team role does not have permission to do this (${capability}).`,
      code: 'TEAM_PERMISSION_DENIED',
      capability,
    });
  }
  return next();
};

// Require API access (agency+)
const requireApiAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required', code: 'NO_AUTH' });
  }
  const tier = getTier(req.user.tier);
  if (!tier.apiAccess) {
    return res.status(403).json({
      success: false,
      error: 'API access requires Agency or Enterprise tier',
      code: 'API_ACCESS_DENIED',
    });
  }
  return next();
};

// Browser bearer sessions continue through normal RBAC. API-key requests must
// carry the explicit permission required by the endpoint.
const requireApiScope = (scope) => (req, res, next) => {
  if (!req.apiKey) return next();
  const grantedScopes = normalizeApiKeyScopes(req.apiKey.scopes);
  if (!grantedScopes.includes(scope)) {
    return res.status(403).json({
      success: false,
      error: `API key requires the ${scope} scope`,
      code: 'API_SCOPE_REQUIRED',
      requiredScope: scope,
      grantedScopes,
    });
  }
  return next();
};

// Track API key usage after response
const trackApiUsage = (req, res, next) => {
  const originalEnd = res.end.bind(res);
  res.end = function (...args) {
    if (req.apiKey) {
      const db = getFirestore();
      const timestamp = new Date().toISOString();
      const usageRef = db.collection('apiUsage').doc();
      const keyRef = db.collection('apiKeys').doc(req.apiKey.id);
      const batch = db.batch();

      batch.set(usageRef, {
        keyId: req.apiKey.id,
        userId: req.user?.uid,
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        timestamp,
        ip: req.ip,
      });
      batch.update(keyRef, {
        usageCount: FieldValue.increment(1),
        lastUsedAt: timestamp,
      });
      batch.commit().catch(err => {
        console.error('API usage tracking error:', err.message);
      });
    }
    return originalEnd(...args);
  };
  next();
};

module.exports = {
  authenticateToken,
  authenticateApiKey,
  authenticateAny,
  optionalAuth,
  requireTier,
  requireTeamCapability,
  requireApiAccess,
  requireApiScope,
  trackApiUsage,
  // Exported for direct unit testing of the transient-vs-invalid classification.
  isTransientAuthError,
  isTeamMembershipSuspended,
  // Exported so server.js's /health check can detect a wedged token-verifier
  // and let Render's healthCheckPath-based auto-restart recover it.
  isAuthVerificationWedged,
};
