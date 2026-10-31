import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ThemedText } from '@/components/ThemedText';
import { Badge, Card, MetricCard } from '@/components/ui';
import { apiErrorMessage, useApiResource } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { formatStatus } from '@/features/reports/components/StatusBadge';
import { StateMessage } from '@/features/reports/components/StateMessage';
import { ChoiceChips } from '@/features/reports/wizard/components/ChoiceChips';
import { ROLE_LABELS, teamsApi, type TeamRole } from '@/services/api/teams';
import { useTheme } from '@/theme';
import { MEMBER_STATUS_TONE } from './OrganizationScreen';

/** Web TeamMemberProfile: stats, recent activity and — when the server says `canManage` — role change,
 * suspend / reactivate and remove (role hierarchy enforced server-side: ROLE_HIERARCHY_DENIED). */
export function MemberProfileScreen({ memberId }: { memberId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const profile = useApiResource(() => teamsApi.member(memberId), [memberId]);
  const roles = useApiResource(() => teamsApi.roles());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const p = profile.data;

  const act = async (fn: () => Promise<{ message?: string } | object>, ok: string, after?: () => void) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fn();
      setMsg({ ok: true, text: ('message' in res && typeof res.message === 'string' && res.message) || ok });
      if (after) after();
      else profile.refresh();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const allowed = (roles.data?.assignableRoles ?? []) as TeamRole[];

  return (
    <ScreenContainer>
      <ScrollView>
        <ScreenHeader title={p?.member.email ?? 'Team member'} subtitle={p ? ROLE_LABELS[p.member.role] ?? p.member.role : undefined} />
        {profile.loading && !p ? (
          <StateMessage title="Loading…" />
        ) : profile.error && !p ? (
          <StateMessage title="Could not load this profile" description={profile.error} onRetry={profile.retry} />
        ) : p ? (
          <>
            <View style={styles.row}>
              <Badge label={formatStatus(p.member.status)} tone={MEMBER_STATUS_TONE[p.member.status] ?? 'neutral'} />
              {p.member.acceptedAt ? (
                <ThemedText variant="caption" color="muted">
                  Joined {new Date(p.member.acceptedAt).toLocaleDateString()}
                </ThemedText>
              ) : p.member.invitedAt ? (
                <ThemedText variant="caption" color="muted">
                  Invited {new Date(p.member.invitedAt).toLocaleDateString()}
                </ThemedText>
              ) : null}
            </View>
            <View style={styles.metrics}>
              <MetricCard icon="file-text" label="Reports generated" value={p.stats.reportsGenerated} />
              <MetricCard icon="image" label="Photos analyzed" value={p.stats.photosAnalyzed} />
            </View>

            {msg ? (
              <ThemedText variant="body" accessibilityRole="alert" style={[styles.mb, { color: msg.ok ? theme.colors.success : theme.colors.error }]}>
                {msg.text}
              </ThemedText>
            ) : null}

            {p.canManage ? (
              <Card style={styles.mb}>
                {allowed.length ? (
                  <ChoiceChips
                    label="Role"
                    value={ROLE_LABELS[p.member.role] ?? p.member.role}
                    options={allowed.map((r) => ROLE_LABELS[r] ?? r)}
                    onChange={(label) => {
                      const role = allowed.find((r) => (ROLE_LABELS[r] ?? r) === label);
                      if (role && role !== p.member.role) act(() => teamsApi.setRole(memberId, role), 'Role updated.');
                    }}
                  />
                ) : null}
                <View style={styles.actions}>
                  <View style={styles.flex}>
                    {p.member.status === 'suspended' ? (
                      <PrimaryButton variant="secondary" icon="play" label="Reactivate" loading={busy} onPress={() => act(() => teamsApi.reactivate(memberId), 'Member reactivated.')} />
                    ) : (
                      <PrimaryButton
                        variant="secondary"
                        icon="pause"
                        label="Suspend"
                        loading={busy}
                        onPress={() =>
                          Alert.alert('Suspend this member?', 'They are signed out everywhere immediately and cannot sign in until reactivated.', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Suspend', style: 'destructive', onPress: () => act(() => teamsApi.suspend(memberId), 'Member suspended.') },
                          ])
                        }
                      />
                    )}
                  </View>
                  <View style={styles.flex}>
                    <PrimaryButton
                      variant="danger"
                      icon="user-x"
                      label="Remove"
                      disabled={busy}
                      onPress={() =>
                        Alert.alert('Remove from organization?', 'Their account returns to its own plan. Reports they created stay with them.', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Remove', style: 'destructive', onPress: () => act(() => teamsApi.remove(memberId), 'Member removed.', () => router.back()) },
                        ])
                      }
                    />
                  </View>
                </View>
              </Card>
            ) : null}

            <ThemedText variant="subtitle" style={styles.mb}>
              Recent activity
            </ThemedText>
            <Card padded={false}>
              {p.stats.recentActivity.length === 0 ? (
                <ThemedText variant="body" color="muted" style={styles.pad}>
                  No recent activity.
                </ThemedText>
              ) : (
                p.stats.recentActivity.map((a, i) => (
                  <View key={`${a.timestamp}-${i}`} style={[styles.activity, { borderBottomColor: theme.colors.border }]}>
                    <ThemedText variant="body" style={styles.flex}>
                      {formatStatus(a.action)}
                    </ThemedText>
                    <ThemedText variant="caption" color="muted">
                      {new Date(a.timestamp).toLocaleString()}
                    </ThemedText>
                  </View>
                ))
              )}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  mb: { marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  pad: { padding: 14 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
});
