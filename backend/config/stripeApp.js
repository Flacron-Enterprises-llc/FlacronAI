// Centralized Stripe standard (company-wide): ONE Stripe account (Flacron
// Enterprises LLC) shared by every Flacron app, separated at the application
// level by a permanent `app_id` that is written on every Stripe object we
// create and checked on every webhook we process. Mirrors the EnergyVerse
// (`flacron-energy`) and BTOS (`being-tchitaka-os`) implementations.
//
// Never identify the application from the account, key, product name or
// webhook URL -- only from this explicit app_id.

const APP_ID_KEY = 'app_id';
const APP_ID = (process.env.APP_ID || 'flacron-ai').trim();

// Mode is derived from the configured key, so a test key can never be paired
// with live webhooks/prices by accident. sk_/rk_ keys both encode it.
const resolveKeyMode = (key = process.env.STRIPE_SECRET_KEY || '') =>
  /^(sk|rk)_live_/.test(key) ? 'live' : 'test';

const STRIPE_LIVEMODE = resolveKeyMode() === 'live';

// Standard metadata for every Stripe object this app creates.
const appMetadata = (extra = {}) => {
  const out = { [APP_ID_KEY]: APP_ID };
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== null && v !== '') out[k] = String(v);
  }
  return out;
};

const appIdFrom = (obj) => (obj && obj.metadata && obj.metadata[APP_ID_KEY]) || null;

// 'match' | 'mismatch' | 'missing' for a single Stripe object.
const classifyAppId = (obj) => {
  const id = appIdFrom(obj);
  if (!id) return 'missing';
  return id === APP_ID ? 'match' : 'mismatch';
};

// Startup warnings (never fatal: a misconfigured key must not take the API down).
const describeKeyConfig = () => {
  const key = process.env.STRIPE_SECRET_KEY || '';
  const warnings = [];
  if (!key) warnings.push('STRIPE_SECRET_KEY is not set -- billing is disabled');
  else if (!/^rk_/.test(key)) {
    warnings.push('STRIPE_SECRET_KEY is not a restricted key (rk_...). The company standard requires a per-app restricted key.');
  }
  return { appId: APP_ID, mode: resolveKeyMode(key), warnings };
};

module.exports = {
  APP_ID,
  APP_ID_KEY,
  STRIPE_LIVEMODE,
  resolveKeyMode,
  appMetadata,
  appIdFrom,
  classifyAppId,
  describeKeyConfig,
};
