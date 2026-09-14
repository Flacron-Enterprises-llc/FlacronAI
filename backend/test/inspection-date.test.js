const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidIsoDate,
  getLocalTodayIso,
  isIsoDateAfter,
  formatIsoDateForDisplay,
} = require('../utils/inspectionDate');
const { buildReportPrompt } = require('../services/aiService');

// QA regression (root cause): the generic report path's "Date of Inspection"
// line in buildReportPrompt() (aiService.js) was hardcoded to
// `new Date().toLocaleDateString(...)` -- the generation-time date -- and
// never read the adjuster-selected `inspectionDate` field at all. Two manual
// tests with different selected dates both produced the same (current) date
// in the generated report. Fixed by threading `reportData.inspectionDate`
// through to a timezone-shift-safe formatter, with the old current-date
// behavior kept only as a fallback for reports that don't have one.

const SAMPLE_REPORT_DATA = {
  claimNumber: 'CLM-1001',
  insuredName: 'Robert & Lisa Chen',
  propertyAddress: '892 Oakwood Drive, Dallas, TX 75201',
  lossDate: '2026-09-03',
  lossType: 'Mold',
  reportType: 'Initial',
};

test('formatIsoDateForDisplay renders a selected past date exactly, without any timezone shift', () => {
  assert.equal(formatIsoDateForDisplay('2026-09-10'), 'September 10, 2026');
});

test('formatIsoDateForDisplay does not roll the calendar day at year/month boundaries', () => {
  // These are the dates most likely to expose a UTC-midnight-parse bug
  // (new Date('2026-01-01') formatted in a negative-UTC-offset timezone
  // would otherwise print as December 31, 2025).
  assert.equal(formatIsoDateForDisplay('2026-01-01'), 'January 1, 2026');
  assert.equal(formatIsoDateForDisplay('2026-12-31'), 'December 31, 2026');
  assert.equal(formatIsoDateForDisplay('2024-02-29'), 'February 29, 2024'); // leap day
});

test('formatIsoDateForDisplay returns null for missing/invalid input', () => {
  assert.equal(formatIsoDateForDisplay(''), null);
  assert.equal(formatIsoDateForDisplay(undefined), null);
  assert.equal(formatIsoDateForDisplay('09/10/2026'), null);
  assert.equal(formatIsoDateForDisplay('not-a-date'), null);
});

test('isValidIsoDate accepts only well-formed YYYY-MM-DD strings', () => {
  assert.equal(isValidIsoDate('2026-09-10'), true);
  assert.equal(isValidIsoDate('2026-9-10'), false);
  assert.equal(isValidIsoDate(''), false);
  assert.equal(isValidIsoDate(null), false);
});

test('isIsoDateAfter compares plain calendar dates correctly (used for the report-date boundary)', () => {
  const today = getLocalTodayIso(new Date(2026, 8, 13)); // 2026-09-13, matches QA date
  assert.equal(today, '2026-09-13');
  assert.equal(isIsoDateAfter('2026-09-12', today), false); // past date -- allowed
  assert.equal(isIsoDateAfter('2026-09-13', today), false); // equal to report date -- allowed
  assert.equal(isIsoDateAfter('2026-09-14', today), true); // future -- rejected
});

test('buildReportPrompt uses the selected inspectionDate for "Date of Inspection", not the generation date', () => {
  const prompt = buildReportPrompt({ ...SAMPLE_REPORT_DATA, inspectionDate: '2026-09-12' }, null);
  assert.match(prompt, /- Date of Inspection: September 12, 2026/);
});

test('buildReportPrompt reflects a different selected inspectionDate on a second call (not cached/stuck)', () => {
  const prompt = buildReportPrompt({ ...SAMPLE_REPORT_DATA, inspectionDate: '2026-09-15' }, null);
  assert.match(prompt, /- Date of Inspection: September 15, 2026/);
});

test('buildReportPrompt still shows the current date for "Report Date" independent of inspectionDate', () => {
  const prompt = buildReportPrompt({ ...SAMPLE_REPORT_DATA, inspectionDate: '2026-09-12' }, null);
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  assert.match(prompt, new RegExp(`- Report Date: ${todayFormatted}`));
});

test('buildReportPrompt falls back to the current date when inspectionDate is absent (historical reports)', () => {
  const prompt = buildReportPrompt(SAMPLE_REPORT_DATA, null);
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  assert.match(prompt, new RegExp(`- Date of Inspection: ${todayFormatted}`));
});

test('buildReportPrompt falls back to the current date when inspectionDate is malformed', () => {
  const prompt = buildReportPrompt({ ...SAMPLE_REPORT_DATA, inspectionDate: 'garbage' }, null);
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  assert.match(prompt, new RegExp(`- Date of Inspection: ${todayFormatted}`));
});
