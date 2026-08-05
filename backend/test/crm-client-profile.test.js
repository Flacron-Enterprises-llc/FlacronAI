const test = require('node:test');
const assert = require('node:assert/strict');
const { buildClientProfile } = require('../services/crmService');

test('client profile summarizes and orders linked activity', () => {
  const profile = buildClientProfile({ id: 'client-1', name: 'Example Client' }, {
    claims: [
      { id: 'closed', status: 'closed', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'open', status: 'open', createdAt: '2026-02-01T00:00:00Z' },
    ],
    appointments: [{ id: 'future', status: 'scheduled', date: '2999-01-01' }],
    reports: [{ id: 'old', createdAt: '2026-01-01T00:00:00Z' }, { id: 'new', createdAt: '2026-03-01T00:00:00Z' }],
  });
  assert.deepEqual(profile.summary, { totalClaims: 2, openClaims: 1, totalReports: 2, upcomingAppointments: 1 });
  assert.deepEqual(profile.claims.map(item => item.id), ['open', 'closed']);
  assert.deepEqual(profile.reports.map(item => item.id), ['new', 'old']);
});
