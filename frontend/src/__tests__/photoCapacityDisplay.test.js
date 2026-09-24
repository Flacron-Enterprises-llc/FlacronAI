import { describe, it, expect } from 'vitest';
import { derivePhotoCapacityDisplay, FALLBACK_PHOTO_LIMIT } from '../utils/photoCapacityDisplay';

// Phase 44 (Central Plan Configuration & Atomic Photo-Capacity Enforcement).
// Pure-function coverage for the wizard's photo-capacity UI derivation --
// extracted from Dashboard.jsx specifically so this doesn't require
// rendering the (very large) Dashboard component.

describe('derivePhotoCapacityDisplay', () => {
  it('falls back to the flat 100-photo cap while photoCapacity has not loaded yet (null)', () => {
    const d = derivePhotoCapacityDisplay(null, 0);
    expect(d.unlimited).toBe(false);
    expect(d.effectiveLimit).toBe(FALLBACK_PHOTO_LIMIT);
    expect(d.atLimit).toBe(false);
    expect(d.message).toContain('Maximum of 100 photos');
  });

  it('reflects the real server-derived capacity once loaded', () => {
    const d = derivePhotoCapacityDisplay({ unlimited: false, effectiveCapacity: 25 }, 10);
    expect(d.effectiveLimit).toBe(25);
    expect(d.atLimit).toBe(false);
    expect(d.counterLabel).toBe('10 / 25');
  });

  it('atLimit becomes true exactly at the effective capacity, blocking further uploads', () => {
    const d = derivePhotoCapacityDisplay({ unlimited: false, effectiveCapacity: 25 }, 25);
    expect(d.atLimit).toBe(true);
    expect(d.message).toContain('Maximum of 25 photos');
  });

  it('nearLimit warns within the last 3 slots but is false once actually at the limit (mutually exclusive with atLimit)', () => {
    const near = derivePhotoCapacityDisplay({ unlimited: false, effectiveCapacity: 25 }, 23);
    expect(near.nearLimit).toBe(true);
    expect(near.atLimit).toBe(false);

    const atCap = derivePhotoCapacityDisplay({ unlimited: false, effectiveCapacity: 25 }, 25);
    expect(atCap.nearLimit).toBe(false);
    expect(atCap.atLimit).toBe(true);

    const farFromLimit = derivePhotoCapacityDisplay({ unlimited: false, effectiveCapacity: 25 }, 5);
    expect(farFromLimit.nearLimit).toBe(false);
    expect(farFromLimit.atLimit).toBe(false);
  });

  it('unlimited (Enterprise) never reaches atLimit/nearLimit regardless of count, and displays "Unlimited"', () => {
    const d = derivePhotoCapacityDisplay({ unlimited: true, effectiveCapacity: null }, 100000);
    expect(d.unlimited).toBe(true);
    expect(d.atLimit).toBe(false);
    expect(d.nearLimit).toBe(false);
    expect(d.message).toBeNull();
    expect(d.counterLabel).toBe('100000 / Unlimited');
    expect(d.browseHint).toContain('unlimited photos');
  });

  it('a malformed/partial capacity object (missing effectiveCapacity) safely falls back rather than producing NaN limits', () => {
    const d = derivePhotoCapacityDisplay({ unlimited: false }, 10);
    expect(d.effectiveLimit).toBe(FALLBACK_PHOTO_LIMIT);
    expect(Number.isNaN(d.effectiveLimit)).toBe(false);
  });

  it('a non-finite photosLength (undefined/NaN) is treated as zero, never propagating NaN into atLimit/nearLimit', () => {
    const d = derivePhotoCapacityDisplay({ unlimited: false, effectiveCapacity: 25 }, undefined);
    expect(d.atLimit).toBe(false);
    expect(d.counterLabel).toBe('0 / 25');
  });

  it('browseHint switches between the plan-specific limit and the unlimited copy', () => {
    expect(derivePhotoCapacityDisplay({ unlimited: false, effectiveCapacity: 250 }, 0).browseHint).toContain('up to 250 photos');
    expect(derivePhotoCapacityDisplay({ unlimited: true }, 0).browseHint).toContain('unlimited');
  });
});
