// Phase 48. Renders a plan's photo-per-report allowance from the sanitized
// server config (GET /payment/public-plan-config) -- never a separately
// maintained "up to 100 photos" copy. Extracted as a pure function (rather
// than inline in Pricing.jsx) so it is unit-testable without rendering the
// page, matching this repo's existing convention for UI-adjacent pure logic
// (photoCapacityDisplay.js, canonicalEstimateEditor.js).
export const photoLimitLabel = (planPhotoConfig) => {
  if (!planPhotoConfig) return null;
  return planPhotoConfig.unlimited ? 'Unlimited photos per report' : `${planPhotoConfig.basePhotoLimit} photos per report`;
};
