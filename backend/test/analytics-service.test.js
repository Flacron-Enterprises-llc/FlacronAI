const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeStatus,
  groupCount,
  computeAverageCompletionHours,
  buildMonthlyUsage,
  pickBucketGranularity,
  buildTimeSeries,
  buildReportsPerUser,
  resolveRange,
} = require('../services/analyticsService');

test('normalizeStatus folds legacy statuses into finalized', () => {
  assert.equal(normalizeStatus('completed'), 'finalized');
  assert.equal(normalizeStatus('approved'), 'finalized');
  assert.equal(normalizeStatus('finalized'), 'finalized');
  assert.equal(normalizeStatus('draft'), 'draft');
  assert.equal(normalizeStatus(undefined), 'draft');
});

test('groupCount counts by an arbitrary key function, defaulting missing keys to Unspecified', () => {
  const out = groupCount([{ t: 'Initial' }, { t: 'Initial' }, { t: null }], (i) => i.t);
  assert.deepEqual(out, { Initial: 2, Unspecified: 1 });
});

test('computeAverageCompletionHours averages createdAt->reviewedAt only for finalized reports with valid dates', () => {
  const result = computeAverageCompletionHours([
    { status: 'finalized', createdAt: '2026-08-01T10:00:00Z', reviewedAt: '2026-08-02T10:00:00Z' }, // 24h
    { status: 'completed', createdAt: '2026-08-01T00:00:00Z', reviewedAt: '2026-08-01T12:00:00Z' }, // 12h, legacy status counts
    { status: 'draft', createdAt: '2026-08-01T00:00:00Z', reviewedAt: null }, // excluded: not finalized
    { status: 'finalized', createdAt: '2026-08-01T00:00:00Z', reviewedAt: null }, // excluded: no reviewedAt
  ]);
  assert.equal(result.sampleSize, 2);
  assert.equal(result.avgCompletionHours, 18);
});

test('computeAverageCompletionHours returns null (not a fabricated 0) with no qualifying reports', () => {
  const result = computeAverageCompletionHours([]);
  assert.equal(result.avgCompletionHours, null);
  assert.equal(result.sampleSize, 0);
});

test('buildMonthlyUsage returns a fixed-length rolling window with reports+photos per month', () => {
  const now = new Date('2026-08-15T12:00:00Z');
  const reports = [
    { createdAt: '2026-08-01T00:00:00Z', imageCount: 5 },
    { createdAt: '2026-08-10T00:00:00Z', imageCount: 3 },
    { createdAt: '2026-06-01T00:00:00Z', imageCount: 2 },
  ];
  const trend = buildMonthlyUsage(reports, { now, months: 6 });
  assert.equal(trend.length, 6);
  assert.equal(trend.at(-1).key, '2026-08');
  assert.equal(trend.at(-1).reports, 2);
  assert.equal(trend.at(-1).photos, 8);
  assert.equal(trend.at(-3).key, '2026-06');
  assert.equal(trend.at(-3).reports, 1);
});

test('pickBucketGranularity scales with range width', () => {
  const day = 86400000;
  assert.equal(pickBucketGranularity(new Date(0), new Date(20 * day)), 'day');
  assert.equal(pickBucketGranularity(new Date(0), new Date(90 * day)), 'week');
  assert.equal(pickBucketGranularity(new Date(0), new Date(400 * day)), 'month');
});

test('buildTimeSeries produces a gap-free daily series with zero-filled buckets', () => {
  const series = buildTimeSeries(
    [
      { createdAt: '2026-08-01T10:00:00Z', imageCount: 4 },
      { createdAt: '2026-08-01T22:00:00Z', imageCount: 6 },
      { createdAt: '2026-08-03T10:00:00Z', imageCount: 1 },
    ],
    { startDate: new Date('2026-08-01T00:00:00Z'), endDate: new Date('2026-08-03T23:59:59Z'), tzOffsetMinutes: 0, metric: 'count' }
  );
  assert.equal(series.length, 3);
  assert.equal(series[0].value, 2);
  assert.equal(series[1].value, 0);
  assert.equal(series[2].value, 1);
});

test('buildTimeSeries sums imageCount when metric is photos', () => {
  const series = buildTimeSeries(
    [{ createdAt: '2026-08-01T10:00:00Z', imageCount: 4 }, { createdAt: '2026-08-01T22:00:00Z', imageCount: 6 }],
    { startDate: new Date('2026-08-01T00:00:00Z'), endDate: new Date('2026-08-01T23:59:59Z'), tzOffsetMinutes: 0, metric: 'photos' }
  );
  assert.equal(series[0].value, 10);
});

test('buildTimeSeries respects a negative timezone offset when bucketing near a UTC day boundary', () => {
  // tzOffsetMinutes = -240 (UTC-4). Local midnight Aug 1 is UTC 04:00, and
  // local midnight Aug 3 (end of the Aug-2 local day) is UTC 03:59:59 the next
  // day -- both boundaries are expressed as the real UTC instants a frontend
  // computing local-calendar boundaries would actually send.
  // 2026-08-02T02:00:00Z is 2026-08-01 22:00 local at UTC-4 -- must bucket
  // into 08-01, not 08-02.
  const series = buildTimeSeries(
    [{ createdAt: '2026-08-02T02:00:00Z', imageCount: 1 }],
    { startDate: new Date('2026-08-01T04:00:00Z'), endDate: new Date('2026-08-03T03:59:59Z'), tzOffsetMinutes: -240, metric: 'count' }
  );
  assert.equal(series[0].key, '2026-08-01');
  assert.equal(series[0].value, 1);
  assert.equal(series[1].key, '2026-08-02');
  assert.equal(series[1].value, 0);
});

test('buildReportsPerUser attributes reports to roster members and zero-fills the rest, sorted descending', () => {
  const roster = [
    { uid: 'owner1', email: 'owner@x.com', role: 'owner' },
    { uid: 'adj1', email: 'adj@x.com', role: 'adjuster' },
    { uid: 'viewer1', email: 'viewer@x.com', role: 'viewer' },
  ];
  const rows = buildReportsPerUser(
    [
      { userId: 'adj1', imageCount: 5 },
      { userId: 'adj1', imageCount: 3 },
      { userId: 'owner1', imageCount: 1 },
      { userId: 'removed-member', imageCount: 99 }, // no longer on roster -- excluded, not mis-attributed
    ],
    roster
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[0].uid, 'adj1');
  assert.equal(rows[0].reportsGenerated, 2);
  assert.equal(rows[0].photosAnalyzed, 8);
  assert.equal(rows.find((r) => r.uid === 'viewer1').reportsGenerated, 0);
  const total = rows.reduce((sum, r) => sum + r.reportsGenerated, 0);
  assert.equal(total, 3); // the removed-member report is not counted anywhere
});

test('resolveRange supports presets, all-time, and a valid custom range, defaulting to 30d', () => {
  const now = new Date('2026-08-15T00:00:00Z');
  assert.equal(resolveRange({ range: '7d' }, now).label, 'Last 7 days');
  assert.equal(resolveRange({}, now).label, 'Last 30 days');
  assert.equal(resolveRange({ range: 'all' }, now).startDate.getTime(), 0);
  const custom = resolveRange({ startDate: '2026-08-01T00:00:00Z', endDate: '2026-08-05T00:00:00Z' }, now);
  assert.equal(custom.label, 'Custom range');
  assert.equal(custom.startDate.toISOString(), '2026-08-01T00:00:00.000Z');
});

test('resolveRange falls back to the 30d default when a custom range is invalid (end before start)', () => {
  const now = new Date('2026-08-15T00:00:00Z');
  const result = resolveRange({ startDate: '2026-08-10T00:00:00Z', endDate: '2026-08-01T00:00:00Z' }, now);
  assert.equal(result.label, 'Last 30 days');
});
