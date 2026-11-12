import { tableColumnWidths } from './ReportMarkdown';

describe('FAI-003: markdown tables fit the phone width', () => {
  const header = ['Version', 'Date', 'Change Summary', 'Balance Due'];
  const rows = [['Rev. 2', '2026-11-06', 'Recorded $3,000 payment received from the insured by check after the inspection', '$0.00']];

  it('fits a 4-column revision history on a 360px phone without sideways scrolling', () => {
    const { widths, scroll } = tableColumnWidths(header, rows, 358);
    expect(scroll).toBe(false);
    expect(widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(358);
    // The long Change Summary column gets the most room.
    expect(Math.max(...widths)).toBe(widths[2]);
  });

  it('falls back to readable scrolling columns when there are too many', () => {
    const wide = Array.from({ length: 8 }, (_, i) => `Column ${i + 1}`);
    const { widths, scroll } = tableColumnWidths(wide, [wide], 358);
    expect(scroll).toBe(true);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(56);
  });
});
