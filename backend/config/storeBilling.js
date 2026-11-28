// Mobile Phase 7 (Subscriptions & IAP). Store product mapping + credential
// configuration for Apple App Store / Google Play subscriptions.
//
// Product IDs are NOT invented here: every mapping comes from an env var the
// client sets once the products exist in App Store Connect / Play Console.
// An unset or malformed mapping simply means that plan is not purchasable in
// the app (the mobile UI shows it as unavailable) -- it never falls back to a
// guessed ID. Tier keys mirror getStripePriceId() in tiers.js exactly, so a
// store product resolves to the same tier enum Stripe already uses.
//
//   APPLE_IAP_PRODUCT_<TIERKEY>   = <App Store product ID>
//   GOOGLE_PLAY_PRODUCT_<TIERKEY> = <Play subscription product ID>:<base plan ID>
//   (TIERKEY: PROFESSIONAL, PROFESSIONAL_ANNUAL, AGENCY, AGENCY_ANNUAL)
//
// Enterprise is NOT sold in-app: the web pricing page already treats it as
// sales-led ("Contact Sales", no self-serve checkout -- frontend/src/pages/
// Pricing.jsx), so ENTERPRISE store mappings are ignored even if set.
const fs = require('fs');
const { getBaseTier } = require('./tiers');

const TIER_KEYS = ['professional', 'professional_annual', 'agency', 'agency_annual'];

const PLATFORMS = ['ios', 'android'];

// Apple product IDs / Play product + base plan IDs: alphanumerics, '.', '_', '-'.
const ID_RE = /^[A-Za-z0-9._-]{1,150}$/;
const BASE_PLAN_RE = /^[a-z0-9-]{1,63}$/;

const periodOf = (tierKey) => (tierKey.endsWith('_annual') ? 'annual' : 'monthly');

const readAppleProduct = (tierKey) => {
  const raw = (process.env[`APPLE_IAP_PRODUCT_${tierKey.toUpperCase()}`] || '').trim();
  return ID_RE.test(raw) ? { productId: raw, basePlanId: null } : null;
};

const readGoogleProduct = (tierKey) => {
  const raw = (process.env[`GOOGLE_PLAY_PRODUCT_${tierKey.toUpperCase()}`] || '').trim();
  const [productId, basePlanId, extra] = raw.split(':');
  if (extra !== undefined || !ID_RE.test(productId || '') || !BASE_PLAN_RE.test(basePlanId || '')) return null;
  return { productId, basePlanId };
};

// [{ tierKey, tier, period, productId, basePlanId }] for one platform --
// only configured, well-formed entries.
const getStoreProducts = (platform) => {
  if (!PLATFORMS.includes(platform)) return [];
  const read = platform === 'ios' ? readAppleProduct : readGoogleProduct;
  const out = [];
  const seen = new Set();
  for (const tierKey of TIER_KEYS) {
    const p = read(tierKey);
    if (!p) continue;
    const key = `${p.productId}:${p.basePlanId || ''}`;
    if (seen.has(key)) continue; // one product must never map to two tiers
    seen.add(key);
    out.push({ tierKey, tier: getBaseTier(tierKey), period: periodOf(tierKey), ...p });
  }
  return out;
};

// Verified store data -> mapping entry, or null if the product isn't one of
// ours. On Google, a product with a single configured base plan still matches
// when the store omits the base plan (e.g. legacy purchases); with several
// base plans the base plan must match exactly.
const resolveStoreProduct = (platform, productId, basePlanId = null) => {
  const products = getStoreProducts(platform).filter((p) => p.productId === productId);
  if (platform === 'ios') return products[0] || null;
  if (basePlanId) return products.find((p) => p.basePlanId === basePlanId) || null;
  return products.length === 1 ? products[0] : null;
};

const decodeMultiline = (v) => (v || '').replace(/\\n/g, '\n').trim();

// Apple's public root certificates (https://www.apple.com/certificateauthority/), shipped in the image so the
// App Store JWS chain can be verified without extra deployment files. SHA-256 fingerprints:
//   AppleRootCA-G3.cer 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
//   AppleRootCA-G2.cer C2:B9:B0:42:DD:57:83:0E:7D:11:7D:AC:55:AC:8A:E1:94:07:D3:8E:41:D8:8F:32:15:BC:3A:89:04:44:A0:50
// APPLE_ROOT_CA_CERT_PATHS still overrides them.
const BUNDLED_APPLE_ROOT_CERTS = ['AppleRootCA-G3.cer', 'AppleRootCA-G2.cer'].map((f) =>
  require('path').join(__dirname, '..', 'certs', 'apple', f)
);

const loadAppleRootCerts = () => {
  const configured = (process.env.APPLE_ROOT_CA_CERT_PATHS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const paths = configured.length ? configured : BUNDLED_APPLE_ROOT_CERTS;
  const certs = [];
  for (const p of paths) {
    try {
      certs.push(fs.readFileSync(p));
    } catch {
      return [];
    }
  }
  return certs;
};

const getAppleConfig = () => {
  const appAppleId = Number(process.env.APPLE_IAP_APP_APPLE_ID);
  return {
    bundleId: (process.env.APPLE_IAP_BUNDLE_ID || '').trim(),
    issuerId: (process.env.APPLE_IAP_ISSUER_ID || '').trim(),
    keyId: (process.env.APPLE_IAP_KEY_ID || '').trim(),
    privateKey: decodeMultiline(process.env.APPLE_IAP_PRIVATE_KEY),
    appAppleId: Number.isInteger(appAppleId) && appAppleId > 0 ? appAppleId : null,
    rootCerts: loadAppleRootCerts(),
  };
};

const isAppleConfigured = (cfg = getAppleConfig()) =>
  !!(cfg.bundleId && cfg.issuerId && cfg.keyId && cfg.privateKey && cfg.appAppleId && cfg.rootCerts.length);

const parseServiceAccount = () => {
  const raw = (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return null;
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    return parsed.client_email && parsed.private_key ? parsed : null;
  } catch {
    return null;
  }
};

const getGoogleConfig = () => ({
  packageName: (process.env.GOOGLE_PLAY_PACKAGE_NAME || '').trim(),
  serviceAccount: parseServiceAccount(),
  rtdnAudience: (process.env.GOOGLE_PLAY_RTDN_AUDIENCE || '').trim(),
  rtdnServiceAccountEmail: (process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL || '').trim(),
});

const isGoogleConfigured = (cfg = getGoogleConfig()) => !!(cfg.packageName && cfg.serviceAccount);
const isGoogleRtdnConfigured = (cfg = getGoogleConfig()) =>
  isGoogleConfigured(cfg) && !!(cfg.rtdnAudience && cfg.rtdnServiceAccountEmail);

// Apple sandbox / Google license-tester purchases (App Review, TestFlight,
// internal tracks) are free for the tester, so they must never become ordinary
// production access.
//   STORE_BILLING_ACCEPT_SANDBOX=false     -> refused for everyone
//   STORE_BILLING_ACCEPT_SANDBOX=true      -> accepted for every account (dev/staging only)
//   unset, NODE_ENV != production          -> accepted for every account
//   unset, NODE_ENV == production          -> accepted ONLY for accounts whose email is in
//                                             STORE_SANDBOX_TESTER_EMAILS (e.g. the App Review
//                                             demo account); none if the list is empty.
const sandboxPolicy = () => {
  const flag = (process.env.STORE_BILLING_ACCEPT_SANDBOX || '').trim().toLowerCase();
  if (flag === 'true') return 'all';
  if (flag === 'false') return 'none';
  return process.env.NODE_ENV === 'production' ? 'allowlist' : 'all';
};

const sandboxTesterEmails = () =>
  new Set(
    (process.env.STORE_SANDBOX_TESTER_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^@s]+@[^@s]+$/.test(e))
  );

// Whether the store's sandbox environment is consulted at all.
const acceptsSandboxPurchases = () => sandboxPolicy() !== 'none';

// Whether a sandbox purchase may grant access to this account.
const isSandboxAllowedFor = (email) => {
  const policy = sandboxPolicy();
  if (policy === 'all') return true;
  if (policy === 'none') return false;
  return typeof email === 'string' && sandboxTesterEmails().has(email.trim().toLowerCase());
};

const isPlatformConfigured = (platform) =>
  platform === 'ios' ? isAppleConfigured() : platform === 'android' ? isGoogleConfigured() : false;

module.exports = {
  TIER_KEYS,
  PLATFORMS,
  getStoreProducts,
  resolveStoreProduct,
  getAppleConfig,
  isAppleConfigured,
  getGoogleConfig,
  isGoogleConfigured,
  isGoogleRtdnConfigured,
  acceptsSandboxPurchases,
  sandboxPolicy,
  isSandboxAllowedFor,
  isPlatformConfigured,
  loadAppleRootCerts,
};
