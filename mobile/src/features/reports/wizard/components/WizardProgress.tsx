import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import type { WizardStep } from '../wizardTypes';

const STEP_LABELS = ['Claim', 'Property', 'Loss details', 'Photos', 'Review'];

export function WizardProgress({ step }: { step: WizardStep }) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={styles.dots}>
        {STEP_LABELS.map((_, index) => {
          const stepNumber = index + 1;
          const active = stepNumber <= step;
          return (
            <View
              key={stepNumber}
              style={[
                styles.dot,
                {
                  backgroundColor: active ? theme.colors.primary : theme.colors.border,
                },
              ]}
            />
          );
        })}
      </View>
      <ThemedText variant="caption" color="muted" style={styles.label}>
        Step {step} of {STEP_LABELS.length} · {STEP_LABELS[step - 1]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  dot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  label: {},
});
