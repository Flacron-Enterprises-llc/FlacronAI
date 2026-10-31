import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { Icon, type IconName } from '@/components/ui';
import { apiErrorMessage } from '@/hooks/useApiResource';
import { ScreenHeader } from '@/components/ScreenHeader';
import { StateMessage } from '@/features/reports/components/StateMessage';
import { notificationsApi, type AppNotification, type NotificationType } from '@/services/api/notifications';
import { useTheme } from '@/theme';

const ICONS: Record<NotificationType, IconName> = {
  analysis_completed: 'cpu',
  analysis_failed: 'alert-circle',
  report_completed: 'file-text',
  review_requested: 'eye',
  review_declined: 'x-circle',
  report_approved: 'check-circle',
  report_shared: 'share-2',
  export_completed: 'download',
  team_invitation: 'users',
  subscription_issue: 'credit-card',
};

function reportIdOf(n: AppNotification): string | null {
  const id = (n.meta as { reportId?: unknown } | null)?.reportId;
  return typeof id === 'string' && id ? id : null;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const m = Math.round(ms / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Web NotificationBell dropdown as a full screen: paged list, mark read (on open), mark all read. */
export function NotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (nextPage: number, mode: 'initial' | 'refresh' | 'more') => {
    const id = ++seq.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    if (mode === 'more') setLoadingMore(true);
    setError(null);
    try {
      const res = await notificationsApi.list(nextPage);
      if (id !== seq.current) return;
      setItems((prev) => (nextPage === 1 ? res.notifications : [...prev, ...res.notifications]));
      setPage(res.page);
      setHasMore(res.hasMore);
      setUnread(res.unreadCount);
    } catch (err) {
      if (id === seq.current) setError(apiErrorMessage(err, 'We could not load your notifications.'));
    } finally {
      if (id === seq.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load(1, 'initial');
    })();
  }, [load]);

  const open = async (n: AppNotification) => {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      notificationsApi.markAsRead(n.id).catch(() => undefined);
    }
    const reportId = reportIdOf(n);
    if (reportId) router.push({ pathname: '/report/[id]', params: { id: reportId } });
    else if (n.type === 'subscription_issue') router.push('/billing');
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      let more = true;
      // The server clears at most 500 per call; repeat until done (each call is idempotent).
      for (let i = 0; more && i < 20; i += 1) more = (await notificationsApi.markAllAsRead()).more;
      setItems((prev) => prev.map((x) => ({ ...x, read: true })));
      setUnread(0);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : undefined}
        action={unread > 0 ? { label: markingAll ? 'Marking…' : 'Mark all read', onPress: markAll, disabled: markingAll } : undefined}
      />
      {loading ? (
        <StateMessage title="Loading…" />
      ) : error && items.length === 0 ? (
        <StateMessage title="Could not load notifications" description={error} onRetry={() => load(1, 'initial')} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(1, 'refresh')} tintColor={theme.colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => hasMore && !loadingMore && load(page + 1, 'more')}
          ListEmptyComponent={
            <StateMessage title="You're all caught up" description="Report, review and billing updates will appear here." />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.colors.primary} style={styles.more} /> : null}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => open(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.read ? '' : 'Unread. '}${item.title}. ${item.body}`}
              style={({ pressed }) => [
                styles.row,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: item.read ? theme.colors.background : theme.colors.primarySoft,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <View style={[styles.iconTile, { backgroundColor: theme.colors.surface }]}>
                <Icon name={ICONS[item.type] ?? 'bell'} color={theme.colors.primary} />
              </View>
              <View style={styles.text}>
                <ThemedText variant="body" style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
                  {item.title}
                </ThemedText>
                <ThemedText variant="caption" color="muted" style={styles.body}>
                  {item.body}
                </ThemedText>
                <ThemedText variant="caption" color="muted">
                  {timeAgo(item.createdAt)}
                </ThemedText>
              </View>
              {!item.read ? <View style={[styles.unreadDot, { backgroundColor: theme.colors.primary }]} /> : null}
            </Pressable>
          )}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, padding: 14, borderWidth: 1, borderRadius: 16, marginBottom: 10 },
  iconTile: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  body: { marginVertical: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  more: { marginVertical: 16 },
});
