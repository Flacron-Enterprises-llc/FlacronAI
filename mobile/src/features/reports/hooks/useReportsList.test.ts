import { renderHook, act, waitFor } from '@testing-library/react-native';

import { ApiRequestError } from '@/types/api';
import { useReportsList } from './useReportsList';

const mockIsOffline = jest.fn();
jest.mock('@/services/api/offline', () => ({ isOffline: () => mockIsOffline() }));

const mockList = jest.fn();
jest.mock('@/services/api/reports', () => ({
  reportsApi: { list: (...args: unknown[]) => mockList(...args) },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockIsOffline.mockResolvedValue(false);
});

describe('useReportsList — offline state', () => {
  it('short-circuits to an offline state without calling the API when the device is known offline', async () => {
    mockIsOffline.mockResolvedValue(true);
    const { result } = await renderHook(() => useReportsList());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isOffline).toBe(true);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('classifies a network-failure ApiRequestError as the offline-flavored message', async () => {
    mockList.mockRejectedValue(new ApiRequestError('offline', { category: 'offline', isNetworkError: true }));
    const { result } = await renderHook(() => useReportsList());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/offline/i);
  });
});

describe('useReportsList — pagination', () => {
  it('appends the next page on loadMore instead of replacing the list', async () => {
    mockList
      .mockResolvedValueOnce({ success: true, data: [{ id: '1' }], total: 2, page: 1, limit: 20, hasMore: true })
      .mockResolvedValueOnce({ success: true, data: [{ id: '2' }], total: 2, page: 2, limit: 20, hasMore: false });

    const { result } = await renderHook(() => useReportsList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.reports.map((r) => r.id)).toEqual(['1']);

    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.loadingMore).toBe(false));

    expect(result.current.reports.map((r) => r.id)).toEqual(['1', '2']);
    expect(result.current.hasMore).toBe(false);
  });

  it('refresh replaces the list starting from page 1', async () => {
    mockList
      .mockResolvedValueOnce({ success: true, data: [{ id: '1' }], total: 1, page: 1, limit: 20, hasMore: false })
      .mockResolvedValueOnce({ success: true, data: [{ id: '2' }], total: 1, page: 1, limit: 20, hasMore: false });

    const { result } = await renderHook(() => useReportsList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.reports.map((r) => r.id)).toEqual(['2']);
  });
});
