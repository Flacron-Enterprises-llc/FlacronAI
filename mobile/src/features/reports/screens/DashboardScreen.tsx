import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { Card, Icon, ProgressBar, SectionHeader, TierBadge } from '@/components/ui';
import type { IconName } from '@/components/ui/Icon';
import { Reveal } from '@/components/brand/Reveal';
import { ActionTile, StatChip } from '@/components/brand/Tiles';
import { brand, type ToneName } from '@/theme/brand';
import { useApiResource } from '@/hooks/useApiResource';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { NotificationPrimerCard } from '@/features/push/components/NotificationPrimerCard';
import { ProductTour } from '@/features/tour/ProductTour';
import { useTourTarget } from '@/features/tour/tourTargets';
import { useRef } from 'react';
import type { View as RNView } from 'react-native';
import { Icon as UiIcon } from '@/components/ui/Icon';
import { reportsApi } from '@/services/api/reports';
import { usersApi } from '@/services/api/users';
import { useDashboardSummary } from '../hooks/useDashboardSummary';
import { useReportsList } from '../hooks/useReportsList';
import { useRefreshOnFocus } from '../reportsEvents';
import { ReportCard } from '../components/ReportCard';
import { StateMessage } from '../components/StateMessage';

interface Tile {
  icon: IconName;
  label: string;
  tone: ToneName;
  path: string;
  /** Not in the account's plan: shown with a lock and opens the plans page (Golden Rule #4). */
  locked?: boolean;
}

function tileRows(tiles: Tile[]): Tile[][] {
  const rows: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += 3) rows.push(tiles.slice(i, i + 3));
  return rows;
}

function greetingWord(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Web usage colours (DashboardSidebar / mobile usage panel): green unlimited, red ≥90%, amber ≥70%, brand otherwise. */
function usageColor(percent: number, unlimited: boolean, theme: ReturnType<typeof useTheme>): string {
  if (unlimited) return theme.colors.success;
  if (percent >= 90) return theme.colors.error;
  if (percent >= 70) return theme.colors.warning;
  return theme.colors.primary;
}

/**
 * The web dashboard `home` view (Dashboard.jsx): greeting + Generate Report, plan usage, four metric cards, recent
 * reports, Shared With You, and the FLACRON ENGINE usage panel. Every number comes from the server; a value the server
 * can't provide shows "—" / "Not yet available" rather than a guess (Golden Rules #1/#4).
 */
export function DashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const { userProfile, firebaseUser } = useAuth();
  const summary = useDashboardSummary();
  const recent = useReportsList();
  const usage = useApiResource(() => usersApi.getUsage().then((r) => r.usage));
  const assigned = useApiResource(() => reportsApi.listAssignedToMe().then((r) => r.reports));

  const firstName =
    userProfile?.firstName || userProfile?.displayName?.split(' ')[0] || firebaseUser?.displayName?.split(' ')[0] || 'there';
  const refreshing = summary.refreshing || recent.refreshing || usage.refreshing;

  const onRefresh = () => {
    summary.refresh();
    recent.refresh();
    usage.refresh();
    assigned.refresh();
  };
  useRefreshOnFocus(onRefresh);

  const u = usage.data;
  const unlimited = u?.reportsLimit === -1;
  const percent = u && !unlimited && u.reportsLimit > 0 ? Math.min(100, Math.round((u.reportsThisMonth / u.reportsLimit) * 100)) : 0;
  const shared = (assigned.data ?? []).slice(0, 5);

  const newReport = () => router.push('/report/new');
  const tier = u?.tier ?? userProfile?.tier;
  const tiles: Tile[] = [
    { icon: 'folder', label: 'Projects', tone: 'blue', path: '/reports' },
    { icon: 'camera', label: 'Photos', tone: 'blue', path: '/photos' },
    { icon: 'layers', label: 'Templates', tone: 'violet', path: '/templates' },
    { icon: 'users', label: 'Clients', tone: 'blue', path: '/crm', locked: !!u && !u.features?.crmAccess },
    { icon: 'file-text', label: 'Reports', tone: 'blue', path: '/library' },
    { icon: 'bar-chart-2', label: 'Analytics', tone: 'green', path: '/analytics' },
    { icon: 'search', label: 'Search', tone: 'slate', path: '/search' },
    { icon: 'bell', label: 'Alerts', tone: 'amber', path: '/notifications' },
    { icon: 'credit-card', label: 'Billing', tone: 'green', path: '/billing' },
    { icon: 'briefcase', label: 'Team', tone: 'violet', path: '/organization', locked: !!u && tier !== 'enterprise' },
    { icon: 'help-circle', label: 'Help', tone: 'teal', path: '/account/legal' },
    { icon: 'settings', label: 'Settings', tone: 'slate', path: '/settings' },
  ];
  const screenRef = useRef<RNView>(null);
  const generateRef = useTourTarget('generate-cta');
  const usageRef = useTourTarget('usage-card');
  const searchRef = useTourTarget('search-button');

  return (
    <ScreenContainer>
      <View ref={screenRef} collapsable={false} style={styles.fill}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        <View style={styles.column}>
          <Reveal style={styles.welcomeRow}>
            <View style={[styles.avatarLg, { backgroundColor: brand.navy }]}>
              <ThemedText variant="title" style={styles.avatarText}>
                {firstName.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
            <View style={styles.headerText}>
              <ThemedText variant="body" color="muted">
                {greetingWord()},
              </ThemedText>
              <ThemedText variant="title" accessibilityRole="header" numberOfLines={1} style={styles.name}>
                {firstName}
              </ThemedText>
            </View>
            <View ref={searchRef} collapsable={false}>
              <Pressable
                onPress={() => router.push('/search')}
                accessibilityRole="button"
                accessibilityLabel="Search"
                hitSlop={8}
                style={[styles.headerBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
              >
                <UiIcon name="search" size={20} />
              </Pressable>
            </View>
          </Reveal>

          <View style={styles.chips}>
            <Reveal index={1} style={styles.flex}>
              <StatChip tone="blue" label="This Month" value={u?.reportsThisMonth} loading={usage.loading && !u} onPress={() => router.navigate('/reports')} />
            </Reveal>
            <Reveal index={2} style={styles.flex}>
              <StatChip tone="orange" label="Photos" value={summary.summary?.photosAnalyzed} loading={summary.loading && !summary.summary} onPress={() => router.push('/photos')} />
            </Reveal>
            <Reveal index={3} style={styles.flex}>
              <StatChip tone="green" label="Completed" value={summary.summary?.reportsCompleted} loading={summary.loading && !summary.summary} onPress={() => router.navigate('/library')} />
            </Reveal>
            <Reveal index={4} style={styles.flex}>
              <StatChip tone="red" label="Pending" value={summary.summary?.reportsAwaitingReview} loading={summary.loading && !summary.summary} onPress={() => router.navigate('/reports')} />
            </Reveal>
          </View>

          <Reveal index={5}>
            <View ref={generateRef} collapsable={false} style={styles.cta}>
              <PrimaryButton label="New Inspection" icon="plus" onPress={newReport} />
            </View>
          </Reveal>

          <View style={styles.grid}>
            {tileRows(tiles).map((row, r) => (
              <View key={r} style={styles.gridRow}>
                {row.map((t, i) => (
                  <Reveal key={t.label} index={6 + r * 3 + i} style={styles.flex}>
                    <ActionTile icon={t.icon} label={t.label} tone={t.tone} locked={t.locked} onPress={() => router.push((t.locked ? '/subscription' : t.path) as never)} />
                  </Reveal>
                ))}
              </View>
            ))}
          </View>

          {/* Plan + usage (web mobile usage panel / sidebar card). */}
          <View ref={usageRef} collapsable={false}>
          <Card style={styles.block}>
            <View style={styles.planRow}>
              <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
                <ThemedText variant="subtitle" style={styles.avatarText}>
                  {(userProfile?.displayName || firebaseUser?.email || 'U').charAt(0).toUpperCase()}
                </ThemedText>
              </View>
              <View style={styles.headerText}>
                <ThemedText variant="body" numberOfLines={1} style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
                  {userProfile?.displayName || firebaseUser?.email || 'Welcome'}
                </ThemedText>
                <ThemedText variant="caption" color="muted" numberOfLines={1}>
                  {firebaseUser?.email}
                </ThemedText>
              </View>
              <TierBadge tier={u?.tier} />
            </View>
            {usage.error && !u ? (
              <ThemedText variant="caption" color="muted" style={styles.usageLine}>
                Plan usage is unavailable right now. Pull down to retry.
              </ThemedText>
            ) : (
              <>
                <View style={styles.stats}>
                  {[
                    { label: 'Used', value: u ? u.reportsThisMonth : '—', color: theme.colors.primary },
                    { label: 'Limit', value: u ? (unlimited ? '∞' : u.reportsLimit) : '—', color: theme.colors.ink },
                    {
                      label: 'Left',
                      value: u ? (unlimited ? '∞' : u.reportsRemaining) : '—',
                      color:
                        !u || unlimited || u.reportsRemaining > 3
                          ? theme.colors.success
                          : u.reportsRemaining === 0
                            ? theme.colors.error
                            : theme.colors.warning,
                    },
                  ].map((s) => (
                    <View key={s.label} style={[styles.stat, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
                      <ThemedText variant="subtitle" style={{ color: s.color, fontFamily: theme.typography.fontFamily.display }}>
                        {s.value}
                      </ThemedText>
                      <ThemedText variant="caption" color="muted">
                        {s.label}
                      </ThemedText>
                    </View>
                  ))}
                </View>
                <View style={styles.usageHead}>
                  <ThemedText variant="caption" color="muted">
                    Monthly reports
                  </ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {!u ? '' : unlimited ? 'Unlimited plan' : `${percent}% used`}
                  </ThemedText>
                </View>
                <ProgressBar
                  percent={unlimited ? 100 : percent}
                  color={usageColor(percent, unlimited, theme)}
                  accessibilityLabel="Monthly reports used"
                />
                {u && !unlimited && u.reportsRemaining === 0 ? (
                  <ThemedText variant="caption" style={[styles.usageLine, { color: theme.colors.error }]}>
                    Monthly limit reached —{' '}
                    <ThemedText variant="caption" color="primary" onPress={() => router.push('/subscription')} accessibilityRole="link">
                      upgrade your plan
                    </ThemedText>
                  </ThemedText>
                ) : u && !unlimited && percent >= 80 ? (
                  <ThemedText variant="caption" style={[styles.usageLine, { color: theme.colors.warning }]}>
                    {u.reportsRemaining} report{u.reportsRemaining === 1 ? '' : 's'} remaining this month
                  </ThemedText>
                ) : null}
              </>
            )}
          </Card>
          </View>

          {u?.features?.watermark ? (
            <Pressable
              onPress={() => router.push('/subscription')}
              accessibilityRole="button"
              style={[styles.banner, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primary + '4D' }]}
            >
              <Icon name="alert-circle" color={theme.colors.primary} />
              <ThemedText variant="caption" style={styles.bannerText}>
                {u.tierName || 'Starter'} plan: {unlimited ? 'unlimited' : u.reportsLimit} report
                {u.reportsLimit === 1 ? '' : 's'}/mo with watermark. Upgrade for more.
              </ThemedText>
              <Icon name="chevron-right" color={theme.colors.primary} />
            </Pressable>
          ) : null}

          <NotificationPrimerCard />

          <View style={wide ? styles.twoCol : undefined}>
            <View style={wide ? styles.mainCol : undefined}>
              <SectionHeader
                title="Recent Projects"
                actionLabel={recent.reports.length > 0 ? 'View all' : undefined}
                onAction={() => router.push('/reports')}
              />
              {recent.isOffline && (
                <ThemedText variant="caption" color="muted" style={styles.offline}>
                  You appear to be offline. Pull down to refresh once connected.
                </ThemedText>
              )}
              {recent.error && recent.reports.length === 0 ? (
                <Card>
                  <StateMessage title="We couldn't load your reports" description={recent.error} onRetry={recent.retry} />
                </Card>
              ) : recent.loading && recent.reports.length === 0 ? (
                <Card>
                  <StateMessage title="Loading…" />
                </Card>
              ) : recent.reports.length === 0 ? (
                <Card>
                  <StateMessage
                    title="No reports yet"
                    description="Generate your first inspection report to get started."
                    retryLabel="Generate Report"
                    onRetry={newReport}
                  />
                </Card>
              ) : (
                recent.reports
                  .slice(0, 5)
                  .map((report) => (
                    <ReportCard
                      key={report.id}
                      report={report}
                      onPress={() => router.push({ pathname: '/report/[id]', params: { id: report.id } })}
                    />
                  ))
              )}
            </View>

            <View style={wide ? styles.sideCol : undefined}>
              {shared.length > 0 ? (
                <View style={styles.block}>
                  <SectionHeader title="Shared With You" />
                  <Card padded={false}>
                    {shared.map((r, i) => (
                      <Pressable
                        key={r.id}
                        onPress={() => router.push({ pathname: '/report/[id]', params: { id: r.id } })}
                        accessibilityRole="button"
                        style={[styles.sharedRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.colors.border }]}
                      >
                        <ThemedText variant="body" numberOfLines={1} style={styles.headerText}>
                          Claim {r.claimNumber || '—'}
                        </ThemedText>
                        <ThemedText variant="caption" style={{ color: theme.colors.navy, fontFamily: theme.typography.fontFamily.bodySemiBold }}>
                          {r.reviewRequestStatus === 'pending' ? 'Review requested' : r.myPermission ? r.myPermission.charAt(0).toUpperCase() + r.myPermission.slice(1) : ''}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </Card>
                </View>
              ) : null}

              <View style={styles.block}>
                <SectionHeader title="FLACRON ENGINE Usage" />
                <Card>
                  <View style={styles.engineHead}>
                    <Icon name="zap" color={theme.colors.primary} />
                    <ThemedText variant="body" color="primary" style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
                      Powered by FLACRON ENGINE
                    </ThemedText>
                  </View>
                  <EngineRow label="Photos processed" value={summary.summary ? String(summary.summary.photosAnalyzed) : summary.error ? 'Unavailable' : '…'} />
                  <EngineRow label="Reports generated this month" value={u ? String(u.reportsThisMonth) : usage.error ? 'Unavailable' : '…'} />
                  <EngineRow label="Storage used" value="Not yet available" muted />
                </Card>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
      </View>
      <ProductTour screenRef={screenRef} />
    </ScreenContainer>
  );
}

function EngineRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.engineRow}>
      <ThemedText variant="body" color="muted" style={styles.headerText}>
        {label}
      </ThemedText>
      <ThemedText
        variant={muted ? 'caption' : 'body'}
        color={muted ? 'muted' : 'ink'}
        style={{ fontFamily: muted ? theme.typography.fontFamily.body : theme.typography.fontFamily.bodySemiBold, fontStyle: muted ? 'italic' : 'normal' }}
      >
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatarLg: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
  name: { fontSize: 22 },
  chips: { flexDirection: 'row', gap: 8 },
  grid: { gap: 10, marginBottom: 24 },
  gridRow: { flexDirection: 'row', gap: 10 },
  headerBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  column: { width: '100%', maxWidth: 1100, alignSelf: 'center', paddingBottom: 24 },
  headerText: { flex: 1, minWidth: 0 },
  cta: { marginTop: 14, marginBottom: 16 },
  block: { marginBottom: 20 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontFamily: 'SpaceGrotesk_700Bold' },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  usageHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  usageLine: { marginTop: 8 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 20 },
  bannerText: { flex: 1 },
  twoCol: { flexDirection: 'row', gap: 24, alignItems: 'flex-start' },
  mainCol: { flex: 2 },
  sideCol: { flex: 1 },
  offline: { marginBottom: 12 },
  sharedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 48 },
  engineHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  engineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
});
