import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import type { Report } from '@/services/api/reports';
import { StatusBadge } from '../components/StatusBadge';

const FIELD_ROWS: [string, string][] = [
  ['claimNumber', 'Claim number'],
  ['insuredName', 'Insured'],
  ['propertyAddress', 'Property address'],
  ['lossType', 'Loss type'],
  ['lossDate', 'Date of loss'],
  ['reportType', 'Report type'],
];

export function OverviewTab({ report }: { report: Report }) {
  const theme = useTheme();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <StatusBadge status={report.status} />
      </View>

      <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card }]}>
        {FIELD_ROWS.map(([key, label]) => {
          const value = report[key];
          if (!value) return null;
          return (
            <View key={key} style={styles.row}>
              <ThemedText variant="caption" color="muted">
                {label}
              </ThemedText>
              <ThemedText variant="body" style={styles.rowValue}>
                {String(value)}
              </ThemedText>
            </View>
          );
        })}
      </View>

      {report.status === 'processing' ? (
        <ThemedText variant="body" color="muted" style={styles.processing}>
          FlacronAI is still analyzing the uploaded photos and drafting this report. This usually takes a minute — this screen updates
          automatically.
        </ThemedText>
      ) : (
        <>
          <ThemedText variant="subtitle" style={styles.sectionTitle}>
            Draft content
          </ThemedText>
          <ThemedText variant="caption" color="muted" style={styles.disclaimer}>
            AI-generated draft for licensed-adjuster review — not a final professional determination.
          </ThemedText>
          <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card }]}>
            <ThemedText variant="body">{report.content || 'No content yet.'}</ThemedText>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
  headerRow: {
    marginBottom: 12,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 14,
    marginBottom: 16,
  },
  row: {
    marginBottom: 10,
  },
  rowValue: {
    marginTop: 2,
  },
  processing: {
    marginTop: 8,
  },
  sectionTitle: {
    marginBottom: 4,
  },
  disclaimer: {
    marginBottom: 10,
  },
});
