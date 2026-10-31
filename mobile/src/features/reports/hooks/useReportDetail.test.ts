import { renderHook, act, waitFor } from '@testing-library/react-native';

import { ApiRequestError } from '@/types/api';
import { MAX_POLL_BACKOFF_MS, POLL_INTERVAL_MS, nextPollDelay, useReportDetail } from './useReportDetail';

const mockGet = jest.fn();
const mockRetryAnalysis = jest.fn();
jest.mock('@/services/api/reports', () => ({
  reportsApi: {
    get: (...args: unknown[]) => mockGet(...args),
    retryAnalysis: (...args: unknown[]) => mockRetryAnalysis(...args),
  },
}));

const base = {
  id: 'r1',
  userId: 'u',
  claimNumber: 'CLM-1',
  content: null,
  status: 'processing',
};
const ok = (overrides: Record<string, unknown> = {}) => ({ success: true, report: { ...base, ...overrides }, myAccess: 'owner' });
const offline = () => new ApiRequestError('You appear to be offline.', { category: 'offline', retryable: true, isNetworkError: true });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => {
  jest.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('nextPollDelay', () => {
  it('backs off exponentially after consecutive failures, capped', () => {
    expect(nextPollDelay(0)).toBe(POLL_INTERVAL_MS);
    expect(nextPollDelay(1)).toBe(POLL_INTERVAL_MS * 2);
    expect(nextPollDelay(2)).toBe(POLL_INTERVAL_MS * 4);
    expect(nextPollDelay(10)).toBe(MAX_POLL_BACKOFF_MS);
  });
});

describe('useReportDetail — polling', () => {
  it('keeps polling through a transient error instead of stopping, then picks up completion', async () => {
    mockGet
      .mockResolvedValueOnce(ok())
      .mockRejectedValueOnce(offline())
      .mockResolvedValueOnce(ok({ status: 'draft', content: 'Done' }));

    const { result } = await renderHook(() => useReportDetail('r1'));
    await waitFor(() => expect(result.current.report?.status).toBe('processing'));
    expect(result.current.myAccess).toBe('owner');

    await advance(POLL_INTERVAL_MS); // poll #2 fails (offline)
    await waitFor(() => expect(result.current.pollIssue).toMatch(/offline/i));
    expect(result.current.report?.status).toBe('processing'); // last good report stays on screen
    expect(result.current.error).toBeNull();

    await advance(nextPollDelay(1)); // backoff retry succeeds
    await waitFor(() => expect(result.current.report?.status).toBe('draft'));
    expect(result.current.pollIssue).toBeNull();
    expect(mockGet).toHaveBeenCalledTimes(3);

    await advance(MAX_POLL_BACKOFF_MS * 2); // no longer processing → no further polls
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it('a manual refresh mid-poll never starts a second polling loop', async () => {
    mockGet.mockResolvedValue(ok());
    const { result } = await renderHook(() => useReportDetail('r1'));
    await waitFor(() => expect(result.current.report).not.toBeNull());
    expect(mockGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });
    expect(mockGet).toHaveBeenCalledTimes(2);

    await advance(POLL_INTERVAL_MS);
    // One timer → exactly one more poll, not two.
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it('stops on a non-recoverable error and says so, without discarding the report', async () => {
    mockGet
      .mockResolvedValueOnce(ok())
      .mockRejectedValueOnce(new ApiRequestError('Report not found', { status: 404, code: 'NOT_FOUND', category: 'not_found' }));

    const { result } = await renderHook(() => useReportDetail('r1'));
    await waitFor(() => expect(result.current.report).not.toBeNull());
    await advance(POLL_INTERVAL_MS);

    await waitFor(() => expect(result.current.pollingStopped).toBe(true));
    expect(result.current.pollIssue).toMatch(/Report not found/);
    expect(result.current.report?.id).toBe('r1');

    await advance(MAX_POLL_BACKOFF_MS * 2);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('an initial-load failure surfaces as error (nothing to show yet)', async () => {
    mockGet.mockRejectedValueOnce(offline());
    const { result } = await renderHook(() => useReportDetail('r1'));
    await waitFor(() => expect(result.current.error).toMatch(/offline/i));
    expect(result.current.report).toBeNull();
  });

  it('does not poll a failed report; exposes its pipeline error', async () => {
    mockGet.mockResolvedValueOnce(ok({ status: 'failed', pipelineError: 'Model timeout' }));
    const { result } = await renderHook(() => useReportDetail('r1'));
    await waitFor(() => expect(result.current.report?.status).toBe('failed'));
    expect(result.current.report?.pipelineError).toBe('Model timeout');
    await advance(POLL_INTERVAL_MS * 3);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

describe('useReportDetail — retry analysis', () => {
  it('retrying a failed report resumes polling', async () => {
    mockGet.mockResolvedValueOnce(ok({ status: 'failed' })).mockResolvedValue(ok({ status: 'processing' }));
    mockRetryAnalysis.mockResolvedValue({ success: true, message: 'Retrying analysis' });

    const { result } = await renderHook(() => useReportDetail('r1'));
    await waitFor(() => expect(result.current.report?.status).toBe('failed'));

    await act(async () => {
      await result.current.retryAnalysis();
    });
    expect(mockRetryAnalysis).toHaveBeenCalledWith('r1');
    expect(result.current.report?.status).toBe('processing');
    const calls = mockGet.mock.calls.length;
    await advance(POLL_INTERVAL_MS);
    expect(mockGet.mock.calls.length).toBe(calls + 1);
  });

  it('ALREADY_PROCESSING is not an error — it just refreshes', async () => {
    mockGet.mockResolvedValueOnce(ok({ status: 'failed' })).mockResolvedValue(ok({ status: 'processing' }));
    mockRetryAnalysis.mockRejectedValue(
      new ApiRequestError('This report is already being processed.', { status: 409, code: 'ALREADY_PROCESSING', category: 'conflict' })
    );
    const { result } = await renderHook(() => useReportDetail('r1'));
    await waitFor(() => expect(result.current.report?.status).toBe('failed'));

    await act(async () => {
      await result.current.retryAnalysis();
    });
    expect(result.current.actionError).toBeNull();
    expect(result.current.report?.status).toBe('processing');
  });

  it('any other retry failure is shown as an action error', async () => {
    mockGet.mockResolvedValueOnce(ok({ status: 'failed' }));
    mockRetryAnalysis.mockRejectedValue(
      new ApiRequestError('Nothing needs retrying on this report.', { status: 400, code: 'NOTHING_TO_RETRY', category: 'validation' })
    );
    const { result } = await renderHook(() => useReportDetail('r1'));
    await waitFor(() => expect(result.current.report?.status).toBe('failed'));

    await act(async () => {
      await result.current.retryAnalysis();
    });
    expect(result.current.actionError).toBe('Nothing needs retrying on this report.');
    expect(result.current.retryingAnalysis).toBe(false);
  });
});

describe('useReportDetail — report id change (Phase 9)', () => {
  it('a late response for the previous report never replaces the new one', async () => {
    let resolveOld: (v: unknown) => void = () => {};
    mockGet.mockImplementation((id: string) =>
      id === 'r1' ? new Promise((r) => (resolveOld = r)) : Promise.resolve(ok({ id: 'r2', claimNumber: 'CLM-2', status: 'draft' }))
    );
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useReportDetail(id), { initialProps: { id: 'r1' } });
    await rerender({ id: 'r2' });
    await waitFor(() => expect(result.current.report?.id).toBe('r2'));
    await act(async () => {
      resolveOld(ok({ id: 'r1', claimNumber: 'CLM-1', status: 'draft' }));
    });
    expect(result.current.report?.id).toBe('r2');
    expect(result.current.report?.claimNumber).toBe('CLM-2');
  });
});
