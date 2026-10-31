import { clearPendingReport, peekPendingReport } from '@/features/navigation/pendingDeepLink';
import { createTapRouter } from './notificationRouting';

jest.mock('expo-linking', () => ({ useURL: () => null }));

const nav = () => ({ openReport: jest.fn(), openDashboard: jest.fn() });
const reportTap = (id: string, reportId = 'r1') => ({ id, data: { type: 'report_completed', reportId } });

afterEach(() => clearPendingReport());

describe('createTapRouter', () => {
  it('opens the report when signed in', () => {
    const route = createTapRouter();
    const n = nav();
    expect(route(reportTap('n1'), 'authenticated', n)).toBe('navigated');
    expect(n.openReport).toHaveBeenCalledWith('r1');
    expect(peekPendingReport()).toBeNull();
  });

  it('opens the dashboard for account-level events', () => {
    const route = createTapRouter();
    const n = nav();
    expect(route({ id: 'n1', data: { type: 'subscription_issue' } }, 'authenticated', n)).toBe('navigated');
    expect(n.openDashboard).toHaveBeenCalled();
  });

  it.each(['signed-out', 'needs-mfa', 'needs-email-verification', 'loading'] as const)(
    'defers a report tap through sign-in when %s (no navigation past the guard)',
    (status) => {
      const route = createTapRouter();
      const n = nav();
      expect(route(reportTap('n1', 'r9'), status, n)).toBe('deferred-until-sign-in');
      expect(n.openReport).not.toHaveBeenCalled();
      expect(peekPendingReport()).toBe('r9');
    }
  );

  it('does nothing for an account-level tap while signed out', () => {
    const route = createTapRouter();
    const n = nav();
    expect(route({ id: 'n1', data: { type: 'team_invitation' } }, 'signed-out', n)).toBe('ignored-signed-out');
    expect(n.openDashboard).not.toHaveBeenCalled();
  });

  it('navigates once per notification (launch check + live listener / redelivery)', () => {
    const route = createTapRouter();
    const n = nav();
    route(reportTap('n1'), 'authenticated', n);
    expect(route(reportTap('n1'), 'authenticated', n)).toBe('ignored-duplicate');
    expect(n.openReport).toHaveBeenCalledTimes(1);
    expect(route(reportTap('n2'), 'authenticated', n)).toBe('navigated');
    expect(n.openReport).toHaveBeenCalledTimes(2);
  });

  it('ignores malformed payloads without navigating', () => {
    const route = createTapRouter();
    const n = nav();
    expect(route({ id: 'n1', data: { type: 'report_completed', reportId: '../x' } }, 'authenticated', n)).toBe('ignored-invalid');
    expect(route({ id: 'n2', data: null }, 'authenticated', n)).toBe('ignored-invalid');
    expect(n.openReport).not.toHaveBeenCalled();
    expect(n.openDashboard).not.toHaveBeenCalled();
  });
});
