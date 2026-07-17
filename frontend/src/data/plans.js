// Single source of truth for plan PRICING across the whole site.
// These must match the prices configured in Stripe (STRIPE_PRICE_* env vars) —
// no page should hardcode its own price. If Stripe pricing changes, change it here.
//
// `monthly`  = price per month billed monthly
// `annual`   = price per month when billed annually (20% discount, shown as /mo)
// Report limits live server-side in backend/config/tiers.js (5/50/200/unlimited).

export const ANNUAL_DISCOUNT = 0.2; // "save 20%"

const MONTHLY = {
  starter: 0,
  professional: 39.99,
  agency: 99.99,
  enterprise: 499,
};

// per-month rate when billed annually, rounded to cents
const annualRate = (m) => Math.round(m * (1 - ANNUAL_DISCOUNT) * 100) / 100;

export const PLAN_PRICING = Object.fromEntries(
  Object.entries(MONTHLY).map(([id, monthly]) => [id, { monthly, annual: annualRate(monthly) }])
);

// Convenience: "$39.99" style label for a monthly price (Free for $0)
export const priceLabel = (id) => {
  const p = PLAN_PRICING[id]?.monthly;
  if (p == null) return '';
  return p === 0 ? 'Free' : `$${p.toFixed(2)}`;
};
