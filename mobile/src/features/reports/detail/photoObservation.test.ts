import type { ReportPhoto } from '@/services/api/reports';
import { effectiveObservation } from './PhotosTab';

jest.mock('@/features/photos/components/AuthenticatedThumb', () => ({ AuthenticatedThumb: () => null }));

const photo = (overrides: Partial<ReportPhoto>): ReportPhoto => ({
  id: 'p1',
  fileName: 'a.jpg',
  size: 1,
  mimeType: 'image/jpeg',
  status: 'uploaded',
  hasThumbnail: true,
  hasOriginal: true,
  reviewable: true,
  position: 0,
  ...overrides,
});

describe('effectiveObservation (web PhotoReview rule)', () => {
  it('uses the reviewer edit only when the review status is edited', () => {
    const analysis = { observation: 'May show staining.' };
    expect(effectiveObservation(photo({ analysis, review: { status: 'edited', observation: 'Edited text' } }))).toBe('Edited text');
    expect(effectiveObservation(photo({ analysis, review: { status: 'approved', observation: null } }))).toBe('May show staining.');
    expect(effectiveObservation(photo({ analysis }))).toBe('May show staining.');
    expect(effectiveObservation(photo({}))).toBe('');
  });
});
