const test = require('node:test');
const assert = require('node:assert/strict');
const {
  redactMeta,
  shapeAuditLog,
  filterAuditLogs,
  paginate,
  buildRoleBreakdown,
} = require('../services/organizationService');

test('redactMeta strips keys that look like secrets/tokens/credentials, case-insensitively', () => {
  const out = redactMeta({
    url: 'https://example.com',
    secret: 'whsec_abcdef',
    apiKey: 'flac_live_xyz',
    api_key: 'flac_live_xyz2',
    Password: 'hunter2',
    accessToken: 'abc.def.ghi',
    privateKey: '-----BEGIN KEY-----',
    Authorization: 'Bearer xyz',
    role: 'admin',
  });
  assert.equal(out.url, 'https://example.com');
  assert.equal(out.role, 'admin');
  assert.equal(out.secret, '[redacted]');
  assert.equal(out.apiKey, '[redacted]');
  assert.equal(out.api_key, '[redacted]');
  assert.equal(out.Password, '[redacted]');
  assert.equal(out.accessToken, '[redacted]');
  assert.equal(out.privateKey, '[redacted]');
  assert.equal(out.Authorization, '[redacted]');
});

test('redactMeta recurses into one level of nested objects', () => {
  const out = redactMeta({ signature: { name: 'Jane', licenseNumber: 'TX-1' }, nested: { token: 'abc' } });
  assert.equal(out.signature.name, 'Jane');
  assert.equal(out.nested.token, '[redacted]');
});

test('redactMeta handles null/undefined/non-object meta gracefully', () => {
  assert.equal(redactMeta(null), null);
  assert.equal(redactMeta(undefined), null);
  assert.equal(redactMeta('a string'), 'a string');
});

test('shapeAuditLog produces a safe, consistent shape and truncates an oversized userAgent', () => {
  const longUA = 'x'.repeat(1000);
  const out = shapeAuditLog({
    id: 'doc1', actorUid: 'u1', actorEmail: 'a@x.com', action: 'login_success',
    targetType: null, targetId: null, meta: { secret: 'nope' }, ip: '1.2.3.4',
    userAgent: longUA, timestamp: '2026-08-18T00:00:00Z',
  });
  assert.equal(out.id, 'doc1');
  assert.equal(out.meta.secret, '[redacted]');
  assert.equal(out.userAgent.length, 300);
});

test('shapeAuditLog defaults a missing action to "unknown" rather than throwing', () => {
  const out = shapeAuditLog({ id: 'doc2' });
  assert.equal(out.action, 'unknown');
  assert.equal(out.actorUid, null);
});

test('filterAuditLogs filters by action, actorUid, targetType, and an inclusive date range', () => {
  const logs = [
    { action: 'login_success', actorUid: 'u1', targetType: null, timestamp: '2026-08-01T00:00:00Z' },
    { action: 'report_approved_finalized', actorUid: 'u1', targetType: 'report', timestamp: '2026-08-10T00:00:00Z' },
    { action: 'login_success', actorUid: 'u2', targetType: null, timestamp: '2026-08-15T00:00:00Z' },
  ];
  assert.equal(filterAuditLogs(logs, { action: 'login_success' }).length, 2);
  assert.equal(filterAuditLogs(logs, { actorUid: 'u2' }).length, 1);
  assert.equal(filterAuditLogs(logs, { targetType: 'report' }).length, 1);
  assert.equal(filterAuditLogs(logs, { startDate: '2026-08-05T00:00:00Z' }).length, 2);
  assert.equal(filterAuditLogs(logs, { endDate: '2026-08-05T00:00:00Z' }).length, 1);
  assert.equal(filterAuditLogs(logs, { startDate: '2026-08-01T00:00:00Z', endDate: '2026-08-10T00:00:00Z' }).length, 2);
  assert.equal(filterAuditLogs(logs, {}).length, 3);
});

test('filterAuditLogs excludes a log with no parseable timestamp when a date range is given', () => {
  const logs = [{ action: 'x', timestamp: 'not-a-date' }];
  assert.equal(filterAuditLogs(logs, { startDate: '2026-01-01T00:00:00Z' }).length, 0);
  assert.equal(filterAuditLogs(logs, {}).length, 1);
});

test('paginate slices correctly and reports accurate total/totalPages', () => {
  const items = Array.from({ length: 55 }, (_, i) => i);
  const page1 = paginate(items, 1, 25);
  assert.deepEqual(page1.items, items.slice(0, 25));
  assert.equal(page1.total, 55);
  assert.equal(page1.totalPages, 3);
  const page3 = paginate(items, 3, 25);
  assert.deepEqual(page3.items, items.slice(50, 55));
});

test('paginate clamps an out-of-range page to the last valid page instead of returning empty', () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  const page = paginate(items, 99, 5);
  assert.equal(page.page, 2);
  assert.deepEqual(page.items, items.slice(5, 10));
});

test('paginate enforces a maximum limit regardless of what is requested', () => {
  const items = Array.from({ length: 500 }, (_, i) => i);
  const page = paginate(items, 1, 10000);
  assert.equal(page.limit, 100);
  assert.equal(page.items.length, 100);
});

test('buildRoleBreakdown counts members by their real role label', () => {
  const roster = [
    { role: 'owner' }, { role: 'admin' }, { role: 'admin' }, { role: 'adjuster' }, { role: 'editor' },
  ];
  const out = buildRoleBreakdown(roster);
  assert.deepEqual(out, { Owner: 1, Admin: 2, Adjuster: 1, 'Editor (legacy)': 1 });
});
