import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ThemedText } from '@/components/ThemedText';
import { Badge, Card, Icon, MetricCard, ProgressBar, SectionHeader } from '@/components/ui';
import { useApiResource } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { formatStatus } from '@/features/reports/components/StatusBadge';
import { SegmentedControl } from '@/features/reports/components/SegmentedControl';
import { StateMessage } from '@/features/reports/components/StateMessage';
import { crmApi } from '@/services/api/crm';
import { ApiRequestError } from '@/types/api';
import { useTheme } from '@/theme';
import { AppointmentSheet, ClaimSheet, ClientSheet } from './crmForms';

type Tab = 'dashboard' | 'clients' | 'claims' | 'appointments';
const TABS = [
  { value: 'dashboard', label: 'Overview' },
  { value: 'clients', label: 'Clients' },
  { value: 'claims', label: 'Claims' },
  { value: 'appointments', label: 'Visits' },
] as const;

const tierDenied = (e: unknown) => e instanceof ApiRequestError && e.status === 403;

/** Web CRM (Agency+): Dashboard, Clients, Appointments, Claims with create / edit / delete / archive and profiles. */
export function CrmScreen() {
  const [tab, setTab] = useState<Tab>('dashboard');
  return (
    <ScreenContainer>
      <ScreenHeader title="CRM" subtitle="Clients, claims and appointments" />
      <View style={styles.tabs}>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </View>
      {tab === 'dashboard' && <Overview />}
      {tab === 'clients' && <Clients />}
      {tab === 'claims' && <Claims />}
      {tab === 'appointments' && <Appointments />}
    </ScreenContainer>
  );
}

function Locked() {
  const router = useRouter();
  return (
    <StateMessage
      title="CRM is included from the Agency plan"
      description="Keep clients, claims and appointments together and link each report to its claim."
      retryLabel="See plans"
      onRetry={() => router.push('/subscription')}
    />
  );
}

function Overview() {
  const theme = useTheme();
  const router = useRouter();
  const [denied, setDenied] = useState(false);
  const res = useApiResource(() => crmApi.analytics().then((r) => r.analytics).catch((e) => { if (tierDenied(e)) setDenied(true); throw e; }));
  if (denied) return <Locked />;
  if (res.error && !res.data) return <StateMessage title="Could not load CRM" description={res.error} onRetry={res.retry} />;
  const a = res.data;
  return (
    <ScrollView refreshControl={<RefreshControl refreshing={res.refreshing} onRefresh={res.refresh} tintColor={theme.colors.primary} />}>
      <View style={styles.metrics}>
        <MetricCard icon="users" label="Clients" value={a?.totalClients} loading={res.loading} />
        <MetricCard icon="briefcase" label="Open claims" value={a?.openClaims} sub={a ? `of ${a.totalClaims}` : undefined} loading={res.loading} />
        <MetricCard icon="clock" label="Awaiting review" value={a?.reportsAwaitingReview} loading={res.loading} />
        <MetricCard icon="calendar" label="Overdue visits" value={a?.overdueAppointments} loading={res.loading} />
      </View>
      {a ? (
        <>
          <Card style={styles.mb}>
            <ThemedText variant="body">Reports this month: {a.reportsThisMonth}</ThemedText>
            <ThemedText variant="body">Finalization rate: {a.finalizationRate == null ? '—' : `${Math.round(a.finalizationRate)}%`}</ThemedText>
            <ThemedText variant="body">
              Average turnaround: {a.averageTurnaroundHours == null ? 'Not enough data yet' : `${a.averageTurnaroundHours} hrs`}
            </ThemedText>
          </Card>
          <SectionHeader title="Claims by status" />
          <Card style={styles.mb}>
            {Object.entries(a.claimsByStatus).map(([k, n]) => (
              <View key={k} style={styles.bar}>
                <ThemedText variant="caption" style={styles.flex}>
                  {formatStatus(k)} · {n}
                </ThemedText>
                <View style={styles.barTrack}>
                  <ProgressBar percent={a.totalClaims ? (n / a.totalClaims) * 100 : 0} height={6} />
                </View>
              </View>
            ))}
          </Card>
          <SectionHeader title="Recent claims" />
          <Card padded={false}>
            {a.recentClaims.length === 0 ? (
              <ThemedText variant="body" color="muted" style={styles.pad}>
                No claims yet.
              </ThemedText>
            ) : (
              a.recentClaims.map((c) => <ClaimRow key={c.id} claim={c} onPress={() => router.push({ pathname: '/crm/claim/[claimId]', params: { claimId: c.id } })} />)
            )}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.search, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <Icon name="search" color={theme.colors.muted} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.colors.muted} accessibilityLabel={placeholder} style={[styles.searchInput, { color: theme.colors.ink }]} />
    </View>
  );
}

function useDebounced(value: string, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value.trim()), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Clients() {
  const theme = useTheme();
  const router = useRouter();
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const [denied, setDenied] = useState(false);
  const res = useApiResource(() => crmApi.clients({ limit: 100, search: search || undefined }).catch((e) => { if (tierDenied(e)) setDenied(true); throw e; }), [search]);
  const [adding, setAdding] = useState(false);
  if (denied) return <Locked />;
  return (
    <ScrollView keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={res.refreshing} onRefresh={res.refresh} tintColor={theme.colors.primary} />}>
      <View style={styles.toolbar}>
        <View style={styles.flex}>
          <SearchBox value={q} onChange={setQ} placeholder="Search name, email or company" />
        </View>
        <PrimaryButton icon="plus" label="Client" onPress={() => setAdding(true)} />
      </View>
      {res.loading && !res.data ? (
        <StateMessage title="Loading…" />
      ) : res.error && !res.data ? (
        <StateMessage title="Could not load clients" description={res.error} onRetry={res.retry} />
      ) : (res.data?.data ?? []).length === 0 ? (
        <StateMessage title={search ? 'No matching clients' : 'No clients yet'} />
      ) : (
        <Card padded={false}>
          {(res.data?.data ?? []).map((c) => (
            <Pressable key={c.id} onPress={() => router.push({ pathname: '/crm/client/[clientId]', params: { clientId: c.id } })} accessibilityRole="button" style={[styles.row, { borderBottomColor: theme.colors.border }]}>
              <Icon name="user" color={theme.colors.muted} />
              <View style={styles.flex}>
                <ThemedText variant="body" numberOfLines={1}>
                  {c.name}
                </ThemedText>
                <ThemedText variant="caption" color="muted" numberOfLines={1}>
                  {[c.company, c.email, c.phone].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
              <ThemedText variant="caption" color="muted">
                {c.totalReports ?? 0} reports
              </ThemedText>
            </Pressable>
          ))}
        </Card>
      )}
      {adding ? <ClientSheet onClose={() => setAdding(false)} onSaved={() => res.refresh()} /> : null}
    </ScrollView>
  );
}

export function ClaimRow({ claim, onPress }: { claim: { id: string; claimNumber: string; lossType: string; status?: string; propertyAddress?: string; archived?: boolean }; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.row, { borderBottomColor: theme.colors.border }]}>
      <Icon name="briefcase" color={theme.colors.muted} />
      <View style={styles.flex}>
        <ThemedText variant="body" numberOfLines={1}>
          {claim.claimNumber} · {claim.lossType}
        </ThemedText>
        {claim.propertyAddress ? (
          <ThemedText variant="caption" color="muted" numberOfLines={1}>
            {claim.propertyAddress}
          </ThemedText>
        ) : null}
      </View>
      <Badge label={claim.archived ? 'Archived' : formatStatus(claim.status || 'open')} tone={claim.archived ? 'neutral' : (claim.status || '').toLowerCase() === 'closed' ? 'success' : 'warning'} />
    </Pressable>
  );
}

function Claims() {
  const theme = useTheme();
  const router = useRouter();
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const [archived, setArchived] = useState(false);
  const [denied, setDenied] = useState(false);
  const res = useApiResource(
    () => crmApi.claims({ limit: 200, search: search || undefined, archived: archived ? 'true' : undefined }).catch((e) => { if (tierDenied(e)) setDenied(true); throw e; }),
    [search, archived]
  );
  const [adding, setAdding] = useState(false);
  if (denied) return <Locked />;
  return (
    <ScrollView keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={res.refreshing} onRefresh={res.refresh} tintColor={theme.colors.primary} />}>
      <View style={styles.toolbar}>
        <View style={styles.flex}>
          <SearchBox value={q} onChange={setQ} placeholder="Search claim #, loss type, address" />
        </View>
        <PrimaryButton icon="plus" label="Claim" onPress={() => setAdding(true)} />
      </View>
      <Pressable onPress={() => setArchived((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: archived }} style={styles.archToggle}>
        <Icon name={archived ? 'check-square' : 'square'} color={theme.colors.primary} />
        <ThemedText variant="body">Show archived claims</ThemedText>
      </Pressable>
      {res.loading && !res.data ? (
        <StateMessage title="Loading…" />
      ) : res.error && !res.data ? (
        <StateMessage title="Could not load claims" description={res.error} onRetry={res.retry} />
      ) : (res.data?.data ?? []).length === 0 ? (
        <StateMessage title="No claims found" />
      ) : (
        <Card padded={false}>
          {(res.data?.data ?? []).map((c) => (
            <ClaimRow key={c.id} claim={c} onPress={() => router.push({ pathname: '/crm/claim/[claimId]', params: { claimId: c.id } })} />
          ))}
        </Card>
      )}
      {adding ? <ClaimSheet onClose={() => setAdding(false)} onSaved={() => res.refresh()} /> : null}
    </ScrollView>
  );
}

function Appointments() {
  const theme = useTheme();
  const [denied, setDenied] = useState(false);
  const res = useApiResource(() => crmApi.appointments().then((r) => r.appointments).catch((e) => { if (tierDenied(e)) setDenied(true); throw e; }));
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  if (denied) return <Locked />;
  const items = res.data ?? [];
  return (
    <ScrollView refreshControl={<RefreshControl refreshing={res.refreshing} onRefresh={res.refresh} tintColor={theme.colors.primary} />}>
      <View style={styles.mb}>
        <PrimaryButton icon="plus" label="New appointment" onPress={() => setEditing('new')} />
      </View>
      {res.loading && !res.data ? (
        <StateMessage title="Loading…" />
      ) : res.error && !res.data ? (
        <StateMessage title="Could not load appointments" description={res.error} onRetry={res.retry} />
      ) : items.length === 0 ? (
        <StateMessage title="No appointments scheduled" />
      ) : (
        <Card padded={false}>
          {items.map((a) => (
            <Pressable key={a.id} onPress={() => setEditing(a.id)} accessibilityRole="button" style={[styles.row, { borderBottomColor: theme.colors.border }]}>
              <Icon name="calendar" color={theme.colors.muted} />
              <View style={styles.flex}>
                <ThemedText variant="body" numberOfLines={1}>
                  {a.title}
                </ThemedText>
                <ThemedText variant="caption" color="muted" numberOfLines={1}>
                  {a.date}
                  {a.time ? ` ${a.time}` : ''}
                  {a.location ? ` · ${a.location}` : ''}
                </ThemedText>
              </View>
              <Badge label={formatStatus(a.status || 'scheduled')} tone={a.status === 'completed' ? 'success' : a.status === 'cancelled' ? 'neutral' : 'info'} />
            </Pressable>
          ))}
        </Card>
      )}
      {editing ? (
        <AppointmentSheet appointment={editing === 'new' ? null : items.find((a) => a.id === editing)} onClose={() => setEditing(null)} onSaved={() => res.refresh()} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tabs: { marginBottom: 12 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  mb: { marginBottom: 16 },
  pad: { padding: 14 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  barTrack: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  toolbar: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, minHeight: 46 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 8 },
  archToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 60, borderBottomWidth: StyleSheet.hairlineWidth },
});
