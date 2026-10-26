/**
 * Phase 8 — in-app account deletion (App Store 5.1.1(v) / Google Play requirement), using the
 * existing `DELETE /users/account` endpoint. Order: explain what is deleted and retained → check
 * subscriptions (server billing status: Stripe, Apple, Google) → explicit acknowledgement +
 * typed confirmation → re-authenticate with the account's own provider → delete → only then
 * clear everything local and sign out.
 */
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { AuthTextInput } from '@/features/auth/components/AuthTextInput';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { useBilling } from '@/features/billing/BillingProvider';
import { usersApi } from '@/services/api/users';
import { AccountScaffold, Card, Notice } from '../components/AccountScaffold';
import { ReauthPanel } from '../components/ReauthPanel';
import { acknowledgementText, deletedText, deletionWarnings, requestAccountDeletion, requiresBillingAcknowledgement, warningText } from '../deletion';

export const DELETED_ITEMS = [
  'Your profile, sign-in and settings',
  'All reports, report history, drafts, photos and exports',
  'Templates, CRM records, API keys and webhooks',
  'In-app notifications and this account’s push-notification registrations',
];

export const RETAINED_ITEMS = [
  'Security audit logs',
  'Payment and purchase records kept by Stripe, Apple and Google, and our record of store purchases (so a purchase can never be moved to another account)',
  'Messages you sent to our sales or support team',
];

function Checkbox({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      style={styles.checkRow}
    >
      <View style={[styles.box, { borderColor: checked ? theme.colors.primary : theme.colors.border, backgroundColor: checked ? theme.colors.primary : 'transparent' }]}>
        {checked && <ThemedText style={{ color: '#FFFFFF' }}>✓</ThemedText>}
      </View>
      <ThemedText variant="body" style={styles.checkText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function DeleteAccountScreen() {
  const { logout, isFederated } = useAuth();
  const billing = useBilling();
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needReauth, setNeedReauth] = useState(false);
  const done = useRef(false);

  const statusKnown = billing.availability !== 'loading';
  const warnings = statusKnown ? deletionWarnings(billing.state.status, billing.platform) : [];
  const needsAck = requiresBillingAcknowledgement(warnings);
  const sameDeviceStore = warnings.some((w) => w.kind === 'store_active' && w.sameDevice);
  const confirmed = typed.trim().toUpperCase() === 'DELETE' && (!needsAck || ack) && statusKnown;

  const performDelete = async () => {
    setError(null);
    setNeedReauth(false);
    const outcome = await requestAccountDeletion({
      deleteAccount: usersApi.deleteAccount,
      cleanup: async () => {
        done.current = true;
        await logout(); // revokes push binding, signs out, wipes drafts/cache/pending links
      },
    });
    if (outcome.kind === 'deleted') {
      Alert.alert('Account deleted', deletedText(outcome));
      return; // signed out — this screen is gone
    }
    if (done.current) return;
    if (outcome.kind === 'reauth_required') {
      setNeedReauth(true);
      setError('Please confirm it’s you again, then delete.');
    } else {
      setError(outcome.message);
    }
  };

  return (
    <AccountScaffold title="Delete account">
      {isFederated && (
        <Notice
          tone="info"
          text="This deletes only your QA test account: the reports, photos and data you created in this QA app. Your FlacronAI website account, its data and any website subscription are not affected."
        />
      )}
      <Card>
        <ThemedText variant="subtitle" style={styles.title}>
          This permanently deletes:
        </ThemedText>
        {DELETED_ITEMS.map((t) => (
          <ThemedText key={t} variant="body" style={styles.item}>
            • {t}
          </ThemedText>
        ))}
        <ThemedText variant="subtitle" style={[styles.title, styles.spaced]}>
          Kept after deletion:
        </ThemedText>
        {RETAINED_ITEMS.map((t) => (
          <ThemedText key={t} variant="body" style={styles.item}>
            • {t}
          </ThemedText>
        ))}
        <ThemedText variant="caption" color="muted" style={styles.spaced}>
          This cannot be undone. If you own an enterprise team, remove its members on the web first.
        </ThemedText>
      </Card>

      <Card>
        <ThemedText variant="subtitle" style={styles.title}>
          Subscriptions
        </ThemedText>
        {!statusKnown ? (
          <ThemedText variant="body">Checking your subscriptions…</ThemedText>
        ) : warnings.length === 0 ? (
          <ThemedText variant="body">No active paid subscription was found.</ThemedText>
        ) : (
          warnings.map((w) => (
            <ThemedText key={w.kind} variant="body" style={styles.item}>
              {warningText(w)}
            </ThemedText>
          ))
        )}
        {sameDeviceStore && <PrimaryButton variant="secondary" label="Manage subscription" onPress={billing.manage} />}
        {warnings.some((w) => w.kind === 'status_unknown') && (
          <View style={styles.spaced}>
            <PrimaryButton variant="secondary" label="Check again" onPress={billing.reload} />
          </View>
        )}
        {needsAck && (
          <Checkbox checked={ack} onToggle={() => setAck((v) => !v)} label={acknowledgementText(warnings)} />
        )}
      </Card>

      <Notice tone="error" text={error} />
      <AuthTextInput
        label='Type DELETE to confirm'
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        accessibilityLabel="Type DELETE to confirm"
      />
      <ReauthPanel key={needReauth ? 'again' : 'first'} actionLabel="Delete account" onConfirmed={performDelete} disabled={!confirmed} />
    </AccountScaffold>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 6 },
  item: { marginBottom: 6 },
  spaced: { marginTop: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginTop: 8 },
  box: { width: 22, height: 22, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checkText: { flex: 1 },
});
