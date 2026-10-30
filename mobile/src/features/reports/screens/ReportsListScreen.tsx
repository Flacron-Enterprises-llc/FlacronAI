import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import type { Report } from '@/services/api/reports';
import { useReportsList } from '../hooks/useReportsList';
import { ReportCard } from '../components/ReportCard';
import { StateMessage } from '../components/StateMessage';
import { ChoiceChips } from '../wizard/components/ChoiceChips';
import { LOSS_TYPES, REPORT_TYPES } from '../wizard/constants';
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

/** Web "My Reports" view: search (claim #, insured, address), status, loss type and report type filters, infinite
 * scroll. Archive / restore / delete / duplicate live in each report's ••• menu. */
export function ReportsListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [filterLabel, setFilterLabel] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [lossType, setLossType] = useState('');
  const [reportType, setReportType] = useState('');
  const status = STATUS_FILTERS.find((f) => f.label === filterLabel)?.value;

  // Debounced so typing doesn't send one request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query]);

  const list = useReportsList({
    status,
    search: search || undefined,
    lossType: lossType || undefined,
    reportType: reportType || undefined,
  });
  useRefreshOnFocus(list.refresh);
  const activeExtra = (lossType ? 1 : 0) + (reportType ? 1 : 0);
  const filtered = !!(status || search || activeExtra);

  const renderItem = ({ item }: { item: Report }) => (
    <ReportCard report={item} onPress={() => router.push({ pathname: '/report/[id]', params: { id: item.id } })} />
  );

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={styles.flex}>
          <ThemedText variant="heading" accessibilityRole="header">
            My Reports
          </ThemedText>
        </View>
        <PrimaryButton icon="zap" label="Generate" onPress={() => router.push('/report/new')} />
      </View>

      <View style={styles.searchRow}>
        <View style={[styles.search, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          <Icon name="search" color={theme.colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search claim #, insured or address"
            placeholderTextColor={theme.colors.muted}
            accessibilityLabel="Search reports"
            returnKeyType="search"
            autoCorrect={false}
            style={[styles.searchInput, { color: theme.colors.ink, fontFamily: theme.typography.fontFamily.body }]}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
              <Icon name="x-circle" color={theme.colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setShowFilters((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={`Filters${activeExtra ? `, ${activeExtra} active` : ''}`}
          accessibilityState={{ expanded: showFilters }}
          style={[
            styles.filterBtn,
            { borderColor: activeExtra ? theme.colors.primary : theme.colors.border, backgroundColor: activeExtra ? theme.colors.primarySoft : theme.colors.surface },
          ]}
        >
          <Icon name="sliders" color={activeExtra ? theme.colors.primary : theme.colors.ink} />
        </Pressable>
      </View>

      <ChoiceChips label="Status" value={filterLabel} options={FILTER_LABELS} onChange={setFilterLabel} />
      {showFilters ? (
        <>
          <ChoiceChips label="Loss type" value={lossType} options={LOSS_TYPES} allowDeselect onChange={setLossType} />
          <ChoiceChips label="Report type" value={reportType} options={REPORT_TYPES} allowDeselect onChange={setReportType} />
        </>
      ) : null}

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
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={theme.colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={list.loadMore}
          ListEmptyComponent={
            list.isOffline ? (
              <StateMessage title="You’re offline" description="Your reports will load once you’re connected." onRetry={list.retry} />
            ) : filtered ? (
              <StateMessage title="No reports found" description="Try a different search or filter." />
            ) : (
              <StateMessage
                title="No reports yet"
                description="Generate your first inspection report to get started."
                retryLabel="Generate Report"
                onRetry={() => router.push('/report/new')}
              />
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  flex: { flex: 1 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 46 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10 },
  filterBtn: { width: 46, height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  offline: { marginBottom: 8 },
  footerLoader: { marginVertical: 16 },
  emptyContent: { flexGrow: 1 },
});
