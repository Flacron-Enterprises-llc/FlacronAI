const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('../routes/teams');

test('team members remain newest-first without a Firestore orderBy index', () => {
  const members = [
    { id: 'old', invitedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'missing' },
    { id: 'new', invitedAt: '2026-07-01T00:00:00.000Z' },
  ];

  assert.deepEqual(members.sort(router._test.byNewestInvite).map(member => member.id), [
    'new',
    'old',
    'missing',
  ]);
});
