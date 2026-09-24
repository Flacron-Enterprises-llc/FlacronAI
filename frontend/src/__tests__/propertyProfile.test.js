import { describe, it, expect } from 'vitest';
import {
  PROFILE_STATUS,
  VERIFICATION_STATUS,
  isPropertyLookupEligible,
  buildLegacyPropertyProfileView,
  mapPropertyProfileToLocationContext,
  computeLocationFingerprint,
  buildPropertyLookupHandoff,
  hasStaleFields,
} from '../utils/propertyProfile';

// Phase 46. Pure frontend mapping tests -- Phase 43 regional-input handoff,
// Phase 47 eligibility handoff, and legacy-report fallback. No
// jsdom/@testing-library needed, same convention as pricingSuggestions.test.js.

const confirmedProfile = (overrides = {}) => ({
  status: PROFILE_STATUS.CONFIRMED,
  fields: {
    countryCode: { value: 'US', verificationStatus: VERIFICATION_STATUS.USER_CONFIRMED },
    stateCode: { value: 'TX', verificationStatus: VERIFICATION_STATUS.USER_CONFIRMED },
    city: { value: 'Austin', verificationStatus: VERIFICATION_STATUS.USER_CONFIRMED },
    postalCode: { value: '78701', verificationStatus: VERIFICATION_STATUS.USER_CONFIRMED },
    ...overrides,
  },
});

describe('isPropertyLookupEligible (Phase 47 handoff)', () => {
  it('US only, case-insensitive', () => {
    expect(isPropertyLookupEligible('US')).toBe(true);
    expect(isPropertyLookupEligible('us')).toBe(true);
    expect(isPropertyLookupEligible('CA')).toBe(false);
    expect(isPropertyLookupEligible('')).toBe(false);
  });
});

describe('buildPropertyLookupHandoff', () => {
  it('US + confirmed -> eligible', () => {
    const handoff = buildPropertyLookupHandoff(confirmedProfile());
    expect(handoff).toEqual({ propertyLookupEligible: true, countryCode: 'US', confirmed: true });
  });

  it('non-US -> not eligible, but still a valid handoff (never "invalid")', () => {
    const handoff = buildPropertyLookupHandoff(confirmedProfile({ countryCode: { value: 'GB' } }));
    expect(handoff.propertyLookupEligible).toBe(false);
    expect(handoff.countryCode).toBe('GB');
  });

  it('unconfirmed profile is never marked confirmed', () => {
    const handoff = buildPropertyLookupHandoff({ status: PROFILE_STATUS.UNCONFIRMED, fields: { countryCode: { value: 'US' } } });
    expect(handoff.confirmed).toBe(false);
  });
});

describe('buildLegacyPropertyProfileView', () => {
  it('never claims property-lookup eligibility for a pre-Phase-46 report', () => {
    const view = buildLegacyPropertyProfileView({ propertyAddress: '3301 Elm Creek Blvd, San Antonio, TX 78230' });
    expect(view.legacy).toBe(true);
    expect(view.propertyLookupEligible).toBe(false);
    expect(view.status).toBe(PROFILE_STATUS.UNCONFIRMED);
  });

  it('a report with no address fields at all still returns a valid all-blank profile', () => {
    const view = buildLegacyPropertyProfileView({});
    expect(view.fields.city.value).toBe(null);
  });
});

describe('mapPropertyProfileToLocationContext (Phase 43 handoff)', () => {
  it('maps only the four generic fields Phase 43 already accepts -- no PII, no lat/long, no raw provider payload', () => {
    const loc = mapPropertyProfileToLocationContext(confirmedProfile());
    expect(loc).toEqual({
      country: 'US',
      state: 'TX',
      city: 'Austin',
      postalCode: '78701',
      confirmed: true,
      locationFingerprint: 'US|TX|austin|78701',
    });
    expect(Object.keys(loc).sort()).toEqual(['city', 'confirmed', 'country', 'locationFingerprint', 'postalCode', 'state'].sort());
  });

  it('returns null for an unconfirmed profile -- caller falls back to manual entry', () => {
    expect(mapPropertyProfileToLocationContext({ status: PROFILE_STATUS.UNCONFIRMED, fields: {} })).toBe(null);
    expect(mapPropertyProfileToLocationContext(null)).toBe(null);
  });

  it('returns null when country could not be resolved even if confirmed', () => {
    expect(mapPropertyProfileToLocationContext(confirmedProfile({ countryCode: { value: '' } }))).toBe(null);
  });
});

describe('computeLocationFingerprint', () => {
  it('changes when the confirmed location changes', () => {
    const fp1 = computeLocationFingerprint(confirmedProfile());
    const fp2 = computeLocationFingerprint(confirmedProfile({ city: { value: 'Dallas' } }));
    expect(fp1).not.toBe(fp2);
  });

  it('is stable for the same location regardless of case', () => {
    const fp1 = computeLocationFingerprint(confirmedProfile());
    const fp2 = computeLocationFingerprint(confirmedProfile({ city: { value: 'AUSTIN' } }));
    expect(fp1).toBe(fp2);
  });

  it('does not change when an unrelated field (e.g. addressLine2) changes -- avoids unnecessary pricing invalidation', () => {
    const fp1 = computeLocationFingerprint(confirmedProfile());
    const fp2 = computeLocationFingerprint(confirmedProfile({ addressLine2: { value: 'Unit 9C' } }));
    expect(fp1).toBe(fp2);
  });
});

describe('hasStaleFields', () => {
  it('true when any field needs a recheck', () => {
    expect(hasStaleFields(confirmedProfile({ city: { value: 'Austin', verificationStatus: VERIFICATION_STATUS.STALE } }))).toBe(true);
  });
  it('false when nothing is stale', () => {
    expect(hasStaleFields(confirmedProfile())).toBe(false);
  });
});
