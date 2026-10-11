import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import type { Report } from '@/services/api/reports';
import { useReportsList } from '../hooks/useReportsList';
import { ReportCard } from '../components/ReportCard';
import { StateMessage } from '../components/StateMessage';
import { ChoiceChips } from '../wizard/components/ChoiceChips';
import { useRefreshOnFocus } from '../reportsEvents';

/** Label → the exact `status` value `GET /reports?status=` matches (an equality filter
 * server-side). `completed`/`approved` are legacy reviewed statuses older reports still carry;
 * archived reports only appear when explicitly requested. */
export const STATUS_FILTERS: { label: string; value: string | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Needs review', value: 'draft' },
  { label: 'Processing', value: 'processing' },
  { label: 'Failed', value: 'failed' },
  { label: 'Finalized', value: 'finalized' },
  { label: 'Completed', value: 'completed' },
  { label: 'Approved', value: 'approved' },
  { label: 'Archived', value: 'archived' },
];
const FILTER_LABELS = STATUS_FILTERS.map((f) => f.label);

export function ReportsListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [filterLabel, setFilterLabel] = useState<string>('All');
  const status = STATUS_FILTERS.find((f) => f.label === filterLabel)?.value;
  const list = useReportsList(status);
  useRefreshOnFocus(list.refresh);

  const renderItem = ({ item }: { item: Report }) => (
    <ReportCard report={item} onPress={() => router.push({ pathname: '/report/[id]', params: { id: item.id } })} />
  );

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <ThemedText variant="heading">Reports</ThemedText>
        <PrimaryButton label="+ New" onPress={() => router.push('/report/new')} />
      </View>

      <ChoiceChips label="Status" value={filterLabel} options={FILTER_LABELS} onChange={setFilterLabel} />

      {list.isOffline && (
        <ThemedText variant="caption" color="muted" style={styles.offline}>
          You appear to be offline. Pull down to refresh once connected.
        </ThemedText>
      )}

      {list.error && list.reports.length === 0 ? (
        <StateMessage title="Could not load reports" description={list.error} onRetry={list.retry} />
      ) : list.loading && list.reports.length === 0 ? (
        <StateMessage title="Loading…" />
      ) : (
        <FlatList
          data={list.reports}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={theme.colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={list.loadMore}
          ListEmptyComponent={
            list.isOffline ? (
              <StateMessage title="You’re offline" description="Your reports will load once you’re connected." onRetry={list.retry} />
            ) : (
              <StateMessage title="No reports found" description="Try a different status filter, or generate a new report." />
            )
          }
          ListFooterComponent={list.loadingMore ? <ActivityIndicator style={styles.footerLoader} color={theme.colors.primary} /> : null}
          contentContainerStyle={list.reports.length === 0 ? styles.emptyContent : undefined}
        />
      )}
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
  offline: {
    marginBottom: 8,
  },
  footerLoader: {
    marginVertical: 16,
  },
  emptyContent: {
    flexGrow: 1,
  },
});
