import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useReportComments } from './useReportComments';
import { useReportVersions } from './useReportVersions';

const mockGetVersions = jest.fn();
const mockGetComments = jest.fn();
jest.mock('@/services/api/reports', () => ({
  reportsApi: {
    getVersions: (...a: unknown[]) => mockGetVersions(...a),
    getComments: (...a: unknown[]) => mockGetComments(...a),
  },
}));

beforeEach(() => jest.clearAllMocks());

// Phase 9 — a report screen whose route id changes (deep link / notification tap).
describe('report sub-resource hooks follow the current report id', () => {
  it('versions: a new report id loads its own versions (previously stayed on the first report)', async () => {
    mockGetVersions.mockImplementation((id: string) => Promise.resolve({ success: true, versions: [{ note: `${id}-v1` }] }));
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useReportVersions(id, true), { initialProps: { id: 'r1' } });
    await waitFor(() => expect(result.current.versions[0]?.note).toBe('r1-v1'));
    await rerender({ id: 'r2' });
    await waitFor(() => expect(result.current.versions[0]?.note).toBe('r2-v1'));
    expect(mockGetVersions).toHaveBeenCalledTimes(2);
  });

  it('comments: a late response for the previous report is dropped', async () => {
    let resolveOld: (v: unknown) => void = () => {};
    mockGetComments.mockImplementation((id: string) =>
      id === 'r1' ? new Promise((r) => (resolveOld = r)) : Promise.resolve({ success: true, comments: [{ id: 'c2' }] })
    );
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useReportComments(id), { initialProps: { id: 'r1' } });
    await rerender({ id: 'r2' });
    await waitFor(() => expect(result.current.comments[0]?.id).toBe('c2'));
    await act(async () => {
      resolveOld({ success: true, comments: [{ id: 'c1' }] });
    });
    expect(result.current.comments.map((c) => c.id)).toEqual(['c2']);
  });
});
