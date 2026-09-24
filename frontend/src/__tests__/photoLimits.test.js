import { describe, it, expect } from 'vitest';
import { PHOTO_LIMITS, MAX_PHOTO_LIMIT } from '../data/photoLimits';

// Phase 48 correction. photoLimits.js is FALLBACK-ONLY (consumed by
// publicPlanConfigStore.js's loading/network-failure state) -- these tests
// only confirm it still mirrors backend/config/planConfig.js's
// FALLBACK_CONFIG.plans, not that any page renders it directly.
describe('photoLimits (fallback-only mapping)', () => {
  it('matches the accepted client-confirmed mapping (25/100/250)', () => {
    expect(PHOTO_LIMITS.starter).toBe(25);
    expect(PHOTO_LIMITS.professional).toBe(100);
    expect(PHOTO_LIMITS.agency).toBe(250);
  });

  it('MAX_PHOTO_LIMIT is the highest NUMERIC tier limit (Agency, 250) -- Enterprise is unlimited, not a number, so never included here', () => {
    expect(MAX_PHOTO_LIMIT).toBe(250);
  });
});
