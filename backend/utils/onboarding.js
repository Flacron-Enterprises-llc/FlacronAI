// Phase 21 (Onboarding Flow). Single source of truth for the enum values +
// step bounds shared by the onboarding step/complete routes in
// backend/routes/users.js. The identical enum VALUES (not labels) are
// duplicated in frontend/src/utils/onboarding.js for client-side rendering --
// same small-duplication-over-cross-package-sharing precedent already
// established elsewhere in this codebase (isReviewed(), slugifySectionTitle).
const ONBOARDING_USER_TYPES = [
  'independent_adjuster',
  'adjusting_company',
  'insurance_company',
  'inspector',
  'contractor',
  'other',
];

const ONBOARDING_VOLUMES = ['1-10', '11-50', '51-200', '200+'];

// Steps: 0 Welcome, 1 User type, 2 Monthly volume, 3 Invite team (optional,
// tier-eligible only), 4 Generate-first-report CTA.
const ONBOARDING_STEP_COUNT = 5;
const ONBOARDING_LAST_STEP = ONBOARDING_STEP_COUNT - 1;

const isValidOnboardingUserType = (value) => ONBOARDING_USER_TYPES.includes(value);
const isValidOnboardingVolume = (value) => ONBOARDING_VOLUMES.includes(value);

const isValidOnboardingStep = (value) => Number.isInteger(value) && value >= 0 && value <= ONBOARDING_LAST_STEP;

module.exports = {
  ONBOARDING_USER_TYPES,
  ONBOARDING_VOLUMES,
  ONBOARDING_STEP_COUNT,
  ONBOARDING_LAST_STEP,
  isValidOnboardingUserType,
  isValidOnboardingVolume,
  isValidOnboardingStep,
};
