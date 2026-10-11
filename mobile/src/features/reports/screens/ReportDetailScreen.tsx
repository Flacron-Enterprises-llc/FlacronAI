import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { clearPhotoCacheScope } from '@/services/localData/fileCache';
import { clearPendingReport } from '@/features/navigation/pendingDeepLink';
import { useReportDetail } from '../hooks/useReportDetail';
import { getReportActions } from '../reportActions';
import { SegmentedControl } from '../components/SegmentedControl';
import { LoadingState, StateMessage } from '../components/StateMessage';
import { OverviewTab } from '../detail/OverviewTab';
import { PhotosTab, reportPhotoCacheScope } from '../detail/PhotosTab';
import { CommentsTab } from '../detail/CommentsTab';
import { VersionsTab } from '../detail/VersionsTab';
import { ApprovalSheet } from '../detail/ApprovalSheet';
import { ExportSheet } from '../detail/ExportSheet';
import { ReviewResponseSheet } from '../detail/ReviewResponseSheet';

type Tab = 'overview' | 'photos' | 'comments' | 'versions';

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'photos', label: 'Photos' },
  { value: 'comments', label: 'Comments' },
  { value: 'versions', label: 'History' },
];

export function ReportDetailScreen({ reportId }: { reportId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const detail = useReportDetail(reportId);
  const { report, myAccess, loading, error } = detail;
  const [tab, setTab] = useState<Tab>('overview');
  const [approving, setApproving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [responding, setResponding] = useState(false);

  const actions = getReportActions(report, myAccess, firebaseUser?.uid ?? null);

  // A remembered sign-in deep link to this report has now been honored.
  useEffect(() => clearPendingReport(reportId), [reportId]);

  // This screen's cached thumbnails are only useful while it's open.
  useEffect(() => () => clearPhotoCacheScope(reportPhotoCacheScope(reportId)), [reportId]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/dashboard');
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel="Back">
          <ThemedText variant="body" color="primary">
            ← Back
          </ThemedText>
        </Pressable>
        <ThemedText variant="title" numberOfLines={1} style={styles.headerTitle}>
          {report?.claimNumber || 'Report'}
        </ThemedText>
        <Pressable onPress={detail.refresh} accessibilityRole="button" accessibilityLabel="Refresh report" style={styles.headerSpacer}>
          <ThemedText variant="caption" color="primary" style={styles.refresh}>
            Refresh
          </ThemedText>
        </Pressable>
      </View>

      {loading && !report && <LoadingState label="Loading report…" />}
      {error && !report && <StateMessage title="Could not load this report" description={error} onRetry={detail.retry} />}

      {!!report && (
        <>
          {!!detail.pollIssue && (
            <View style={[styles.banner, { backgroundColor: theme.colors.warning + '22', borderRadius: theme.radii.btn }]}>
              <ThemedText variant="caption" style={{ color: theme.colors.warning }}>
                {detail.pollIssue}
              </ThemedText>
            </View>
          )}
          {detail.pollingStopped && !detail.pollIssue && (
            <View style={[styles.banner, { backgroundColor: theme.colors.info + '22', borderRadius: theme.radii.btn }]}>
              <ThemedText variant="caption" style={{ color: theme.colors.info }}>
                Still processing — automatic updates paused. Tap Refresh to check again.
              </ThemedText>
            </View>
          )}

          <SegmentedControl options={TAB_OPTIONS} value={tab} onChange={setTab} />

          <View style={styles.body}>
            {tab === 'overview' && (
              <OverviewTab
                report={report}
                actions={actions}
                retryingAnalysis={detail.retryingAnalysis}
                actionError={detail.actionError}
                onRetryAnalysis={detail.retryAnalysis}
                onRespondToReview={() => setResponding(true)}
              />
            )}
            {tab === 'photos' && <PhotosTab reportId={reportId} canReview={actions.canReviewPhotos} />}
            {tab === 'comments' && <CommentsTab reportId={reportId} canComment={actions.canComment} />}
            {tab === 'versions' && <VersionsTab reportId={reportId} active={tab === 'versions'} />}
          </View>

          {tab === 'overview' && (
            <View style={styles.actionsWrap}>
              <View style={styles.actions}>
                <View style={styles.actionBtn}>
                  <PrimaryButton
                    label={actions.isReviewed ? 'Approved' : 'Approve & finalize'}
                    onPress={() => setApproving(true)}
                    variant="secondary"
                    disabled={!actions.canApprove}
                  />
                </View>
                <View style={styles.actionBtn}>
                  <PrimaryButton label="Export" onPress={() => setExporting(true)} disabled={!actions.canExport} />
                </View>
              </View>
              {(!!actions.approveNote || !!actions.exportNote) && (
                <ThemedText variant="caption" color="muted" style={styles.note}>
                  {[actions.approveNote && `Approve: ${actions.approveNote}`, actions.exportNote && `Export: ${actions.exportNote}`]
                    .filter(Boolean)
                    .join('  ·  ')}
                </ThemedText>
              )}
            </View>
          )}

          <ReviewResponseSheet
            visible={responding}
            report={report}
            onClose={() => setResponding(false)}
            onResponded={detail.applyUpdate}
          />
        </>
      )}

      <ApprovalSheet visible={approving} reportId={reportId} onClose={() => setApproving(false)} onApproved={detail.applyUpdate} />
      <ExportSheet visible={exporting} reportId={reportId} onClose={() => setExporting(false)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 60,
  },
  refresh: {
    textAlign: 'right',
  },
  banner: {
    padding: 10,
    marginBottom: 10,
  },
  body: {
    flex: 1,
  },
  actionsWrap: {
    paddingTop: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
  },
  note: {
    marginTop: 6,
    textAlign: 'center',
  },
});
