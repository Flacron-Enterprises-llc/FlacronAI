import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AuthTextInput } from '@/features/auth/components/AuthTextInput';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import type { WizardFields } from '../wizardTypes';
import { INSPECTION_TYPES, LOSS_TYPES, OCCUPANCY_STATUSES, WEATHER_CONDITIONS } from '../constants';
import { ChoiceChips } from '../components/ChoiceChips';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface StepProps {
  fields: WizardFields;
  setField: (key: string, value: string) => void;
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const theme = useTheme();
  const invalid = !!value && !DATE_RE.test(value);

  return (
    <View style={styles.dateWrap}>
      <AuthTextInput
        label={label}
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        error={invalid ? 'Use the YYYY-MM-DD format' : undefined}
      />
      <Pressable onPress={() => onChange(todayIso())} style={styles.todayLink}>
        <ThemedText variant="caption" style={{ color: theme.colors.primary }}>
          Use today&apos;s date
        </ThemedText>
      </Pressable>
    </View>
  );
}

export function LossDetailsStep({ fields, setField }: StepProps) {
  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <ChoiceChips label="Loss type *" value={fields.lossType || 'Water Damage'} options={LOSS_TYPES} onChange={(v) => setField('lossType', v)} />
      <DateField label="Date of loss *" value={fields.lossDate || ''} onChange={(v) => setField('lossDate', v)} />
      <DateField label="Inspection date" value={fields.inspectionDate || ''} onChange={(v) => setField('inspectionDate', v)} />
      <ChoiceChips
        label="Inspection type"
        value={fields.inspectionType || 'Interior & Exterior'}
        options={INSPECTION_TYPES}
        onChange={(v) => setField('inspectionType', v)}
      />
      <ChoiceChips
        label="Weather conditions"
        value={fields.weatherConditions || 'Clear/Sunny'}
        options={WEATHER_CONDITIONS}
        onChange={(v) => setField('weatherConditions', v)}
      />
      <ChoiceChips
        label="Occupancy status"
        value={fields.occupancyStatus || 'Occupied'}
        options={OCCUPANCY_STATUSES}
        onChange={(v) => setField('occupancyStatus', v)}
      />
      <AuthTextInput
        label="Property details"
        value={fields.propertyDetails || ''}
        onChangeText={(v) => setField('propertyDetails', v)}
        multiline
        numberOfLines={3}
        style={styles.multiline}
      />
      <AuthTextInput
        label="Loss description"
        value={fields.lossDescription || ''}
        onChangeText={(v) => setField('lossDescription', v)}
        multiline
        numberOfLines={3}
        style={styles.multiline}
      />
      <AuthTextInput
        label="Damages observed"
        value={fields.damagesObserved || ''}
        onChangeText={(v) => setField('damagesObserved', v)}
        multiline
        numberOfLines={3}
        style={styles.multiline}
      />
      <AuthTextInput
        label="Additional notes"
        value={fields.additionalNotes || ''}
        onChangeText={(v) => setField('additionalNotes', v)}
        multiline
        numberOfLines={3}
        style={styles.multiline}
      />
    </ScrollView>
  );
}

export function isLossDetailsStepValid(fields: WizardFields): boolean {
  return !!(fields.lossType?.trim() && fields.lossDate && DATE_RE.test(fields.lossDate));
}

const styles = StyleSheet.create({
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  dateWrap: {
    marginBottom: 4,
  },
  todayLink: {
    alignSelf: 'flex-start',
    marginTop: -10,
    marginBottom: 12,
  },
});
