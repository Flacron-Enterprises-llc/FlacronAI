const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { getAuth, getFirestore } = require('../config/firebase');
const { authenticateToken } = require('../middleware/auth');

const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { recordAuditLog } = require('../services/auditLogService');
const { sendNewDeviceLoginAlert } = require('../services/emailService');

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
  body('password').isLength({ min: 6 }),
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

    const { localId: uid, idToken } = loginRes.data;
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : { uid, email, tier: 'starter' };

    recordAuditLog({ actorUid: uid, actorEmail: email, action: 'login_success', req });
    notifyIfNewDevice(uid, userProfile, req).catch((err) => console.error('New-device login alert error:', err));

    return res.json({
      success: true,
      token: idToken,
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
  body('newPassword').isLength({ min: 6 }),
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
