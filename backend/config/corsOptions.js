// Extracted from server.js's CORS setup (2026-09-08 rollout-safety follow-up)
// so it's directly unit-testable without importing the whole server, which
// calls app.listen() and initFirebase() at import time. Behavior-neutral
// extraction otherwise -- server.js still owns the actual cors() wiring
// (origin allowlist callback stays there); this file is only the
// header/method allowlist.
//
// `X-MFA-Token` was added here specifically for the MFA-assertion fix
// (AUTHENTICATION_ARCHITECTURE.md §12): without it, a browser's CORS
// preflight would reject the header entirely (the request never reaches
// the server), independent of whether server-side enforcement is even
// enabled -- this is required the moment any client starts attaching the
// header, not just once enforcement is turned on.
const CORS_ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'X-API-Key', 'X-MFA-Token'];
const CORS_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'];

module.exports = { CORS_ALLOWED_HEADERS, CORS_ALLOWED_METHODS };
