import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ThemedText } from '@/components/ThemedText';
import { Badge, Card, Icon, MetricCard, ProgressBar, type BadgeTone } from '@/components/ui';
import { apiErrorMessage, useApiResource } from '@/hooks/useApiResource';
import { AuthTextInput } from '@/features/auth/components/AuthTextInput';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { SegmentedControl } from '@/features/reports/components/SegmentedControl';
import { StateMessage } from '@/features/reports/components/StateMessage';
import { ChoiceChips } from '@/features/reports/wizard/components/ChoiceChips';
import { organizationApi } from '@/services/api/organization';
import { ROLE_LABELS, teamsApi, type TeamRole } from '@/services/api/teams';
import { ApiRequestError } from '@/types/api';
import { useTheme } from '@/theme';
import { AuditLogList } from './AuditLogList';

type Tab = 'members' | 'overview' | 'audit';
const TABS = [
  { value: 'members', label: 'Members' },
  { value: 'overview', label: 'Overview' },
  { value: 'audit', label: 'Audit Logs' },
] as const;

export const MEMBER_STATUS_TONE: Record<string, BadgeTone> = { active: 'success', pending: 'warning', suspended: 'error' };

/** Web OrganizationAdmin (Members / Usage / Security / Audit Logs) for Enterprise team admins. Every list and action is
 * gated server-side (Enterprise tier, canManageTeam / canViewAllProfiles, role hierarchy); a 403 shows the
 * restricted state instead of an error. */
export function OrganizationScreen() {
  const [tab, setTab] = useState<Tab>('members');
  return (
    <ScreenContainer>
      <ScreenHeader title="Organization" subtitle="Members, roles, usage, security and audit logs" />
      <View style={styles.tabs}>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </View>
      {tab === 'members' && <MembersTab />}
      {tab === 'overview' && <OverviewTab />}
      {tab === 'audit' && <AuditLogList />}
    </ScreenContainer>
  );
}

function Restricted() {
  return (
    <StateMessage
      title="Restricted"
      description="Organization management is available to Enterprise owners, admins and managers. Ask your organization admin for access."
    />
  );
}

function MembersTab() {
  const theme = useTheme();
  const router = useRouter();
  const [denied, setDenied] = useState(false);
  const members = useApiResource(() =>
    teamsApi.members().catch((e) => {
      if (e instanceof ApiRequestError && e.status === 403) setDenied(true);
      throw e;
    })
  );
  const roles = useApiResource(() => teamsApi.roles());
  const [inviting, setInviting] = useState(false);

  if (denied) return <Restricted />;
  const data = members.data;
  return (
    <ScrollView refreshControl={<RefreshControl refreshing={members.refreshing} onRefresh={members.refresh} tintColor={theme.colors.primary} />}>
      {members.loading && !data ? (
        <StateMessage title="Loading…" />
      ) : members.error && !data ? (
        <StateMessage title="Could not load members" description={members.error} onRetry={members.retry} />
      ) : data ? (
        <>
          {(roles.data?.assignableRoles?.length ?? 0) > 0 ? (
            inviting ? (
              <InviteCard roles={roles.data!.assignableRoles} onDone={() => setInviting(false)} onInvited={members.refresh} />
            ) : (
              <View style={styles.block}>
                <PrimaryButton icon="user-plus" label="Invite member" onPress={() => setInviting(true)} />
              </View>
            )
          ) : null}
          <Card padded={false} style={styles.block}>
            <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
              <Icon name="award" color={theme.colors.primary} />
              <View style={styles.flex}>
                <ThemedText variant="body" numberOfLines={1}>
                  {data.owner.displayName || data.owner.email}
                </ThemedText>
                <ThemedText variant="caption" color="muted" numberOfLines={1}>
                  {data.owner.email}
                </ThemedText>
              </View>
              <Badge label="Owner" tone="brand" />
            </View>
            {data.members.map((mem) => (
              <Pressable
                key={mem.id}
                onPress={() => router.push({ pathname: '/team/[memberId]', params: { memberId: mem.id } })}
                accessibilityRole="button"
                style={[styles.row, { borderBottomColor: theme.colors.border }]}
              >
                <Icon name="user" color={theme.colors.muted} />
                <View style={styles.flex}>
                  <ThemedText variant="body" numberOfLines={1}>
                    {mem.email}
                  </ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {ROLE_LABELS[mem.role] ?? mem.role}
                  </ThemedText>
                </View>
                <Badge label={mem.status.charAt(0).toUpperCase() + mem.status.slice(1)} tone={MEMBER_STATUS_TONE[mem.status] ?? 'neutral'} />
                <Icon name="chevron-right" color={theme.colors.muted} />
              </Pressable>
            ))}
          </Card>
          {data.members.length === 0 ? (
            <ThemedText variant="body" color="muted">
              No team members yet.
            </ThemedText>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

export function InviteCard({ roles, onDone, onInvited }: { roles: TeamRole[]; onDone: () => void; onInvited?: () => void }) {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>(roles.includes('adjuster') ? 'adjuster' : roles[0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);

  const send = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await teamsApi.invite(email.trim(), role);
      setMsg({ ok: true, text: res.message || 'Invitation sent.', link: res.inviteLink });
      setEmail('');
      onInvited?.();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err, 'Could not send the invitation.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.block}>
      <ThemedText variant="subtitle" style={styles.mb}>
        Invite a team member
      </ThemedText>
      <AuthTextInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      <ChoiceChips
        label="Role"
        value={ROLE_LABELS[role] ?? role}
        options={roles.map((r) => ROLE_LABELS[r] ?? r)}
        onChange={(label) => setRole(roles.find((r) => (ROLE_LABELS[r] ?? r) === label) ?? role)}
      />
      {msg ? (
        <ThemedText variant="caption" accessibilityLiveRegion="polite" style={[styles.mb, { color: msg.ok ? theme.colors.success : theme.colors.error }]}>
          {msg.text}
        </ThemedText>
      ) : null}
      {msg?.link ? (
        <View style={styles.mb}>
          <PrimaryButton variant="secondary" icon="share-2" label="Share invite link" onPress={() => Share.share({ message: msg.link as string })} />
        </View>
      ) : null}
      <View style={styles.actions}>
        <View style={styles.flex}>
          <PrimaryButton variant="secondary" label="Close" onPress={onDone} />
        </View>
        <View style={styles.flex}>
          <PrimaryButton label="Send invite" onPress={send} loading={busy} disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} />
        </View>
      </View>
    </Card>
  );
}

function OverviewTab() {
  const theme = useTheme();
  const [denied, setDenied] = useState(false);
  const guard = <T,>(p: Promise<T>) =>
    p.catch((e) => {
      if (e instanceof ApiRequestError && e.status === 403) setDenied(true);
      throw e;
    });
  const metrics = useApiResource(() => guard(organizationApi.metrics()).then((r) => r.metrics));
  const security = useApiResource(() => guard(organizationApi.securitySummary()).then((r) => r.summary));
  if (denied) return <Restricted />;
  const mtr = metrics.data;
  const sec = security.data;
  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={metrics.refreshing || security.refreshing}
          onRefresh={() => {
            metrics.refresh();
            security.refresh();
          }}
          tintColor={theme.colors.primary}
        />
      }
    >
      {metrics.error && !mtr ? <StateMessage title="Could not load usage" description={metrics.error} onRetry={metrics.retry} /> : null}
      <View style={styles.metrics}>
        <MetricCard icon="users" label="Users" value={mtr?.users} loading={metrics.loading && !mtr} />
        <MetricCard icon="file-text" label="Reports" value={mtr?.reports} loading={metrics.loading && !mtr} />
        <MetricCard icon="image" label="Photos" value={mtr?.photos} loading={metrics.loading && !mtr} />
        <MetricCard icon="folder" label="Org templates" value={mtr?.templates} loading={metrics.loading && !mtr} />
      </View>
      {mtr ? (
        <Card style={styles.block}>
          <ThemedText variant="subtitle" style={styles.mb}>
            Roles
          </ThemedText>
          {Object.entries(mtr.roleBreakdown).map(([label, n]) => (
            <View key={label} style={styles.kv}>
              <ThemedText variant="body" style={styles.flex}>
                {label}
              </ThemedText>
              <ThemedText variant="body">{n}</ThemedText>
            </View>
          ))}
          <ThemedText variant="caption" color="muted" style={styles.mt}>
            Storage usage: not yet available
          </ThemedText>
        </Card>
      ) : null}
      {sec ? (
        <Card style={styles.block}>
          <ThemedText variant="subtitle" style={styles.mb}>
            Security
          </ThemedText>
          <ThemedText variant="body">
            Two-factor adoption: {sec.mfaEnabledCount} of {sec.totalMembers} ({sec.mfaAdoptionPercent}%)
          </ThemedText>
          <View style={styles.mt}>
            <ProgressBar percent={sec.mfaAdoptionPercent} color={theme.colors.success} accessibilityLabel="Two-factor adoption" />
          </View>
          <ThemedText variant="caption" color="muted" style={styles.mt}>
            {sec.suspendedCount} suspended · {sec.legacyRoleCount} on a legacy role
          </ThemedText>
        </Card>
      ) : security.error ? (
        <StateMessage title="Could not load security summary" description={security.error} onRetry={security.retry} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tabs: { marginBottom: 12 },
  block: { marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 60, borderBottomWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1, minWidth: 0 },
  mb: { marginBottom: 10 },
  mt: { marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  kv: { flexDirection: 'row', paddingVertical: 4 },
});
