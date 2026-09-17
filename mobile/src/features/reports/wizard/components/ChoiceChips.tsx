import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';

interface ChoiceChipsProps {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}

/** No native picker dependency is installed (and Phase 5 shouldn't add one just for this) —
 * a wrapped row of selectable chips covers every enum field the wizard needs
 * (claimType/lossType/propertyType/inspectionType/weatherConditions/occupancyStatus) with a
 * single reusable component, and reads more like a native form control on a touch screen than
 * a cramped native `<select>`-style picker would anyway. */
export function ChoiceChips({ label, value, options, onChange }: ChoiceChipsProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <ThemedText variant="caption" color="muted" style={styles.label}>
        {label}
      </ThemedText>
      <View style={styles.row}>
        {options.map((option) => {
          const selected = option === value;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                {
                  borderRadius: theme.radii.btn,
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
                },
              ]}
            >
              <ThemedText variant="caption" style={{ color: selected ? theme.colors.primary : theme.colors.ink }}>
                {option}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
