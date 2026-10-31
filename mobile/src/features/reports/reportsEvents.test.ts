import { STALE_AFTER_MS, getReportsVersion, notifyReportsChanged, shouldRefreshOnFocus } from './reportsEvents';

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

describe('shouldRefreshOnFocus — refresh lists only when they may be out of date', () => {
  it('does not refetch on a plain tab switch when nothing changed and data is fresh', () => {
    const now = 1_000_000;
    expect(shouldRefreshOnFocus({ version: getReportsVersion(), loadedAt: now - 1000 }, getReportsVersion(), now)).toBe(false);
  });

  it('refreshes after a report was created/approved/responded to elsewhere', () => {
    const now = 1_000_000;
    const snapshot = { version: getReportsVersion(), loadedAt: now - 1000 };
    notifyReportsChanged();
    expect(shouldRefreshOnFocus(snapshot, getReportsVersion(), now)).toBe(true);
  });

  it('refreshes once data is stale even without a signalled change', () => {
    const now = 1_000_000;
    expect(shouldRefreshOnFocus({ version: getReportsVersion(), loadedAt: now - STALE_AFTER_MS }, getReportsVersion(), now)).toBe(true);
  });
});
