import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import type { Report } from '@/services/api/reports';
import { StatusBadge } from './StatusBadge';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function ReportCard({ report, onPress }: { report: Report; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Report for claim ${report.claimNumber}, ${report.status}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.card,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <ThemedText variant="subtitle" numberOfLines={1} style={styles.claimNumber}>
          {report.claimNumber}
        </ThemedText>
        <StatusBadge status={report.status} />
      </View>
      <ThemedText variant="body" numberOfLines={1} style={styles.insured}>
        {report.insuredName}
      </ThemedText>
      <ThemedText variant="caption" color="muted" numberOfLines={1}>
        {report.propertyAddress}
      </ThemedText>
      <View style={styles.footerRow}>
        <ThemedText variant="caption" color="muted">
          {report.lossType} · {formatDate(report.createdAt)}
        </ThemedText>
        <ThemedText variant="caption" color="muted">
          {report.imageCount} photo{report.imageCount === 1 ? '' : 's'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 14,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  claimNumber: {
    flexShrink: 1,
    marginRight: 8,
  },
  insured: {
    marginTop: 2,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
});
