import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Icon } from '@/components/ui/Icon';
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
        <ThemedText
          variant="subtitle"
          numberOfLines={1}
          style={[styles.claimNumber, { color: theme.colors.primaryHover, fontFamily: theme.typography.fontFamily.bodySemiBold }]}
        >
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
        <ThemedText variant="caption" color="muted" numberOfLines={1} style={styles.footerText}>
          {[report.reportType, report.lossType].filter(Boolean).join(' · ')}
        </ThemedText>
        <View style={styles.meta}>
          <Icon name="image" size={12} color={theme.colors.muted} />
          <ThemedText variant="caption" color="muted">
            {report.imageCount ?? 0}
          </ThemedText>
        </View>
      </View>
      <ThemedText variant="caption" color="muted" style={styles.updated}>
        Updated {formatDate(report.updatedAt || report.createdAt)}
        {report.createdByEmail ? ` · ${report.createdByEmail}` : ''}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
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
    gap: 8,
    marginTop: 10,
  },
  footerText: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  updated: { marginTop: 4 },
});
