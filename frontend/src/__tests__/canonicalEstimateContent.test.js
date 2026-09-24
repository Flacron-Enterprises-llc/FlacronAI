import { describe, it, expect } from 'vitest';
import { injectSection7Detail } from '../utils/canonicalEstimateContent';

// Phase 42 -- 2026-09-18 correction (CHECK 1, item 5): the desktop preview
// (ReportPreviewPage.jsx) must follow the EXACT same "canonical estimate
// REPLACES the legacy Section 7 body" selection rule as the PDF/DOCX/HTML
// exports. This frontend util mirrors the backend's own
// injectSection7Detail (backend/utils/canonicalEstimateContent.js) -- same
// algorithm, tested independently here since it's a separate file (the
// backend module is CommonJS and not part of this frontend build).

const CONTENT_1_9 = [
  '## SECTION 1: REPORT INFO',
  '- Claim Number: CLM-1',
  '## SECTION 6: SCOPE OF WORK',
  'Scope text',
  '## SECTION 7: PRELIMINARY ESTIMATED COSTS',
  'Legacy AI narrative summary.',
  '## SECTION 8: PHOTO DOCUMENTATION',
  'Photos here',
  '## SECTION 9: ADDITIONAL NOTES & CONCLUSION',
  'Closing notes.',
].join('\n');

describe('injectSection7Detail (desktop-preview parity with PDF/DOCX/HTML)', () => {
  it('no-op when there is no detail markdown -- legacy-only report renders exactly as before', () => {
    expect(injectSection7Detail(CONTENT_1_9, '')).toBe(CONTENT_1_9);
  });

  it('REPLACES the legacy Section 7 body, never showing both the old summary and the new detail at once', () => {
    const out = injectSection7Detail(CONTENT_1_9, '### Detailed Repair Estimate Breakdown\nNew detail body');
    expect(out).toContain('Detailed Repair Estimate Breakdown');
    expect(out).not.toContain('Legacy AI narrative summary.');
  });

  it('preserves every other section untouched', () => {
    const out = injectSection7Detail(CONTENT_1_9, '### Detail\nBody');
    expect(out).toContain('## SECTION 1: REPORT INFO\n- Claim Number: CLM-1');
    expect(out).toContain('## SECTION 6: SCOPE OF WORK\nScope text');
    expect(out).toContain('## SECTION 8: PHOTO DOCUMENTATION\nPhotos here');
    expect(out).toContain('## SECTION 9: ADDITIONAL NOTES & CONCLUSION\nClosing notes.');
  });

  it('no-op when no "SECTION 7" heading exists at all', () => {
    const content = '## SECTION 6: X\ntext';
    expect(injectSection7Detail(content, 'detail')).toBe(content);
  });
});
