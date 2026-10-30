import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ThemedText } from '@/components/ThemedText';
import { Card, MetricCard, SectionHeader } from '@/components/ui';
import { useApiResource } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { ReportCard } from '@/features/reports/components/ReportCard';
import { formatStatus } from '@/features/reports/components/StatusBadge';
import { StateMessage } from '@/features/reports/components/StateMessage';
import { crmApi } from '@/services/api/crm';
import { useTheme } from '@/theme';
import { ClaimRow } from './CrmScreen';
import { ClaimSheet, ClientSheet } from './crmForms';

function Info({ rows }: { rows: [string, string | undefined | null][] }) {
  return (
    <Card style={styles.mb}>
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <View key={k} style={styles.kv}>
            <ThemedText variant="caption" color="muted">
              {k}
            </ThemedText>
            <ThemedText variant="body">{v}</ThemedText>
          </View>
        ))}
    </Card>
  );
}

/** Web CRMClientProfile: details, summary, claims, appointments and reports; edit/delete; add a claim. */
export function ClientProfileScreen({ clientId }: { clientId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const res = useApiResource(() => crmApi.clientProfile(clientId).then((r) => r.profile), [clientId]);
  const [sheet, setSheet] = useState<'edit' | 'claim' | null>(null);
  const p = res.data;
  return (
    <ScreenContainer>
      <ScrollView refreshControl={<RefreshControl refreshing={res.refreshing} onRefresh={res.refresh} tintColor={theme.colors.primary} />}>
        <ScreenHeader title={p?.client.name ?? 'Client'} subtitle={p?.client.company} action={p ? { label: 'Edit', onPress: () => setSheet('edit') } : undefined} />
        {res.loading && !p ? (
          <StateMessage title="Loading…" />
        ) : res.error && !p ? (
          <StateMessage title="Could not load this client" description={res.error} onRetry={res.retry} />
        ) : p ? (
          <>
            <Info rows={[['Email', p.client.email], ['Phone', p.client.phone], ['Address', p.client.address], ['Notes', p.client.notes]]} />
            <View style={styles.metrics}>
              <MetricCard icon="briefcase" label="Claims" value={p.summary.totalClaims} sub={`${p.summary.openClaims} open`} />
              <MetricCard icon="file-text" label="Reports" value={p.summary.totalReports} />
              <MetricCard icon="calendar" label="Upcoming visits" value={p.summary.upcomingAppointments} />
            </View>
            <View style={styles.mb}>
              <PrimaryButton variant="secondary" icon="plus" label="New claim for this client" onPress={() => setSheet('claim')} />
            </View>
            <SectionHeader title="Claims" />
            <Card padded={false} style={styles.mb}>
              {p.claims.length ? (
                p.claims.map((c) => <ClaimRow key={c.id} claim={c} onPress={() => router.push({ pathname: '/crm/claim/[claimId]', params: { claimId: c.id } })} />)
              ) : (
                <ThemedText variant="body" color="muted" style={styles.pad}>
                  No claims yet.
                </ThemedText>
              )}
            </Card>
            {p.appointments.length ? (
              <>
                <SectionHeader title="Appointments" />
                <Card style={styles.mb}>
                  {p.appointments.map((a) => (
                    <ThemedText key={a.id} variant="body" style={styles.line}>
                      {a.date}
                      {a.time ? ` ${a.time}` : ''} · {a.title} · {formatStatus(a.status || 'scheduled')}
                    </ThemedText>
                  ))}
                </Card>
              </>
            ) : null}
            <SectionHeader title="Reports" />
            {p.reports.length ? (
              p.reports.map((r) => <ReportCard key={r.id} report={r} onPress={() => router.push({ pathname: '/report/[id]', params: { id: r.id } })} />)
            ) : (
              <ThemedText variant="body" color="muted">
                No reports yet.
              </ThemedText>
            )}
          </>
        ) : null}
      </ScrollView>
      {sheet === 'edit' && p ? <ClientSheet client={p.client} onClose={() => setSheet(null)} onSaved={(c) => (c ? res.refresh() : router.back())} /> : null}
      {sheet === 'claim' ? <ClaimSheet defaultClientId={clientId} onClose={() => setSheet(null)} onSaved={() => res.refresh()} /> : null}
    </ScreenContainer>
  );
}

/** Web CRMClaimProfile: claim details, linked client, reports and summary; edit / archive / delete; start a report for
 * this claim (the wizard links it via `claimId`). */
export function ClaimProfileScreen({ claimId }: { claimId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const res = useApiResource(() => crmApi.claimProfile(claimId).then((r) => r.profile), [claimId]);
  const [editing, setEditing] = useState(false);
  const p = res.data;
  return (
    <ScreenContainer>
      <ScrollView refreshControl={<RefreshControl refreshing={res.refreshing} onRefresh={res.refresh} tintColor={theme.colors.primary} />}>
        <ScreenHeader
          title={p ? `Claim ${p.claim.claimNumber}` : 'Claim'}
          subtitle={p ? `${p.claim.lossType} · ${formatStatus(p.claim.status || 'open')}${p.claim.archived ? ' · Archived' : ''}` : undefined}
          action={p ? { label: 'Edit', onPress: () => setEditing(true) } : undefined}
        />
        {res.loading && !p ? (
          <StateMessage title="Loading…" />
        ) : res.error && !p ? (
          <StateMessage title="Could not load this claim" description={res.error} onRetry={res.retry} />
        ) : p ? (
          <>
            <Info
              rows={[
                ['Client', p.client?.name],
                ['Loss date', p.claim.lossDate],
                ['Property address', p.claim.propertyAddress],
                ['Description', p.claim.description],
                ['Notes', p.claim.notes],
              ]}
            />
            <View style={styles.metrics}>
              <MetricCard icon="file-text" label="Reports" value={p.summary.totalReports} />
              <MetricCard icon="edit-3" label="Drafts" value={p.summary.drafts} />
              <MetricCard icon="check-circle" label="Finalized" value={p.summary.finalized} />
            </View>
            {!p.claim.archived ? (
              <View style={styles.mb}>
                <PrimaryButton icon="zap" label="Generate report for this claim" onPress={() => router.push({ pathname: '/report/new', params: { claimId } })} />
              </View>
            ) : null}
            <SectionHeader title="Reports" />
            {p.reports.length ? (
              p.reports.map((r) => <ReportCard key={r.id} report={r} onPress={() => router.push({ pathname: '/report/[id]', params: { id: r.id } })} />)
            ) : (
              <ThemedText variant="body" color="muted">
                No reports linked to this claim yet.
              </ThemedText>
            )}
          </>
        ) : null}
      </ScrollView>
      {editing && p ? <ClaimSheet claim={p.claim} onClose={() => setEditing(false)} onSaved={(c) => (c ? res.refresh() : router.back())} /> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  mb: { marginBottom: 16 },
  kv: { marginBottom: 8 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  pad: { padding: 14 },
  line: { marginBottom: 6 },
});
