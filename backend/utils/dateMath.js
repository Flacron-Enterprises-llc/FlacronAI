// Generic, timezone-safe calendar-date arithmetic on plain YYYY-MM-DD
// strings. Mirrors frontend/src/utils/dateMath.js exactly, so the server's
// authoritative calculation and the client's display never disagree. Never
// routed through the local Date constructor (`new Date(isoString)` parses as
// UTC midnight, and formatting that back out via local getters can roll the
// calendar day backward/forward by one) -- everything here stays in
// UTC-labeled arithmetic purely as a calendar calculator, independent of the
// server process's own timezone.
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Adds (or subtracts, for a negative `days`) whole calendar days to a
// YYYY-MM-DD string. Returns null for anything that isn't a well-formed date.
const addDaysToIsoDate = (isoDate, days) => {
  const match = ISO_DATE_RE.exec(isoDate);
  if (!match) return null;
  const [, year, month, day] = match;
  const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day)) + days * 86_400_000;
  const result = new Date(utcMs);
  const y = result.getUTCFullYear();
  const m = String(result.getUTCMonth() + 1).padStart(2, '0');
  const d = String(result.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

module.exports = { addDaysToIsoDate };
