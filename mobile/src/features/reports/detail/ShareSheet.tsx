import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { Badge, Card, Icon } from '@/components/ui';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { FormError } from '@/features/auth/components/FormError';
import { apiErrorMessage } from '@/hooks/useApiResource';
import { reportsApi, type ReportShare, type ShareExpiry, type SharePermission } from '@/services/api/reports';
import { useTheme } from '@/theme';
import { ChoiceChips } from '../wizard/components/ChoiceChips';

const PERMISSIONS: { value: SharePermission; label: string; help: string }[] = [
  { value: 'view', label: 'View', help: 'Read-only link. Only for finalized reports.' },
  { value: 'comment', label: 'Comment', help: 'Recipient can read and leave comments.' },
  { value: 'review', label: 'Review', help: 'Recipient can comment and review photos before approval.' },
];
const EXPIRIES: { value: ShareExpiry | 'never'; label: string }[] = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'never', label: 'No expiry' },
];

interface Props {
  reportId: string;
  claimNumber: string;
  finalized: boolean;
  onClose: () => void;
}

/** Web ShareReportModal: secure links with a permission level and optional expiry, listed and revocable. Sharing the
 * link uses the native share sheet (which also offers Copy). Mounted only while open. */
export function ShareSheet({ reportId, claimNumber, finalized, onClose }: Props) {
  const theme = useTheme();
  const [shares, setShares] = useState<ReportShare[] | null>(null);
  const [permission, setPermission] = useState<SharePermission>(finalized ? 'view' : 'comment');
  const [expiry, setExpiry] = useState<ShareExpiry | 'never'>('7d');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await reportsApi.listShares(reportId);
      setShares(res.shares);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load share links.'));
      setShares([]);
    }
  }, [reportId]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  // The server builds links from FRONTEND_URL; if that isn't configured it returns a bare path, which must never be
  // shared as-is.
  const absolute = (url: string) => (url.startsWith('/') ? `https://flacronai.com${url}` : url);
  const shareUrl = (url: string) =>
    Share.share({ message: `FlacronAI report — claim ${claimNumber}: ${absolute(url)}`, url: absolute(url) }).catch(() => undefined);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await reportsApi.createShare(reportId, permission, expiry === 'never' ? undefined : expiry);
      await load();
      shareUrl(res.url);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create the link.'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = (share: ReportShare) =>
    Alert.alert('Revoke this link?', 'Anyone using it will lose access immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          setError(null);
          try {
            await reportsApi.revokeShare(reportId, share.id);
            await load();
          } catch (err) {
            setError(apiErrorMessage(err, 'Could not revoke the link.'));
          }
        },
      },
    ]);

  const selected = PERMISSIONS.find((p) => p.value === permission);
  const viewBlocked = permission === 'view' && !finalized;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]}>
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <View style={styles.head}>
            <ThemedText variant="title" accessibilityRole="header" style={styles.fill}>
              Share report
            </ThemedText>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.close}>
              <Icon name="x" size={22} />
            </Pressable>
          </View>

          <ChoiceChips
            label="Permission"
            value={selected?.label ?? ''}
            options={PERMISSIONS.map((p) => p.label)}
            onChange={(label) => setPermission(PERMISSIONS.find((p) => p.label === label)?.value ?? 'view')}
          />
          <ThemedText variant="caption" color={viewBlocked ? 'ink' : 'muted'} style={[styles.help, viewBlocked && { color: theme.colors.warning }]}>
            {viewBlocked ? 'Approve and finalize the report before creating a view-only link.' : selected?.help}
          </ThemedText>
          <ChoiceChips
            label="Link expires"
            value={EXPIRIES.find((e) => e.value === expiry)?.label ?? ''}
            options={EXPIRIES.map((e) => e.label)}
            onChange={(label) => setExpiry(EXPIRIES.find((e) => e.label === label)?.value ?? '7d')}
          />
          <FormError message={error} />
          <PrimaryButton icon="link" label="Create & share link" onPress={create} loading={busy} disabled={viewBlocked} />

          <ThemedText variant="subtitle" style={styles.listTitle}>
            Active links
          </ThemedText>
          {shares === null ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : shares.length === 0 ? (
            <ThemedText variant="body" color="muted">
              No active links.
            </ThemedText>
          ) : (
            shares.map((s) => (
              <Card key={s.id} style={styles.share}>
                <View style={styles.row}>
                  <Badge label={s.permission.charAt(0).toUpperCase() + s.permission.slice(1)} tone="navy" />
                  <ThemedText variant="caption" color="muted" style={styles.fill}>
                    {s.expiresAt ? `Expires ${new Date(s.expiresAt).toLocaleDateString()}` : 'No expiry'}
                  </ThemedText>
                </View>
                <ThemedText variant="caption" color="muted" numberOfLines={1} style={styles.url}>
                  {absolute(s.url)}
                </ThemedText>
                <View style={styles.row}>
                  <View style={styles.fill}>
                    <PrimaryButton variant="secondary" icon="share-2" label="Share" onPress={() => shareUrl(s.url)} />
                  </View>
                  <View style={styles.fill}>
                    <PrimaryButton variant="danger" icon="slash" label="Revoke" onPress={() => revoke(s)} />
                  </View>
                </View>
              </Card>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: 16, paddingBottom: 40 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  help: { marginTop: -6, marginBottom: 12 },
  listTitle: { marginTop: 24, marginBottom: 10 },
  share: { marginBottom: 10, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  url: { marginVertical: 2 },
});
