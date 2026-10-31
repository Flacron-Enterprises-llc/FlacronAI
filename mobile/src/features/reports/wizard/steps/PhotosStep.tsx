import type React from 'react';
import { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { useImageCapture } from '@/features/photos/hooks/useImageCapture';
import type { PhotoCapacity } from '@/services/api/reports';
import type { PickedAsset } from '@/features/photos/utils/fileHelpers';
import { WizardPhotoTile } from '../components/WizardPhotoTile';
import { isRetryablePhoto } from '../wizardReducer';
import type { WizardPhoto } from '../wizardTypes';

/** Picker batch cap used only until the plan's real capacity has loaded (or when it's
 * unlimited) — the staging route enforces the authoritative per-plan limit itself. */
const PICKER_BATCH_FALLBACK = 100;

interface PhotosStepProps {
  footer?: React.ReactNode;
  draftId: string;
  photos: WizardPhoto[];
  capacity: PhotoCapacity | null;
  readyCount: number;
  onAdd: (assets: PickedAsset[]) => Promise<void>;
  onRemove: (photo: WizardPhoto) => Promise<void>;
  onRetry: (photo: WizardPhoto) => Promise<void>;
}

function showPermissionDeniedAlert(kind: 'camera' | 'photo library') {
  Alert.alert(
    `${kind === 'camera' ? 'Camera' : 'Photo library'} access needed`,
    `FlacronAI needs ${kind} access to attach photos to this report. You can grant it in your device Settings.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]
  );
}

export function PhotosStep({ draftId, photos, capacity, readyCount, onAdd, onRemove, onRetry, footer }: PhotosStepProps) {
  const theme = useTheme();
  const { busy, captureFromCamera, pickFromLibrary } = useImageCapture();
  const [localError, setLocalError] = useState<string | null>(null);

  const limit = capacity && !capacity.unlimited ? capacity.effectiveCapacity : null;
  const inFlight = photos.filter((p) => p.status === 'uploading').length;
  const remaining = limit === null ? PICKER_BATCH_FALLBACK : Math.max(0, limit - readyCount - inFlight);
  const limitMessage =
    limit === null ? null : `Your plan allows ${limit} photo${limit === 1 ? '' : 's'} per report. Remove a photo to add another.`;
  const notReady = photos.filter((p) => p.status === 'failed' || p.status === 'duplicate');

  const handleCamera = async () => {
    setLocalError(null);
    if (remaining <= 0) {
      setLocalError(limitMessage);
      return;
    }
    const outcome = await captureFromCamera();
    if (outcome.status === 'success') await onAdd(outcome.assets);
    else if (outcome.status === 'permission-denied') showPermissionDeniedAlert('camera');
    else if (outcome.status === 'error') setLocalError(outcome.message);
    // 'cancelled' — nothing to do, matches the picker's own no-op behavior.
  };

  const handleLibrary = async () => {
    setLocalError(null);
    if (remaining <= 0) {
      setLocalError(limitMessage);
      return;
    }
    const outcome = await pickFromLibrary(remaining);
    if (outcome.status === 'success') await onAdd(outcome.assets);
    else if (outcome.status === 'permission-denied') showPermissionDeniedAlert('photo library');
    else if (outcome.status === 'error') setLocalError(outcome.message);
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <ThemedText variant="body" color="muted" style={styles.intro}>
        Attach photos of the visible damage. Each photo uploads as soon as it&apos;s added, so a slow connection never blocks the rest of
        the wizard.
      </ThemedText>

      <View style={styles.actionsRow}>
        <View style={styles.actionBtn}>
          <PrimaryButton label="Take photo" onPress={handleCamera} loading={busy} variant="secondary" />
        </View>
        <View style={styles.actionBtn}>
          <PrimaryButton label="Choose from library" onPress={handleLibrary} loading={busy} variant="secondary" />
        </View>
      </View>

      {!!localError && (
        <ThemedText variant="caption" style={{ color: theme.colors.error, marginBottom: 12 }}>
          {localError}
        </ThemedText>
      )}

      <ThemedText variant="caption" color="muted" style={styles.count}>
        {limit === null
          ? `${readyCount} photo${readyCount === 1 ? '' : 's'} uploaded${capacity?.unlimited ? ' (no plan limit)' : ''}`
          : `${readyCount} of ${limit} photos uploaded (your plan limit)`}
        {inFlight > 0 ? ` · ${inFlight} uploading…` : ''}
      </ThemedText>

      {notReady.length > 0 && (
        <ThemedText variant="caption" style={{ color: theme.colors.warning, marginBottom: 8 }}>
          {notReady.length} photo{notReady.length === 1 ? '' : 's'} won’t be included in the report. Tap a photo marked Failed to see why
          {notReady.some(isRetryablePhoto) ? ', or retry it' : ''}.
        </ThemedText>
      )}

      <View style={styles.grid}>
        {photos.map((photo) => (
          <WizardPhotoTile
            key={photo.localId}
            photo={photo}
            draftId={draftId}
            onRemove={() => onRemove(photo)}
            onRetry={() => onRetry(photo)}
          />
        ))}
      </View>

      {photos.length === 0 && (
        <ThemedText variant="caption" color="muted" style={styles.empty}>
          No photos yet — a report needs at least one to generate.
        </ThemedText>
      )}
      {footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
  },
  count: {
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  empty: {
    textAlign: 'center',
    marginTop: 24,
  },
});
