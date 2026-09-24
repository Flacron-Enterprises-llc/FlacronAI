// Phase 44 (Central Plan Configuration): `reportsPerMonth` below stays as the
// static SAFE-FALLBACK value (it doubles as planConfig.js's own
// FALLBACK_CONFIG source of truth) -- the LIVE, admin-editable value is read
// from PlanConfig via `getEffectiveTier`/`canGenerateAsync` below, not from
// this object directly, wherever a route actually enforces the monthly quota.
// Every other field on TIERS (exportFormats/watermark/apiAccess/...) is
// unaffected by Phase 44 and stays exactly as before.
const { resolvePlanContext } = require('./planConfig');

const TIERS = {
  starter: {
    name: 'Starter',
    reportsPerMonth: 5,
    apiAccess: false,
    whiteLabel: false,
    watermark: true,
    customLogo: false,
    price: 0,
    crmAccess: false,
    exportFormats: ['pdf'],
    prioritySupport: false,
    reportHistory: false,
  },
  professional: {
    name: 'Professional',
    reportsPerMonth: 50,
    apiAccess: true,
    whiteLabel: false,
    watermark: false,
    customLogo: false,
    price: 39.99,
    crmAccess: false,
    exportFormats: ['pdf', 'docx', 'html'],
    prioritySupport: true,
    reportHistory: true,
  },
  agency: {
    name: 'Agency',
    reportsPerMonth: 200,
    apiAccess: true,
    whiteLabel: false,
    watermark: false,
    customLogo: true,
    price: 99.99,
    crmAccess: true,
    exportFormats: ['pdf', 'docx', 'html'],
    prioritySupport: true,
    reportHistory: true,
  },
  enterprise: {
    name: 'Enterprise',
    reportsPerMonth: -1, // unlimited
    apiAccess: true,
    whiteLabel: true,
    watermark: false,
    customLogo: true,
    price: 499,
    crmAccess: true,
    exportFormats: ['pdf', 'docx', 'html'],
    prioritySupport: true,
    reportHistory: true,
    dedicatedSupport: true,
    customSubdomain: true,
  },
};

const TIER_ORDER = ['starter', 'professional', 'agency', 'enterprise'];

const getTier = (tierName) => TIERS[tierName] || TIERS.starter;

const isAtLeastTier = (userTier, requiredTier) => {
  const userIdx = TIER_ORDER.indexOf(userTier || 'starter');
  const reqIdx = TIER_ORDER.indexOf(requiredTier);
  return userIdx >= reqIdx;
};

const canGenerate = (userTier, reportsThisMonth) => {
  const tier = getTier(userTier);
  if (tier.reportsPerMonth === -1) return true;
  return reportsThisMonth < tier.reportsPerMonth;
};

// Phase 44: live-config variants of getTier/canGenerate above. `db` is a
// Firestore handle (same shape callers already have via getFirestore()).
// Falls back to the plain static getTier()/canGenerate() behavior (this
// file's own hardcoded values) if PlanConfig can't be read/is invalid --
// resolvePlanContext already implements that safe-fallback itself, so this
// never throws and never fails closed into "unlimited".
const getEffectiveTier = async (db, tierName) => {
  const base = getTier(tierName);
  const ctx = await resolvePlanContext(db, tierName);
  return { ...base, reportsPerMonth: ctx.reportsPerMonth };
};

const canGenerateAsync = async (db, userTier, reportsThisMonth) => {
  const tier = await getEffectiveTier(db, userTier);
  if (tier.reportsPerMonth === -1) return true;
  return reportsThisMonth < tier.reportsPerMonth;
};

const getStripePriceId = (tierName) => {
  const map = {
    professional:        process.env.STRIPE_PRICE_PROFESSIONAL,
    professional_annual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL,
    agency:              process.env.STRIPE_PRICE_AGENCY,
    agency_annual:       process.env.STRIPE_PRICE_AGENCY_ANNUAL,
    enterprise:          process.env.STRIPE_PRICE_ENTERPRISE,
    enterprise_annual:   process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL,
  };
  return map[tierName] || null;
};

const getTierKeyFromStripePriceId = (priceId) => {
  const tierKeys = [
    'professional',
    'professional_annual',
    'agency',
    'agency_annual',
    'enterprise',
    'enterprise_annual',
  ];

  return tierKeys.find(tierKey => getStripePriceId(tierKey) === priceId) || null;
};

// Resolve the base tier name from a tier key (strips _annual suffix)
const getBaseTier = (tierName) => (tierName || '').replace('_annual', '') || 'starter';

module.exports = {
  TIERS,
  TIER_ORDER,
  getTier,
  isAtLeastTier,
  canGenerate,
  getEffectiveTier,
  canGenerateAsync,
  getStripePriceId,
  getTierKeyFromStripePriceId,
  getBaseTier,
};
