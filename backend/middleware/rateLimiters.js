const rateLimit = require('express-rate-limit');

// Shared so it can be applied directly to the specific AI/generation-heavy
// routes that need it (backend/routes/reports.js: /generate, /analyze-images,
// /:id/images, /:id/sections/suggest) instead of an entire router. Previously
// mounted as `pre` middleware on the whole /reports router in server.js, which
// meant ordinary reads (GET /reports, /reports/templates,
// /reports/dashboard-summary) shared this same 10-req/60s budget with actual
// AI calls -- a single Dashboard-home page load already used ~4 of the 10
// requests, so normal usage (browse dashboard, open My Reports, generate one
// report) could exhaust it. Scoping this to only the expensive routes fixes
// that without loosening the actual protection AI calls need.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Report generation rate limit exceeded',
      code: 'GENERATION_RATE_LIMITED',
      request_id: req.requestId,
    });
  },
  keyGenerator: (req) => req.user?.uid || req.ip,
});

// GET /users/profile is the one call every single authenticated page load
// depends on -- ProtectedRoute.jsx renders the "Account data unavailable"
// screen whenever this specific request fails, for ANY reason including a
// 429. It used to only share the app-wide `globalLimiter` (100 req/15min per
// IP, server.js) with every other endpoint. A single Dashboard-home page
// load already fires several other API calls alongside it (reports list,
// dashboard summary, CRM clients, templates, notification polling every
// 60s...), so that shared 100-request budget was already found to exhaust
// within single-digit minutes of ordinary use in a live repro (confirmed via
// a real login + repeated dashboard loads: RateLimit-Remaining dropped to
// double digits within ~7 minutes of one browser tab, then every subsequent
// profile fetch 429'd for the rest of the 15-minute window) -- and, worse,
// it's a per-IP bucket, so any team sharing one office/NAT IP compounds it
// further. This is the actual root cause behind "Account data unavailable"
// recurring even after the auth-token-classification fixes (2026-08-12,
// 2026-08-15, 2026-08-20): those only ever addressed token-verification
// errors, never this. Given the route already requires a valid bearer token
// (authenticateToken runs first), it isn't exposed to unauthenticated abuse,
// so it gets its own generous, per-user (not per-IP) budget instead of
// sharing the general anti-abuse limiter -- keyed by uid so one heavy user
// can never starve a teammate behind the same IP.
const profileLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many profile requests, please slow down',
      code: 'PROFILE_RATE_LIMITED',
      request_id: req.requestId,
    });
  },
  keyGenerator: (req) => req.user?.uid || req.ip,
});

// Phase 43 (OpenAI Preliminary Pricing Service). A separate, conservative
// budget for POST /:id/estimate-detail/price-suggestions -- each call can
// trigger a real (billed) OpenAI request, so this is deliberately tighter
// than aiLimiter's report-generation budget. Same shape/keying (per-user,
// falling back to per-IP) as aiLimiter/profileLimiter above.
const pricingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.PRICING_RATE_LIMIT_PER_MIN) || 10,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Preliminary pricing rate limit exceeded -- please wait a moment and try again.',
      code: 'PRICING_LIMIT_EXCEEDED',
      request_id: req.requestId,
    });
  },
  keyGenerator: (req) => req.user?.uid || req.ip,
});

// Phase 45 (Stripe Report-Specific Photo Add-Ons). Bounds abuse of Stripe
// Checkout Session creation (a real, billable Stripe API call each time),
// same shape/keying as pricingLimiter above.
const photoAddOnCheckoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.PHOTO_ADDON_CHECKOUT_RATE_LIMIT_PER_MIN) || 10,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many checkout attempts -- please wait a moment and try again.',
      code: 'CHECKOUT_LIMIT_EXCEEDED',
      request_id: req.requestId,
    });
  },
  keyGenerator: (req) => req.user?.uid || req.ip,
});

// Phase 46 (Property Intelligence: Address Normalization & Google Integration).
// Bounds abuse of the server-side Geocoding confirmation call (a real,
// billed Google API call each time), same shape/keying as pricingLimiter.
const addressLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.ADDRESS_LOOKUP_RATE_LIMIT_PER_MIN) || 20,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Address lookup rate limit exceeded -- please wait a moment and try again.',
      code: 'ADDRESS_LOOKUP_LIMIT_EXCEEDED',
      request_id: req.requestId,
    });
  },
  keyGenerator: (req) => req.user?.uid || req.ip,
});

// Phase 47 (Property Intelligence: RealtyAPI U.S. Adapter & Report
// Integration). Bounds abuse of a property-data lookup (a real, billed
// third-party API call once a provider is actually configured), same
// shape/keying as pricingLimiter/addressLookupLimiter.
const propertyIntelligenceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.PROPERTY_INTELLIGENCE_RATE_LIMIT_PER_MIN) || 10,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Property data lookup rate limit exceeded -- please wait a moment and try again.',
      code: 'PROPERTY_INTELLIGENCE_LIMIT_EXCEEDED',
      request_id: req.requestId,
    });
  },
  keyGenerator: (req) => req.user?.uid || req.ip,
});

// Phase 48 (Pricing Page, Admin Configuration UI & Cross-Surface
// Consistency). Bounds abuse/mistakes on the admin PlanConfig write path --
// same shape/keying as the other admin-adjacent limiters above. Not
// billed/third-party, so a more generous budget than the Stripe/OpenAI/
// Google limiters is fine; still bounded so a buggy client can't hammer
// Firestore writes.
const planConfigWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.PLAN_CONFIG_WRITE_RATE_LIMIT_PER_MIN) || 20,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many configuration updates -- please wait a moment and try again.',
      code: 'PLAN_CONFIG_WRITE_RATE_LIMITED',
      request_id: req.requestId,
    });
  },
  keyGenerator: (req) => req.user?.uid || req.ip,
});

module.exports = {
  aiLimiter,
  profileLimiter,
  pricingLimiter,
  photoAddOnCheckoutLimiter,
  addressLookupLimiter,
  propertyIntelligenceLimiter,
  planConfigWriteLimiter,
};
