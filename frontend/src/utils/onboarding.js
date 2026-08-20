// Phase 21 (Onboarding Flow). Enum VALUES here are duplicated exactly from
// backend/utils/onboarding.js (small-duplication-over-cross-package-sharing,
// same precedent as isReviewed()/slugifySectionTitle elsewhere in this
// codebase) -- display labels are frontend-only and have no server meaning.
export const ONBOARDING_USER_TYPES = [
  { value: 'independent_adjuster', label: 'Independent Adjuster' },
  { value: 'adjusting_company', label: 'Adjusting Company' },
  { value: 'insurance_company', label: 'Insurance Company' },
  { value: 'inspector', label: 'Inspector' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'other', label: 'Other' },
];

export const ONBOARDING_VOLUMES = [
  { value: '1-10', label: '1–10 reports / month' },
  { value: '11-50', label: '11–50 reports / month' },
  { value: '51-200', label: '51–200 reports / month' },
  { value: '200+', label: '200+ reports / month' },
];

export const ONBOARDING_LAST_STEP = 4;
