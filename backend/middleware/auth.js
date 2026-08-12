const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getAuth, getFirestore, FieldValue } = require('../config/firebase');
const { isAtLeastTier, getTier } = require('../config/tiers');
const { normalizeApiKeyScopes } = require('../config/apiScopes');

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
    try {
      decoded = await getAuth().verifyIdToken(token);
    } catch (firebaseErr) {
      // Try custom JWT fallback
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const db = getFirestore();
        const userDoc = await db.collection('users').doc(decoded.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};

        // tokenVersion is bumped on logout/password-change to revoke all
        // previously issued custom JWTs (they're otherwise stateless for 7 days).
        if ((decoded.tokenVersion || 0) !== (userData.tokenVersion || 0)) {
          return res.status(401).json({ success: false, error: 'Session revoked, please log in again', code: 'TOKEN_REVOKED' });
        }

        req.user = {
          uid: decoded.uid,
          email: decoded.email,
          tier: userData.tier || 'starter',
          displayName: userData.displayName || '',
          ...userData,
        };
        return next();
      } catch (jwtErr) {
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
    req.user = { uid: decoded.uid, email: decoded.email, tier: userData.tier || 'starter', ...userData };
  } catch {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const db = getFirestore();
      const userDoc = await db.collection('users').doc(decoded.uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      if ((decoded.tokenVersion || 0) !== (userData.tokenVersion || 0)) {
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
  requireApiAccess,
  requireApiScope,
  trackApiUsage,
};
