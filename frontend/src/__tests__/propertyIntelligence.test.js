import { describe, it, expect } from 'vitest';
import {
  SOURCE,
  VERIFICATION_STATUS,
  LOOKUP_STATUS,
  FIELD_KEYS,
  buildEmptyPropertyIntelligence,
  computePropertyIntelligenceEligibility,
  isFieldConfirmed,
  hasStalePropertyIntelligence,
} from '../utils/propertyIntelligence';

// Phase 47. Pure frontend eligibility/schema tests -- no jsdom/@testing-library
// needed, same convention as propertyProfile.test.js.

const confirmedUsProfile = (overrides = {}) => ({
  status: 'confirmed',
  propertyLookupEligible: true,
  fields: {
    addressLine1: { value: '123 Main St' },
    city: { value: 'Austin' },
    postalCode: { value: '78701' },
    countryCode: { value: 'US' },
    ...overrides,
  },
});

describe('buildEmptyPropertyIntelligence', () => {
  it('every field key present and unavailable', () => {
    const intel = buildEmptyPropertyIntelligence();
    expect(intel.countryEligible).toBe(false);
    expect(intel.status).toBe(LOOKUP_STATUS.UNAVAILABLE);
    FIELD_KEYS.forEach((key) => expect(intel.fields[key].value).toBe(null));
  });
});

describe('computePropertyIntelligenceEligibility', () => {
  it('a confirmed complete US address is eligible', () => {
    expect(computePropertyIntelligenceEligibility(confirmedUsProfile())).toEqual({ eligible: true, reason: null });
  });

  it('a not-yet-confirmed address is a safe not_eligible state, never an error', () => {
    expect(computePropertyIntelligenceEligibility({ status: 'unconfirmed', fields: {} }).reason).toBe('address_not_confirmed');
    expect(computePropertyIntelligenceEligibility(null).reason).toBe('address_not_confirmed');
  });

  it('a confirmed non-US address is ineligible for country reasons', () => {
    const profile = { status: 'confirmed', propertyLookupEligible: false, fields: {} };
    expect(computePropertyIntelligenceEligibility(profile).reason).toBe('country_not_supported');
  });

  it('a confirmed US address missing required components is incomplete_address', () => {
    const profile = confirmedUsProfile({ city: { value: '' } });
    expect(computePropertyIntelligenceEligibility(profile).reason).toBe('incomplete_address');
  });
});

describe('isFieldConfirmed', () => {
  it('true only for USER_CONFIRMED', () => {
    expect(isFieldConfirmed({ verificationStatus: VERIFICATION_STATUS.USER_CONFIRMED })).toBe(true);
    expect(isFieldConfirmed({ verificationStatus: VERIFICATION_STATUS.PROVIDER_SUPPLIED })).toBe(false);
    expect(isFieldConfirmed(null)).toBe(false);
  });
});

describe('hasStalePropertyIntelligence', () => {
  it('true when any field needs a recheck', () => {
    const intel = buildEmptyPropertyIntelligence();
    intel.fields.yearBuilt = { value: 1998, source: SOURCE.THIRD_PARTY, verificationStatus: VERIFICATION_STATUS.STALE, userOverride: false };
    expect(hasStalePropertyIntelligence(intel)).toBe(true);
  });
  it('false when nothing is stale', () => {
    expect(hasStalePropertyIntelligence(buildEmptyPropertyIntelligence())).toBe(false);
  });
});
