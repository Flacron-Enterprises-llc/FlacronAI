import { apiRequest } from './client';

/** backend/routes/teams.js — every route except `accept` needs the Enterprise tier (403 INSUFFICIENT_TIER). */
export type TeamRole = 'owner' | 'admin' | 'manager' | 'adjuster' | 'inspector' | 'reviewer' | 'viewer' | 'editor';

export interface TeamMember {
  id: string;
  email: string;
  role: TeamRole;
  status: 'pending' | 'active' | 'suspended';
  userId?: string | null;
  invitedAt?: string;
  invitedByEmail?: string | null;
  acceptedAt?: string | null;
  suspendedAt?: string | null;
  permissions?: Record<string, boolean>;
  [key: string]: unknown;
}

export interface RolesInfo {
  roles: Record<string, { label?: string; description?: string; [key: string]: unknown }>;
  myRole: TeamRole;
  assignableRoles: TeamRole[];
  manageableTargetRoles: TeamRole[];
}

export interface MemberProfile {
  member: TeamMember;
  stats: {
    reportsGenerated: number;
    photosAnalyzed: number;
    recentActivity: { action: string; targetType?: string; targetId?: string; timestamp: string }[];
  };
  viewerRole: TeamRole;
  canManage: boolean;
}

const m = (id: string) => `/teams/members/${encodeURIComponent(id)}`;

export const teamsApi = {
  roles: () => apiRequest<{ success: true } & RolesInfo>('/teams/roles'),
  /** Needs canManageTeam or canViewAllProfiles (403 TEAM_LIST_DENIED). The org owner is not in `members`. */
  members: () =>
    apiRequest<{ success: true; members: TeamMember[]; owner: { uid: string; email: string; displayName?: string }; viewerRole: TeamRole }>(
      '/teams/members'
    ),
  member: (id: string) => apiRequest<{ success: true } & MemberProfile>(m(id)),
  invite: (email: string, role: TeamRole) =>
    apiRequest<{ success: true; member: TeamMember; inviteLink: string; message: string }>('/teams/invite', {
      method: 'POST',
      body: { email, role },
    }),
  setRole: (id: string, role: TeamRole) =>
    apiRequest<{ success: true; role: TeamRole; permissions: Record<string, boolean> }>(`${m(id)}/role`, { method: 'PUT', body: { role } }),
  suspend: (id: string) => apiRequest<{ success: true; message: string }>(`${m(id)}/suspend`, { method: 'POST', idempotent: true }),
  reactivate: (id: string) => apiRequest<{ success: true; message: string }>(`${m(id)}/reactivate`, { method: 'POST', idempotent: true }),
  remove: (id: string) => apiRequest<{ success: true; message: string }>(m(id), { method: 'DELETE' }),
  /** Any signed-in account whose email matches the invite (no tier gate). */
  accept: (token: string) =>
    apiRequest<{ success: true; message: string; role: TeamRole }>(`/teams/accept/${encodeURIComponent(token)}`, { method: 'POST' }),
};

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  adjuster: 'Adjuster',
  inspector: 'Inspector',
  reviewer: 'Reviewer',
  viewer: 'Viewer',
  editor: 'Editor (legacy)',
};
