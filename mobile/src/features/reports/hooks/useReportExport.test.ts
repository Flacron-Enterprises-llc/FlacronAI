import { renderHook, act } from '@testing-library/react-native';

import { ApiRequestError } from '@/types/api';
import { useReportExport } from './useReportExport';

const mockExportReport = jest.fn();
const mockDownloadExport = jest.fn();
jest.mock('@/services/api/reports', () => ({
  reportsApi: {
    exportReport: (...args: unknown[]) => mockExportReport(...args),
    downloadExport: (...args: unknown[]) => mockDownloadExport(...args),
  },
}));

// Every jest.mock() call (regardless of where it's physically written in this file) is
// hoisted above every other statement, including `const`s declared earlier in source order —
// so a `class` referenced by a factory must be declared INSIDE the factory itself
// (self-contained), not as an outer reference. `mockWrite`/`mockDelete` are still safe to
// reference from inside them because they're only ever invoked lazily, from a method body,
// well after this file has fully evaluated (same pattern AuthProvider.test.tsx documents
// for plain function mocks).
const mockWrite = jest.fn();
const mockDelete = jest.fn();
jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(_dir: unknown, name: string) {
      this.uri = `file:///exports/${name}`;
    }
    write(bytes: Uint8Array) {
      mockWrite(bytes);
    }
  }
  class MockDirectory {
    exists = false;
    create() {}
    delete() {
      mockDelete();
    }
  }
  return { File: MockFile, Directory: MockDirectory, Paths: { cache: {} } };
});

const mockIsAvailableAsync = jest.fn();
const mockShareAsync = jest.fn();
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockIsAvailableAsync(),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockExportReport.mockResolvedValue({ success: true, downloadUrl: 'ignored', expiresAt: '2026-01-01T00:00:00Z', format: 'pdf', filename: 'report.pdf' });
  mockDownloadExport.mockResolvedValue({ data: new ArrayBuffer(4), contentType: 'application/pdf', contentDisposition: null });
  mockIsAvailableAsync.mockResolvedValue(true);
  mockShareAsync.mockResolvedValue(undefined);
});

describe('useReportExport — happy path', () => {
  it('downloads through the authenticated client, writes the file, and opens the share sheet', async () => {
    const { result } = await renderHook(() => useReportExport('report-1'));
    let outcome;
    await act(async () => {
      outcome = await result.current.exportAndShare({ format: 'pdf' });
    });

    expect(mockExportReport).toHaveBeenCalledWith('report-1', { format: 'pdf' });
    expect(mockDownloadExport).toHaveBeenCalledWith('report-1', 'report.pdf');
    expect(mockWrite).toHaveBeenCalled();
    expect(mockShareAsync).toHaveBeenCalledWith(expect.stringContaining('report.pdf'), expect.objectContaining({ mimeType: 'application/pdf' }));
    expect(outcome).toMatchObject({ status: 'shared', uri: expect.stringContaining('report.pdf') });
  });

  it('clears any previously exported file before writing the new one', async () => {
    const { result } = await renderHook(() => useReportExport('report-1'));
    await act(async () => {
      await result.current.exportAndShare();
    });
    expect(mockDelete).not.toHaveBeenCalled(); // directory didn't exist yet on a fresh run
  });
});

describe('useReportExport — unavailable share capability', () => {
  it('reports saved-only without calling shareAsync when sharing is unavailable on this device', async () => {
    mockIsAvailableAsync.mockResolvedValue(false);
    const { result } = await renderHook(() => useReportExport('report-1'));
    let outcome;
    await act(async () => {
      outcome = await result.current.exportAndShare();
    });

    expect(mockShareAsync).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ status: 'saved-only' });
  });
});

describe('useReportExport — cancelled/failed share does not lose the downloaded file', () => {
  it('reports share-failed (not a hard error) when the share sheet itself throws', async () => {
    mockShareAsync.mockRejectedValue(new Error('User cancelled'));
    const { result } = await renderHook(() => useReportExport('report-1'));
    let outcome;
    await act(async () => {
      outcome = await result.current.exportAndShare();
    });

    expect(outcome).toMatchObject({ status: 'share-failed', message: 'User cancelled' });
    expect(result.current.error).toBeNull(); // the export itself still succeeded
  });
});

describe('useReportExport — server/offline errors surface the client\'s own safe message', () => {
  it('offline: downloadExport rejecting with an offline-category ApiRequestError surfaces its message', async () => {
    mockDownloadExport.mockRejectedValue(
      new ApiRequestError('You appear to be offline. Check your connection and try again.', { category: 'offline', retryable: true })
    );

    const { result } = await renderHook(() => useReportExport('report-1'));
    let outcome;
    await act(async () => {
      outcome = await result.current.exportAndShare();
    });

    expect(outcome).toEqual({ status: 'error', message: 'You appear to be offline. Check your connection and try again.' });
    expect(result.current.error).toBe('You appear to be offline. Check your connection and try again.');
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('expired auth: an auth_fatal ApiRequestError from the export job itself is surfaced, not swallowed', async () => {
    mockExportReport.mockRejectedValue(new ApiRequestError('Your session has expired. Please sign in again.', { category: 'auth_fatal', status: 401 }));

    const { result } = await renderHook(() => useReportExport('report-1'));
    let outcome;
    await act(async () => {
      outcome = await result.current.exportAndShare();
    });

    expect(outcome).toEqual({ status: 'error', message: 'Your session has expired. Please sign in again.' });
    expect(mockDownloadExport).not.toHaveBeenCalled();
  });
});
