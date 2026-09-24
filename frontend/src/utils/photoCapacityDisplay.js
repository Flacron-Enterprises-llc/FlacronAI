// Phase 44 (Central Plan Configuration & Atomic Photo-Capacity Enforcement).
//
// Pure derivation of the wizard's photo-capacity UI state from the server's
// sanitized `GET /reports/photos/capacity` response (see
// `reportsAPI.getPhotoCapacity` in services/api.js) -- kept dependency-free
// and outside Dashboard.jsx itself so it's unit-testable without rendering
// the (very large) Dashboard component, matching this codebase's existing
// convention for pure logic extracted from big page components (e.g.
// canonicalEstimateEditor.js, pricingSuggestions.js).
//
// `photoCapacity` is `null` while the fetch hasn't resolved yet (or failed) --
// every field below falls back to the pre-Phase-44 flat-100 behavior in that
// case, mirroring the backend's own safe-fallback contract (never block the
// UI, never silently claim "unlimited" just because the fetch hasn't landed).
export const FALLBACK_PHOTO_LIMIT = 100;

// How many photos before the limit counts as "near" it -- purely a UX
// threshold, not a server-enforced value.
const NEAR_LIMIT_WINDOW = 3;

export const derivePhotoCapacityDisplay = (photoCapacity, photosLength) => {
  const unlimited = !!(photoCapacity && photoCapacity.unlimited);
  const effectiveLimit =
    photoCapacity && !photoCapacity.unlimited && Number.isFinite(photoCapacity.effectiveCapacity)
      ? photoCapacity.effectiveCapacity
      : FALLBACK_PHOTO_LIMIT;
  const count = Number.isFinite(photosLength) ? photosLength : 0;
  const atLimit = !unlimited && count >= effectiveLimit;
  const nearLimit = !unlimited && !atLimit && count >= effectiveLimit - NEAR_LIMIT_WINDOW;
  const message = unlimited
    ? null
    : `Maximum of ${effectiveLimit} photos reached for your plan. Remove a photo, delete unused photos, or upgrade your plan.`;
  const counterLabel = unlimited ? `${count} / Unlimited` : `${count} / ${effectiveLimit}`;
  const browseHint = unlimited
    ? 'or click to browse — unlimited photos on your plan, 10MB each'
    : `or click to browse — up to ${effectiveLimit} photos, 10MB each`;
  return { unlimited, effectiveLimit, atLimit, nearLimit, message, counterLabel, browseHint };
};
