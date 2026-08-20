const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getFirestore, getAuth, FieldValue } = require('../config/firebase');
const { authenticateToken, requireTier } = require('../middleware/auth');
const { sendTeamInviteEmail } = require('../services/emailService');
const { recordAuditLog } = require('../services/auditLogService');
const { notifyUser, NOTIFICATION_TYPES } = require('../utils/notificationService');
const {
  ROLES,
  resolveOrganizationId,
  resolveRole,
  getAssignableRoles,
  getManageableTargetRoles,
  canAssignRole,
  canManageTargetRole,
  hasCapability,
} = require('../utils/orgRoles');

const enterpriseOnly = requireTier('enterprise');

const byNewestInvite = (a, b) => {
  const aTime = Date.parse(a.invitedAt || '') || 0;
  const bTime = Date.parse(b.invitedAt || '') || 0;
  return bTime - aTime;
};

// Phase 14: reports/photos-analyzed/recent-activity for a member-profile
// view. Deliberately mirrors the existing dashboard-summary pattern
// (reports.js) -- a `.select()` projection summed in Node, not
// `.aggregate(sum())`, since that needs a composite index this project
// hasn't provisioned. Recent activity similarly avoids `.orderBy()` combined
// with an equality filter (same undocumented-index constraint) by fetching a
// bounded window and sorting in JS, matching `byNewestInvite` above.
const RECENT_ACTIVITY_WINDOW = 50;
const RECENT_ACTIVITY_LIMIT = 10;

const computeMemberStats = async (db, userId) => {
  if (!userId) {
    // A still-pending invite has no account yet -- nothing to report, not a
    // fabricated zero (Golden Rule #1: this really is the true count).
    return { reportsGenerated: 0, photosAnalyzed: 0, recentActivity: [] };
  }
  const [reportsSnap, activitySnap] = await Promise.all([
    db.collection('reports').where('userId', '==', userId).select('imageCount').get(),
    db
      .collection('auditLogs')
      .where('actorUid', '==', userId)
      .limit(RECENT_ACTIVITY_WINDOW)
      .get(),
  ]);

  const photosAnalyzed = reportsSnap.docs.reduce((sum, doc) => sum + (doc.get('imageCount') || 0), 0);

  const recentActivity = activitySnap.docs
    .map((d) => {
      const a = d.data();
      return {
        action: a.action,
        targetType: a.targetType || null,
        targetId: a.targetId || null,
        timestamp: a.timestamp,
      };
    })
    .sort((a, b) => (Date.parse(b.timestamp || '') || 0) - (Date.parse(a.timestamp || '') || 0))
    .slice(0, RECENT_ACTIVITY_LIMIT);

  return { reportsGenerated: reportsSnap.size, photosAnalyzed, recentActivity };
};

// GET /api/teams/roles — the 7-role capability matrix, plus what the caller
// themself may assign/manage (their own hierarchy position), so the
// frontend never has to duplicate the hierarchy rules.
router.get('/roles', authenticateToken, enterpriseOnly, async (req, res) => {
  const viewerRole = resolveRole(req.user);
  return res.json({
    success: true,
    roles: ROLES,
    myRole: viewerRole,
    assignableRoles: getAssignableRoles(viewerRole),
    manageableTargetRoles: getManageableTargetRoles(viewerRole),
  });
});

// GET /api/teams/members — list all team members. Restricted to
// Owner/Admin/Manager (canManageTeam or canViewAllProfiles) -- other roles
// use GET /members/me for their own profile instead.
router.get('/members', authenticateToken, enterpriseOnly, async (req, res) => {
  try {
    if (!hasCapability(req.user, 'canManageTeam') && !hasCapability(req.user, 'canViewAllProfiles')) {
      return res
        .status(403)
        .json({ success: false, error: 'You do not have permission to view the team roster', code: 'TEAM_LIST_DENIED' });
    }

    const db = getFirestore();
    const orgId = resolveOrganizationId(req.user);

    const [snap, ownerDoc] = await Promise.all([
      db.collection('enterpriseTeams').where('ownerId', '==', orgId).get(),
      db.collection('users').doc(orgId).get(),
    ]);

    // Enterprise teams are plan-bounded and small. Sorting after the single-field
    // owner query avoids a fragile Firestore composite-index dependency while
    // preserving the existing newest-first API contract.
    const members = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byNewestInvite);
    const ownerData = ownerDoc.exists ? ownerDoc.data() : {};

    return res.json({
      success: true,
      members,
      owner: { uid: orgId, email: ownerData.email || '', displayName: ownerData.displayName || '' },
      viewerRole: resolveRole(req.user),
    });
  } catch (err) {
    console.error('List team members error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load team members', code: 'TEAM_LIST_ERROR' });
  }
});

// GET /api/teams/members/:memberId — a single member's profile + activity
// stats. `:memberId` may be the literal string "me" to resolve the caller's
// own membership (or a synthesized owner record if the caller IS the
// organization owner, who has no member row of their own). Any team member
// may view their own profile; viewing anyone else's requires
// `canViewAllProfiles` (owner/admin/manager).
router.get('/members/:memberId', authenticateToken, enterpriseOnly, async (req, res) => {
  try {
    const db = getFirestore();
    const orgId = resolveOrganizationId(req.user);
    let memberId = req.params.memberId;
    let memberData;

    if (memberId === 'me') {
      if (!req.user.teamOwnerId) {
        const stats = await computeMemberStats(db, req.user.uid);
        return res.json({
          success: true,
          member: {
            id: 'me',
            ownerId: orgId,
            email: req.user.email,
            role: 'owner',
            status: 'active',
            userId: req.user.uid,
            invitedAt: null,
            acceptedAt: null,
          },
          stats,
          viewerRole: 'owner',
          canManage: false,
        });
      }
      const snap = await db
        .collection('enterpriseTeams')
        .where('ownerId', '==', orgId)
        .where('userId', '==', req.user.uid)
        .limit(1)
        .get();
      if (snap.empty) {
        return res.status(404).json({ success: false, error: 'Membership record not found', code: 'NOT_FOUND' });
      }
      memberId = snap.docs[0].id;
      memberData = snap.docs[0].data();
    } else {
      const doc = await db.collection('enterpriseTeams').doc(memberId).get();
      if (!doc.exists || doc.data().ownerId !== orgId) {
        return res.status(404).json({ success: false, error: 'Member not found', code: 'NOT_FOUND' });
      }
      memberData = doc.data();
    }

    const isSelf = memberData.userId === req.user.uid;
    const viewerRole = resolveRole(req.user);
    if (!isSelf && !hasCapability(req.user, 'canViewAllProfiles')) {
      return res
        .status(403)
        .json({ success: false, error: 'You do not have permission to view this profile', code: 'PROFILE_ACCESS_DENIED' });
    }

    const stats = await computeMemberStats(db, memberData.userId);
    return res.json({
      success: true,
      member: { id: memberId, ...memberData },
      stats,
      viewerRole,
      canManage:
        !isSelf && hasCapability(req.user, 'canManageTeam') && canManageTargetRole(viewerRole, memberData.role),
    });
  } catch (err) {
    console.error('Get member profile error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load member profile', code: 'MEMBER_PROFILE_ERROR' });
  }
});

// POST /api/teams/invite — invite a team member by email
router.post('/invite', authenticateToken, enterpriseOnly, async (req, res) => {
  try {
    if (!hasCapability(req.user, 'canManageTeam')) {
      return res
        .status(403)
        .json({ success: false, error: 'You do not have permission to invite team members', code: 'TEAM_PERMISSION_DENIED' });
    }

    const { email, role = 'adjuster' } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid email required' });
    }

    const viewerRole = resolveRole(req.user);
    if (!ROLES[role] || !canAssignRole(viewerRole, role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. You may assign: ${getAssignableRoles(viewerRole).join(', ')}`,
        code: 'INVALID_ROLE',
      });
    }

    const db = getFirestore();
    const orgId = resolveOrganizationId(req.user);

    // Check not already invited
    const existing = await db.collection('enterpriseTeams')
      .where('ownerId', '==', orgId)
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get();

    if (!existing.empty) {
      return res.status(409).json({ success: false, error: 'This email is already on your team' });
    }

    // Get owner info for invite context
    const ownerSnap = await db.collection('users').doc(orgId).get();
    const ownerData = ownerSnap.data() || {};

    const token = uuidv4();
    const memberId = uuidv4();

    const memberData = {
      id: memberId,
      ownerId: orgId,
      ownerName: ownerData.displayName || ownerData.email || req.user.email,
      email: email.toLowerCase(),
      role,
      permissions: ROLES[role],
      status: 'pending',
      inviteToken: token,
      invitedAt: new Date().toISOString(),
      invitedBy: req.user.uid,
      invitedByEmail: req.user.email || null,
      acceptedAt: null,
      userId: null,
    };

    await db.collection('enterpriseTeams').doc(memberId).set(memberData);

    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invite/${token}`;

    // Send invite email (non-blocking — don't fail if email is misconfigured)
    sendTeamInviteEmail(email, ownerData.displayName || req.user.email, role, inviteLink).catch(() => {});

    // Phase 20: an in-app bell entry only makes sense when the invited email
    // already belongs to a FlacronAI account (a brand-new invitee has no uid,
    // and therefore no bell to put it in — they still get the email above).
    // Ungated, same as the email itself (no preference key exists for team
    // invites), with a dedupeKey against this specific invite doc so a
    // double-submitted invite click can't double-notify.
    db.collection('users')
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get()
      .then((existingUserSnap) => {
        if (existingUserSnap.empty) return;
        return notifyUser(db, existingUserSnap.docs[0].id, NOTIFICATION_TYPES.TEAM_INVITATION, {
          ownerName: ownerData.displayName || req.user.email,
          role,
        }, { dedupeKey: `team_invite_${memberId}` });
      })
      .catch((err) => console.warn('[Notifications] team-invitation notification failed:', err.message));

    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'team_member_invited',
      targetType: 'teamMember',
      targetId: memberId,
      meta: { email: email.toLowerCase(), role },
      req,
    });

    return res.json({
      success: true,
      member: memberData,
      inviteLink,
      message: `Invitation sent to ${email}`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Shared load+authorize step for the 3 member-mutation endpoints below
// (role change, suspend, reactivate, remove all need the same checks: same
// organization, not acting on yourself, actor has canManageTeam, and the
// anti-escalation hierarchy allows acting on this member's CURRENT role).
const loadManageableMember = async (req, res) => {
  const db = getFirestore();
  const orgId = resolveOrganizationId(req.user);
  const doc = await db.collection('enterpriseTeams').doc(req.params.memberId).get();
  if (!doc.exists || doc.data().ownerId !== orgId) {
    res.status(404).json({ success: false, error: 'Member not found', code: 'NOT_FOUND' });
    return null;
  }
  const member = doc.data();
  if (member.userId === req.user.uid) {
    res.status(400).json({ success: false, error: 'You cannot modify your own membership', code: 'CANNOT_MODIFY_SELF' });
    return null;
  }
  if (!hasCapability(req.user, 'canManageTeam')) {
    res.status(403).json({ success: false, error: 'You do not have permission to manage team members', code: 'TEAM_PERMISSION_DENIED' });
    return null;
  }
  const viewerRole = resolveRole(req.user);
  if (!canManageTargetRole(viewerRole, member.role)) {
    res.status(403).json({
      success: false,
      error: `You cannot manage a member with the ${ROLES[member.role]?.label || member.role} role`,
      code: 'ROLE_HIERARCHY_DENIED',
    });
    return null;
  }
  return { db, doc, member, viewerRole };
};

// PUT /api/teams/members/:memberId/role — update role
router.put('/members/:memberId/role', authenticateToken, enterpriseOnly, async (req, res) => {
  try {
    const ctx = await loadManageableMember(req, res);
    if (!ctx) return;
    const { db, doc, member, viewerRole } = ctx;

    const { role } = req.body;
    if (!ROLES[role] || !canAssignRole(viewerRole, role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. You may assign: ${getAssignableRoles(viewerRole).join(', ')}`,
        code: 'INVALID_ROLE',
      });
    }

    await doc.ref.update({
      role,
      permissions: ROLES[role],
      updatedAt: new Date().toISOString(),
      roleChangedBy: req.user.uid,
    });

    // The member's own users/{uid} doc (not just the enterpriseTeams row) is
    // what every live permission check actually reads (Phase-14 fix -- this
    // previously only ever got written once, at invite-accept time, so a
    // role change here never actually took effect for the member).
    if (member.userId) {
      await db.collection('users').doc(member.userId).update({
        teamRole: role,
        teamPermissions: ROLES[role],
      });
    }

    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'team_member_role_changed',
      targetType: 'teamMember',
      targetId: req.params.memberId,
      meta: { targetEmail: member.email, previousRole: member.role, newRole: role },
      req,
    });

    return res.json({ success: true, role, permissions: ROLES[role] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/teams/members/:memberId/suspend — suspended members retain their
// record (stay visible to admins) but must lose access immediately: status
// flip + tokenVersion bump (kills outstanding custom JWTs) + Firebase
// revokeRefreshTokens (kills outstanding refresh tokens) + a mirrored
// `teamMembershipStatus` flag on their own user doc, which
// middleware/auth.js checks on every request going forward at zero extra
// Firestore-read cost.
router.post('/members/:memberId/suspend', authenticateToken, enterpriseOnly, async (req, res) => {
  try {
    const ctx = await loadManageableMember(req, res);
    if (!ctx) return;
    const { db, doc, member } = ctx;

    if (member.status === 'suspended') {
      return res.json({ success: true, message: 'Member is already suspended' });
    }

    await doc.ref.update({
      status: 'suspended',
      suspendedAt: new Date().toISOString(),
      suspendedBy: req.user.uid,
    });

    if (member.userId) {
      await db.collection('users').doc(member.userId).update({
        teamMembershipStatus: 'suspended',
        tokenVersion: FieldValue.increment(1),
      });
      await getAuth()
        .revokeRefreshTokens(member.userId)
        .catch((err) => console.error('Suspend revokeRefreshTokens error:', err.message));
    }

    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'team_member_suspended',
      targetType: 'teamMember',
      targetId: req.params.memberId,
      meta: { targetEmail: member.email, role: member.role },
      req,
    });

    return res.json({ success: true, message: 'Member suspended' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/teams/members/:memberId/reactivate — restores access. No token
// revocation needed here: suspend already forced them out, so the very next
// login reads the fresh (now 'active') status. Nothing from before suspend
// can still be "live" to resurrect unsafely.
router.post('/members/:memberId/reactivate', authenticateToken, enterpriseOnly, async (req, res) => {
  try {
    const ctx = await loadManageableMember(req, res);
    if (!ctx) return;
    const { db, doc, member } = ctx;

    if (member.status !== 'suspended') {
      return res.json({ success: true, message: 'Member is not suspended' });
    }

    await doc.ref.update({
      status: 'active',
      suspendedAt: null,
      suspendedBy: null,
      reactivatedAt: new Date().toISOString(),
      reactivatedBy: req.user.uid,
    });

    if (member.userId) {
      await db.collection('users').doc(member.userId).update({ teamMembershipStatus: 'active' });
    }

    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'team_member_reactivated',
      targetType: 'teamMember',
      targetId: req.params.memberId,
      meta: { targetEmail: member.email, role: member.role },
      req,
    });

    return res.json({ success: true, message: 'Member reactivated' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/teams/members/:memberId — remove member. Distinct from
// suspend: the member's own account survives, reverted to a normal
// (non-team, starter-tier) account rather than permanently blocked --
// mirrors the same unconditional-overwrite simplification /accept already
// uses (this codebase has no concept of "also has their own subscription").
router.delete('/members/:memberId', authenticateToken, enterpriseOnly, async (req, res) => {
  try {
    const ctx = await loadManageableMember(req, res);
    if (!ctx) return;
    const { db, doc, member } = ctx;

    if (member.userId) {
      await db.collection('users').doc(member.userId).update({
        teamOwnerId: FieldValue.delete(),
        teamRole: FieldValue.delete(),
        teamPermissions: FieldValue.delete(),
        teamMemberId: FieldValue.delete(),
        teamMembershipStatus: FieldValue.delete(),
        tier: 'starter',
        tokenVersion: FieldValue.increment(1),
      });
      await getAuth()
        .revokeRefreshTokens(member.userId)
        .catch((err) => console.error('Remove revokeRefreshTokens error:', err.message));
    }

    await doc.ref.delete();

    recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      action: 'team_member_removed',
      targetType: 'teamMember',
      targetId: req.params.memberId,
      meta: { targetEmail: member.email, role: member.role },
      req,
    });

    return res.json({ success: true, message: 'Member removed' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/teams/accept/:token — accept an invite (called from auth flow)
router.post('/accept/:token', authenticateToken, async (req, res) => {
  try {
    const db = getFirestore();
    const snap = await db.collection('enterpriseTeams')
      .where('inviteToken', '==', req.params.token)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(404).json({ success: false, error: 'Invalid or expired invite token' });
    }

    const doc = snap.docs[0];
    const data = doc.data();

    if (data.email !== req.user.email) {
      return res.status(403).json({ success: false, error: 'This invite was sent to a different email address' });
    }

    await doc.ref.update({
      status: 'active',
      userId: req.user.uid,
      acceptedAt: new Date().toISOString(),
      inviteToken: null,
    });

    // Give the user enterprise tier access (linked to owner)
    await db.collection('users').doc(req.user.uid).update({
      teamOwnerId: data.ownerId,
      teamRole: data.role,
      teamPermissions: data.permissions,
      teamMemberId: doc.id,
      teamMembershipStatus: 'active',
      tier: 'enterprise',
    });

    return res.json({ success: true, message: 'Team invite accepted', role: data.role, permissions: data.permissions });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router._test = { byNewestInvite };
module.exports = router;
