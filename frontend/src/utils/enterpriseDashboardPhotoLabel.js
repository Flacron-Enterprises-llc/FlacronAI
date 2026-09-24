import { derivePhotoCapacityDisplay } from './photoCapacityDisplay';

// Phase 48 correction. EnterpriseDashboard.jsx's wizard label, extracted as
// a pure function so the "never claim an unverified limit while loading"
// behavior is unit-testable without rendering the (very large) page. Mirrors
// Dashboard.jsx's own `derivePhotoCapacityDisplay` usage, but explicitly
// never shows a number/"unlimited" until the server response has actually
// arrived -- `photoCapacity === null` (loading, or a fetch that hasn't
// resolved/failed yet) renders a neutral "checking limit…" instead of
// derivePhotoCapacityDisplay's own flat-100 UI fallback, since a page that
// is ALWAYS Enterprise-tier must never suggest "100" even transiently.
export const deriveEnterpriseDashboardPhotoLabel = (photoCapacity, photosLength) => {
  if (photoCapacity == null) return 'Damage Photos (checking limit…)';
  const { unlimited, effectiveLimit } = derivePhotoCapacityDisplay(photoCapacity, photosLength);
  return `Damage Photos (${unlimited ? 'unlimited' : `up to ${effectiveLimit}`})`;
};
