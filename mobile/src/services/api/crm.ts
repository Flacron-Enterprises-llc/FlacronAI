/**
 * backend/routes/crm.js — Agency tier and above (403 INSUFFICIENT_TIER). Data is per user. Validation failures come back
 * as 400 with an express-validator `errors` map (surfaced as field errors by the client).
 */
import { apiRequest } from './client';
import type { Report } from './reports';

export interface CrmClient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  notes?: string;
  totalReports?: number;
  createdAt?: string;
}

export type ClaimStatus = 'open' | 'in-progress' | 'pending-review' | 'closed';

export interface CrmClaim {
  id: string;
  claimNumber: string;
  lossType: string;
  lossDate?: string;
  propertyAddress?: string;
  description?: string;
  notes?: string;
  status?: string;
  clientId?: string | null;
  archived?: boolean;
  createdAt?: string;
}

export interface CrmAppointment {
  id: string;
  title: string;
  date: string;
  time?: string;
  location?: string;
  notes?: string;
  status?: 'scheduled' | 'completed' | 'cancelled';
  clientId?: string | null;
}

export interface CrmAnalytics {
  totalClients: number;
  totalClaims: number;
  openClaims: number;
  overdueAppointments: number;
  reportsAwaitingReview: number;
  reportsThisMonth: number;
  finalizationRate: number | null;
  averageTurnaroundHours: number | null;
  claimsByStatus: Record<string, number>;
  claimsByLossType: Record<string, number>;
  recentClaims: CrmClaim[];
}

type Page<T> = { success: true; data: T[]; total: number; page: number; limit: number; hasMore: boolean };
const id = (s: string) => encodeURIComponent(s);

export const crmApi = {
  analytics: () => apiRequest<{ success: true; analytics: CrmAnalytics }>('/crm/dashboard/analytics'),

  clients: (params: { page?: number; limit?: number; search?: string } = {}) => apiRequest<Page<CrmClient>>('/crm/clients', { params }),
  createClient: (body: Partial<CrmClient>) => apiRequest<{ success: true; client: CrmClient }>('/crm/clients', { method: 'POST', body }),
  updateClient: (clientId: string, body: Partial<CrmClient>) =>
    apiRequest<{ success: true; client: CrmClient }>(`/crm/clients/${id(clientId)}`, { method: 'PUT', body }),
  deleteClient: (clientId: string) => apiRequest<{ success: true }>(`/crm/clients/${id(clientId)}`, { method: 'DELETE' }),
  clientProfile: (clientId: string) =>
    apiRequest<{
      success: true;
      profile: {
        client: CrmClient;
        claims: CrmClaim[];
        appointments: CrmAppointment[];
        reports: Report[];
        summary: { totalClaims: number; openClaims: number; totalReports: number; upcomingAppointments: number };
      };
    }>(`/crm/clients/${id(clientId)}/profile`),

  claims: (params: { page?: number; limit?: number; status?: string; search?: string; archived?: 'true' } = {}) =>
    apiRequest<Page<CrmClaim>>('/crm/claims', { params }),
  createClaim: (body: Partial<CrmClaim>) => apiRequest<{ success: true; claim: CrmClaim }>('/crm/claims', { method: 'POST', body }),
  updateClaim: (claimId: string, body: Partial<CrmClaim>) =>
    apiRequest<{ success: true; claim: CrmClaim }>(`/crm/claims/${id(claimId)}`, { method: 'PUT', body }),
  deleteClaim: (claimId: string) => apiRequest<{ success: true }>(`/crm/claims/${id(claimId)}`, { method: 'DELETE' }),
  claimProfile: (claimId: string) =>
    apiRequest<{
      success: true;
      profile: { claim: CrmClaim; client: CrmClient | null; reports: Report[]; summary: { totalReports: number; drafts: number; finalized: number; latestReportAt: string | null } };
    }>(`/crm/claims/${id(claimId)}/profile`),

  appointments: (params: { startDate?: string; endDate?: string; status?: string } = {}) =>
    apiRequest<{ success: true; appointments: CrmAppointment[] }>('/crm/appointments', { params }),
  createAppointment: (body: Partial<CrmAppointment>) =>
    apiRequest<{ success: true; appointment: CrmAppointment }>('/crm/appointments', { method: 'POST', body }),
  updateAppointment: (apptId: string, body: Partial<CrmAppointment>) =>
    apiRequest<{ success: true; appointment: CrmAppointment }>(`/crm/appointments/${id(apptId)}`, { method: 'PUT', body }),
  deleteAppointment: (apptId: string) => apiRequest<{ success: true }>(`/crm/appointments/${id(apptId)}`, { method: 'DELETE' }),
};

export const CLAIM_STATUSES: { value: ClaimStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'pending-review', label: 'Pending Review' },
  { value: 'closed', label: 'Closed' },
];
