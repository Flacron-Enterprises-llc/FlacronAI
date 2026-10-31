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

export function ReportCard({
  report,
  onPress,
  onLongPress,
  selected,
}: {
  report: Report;
  onPress: () => void;
  onLongPress?: () => void;
  /** Bulk-selection mode: `true`/`false` shows a checkbox; `undefined` = normal card. */
  selected?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={selected === undefined ? 'button' : 'checkbox'}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      accessibilityLabel={`Report for claim ${report.claimNumber}, ${report.status}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          borderRadius: theme.radii.card,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.headerRow}>
        {selected !== undefined ? (
          <View
            style={[
              styles.check,
              { borderColor: selected ? theme.colors.primary : theme.colors.border, backgroundColor: selected ? theme.colors.primary : 'transparent' },
            ]}
          >
            {selected ? <Icon name="check" size={14} color="#FFFFFF" /> : null}
          </View>
        ) : null}
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
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  updated: { marginTop: 4 },
});
