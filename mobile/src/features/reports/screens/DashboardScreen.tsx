import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { useDashboardSummary } from '../hooks/useDashboardSummary';
import { useReportsList } from '../hooks/useReportsList';
import { ReportCard } from '../components/ReportCard';
import { StateMessage } from '../components/StateMessage';

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.summaryCard,
        { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card },
      ]}
    >
      <ThemedText variant="heading" style={{ fontFamily: theme.typography.fontFamily.display }}>
        {value}
      </ThemedText>
      <ThemedText variant="caption" color="muted">
        {label}
      </ThemedText>
    </View>
  );
}

export function DashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { userProfile, firebaseUser } = useAuth();
  const summary = useDashboardSummary();
  const recent = useReportsList();

  const displayName = userProfile?.displayName || firebaseUser?.displayName || 'there';
  const refreshing = summary.refreshing || recent.refreshing;

  const onRefresh = () => {
    summary.refresh();
    recent.refresh();
  };

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        <ThemedText variant="heading" style={styles.greeting}>
          Welcome, {displayName}
        </ThemedText>

        <View style={styles.newReportWrap}>
          <PrimaryButton label="+ New report" onPress={() => router.push('/report/new')} />
        </View>

        {summary.error && !summary.summary ? (
          <StateMessage title="Could not load your dashboard" description={summary.error} onRetry={summary.retry} />
        ) : (
          <View style={styles.summaryRow}>
            <SummaryCard label="Awaiting review" value={summary.summary?.reportsAwaitingReview ?? '—'} />
            <SummaryCard label="Completed" value={summary.summary?.reportsCompleted ?? '—'} />
            <SummaryCard label="Photos analyzed" value={summary.summary?.photosAnalyzed ?? '—'} />
          </View>
        )}

        <View style={styles.recentHeader}>
          <ThemedText variant="subtitle">Recent reports</ThemedText>
          <ThemedText variant="caption" color="primary" onPress={() => router.push('/reports')}>
            View all
          </ThemedText>
        </View>

        {recent.isOffline && (
          <ThemedText variant="caption" color="muted" style={styles.offline}>
            You appear to be offline. Pull down to refresh once connected.
          </ThemedText>
        )}
        {recent.error && recent.reports.length === 0 ? (
          <StateMessage title="Could not load reports" description={recent.error} onRetry={recent.retry} />
        ) : recent.loading && recent.reports.length === 0 ? (
          <StateMessage title="Loading…" />
        ) : recent.reports.length === 0 ? (
          <StateMessage title="No reports yet" description="Generate your first report to see it here." />
        ) : (
          recent.reports
            .slice(0, 5)
            .map((report) => (
              <ReportCard key={report.id} report={report} onPress={() => router.push({ pathname: '/report/[id]', params: { id: report.id } })} />
            ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  greeting: {
    marginBottom: 16,
  },
  newReportWrap: {
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 12,
    alignItems: 'flex-start',
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  offline: {
    marginBottom: 12,
  },
});
