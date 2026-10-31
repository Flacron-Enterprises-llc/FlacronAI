import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Badge, Card } from '@/components/ui';
import { apiErrorMessage } from '@/hooks/useApiResource';
import { useAuth } from '@/features/auth/context/AuthProvider';
import type { NotificationPreferences } from '@/features/auth/types';
import { notificationsApi } from '@/services/api/notifications';
import { useTheme } from '@/theme';

/** Same keys, labels and descriptions as web Settings → Notifications. */
const PREFS: { key: keyof NotificationPreferences; label: string; desc: string; noTrigger?: boolean }[] = [
  { key: 'reportCompleted', label: 'Report Completed', desc: 'Receive an email when your report finishes generating' },
  { key: 'analysisCompleted', label: 'Analysis Completed', desc: 'Receive an email when photo analysis finishes' },
  { key: 'reviewRequested', label: 'Review Requested', desc: 'Receive an email when a teammate requests your review', noTrigger: true },
  { key: 'reportApproved', label: 'Report Approved', desc: 'Receive an email when a report is approved and finalized' },
  { key: 'reportShared', label: 'Report Shared', desc: 'Receive an email when a share link is created for your report' },
  { key: 'billing', label: 'Billing', desc: 'Receive an email about payment issues on your subscription' },
];

/** Email notification preferences (`PUT /users/profile {notifications}`, merged server-side). A missing value means
 * enabled — the backend never back-fills defaults. Each toggle saves immediately and reverts if the save fails. */
export function EmailNotificationsCard() {
  const theme = useTheme();
  const { userProfile, refreshProfile } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences>(userProfile?.notifications ?? {});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (key: keyof NotificationPreferences, value: boolean) => {
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    setSavingKey(key);
    setError(null);
    try {
      await notificationsApi.updatePreferences({ [key]: value });
      refreshProfile().catch(() => undefined);
    } catch (err) {
      setPrefs(previous);
      setError(apiErrorMessage(err, 'Could not save your preference.'));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Card style={styles.card}>
      <ThemedText variant="caption" color="muted" style={styles.intro}>
        Transactional emails about your own reports and billing. Marketing email is separate and never on by default.
      </ThemedText>
      {PREFS.map((p, i) => (
        <View key={p.key} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }]}>
          <View style={styles.text}>
            <View style={styles.inline}>
              <ThemedText variant="body">{p.label}</ThemedText>
              {p.noTrigger ? <Badge label="No trigger yet" tone="warning" /> : null}
            </View>
            <ThemedText variant="caption" color="muted">
              {p.desc}
            </ThemedText>
          </View>
          <Switch
            value={prefs[p.key] !== false}
            disabled={savingKey === p.key}
            onValueChange={(v) => toggle(p.key, v)}
            trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
            accessibilityLabel={`${p.label} emails`}
          />
        </View>
      ))}
      {error ? (
        <ThemedText variant="caption" accessibilityRole="alert" style={{ color: theme.colors.error, marginTop: 8 }}>
          {error}
        </ThemedText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 20 },
  intro: { marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  text: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
