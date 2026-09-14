const test = require('node:test');
const assert = require('node:assert/strict');
const { addDaysToIsoDate } = require('../utils/dateMath');

// Generic calendar-date arithmetic used by the Invoice Due Date QA fix
// (backend/utils/invoiceCalculations.js) and mirrored on the frontend
// (frontend/src/utils/dateMath.js) so client display and server-authoritative
// storage never disagree.

test('adds a simple number of days within the same month', () => {
  assert.equal(addDaysToIsoDate('2026-09-01', 10), '2026-09-11');
});

test('confirmed reproduction: 2026-09-13 + 30 days = 2026-10-13', () => {
  assert.equal(addDaysToIsoDate('2026-09-13', 30), '2026-10-13');
});

test('2026-09-09 + 30 days = 2026-10-09', () => {
  assert.equal(addDaysToIsoDate('2026-09-09', 30), '2026-10-09');
});

test('crosses a month boundary with a shorter following month', () => {
  assert.equal(addDaysToIsoDate('2026-01-31', 30), '2026-03-02'); // Feb 2026 has 28 days
});

test('crosses a year boundary', () => {
  assert.equal(addDaysToIsoDate('2026-12-15', 30), '2027-01-14');
});

test('handles a leap-year February correctly (2024)', () => {
  assert.equal(addDaysToIsoDate('2024-01-31', 30), '2024-03-01');
  assert.equal(addDaysToIsoDate('2024-02-01', 30), '2024-03-02');
});

test("a non-leap-year February is one day short of a leap year's (sanity cross-check)", () => {
  assert.equal(addDaysToIsoDate('2025-01-31', 30), '2025-03-02'); // 2025 is not a leap year
});

test('is stable across repeated calls -- does not mutate/carry state between invocations', () => {
  const a = addDaysToIsoDate('2026-01-01', 30);
  const b = addDaysToIsoDate('2026-06-01', 30);
  assert.equal(a, '2026-01-31');
  assert.equal(b, '2026-07-01');
});

test('returns null for malformed or empty input rather than throwing', () => {
  assert.equal(addDaysToIsoDate('not-a-date', 30), null);
  assert.equal(addDaysToIsoDate('', 30), null);
  assert.equal(addDaysToIsoDate(undefined, 30), null);
  assert.equal(addDaysToIsoDate('09/13/2026', 30), null); // wrong separator/order
});

test('supports negative offsets (subtracting days) for completeness of the calendar-math contract', () => {
  assert.equal(addDaysToIsoDate('2026-10-13', -30), '2026-09-13');
});
