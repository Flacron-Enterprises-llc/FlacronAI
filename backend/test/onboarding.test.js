const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ONBOARDING_USER_TYPES,
  ONBOARDING_VOLUMES,
  ONBOARDING_LAST_STEP,
  isValidOnboardingUserType,
  isValidOnboardingVolume,
  isValidOnboardingStep,
} = require('../utils/onboarding');

test('ONBOARDING_USER_TYPES matches the 6 spec\'d options exactly', () => {
  assert.deepEqual(ONBOARDING_USER_TYPES, [
    'independent_adjuster',
    'adjusting_company',
    'insurance_company',
    'inspector',
    'contractor',
    'other',
  ]);
});

test('ONBOARDING_VOLUMES matches the 4 spec\'d buckets exactly', () => {
  assert.deepEqual(ONBOARDING_VOLUMES, ['1-10', '11-50', '51-200', '200+']);
});

test('isValidOnboardingUserType accepts only the 6 enum values', () => {
  for (const t of ONBOARDING_USER_TYPES) assert.equal(isValidOnboardingUserType(t), true);
  assert.equal(isValidOnboardingUserType('adjuster'), false);
  assert.equal(isValidOnboardingUserType(''), false);
  assert.equal(isValidOnboardingUserType(undefined), false);
  assert.equal(isValidOnboardingUserType(null), false);
});

test('isValidOnboardingVolume accepts only the 4 enum values', () => {
  for (const v of ONBOARDING_VOLUMES) assert.equal(isValidOnboardingVolume(v), true);
  assert.equal(isValidOnboardingVolume('0-10'), false);
  assert.equal(isValidOnboardingVolume(200), false);
});

test('isValidOnboardingStep accepts only integers in [0, LAST_STEP]', () => {
  assert.equal(ONBOARDING_LAST_STEP, 4);
  for (let i = 0; i <= 4; i++) assert.equal(isValidOnboardingStep(i), true);
  assert.equal(isValidOnboardingStep(-1), false);
  assert.equal(isValidOnboardingStep(5), false);
  assert.equal(isValidOnboardingStep(1.5), false);
  assert.equal(isValidOnboardingStep(NaN), false);
  assert.equal(isValidOnboardingStep('2'), false); // must be a real number, not a numeric string
});
