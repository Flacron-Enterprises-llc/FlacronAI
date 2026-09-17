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

const STATUS_FILTERS = ['All', 'draft', 'processing', 'finalized', 'archived'] as const;

export function ReportsListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const list = useReportsList(statusFilter === 'All' ? undefined : statusFilter);

  const renderItem = ({ item }: { item: Report }) => (
    <ReportCard report={item} onPress={() => router.push({ pathname: '/report/[id]', params: { id: item.id } })} />
  );

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <ThemedText variant="heading">Reports</ThemedText>
        <PrimaryButton label="+ New" onPress={() => router.push('/report/new')} />
      </View>

      <ChoiceChips label="Status" value={statusFilter} options={STATUS_FILTERS} onChange={setStatusFilter} />

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
          ListEmptyComponent={<StateMessage title="No reports found" description="Try a different status filter, or generate a new report." />}
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
