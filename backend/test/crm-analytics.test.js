const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDashboardAnalytics } = require('../services/crmService');

test('CRM analytics computes tenant dashboard metrics from complete record sets', () => {
  const analytics = buildDashboardAnalytics({
    clients: [{ id: 'c1' }, { id: 'c2' }],
    claims: [
      { id: 'newer', claimNumber: 'CLM-2', status: 'pending-review', lossType: 'Water', createdAt: '2026-08-02T10:00:00Z' },
      { id: 'older', claimNumber: 'CLM-1', status: 'closed', lossType: 'Fire', createdAt: '2026-07-01T10:00:00Z' },
      { id: 'open', claimNumber: 'CLM-3', status: 'open', lossType: 'Water', createdAt: 'invalid' },
    ],
    appointments: [
      { status: 'scheduled', date: '2026-08-01' },
      { status: 'completed', date: '2026-07-01' },
      { status: 'scheduled', date: '2026-08-03' },
    ],
    reports: [
      { status: 'finalized', createdAt: '2026-08-01T10:00:00Z', reviewedAt: '2026-08-02T10:00:00Z' },
      { status: 'draft', createdAt: '2026-08-02T09:00:00Z' },
      { status: 'failed', createdAt: '2026-07-01T09:00:00Z' },
    ],
  }, new Date('2026-08-02T12:00:00Z'));

  assert.equal(analytics.totalClients, 2);
  assert.equal(analytics.totalClaims, 3);
  assert.equal(analytics.openClaims, 2);
  assert.equal(analytics.overdueAppointments, 1);
  assert.equal(analytics.reportsAwaitingReview, 1);
  assert.equal(analytics.reportsThisMonth, 2);
  assert.equal(analytics.finalizationRate, 33);
  assert.equal(analytics.averageTurnaroundHours, 24);
  assert.deepEqual(analytics.claimsByStatus, { 'pending-review': 1, closed: 1, open: 1 });
  assert.deepEqual(analytics.claimsByLossType, { Water: 2, Fire: 1 });
  assert.equal(analytics.usageTrend.length, 6);
  assert.equal(analytics.usageTrend.at(-1).reports, 2);
  assert.equal(analytics.recentClaims[0].id, 'newer');
});

test('CRM analytics returns honest zero/null values for an empty account', () => {
  const analytics = buildDashboardAnalytics({}, new Date('2026-08-02T12:00:00Z'));
  assert.equal(analytics.finalizationRate, 0);
  assert.equal(analytics.averageTurnaroundHours, null);
  assert.deepEqual(analytics.claimsByStatus, {});
  assert.deepEqual(analytics.recentClaims, []);
});
