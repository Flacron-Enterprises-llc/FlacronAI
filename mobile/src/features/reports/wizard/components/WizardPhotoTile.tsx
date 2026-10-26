import { Image } from 'expo-image';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { reportsApi } from '@/services/api/reports';
import { AuthenticatedThumb } from '@/features/photos/components/AuthenticatedThumb';
import { draftPhotoCacheScope } from '../useReportWizard';
import { isRetryablePhoto } from '../wizardReducer';
import type { PhotoFailureReason, WizardPhoto } from '../wizardTypes';

const SIZE = 96;

const FAILURE_LABEL: Record<PhotoFailureReason, string> = {
  network: 'Upload failed',
  rejected: 'Rejected',
  capacity: 'Plan limit',
  unsupported: 'Unsupported',
  'too-large': 'Too large',
};

interface WizardPhotoTileProps {
  photo: WizardPhoto;
  draftId: string;
  onRemove: () => void;
  onRetry: () => void;
}

/** A local `uri` is available immediately for anything picked this session (camera/library
 * both return a `file://` URI). A photo resumed after an app relaunch (see
 * `useReportWizard.ts`'s HYDRATE effect) only has a `serverId`, no local file — for that case
 * alone, fetch its thumbnail through the same authenticated path the report-detail screen
 * uses. */
export function WizardPhotoTile({ photo, draftId, onRemove, onRetry }: WizardPhotoTileProps) {
  const theme = useTheme();
  const retryable = isRetryablePhoto(photo);

  const explain = () => {
    if (photo.status === 'failed') {
      Alert.alert(
        'This photo won’t be included',
        photo.error || 'This photo could not be uploaded.',
        retryable
          ? [
              { text: 'Remove', style: 'destructive', onPress: onRemove },
              { text: 'Retry', onPress: onRetry },
            ]
          : [
              { text: 'Keep for now', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: onRemove },
            ]
      );
    } else if (photo.status === 'duplicate') {
      Alert.alert('Duplicate photo', 'This is the same image as a photo already on this report, so it isn’t added twice.', [
        { text: 'OK', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: onRemove },
      ]);
    }
  };

  return (
    <View style={[styles.wrap, { borderRadius: theme.radii.card, borderColor: theme.colors.border }]}>
      {photo.uri ? (
        <Image source={{ uri: photo.uri }} style={styles.thumb} contentFit="cover" />
      ) : photo.serverId ? (
        <AuthenticatedThumb
          scope={draftPhotoCacheScope(draftId)}
          cacheKey={photo.serverId}
          fetcher={() => reportsApi.getStagedPhotoImage(draftId, photo.serverId as string, 'thumbnail')}
          style={styles.thumb}
        />
      ) : (
        <View style={[styles.thumb, styles.center]} />
      )}

      {photo.status === 'uploading' && (
        <View style={[styles.overlay, { backgroundColor: theme.colors.background + 'CC' }]}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      )}

      {photo.status === 'failed' && (
        <Pressable
          onPress={explain}
          accessibilityRole="button"
          accessibilityLabel={`${FAILURE_LABEL[photo.failureReason ?? 'network']}. ${photo.error ?? ''} Tap for options.`}
          style={[styles.overlay, { backgroundColor: theme.colors.error + 'DD' }]}
        >
          <ThemedText variant="caption" style={styles.overlayText}>
            {FAILURE_LABEL[photo.failureReason ?? 'network']}
          </ThemedText>
          <View style={styles.retryBtn}>
            <ThemedText variant="caption" style={styles.overlayText}>
              {retryable ? 'Retry…' : 'Details'}
            </ThemedText>
          </View>
        </Pressable>
      )}

      {photo.status === 'duplicate' && (
        <Pressable
          onPress={explain}
          accessibilityRole="button"
          accessibilityLabel="Duplicate photo, not added twice. Tap for details."
          style={[styles.badge, { backgroundColor: theme.colors.warning }]}
        >
          <ThemedText variant="caption" style={styles.badgeText}>
            Duplicate
          </ThemedText>
        </Pressable>
      )}

      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel="Remove photo"
        style={[styles.removeBtn, { backgroundColor: theme.colors.ink }]}
      >
        <ThemedText variant="caption" style={styles.overlayText}>
          ✕
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
    margin: 4,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayText: {
    color: '#FFFFFF',
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  badge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    right: 2,
    borderRadius: 4,
    alignItems: 'center',
    paddingVertical: 2,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
  },
  removeBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
