import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import type { WizardFields } from '../wizardTypes';

interface ReviewStepProps {
  fields: WizardFields;
  readyPhotoCount: number;
  uploadingCount: number;
  /** Failed or duplicate photos — shown so the user knows they won't be in the report. */
  notReadyCount: number;
  submitError: string | null;
}

const SUMMARY_ROWS: [string, string][] = [
  ['claimNumber', 'Claim number'],
  ['insuredName', 'Insured name'],
  ['insuredEmail', 'Insured email'],
  ['claimType', 'Claim type'],
  ['reportType', 'Report type'],
  ['propertyAddress', 'Property / loss location'],
  ['lossType', 'Loss type'],
  ['lossDate', 'Date of loss'],
  ['inspectionDate', 'Inspection date'],
  ['inspectionType', 'Inspection type'],
  ['weatherConditions', 'Weather conditions'],
  ['occupancyStatus', 'Occupancy status'],
  ['propertyType', 'Property type'],
];

export function ReviewStep({ fields, readyPhotoCount, uploadingCount, notReadyCount, submitError }: ReviewStepProps) {
  const theme = useTheme();

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <ThemedText variant="body" color="muted" style={styles.intro}>
        Review before generating. FlacronAI will produce an AI-assisted draft — a licensed adjuster must review and approve it before
        it counts as final.
      </ThemedText>

      <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card }]}>
        {SUMMARY_ROWS.map(([key, label]) => (
          <View key={key} style={styles.row}>
            <ThemedText variant="caption" color="muted" style={styles.rowLabel}>
              {label}
            </ThemedText>
            <ThemedText variant="body" style={styles.rowValue} numberOfLines={2}>
              {fields[key]?.trim() || '—'}
            </ThemedText>
          </View>
        ))}
        <View style={styles.row}>
          <ThemedText variant="caption" color="muted" style={styles.rowLabel}>
            Photos
          </ThemedText>
          <ThemedText variant="body" style={styles.rowValue}>
            {readyPhotoCount} ready to submit
          </ThemedText>
          {uploadingCount > 0 && (
            <ThemedText variant="caption" color="muted">
              {uploadingCount} still uploading — Generate is available once they finish.
            </ThemedText>
          )}
          {notReadyCount > 0 && (
            <ThemedText variant="caption" style={{ color: theme.colors.warning }}>
              {notReadyCount} not included (failed or duplicate) — see the Photos step.
            </ThemedText>
          )}
        </View>
      </View>

      {!!submitError && (
        <ThemedText variant="body" style={[styles.error, { color: theme.colors.error }]}>
          {submitError}
        </ThemedText>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginBottom: 16,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 14,
  },
  row: {
    marginBottom: 10,
  },
  rowLabel: {
    marginBottom: 2,
  },
  rowValue: {},
  error: {
    marginTop: 16,
  },
});
