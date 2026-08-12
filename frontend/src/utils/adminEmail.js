// VITE_ADMIN_EMAIL drives the post-login redirect to /admin only — it is not a
// security boundary (that's the backend's own ADMIN_EMAIL-based `requireAdmin`
// check). A hardcoded fallback here just means a missing/misconfigured Vercel
// env var degrades to "admin lands on the normal dashboard" instead of
// silently breaking the redirect with no way to notice why.
const FALLBACK_ADMIN_EMAIL = 'admin@flacronenterprises.com';

export const getAdminEmail = () =>
  (import.meta.env.VITE_ADMIN_EMAIL || FALLBACK_ADMIN_EMAIL).trim().toLowerCase();
