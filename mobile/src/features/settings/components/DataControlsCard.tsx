import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Card } from '@/components/ui';
import { apiErrorMessage } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { notifyReportsChanged } from '@/features/reports/reportsEvents';
import { reportsApi } from '@/services/api/reports';
import { usersApi } from '@/services/api/users';
import { clearExportFiles, exportDirectory } from '@/services/localData/fileCache';
import { useTheme } from '@/theme';

/** Web Settings → Data: download a copy of your account data (JSON) and permanently delete every archived report. The
 * export file lives in the app's export cache, which is wiped on sign-out. */
export function DataControlsCard() {
  const theme = useTheme();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const exportData = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const data = await usersApi.exportData();
      clearExportFiles();
      const dir = exportDirectory();
      dir.create({ intermediates: true, idempotent: true });
      const file = new File(dir, `flacronai-data-${new Date().toISOString().slice(0, 10)}.json`);
      file.write(JSON.stringify(data, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: file.name });
      } else {
        setMessage({ tone: 'ok', text: 'Your data was prepared, but sharing is not available on this device.' });
      }
    } catch (err) {
      setMessage({ tone: 'error', text: apiErrorMessage(err, 'Could not export your data.') });
    } finally {
      setExporting(false);
    }
  };

  const deleteArchived = () =>
    Alert.alert('Delete all archived reports?', 'Every archived report and its photos are permanently deleted. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          setMessage(null);
          try {
            const res = await reportsApi.deleteAllArchived();
            notifyReportsChanged();
            setMessage({
              tone: 'ok',
              text: res.deletedCount ? `Deleted ${res.deletedCount} archived report${res.deletedCount === 1 ? '' : 's'}.` : 'No archived reports to delete.',
            });
          } catch (err) {
            setMessage({ tone: 'error', text: apiErrorMessage(err, 'Could not delete archived reports.') });
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);

  return (
    <Card style={styles.card}>
      <ThemedText variant="body" style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
        Export my data
      </ThemedText>
      <ThemedText variant="caption" color="muted" style={styles.desc}>
        A JSON copy of your profile and report records.
      </ThemedText>
      <PrimaryButton variant="secondary" icon="download" label="Export data" onPress={exportData} loading={exporting} />
      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
      <ThemedText variant="body" style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
        Delete archived reports
      </ThemedText>
      <ThemedText variant="caption" color="muted" style={styles.desc}>
        Permanently removes every archived report and its photos.
      </ThemedText>
      <PrimaryButton variant="danger" icon="trash-2" label="Delete all archived" onPress={deleteArchived} loading={deleting} />
      {message ? (
        <ThemedText
          variant="caption"
          accessibilityLiveRegion="polite"
          style={{ color: message.tone === 'ok' ? theme.colors.success : theme.colors.error, marginTop: 10 }}
        >
          {message.text}
        </ThemedText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 20 },
  desc: { marginTop: 2, marginBottom: 10 },
  divider: { height: 1, marginVertical: 16 },
});
