import { apiRequest } from './client';

/** backend/routes/organization.js — Enterprise tier + canViewAllProfiles (403 ORG_ADMIN_DENIED). */
export interface OrgMetrics {
  users: number;
  reports: number;
  photos: number;
  templates: number;
  storage: { available: boolean };
  roleBreakdown: Record<string, number>;
}

export interface SecuritySummary {
  totalMembers: number;
  mfaEnabledCount: number;
  mfaAdoptionPercent: number;
  suspendedCount: number;
  legacyRoleCount: number;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  timestamp: string;
}

export interface AuditLogQuery {
  startDate?: string;
  endDate?: string;
  action?: string;
  actorUid?: string;
  targetType?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogPage {
  items: AuditLog[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  actionsSeen: string[];
  targetTypesSeen: string[];
  roster: { uid: string; email: string; role: string }[];
}

export const organizationApi = {
  metrics: () => apiRequest<{ success: true; metrics: OrgMetrics }>('/organization/metrics'),
  securitySummary: () => apiRequest<{ success: true; summary: SecuritySummary }>('/organization/security-summary'),
  auditLogs: (query: AuditLogQuery = {}) =>
    apiRequest<{ success: true } & AuditLogPage>('/organization/audit-logs', { params: { limit: 20, ...query } }),
};
