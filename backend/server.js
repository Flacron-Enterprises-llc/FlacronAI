require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

// Initialize Firebase on startup
const { initFirebase } = require('./config/firebase');
initFirebase();

const app = express();

// ── SECURITY ──────────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:3001',
  'http://localhost:5174',
  'https://flacronai.vercel.app',
  'https://flacronai.com',
  'https://www.flacronai.com',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('CORS policy violation'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// ── RATE LIMITING ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later',
      code: 'RATE_LIMITED',
      request_id: req.requestId,
    });
  },
  skip: (req) => req.path === '/health',
});

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

app.use(globalLimiter);

// ── BODY PARSING ──────────────────────────────────────────────────────────────
// Stripe webhook needs raw body — mount before JSON parser (both prefixes).
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));
app.use('/api/v1/payment/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── REQUEST ID ────────────────────────────────────────────────────────────────
// Tag every request with a unique ID (X-Request-Id header) for end-to-end tracing.
const { requestIdMiddleware } = require('./middleware/requestId');
app.use(requestIdMiddleware);

// ── LOGGING ───────────────────────────────────────────────────────────────────
app.use(morgan(':method :url :status :response-time ms - :res[content-length]'));

// Custom request logger middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000 || res.statusCode >= 400) {
      console.log(`[${new Date().toISOString()}] [${req.requestId}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// ── STATIC FILES ──────────────────────────────────────────────────────────────
// All uploads now live in Firebase Storage (see config/storage.js) — there is no
// local /uploads route. Claim photos and exports are private (read server-side or
// via the authenticated GET /api/reports/:id/download endpoint); branding logos
// are served by Firebase's own download-token URLs.

// ── HEALTH CHECKS ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'FlacronAI API',
    version: '1.0.0',
    apiVersion: 'v1',
    basePath: '/api/v1',
    // The unversioned /api base is a backward-compatible alias for /api/v1 and may be deprecated later.
    legacyBasePath: '/api',
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ── ROUTES ────────────────────────────────────────────────────────────────────
// Record API-key usage (no-op for token/browser requests) so usage analytics work.
const { trackApiUsage } = require('./middleware/auth');

// Every route is mounted under BOTH the legacy unversioned prefix (/api/*) and
// the versioned prefix (/api/v1/*). Both share the exact same router instances,
// so behavior is identical — this adds /api/v1 without breaking any existing
// caller (frontend or external) still using /api. See docs/api-changelog.
const API_PREFIXES = ['/api', '/api/v1'];

const routeTable = [
  { path: '/auth', router: require('./routes/auth') },
  { path: '/users', router: require('./routes/users') },
  { path: '/reports', router: require('./routes/reports'), pre: [aiLimiter] },
  { path: '/payment', router: require('./routes/payment') },
  { path: '/crm', router: require('./routes/crm') },
  { path: '/white-label', router: require('./routes/whitelabel') },
  { path: '/teams', router: require('./routes/teams') },
  { path: '/sales', router: require('./routes/sales') },
  { path: '/webhooks', router: require('./routes/webhooks') },
];

for (const prefix of API_PREFIXES) {
  app.use(prefix, trackApiUsage);
  for (const { path, router, pre = [] } of routeTable) {
    app.use(`${prefix}${path}`, ...pre, router);
  }
}

// ── 404 HANDLER ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    code: 'NOT_FOUND',
    request_id: req.requestId,
  });
});

// ── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[Error] [${req.requestId}] ${req.method} ${req.path}:`, err.message, err.stack);

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, error: 'File too large (max 10MB)', code: 'FILE_TOO_LARGE', request_id: req.requestId });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ success: false, error: 'Too many files (max 100)', code: 'TOO_MANY_FILES', request_id: req.requestId });
  }
  if (err.message?.includes('CORS')) {
    return res.status(403).json({ success: false, error: 'CORS error', code: 'CORS_ERROR', request_id: req.requestId });
  }

  const status = err.status || err.statusCode || 500;
  return res.status(status).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    code: err.code || 'INTERNAL_ERROR',
    request_id: req.requestId,
  });
});

// ── START SERVER ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 FlacronAI API running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health\n`);
});

module.exports = app;
