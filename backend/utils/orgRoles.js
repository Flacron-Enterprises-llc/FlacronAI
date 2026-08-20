// Phase 14 (Team Roles Expansion & Member Profiles). Single source of truth
// for the 7-role permissions model, shared by backend/routes/teams.js,
// backend/services/templateService.js (Phase 13 org-template management),
// and backend/routes/reports.js (per-report generate/approve/export gating).
//
// This codebase has no separate "organizations" collection (see
// templateService.js's own header comment) -- an enterprise team's owner IS
// the organization; a team member's `teamOwnerId` (set at invite-accept,
// teams.js) links them to it. `resolveOrganizationId`/`resolveRole` are the
// same formulas templateService.js already established for Phase 13; kept
// here now so both files (and reports.js) read from one place instead of
// three independently-drifting copies.
//
// `editor` is a legacy role from the pre-Phase-14 4-role model (owner/admin/
// editor/viewer). Existing members keep it until an admin/manager/owner
// explicitly reassigns them (never silently migrated) -- it is intentionally
// excluded from ASSIGNABLE_ROLES (nobody can newly assign "editor") but kept
// in ROLES (so its stored permissions/label resolve correctly) and in
// MANAGEABLE_TARGET_ROLES (so it can be acted on/reassigned away from).
const ROLES = {
  owner: {
    label: 'Owner',
    legacy: false,
    canGenerate: true,
    canEditReports: true,
    canApprove: true,
    canExport: true,
    canManageTemplates: true,
    canWhiteLabel: true,
    canBilling: true,
    canViewAllProfiles: true,
    canManageTeam: true,
  },
  admin: {
    label: 'Admin',
    legacy: false,
    canGenerate: true,
    canEditReports: true,
    canApprove: true,
    canExport: true,
    canManageTemplates: true,
    canWhiteLabel: true,
    canBilling: false,
    canViewAllProfiles: true,
    canManageTeam: true,
  },
  manager: {
    label: 'Manager',
    legacy: false,
    canGenerate: true,
    canEditReports: true,
    canApprove: true,
    canExport: true,
    canManageTemplates: true,
    canWhiteLabel: false,
    canBilling: false,
    canViewAllProfiles: true,
    canManageTeam: true,
  },
  adjuster: {
    label: 'Adjuster',
    legacy: false,
    canGenerate: true,
    canEditReports: true,
    canApprove: true,
    canExport: true,
    canManageTemplates: false,
    canWhiteLabel: false,
    canBilling: false,
    canViewAllProfiles: false,
    canManageTeam: false,
  },
  inspector: {
    label: 'Inspector',
    legacy: false,
    // Field data-capture role: can create/upload/edit a draft, but cannot
    // finalize or export it -- someone with canApprove/canExport must do that.
    canGenerate: true,
    canEditReports: true,
    canApprove: false,
    canExport: false,
    canManageTemplates: false,
    canWhiteLabel: false,
    canBilling: false,
    canViewAllProfiles: false,
    canManageTeam: false,
  },
  reviewer: {
    label: 'Reviewer',
    legacy: false,
    // Sign-off/QA role: never originates new reports, but can approve/export
    // once given access to one (cross-member report access is Phase 19 --
    // not built yet, so this role has nothing to act on until that lands).
    canGenerate: false,
    canEditReports: true,
    canApprove: true,
    canExport: true,
    canManageTemplates: false,
    canWhiteLabel: false,
    canBilling: false,
    canViewAllProfiles: false,
    canManageTeam: false,
  },
  viewer: {
    label: 'Viewer',
    legacy: false,
    canGenerate: false,
    canEditReports: false,
    canApprove: false,
    canExport: false,
    canManageTemplates: false,
    canWhiteLabel: false,
    canBilling: false,
    canViewAllProfiles: false,
    canManageTeam: false,
  },
  editor: {
    label: 'Editor (legacy)',
    legacy: true,
    canGenerate: true,
    canEditReports: true,
    canApprove: true,
    canExport: true,
    canManageTemplates: false,
    canWhiteLabel: false,
    canBilling: false,
    canViewAllProfiles: false,
    canManageTeam: false,
  },
};

// Roles an actor may assign -- on invite, or when changing an existing
// member's role. Owner/admin/manager only ("owner" itself is never
// assignable -- it's implicit to the organization's own account, never a
// member row; "editor" is never (re-)assignable -- legacy-only).
const ASSIGNABLE_ROLES = {
  owner: ['admin', 'manager', 'adjuster', 'inspector', 'reviewer', 'viewer'],
  admin: ['manager', 'adjuster', 'inspector', 'reviewer', 'viewer'],
  manager: ['adjuster', 'inspector', 'reviewer', 'viewer'],
};

// Existing members' CURRENT roles an actor may act on at all (role-change,
// suspend, reactivate, remove). Anti-escalation: admin cannot touch other
// admins (or the owner); manager cannot touch admins/managers/the owner.
const MANAGEABLE_TARGET_ROLES = {
  owner: ['admin', 'manager', 'adjuster', 'inspector', 'reviewer', 'viewer', 'editor'],
  admin: ['manager', 'adjuster', 'inspector', 'reviewer', 'viewer', 'editor'],
  manager: ['adjuster', 'inspector', 'reviewer', 'viewer', 'editor'],
};

const getAssignableRoles = (actingRole) => ASSIGNABLE_ROLES[actingRole] || [];
const getManageableTargetRoles = (actingRole) => MANAGEABLE_TARGET_ROLES[actingRole] || [];
const canAssignRole = (actingRole, newRole) => getAssignableRoles(actingRole).includes(newRole);
const canManageTargetRole = (actingRole, targetRole) =>
  getManageableTargetRoles(actingRole).includes(targetRole);

// A solo/owner account's organization is just itself (see module header).
const resolveOrganizationId = (user) => (user ? user.teamOwnerId || user.uid : null);

const resolveRole = (user) => {
  if (!user) return 'viewer';
  if (user.uid === resolveOrganizationId(user)) return 'owner';
  return user.teamRole || 'viewer';
};

const getCapabilities = (role) => ROLES[role] || ROLES.viewer;

const hasCapability = (user, capability) => !!getCapabilities(resolveRole(user))[capability];

module.exports = {
  ROLES,
  ASSIGNABLE_ROLES,
  MANAGEABLE_TARGET_ROLES,
  getAssignableRoles,
  getManageableTargetRoles,
  canAssignRole,
  canManageTargetRole,
  resolveOrganizationId,
  resolveRole,
  getCapabilities,
  hasCapability,
};
