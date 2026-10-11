import { isReportNotificationType, resolveNotificationTarget } from './pushPayload';

describe('resolveNotificationTarget', () => {
  it.each([
    'analysis_completed',
    'analysis_failed',
    'report_completed',
    'review_requested',
    'review_declined',
    'report_approved',
    'report_shared',
    'export_completed',
  ])('%s with a valid reportId opens that report', (type) => {
    expect(resolveNotificationTarget({ type, reportId: 'rep_123-A' })).toEqual({ kind: 'report', reportId: 'rep_123-A' });
  });

  it('falls back to the feed web link for the report id', () => {
    expect(resolveNotificationTarget({ type: 'report_approved', link: '/reports/abc123/preview' })).toEqual({
      kind: 'report',
      reportId: 'abc123',
    });
  });

  it('prefers reportId over link', () => {
    expect(resolveNotificationTarget({ type: 'report_approved', reportId: 'a', link: '/reports/b/preview' })).toEqual({
      kind: 'report',
      reportId: 'a',
    });
  });

  it.each(['team_invitation', 'subscription_issue'])('%s opens the dashboard', (type) => {
    expect(resolveNotificationTarget({ type })).toEqual({ kind: 'dashboard' });
  });

  it.each([
    ['null', null],
    ['a string', 'report_completed'],
    ['an array', [{ type: 'report_completed', reportId: 'a' }]],
    ['no type', { reportId: 'abc' }],
    ['unknown type', { type: 'something_new', reportId: 'abc' }],
    ['report type without id', { type: 'report_completed' }],
    ['path traversal id', { type: 'report_completed', reportId: '../admin' }],
    ['wizard route id', { type: 'report_completed', reportId: 'new' }],
    ['numeric id', { type: 'report_completed', reportId: 42 }],
    ['oversized id', { type: 'report_completed', reportId: 'a'.repeat(129) }],
    ['foreign link', { type: 'report_completed', link: 'https://evil.example/reports/abc' }],
    ['link with extra path', { type: 'report_completed', link: '/reports/abc/edit' }],
  ])('ignores %s', (_label, data) => {
    expect(resolveNotificationTarget(data)).toBeNull();
  });
});

describe('isReportNotificationType', () => {
  it('only accepts report-scoped types', () => {
    expect(isReportNotificationType('report_completed')).toBe(true);
    expect(isReportNotificationType('team_invitation')).toBe(false);
    expect(isReportNotificationType(undefined)).toBe(false);
  });
});
