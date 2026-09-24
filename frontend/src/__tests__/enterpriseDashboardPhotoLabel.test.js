import { describe, it, expect } from 'vitest';
import { deriveEnterpriseDashboardPhotoLabel } from '../utils/enterpriseDashboardPhotoLabel';

describe('deriveEnterpriseDashboardPhotoLabel', () => {
  it('never claims a limit before the server response arrives (photoCapacity still null)', () => {
    expect(deriveEnterpriseDashboardPhotoLabel(null, 0)).toBe('Damage Photos (checking limit…)');
  });

  it('shows unlimited once the server confirms it -- Enterprise\'s real, server-derived entitlement', () => {
    expect(deriveEnterpriseDashboardPhotoLabel({ unlimited: true }, 5)).toBe('Damage Photos (unlimited)');
  });

  it('shows a finite server-derived capacity if the server ever returns one (e.g. a future non-Enterprise use of this component)', () => {
    expect(deriveEnterpriseDashboardPhotoLabel({ unlimited: false, effectiveCapacity: 250 }, 5)).toBe('Damage Photos (up to 250)');
  });
});
