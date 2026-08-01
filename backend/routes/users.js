const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const { getAuth, getFirestore } = require('../config/firebase');
const { authenticateToken, optionalAuth, requireApiAccess } = require('../middleware/auth');
const { generateApiKey, getUserKeys, revokeKey, getKeyUsage } = require('../services/apiKeyService');
const { sendWelcomeEmail } = require('../services/emailService');
const { logoObject, uploadBuffer, deleteObject, deletePrefix } = require('../config/storage');
const { recordAuditLog } = require('../services/auditLogService');
const { body, validationResult } = require('express-validator');

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, WebP images allowed'));
  },
});

// GET /api/users/profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const docRef = db.collection('users').doc(req.user.uid);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      return res.json({ success: true, user: { id: docSnap.id, ...docSnap.data() } });
    }

    // Auto-create profile for first-time / Google OAuth users
    const displayName = req.user.name || req.user.email?.split('@')[0] || 'User';
    const profile = {
      uid: req.user.uid,
      email: req.user.email || '',
      displayName,
      tier: 'starter',
      reportsGenerated: 0,
      reportsThisMonth: 0,
      monthResetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phone: '', company: '', address: '', logoUrl: null, notificationsEnabled: true,
    };
    await docRef.set(profile);

    // Send welcome email for ALL new signups (email/password + Google OAuth)
    if (req.user.email) {
      sendWelcomeEmail(req.user.email, displayName)
        .catch(err => console.warn('[Email] Welcome email failed:', err.message));
    }

    return res.json({ success: true, user: profile });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch profile', code: 'PROFILE_ERROR' });
  }
});

// PUT /api/users/profile
router.put('/profile', authenticateToken, [
  body('displayName').optional().trim().isLength({ max: 100 }),
  body('phone').optional().trim(),
  body('company').optional().trim(),
  body('address').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });

  try {
    const db = getFirestore();
    const { displayName, phone, company, address, notifications } = req.body;
    const updates = { updatedAt: new Date().toISOString() };

    // Allow saving any provided field, including empty strings (to clear values)
    if (displayName !== undefined) updates.displayName = displayName;
    if (phone !== undefined) updates.phone = phone;
    if (company !== undefined) updates.company = company;
    if (address !== undefined) updates.address = address;
    if (notifications !== undefined) updates.notifications = notifications;

    await db.collection('users').doc(req.user.uid).set(updates, { merge: true });

    // Sync displayName to Firebase Auth — non-blocking so a failure here
    // doesn't roll back the already-saved Firestore data
    if (displayName !== undefined) {
      getAuth().updateUser(req.user.uid, { displayName: displayName || '' })
        .catch(err => console.warn('[Profile] Firebase Auth displayName sync failed:', err.message));
    }

    return res.json({ success: true, message: 'Profile updated', updates });
  } catch (err) {
    console.error('[Profile] Update error for uid', req.user?.uid, ':', err.message, err.stack);
    return res.status(500).json({ success: false, error: 'Failed to update profile', code: 'UPDATE_ERROR' });
  }
});

// POST /api/users/profile/logo
router.post('/profile/logo', authenticateToken, logoUpload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No logo file provided' });

  try {
    const filename = `logo_${Date.now()}.png`;
    const objectPath = logoObject(req.user.uid, filename);

    // Resize and convert to PNG in memory
    const buf = await sharp(req.file.buffer)
      .resize(300, 150, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();

    // Remove the previous logo object, if any, then store the new one.
    const db = getFirestore();
    const prev = (await db.collection('users').doc(req.user.uid).get()).data() || {};
    if (prev.logoPath) await deleteObject(prev.logoPath);

    const { url: logoUrl } = await uploadBuffer(objectPath, buf, 'image/png', { publicToken: true });
    await db.collection('users').doc(req.user.uid).update({ logoUrl, logoPath: objectPath, updatedAt: new Date().toISOString() });

    return res.json({ success: true, logoUrl });
  } catch (err) {
    console.error('Logo upload error:', err);
    return res.status(500).json({ success: false, error: 'Logo upload failed', code: 'LOGO_ERROR' });
  }
});

// DELETE /api/users/profile/logo
router.delete('/profile/logo', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('users').doc(req.user.uid).get();
    const { logoPath } = doc.data() || {};

    if (logoPath) await deleteObject(logoPath);
    await db.collection('users').doc(req.user.uid).update({ logoUrl: null, logoPath: null, updatedAt: new Date().toISOString() });

    return res.json({ success: true, message: 'Logo removed' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to remove logo', code: 'LOGO_DELETE_ERROR' });
  }
});

// GET /api/users/usage
router.get('/usage', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('users').doc(req.user.uid).get();
    const data = doc.data() || {};
    const { getTier } = require('../config/tiers');
    const tier = getTier(data.tier || 'starter');

    // Reset monthly count if needed
    let reportsThisMonth = data.reportsThisMonth || 0;
    if (data.monthResetDate && new Date() > new Date(data.monthResetDate)) {
      reportsThisMonth = 0;
      const nextReset = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString();
      await db.collection('users').doc(req.user.uid).update({ reportsThisMonth: 0, monthResetDate: nextReset });
    }

    return res.json({
      success: true,
      usage: {
        reportsThisMonth,
        reportsTotal: data.reportsGenerated || 0,
        tier: data.tier || 'starter',
        tierName: tier.name,
        reportsLimit: tier.reportsPerMonth,
        reportsRemaining: tier.reportsPerMonth === -1 ? -1 : Math.max(0, tier.reportsPerMonth - reportsThisMonth),
        features: {
          apiAccess: tier.apiAccess,
          whiteLabel: tier.whiteLabel,
          watermark: tier.watermark,
          customLogo: tier.customLogo,
          crmAccess: tier.crmAccess,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to get usage', code: 'USAGE_ERROR' });
  }
});

// PUT /api/users/update-name
router.put('/update-name', authenticateToken, [body('displayName').trim().notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });
  try {
    const db = getFirestore();
    await db.collection('users').doc(req.user.uid).update({ displayName: req.body.displayName, updatedAt: new Date().toISOString() });
    await getAuth().updateUser(req.user.uid, { displayName: req.body.displayName });
    return res.json({ success: true, message: 'Name updated' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update name', code: 'NAME_ERROR' });
  }
});

// PUT /api/users/change-password
router.put('/change-password', authenticateToken, [body('newPassword').isLength({ min: 12 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });
  try {
    await getAuth().updateUser(req.user.uid, { password: req.body.newPassword });
    // Revoke all other outstanding sessions (Firebase refresh tokens + custom JWTs).
    await getAuth().revokeRefreshTokens(req.user.uid).catch(() => {});
    await getFirestore().collection('users').doc(req.user.uid).update({
      tokenVersion: (req.user.tokenVersion || 0) + 1,
    }).catch(() => {});
    recordAuditLog({ actorUid: req.user.uid, actorEmail: req.user.email, action: 'password_change', req });
    return res.json({ success: true, message: 'Password changed' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to change password', code: 'PASSWORD_ERROR' });
  }
});

// POST /api/users/api-keys
router.post('/api-keys', authenticateToken, requireApiAccess, [body('name').optional().trim()], async (req, res) => {
  try {
    const result = await generateApiKey(req.user.uid, req.body.name || 'API Key');
    recordAuditLog({
      actorUid: req.user.uid, actorEmail: req.user.email, action: 'api_key_created',
      targetType: 'apiKey', targetId: result.keyId || null,
      meta: { name: req.body.name || 'API Key' }, req,
    });
    return res.status(201).json({ success: true, ...result, warning: 'Save this key — it will not be shown again' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to create API key', code: 'APIKEY_ERROR' });
  }
});

// GET /api/users/api-keys
router.get('/api-keys', authenticateToken, requireApiAccess, async (req, res) => {
  try {
    const apiKeys = await getUserKeys(req.user.uid);
    return res.json({ success: true, apiKeys });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to get API keys', code: 'APIKEY_ERROR' });
  }
});

// DELETE /api/users/api-keys/:keyId
router.delete('/api-keys/:keyId', authenticateToken, requireApiAccess, async (req, res) => {
  try {
    await revokeKey(req.params.keyId, req.user.uid);
    recordAuditLog({
      actorUid: req.user.uid, actorEmail: req.user.email, action: 'api_key_revoked',
      targetType: 'apiKey', targetId: req.params.keyId, req,
    });
    return res.json({ success: true, message: 'API key revoked' });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message, code: 'NOT_FOUND' });
  }
});

// GET /api/users/api-keys/:keyId/usage
router.get('/api-keys/:keyId/usage', authenticateToken, requireApiAccess, async (req, res) => {
  try {
    const usage = await getKeyUsage(req.params.keyId, req.user.uid);
    return res.json({ success: true, usage });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message, code: 'NOT_FOUND' });
  }
});

// GET /api/users/api-usage
router.get('/api-usage', authenticateToken, requireApiAccess, async (req, res) => {
  try {
    const db = getFirestore();
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const snap = await db.collection('apiUsage')
      .where('userId', '==', req.user.uid)
      .where('timestamp', '>=', since.toISOString())
      .get();

    const byDay = {};
    const byEndpoint = {};
    let totalCalls = 0;

    snap.docs.forEach(doc => {
      const d = doc.data();
      const day = d.timestamp.split('T')[0];
      byDay[day] = (byDay[day] || 0) + 1;
      byEndpoint[d.endpoint] = (byEndpoint[d.endpoint] || 0) + 1;
      totalCalls++;
    });

    return res.json({ success: true, analytics: { totalCalls, byDay, byEndpoint, period: '30 days' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to get API usage', code: 'USAGE_ERROR' });
  }
});

// DELETE /api/users/account — self-service, irreversible account + data deletion
router.delete('/account', authenticateToken, [
  body('password').notEmpty().withMessage('Current password is required to confirm deletion'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });

  const uid = req.user.uid;

  try {
    const firebaseApiKey = process.env.FIREBASE_API_KEY;
    if (!firebaseApiKey) {
      return res.status(500).json({ success: false, error: 'Firebase API key not configured', code: 'CONFIG_ERROR' });
    }

    // Re-verify current password before an irreversible delete.
    const axios = require('axios');
    try {
      await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
        { email: req.user.email, password: req.body.password, returnSecureToken: true }
      );
    } catch {
      return res.status(401).json({ success: false, error: 'Incorrect password', code: 'INVALID_PASSWORD' });
    }

    const db = getFirestore();

    // Refuse to orphan a team — owner must remove members / transfer first.
    const teamSnap = await db.collection('enterpriseTeams').where('ownerId', '==', uid).limit(1).get();
    if (!teamSnap.empty) {
      return res.status(409).json({
        success: false,
        error: 'You still own an enterprise team. Remove all team members before deleting your account.',
        code: 'TEAM_OWNER_BLOCKED',
      });
    }

    // Reports (+ their versions subcollection) need a recursive delete.
    const reportsSnap = await db.collection('reports').where('userId', '==', uid).get();
    await Promise.all(reportsSnap.docs.map((d) => db.recursiveDelete(d.ref)));

    const flatCollections = [
      { name: 'reportTemplates', field: 'userId' },
      { name: 'apiKeys', field: 'userId' },
      { name: 'crmClients', field: 'userId' },
      { name: 'crmAppointments', field: 'userId' },
      { name: 'crmClaims', field: 'userId' },
      { name: 'enterpriseClients', field: 'userId' },
    ];
    for (const { name, field } of flatCollections) {
      const snap = await db.collection(name).where(field, '==', uid).get();
      if (snap.empty) continue;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    // Wipe all Storage objects (report photos, exports, logos).
    await deletePrefix(`users/${uid}/`);

    await db.collection('users').doc(uid).delete();
    await getAuth().deleteUser(uid);

    recordAuditLog({ actorUid: uid, actorEmail: req.user.email, action: 'account_self_delete', req });

    return res.json({ success: true, message: 'Account and all associated data deleted' });
  } catch (err) {
    console.error('Account deletion error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete account', code: 'DELETE_ACCOUNT_ERROR' });
  }
});

module.exports = router;
