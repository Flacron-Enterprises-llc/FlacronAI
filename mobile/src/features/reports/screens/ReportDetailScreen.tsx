import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useReportDetail } from '../hooks/useReportDetail';
import { isApprovalEligible } from '../hooks/useReportApproval';
import { SegmentedControl } from '../components/SegmentedControl';
import { LoadingState, StateMessage } from '../components/StateMessage';
import { OverviewTab } from '../detail/OverviewTab';
import { PhotosTab } from '../detail/PhotosTab';
import { CommentsTab } from '../detail/CommentsTab';
import { VersionsTab } from '../detail/VersionsTab';
import { ApprovalSheet } from '../detail/ApprovalSheet';
import { ExportSheet } from '../detail/ExportSheet';

type Tab = 'overview' | 'photos' | 'comments' | 'versions';

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'photos', label: 'Photos' },
  { value: 'comments', label: 'Comments' },
  { value: 'versions', label: 'History' },
];

export function ReportDetailScreen({ reportId }: { reportId: string }) {
  const router = useRouter();
  const { report, loading, error, retry, applyUpdate } = useReportDetail(reportId);
  const [tab, setTab] = useState<Tab>('overview');
  const [approving, setApproving] = useState(false);
  const [exporting, setExporting] = useState(false);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <ThemedText variant="body" color="primary">
            ← Back
          </ThemedText>
        </Pressable>
        <ThemedText variant="title" numberOfLines={1} style={styles.headerTitle}>
          {report?.claimNumber || 'Report'}
        </ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      {loading && !report && <LoadingState label="Loading report…" />}
      {error && !report && <StateMessage title="Could not load this report" description={error} onRetry={retry} />}

      {!!report && (
        <>
          <SegmentedControl options={TAB_OPTIONS} value={tab} onChange={setTab} />

          <View style={styles.body}>
            {tab === 'overview' && <OverviewTab report={report} />}
            {tab === 'photos' && <PhotosTab reportId={reportId} />}
            {tab === 'comments' && <CommentsTab reportId={reportId} />}
            {tab === 'versions' && <VersionsTab reportId={reportId} active={tab === 'versions'} />}
          </View>

          {tab === 'overview' && (
            <View style={styles.actions}>
              <View style={styles.actionBtn}>
                <PrimaryButton
                  label="Approve & finalize"
                  onPress={() => setApproving(true)}
                  variant="secondary"
                  disabled={!isApprovalEligible(report)}
                />
              </View>
              <View style={styles.actionBtn}>
                <PrimaryButton label="Export" onPress={() => setExporting(true)} disabled={report.status === 'processing'} />
              </View>
            </View>
          )}
        </>
      )}

      <ApprovalSheet visible={approving} reportId={reportId} onClose={() => setApproving(false)} onApproved={applyUpdate} />
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
    width: 50,
  },
  body: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
  },
  actionBtn: {
    flex: 1,
  },
});
