import { describe, it, expect } from 'vitest';
import { getLocalTodayIso } from '../utils/inspectionDate.js';

// QA regression: the "Generate Mold Assessment Supplement" modal
// (ReportPreviewPage.jsx, MoldSupplementModal) let a Date of Discovery later
// than the supplement's own generation date through -- e.g. entering
// 09/26/2026 on 2026-09-13 generated a report showing
// "Date of Discovery: 2026-09-26" next to "Report Date: September 13, 2026",
// which is logically invalid. The modal (and the backend route) both guard
// with `dateOfDiscovery > getLocalTodayIso()` -- a plain string comparison
// on YYYY-MM-DD, which sorts lexically the same as chronologically. This is
// deliberately NOT compared against the linked/parent report's date: the
// parent may legitimately predate when the mold was discovered.

describe('mold supplement discovery-date boundary (dateOfDiscovery > getLocalTodayIso())', () => {
  const today = new Date(2026, 8, 13); // 2026-09-13, matches the reproduced QA scenario

  it('accepts a past discovery date', () => {
    expect('2026-09-12' > getLocalTodayIso(today)).toBe(false);
  });

  it('accepts a discovery date equal to the report date', () => {
    expect('2026-09-13' > getLocalTodayIso(today)).toBe(false);
  });

  it('rejects a future discovery date (the exact reproduced QA value)', () => {
    expect('2026-09-26' > getLocalTodayIso(today)).toBe(true);
  });

  it('does not shift the calendar day at year/month/leap-day boundaries', () => {
    expect(getLocalTodayIso(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(getLocalTodayIso(new Date(2026, 11, 31))).toBe('2026-12-31');
    expect(getLocalTodayIso(new Date(2024, 1, 29))).toBe('2024-02-29'); // leap day
  });
});
