import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Card } from '@/components/ui';
import { useApiResource } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { describeAgent } from '@/features/account/screens/LoginHistoryScreen';
import { formatStatus } from '@/features/reports/components/StatusBadge';
import { StateMessage } from '@/features/reports/components/StateMessage';
import { ChoiceChips } from '@/features/reports/wizard/components/ChoiceChips';
import { organizationApi } from '@/services/api/organization';
import { ApiRequestError } from '@/types/api';
import { useTheme } from '@/theme';

const RANGES = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'All', days: null },
] as const;

/** Web AuditLogViewer: range, action and person filters (from the server's `actionsSeen` / `roster`), 20 per page,
 * expandable rows. Custom date ranges are web-only. */
export function AuditLogList() {
  const theme = useTheme();
  const [range, setRange] = useState<string>('30 days');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const days = RANGES.find((r) => r.label === range)?.days ?? 30;

  const res = useApiResource(
    () =>
      organizationApi
        .auditLogs({
          startDate: days === null ? new Date(0).toISOString() : new Date(Date.now() - days * 86400000).toISOString(),
          action: action || undefined, actorUid: actor || undefined, page })
        .catch((e) => {
          if (e instanceof ApiRequestError && e.status === 403) setDenied(true);
          throw e;
        }),
    [range, action, actor, page]
  );
  if (denied) {
    return <StateMessage title="Restricted" description="Audit logs are available to Enterprise organization admins." />;
  }
  const d = res.data;
  const roster = d?.roster ?? [];
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <ScrollView>
      <ChoiceChips label="Range" value={range} options={RANGES.map((r) => r.label)} onChange={(v) => reset(() => setRange(v))} />
      {d?.actionsSeen?.length ? (
        <ChoiceChips label="Action" value={action ? formatStatus(action) : ''} options={d.actionsSeen.map(formatStatus)} allowDeselect onChange={(v) => reset(() => setAction(d.actionsSeen.find((a) => formatStatus(a) === v) ?? ''))} />
      ) : null}
      {roster.length > 1 ? (
        <ChoiceChips
          label="Person"
          value={roster.find((r) => r.uid === actor)?.email ?? ''}
          options={roster.map((r) => r.email)}
          allowDeselect
          onChange={(v) => reset(() => setActor(roster.find((r) => r.email === v)?.uid ?? ''))}
        />
      ) : null}
      {res.loading && !d ? (
        <StateMessage title="Loading…" />
      ) : res.error && !d ? (
        <StateMessage title="Could not load audit logs" description={res.error} onRetry={res.retry} />
      ) : d && d.items.length === 0 ? (
        <StateMessage title="No activity in this range" />
      ) : d ? (
        <>
          <Card padded={false}>
            {d.items.map((log) => (
              <Pressable
                key={log.id}
                onPress={() => setOpen(open === log.id ? null : log.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open === log.id }}
                style={[styles.row, { borderBottomColor: theme.colors.border }]}
              >
                <View style={styles.head}>
                  <ThemedText variant="body" style={[styles.flex, { fontFamily: theme.typography.fontFamily.bodySemiBold }]}>
                    {formatStatus(log.action)}
                  </ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {new Date(log.timestamp).toLocaleString()}
                  </ThemedText>
                </View>
                <ThemedText variant="caption" color="muted" numberOfLines={1}>
                  {log.actorEmail || log.actorUid}
                  {log.targetType ? ` · ${formatStatus(log.targetType)}` : ''}
                </ThemedText>
                {open === log.id ? (
                  <View style={styles.detail}>
                    {log.targetId ? <ThemedText variant="caption">Target: {log.targetId}</ThemedText> : null}
                    <ThemedText variant="caption">Device: {describeAgent(log.userAgent)}</ThemedText>
                    {log.ip ? <ThemedText variant="caption">IP: {log.ip}</ThemedText> : null}
                    {log.meta && Object.keys(log.meta).length ? (
                      <ThemedText variant="caption" color="muted">
                        {JSON.stringify(log.meta)}
                      </ThemedText>
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            ))}
          </Card>
          <View style={styles.pager}>
            <View style={styles.flex}>
              <PrimaryButton variant="secondary" label="Previous" onPress={() => setPage((p) => p - 1)} disabled={d.page <= 1} />
            </View>
            <ThemedText variant="caption" color="muted">
              Page {d.page} of {d.totalPages} · {d.total} total
            </ThemedText>
            <View style={styles.flex}>
              <PrimaryButton variant="secondary" label="Next" onPress={() => setPage((p) => p + 1)} disabled={d.page >= d.totalPages} />
            </View>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  detail: { marginTop: 6, gap: 2 },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
});
