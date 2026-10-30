import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ThemedText } from '@/components/ThemedText';
import { Card, MetricCard, ProgressBar, SectionHeader } from '@/components/ui';
import { useApiResource } from '@/hooks/useApiResource';
import { SegmentedControl } from '@/features/reports/components/SegmentedControl';
import { StateMessage } from '@/features/reports/components/StateMessage';
import { formatStatus } from '@/features/reports/components/StatusBadge';
import { analyticsApi, type AnalyticsRange } from '@/services/api/analytics';
import { useTheme } from '@/theme';

const RANGES = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: '365d', label: '1Y' },
  { value: 'all', label: 'All' },
] as const;

function completionLabel(hours: number | null): string {
  if (hours == null) return 'Not enough data yet';
  return hours >= 24 ? `${(hours / 24).toFixed(1)} days` : `${hours} hrs`;
}

/** Web Analytics page (server-computed metrics only): stat cards, breakdowns, 12-month usage, and the per-member table
 * for organization scope. Custom date ranges are web-only. */
export function AnalyticsScreen() {
  const theme = useTheme();
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const res = useApiResource(() => analyticsApi.get(range).then((r) => r.analytics), [range]);
  const a = res.data;
  const isOrg = a?.scope === 'organization';
  const maxMonth = Math.max(1, ...(a?.monthlyUsage ?? []).map((m) => m.reports));

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={res.refreshing} onRefresh={res.refresh} tintColor={theme.colors.primary} />}
      >
        <View style={styles.column}>
          <ScreenHeader title={isOrg ? 'Organization Analytics' : 'Analytics'} subtitle={a?.range.label} />
          <View style={styles.block}>
            <SegmentedControl options={RANGES} value={range} onChange={setRange} />
          </View>

          {res.loading && !a ? (
            <StateMessage title="Loading…" />
          ) : res.error && !a ? (
            <StateMessage title="Could not load analytics" description={res.error} onRetry={res.retry} />
          ) : a ? (
            <>
              <View style={styles.metrics}>
                <MetricCard icon="file-text" label="Reports Generated" value={a.metrics.reportsGenerated} sub={isOrg ? 'Across your whole team' : undefined} />
                <MetricCard icon="image" label="Photos Analyzed" value={a.metrics.photosAnalyzed} />
                <MetricCard
                  icon="clock"
                  label="Avg. Report Completion Time"
                  value={completionLabel(a.metrics.avgCompletionHours)}
                  sub={a.metrics.avgCompletionSampleSize ? `Based on ${a.metrics.avgCompletionSampleSize} finalized` : undefined}
                />
              </View>

              <Breakdown title="Reports By Type" data={a.metrics.reportsByType} total={a.metrics.reportsGenerated} />
              <Breakdown title="Reports By Status" data={a.metrics.reportsByStatus} total={a.metrics.reportsGenerated} format />

              <SectionHeader title="Monthly Usage" />
              <Card style={styles.block}>
                <View style={styles.chart} accessibilityLabel="Reports per month, last 12 months">
                  {a.monthlyUsage.map((m) => (
                    <View key={m.key} style={styles.barCol} accessibilityLabel={`${m.label}: ${m.reports} reports`}>
                      <ThemedText variant="caption" color="muted" style={styles.barValue}>
                        {m.reports || ''}
                      </ThemedText>
                      <View style={styles.barTrack}>
                        <View
                          style={{
                            height: `${Math.round((m.reports / maxMonth) * 100)}%`,
                            backgroundColor: theme.colors.primary,
                            borderRadius: 4,
                            minHeight: m.reports ? 3 : 0,
                          }}
                        />
                      </View>
                      <ThemedText variant="caption" color="muted" style={styles.barLabel}>
                        {m.label.slice(0, 3)}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </Card>

              {isOrg && a.reportsPerUser && a.reportsPerUser.length > 0 ? (
                <>
                  <SectionHeader title="Reports Per Team Member" />
                  <Card padded={false} style={styles.block}>
                    {a.reportsPerUser.map((m, i) => (
                      <View key={m.uid} style={[styles.memberRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.colors.border }]}>
                        <ThemedText variant="body" numberOfLines={1} style={styles.flex}>
                          {m.displayName || m.email || 'Team member'}
                        </ThemedText>
                        <ThemedText variant="caption" color="muted">
                          {m.reportsGenerated} reports · {m.photosAnalyzed} photos
                        </ThemedText>
                      </View>
                    ))}
                  </Card>
                </>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function Breakdown({ title, data, total, format }: { title: string; data: Record<string, number>; total: number; format?: boolean }) {
  const entries = Object.entries(data).sort((x, y) => y[1] - x[1]);
  return (
    <>
      <SectionHeader title={title} />
      <Card style={styles.block}>
        {entries.length === 0 ? (
          <ThemedText variant="body" color="muted">
            No reports in this range.
          </ThemedText>
        ) : (
          entries.map(([key, count]) => (
            <View key={key} style={styles.breakRow}>
              <View style={styles.breakHead}>
                <ThemedText variant="body" numberOfLines={1} style={styles.flex}>
                  {format ? formatStatus(key) : key}
                </ThemedText>
                <ThemedText variant="caption" color="muted">
                  {count}
                </ThemedText>
              </View>
              <ProgressBar percent={total ? (count / total) * 100 : 0} height={6} />
            </View>
          ))
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingBottom: 24 },
  block: { marginBottom: 20 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  flex: { flex: 1, minWidth: 0 },
  breakRow: { marginBottom: 12 },
  breakHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', height: '100%' },
  barValue: { fontSize: 10, marginBottom: 2 },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  barLabel: { fontSize: 10, marginTop: 4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 48 },
});
