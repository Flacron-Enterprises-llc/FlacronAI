// Plain YYYY-MM-DD calendar-date helpers for the Inspection Date field in the
// Generate Report wizard (Dashboard.jsx). Mirrors backend/utils/inspectionDate.js.
//
// Local (not UTC) calendar date, matching the plain YYYY-MM-DD an
// <input type="date"> gives us -- avoids the off-by-one-day shift that
// `new Date().toISOString()` can introduce near midnight in timezones ahead
// of UTC. The report is generated "now", so this also doubles as the report
// date for the inspection-date-cannot-be-later-than-report-date check.
export const getLocalTodayIso = (referenceDate = new Date()) => {
  const y = referenceDate.getFullYear();
  const m = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const d = String(referenceDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Fixed-width YYYY-MM-DD strings sort lexically the same as chronologically.
export const isInspectionDateAfterReportDate = (inspectionDateIso, referenceDate = new Date()) =>
  Boolean(inspectionDateIso) && inspectionDateIso > getLocalTodayIso(referenceDate);
