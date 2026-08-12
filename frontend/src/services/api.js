import axios from 'axios';
import { auth } from '../config/firebase.js';

// Prefer the versioned API. The backend serves every route under BOTH /api
// (legacy) and /api/v1 (versioned) from the same handlers, so upgrading the
// base to /api/v1 is fully backward-compatible. If VITE_API_URL is already
// versioned (…/api/v1) we leave it as-is; a plain …/api is upgraded to …/api/v1.
// Anything not ending in /api is left untouched (safe default).
const RAW_API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const API_BASE = /\/api\/v\d+\/?$/.test(RAW_API_BASE)
  ? RAW_API_BASE
  : RAW_API_BASE.replace(/\/api\/?$/, '/api/v1');

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000, // 2 minutes for AI generation
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach Firebase token
api.interceptors.request.use(
  async (config) => {
    try {
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      } else {
        // Fallback to localStorage token
        const token = localStorage.getItem('flac_token');
        if (token) config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.warn('Token fetch failed:', err.message);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle errors
let isRateLimitRetrying = false;
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;

    // 401 — try a Firebase token force-refresh once before giving up
    if (response?.status === 401 && !config._authRetry) {
      config._authRetry = true;
      try {
        const user = auth.currentUser;
        if (user) {
          // Force-refresh the token (handles expiry and post-redirect race conditions)
          const freshToken = await user.getIdToken(true);
          config.headers.Authorization = `Bearer ${freshToken}`;
          return api(config);
        }
      } catch {
        // Token refresh failed — fall through to logout
      }
      // No Firebase user or refresh failed — session is genuinely gone
      localStorage.removeItem('flac_token');
      if (!window.location.pathname.includes('/auth')) {
        window.location.href = '/auth';
      }
      return Promise.reject(error);
    }

    // 429 — rate limited, retry once after delay
    if (response?.status === 429 && !isRateLimitRetrying && !config._retry) {
      isRateLimitRetrying = true;
      config._retry = true;
      await new Promise(r => setTimeout(r, 2000));
      isRateLimitRetrying = false;
      return api(config);
    }

    // 503 (e.g. a transient Firestore lookup failure server-side) or a plain
    // network error (dropped connection, DNS blip, request never reached the
    // server) — retry once after a short delay before surfacing failure.
    const isTransientServerError = response?.status === 503;
    const isNetworkError = !response && error.code !== 'ECONNABORTED';
    if ((isTransientServerError || isNetworkError) && !config._transientRetry) {
      config._transientRetry = true;
      await new Promise(r => setTimeout(r, 1000));
      return api(config);
    }

    return Promise.reject(error);
  }
);

// Typed API methods
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  verify: () => api.post('/auth/verify'),
  logout: () => api.post('/auth/logout'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  changePassword: (newPassword) => api.post('/auth/change-password', { newPassword }),
  sendVerification: (pendingPlan) => api.post('/auth/send-verification', { pendingPlan }),
  mfaSetup: () => api.post('/auth/mfa/setup'),
  mfaVerifySetup: (code) => api.post('/auth/mfa/verify-setup', { code }),
  mfaDisable: ({ password, code } = {}) => api.post('/auth/mfa/disable', { password, code }),
  mfaStatus: () => api.get('/auth/mfa/status'),
  mfaVerify: (code) => api.post('/auth/mfa/verify', { code }),
};

export const reportsAPI = {
  generate: (formData) => api.post('/reports/generate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  getAll: (params) => api.get('/reports', { params }),
  getOne: (id) => api.get(`/reports/${id}`),
  update: (id, data) => api.put(`/reports/${id}`, data),
  suggestSection: (id, data) => api.post(`/reports/${id}/sections/suggest`, data),
  approve: (id, data) => api.post(`/reports/${id}/approve`, data),
  versions: (id) => api.get(`/reports/${id}/versions`),
  listTemplates: () => api.get('/reports/templates'),
  saveTemplate: (data) => api.post('/reports/templates', data),
  deleteTemplate: (id) => api.delete(`/reports/templates/${id}`),
  share: (id) => api.post(`/reports/${id}/share`),
  revokeShare: (id) => api.delete(`/reports/${id}/share`),
  getShared: (token) => api.get(`/reports/shared/${token}`),
  delete: (id, permanent = false) => api.delete(`/reports/${id}`, { params: { permanent } }),
  export: (id, data) => api.post(`/reports/${id}/export`, data),
  getDownloadUrl: (id, filename) => `${api.defaults.baseURL}/reports/${id}/download?file=${filename}`,
  download: (id, filename) => api.get(`/reports/${id}/download?file=${filename}`, { responseType: 'blob' }),
  analyzeImages: (formData) => api.post('/reports/analyze-images', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  aiStatus: () => api.get('/reports/ai-status'),
  addImages: (id, formData) => api.post(`/reports/${id}/images`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export const usersAPI = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data) => api.put('/users/profile', data),
  uploadLogo: (formData) => api.post('/users/profile/logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteLogo: () => api.delete('/users/profile/logo'),
  getUsage: () => api.get('/users/usage'),
  updateName: (displayName) => api.put('/users/update-name', { displayName }),
  changePassword: (newPassword) => api.put('/users/change-password', { newPassword }),
  createApiKey: (name, scopes) => api.post('/users/api-keys', { name, scopes }),
  getApiKeys: () => api.get('/users/api-keys'),
  revokeApiKey: (keyId) => api.delete(`/users/api-keys/${keyId}`),
  getKeyUsage: (keyId) => api.get(`/users/api-keys/${keyId}/usage`),
  getApiUsage: () => api.get('/users/api-usage'),
  deleteAccount: (password) => api.delete('/users/account', { data: { password } }),
  recordRegistrationConsent: (policyVersion) => api.post('/users/consent/registration', { policyVersion }),
};

export const paymentAPI = {
  createCheckout: (tier) => api.post('/payment/create-checkout-session', { tier }),
  confirmCheckout: (sessionId) => api.post('/payment/confirm-checkout', { sessionId }),
  getSubscription: () => api.get('/payment/current-subscription'),
  getInvoices: () => api.get('/payment/invoices'),
  cancelSubscription: () => api.post('/payment/cancel-subscription'),
};

export const crmAPI = {
  getDashboardAnalytics: () => api.get('/crm/dashboard/analytics'),
  // Clients
  getClients: (params) => api.get('/crm/clients', { params }),
  createClient: (data) => api.post('/crm/clients', data),
  getClient: (id) => api.get(`/crm/clients/${id}`),
  updateClient: (id, data) => api.put(`/crm/clients/${id}`, data),
  deleteClient: (id) => api.delete(`/crm/clients/${id}`),
  getClientReports: (id) => api.get(`/crm/clients/${id}/reports`),
  getClientProfile: (id) => api.get(`/crm/clients/${id}/profile`),
  // Appointments
  getAppointments: (params) => api.get('/crm/appointments', { params }),
  createAppointment: (data) => api.post('/crm/appointments', data),
  updateAppointment: (id, data) => api.put(`/crm/appointments/${id}`, data),
  deleteAppointment: (id) => api.delete(`/crm/appointments/${id}`),
  // Claims
  getClaims: (params) => api.get('/crm/claims', { params }),
  createClaim: (data) => api.post('/crm/claims', data),
  getClaim: (id) => api.get(`/crm/claims/${id}`),
  updateClaim: (id, data) => api.put(`/crm/claims/${id}`, data),
  deleteClaim: (id) => api.delete(`/crm/claims/${id}`),
  getClaimReports: (id) => api.get(`/crm/claims/${id}/reports`),
  getClaimProfile: (id) => api.get(`/crm/claims/${id}/profile`),
};

export const whiteLabelAPI = {
  getConfig: () => api.get('/white-label/config'),
  updateConfig: (data) => api.put('/white-label/customize', data),
  uploadLogo: (formData) => api.post('/white-label/logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getPortal: (subdomain) => api.get(`/white-label/portal/${subdomain}`),
  preview: () => api.post('/white-label/preview', {}, { responseType: 'blob' }),
};

export const teamsAPI = {
  getMembers: () => api.get('/teams/members'),
  invite: (email, role) => api.post('/teams/invite', { email, role }),
  updateRole: (memberId, role) => api.put(`/teams/members/${memberId}/role`, { role }),
  remove: (memberId) => api.delete(`/teams/members/${memberId}`),
  getRoles: () => api.get('/teams/roles'),
  acceptInvite: (token) => api.post(`/teams/accept/${token}`),
};

export const salesAPI = {
  contact: (data) => api.post('/sales/contact', data),
  getLeads: (params) => api.get('/sales/leads', { params }),
  updateLead: (id, data) => api.put(`/sales/leads/${id}`, data),
  updateUserTier: (email, tier) => api.put('/sales/admin/update-tier', { email, tier }),
  // Owner admin
  lookupUser: (email) => api.get('/sales/admin/user', { params: { email } }),
  getAdminUsers: (params) => api.get('/sales/admin/users', { params }),
  getAdminStats: () => api.get('/sales/admin/stats'),
  deleteUser: (uid) => api.delete(`/sales/admin/user/${uid}`),
  getUserReports: (uid) => api.get(`/sales/admin/user/${uid}/reports`),
  getUserBilling: (uid) => api.get(`/sales/admin/user/${uid}/billing`),
  sendUserEmail: (data) => api.post('/sales/admin/email', data),
};

export default api;
