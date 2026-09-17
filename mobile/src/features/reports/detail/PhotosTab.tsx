import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { reportsApi, type ReportPhoto } from '@/services/api/reports';
import { useAuthenticatedPhoto } from '@/features/photos/hooks/useAuthenticatedPhoto';
import { useReportPhotos } from '../hooks/useReportPhotos';
import { LoadingState, StateMessage } from '../components/StateMessage';

function PhotoRow({ reportId, photo, onReview, busy }: { reportId: string; photo: ReportPhoto; onReview: (action: 'approve' | 'exclude' | 'include') => void; busy: boolean }) {
  const theme = useTheme();
  const { uri, loading } = useAuthenticatedPhoto(`report-${reportId}-${photo.id}`, () =>
    reportsApi.getPhotoImage(reportId, photo.id, 'thumbnail')
  );
  const excluded = photo.review && (photo.review as { excluded?: boolean }).excluded;

  return (
    <View style={[styles.row, { borderColor: theme.colors.border, borderRadius: theme.radii.card, opacity: excluded ? 0.55 : 1 }]}>
      <View style={[styles.thumb, { borderRadius: theme.radii.btn }]}>
        {loading || !uri ? <ActivityIndicator size="small" /> : <Image source={{ uri }} style={styles.thumbImg} contentFit="cover" />}
      </View>
      <View style={styles.rowBody}>
        <ThemedText variant="body" numberOfLines={1}>
          {photo.fileName}
        </ThemedText>
        {!!photo.roomOrArea && (
          <ThemedText variant="caption" color="muted">
            {photo.roomOrArea}
          </ThemedText>
        )}
        {photo.qualityWarning && (
          <ThemedText variant="caption" style={{ color: theme.colors.warning }}>
            Quality warning
          </ThemedText>
        )}
        <View style={styles.actions}>
          <Pressable disabled={busy} onPress={() => onReview(excluded ? 'include' : 'exclude')}>
            <ThemedText variant="caption" style={{ color: theme.colors.primary }}>
              {excluded ? 'Include' : 'Exclude'}
            </ThemedText>
          </Pressable>
          <Pressable disabled={busy} onPress={() => onReview('approve')}>
            <ThemedText variant="caption" style={{ color: theme.colors.primary }}>
              Mark reviewed
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function PhotosTab({ reportId }: { reportId: string }) {
  const { photos, loading, error, retry, review, reviewingId } = useReportPhotos(reportId);

  if (loading) return <LoadingState label="Loading photos…" />;
  if (error) return <StateMessage title="Could not load photos" description={error} onRetry={retry} />;
  if (photos.length === 0) return <StateMessage title="No photos" description="This report has no attached photos." />;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {photos.map((photo) => (
        <PhotoRow
          key={photo.id}
          reportId={reportId}
          photo={photo}
          busy={reviewingId === photo.id}
          onReview={(action) => review(photo.id, action)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
  row: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 10,
    marginBottom: 10,
  },
  thumb: {
    width: 64,
    height: 64,
    overflow: 'hidden',
    marginRight: 12,
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  rowBody: {
    flex: 1,
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 6,
  },
});
