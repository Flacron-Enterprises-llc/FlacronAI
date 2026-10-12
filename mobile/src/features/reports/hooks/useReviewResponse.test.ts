import { renderHook, act } from '@testing-library/react-native';

import type { Report } from '@/services/api/reports';
import { ApiRequestError } from '@/types/api';
import { applyReviewResponse, useReviewResponse } from './useReviewResponse';

const mockSubmit = jest.fn();
jest.mock('@/services/api/reports', () => ({
  REVIEWED_STATUSES: ['finalized', 'approved', 'completed'],
  reportsApi: { submitReviewResponse: (...args: unknown[]) => mockSubmit(...args) },
}));

const report = (status: Report['status']) =>
  ({ id: 'r1', status, reviewRequest: { reviewerUid: 'rev', status: 'pending' } }) as unknown as Report;

beforeEach(() => jest.clearAllMocks());

describe('applyReviewResponse', () => {
  it('reopens a finalized report to draft, as the route does', () => {
    const updated = applyReviewResponse(report('finalized'), { reviewerUid: 'rev', status: 'changes_requested' });
    expect(updated.status).toBe('draft');
    expect(updated.reviewRequest?.status).toBe('changes_requested');
  });

  it('leaves a draft as draft', () => {
    expect(applyReviewResponse(report('draft'), { reviewerUid: 'rev', status: 'rejected' }).status).toBe('draft');
  });
});

describe('useReviewResponse', () => {
  it('sends the decision with trimmed notes and reports the updated report', async () => {
    mockSubmit.mockResolvedValue({ success: true, message: 'ok', reviewRequest: { reviewerUid: 'rev', status: 'rejected', notes: 'No' } });
    const onResponded = jest.fn();
    const { result } = await renderHook(() => useReviewResponse(report('draft'), onResponded));

    let ok = false;
    await act(async () => {
      ok = await result.current.respond('rejected', '  No  ');
    });

    expect(ok).toBe(true);
    expect(mockSubmit).toHaveBeenCalledWith('r1', 'rejected', 'No');
    expect(onResponded).toHaveBeenCalledWith(expect.objectContaining({ reviewRequest: expect.objectContaining({ status: 'rejected' }) }));
  });

  it('omits empty notes', async () => {
    mockSubmit.mockResolvedValue({ success: true, message: 'ok', reviewRequest: { reviewerUid: 'rev', status: 'changes_requested' } });
    const { result } = await renderHook(() => useReviewResponse(report('draft'), jest.fn()));
    await act(async () => {
      await result.current.respond('changes_requested', '   ');
    });
    expect(mockSubmit).toHaveBeenCalledWith('r1', 'changes_requested', undefined);
  });

  it("surfaces the server's refusal (e.g. not the assigned reviewer) without reporting success", async () => {
    mockSubmit.mockRejectedValue(
      new ApiRequestError('You do not have a pending review request on this report.', {
        status: 403,
        code: 'NOT_ASSIGNED_REVIEWER',
        category: 'permission',
      })
    );
    const onResponded = jest.fn();
    const { result } = await renderHook(() => useReviewResponse(report('draft'), onResponded));

    let ok = true;
    await act(async () => {
      ok = await result.current.respond('rejected', '');
    });

    expect(ok).toBe(false);
    expect(onResponded).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/pending review request/);
  });

  it('a double tap sends only one response', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockSubmit.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = await renderHook(() => useReviewResponse(report('draft'), jest.fn()));

    await act(async () => {
      const first = result.current.respond('rejected', '');
      result.current.respond('rejected', '');
      resolve({ success: true, message: 'ok', reviewRequest: { reviewerUid: 'rev', status: 'rejected' } });
      await first;
    });
    expect(mockSubmit).toHaveBeenCalledTimes(1);
  });
});
