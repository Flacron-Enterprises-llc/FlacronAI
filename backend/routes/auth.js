const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { getAuth, getFirestore } = require('../config/firebase');
const { authenticateToken } = require('../middleware/auth');

const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { body, validationResult } = require('express-validator');
const { recordAuditLog } = require('../services/auditLogService');
const { sendNewDeviceLoginAlert } = require('../services/emailService');

// A short-lived MFA challenge token is signed with a DIFFERENT secret than
// real session JWTs, so it can never be mistaken for (or replayed as) a full
// login token by the normal authenticateToken middleware.
const MFA_CHALLENGE_SECRET = `${process.env.JWT_SECRET}::mfa-challenge`;

// Brute-force guard for 6-digit TOTP codes — much tighter than authLimiter
// since a code only has 1,000,000 possibilities.
const mfaLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many verification attempts, please try again later', code: 'MFA_RATE_LIMITED' },
  keyGenerator: (req) => req.user?.uid || req.body?.mfaToken || req.ip,
});

// Compares this login's IP/device against the last-known one on the user doc.
// Sends an alert (and records the audit event) only when there IS a prior
// login to compare against — the very first login on a brand-new account
// is never "suspicious".
const notifyIfNewDevice = async (uid, userProfile, req) => {
  const ip = req.ip;
  const userAgent = req.headers['user-agent'] || '';
  const last = userProfile.lastLogin;
  const isNewDevice = last && (last.ip !== ip || last.userAgent !== userAgent);

  const db = getFirestore();
  await db.collection('users').doc(uid).update({
    lastLogin: { ip, userAgent, at: new Date().toISOString() },
  });

  if (isNewDevice) {
    recordAuditLog({ actorUid: uid, actorEmail: userProfile.email, action: 'suspicious_login_new_device', meta: { previousIp: last.ip }, req });
    await sendNewDeviceLoginAlert(userProfile.email, userProfile.displayName, { ip, userAgent, at: new Date().toISOString() });
  }
};

// Tighter brute-force guard for credential-related endpoints — the global
// 100/15min limiter (server.js) is shared across the whole API and too loose
// to stop password-guessing on its own.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts, please try again later', code: 'AUTH_RATE_LIMITED' },
});

// POST /api/auth/register
router.post('/register', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 12 }),
  body('displayName').trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.mapped() });
  }

  const { email, password, displayName } = req.body;

  try {
    const auth = getAuth();
    const db = getFirestore();

    // Create Firebase user
    const userRecord = await auth.createUser({ email, password, displayName });

    // Create Firestore user doc
    const userProfile = {
      uid: userRecord.uid,
      email,
      displayName,
      tier: 'starter',
      reportsGenerated: 0,
      reportsThisMonth: 0,
      monthResetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phone: '',
      company: '',
      address: '',
      logoUrl: null,
      notificationsEnabled: true,
      tokenVersion: 0,
    };

    await db.collection('users').doc(userRecord.uid).set(userProfile);
    recordAuditLog({ actorUid: userRecord.uid, actorEmail: email, action: 'register', req });

    // Create custom JWT (tokenVersion lets logout/password-change revoke it early)
    const token = jwt.sign({ uid: userRecord.uid, email, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: userProfile,
    });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      return res.status(409).json({ success: false, error: 'Email already registered', code: 'EMAIL_EXISTS' });
    }
    console.error('Register error:', err);
    return res.status(500).json({ success: false, error: 'Registration failed', code: 'REGISTER_ERROR' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.mapped() });
  }

  const { email, password } = req.body;

  try {
    // Firebase Admin doesn't support password verification directly — use REST API
    const axios = require('axios');
    const firebaseApiKey = process.env.FIREBASE_API_KEY;

    if (!firebaseApiKey) {
      return res.status(500).json({ success: false, error: 'Firebase API key not configured', code: 'CONFIG_ERROR' });
    }

    const loginRes = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
      { email, password, returnSecureToken: true }
    );

    const { localId: uid } = loginRes.data;
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : { uid, email, tier: 'starter' };

    if (userProfile.mfaEnabled) {
      // Password was correct, but a second factor is required. Deliberately
      // discard the real Firebase idToken — it must never reach the client
      // before MFA passes, or it would be a fully usable credential on its own.
      const mfaToken = jwt.sign({ uid, pending: true }, MFA_CHALLENGE_SECRET, { expiresIn: '5m' });
      recordAuditLog({ actorUid: uid, actorEmail: email, action: 'login_mfa_challenge', req });
      return res.json({ success: true, mfaRequired: true, mfaToken });
    }

    recordAuditLog({ actorUid: uid, actorEmail: email, action: 'login_success', req });
    notifyIfNewDevice(uid, userProfile, req).catch((err) => console.error('New-device login alert error:', err));

    return res.json({
      success: true,
      token: loginRes.data.idToken,
      user: userProfile,
    });
  } catch (err) {
    const firebaseError = err.response?.data?.error?.message;
    if (firebaseError === 'INVALID_PASSWORD' || firebaseError === 'EMAIL_NOT_FOUND' || firebaseError === 'INVALID_LOGIN_CREDENTIALS') {
      recordAuditLog({ actorEmail: email, action: 'login_failed', meta: { reason: firebaseError }, req });
      return res.status(401).json({ success: false, error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    }
    console.error('Login error:', err.message);
    return res.status(500).json({ success: false, error: 'Login failed', code: 'LOGIN_ERROR' });
  }
});

// POST /api/auth/mfa/login-verify — completes a login that returned mfaRequired.
// No authenticateToken here (there's no session yet); the short-lived, separately
// signed mfaToken is what proves the password step already succeeded.
router.post('/mfa/login-verify', mfaLimiter, [
  body('mfaToken').notEmpty(),
  body('code').isLength({ min: 6, max: 8 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });

  let decoded;
  try {
    decoded = jwt.verify(req.body.mfaToken, MFA_CHALLENGE_SECRET);
  } catch {
    return res.status(401).json({ success: false, error: 'MFA session expired, please log in again', code: 'MFA_SESSION_EXPIRED' });
  }

  try {
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    if (!userDoc.exists) {
      return res.status(401).json({ success: false, error: 'Account not found', code: 'INVALID_MFA_TOKEN' });
    }
    const userProfile = userDoc.data();
    if (!userProfile.mfaEnabled || !userProfile.mfaSecret) {
      return res.status(400).json({ success: false, error: 'MFA is not enabled for this account', code: 'MFA_NOT_ENABLED' });
    }

    const verified = speakeasy.totp.verify({ secret: userProfile.mfaSecret, encoding: 'base32', token: req.body.code, window: 1 });
    if (!verified) {
      recordAuditLog({ actorUid: decoded.uid, actorEmail: userProfile.email, action: 'mfa_verify_failed', req });
      return res.status(401).json({ success: false, error: 'Invalid authentication code', code: 'INVALID_MFA_CODE' });
    }

    const token = jwt.sign(
      { uid: decoded.uid, email: userProfile.email, tokenVersion: userProfile.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    recordAuditLog({ actorUid: decoded.uid, actorEmail: userProfile.email, action: 'login_success', meta: { mfa: true }, req });
    notifyIfNewDevice(decoded.uid, userProfile, req).catch((err) => console.error('New-device login alert error:', err));

    return res.json({ success: true, token, user: userProfile });
  } catch (err) {
    console.error('MFA login-verify error:', err);
    return res.status(500).json({ success: false, error: 'Failed to verify code', code: 'MFA_VERIFY_ERROR' });
  }
});

// POST /api/auth/mfa/setup — start enrollment; returns a QR code + the raw secret.
router.post('/mfa/setup', authenticateToken, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ name: `FlacronAI (${req.user.email})`, length: 20 });
    await getFirestore().collection('users').doc(req.user.uid).update({ mfaPendingSecret: secret.base32 });
    const qrCode = await qrcode.toDataURL(secret.otpauth_url);
    return res.json({ success: true, secret: secret.base32, qrCode });
  } catch (err) {
    console.error('MFA setup error:', err);
    return res.status(500).json({ success: false, error: 'Failed to start MFA setup', code: 'MFA_SETUP_ERROR' });
  }
});

// POST /api/auth/mfa/verify-setup — confirm the enrollment code and turn MFA on.
router.post('/mfa/verify-setup', authenticateToken, mfaLimiter, [
  body('code').isLength({ min: 6, max: 8 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });
  try {
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const pending = userDoc.data()?.mfaPendingSecret;
    if (!pending) return res.status(400).json({ success: false, error: 'No MFA setup in progress', code: 'NO_PENDING_MFA' });

    const verified = speakeasy.totp.verify({ secret: pending, encoding: 'base32', token: req.body.code, window: 1 });
    if (!verified) return res.status(400).json({ success: false, error: 'Invalid authentication code', code: 'INVALID_MFA_CODE' });

    await db.collection('users').doc(req.user.uid).update({
      mfaEnabled: true,
      mfaSecret: pending,
      mfaPendingSecret: null,
      mfaEnabledAt: new Date().toISOString(),
    });
    recordAuditLog({ actorUid: req.user.uid, actorEmail: req.user.email, action: 'mfa_enabled', req });
    return res.json({ success: true, message: 'Two-factor authentication enabled' });
  } catch (err) {
    console.error('MFA verify-setup error:', err);
    return res.status(500).json({ success: false, error: 'Failed to verify code', code: 'MFA_VERIFY_ERROR' });
  }
});

// POST /api/auth/mfa/disable
router.post('/mfa/disable', authenticateToken, mfaLimiter, [
  body('code').isLength({ min: 6, max: 8 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });
  try {
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const data = userDoc.data() || {};
    if (!data.mfaEnabled || !data.mfaSecret) {
      return res.status(400).json({ success: false, error: 'MFA is not enabled', code: 'MFA_NOT_ENABLED' });
    }

    const verified = speakeasy.totp.verify({ secret: data.mfaSecret, encoding: 'base32', token: req.body.code, window: 1 });
    if (!verified) return res.status(400).json({ success: false, error: 'Invalid authentication code', code: 'INVALID_MFA_CODE' });

    await db.collection('users').doc(req.user.uid).update({ mfaEnabled: false, mfaSecret: null });
    recordAuditLog({ actorUid: req.user.uid, actorEmail: req.user.email, action: 'mfa_disabled', req });
    return res.json({ success: true, message: 'Two-factor authentication disabled' });
  } catch (err) {
    console.error('MFA disable error:', err);
    return res.status(500).json({ success: false, error: 'Failed to disable MFA', code: 'MFA_DISABLE_ERROR' });
  }
});

// GET /api/auth/mfa/status
router.get('/mfa/status', authenticateToken, async (req, res) => {
  try {
    const userDoc = await getFirestore().collection('users').doc(req.user.uid).get();
    return res.json({ success: true, mfaEnabled: !!userDoc.data()?.mfaEnabled });
  } catch (err) {
    console.error('MFA status error:', err);
    return res.status(500).json({ success: false, error: 'Failed to get MFA status', code: 'MFA_STATUS_ERROR' });
  }
});

// POST /api/auth/mfa/verify — post-login gate for the web app, which authenticates
// via the Firebase client SDK directly (never touches /login above). The frontend
// already holds a valid Firebase idToken at this point; this only confirms
// possession of the second factor before unlocking the app UI.
router.post('/mfa/verify', authenticateToken, mfaLimiter, [
  body('code').isLength({ min: 6, max: 8 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });
  try {
    const userDoc = await getFirestore().collection('users').doc(req.user.uid).get();
    const data = userDoc.data() || {};
    if (!data.mfaEnabled || !data.mfaSecret) return res.json({ success: true, mfaEnabled: false });

    const verified = speakeasy.totp.verify({ secret: data.mfaSecret, encoding: 'base32', token: req.body.code, window: 1 });
    if (!verified) {
      recordAuditLog({ actorUid: req.user.uid, actorEmail: req.user.email, action: 'mfa_verify_failed', req });
      return res.status(401).json({ success: false, error: 'Invalid authentication code', code: 'INVALID_MFA_CODE' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('MFA verify error:', err);
    return res.status(500).json({ success: false, error: 'Failed to verify code', code: 'MFA_VERIFY_ERROR' });
  }
});

// POST /api/auth/verify
router.post('/verify', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : req.user;
    return res.json({ success: true, user: userProfile });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Verification failed', code: 'VERIFY_ERROR' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await getAuth().revokeRefreshTokens(req.user.uid);
  } catch (err) {
    console.error('Logout revokeRefreshTokens error:', err);
  }
  try {
    // Bumping tokenVersion invalidates any outstanding custom JWT (Firebase
    // idTokens are covered by revokeRefreshTokens above, but that call doesn't
    // touch already-issued custom JWTs, which are otherwise stateless for 7 days).
    await getFirestore().collection('users').doc(req.user.uid).update({
      tokenVersion: (req.user.tokenVersion || 0) + 1,
    });
  } catch (err) {
    console.error('Logout tokenVersion bump error:', err);
  }
  recordAuditLog({ actorUid: req.user.uid, actorEmail: req.user.email, action: 'logout', req });
  return res.json({ success: true, message: 'Logged out successfully' });
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ success: false, error: 'Refresh token required', code: 'NO_TOKEN' });
  }
  try {
    const axios = require('axios');
    const response = await axios.post(
      `https://securetoken.googleapis.com/v1/token?key=${process.env.FIREBASE_API_KEY}`,
      { grant_type: 'refresh_token', refresh_token: refreshToken }
    );
    return res.json({ success: true, token: response.data.id_token, refreshToken: response.data.refresh_token });
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token refresh failed', code: 'REFRESH_ERROR' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', authLimiter, [body('email').isEmail().normalizeEmail()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.mapped() });
  }
  try {
    const link = await getAuth().generatePasswordResetLink(req.body.email);
    const { sendPasswordResetEmail } = require('../services/emailService');
    await sendPasswordResetEmail(req.body.email, link);
    return res.json({ success: true, message: 'Password reset email sent' });
  } catch (err) {
    // Don't reveal if email exists
    console.error('[forgot-password] Failed to generate or send reset email:', err.message);
    return res.json({ success: true, message: 'If that email exists, a reset link was sent' });
  }
});

// POST /api/auth/send-verification
router.post('/send-verification', authLimiter, authenticateToken, async (req, res) => {
  try {
    const { pendingPlan } = req.body;
    const auth = getAuth();

    // Gracefully handle already-verified users
    const userRecord = await auth.getUser(req.user.uid);
    if (userRecord.emailVerified) {
      return res.json({ success: true, message: 'Email already verified' });
    }

    const continueUrl =
      (process.env.FRONTEND_URL || 'http://localhost:5173') +
      '/dashboard' +
      (pendingPlan && pendingPlan !== 'starter' ? '?pending_plan=' + pendingPlan : '');

    console.log('[verify] generating link for', req.user.email, 'continueUrl:', continueUrl);
    const link = await auth.generateEmailVerificationLink(req.user.email, { url: continueUrl });
    console.log('[verify] link generated OK');

    const { sendEmailVerificationEmail } = require('../services/emailService');
    const displayName = userRecord.displayName || req.user.email.split('@')[0];
    console.log('[verify] sending email via Brevo...');
    await sendEmailVerificationEmail(req.user.email, displayName, link);
    console.log('[verify] email sent OK');

    return res.json({ success: true, message: 'Verification email sent' });
  } catch (err) {
    if (err.code === 'auth/email-already-verified') {
      return res.json({ success: true, message: 'Email already verified' });
    }
    console.error('[verify] FAILED at step above ^^^');
    console.error('[verify] error code:', err.code);
    console.error('[verify] error message:', err.message);
    console.error('[verify] full error:', JSON.stringify(err?.response?.data || err, null, 2));
    return res.status(500).json({ success: false, error: 'Failed to send verification email', code: 'VERIFY_EMAIL_ERROR' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticateToken, [
  body('newPassword').isLength({ min: 12 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.mapped() });
  }
  try {
    await getAuth().updateUser(req.user.uid, { password: req.body.newPassword });
    // Revoke all other outstanding sessions (Firebase refresh tokens + custom JWTs).
    await getAuth().revokeRefreshTokens(req.user.uid).catch(() => {});
    await getFirestore().collection('users').doc(req.user.uid).update({
      tokenVersion: (req.user.tokenVersion || 0) + 1,
    }).catch(() => {});
    recordAuditLog({ actorUid: req.user.uid, actorEmail: req.user.email, action: 'password_change', req });
    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ success: false, error: 'Failed to change password', code: 'PASSWORD_ERROR' });
  }
});

module.exports = router;
