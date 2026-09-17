import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import type { WizardFields } from '../wizardTypes';

interface ReviewStepProps {
  fields: WizardFields;
  readyPhotoCount: number;
  submitError: string | null;
}

const SUMMARY_ROWS: [string, string][] = [
  ['claimNumber', 'Claim number'],
  ['insuredName', 'Insured name'],
  ['insuredEmail', 'Insured email'],
  ['claimType', 'Claim type'],
  ['propertyAddress', 'Property / loss location'],
  ['lossType', 'Loss type'],
  ['lossDate', 'Date of loss'],
  ['inspectionDate', 'Inspection date'],
];

export function ReviewStep({ fields, readyPhotoCount, submitError }: ReviewStepProps) {
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
