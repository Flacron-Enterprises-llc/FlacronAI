const test = require('node:test');
const assert = require('node:assert/strict');
const { buildClaimProfile } = require('../services/crmService');

test('claim profile summarizes and orders linked reports', () => {
  const profile = buildClaimProfile({ id: 'claim-1', claimNumber: 'CLM-1' }, {
    client: { id: 'client-1', name: 'Example Client' },
    reports: [
      { id: 'draft', status: 'draft', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'final', status: 'finalized', createdAt: '2026-02-01T00:00:00Z' },
    ],
  });
  assert.deepEqual(profile.summary, {
    totalReports: 2, drafts: 1, finalized: 1, latestReportAt: '2026-02-01T00:00:00Z',
  });
  assert.deepEqual(profile.reports.map(report => report.id), ['final', 'draft']);
  assert.equal(profile.client.name, 'Example Client');
});
