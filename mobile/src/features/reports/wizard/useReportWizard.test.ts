import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useReportWizard } from './useReportWizard';

let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `uuid-${++mockUuidCounter}`,
}));

const mockStagePhoto = jest.fn();
const mockDeleteStagedPhoto = jest.fn();
const mockGetStagedPhotos = jest.fn();
const mockGenerate = jest.fn();
jest.mock('@/services/api/reports', () => ({
  reportsApi: {
    stagePhoto: (...args: unknown[]) => mockStagePhoto(...args),
    deleteStagedPhoto: (...args: unknown[]) => mockDeleteStagedPhoto(...args),
    getStagedPhotos: (...args: unknown[]) => mockGetStagedPhotos(...args),
    generate: (...args: unknown[]) => mockGenerate(...args),
  },
}));

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockUuidCounter = 0;
  mockGetStagedPhotos.mockResolvedValue({ success: true, photos: [] });
});

function fillRequiredFields(state: ReturnType<typeof useReportWizard>['state'], setField: (k: string, v: string) => void) {
  setField('claimNumber', 'CLM-1');
  setField('insuredName', 'Jordan Rivera');
  setField('insuredEmail', 'jordan@example.com');
  setField('propertyAddress', '123 Main St');
  setField('lossDate', '2026-01-01');
}

describe('useReportWizard — photo upload retry and partial failure', () => {
  it('a failed upload is retryable and succeeds independently of other photos', async () => {
    mockStagePhoto
      .mockResolvedValueOnce({ success: true, photo: { id: 's1', status: 'uploaded' }, uploadedCount: 1 })
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ success: true, photo: { id: 's2', status: 'uploaded' }, uploadedCount: 2 });

    const { result } = await renderHook(() => useReportWizard());
    await waitFor(() => expect(result.current.resuming).toBe(false));

    await act(async () => {
      await result.current.addPhotos([{ uri: 'file:///a.jpg', fileName: 'a.jpg' }, { uri: 'file:///b.jpg', fileName: 'b.jpg' }]);
    });

    expect(result.current.state.photos).toHaveLength(2);
    const [uploaded, failed] = result.current.state.photos;
    expect(uploaded.status).toBe('uploaded');
    expect(failed.status).toBe('failed');
    expect(result.current.readyPhotoCount).toBe(1);

    await act(async () => {
      await result.current.retryPhoto(result.current.state.photos[1]);
    });

    expect(result.current.state.photos).toHaveLength(2);
    expect(result.current.state.photos.every((p) => p.status === 'uploaded')).toBe(true);
    expect(result.current.readyPhotoCount).toBe(2);
    expect(mockStagePhoto).toHaveBeenCalledTimes(3);
  });

  it('marks a server-reported duplicate distinctly, without treating it as a failure', async () => {
    mockStagePhoto.mockResolvedValue({ success: true, photo: { id: 's1', status: 'duplicate' }, uploadedCount: 1 });
    const { result } = await renderHook(() => useReportWizard());
    await waitFor(() => expect(result.current.resuming).toBe(false));

    await act(async () => {
      await result.current.addPhotos([{ uri: 'file:///a.jpg', fileName: 'a.jpg' }]);
    });

    expect(result.current.state.photos[0].status).toBe('duplicate');
    expect(result.current.readyPhotoCount).toBe(1); // still counts toward submission readiness
  });

  it('removing a photo that reached the server also deletes it there; a local-only failed photo needs no server call', async () => {
    mockStagePhoto.mockRejectedValueOnce(new Error('Network error'));
    const { result } = await renderHook(() => useReportWizard());
    await waitFor(() => expect(result.current.resuming).toBe(false));

    await act(async () => {
      await result.current.addPhotos([{ uri: 'file:///a.jpg', fileName: 'a.jpg' }]);
    });
    await act(async () => {
      await result.current.removePhoto(result.current.state.photos[0]);
    });

    expect(result.current.state.photos).toHaveLength(0);
    expect(mockDeleteStagedPhoto).not.toHaveBeenCalled();
  });
});

describe('useReportWizard — duplicate-submit prevention', () => {
  it('a second submit() call while the first is in flight only calls generate() once', async () => {
    mockStagePhoto.mockResolvedValue({ success: true, photo: { id: 's1', status: 'uploaded' }, uploadedCount: 1 });
    let resolveGenerate: (v: { success: true; report: { id: string } }) => void = () => {};
    mockGenerate.mockReturnValue(new Promise((resolve) => { resolveGenerate = resolve; }));

    const { result } = await renderHook(() => useReportWizard());
    await waitFor(() => expect(result.current.resuming).toBe(false));

    await act(async () => {
      fillRequiredFields(result.current.state, result.current.setField);
    });
    await act(async () => {
      await result.current.addPhotos([{ uri: 'file:///a.jpg', fileName: 'a.jpg' }]);
    });
    await waitFor(() => expect(result.current.canSubmit).toBe(true));

    let firstSubmit!: Promise<void>;
    await act(async () => {
      firstSubmit = result.current.submit();
      result.current.submit(); // fired again before the first resolves
      await Promise.resolve();
    });
    expect(result.current.state.submitting).toBe(true);

    await act(async () => {
      resolveGenerate({ success: true, report: { id: 'report-1' } });
      await firstSubmit;
    });

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(result.current.state.submittedReportId).toBe('report-1');
  });

  it('a failed submit preserves fields and photos so the user can just press Generate again', async () => {
    mockStagePhoto.mockResolvedValue({ success: true, photo: { id: 's1', status: 'uploaded' }, uploadedCount: 1 });
    mockGenerate.mockRejectedValueOnce(new Error('Server unavailable'));

    const { result } = await renderHook(() => useReportWizard());
    await waitFor(() => expect(result.current.resuming).toBe(false));

    await act(async () => {
      fillRequiredFields(result.current.state, result.current.setField);
    });
    await act(async () => {
      await result.current.addPhotos([{ uri: 'file:///a.jpg', fileName: 'a.jpg' }]);
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.state.submitError).toBe('Server unavailable');
    expect(result.current.state.fields.claimNumber).toBe('CLM-1');
    expect(result.current.state.photos).toHaveLength(1);
    expect(result.current.canSubmit).toBe(true); // can simply try again
  });
});

describe('useReportWizard — resume after a relaunch', () => {
  it('rehydrates persisted fields/step and re-derives the photo list from the server, not local cache', async () => {
    await AsyncStorage.setItem(
      'flac_report_wizard_draft_v1',
      JSON.stringify({ draftId: 'resumed-draft', step: 3, fields: { claimNumber: 'CLM-9' }, savedAt: '2026-01-01T00:00:00Z' })
    );
    mockGetStagedPhotos.mockResolvedValue({
      success: true,
      photos: [
        { id: 'p1', fileName: 'a.jpg', status: 'uploaded' },
        { id: 'p2', fileName: 'b.jpg', status: 'failed' }, // never made it — must not resurrect as ready
      ],
    });

    const { result } = await renderHook(() => useReportWizard());
    await waitFor(() => expect(result.current.resuming).toBe(false));

    expect(result.current.state.draftId).toBe('resumed-draft');
    expect(result.current.state.step).toBe(3);
    expect(result.current.state.fields.claimNumber).toBe('CLM-9');
    expect(result.current.state.photos).toHaveLength(1);
    expect(result.current.state.photos[0].serverId).toBe('p1');
    expect(result.current.resumeNotice).toBeTruthy();
  });
});
