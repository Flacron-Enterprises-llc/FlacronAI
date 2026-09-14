// Plain YYYY-MM-DD calendar-date helpers for the Inspection/Discovery Date
// field. Comparisons and display formatting operate on the string/parts
// directly -- never through `new Date(isoString)` -- because that parses the
// string as UTC midnight, and formatting it back out in the server's local
// timezone can roll the calendar day backward or forward by one day.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const isValidIsoDate = (value) => typeof value === 'string' && ISO_DATE_RE.test(value);

// Today's calendar date (local time, matching how "Report Date" is displayed
// elsewhere via `new Date().toLocaleDateString(...)` with no explicit zone).
const getLocalTodayIso = (referenceDate = new Date()) => {
  const y = referenceDate.getFullYear();
  const m = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const d = String(referenceDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Fixed-width YYYY-MM-DD strings sort lexically the same as chronologically.
const isIsoDateAfter = (isoDate, referenceIsoDate) => isoDate > referenceIsoDate;

const formatIsoDateForDisplay = (isoDate) => {
  if (!isValidIsoDate(isoDate)) return null;
  const [year, month, day] = isoDate.split('-');
  const monthIndex = Number(month) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return `${MONTH_NAMES[monthIndex]} ${Number(day)}, ${year}`;
};

module.exports = {
  ISO_DATE_RE,
  isValidIsoDate,
  getLocalTodayIso,
  isIsoDateAfter,
  formatIsoDateForDisplay,
};
