import { describe, it, expect } from 'vitest';
import { getLocalTodayIso, isInspectionDateAfterReportDate } from '../utils/inspectionDate.js';

// QA regression: the Generate Report wizard's Inspection Date field had no
// upper bound, and the generated report ignored it entirely (fixed
// server-side in aiService.js/buildReportPrompt). This covers the
// frontend-side "cannot be later than the report date" boundary that gates
// submission before the request ever reaches the backend.

describe('getLocalTodayIso', () => {
  it('formats a given date as local YYYY-MM-DD without a UTC shift', () => {
    expect(getLocalTodayIso(new Date(2026, 8, 13))).toBe('2026-09-13'); // month is 0-indexed
    expect(getLocalTodayIso(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(getLocalTodayIso(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('isInspectionDateAfterReportDate', () => {
  const reportDate = new Date(2026, 8, 13); // 2026-09-13

  it('accepts a past inspection date', () => {
    expect(isInspectionDateAfterReportDate('2026-09-12', reportDate)).toBe(false);
  });

  it('accepts an inspection date equal to the report date', () => {
    expect(isInspectionDateAfterReportDate('2026-09-13', reportDate)).toBe(false);
  });

  it('rejects a future inspection date', () => {
    expect(isInspectionDateAfterReportDate('2026-09-14', reportDate)).toBe(true);
  });

  it('is not triggered by an empty/unset inspection date (optional field)', () => {
    expect(isInspectionDateAfterReportDate('', reportDate)).toBe(false);
    expect(isInspectionDateAfterReportDate(undefined, reportDate)).toBe(false);
  });
});
