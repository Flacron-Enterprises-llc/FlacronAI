import { renderHook, act } from '@testing-library/react-native';

import { useImageCapture } from './useImageCapture';

const mockGetCameraPermissionsAsync = jest.fn();
const mockRequestCameraPermissionsAsync = jest.fn();
const mockGetMediaLibraryPermissionsAsync = jest.fn();
const mockRequestMediaLibraryPermissionsAsync = jest.fn();
const mockLaunchCameraAsync = jest.fn();
const mockLaunchImageLibraryAsync = jest.fn();

jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: () => mockGetCameraPermissionsAsync(),
  requestCameraPermissionsAsync: () => mockRequestCameraPermissionsAsync(),
  getMediaLibraryPermissionsAsync: () => mockGetMediaLibraryPermissionsAsync(),
  requestMediaLibraryPermissionsAsync: () => mockRequestMediaLibraryPermissionsAsync(),
  launchCameraAsync: (...args: unknown[]) => mockLaunchCameraAsync(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibraryAsync(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useImageCapture — camera', () => {
  it('requests permission when not yet granted, then launches the camera on success', async () => {
    mockGetCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    mockLaunchCameraAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cam.jpg' }] });

    const { result } = await renderHook(() => useImageCapture());
    let outcome;
    await act(async () => {
      outcome = await result.current.captureFromCamera();
    });

    expect(mockRequestCameraPermissionsAsync).toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'success', assets: [{ uri: 'file:///cam.jpg' }] });
  });

  it('returns permission-denied without launching the camera when the user declines', async () => {
    mockGetCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestCameraPermissionsAsync.mockResolvedValue({ granted: false });

    const { result } = await renderHook(() => useImageCapture());
    let outcome;
    await act(async () => {
      outcome = await result.current.captureFromCamera();
    });

    expect(outcome).toEqual({ status: 'permission-denied' });
    expect(mockLaunchCameraAsync).not.toHaveBeenCalled();
  });

  it('never re-prompts when the OS says asking again is not allowed', async () => {
    mockGetCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });

    const { result } = await renderHook(() => useImageCapture());
    let outcome;
    await act(async () => {
      outcome = await result.current.captureFromCamera();
    });

    expect(mockRequestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'permission-denied' });
  });

  it('returns cancelled, not an error, when the user backs out of the camera UI', async () => {
    mockGetCameraPermissionsAsync.mockResolvedValue({ granted: true });
    mockLaunchCameraAsync.mockResolvedValue({ canceled: true, assets: null });

    const { result } = await renderHook(() => useImageCapture());
    let outcome;
    await act(async () => {
      outcome = await result.current.captureFromCamera();
    });

    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('classifies a thrown picker error as status "error", not a crash', async () => {
    mockGetCameraPermissionsAsync.mockResolvedValue({ granted: true });
    mockLaunchCameraAsync.mockRejectedValue(new Error('Camera hardware busy'));

    const { result } = await renderHook(() => useImageCapture());
    let outcome;
    await act(async () => {
      outcome = await result.current.captureFromCamera();
    });

    expect(outcome).toEqual({ status: 'error', message: 'Camera hardware busy' });
  });
});

describe('useImageCapture — library', () => {
  it('caps the selection limit at the remaining photo count', async () => {
    mockGetMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mockLaunchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [] });

    const { result } = await renderHook(() => useImageCapture());
    await act(async () => {
      await result.current.pickFromLibrary(3);
    });

    expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ selectionLimit: 3 }));
  });

  it('returns cancelled when the user dismisses the library picker', async () => {
    mockGetMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mockLaunchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });

    const { result } = await renderHook(() => useImageCapture());
    let outcome;
    await act(async () => {
      outcome = await result.current.pickFromLibrary();
    });

    expect(outcome).toEqual({ status: 'cancelled' });
  });
});
