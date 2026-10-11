import {
  clearPendingReport,
  parseReportIdFromUrl,
  peekPendingReport,
  rememberPendingReport,
  reportIdToRemember,
} from './pendingDeepLink';

jest.mock('expo-linking', () => ({ useURL: () => null }));

afterEach(() => clearPendingReport());

describe('parseReportIdFromUrl', () => {
  it.each([
    ['flacronai://report/abc123', 'abc123'],
    ['flacronai:///report/abc123', 'abc123'],
    ['flacronai://report/abc123/', 'abc123'],
    ['flacronai://report/abc123?ref=email', 'abc123'],
    ['exp://192.168.1.10:8081/--/report/r_9-x', 'r_9-x'],
    ['/report/abc', 'abc'],
  ])('%s → %s', (url, id) => {
    expect(parseReportIdFromUrl(url)).toBe(id);
  });

  it.each([null, '', 'flacronai://', 'flacronai://dashboard', 'flacronai://report/new', 'flacronai://report/../x', 'flacronai://reports/abc'])(
    'ignores %s',
    (url) => {
      expect(parseReportIdFromUrl(url as string | null)).toBeNull();
    }
  );
});

describe('reportIdToRemember', () => {
  it('remembers a report link that arrives while signed out (or mid sign-in)', () => {
    expect(reportIdToRemember('flacronai://report/abc', 'signed-out', null)).toBe('abc');
    expect(reportIdToRemember('flacronai://report/abc', 'needs-mfa', null)).toBe('abc');
  });

  it('waits for auth to resolve, and leaves authenticated links to the router', () => {
    expect(reportIdToRemember('flacronai://report/abc', 'loading', null)).toBeNull();
    expect(reportIdToRemember('flacronai://report/abc', 'authenticated', null)).toBeNull();
  });

  it('never re-remembers a URL already handled (e.g. the initial URL after a later sign-out)', () => {
    expect(reportIdToRemember('flacronai://report/abc', 'signed-out', 'flacronai://report/abc')).toBeNull();
  });
});

describe('pending report store', () => {
  it('remember → peek → clear', () => {
    rememberPendingReport('abc');
    expect(peekPendingReport()).toBe('abc');
    clearPendingReport('other'); // only clears a matching id
    expect(peekPendingReport()).toBe('abc');
    clearPendingReport('abc');
    expect(peekPendingReport()).toBeNull();
  });
});
