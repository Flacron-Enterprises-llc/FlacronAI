// Generic, timezone-safe calendar-date arithmetic on plain YYYY-MM-DD
// strings (the same shape an <input type="date"> gives/takes). Never routed
// through the LOCAL Date constructor (`new Date(isoString)` parses as UTC
// midnight, and formatting that back out via local getters can roll the
// calendar day backward/forward by one near a DST boundary) -- everything
// here stays in UTC-labeled arithmetic purely as a calendar calculator, so
// the result is the same regardless of the viewer's timezone.
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Adds (or subtracts, for a negative `days`) whole calendar days to a
// YYYY-MM-DD string. Returns '' for anything that isn't a well-formed date,
// so callers can safely feed this directly from a possibly-still-empty
// <input type="date"> without a separate validity check.
export const addDaysToIsoDate = (isoDate, days) => {
  const match = ISO_DATE_RE.exec(isoDate);
  if (!match) return '';
  const [, year, month, day] = match;
  const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day)) + days * 86_400_000;
  const result = new Date(utcMs);
  const y = result.getUTCFullYear();
  const m = String(result.getUTCMonth() + 1).padStart(2, '0');
  const d = String(result.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
