import axios from 'axios';
import { auth } from '../config/firebase.js';

// Prefer the versioned API. The backend serves every route under BOTH /api
// (legacy) and /api/v1 (versioned) from the same handlers. VITE_API_URL may be
// configured as a bare origin (https://api.example.com), an /api base, or an
// already-versioned /api/vN base — normalize all three to end in /api/vN so a
// bare-origin config can never silently drop the /api prefix and 404 every call.
const RAW_API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/+$/, '');
const API_BASE = /\/api\/v\d+$/.test(RAW_API_BASE)
  ? RAW_API_BASE
  : /\/api$/.test(RAW_API_BASE)
    ? `${RAW_API_BASE}/v1`
    : `${RAW_API_BASE}/api/v1`;

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
      const onAuthPage = ['/auth', '/login', '/signup'].some(p => window.location.pathname.startsWith(p));
      if (!onAuthPage) {
        window.location.href = '/login';
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
  // Longer timeout than the client default: analyzing up to 100 photos (batched
  // vision calls) plus report generation can take well over 2 minutes.
  // `onUploadProgress` (Phase 6 addendum) surfaces real byte-level progress of
  // the multipart body actually being sent -- used to drive genuine per-photo
  // upload progress in the wizard, not a fake timer.
  generate: (formData, onUploadProgress) => api.post('/reports/generate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
    onUploadProgress,
  }),
  getAll: (params) => api.get('/reports', { params }),
  getDashboardSummary: () => api.get('/reports/dashboard-summary'),
  getOne: (id) => api.get(`/reports/${id}`),
  update: (id, data) => api.put(`/reports/${id}`, data),
  suggestSection: (id, data) => api.post(`/reports/${id}/sections/suggest`, data),
  // Phase 9 (Report Editor Rich-Text & AI Panel Upgrade): the 6 additional
  // FLACRON ENGINE writing-assistance functions (Improve/Shorten/Expand/
  // Rewrite Professionally/Check Consistency/Check Missing Information/
  // Review Photo Documentation) -- distinct from suggestSection above, which
  // now also backs the "Regenerate Section" instructed-rewrite workflow.
  assistSection: (id, data) => api.post(`/reports/${id}/sections/assist`, data),
  approve: (id, data) => api.post(`/reports/${id}/approve`, data),
  versions: (id) => api.get(`/reports/${id}/versions`),
  listTemplates: () => api.get('/reports/templates'),
  saveTemplate: (data) => api.post('/reports/templates', data),
  deleteTemplate: (id) => api.delete(`/reports/templates/${id}`),
  share: (id) => api.post(`/reports/${id}/share`),
  revokeShare: (id) => api.delete(`/reports/${id}/share`),
  getShared: (token) => api.get(`/reports/shared/${token}`),
  // Phase 19 (Sharing Permissions, Expiry, Comments & Review Requests)
  createShare: (id, data) => api.post(`/reports/${id}/shares`, data),
  listShares: (id) => api.get(`/reports/${id}/shares`),
  revokeShareById: (id, shareId) => api.delete(`/reports/${id}/shares/${shareId}`),
  inviteToReport: (id, data) => api.post(`/reports/${id}/share/invite`, data),
  revokeInvite: (id, uid) => api.delete(`/reports/${id}/share/invite/${uid}`),
  requestReview: (id, data) => api.post(`/reports/${id}/request-review`, data),
  reviewResponse: (id, data) => api.post(`/reports/${id}/review-response`, data),
  getAssignedToMe: () => api.get('/reports/assigned-to-me'),
  getComments: (id) => api.get(`/reports/${id}/comments`),
  addComment: (id, data) => api.post(`/reports/${id}/comments`, data),
  resolveComment: (id, commentId) => api.post(`/reports/${id}/comments/${commentId}/resolve`),
  reopenComment: (id, commentId) => api.post(`/reports/${id}/comments/${commentId}/reopen`),
  getSharedComments: (token) => api.get(`/reports/shared/${token}/comments`),
  addSharedComment: (token, data) => api.post(`/reports/shared/${token}/comments`, data),
  resolveSharedComment: (token, commentId) => api.post(`/reports/shared/${token}/comments/${commentId}/resolve`),
  reopenSharedComment: (token, commentId) => api.post(`/reports/shared/${token}/comments/${commentId}/reopen`),
  delete: (id, permanent = false) => api.delete(`/reports/${id}`, { params: { permanent } }),
  restore: (id) => api.post(`/reports/${id}/restore`),
  duplicate: (id) => api.post(`/reports/${id}/duplicate`),
  export: (id, data) => api.post(`/reports/${id}/export`, data),
  getDownloadUrl: (id, filename) => `${api.defaults.baseURL}/reports/${id}/download?file=${filename}`,
  download: (id, filename) => api.get(`/reports/${id}/download?file=${filename}`, { responseType: 'blob' }),
  downloadDocument: (id, fileName) => api.get(`/reports/${id}/documents/download?file=${encodeURIComponent(fileName)}`, { responseType: 'blob' }),
  analyzeImages: (formData) => api.post('/reports/analyze-images', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  aiStatus: () => api.get('/reports/ai-status'),
  addImages: (id, formData) => api.post(`/reports/${id}/images`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  // Phase 6 (Photo Upload & Per-Photo UX Hardening) -- per-photo gallery for a
  // generated report. Photos are private objects (same as documents/exports
  // above), so images are fetched as authenticated blobs, not a public <img src>.
  getPhotos: (id) => api.get(`/reports/${id}/photos`),
  getPhotoImageBlob: (id, photoId, variant = 'thumbnail') =>
    api.get(`/reports/${id}/photos/${photoId}/image`, { params: { variant }, responseType: 'blob' }),
  // Phase 7 (Async Photo Analysis Pipeline) -- polled while a report's status
  // is 'processing' to drive the analysis-progress view.
  getAnalysisStatus: (id) => api.get(`/reports/${id}/analysis-status`),
  retryAnalysis: (id) => api.post(`/reports/${id}/analysis/retry`),
  // Phase 8 (Per-Photo Analysis Review UI) -- Edit/Approve/Exclude/Add Note/
  // Include-restore actions on one photo's AI observation, and regenerating
  // report content from the current review state.
  updatePhotoReview: (id, photoId, action, payload = {}) =>
    api.put(`/reports/${id}/photos/${photoId}/review`, { action, ...payload }),
  regeneratePhotoReview: (id) => api.post(`/reports/${id}/photos/regenerate`),
  // Phase 24 (Photo Quality Warnings, Ordering, Grouping & Annotations).
  reorderPhotos: (id, order) => api.patch(`/reports/${id}/photos/reorder`, { order }),
  updatePhotoAnnotations: (id, photoId, shapes, expectedUpdatedAt = null) =>
    api.put(`/reports/${id}/photos/${photoId}/annotations`, { shapes, expectedUpdatedAt }),
  // Phase 18 (Settings Completion, Data tab): permanently deletes every
  // already-archived report the caller owns, plus its Storage files.
  deleteAllArchived: () => api.post('/reports/archived/delete-all'),
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
  getLoginHistory: (params) => api.get('/users/login-history', { params }),
  // Phase 18 (Settings Completion)
  getOrganization: () => api.get('/users/organization'),
  updateOrganization: (data) => api.put('/users/organization', data),
  exportData: () => api.get('/users/export-data'),
  // Phase 21 (Onboarding Flow)
  saveOnboardingStep: (data) => api.post('/users/onboarding/step', data),
  completeOnboarding: (data) => api.post('/users/onboarding/complete', data),
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

export const templatesAPI = {
  list: (params) => api.get('/templates', { params }),
  get: (id) => api.get(`/templates/${id}`),
  create: (data) => api.post('/templates', data),
  update: (id, data) => api.put(`/templates/${id}`, data),
  duplicate: (id) => api.post(`/templates/${id}/duplicate`),
  archive: (id) => api.post(`/templates/${id}/archive`),
  restore: (id) => api.post(`/templates/${id}/restore`),
  remove: (id) => api.delete(`/templates/${id}`),
  uploadLogo: (id, formData) => api.post(`/templates/${id}/logo`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  removeLogo: (id) => api.delete(`/templates/${id}/logo`),
};

export const teamsAPI = {
  getMembers: () => api.get('/teams/members'),
  getMember: (memberId) => api.get(`/teams/members/${memberId}`),
  invite: (email, role) => api.post('/teams/invite', { email, role }),
  updateRole: (memberId, role) => api.put(`/teams/members/${memberId}/role`, { role }),
  suspendMember: (memberId) => api.post(`/teams/members/${memberId}/suspend`),
  reactivateMember: (memberId) => api.post(`/teams/members/${memberId}/reactivate`),
  remove: (memberId) => api.delete(`/teams/members/${memberId}`),
  getRoles: () => api.get('/teams/roles'),
  acceptInvite: (token) => api.post(`/teams/accept/${token}`),
};

export const analyticsAPI = {
  // `tzOffset` = the browser's own `-new Date().getTimezoneOffset()`, so the
  // backend can bucket "Reports/Photos Over Time" by the viewer's local
  // calendar day/week/month instead of a hardcoded UTC one.
  get: (params = {}) => api.get('/analytics', { params: { ...params, tzOffset: -new Date().getTimezoneOffset() } }),
};

export const organizationAPI = {
  getMetrics: () => api.get('/organization/metrics'),
  getSecuritySummary: () => api.get('/organization/security-summary'),
  getAuditLogs: (params) => api.get('/organization/audit-logs', { params }),
};

export const webhooksAPI = {
  getEvents: () => api.get('/webhooks/events'),
  getAll: () => api.get('/webhooks'),
  create: (data) => api.post('/webhooks', data),
  rotateSecret: (id) => api.post(`/webhooks/${id}/rotate-secret`),
  remove: (id) => api.delete(`/webhooks/${id}`),
};

export const notificationsAPI = {
  list: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/mark-all-read'),
};

export const searchAPI = {
  // `signal` lets the caller cancel an in-flight request (a debounced global
  // search firing a new query before the previous one resolves) via
  // AbortController -- axios forwards it straight to the underlying fetch/XHR.
  search: (q, signal) => api.get('/search', { params: { q }, signal }),
};

// Phase 22 (Photo Analysis Library) -- cross-report photo search/filter/
// pagination. Reuses reportsAPI.getPhotoImageBlob/updatePhotoReview above for
// the expanded photo's actual image bytes and review actions (both routes
// now accept any of the caller's owned/assigned reports, not just owned).
export const photosAPI = {
  list: (params, signal) => api.get('/photos', { params, signal }),
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
