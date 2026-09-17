import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { useReportVersions } from '../hooks/useReportVersions';
import { LoadingState, StateMessage } from '../components/StateMessage';

const ACTION_LABELS: Record<string, string> = {
  generated: 'Generated',
  edited: 'Edited',
  edited_reopened: 'Edited (reopened after approval)',
  approved: 'Approved',
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function VersionsTab({ reportId, active }: { reportId: string; active: boolean }) {
  const theme = useTheme();
  const { versions, loading, error, retry } = useReportVersions(reportId, active);

  if (loading) return <LoadingState label="Loading version history…" />;
  if (error) return <StateMessage title="Could not load version history" description={error} onRetry={retry} />;
  if (versions.length === 0) return <StateMessage title="No history yet" description="Edits and approvals will appear here." />;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {[...versions].reverse().map((version, index) => (
        <View key={`${version.at}-${index}`} style={[styles.row, { borderColor: theme.colors.border }]}>
          <ThemedText variant="body" style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
            {ACTION_LABELS[version.action] || version.action}
          </ThemedText>
          <ThemedText variant="caption" color="muted">
            {version.by} · {formatDateTime(version.at)}
          </ThemedText>
          {!!version.note && (
            <ThemedText variant="caption" color="muted" style={styles.note}>
              {version.note}
            </ThemedText>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
  row: {
    borderLeftWidth: 2,
    paddingLeft: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  note: {
    marginTop: 4,
  },
});
