import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Card, Icon } from '@/components/ui';
import { useApiResource } from '@/hooks/useApiResource';
import { crmApi, type CrmClaim, type CrmClient } from '@/services/api/crm';
import { usersApi } from '@/services/api/users';
import { useTheme } from '@/theme';
import type { WizardFields } from '../wizardTypes';

/** Fields a linked claim (and its client) supply — the server overrides them from the claim at generate time anyway
 * (reports.js claim link), so prefilling keeps what the user sees identical to what is saved. */
export function fieldsFromClaim(claim: CrmClaim, client?: CrmClient | null): WizardFields {
  const out: WizardFields = { claimId: claim.id, claimNumber: claim.claimNumber, lossType: claim.lossType };
  if (claim.propertyAddress) out.propertyAddress = claim.propertyAddress;
  if (claim.lossDate) out.lossDate = claim.lossDate;
  if (client?.name) out.insuredName = client.name;
  if (client?.email) out.insuredEmail = client.email;
  return out;
}

/** Web ClaimLinkSection (Agency / Enterprise — plans with `crmAccess`): search CRM claims and link one to the report. */
export function ClaimLinkCard({ fields, setField }: { fields: WizardFields; setField: (k: string, v: string) => void }) {
  const theme = useTheme();
  const usage = useApiResource(() => usersApi.getUsage().then((r) => r.usage));
  const enabled = !!usage.data?.features?.crmAccess;
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const claims = useApiResource(() => (enabled ? crmApi.claims({ search: search || undefined, limit: 8 }).then((r) => r.data) : Promise.resolve([])), [search, enabled]);
  const clients = useApiResource(() => (enabled ? crmApi.clients({ limit: 100 }).then((r) => r.data) : Promise.resolve([])), [enabled]);
  if (!enabled) return null;

  const linked = fields.claimId ? (claims.data ?? []).find((c) => c.id === fields.claimId) : null;
  const link = (c: CrmClaim) => {
    const client = (clients.data ?? []).find((x) => x.id === c.clientId);
    for (const [k, v] of Object.entries(fieldsFromClaim(c, client))) setField(k, v);
  };

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Icon name="briefcase" color={theme.colors.primary} />
        <ThemedText variant="body" style={[styles.flex, { fontFamily: theme.typography.fontFamily.bodySemiBold }]}>
          CRM claim
        </ThemedText>
        {fields.claimId ? (
          <Pressable onPress={() => setField('claimId', '')} accessibilityRole="button" hitSlop={8}>
            <ThemedText variant="caption" color="primary">
              Unlink
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      {fields.claimId ? (
        <ThemedText variant="caption" color="muted">
          Linked to claim {linked?.claimNumber ?? fields.claimNumber}. Claim, property and loss details come from the CRM claim.
        </ThemedText>
      ) : (
        <>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search your CRM claims (optional)"
            placeholderTextColor={theme.colors.muted}
            accessibilityLabel="Search CRM claims"
            style={[styles.input, { color: theme.colors.ink, borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
          />
          {(claims.data ?? []).map((c) => (
            <Pressable key={c.id} onPress={() => link(c)} accessibilityRole="button" style={[styles.row, { borderBottomColor: theme.colors.border }]}>
              <ThemedText variant="body" numberOfLines={1} style={styles.flex}>
                {c.claimNumber} · {c.lossType}
              </ThemedText>
              <ThemedText variant="caption" color="primary">
                Link
              </ThemedText>
            </Pressable>
          ))}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  flex: { flex: 1 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth },
});
