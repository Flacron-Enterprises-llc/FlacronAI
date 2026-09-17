import { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { useImageCapture } from '@/features/photos/hooks/useImageCapture';
import { WizardPhotoTile } from '../components/WizardPhotoTile';
import type { WizardPhoto } from '../wizardTypes';

const MAX_PHOTOS = 100;

interface PhotosStepProps {
  draftId: string;
  photos: WizardPhoto[];
  onAdd: (assets: { uri: string; fileName?: string | null; mimeType?: string }[]) => Promise<void>;
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

export function PhotosStep({ draftId, photos, onAdd, onRemove, onRetry }: PhotosStepProps) {
  const theme = useTheme();
  const { busy, captureFromCamera, pickFromLibrary } = useImageCapture();
  const [localError, setLocalError] = useState<string | null>(null);

  const remaining = Math.max(0, MAX_PHOTOS - photos.length);

  const handleCamera = async () => {
    setLocalError(null);
    if (remaining <= 0) {
      setLocalError(`Maximum of ${MAX_PHOTOS} photos reached. Remove a photo to add another.`);
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
      setLocalError(`Maximum of ${MAX_PHOTOS} photos reached. Remove a photo to add another.`);
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
        {photos.length} / {MAX_PHOTOS} photos
      </ThemedText>

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
