import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiRequestError } from '@/types/api';
import { getReportsVersion } from '../reportsEvents';
import { useReportWizard } from './useReportWizard';
import { saveWizardDraft } from './wizardStorage';

let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `uuid-${++mockUuidCounter}`,
}));

const mockStagePhoto = jest.fn();
const mockDeleteStagedPhoto = jest.fn();
const mockGetStagedPhotos = jest.fn();
const mockGenerate = jest.fn();
const mockGetPhotoCapacity = jest.fn();
jest.mock('@/services/api/reports', () => ({
  reportsApi: {
    stagePhoto: (...args: unknown[]) => mockStagePhoto(...args),
    deleteStagedPhoto: (...args: unknown[]) => mockDeleteStagedPhoto(...args),
    getStagedPhotos: (...args: unknown[]) => mockGetStagedPhotos(...args),
    generate: (...args: unknown[]) => mockGenerate(...args),
    getPhotoCapacity: (...args: unknown[]) => mockGetPhotoCapacity(...args),
  },
}));

const mockClearPhotoCacheScope = jest.fn();
jest.mock('@/services/localData/fileCache', () => ({
  clearPhotoCacheScope: (...args: unknown[]) => mockClearPhotoCacheScope(...args),
}));

const UID = 'user-a';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockUuidCounter = 0;
  mockGetStagedPhotos.mockResolvedValue({ success: true, photos: [] });
  mockGetPhotoCapacity.mockResolvedValue({ success: true, effectiveCapacity: 100, unlimited: false, used: 0, remaining: 100, uploadAllowed: true });
  mockDeleteStagedPhoto.mockResolvedValue({ success: true });
});

function fillRequiredFields(setField: (k: string, v: string) => void) {
  setField('claimNumber', 'CLM-1');
  setField('insuredName', 'Jordan Rivera');
  setField('insuredEmail', 'jordan@example.com');
  setField('propertyAddress', '123 Main St');
  setField('lossDate', '2026-01-01');
}

async function renderWizard(uid = UID) {
  const hook = await renderHook(() => useReportWizard(uid));
  await waitFor(() => expect(hook.result.current.resuming).toBe(false));
  await waitFor(() => expect(mockGetPhotoCapacity).toHaveBeenCalled());
  return hook;
}

const jpeg = (name: string) => ({ uri: `file:///${name}`, fileName: name, mimeType: 'image/jpeg' });

describe('useReportWizard — photo upload retry and partial failure', () => {
  it('a failed upload is retryable and succeeds independently of other photos', async () => {
    mockStagePhoto
      .mockResolvedValueOnce({ success: true, photo: { id: 's1', status: 'uploaded' }, uploadedCount: 1 })
      .mockRejectedValueOnce(new ApiRequestError('Unable to reach the server.', { category: 'offline', retryable: true }))
      .mockResolvedValueOnce({ success: true, photo: { id: 's2', status: 'uploaded' }, uploadedCount: 2 });

    const { result } = await renderWizard();

    await act(async () => {
      await result.current.addPhotos([jpeg('a.jpg'), jpeg('b.jpg')]);
    });

    expect(result.current.state.photos).toHaveLength(2);
    const [uploaded, failed] = result.current.state.photos;
    expect(uploaded.status).toBe('uploaded');
    expect(failed.status).toBe('failed');
    expect(failed.failureReason).toBe('network');
    expect(result.current.readyPhotoCount).toBe(1);

    await act(async () => {
      await result.current.retryPhoto(result.current.state.photos[1]);
    });

    expect(result.current.state.photos).toHaveLength(2);
    expect(result.current.state.photos.every((p) => p.status === 'uploaded')).toBe(true);
    expect(result.current.readyPhotoCount).toBe(2);
    expect(mockStagePhoto).toHaveBeenCalledTimes(3);
  });

  it('marks a server-reported duplicate distinctly, and it does not count toward readiness', async () => {
    mockStagePhoto.mockResolvedValue({ success: true, photo: { id: 's1', status: 'duplicate' }, uploadedCount: 1 });
    const { result } = await renderWizard();

    await act(async () => {
      await result.current.addPhotos([jpeg('a.jpg')]);
    });

    expect(result.current.state.photos[0].status).toBe('duplicate');
    expect(result.current.readyPhotoCount).toBe(0);
  });

  it('removing a photo that reached the server also deletes it there; a local-only failed photo needs no server call', async () => {
    mockStagePhoto.mockRejectedValueOnce(new ApiRequestError('Unable to reach the server.', { category: 'offline', retryable: true }));
    const { result } = await renderWizard();

    await act(async () => {
      await result.current.addPhotos([jpeg('a.jpg')]);
    });
    await act(async () => {
      await result.current.removePhoto(result.current.state.photos[0]);
    });

    expect(result.current.state.photos).toHaveLength(0);
    expect(mockDeleteStagedPhoto).not.toHaveBeenCalled();
  });
});

describe('useReportWizard — upload results come from the actual API response', () => {
  it("a 201 whose record says status 'failed' is shown as rejected with the server's reason, never as uploaded", async () => {
    mockStagePhoto.mockResolvedValue({
      success: true,
      photo: { id: 'staged-bad', status: 'failed', error: 'File is not a valid image (corrupt file or disguised file type).' },
      uploadedCount: 0,
    });
    const { result } = await renderWizard();
    await act(async () => {
      fillRequiredFields(result.current.setField);
    });
    await act(async () => {
      await result.current.addPhotos([jpeg('bad.jpg')]);
    });

    const photo = result.current.state.photos[0];
    expect(photo.status).toBe('failed');
    expect(photo.failureReason).toBe('rejected');
    expect(photo.error).toMatch(/not a valid image/);
    expect(photo.serverId).toBe('staged-bad');
    expect(result.current.readyPhotoCount).toBe(0);
    expect(result.current.canSubmit).toBe(false);

    // Removing it deletes the failed record the server kept on the draft.
    await act(async () => {
      await result.current.removePhoto(photo);
    });
    expect(mockDeleteStagedPhoto).toHaveBeenCalledWith(result.current.state.draftId, 'staged-bad');
  });

  it("a MAX_PHOTOS rejection is a plan-limit failure carrying the server's message, and capacity is re-read", async () => {
    mockStagePhoto.mockRejectedValue(
      new ApiRequestError('Maximum of 10 photos reached for your plan.', { status: 400, code: 'MAX_PHOTOS', category: 'validation' })
    );
    const { result } = await renderWizard();
    const capacityCallsBefore = mockGetPhotoCapacity.mock.calls.length;

    await act(async () => {
      await result.current.addPhotos([jpeg('a.jpg')]);
    });

    const photo = result.current.state.photos[0];
    expect(photo.failureReason).toBe('capacity');
    expect(photo.error).toBe('Maximum of 10 photos reached for your plan.');
    expect(mockGetPhotoCapacity.mock.calls.length).toBeGreaterThan(capacityCallsBefore);
  });

  it('photos beyond the known plan capacity are refused on-device without uploading', async () => {
    mockGetPhotoCapacity.mockResolvedValue({ success: true, effectiveCapacity: 1, unlimited: false, used: 0, remaining: 1, uploadAllowed: true });
    mockStagePhoto.mockResolvedValue({ success: true, photo: { id: 's1', status: 'uploaded' }, uploadedCount: 1 });
    const { result } = await renderWizard();
    await waitFor(() => expect(result.current.capacity?.effectiveCapacity).toBe(1));

    await act(async () => {
      await result.current.addPhotos([jpeg('a.jpg'), jpeg('b.jpg')]);
    });

    expect(mockStagePhoto).toHaveBeenCalledTimes(1);
    expect(result.current.state.photos.map((p) => p.status)).toEqual(['uploaded', 'failed']);
    expect(result.current.state.photos[1].failureReason).toBe('capacity');
    expect(result.current.readyPhotoCount).toBe(1);
  });

  it('a HEIC photo is never uploaded or counted — it gets an actionable unsupported-format error', async () => {
    const { result } = await renderWizard();
    await act(async () => {
      await result.current.addPhotos([{ uri: 'file:///IMG_1.HEIC', fileName: 'IMG_1.HEIC', mimeType: 'image/heic' }]);
    });

    expect(mockStagePhoto).not.toHaveBeenCalled();
    const photo = result.current.state.photos[0];
    expect(photo.status).toBe('failed');
    expect(photo.failureReason).toBe('unsupported');
    expect(photo.error).toMatch(/HEIC/);
    expect(result.current.readyPhotoCount).toBe(0);
  });
});

describe('useReportWizard — duplicate-submit prevention', () => {
  it('a second submit() call while the first is in flight only calls generate() once', async () => {
    mockStagePhoto.mockResolvedValue({ success: true, photo: { id: 's1', status: 'uploaded' }, uploadedCount: 1 });
    let resolveGenerate: (v: { success: true; report: { id: string } }) => void = () => {};
    mockGenerate.mockReturnValue(
      new Promise((resolve) => {
        resolveGenerate = resolve;
      })
    );

    const { result } = await renderWizard();

    await act(async () => {
      fillRequiredFields(result.current.setField);
    });
    await act(async () => {
      await result.current.addPhotos([jpeg('a.jpg')]);
    });
    await waitFor(() => expect(result.current.canSubmit).toBe(true));

    let firstSubmit!: Promise<void>;
    await act(async () => {
      firstSubmit = result.current.submit();
      result.current.submit(); // fired again before the first resolves
      await Promise.resolve();
    });
    expect(result.current.state.submitting).toBe(true);

    const versionBefore = getReportsVersion();
    await act(async () => {
      resolveGenerate({ success: true, report: { id: 'report-1' } });
      await firstSubmit;
    });

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(result.current.state.submittedReportId).toBe('report-1');
    // Lists are told to refresh, and the draft's cached thumbnails are dropped.
    expect(getReportsVersion()).toBeGreaterThan(versionBefore);
    expect(mockClearPhotoCacheScope).toHaveBeenCalledWith(`draft-${result.current.state.draftId}`);
  });

  it('a failed submit preserves fields and photos so the user can just press Generate again', async () => {
    mockStagePhoto.mockResolvedValue({ success: true, photo: { id: 's1', status: 'uploaded' }, uploadedCount: 1 });
    mockGenerate.mockRejectedValueOnce(new Error('Server unavailable'));

    const { result } = await renderWizard();

    await act(async () => {
      fillRequiredFields(result.current.setField);
    });
    await act(async () => {
      await result.current.addPhotos([jpeg('a.jpg')]);
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
    await saveWizardDraft(UID, 'resumed-draft', 3, { claimNumber: 'CLM-9' });
    mockGetStagedPhotos.mockResolvedValue({
      success: true,
      photos: [
        { id: 'p1', fileName: 'a.jpg', status: 'uploaded' },
        { id: 'p2', fileName: 'b.jpg', status: 'failed' }, // never made it — must not resurrect as ready
      ],
    });

    const { result } = await renderWizard();

    expect(result.current.state.draftId).toBe('resumed-draft');
    expect(result.current.state.step).toBe(3);
    expect(result.current.state.fields.claimNumber).toBe('CLM-9');
    expect(result.current.state.photos).toHaveLength(1);
    expect(result.current.state.photos[0].serverId).toBe('p1');
    expect(result.current.resumeNotice).toBeTruthy();
  });
});

describe('useReportWizard — account isolation and discard', () => {
  it("never resumes another account's draft on the same device", async () => {
    await saveWizardDraft('user-a', 'draft-of-a', 4, { claimNumber: 'CLM-A', insuredName: 'Person A' });

    const { result } = await renderWizard('user-b');

    expect(result.current.state.draftId).not.toBe('draft-of-a');
    expect(result.current.state.fields.claimNumber).toBeUndefined();
    expect(result.current.state.fields.insuredName).toBeUndefined();
    expect(result.current.resumeNotice).toBeNull();
    expect(mockGetStagedPhotos).not.toHaveBeenCalled();
  });

  it('discardDraft deletes staged photos, clears the saved draft and cache, and starts a fresh draft', async () => {
    await saveWizardDraft(UID, 'old-draft', 4, { claimNumber: 'CLM-OLD' });
    mockGetStagedPhotos.mockResolvedValue({ success: true, photos: [{ id: 'p1', fileName: 'a.jpg', status: 'uploaded' }] });

    const { result } = await renderWizard();
    expect(result.current.state.draftId).toBe('old-draft');

    await act(async () => {
      await result.current.discardDraft();
    });

    expect(mockDeleteStagedPhoto).toHaveBeenCalledWith('old-draft', 'p1');
    expect(mockClearPhotoCacheScope).toHaveBeenCalledWith('draft-old-draft');
    expect(result.current.state.draftId).not.toBe('old-draft');
    expect(result.current.state.photos).toHaveLength(0);
    expect(result.current.state.fields.claimNumber).toBeUndefined();
    expect(result.current.resumeNotice).toBeNull();
  });
});
