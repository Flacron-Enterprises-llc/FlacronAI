import { useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { HeaderButton } from '@/components/brand/AppHeader';
import { LossPill } from '@/components/brand/Fields';
import { FilterTabs } from '@/components/brand/FilterTabs';
import { Reveal } from '@/components/brand/Reveal';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AuthenticatedThumb } from '@/features/photos/components/AuthenticatedThumb';
import { StatusBadge } from '../components/StatusBadge';
import { ThemedText } from '@/components/ThemedText';
import { Icon } from '@/components/ui/Icon';
import { apiErrorMessage } from '@/hooks/useApiResource';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { clearPhotoCacheScope } from '@/services/localData/fileCache';
import { reportsApi, type ExportOptions, type Report } from '@/services/api/reports';
import { clearPendingReport } from '@/features/navigation/pendingDeepLink';
import { useReportDetail } from '../hooks/useReportDetail';
import { getReportActions } from '../reportActions';
import { notifyReportsChanged } from '../reportsEvents';
import { LoadingState, StateMessage } from '../components/StateMessage';
import { OverviewTab } from '../detail/OverviewTab';
import { PhotosTab, reportPhotoCacheScope } from '../detail/PhotosTab';
import { CommentsTab } from '../detail/CommentsTab';
import { VersionsTab } from '../detail/VersionsTab';
import { ApprovalSheet } from '../detail/ApprovalSheet';
import { ExportSheet } from '../detail/ExportSheet';
import { ReviewResponseSheet } from '../detail/ReviewResponseSheet';
import { EditContentSheet } from '../detail/EditContentSheet';
import { ShareSheet } from '../detail/ShareSheet';
import { RequestReviewSheet } from '../detail/RequestReviewSheet';
import { SectionToolsSheet } from '../detail/SectionToolsSheet';

type Tab = 'overview' | 'photos' | 'comments' | 'versions';

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Report' },
  { value: 'photos', label: 'Photos' },
  { value: 'comments', label: 'Comments' },
  { value: 'versions', label: 'History' },
];

interface MenuItem {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

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
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sectionTools, setSectionTools] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);

  const actions = getReportActions(report, myAccess, firebaseUser?.uid ?? null);

  // A remembered sign-in deep link to this report has now been honored.
  useEffect(() => clearPendingReport(reportId), [reportId]);

  // This screen's cached thumbnails are only useful while it's open.
  useEffect(() => () => clearPhotoCacheScope(reportPhotoCacheScope(reportId)), [reportId]);

  const cover = (report?.photos ?? []).find((p) => p && p.id && p.status !== 'failed' && p.status !== 'duplicate')?.id ?? null;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/dashboard');
  };

  const run = async (fn: () => Promise<void>) => {
    setMenuError(null);
    try {
      await fn();
    } catch (err) {
      setMenuError(apiErrorMessage(err));
    }
  };

  const confirm = (title: string, message: string, label: string, fn: () => Promise<void>) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, style: 'destructive', onPress: () => run(fn) },
    ]);

  // Web report row / preview actions. Owner-only ones are offered to the owner only; the server enforces the same.
  const menuItems: MenuItem[] = [];
  if (report) {
    if (actions.canShare) menuItems.push({ label: 'Share…', onPress: () => setSharing(true) });
    if (actions.isOwner) {
      menuItems.push({
        label: 'Duplicate',
        onPress: () =>
          run(async () => {
            const res = await reportsApi.duplicate(reportId);
            notifyReportsChanged();
            router.push({ pathname: '/report/[id]', params: { id: res.report.id } });
          }),
      });
      if (report.status === 'archived') {
        menuItems.push({
          label: 'Restore',
          onPress: () =>
            run(async () => {
              await reportsApi.restore(reportId);
              detail.refresh();
              notifyReportsChanged();
            }),
        });
      } else {
        menuItems.push({
          label: 'Archive',
          onPress: () =>
            confirm('Archive this report?', 'It is hidden from your reports until you restore it.', 'Archive', async () => {
              await reportsApi.remove(reportId);
              notifyReportsChanged();
              goBack();
            }),
        });
      }
      menuItems.push({
        label: 'Delete permanently',
        destructive: true,
        onPress: () =>
          confirm('Delete permanently?', 'The report and its photos are deleted. This cannot be undone.', 'Delete', async () => {
            await reportsApi.remove(reportId, true);
            notifyReportsChanged();
            goBack();
          }),
      });
    }
    menuItems.push({ label: 'Refresh', onPress: detail.refresh });
  }

  const openMenu = () => {
    if (Platform.OS === 'ios') {
      const options = [...menuItems.map((m) => m.label), 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: menuItems.findIndex((m) => m.destructive) },
        (i) => menuItems[i]?.onPress()
      );
      return;
    }
    Alert.alert('Report actions', undefined, [
      ...menuItems.map((m) => ({ text: m.label, style: m.destructive ? ('destructive' as const) : ('default' as const), onPress: m.onPress })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <ScreenContainer
      headerLeft="back"
      headerRight={report ? <HeaderButton icon="more-vertical" label="Report actions" onPress={openMenu} /> : undefined}
    >
      {report ? (
        <Reveal style={[styles.summary, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={styles.cover}>
            {cover ? (
              <AuthenticatedThumb scope={reportPhotoCacheScope(reportId)} cacheKey={`cover-${cover}`} fetcher={() => reportsApi.getPhotoImage(reportId, cover, 'thumbnail')} />
            ) : (
              <View style={styles.coverEmpty}>
                <Icon name="home" size={28} color={theme.colors.navy} />
              </View>
            )}
          </View>
          <View style={styles.headerTitle}>
            <ThemedText variant="subtitle" numberOfLines={1} accessibilityRole="header" style={{ fontFamily: theme.typography.fontFamily.display }}>
              {report.insuredName || `Claim ${report.claimNumber}`}
            </ThemedText>
            <ThemedText variant="caption" color="muted" numberOfLines={1}>
              Claim {report.claimNumber}
              {report.propertyAddress ? ` · ${report.propertyAddress}` : ''}
            </ThemedText>
            <View style={styles.tags}>
              <LossPill lossType={report.lossType} />
              <StatusBadge status={report.status} compact />
            </View>
          </View>
        </Reveal>
      ) : null}
      {!!menuError && (
        <ThemedText variant="caption" accessibilityRole="alert" style={[styles.menuError, { color: theme.colors.error }]}>
          {menuError}
        </ThemedText>
      )}

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
                Still processing — automatic updates paused. Use ••• → Refresh to check again.
              </ThemedText>
            </View>
          )}

          <FilterTabs
            tabs={TAB_OPTIONS.map((o) => ({ key: o.value, label: o.label, count: o.value === 'photos' ? report.imageCount ?? null : undefined }))}
            value={tab}
            onChange={(k) => setTab(k as Tab)}
          />

          <View style={styles.body}>
            {tab === 'overview' && (
              <OverviewTab
                report={report}
                actions={actions}
                retryingAnalysis={detail.retryingAnalysis}
                actionError={detail.actionError}
                onRetryAnalysis={detail.retryAnalysis}
                onRespondToReview={() => setResponding(true)}
                onEdit={() => setEditing(true)}
                onSectionTools={() => setSectionTools(true)}
                onRequestReview={() => setRequesting(true)}
                onChanged={detail.refresh}
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
                    icon={actions.isReviewed ? 'check-circle' : 'check'}
                    label={actions.isReviewed ? 'Approved' : 'Approve & Finalize'}
                    onPress={() => setApproving(true)}
                    variant={actions.canApprove ? 'primary' : 'secondary'}
                    disabled={!actions.canApprove}
                  />
                </View>
                <View style={styles.actionBtn}>
                  <PrimaryButton
                    icon="download"
                    label="Export"
                    onPress={() => setExporting(true)}
                    variant={actions.canApprove ? 'secondary' : 'primary'}
                    disabled={!actions.canExport}
                  />
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

          {editing && (
            <EditContentSheet
              visible
              report={report}
              reopensApproval={actions.editReopens}
              onClose={() => setEditing(false)}
              onSaved={(patch) => detail.applyUpdate({ ...report, ...patch } as Report)}
            />
          )}
          {sectionTools && (
            <SectionToolsSheet
              report={report}
              onClose={() => setSectionTools(false)}
              onSaved={(content) => detail.applyUpdate({ ...report, content } as Report)}
            />
          )}
          {requesting && (
            <RequestReviewSheet
              reportId={reportId}
              onClose={() => setRequesting(false)}
              onRequested={(reviewRequest) => detail.applyUpdate({ ...report, reviewRequest } as Report)}
            />
          )}
          {sharing && (
            <ShareSheet reportId={reportId} claimNumber={report.claimNumber} finalized={actions.isReviewed} onClose={() => setSharing(false)} />
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
      {exporting && (
        <ExportSheet
          visible
          reportId={reportId}
          defaults={(report?.exportDefaults as Partial<ExportOptions> | undefined) ?? null}
          onClose={() => setExporting(false)}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
    marginBottom: 8,
  },
  cover: { width: 96, height: 80, borderRadius: 12, overflow: 'hidden', backgroundColor: '#E9EEF6' },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  tags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  menuError: {
    marginBottom: 8,
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
