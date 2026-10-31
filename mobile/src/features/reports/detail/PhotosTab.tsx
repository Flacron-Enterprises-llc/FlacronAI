import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { Badge, Icon, type BadgeTone } from '@/components/ui';
import { useTheme } from '@/theme';
import { reportsApi, type PhotoReviewAction, type ReportPhoto } from '@/services/api/reports';
import { AuthenticatedThumb } from '@/features/photos/components/AuthenticatedThumb';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useReportPhotos } from '../hooks/useReportPhotos';
import { LoadingState, StateMessage } from '../components/StateMessage';

export function reportPhotoCacheScope(reportId: string): string {
  return `report-${reportId}`;
}

interface PhotoAnalysis {
  observation?: string;
  location?: string;
  category?: string;
  confidence?: string | number;
}

interface PhotoReviewState {
  status?: 'pending' | 'approved' | 'edited' | 'excluded' | string;
  observation?: string | null;
  note?: string | null;
}

/** Web ReviewStatusPill. */
const REVIEW_PILL: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pending Review', tone: 'neutral' },
  approved: { label: 'Approved', tone: 'success' },
  edited: { label: 'Edited', tone: 'info' },
  excluded: { label: 'Excluded', tone: 'error' },
};

function analysisOf(photo: ReportPhoto): PhotoAnalysis | null {
  return photo.analysis && typeof photo.analysis === 'object' ? (photo.analysis as PhotoAnalysis) : null;
}
function reviewOf(photo: ReportPhoto): PhotoReviewState {
  return photo.review && typeof photo.review === 'object' ? (photo.review as PhotoReviewState) : {};
}
/** The observation that goes into the report: the reviewer's edit when there is one, else the analysis. */
export function effectiveObservation(photo: ReportPhoto): string {
  const review = reviewOf(photo);
  if (review.status === 'edited' && review.observation) return review.observation;
  return analysisOf(photo)?.observation || '';
}

type Review = (photoId: string, action: PhotoReviewAction, extra?: { observation?: string; note?: string; roomOrArea?: string }) => Promise<boolean>;

function PhotoRow({ reportId, photo, onOpen }: { reportId: string; photo: ReportPhoto; onOpen: () => void }) {
  const theme = useTheme();
  const status = reviewOf(photo).status || 'pending';
  const failed = photo.status === 'failed';
  const pill = REVIEW_PILL[status] ?? REVIEW_PILL.pending;
  const observation = effectiveObservation(photo);

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Photo ${photo.fileName}, ${failed ? 'not included' : pill.label}`}
      style={({ pressed }) => [
        styles.row,
        { borderColor: theme.colors.border, borderRadius: theme.radii.card, backgroundColor: theme.colors.surface, opacity: status === 'excluded' ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.thumb, { borderRadius: theme.radii.btn }]}>
        {failed && photo.hasThumbnail === false ? (
          <View style={[styles.thumbFallback, { backgroundColor: theme.colors.border }]} />
        ) : (
          <AuthenticatedThumb
            scope={reportPhotoCacheScope(reportId)}
            cacheKey={photo.id}
            fetcher={() => reportsApi.getPhotoImage(reportId, photo.id, 'thumbnail')}
          />
        )}
      </View>
      <View style={styles.rowBody}>
        <View style={styles.inline}>
          <ThemedText variant="body" numberOfLines={1} style={styles.flex}>
            {photo.roomOrArea || photo.fileName}
          </ThemedText>
          {!failed ? <Badge label={pill.label} tone={pill.tone} /> : null}
        </View>
        {failed ? (
          <ThemedText variant="caption" style={{ color: theme.colors.error }}>
            {photo.capacityRejected ? 'Not included — over your plan’s photo limit' : 'Not included — this photo failed'}
          </ThemedText>
        ) : observation ? (
          <ThemedText variant="caption" color="muted" numberOfLines={2}>
            {observation}
          </ThemedText>
        ) : null}
        {photo.analysisStatus === 'needs_attention' && (
          <ThemedText variant="caption" style={{ color: theme.colors.warning }}>
            Analysis needs attention
          </ThemedText>
        )}
        {photo.qualityWarning && (
          <ThemedText variant="caption" style={{ color: theme.colors.warning }}>
            Quality warning{photo.qualityReasons?.length ? `: ${photo.qualityReasons.join(', ')}` : ''}
          </ThemedText>
        )}
      </View>
      <Icon name="chevron-right" color={theme.colors.muted} />
    </Pressable>
  );
}

/** Web PhotoReview panel for one photo: full image, analysis tags, the Super Intelligence observation, and the
 * reviewer's accept / edit / exclude / note / room-area actions. Nothing reaches the report unreviewed. */
function PhotoReviewSheet({
  reportId,
  photo,
  canReview,
  busy,
  onReview,
  onClose,
}: {
  reportId: string;
  photo: ReportPhoto;
  canReview: boolean;
  busy: boolean;
  onReview: Review;
  onClose: () => void;
}) {
  const theme = useTheme();
  const analysis = analysisOf(photo);
  const review = reviewOf(photo);
  const status = review.status || 'pending';
  const pill = REVIEW_PILL[status] ?? REVIEW_PILL.pending;
  const [observation, setObservation] = useState(effectiveObservation(photo));
  const [note, setNote] = useState(review.note || '');
  const [area, setArea] = useState(photo.roomOrArea || '');
  const actionable = canReview && photo.reviewable !== false && photo.status !== 'failed';
  const input = [styles.input, { color: theme.colors.ink, borderColor: theme.colors.border, backgroundColor: theme.colors.background }];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.background }]}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheetHead}>
            <ThemedText variant="title" numberOfLines={1} accessibilityRole="header" style={styles.flex}>
              {photo.roomOrArea || photo.fileName}
            </ThemedText>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.iconBtn}>
              <Icon name="x" size={22} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <View style={[styles.hero, { borderRadius: theme.radii.card, backgroundColor: theme.colors.surface }]}>
              <AuthenticatedThumb
                scope={reportPhotoCacheScope(reportId)}
                cacheKey={`${photo.id}-original`}
                fetcher={() => reportsApi.getPhotoImage(reportId, photo.id, photo.hasOriginal ? 'original' : 'thumbnail')}
              />
            </View>
            <View style={styles.tags}>
              {analysis?.location ? <Badge label={analysis.location} tone="brand" /> : null}
              {analysis?.category ? <Badge label={analysis.category} /> : null}
              {analysis?.confidence != null ? <Badge label={`Confidence: ${analysis.confidence}`} /> : null}
              <Badge label={pill.label} tone={pill.tone} />
            </View>

            {analysis?.observation ? (
              <View style={[styles.suggestion, { backgroundColor: theme.colors.primarySoft }]}>
                <View style={styles.inline}>
                  <Icon name="star" size={12} color={theme.colors.primary} />
                  <ThemedText variant="caption" color="primary" style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
                    Suggested by Super Intelligence
                  </ThemedText>
                </View>
                <ThemedText variant="caption" color="muted" style={styles.italic}>
                  {analysis.observation}
                </ThemedText>
              </View>
            ) : null}

            <ThemedText variant="caption" color="muted" style={styles.label}>
              OBSERVATION{status === 'edited' ? ' (EDITED)' : ''}
            </ThemedText>
            {actionable ? (
              <>
                <TextInput value={observation} onChangeText={setObservation} multiline accessibilityLabel="Observation" style={[...input, styles.multi]} />
                <View style={styles.btnRow}>
                  <View style={styles.flex}>
                    <PrimaryButton
                      variant="secondary"
                      label="Save edit"
                      onPress={() => onReview(photo.id, 'edit', { observation: observation.trim() })}
                      disabled={busy || !observation.trim() || observation.trim() === effectiveObservation(photo)}
                    />
                  </View>
                  <View style={styles.flex}>
                    <PrimaryButton
                      icon="check"
                      label={status === 'approved' ? 'Approved' : 'Approve'}
                      onPress={() => onReview(photo.id, 'approve')}
                      disabled={busy || status === 'approved' || status === 'excluded'}
                    />
                  </View>
                </View>
              </>
            ) : (
              <ThemedText variant="body">{effectiveObservation(photo) || 'No observation.'}</ThemedText>
            )}

            <ThemedText variant="caption" color="muted" style={styles.label}>
              ROOM / AREA
            </ThemedText>
            {actionable ? (
              <View style={styles.btnRow}>
                <TextInput value={area} onChangeText={setArea} placeholder="e.g. Kitchen" placeholderTextColor={theme.colors.muted} accessibilityLabel="Room or area" style={[...input, styles.flex]} />
                <PrimaryButton
                  variant="secondary"
                  label="Save"
                  onPress={() => onReview(photo.id, 'set_area', { roomOrArea: area.trim() })}
                  disabled={busy || area.trim() === (photo.roomOrArea || '')}
                />
              </View>
            ) : (
              <ThemedText variant="body">{photo.roomOrArea || '—'}</ThemedText>
            )}

            <ThemedText variant="caption" color="muted" style={styles.label}>
              REVIEWER NOTE
            </ThemedText>
            {actionable ? (
              <>
                <TextInput value={note} onChangeText={setNote} multiline placeholder="Add a note for this photo" placeholderTextColor={theme.colors.muted} accessibilityLabel="Reviewer note" style={[...input, styles.multi]} />
                <PrimaryButton
                  variant="secondary"
                  label="Save note"
                  onPress={() => onReview(photo.id, 'note', { note: note.trim() })}
                  disabled={busy || note.trim() === (review.note || '')}
                />
              </>
            ) : (
              <ThemedText variant="body" color="muted">
                {review.note || 'No note.'}
              </ThemedText>
            )}

            {actionable ? (
              <View style={styles.exclude}>
                <PrimaryButton
                  variant={status === 'excluded' ? 'secondary' : 'danger'}
                  icon={status === 'excluded' ? 'plus-circle' : 'slash'}
                  label={status === 'excluded' ? 'Include in report' : 'Exclude from report'}
                  onPress={() => onReview(photo.id, status === 'excluded' ? 'include' : 'exclude')}
                  loading={busy}
                />
              </View>
            ) : (
              <ThemedText variant="caption" color="muted" style={styles.label}>
                Reviewing photos needs owner or reviewer access.
              </ThemedText>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export function PhotosTab({ reportId, canReview }: { reportId: string; canReview: boolean }) {
  const theme = useTheme();
  const { photos, loading, error, reviewError, clearReviewError, retry, review, reviewingId } = useReportPhotos(reportId);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = photos.find((p) => p.id === openId) ?? null;

  if (loading && photos.length === 0) return <LoadingState label="Loading photos…" />;
  if (error && photos.length === 0) return <StateMessage title="Could not load photos" description={error} onRetry={retry} />;
  if (photos.length === 0) return <StateMessage title="No photos" description="This report has no attached photos." />;

  const counts = photos.reduce<Record<string, number>>((acc, p) => {
    const s = p.status === 'failed' ? 'failed' : reviewOf(p).status || 'pending';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

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
      <ThemedText variant="caption" color="muted" style={styles.hint}>
        {photos.length} photo{photos.length === 1 ? '' : 's'} · {counts.approved ?? 0} approved · {counts.edited ?? 0} edited ·{' '}
        {counts.excluded ?? 0} excluded · {counts.pending ?? 0} pending
        {canReview ? '. Tap a photo to review its observation.' : ''}
      </ThemedText>
      {photos.map((photo) => (
        <PhotoRow key={photo.id} reportId={reportId} photo={photo} onOpen={() => setOpenId(photo.id)} />
      ))}
      {open ? (
        <PhotoReviewSheet
          key={open.id}
          reportId={reportId}
          photo={open}
          canReview={canReview}
          busy={reviewingId === open.id}
          onReview={review}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, padding: 10, marginBottom: 10, gap: 12 },
  thumb: { width: 72, height: 72, overflow: 'hidden' },
  thumbFallback: { width: '100%', height: '100%' },
  rowBody: { flex: 1, justifyContent: 'center', gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  banner: { padding: 10, marginBottom: 10 },
  hint: { marginBottom: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetBody: { padding: 16, paddingBottom: 40 },
  hero: { width: '100%', aspectRatio: 4 / 3, overflow: 'hidden' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  suggestion: { borderRadius: 12, padding: 12, marginTop: 12, gap: 4 },
  italic: { fontStyle: 'italic' },
  label: { letterSpacing: 0.6, fontFamily: 'Inter_600SemiBold', marginTop: 18, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, fontSize: 15 },
  multi: { minHeight: 90, textAlignVertical: 'top', paddingTop: 10, marginBottom: 10 },
  btnRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  exclude: { marginTop: 24 },
});
