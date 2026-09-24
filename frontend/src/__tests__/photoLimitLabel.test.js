import { describe, it, expect } from 'vitest';
import { photoLimitLabel } from '../utils/photoLimitLabel';

describe('photoLimitLabel', () => {
  it('renders a numeric plan limit', () => {
    expect(photoLimitLabel({ basePhotoLimit: 25, unlimited: false })).toBe('25 photos per report');
  });

  it('renders unlimited plans without a numeric value', () => {
    expect(photoLimitLabel({ basePhotoLimit: null, unlimited: true })).toBe('Unlimited photos per report');
  });

  it('returns null for a missing/not-yet-loaded plan config', () => {
    expect(photoLimitLabel(null)).toBe(null);
    expect(photoLimitLabel(undefined)).toBe(null);
  });
});
