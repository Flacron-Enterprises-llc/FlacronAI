// Phase 22 (Photo Analysis Library). Mirrors backend/services/aiService.js's
// PHOTO_LOCATIONS/PHOTO_CATEGORIES exactly -- a small, deliberate duplication
// (not a cross-package import) for filter dropdown options, matching the
// backend/utils/onboarding.js <-> frontend/src/utils/onboarding.js precedent
// from Phase 21.
export const PHOTO_LOCATIONS = [
  'Roof',
  'Exterior - Walls/Siding',
  'Exterior - Foundation',
  'Exterior - Windows/Doors',
  'Attic',
  'Interior - Living Areas',
  'Interior - Bedroom',
  'Interior - Kitchen',
  'Interior - Bathroom',
  'Basement',
  'Interior - Hallway/Stairs',
  'Garage',
  'HVAC/Mechanical',
  'Plumbing',
  'Electrical',
  'Structural/Framing',
  'Other/Unspecified',
];

export const PHOTO_CATEGORIES = [
  'Water Damage',
  'Fire/Smoke Damage',
  'Wind/Hail Damage',
  'Structural Damage',
  'Mold/Moisture',
  'Electrical',
  'Plumbing',
  'Roofing',
  'Cosmetic/Wear',
  'No Visible Damage',
  'Other',
];

// The library's own analysisStatus filter values -- mirrors
// backend/utils/photoLibrary.js's computeAnalysisStatus() output exactly.
export const PHOTO_ANALYSIS_STATUSES = [
  { value: 'completed', label: 'Analyzed' },
  { value: 'queued', label: 'Queued' },
  { value: 'analyzing', label: 'Analyzing' },
  { value: 'needs_attention', label: 'Needs Attention' },
  { value: 'unavailable', label: 'Unavailable' },
];

export const PHOTO_SORTS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'claim', label: 'Claim Number' },
  { value: 'category', label: 'Category' },
];
