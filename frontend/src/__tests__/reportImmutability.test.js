import { describe, it, expect } from 'vitest';
import { isFinalizedReportStatus } from '../utils/reportImmutability.js';

// QA regression: a report with status 'finalized' could still be opened in
// edit mode, modified, and saved. `isFinalizedReportStatus` is the single
// shared predicate now gating every frontend edit surface for a report:
// - ReportPreviewPage.jsx hides the "Edit" action when it's true.
// - Dashboard.jsx / EnterpriseDashboard.jsx's embedded report editor
//   (reached either by generating a report, opening it from "My Reports",
//   or landing on the `?openReport=<id>` deep link the "Edit" action used
//   to navigate to) renders read-only and hides "Save Changes" when it's
//   true, regardless of how that view was reached.
// The actual security boundary is server-side (backend/routes/reports.js's
// isFinalizedContentEdit, backend/test/report-immutability.test.js) -- this
// only covers the UX-layer gate built on the same canonical status value.

describe('isFinalizedReportStatus', () => {
  it('is true only for the canonical "finalized" status', () => {
    expect(isFinalizedReportStatus('finalized')).toBe(true);
  });

  it('is false for draft/non-finalized reports (editing must keep working)', () => {
    expect(isFinalizedReportStatus('draft')).toBe(false);
    expect(isFinalizedReportStatus('processing')).toBe(false);
    expect(isFinalizedReportStatus('failed')).toBe(false);
    expect(isFinalizedReportStatus('archived')).toBe(false);
  });

  it('is false for the legacy reviewed states ("approved"/"completed") -- only the canonical status is newly locked, per the narrow scope of this fix', () => {
    expect(isFinalizedReportStatus('approved')).toBe(false);
    expect(isFinalizedReportStatus('completed')).toBe(false);
  });

  it('is false for missing/unset status (e.g. a report still loading)', () => {
    expect(isFinalizedReportStatus(undefined)).toBe(false);
    expect(isFinalizedReportStatus(null)).toBe(false);
    expect(isFinalizedReportStatus('')).toBe(false);
  });

  it('is not fooled by case/whitespace variants -- only an exact match counts', () => {
    expect(isFinalizedReportStatus('Finalized')).toBe(false);
    expect(isFinalizedReportStatus(' finalized')).toBe(false);
  });
});
