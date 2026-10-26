import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { reportsApi, type ReportPhoto } from '@/services/api/reports';
import { AuthenticatedThumb } from '@/features/photos/components/AuthenticatedThumb';
import { useReportPhotos } from '../hooks/useReportPhotos';
import { LoadingState, StateMessage } from '../components/StateMessage';

export function reportPhotoCacheScope(reportId: string): string {
  return `report-${reportId}`;
}

interface PhotoRowProps {
  reportId: string;
  photo: ReportPhoto;
  canReview: boolean;
  onReview: (action: 'approve' | 'exclude' | 'include') => void;
  busy: boolean;
}

function PhotoRow({ reportId, photo, canReview, onReview, busy }: PhotoRowProps) {
  const theme = useTheme();
  const excluded = photo.review && (photo.review as { excluded?: boolean }).excluded;
  const failed = photo.status === 'failed';
  const showActions = canReview && photo.reviewable !== false && !failed;
  const actionColor = busy ? theme.colors.muted : theme.colors.primary;

  return (
    <View style={[styles.row, { borderColor: theme.colors.border, borderRadius: theme.radii.card, opacity: excluded ? 0.55 : 1 }]}>
      <View style={[styles.thumb, { borderRadius: theme.radii.btn }]}>
        {failed && photo.hasThumbnail === false ? (
          <View style={[styles.thumbFallback, { backgroundColor: theme.colors.surface }]} />
        ) : (
          <AuthenticatedThumb
            scope={reportPhotoCacheScope(reportId)}
            cacheKey={photo.id}
            fetcher={() => reportsApi.getPhotoImage(reportId, photo.id, 'thumbnail')}
          />
        )}
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
        {failed && (
          <ThemedText variant="caption" style={{ color: theme.colors.error }}>
            {photo.capacityRejected ? 'Not included — over your plan’s photo limit' : 'Not included — this photo failed'}
          </ThemedText>
        )}
        {photo.analysisStatus === 'needs_attention' && (
          <ThemedText variant="caption" style={{ color: theme.colors.warning }}>
            Analysis needs attention
          </ThemedText>
        )}
        {photo.qualityWarning && (
          <ThemedText variant="caption" style={{ color: theme.colors.warning }}>
            Quality warning
          </ThemedText>
        )}
        {showActions && (
          <View style={styles.actions}>
            <Pressable disabled={busy} onPress={() => onReview(excluded ? 'include' : 'exclude')} accessibilityRole="button">
              <ThemedText variant="caption" style={{ color: actionColor }}>
                {excluded ? 'Include' : 'Exclude'}
              </ThemedText>
            </Pressable>
            <Pressable disabled={busy} onPress={() => onReview('approve')} accessibilityRole="button">
              <ThemedText variant="caption" style={{ color: actionColor }}>
                Mark reviewed
              </ThemedText>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

export function PhotosTab({ reportId, canReview }: { reportId: string; canReview: boolean }) {
  const theme = useTheme();
  const { photos, loading, error, reviewError, clearReviewError, retry, review, reviewingId } = useReportPhotos(reportId);

  if (loading && photos.length === 0) return <LoadingState label="Loading photos…" />;
  if (error && photos.length === 0) return <StateMessage title="Could not load photos" description={error} onRetry={retry} />;
  if (photos.length === 0) return <StateMessage title="No photos" description="This report has no attached photos." />;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {/* A failed review action is reported here — the photo list itself stays on screen. */}
      {!!reviewError && (
        <Pressable
          onPress={clearReviewError}
          accessibilityRole="button"
          style={[styles.banner, { backgroundColor: theme.colors.error + '1A', borderRadius: theme.radii.btn }]}
        >
          <ThemedText variant="caption" style={{ color: theme.colors.error }}>
            {reviewError} Tap to dismiss.
          </ThemedText>
        </Pressable>
      )}
      {!canReview && (
        <ThemedText variant="caption" color="muted" style={styles.hint}>
          You can view these photos; reviewing them needs owner or reviewer access.
        </ThemedText>
      )}
      {photos.map((photo) => (
        <PhotoRow
          key={photo.id}
          reportId={reportId}
          photo={photo}
          canReview={canReview}
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
  thumbFallback: {
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
  banner: {
    padding: 10,
    marginBottom: 10,
  },
  hint: {
    marginBottom: 10,
  },
});
