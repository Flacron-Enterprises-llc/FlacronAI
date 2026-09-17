import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { reportsApi } from '@/services/api/reports';
import { useAuthenticatedPhoto } from '@/features/photos/hooks/useAuthenticatedPhoto';
import type { WizardPhoto } from '../wizardTypes';

const SIZE = 96;

/** A local `uri` is available immediately for anything picked this session (camera/library
 * both return a `file://` URI). A photo resumed after an app relaunch (see
 * `useReportWizard.ts`'s HYDRATE effect) only has a `serverId`, no local file — for that case
 * alone, fetch its thumbnail through the same authenticated path the report-detail screen
 * uses. */
function RemoteThumb({ draftId, photoId }: { draftId: string; photoId: string }) {
  const { uri, loading } = useAuthenticatedPhoto(`staged-${draftId}-${photoId}`, () =>
    reportsApi.getStagedPhotoImage(draftId, photoId, 'thumbnail')
  );
  if (loading || !uri) {
    return (
      <View style={[styles.thumb, styles.center]}>
        <ActivityIndicator size="small" />
      </View>
    );
  }
  return <Image source={{ uri }} style={styles.thumb} contentFit="cover" />;
}

interface WizardPhotoTileProps {
  photo: WizardPhoto;
  draftId: string;
  onRemove: () => void;
  onRetry: () => void;
}

export function WizardPhotoTile({ photo, draftId, onRemove, onRetry }: WizardPhotoTileProps) {
  const theme = useTheme();

  return (
    <View style={[styles.wrap, { borderRadius: theme.radii.card, borderColor: theme.colors.border }]}>
      {photo.uri ? (
        <Image source={{ uri: photo.uri }} style={styles.thumb} contentFit="cover" />
      ) : photo.serverId ? (
        <RemoteThumb draftId={draftId} photoId={photo.serverId} />
      ) : (
        <View style={[styles.thumb, styles.center]} />
      )}

      {photo.status === 'uploading' && (
        <View style={[styles.overlay, { backgroundColor: theme.colors.background + 'CC' }]}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      )}

      {photo.status === 'failed' && (
        <View style={[styles.overlay, { backgroundColor: theme.colors.error + 'DD' }]}>
          <ThemedText variant="caption" style={styles.overlayText}>
            Failed
          </ThemedText>
          <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry photo upload" style={styles.retryBtn}>
            <ThemedText variant="caption" style={styles.overlayText}>
              Retry
            </ThemedText>
          </Pressable>
        </View>
      )}

      {photo.status === 'duplicate' && (
        <View style={[styles.badge, { backgroundColor: theme.colors.warning }]}>
          <ThemedText variant="caption" style={styles.badgeText}>
            Duplicate
          </ThemedText>
        </View>
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
