const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const { getAuth, getFirestore } = require('../config/firebase');
const { authenticateToken, optionalAuth, requireApiAccess } = require('../middleware/auth');
const { profileLimiter } = require('../middleware/rateLimiters');
const { generateApiKey, getUserKeys, revokeKey, getKeyUsage } = require('../services/apiKeyService');
const { API_KEY_SCOPES, normalizeApiKeyScopes } = require('../config/apiScopes');
const { sendWelcomeEmail } = require('../services/emailService');
const { logoObject, uploadBuffer, deleteObject, deletePrefix } = require('../config/storage');
const { recordAuditLog } = require('../services/auditLogService');
const { body, validationResult } = require('express-validator');
const { resolveOrganizationId, resolveRole, hasCapability } = require('../utils/orgRoles');
const { sanitizeNotifications } = require('../utils/notificationPrefs');
const { PASSWORD_REQUIREMENTS_MESSAGE, isStrongPassword } = require('../utils/passwordPolicy');
const { listEndpoints } = require('../services/webhookService');
const {
  isValidOnboardingUserType,
  isValidOnboardingVolume,
  isValidOnboardingStep,
  ONBOARDING_LAST_STEP,
} = require('../utils/onboarding');

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
router.get('/profile', authenticateToken, profileLimiter, async (req, res) => {
  try {
    const db = getFirestore();
    const docRef = db.collection('users').doc(req.user.uid);

    // Auto-create runs inside a transaction so two near-simultaneous first
    // requests for a brand-new account (e.g. the signup flow's own
    // profile-detail persist call racing the app's normal auth-bootstrap
    // profile fetch, both firing right after registration) can never both
    // see "doesn't exist yet" and race a create/overwrite against each
    // other -- Firestore automatically retries a transaction whose read was
    // invalidated by another commit, so exactly one create wins and every
    // other caller correctly reads the already-created (and possibly
    // already-enriched, e.g. with firstName/lastName) doc instead of
    // clobbering it back to bare defaults.
    const { _isNew, ...profile } = await db.runTransaction(async (tx) => {
      const docSnap = await tx.get(docRef);
      if (docSnap.exists) return { id: docSnap.id, ...docSnap.data(), _isNew: false };

      const displayName = req.user.name || req.user.email?.split('@')[0] || 'User';
      const newProfile = {
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
        // Phase 21 (Onboarding Flow): only ever set here, at the exact moment
        // a user doc is first created. An EXISTING account's doc already
        // exists by the time this phase shipped, so it never passes through
        // this branch and simply has no `onboardingCompleted` field at all --
        // every onboarding-gate check below treats that absence as "already
        // done" (never force a pre-existing user through onboarding), and
        // only an explicit `false` here means "genuinely needs it."
        onboardingCompleted: false,
        onboardingStep: 0,
        onboardingUserType: null,
        onboardingMonthlyVolume: null,
      };
      tx.set(docRef, newProfile);
      return { ...newProfile, _isNew: true };
    });

    // Send welcome email for ALL new signups (email/password + Google OAuth)
    if (_isNew && profile.email) {
      sendWelcomeEmail(profile.email, profile.displayName)
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
  body('firstName').optional().trim().isLength({ max: 100 }),
  body('lastName').optional().trim().isLength({ max: 100 }),
  body('phone').optional().trim(),
  body('company').optional().trim(),
  body('address').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });

  try {
    const db = getFirestore();
    const { displayName, firstName, lastName, phone, company, address, notifications } = req.body;
    const updates = { updatedAt: new Date().toISOString() };

    // Allow saving any provided field, including empty strings (to clear values)
    if (displayName !== undefined) updates.displayName = displayName;
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (phone !== undefined) updates.phone = phone;
    if (company !== undefined) updates.company = company;
    if (address !== undefined) updates.address = address;
    if (notifications !== undefined) {
      const existingDoc = await db.collection('users').doc(req.user.uid).get();
      updates.notifications = sanitizeNotifications(notifications, existingDoc.data()?.notifications);
    }

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

// ── ONBOARDING (Phase 21) ────────────────────────────────────────────────────
// Both routes below operate exclusively on `req.user.uid` (the authenticated
// caller's own doc) -- there is no id/target parameter anywhere in either
// body, so modifying another account's onboarding state is structurally
// impossible, not just permission-checked.

// POST /api/users/onboarding/step — persists the current step pointer plus
// whichever answer(s) are newly provided, and validates that a step can't be
// reached without its prerequisite answer already in place (defends a direct
// API call trying to jump ahead just as much as a disabled Next button does).
router.post('/onboarding/step', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('users').doc(req.user.uid);
    const doc = await ref.get();
    const existing = doc.exists ? doc.data() : {};

    // Already finished (in this tab or another) -- a stale onboarding UI's
    // Next/Back/Skip click should no-op cleanly, not corrupt or resurrect
    // completed state (the multi-tab case this phase calls out explicitly).
    if (existing.onboardingCompleted === true) {
      return res.json({ success: true, alreadyCompleted: true });
    }

    const { step, userType, monthlyVolume } = req.body || {};
    const stepNum = Number(step);
    if (!isValidOnboardingStep(stepNum)) {
      return res.status(400).json({ success: false, error: `step must be an integer from 0 to ${ONBOARDING_LAST_STEP}`, code: 'INVALID_STEP' });
    }
    if (userType !== undefined && userType !== null && !isValidOnboardingUserType(userType)) {
      return res.status(400).json({ success: false, error: 'Invalid user type', code: 'INVALID_USER_TYPE' });
    }
    if (monthlyVolume !== undefined && monthlyVolume !== null && !isValidOnboardingVolume(monthlyVolume)) {
      return res.status(400).json({ success: false, error: 'Invalid monthly volume', code: 'INVALID_VOLUME' });
    }

    const effectiveUserType = userType !== undefined ? userType : existing.onboardingUserType;
    const effectiveVolume = monthlyVolume !== undefined ? monthlyVolume : existing.onboardingMonthlyVolume;
    // Step 2 (monthly volume) requires the user-type step already answered;
    // step 3 (invite team) requires monthly volume already answered. Never
    // trust a client-disabled button as the only gate.
    if (stepNum >= 2 && !effectiveUserType) {
      return res.status(400).json({ success: false, error: 'Select what best describes you before continuing.', code: 'USER_TYPE_REQUIRED' });
    }
    if (stepNum >= 3 && !effectiveVolume) {
      return res.status(400).json({ success: false, error: 'Select your monthly report volume before continuing.', code: 'VOLUME_REQUIRED' });
    }

    const updates = { onboardingStep: stepNum, updatedAt: new Date().toISOString() };
    if (userType !== undefined) updates.onboardingUserType = userType;
    if (monthlyVolume !== undefined) updates.onboardingMonthlyVolume = monthlyVolume;

    await ref.set(updates, { merge: true });
    return res.json({
      success: true,
      onboarding: { step: stepNum, userType: effectiveUserType || null, monthlyVolume: effectiveVolume || null, completed: false },
    });
  } catch (err) {
    console.error('[Onboarding] step update error for uid', req.user?.uid, ':', err.message);
    return res.status(500).json({ success: false, error: 'Failed to save onboarding progress', code: 'ONBOARDING_STEP_ERROR' });
  }
});

// POST /api/users/onboarding/complete — the one true "never show again" flag.
// `skipped`/`reason` covers the one documented case where the generic flow
// deliberately never applies (an enterprise-subdomain signup via
// EnterpriseOnboarding.jsx, which has its own portal-branded flow) -- see
// EnterpriseOnboarding.jsx's post-register hook. A normal completion still
// requires both mandatory answers to already be on file, so a client bug or
// a direct API call can't mark the wizard "done" having silently skipped the
// two non-optional data steps.
router.post('/onboarding/complete', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection('users').doc(req.user.uid);
    const doc = await ref.get();
    const existing = doc.exists ? doc.data() : {};

    if (existing.onboardingCompleted === true) {
      return res.json({ success: true, alreadyCompleted: true });
    }

    const skipped = req.body?.skipped === true;
    if (!skipped) {
      if (!existing.onboardingUserType || !existing.onboardingMonthlyVolume) {
        return res.status(400).json({
          success: false,
          error: 'Complete the user-type and volume steps before finishing onboarding.',
          code: 'ONBOARDING_INCOMPLETE',
        });
      }
    }

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 100) : null;
    const updates = {
      onboardingCompleted: true,
      onboardingCompletedAt: new Date().toISOString(),
      onboardingStep: ONBOARDING_LAST_STEP,
      updatedAt: new Date().toISOString(),
      ...(skipped && reason ? { onboardingSkipReason: reason } : {}),
    };
    await ref.set(updates, { merge: true });

    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'onboarding_completed',
      targetType: 'user',
      targetId: req.user.uid,
      meta: { skipped, reason: skipped ? reason : null, userType: existing.onboardingUserType || null, monthlyVolume: existing.onboardingMonthlyVolume || null },
      req,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[Onboarding] complete error for uid', req.user?.uid, ':', err.message);
    return res.status(500).json({ success: false, error: 'Failed to complete onboarding', code: 'ONBOARDING_COMPLETE_ERROR' });
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

// POST /api/users/consent/registration
// Records the user's acceptance of the Terms of Service + Privacy Policy at
// sign-up. The consent record is stored server-side (auditable): the category,
// the policy version the user agreed to, a server-authoritative timestamp, and
// the user id. This is a REQUIRED contractual acknowledgement — separate from
// the optional marketing consent captured elsewhere (Golden Rule #5).
router.post('/consent/registration', authenticateToken, [
  body('policyVersion').trim().notEmpty().isLength({ max: 40 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });

  try {
    const db = getFirestore();
    const docRef = db.collection('users').doc(req.user.uid);

    const consent = {
      // What was agreed to. Kept explicit so an audit doesn't depend on
      // interpreting a bare boolean.
      documents: ['terms-of-service', 'privacy-policy'],
      policyVersion: req.body.policyVersion,
      // Server-authoritative — never trust a client-supplied timestamp.
      acceptedAt: new Date().toISOString(),
      userId: req.user.uid,
    };

    const docSnap = await docRef.get();
    if (docSnap.exists) {
      await docRef.set({ registrationConsent: consent, updatedAt: new Date().toISOString() }, { merge: true });
    } else {
      // First-time email/password sign-up: the client SDK created the auth user
      // but the Firestore profile isn't created until the first profile fetch.
      // Create the full profile now so a partial doc can't shadow that step.
      const displayName = req.user.name || req.user.email?.split('@')[0] || 'User';
      await docRef.set({
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
        registrationConsent: consent,
      });
    }

    recordAuditLog({ actorUid: req.user.uid, actorEmail: req.user.email, action: 'registration_consent', meta: { policyVersion: consent.policyVersion }, req });
    return res.json({ success: true, consent });
  } catch (err) {
    console.error('[Consent] Registration consent error for uid', req.user?.uid, ':', err.message);
    return res.status(500).json({ success: false, error: 'Failed to record consent', code: 'CONSENT_ERROR' });
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

// GET /api/users/login-history — Phase 17: Security.jsx previously claimed a
// "Login History" view existed under Settings -> Security when it didn't.
// Real data has actually backed this since Phase 3 (login_success/
// login_failed/suspicious_login_new_device/logout are recorded for every
// account on every tier, not just enterprise organizations), so this makes
// the claim true rather than just softening the copy. Deliberately scoped to
// the caller's own uid only, regardless of role/tier -- this is a personal
// security view, not an org-admin one (see routes/organization.js for that).
router.get('/login-history', authenticateToken, async (req, res) => {
  try {
    const { getLoginHistory } = require('../services/organizationService');
    const { page, limit } = req.query;
    const result = await getLoginHistory(req.user, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[users] login-history error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to load login history', code: 'LOGIN_HISTORY_ERROR' });
  }
});

// GET /api/users/organization — Phase 18 (Settings Completion). "Organization"
// here reuses the same model orgRoles.js/templateService.js already
// established (no separate Organizations collection exists in this codebase --
// a solo account's organization is just itself). Available to every
// authenticated caller (any team role, or a solo account) since the fields
// are useful read-only context even for a restricted role; only
// Owner/Admin/Manager (`canManageTeam`) may ever write them (enforced below,
// not just hidden client-side -- Golden Rule #4).
const ORG_FIELDS = ['company', 'website', 'industry', 'address', 'timezone', 'reportFooter'];
router.get('/organization', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const orgId = resolveOrganizationId(req.user);
    const orgDoc = orgId === req.user.uid
      ? { exists: true, data: () => req.user }
      : await db.collection('users').doc(orgId).get();
    const data = orgDoc.exists ? orgDoc.data() : {};
    const organization = Object.fromEntries(ORG_FIELDS.map((f) => [f, data[f] || '']));
    return res.json({
      success: true,
      organization,
      canEdit: hasCapability(req.user, 'canManageTeam'),
    });
  } catch (err) {
    console.error('[users] organization fetch error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to load organization info', code: 'ORGANIZATION_ERROR' });
  }
});

// PUT /api/users/organization
router.put('/organization', authenticateToken, [
  body('company').optional().trim().isLength({ max: 200 }),
  body('website').optional().trim().isLength({ max: 300 }),
  body('industry').optional().trim().isLength({ max: 120 }),
  body('address').optional().trim().isLength({ max: 300 }),
  body('timezone').optional().trim().isLength({ max: 100 }),
  body('reportFooter').optional().trim().isLength({ max: 500 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });

  if (!hasCapability(req.user, 'canManageTeam')) {
    return res.status(403).json({
      success: false,
      error: 'Only Owners, Admins, and Managers can edit organization information.',
      code: 'ORG_EDIT_DENIED',
    });
  }

  try {
    const db = getFirestore();
    const orgId = resolveOrganizationId(req.user);
    const updates = { updatedAt: new Date().toISOString() };
    for (const field of ORG_FIELDS) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    await db.collection('users').doc(orgId).set(updates, { merge: true });
    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'organization_updated',
      targetType: 'organization',
      targetId: orgId,
      meta: { fields: Object.keys(updates).filter((k) => k !== 'updatedAt') },
      req,
    });
    return res.json({ success: true, message: 'Organization info updated' });
  } catch (err) {
    console.error('[users] organization update error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update organization info', code: 'ORGANIZATION_UPDATE_ERROR' });
  }
});

// GET /api/users/export-data — Phase 18 (Settings Completion). Real,
// self-service data-portability export: a single JSON document covering
// everything the confirmed proposal scoped in (profile/settings, this
// account's own reports incl. full content + photo/document references,
// personal templates, CRM records it owns, safe API-key/webhook metadata,
// and its own login history) and explicitly excluding secrets (mfaSecret,
// recovery-code hashes, tokenVersion, stripeCustomerId, apiKey keyHash,
// webhook signing secrets), other users' data, and any org-wide audit log
// (that's Phase 17's admin-only surface, not a personal export). Binary
// file bytes (photos/export documents) are NOT re-embedded -- they stay
// reachable via the existing authenticated download endpoints, referenced
// here only by filename/objectPath, keeping the export small and avoiding a
// second file-security surface.
router.get('/export-data', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const uid = req.user.uid;

    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data() || {};

    const [reportsSnap, templatesSnap, crmClientsSnap, crmAppointmentsSnap, crmClaimsSnap, loginHistory, apiKeys, webhooks] = await Promise.all([
      db.collection('reports').where('userId', '==', uid).get(),
      db.collection('templates').where('ownerId', '==', uid).where('scope', '==', 'personal').get().catch(() => ({ docs: [] })),
      db.collection('crmClients').where('userId', '==', uid).get().catch(() => ({ docs: [] })),
      db.collection('crmAppointments').where('userId', '==', uid).get().catch(() => ({ docs: [] })),
      db.collection('crmClaims').where('userId', '==', uid).get().catch(() => ({ docs: [] })),
      require('../services/organizationService').getLoginHistory(req.user, { page: 1, limit: 100 }).catch(() => ({ items: [] })),
      getUserKeys(uid).catch(() => []),
      listEndpoints(uid).catch(() => []),
    ]);

    const reports = reportsSnap.docs.map((d) => {
      const r = d.data();
      return {
        id: d.id,
        claimNumber: r.claimNumber || null,
        reportType: r.reportType || null,
        status: r.status || null,
        createdAt: r.createdAt || null,
        updatedAt: r.updatedAt || null,
        reviewedAt: r.reviewedAt || null,
        reviewedBy: r.reviewedBy || null,
        content: r.content || null,
        photos: (r.photos || []).map((p) => ({
          id: p.id, category: p.analysis?.category || null, observation: p.analysis?.observation || null,
          review: p.review || null, objectPath: p.objectPath || null,
        })),
        documents: (r.documents || []).map((doc) => ({ fileName: doc.fileName || null, objectPath: doc.objectPath || null })),
      };
    });

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      profile: {
        email: userData.email || null,
        displayName: userData.displayName || null,
        phone: userData.phone || null,
        tier: userData.tier || 'starter',
        createdAt: userData.createdAt || null,
        notifications: sanitizeNotifications(userData.notifications),
        organization: Object.fromEntries(ORG_FIELDS.map((f) => [f, userData[f] || ''])),
        organizationRole: resolveRole(req.user),
      },
      reports,
      templates: templatesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      crm: {
        clients: crmClientsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        appointments: crmAppointmentsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        claims: crmClaimsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      },
      apiKeys,
      webhooks,
      loginHistory: loginHistory.items || [],
    };

    recordAuditLog({ actorUid: uid, actorEmail: req.user.email, action: 'account_data_exported', req });
    return res.json({ success: true, export: exportPayload });
  } catch (err) {
    console.error('[users] export-data error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to export account data', code: 'EXPORT_ERROR' });
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
router.put('/change-password', authenticateToken, [
  body('newPassword').custom(isStrongPassword).withMessage(PASSWORD_REQUIREMENTS_MESSAGE),
], async (req, res) => {
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
router.post('/api-keys', authenticateToken, requireApiAccess, [
  body('name').optional().trim().isLength({ max: 100 }),
  body('scopes').isArray({ min: 1 }).withMessage('Select at least one API-key scope'),
  body('scopes.*').isIn(API_KEY_SCOPES).withMessage('Invalid API-key scope'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.mapped() });
    const scopes = normalizeApiKeyScopes(req.body.scopes);
    const result = await generateApiKey(req.user.uid, req.body.name || 'API Key', scopes);
    recordAuditLog({
      actorUid: req.user.uid, actorEmail: req.user.email, action: 'api_key_created',
      targetType: 'apiKey', targetId: result.keyId || null,
      meta: { name: req.body.name || 'API Key', scopes }, req,
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
