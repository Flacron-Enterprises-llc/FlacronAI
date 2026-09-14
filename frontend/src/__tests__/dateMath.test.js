import { describe, it, expect } from 'vitest';
import { addDaysToIsoDate } from '../utils/dateMath.js';

// Generic calendar-date arithmetic backing the Invoice Due Date QA fix
// (ReportPreviewPage.jsx's InvoiceModal: Due Date = Invoice Date + 30 days,
// read-only, recalculated whenever Invoice Date changes). Mirrors
// backend/utils/dateMath.js exactly so the modal's display never disagrees
// with what the server actually computes and stores.

describe('addDaysToIsoDate', () => {
  it('confirmed reproduction: 09/13/2026 + 30 days = 10/13/2026', () => {
    expect(addDaysToIsoDate('2026-09-13', 30)).toBe('2026-10-13');
  });

  it('09/09/2026 + 30 days = 10/09/2026', () => {
    expect(addDaysToIsoDate('2026-09-09', 30)).toBe('2026-10-09');
  });

  it('crosses a month boundary with a shorter following month', () => {
    expect(addDaysToIsoDate('2026-01-31', 30)).toBe('2026-03-02'); // Feb 2026 has 28 days
  });

  it('crosses a year boundary', () => {
    expect(addDaysToIsoDate('2026-12-15', 30)).toBe('2027-01-14');
  });

  it('handles a leap-year February correctly (2024)', () => {
    expect(addDaysToIsoDate('2024-01-31', 30)).toBe('2024-03-01');
    expect(addDaysToIsoDate('2024-02-01', 30)).toBe('2024-03-02');
  });

  it('does not shift by a day due to timezone -- pure UTC-labeled calendar math', () => {
    // A UTC-midnight-parse bug (new Date('2026-09-13')) formatted via local
    // getters would roll back a day in any timezone behind UTC. This stays
    // in UTC-labeled arithmetic throughout, so the result is fixed
    // regardless of the machine's local timezone running the test.
    expect(addDaysToIsoDate('2026-01-01', 1)).toBe('2026-01-02');
    expect(addDaysToIsoDate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('returns empty string for malformed or missing input, never throwing', () => {
    expect(addDaysToIsoDate('not-a-date', 30)).toBe('');
    expect(addDaysToIsoDate('', 30)).toBe('');
    expect(addDaysToIsoDate(undefined, 30)).toBe('');
    expect(addDaysToIsoDate('09/13/2026', 30)).toBe('');
  });
});
