// Phase 48 correction. Pure formatter for the FAQ's per-tier photo-limit
// answer, built from the SAME live `plans` shape `usePublicPlanConfig`
// returns (either the real server response or its built-in fallback) --
// never a separately maintained static string. Extracted so it's
// unit-testable without rendering FAQs.jsx.
const PLAN_ORDER = ['starter', 'professional', 'agency', 'enterprise'];

export const buildPhotoLimitAnswer = (plans) => {
  const parts = PLAN_ORDER.map((id) => {
    const plan = plans?.[id];
    if (!plan) return null;
    const label = plan.label || id;
    return plan.unlimited ? `unlimited on ${label}` : `${plan.basePhotoLimit} on ${label}`;
  }).filter(Boolean);
  const limits = parts.length ? parts.join(', ') : 'plan-dependent';
  return `Your plan's per-report photo limit is ${limits}. One-time add-on packs can extend a single report beyond your plan's limit. Individual files must be under 10MB. We recommend using a mixture of overview shots and detailed damage photos for best analysis results.`;
};
