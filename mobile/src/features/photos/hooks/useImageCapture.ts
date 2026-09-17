/**
 * Thin wrapper around `expo-image-picker` for the wizard's Photos step: camera capture and
 * photo-library selection, each requesting its own permission on demand (never at app
 * launch) and distinguishing "permission denied" from "user cancelled the picker" from a
 * genuine picker error, so the caller can react correctly to each (task requirement:
 * "Handle permission denied, cancelled picker, unsupported files").
 */
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

export type CaptureOutcome =
  | { status: 'success'; assets: ImagePicker.ImagePickerAsset[] }
  | { status: 'cancelled' }
  | { status: 'permission-denied' }
  | { status: 'error'; message: string };

async function ensureCameraPermission(): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await ImagePicker.requestCameraPermissionsAsync();
  return requested.granted;
}

async function ensureLibraryPermission(): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return requested.granted;
}

const MAX_REMAINING_DEFAULT = 100;

export function useImageCapture() {
  const [busy, setBusy] = useState(false);

  const captureFromCamera = useCallback(async (): Promise<CaptureOutcome> => {
    setBusy(true);
    try {
      const granted = await ensureCameraPermission();
      if (!granted) return { status: 'permission-denied' };

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        exif: false,
      });
      if (result.canceled) return { status: 'cancelled' };
      return { status: 'success', assets: result.assets };
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : 'Camera unavailable.' };
    } finally {
      setBusy(false);
    }
  }, []);

  const pickFromLibrary = useCallback(async (remaining: number = MAX_REMAINING_DEFAULT): Promise<CaptureOutcome> => {
    setBusy(true);
    try {
      const granted = await ensureLibraryPermission();
      if (!granted) return { status: 'permission-denied' };

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        exif: false,
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, remaining),
      });
      if (result.canceled) return { status: 'cancelled' };
      return { status: 'success', assets: result.assets };
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : 'Photo library unavailable.' };
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, captureFromCamera, pickFromLibrary };
}
