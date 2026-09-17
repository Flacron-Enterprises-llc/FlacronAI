import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';

interface ConfirmCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  label: string;
}

/** Same visual pattern as `features/auth/components/TermsCheckbox.tsx`, generalized with a
 * `label` prop — used here for the approval flow's "I have reviewed this report" attestation
 * checkbox (Golden Rule #3), which is never pre-checked. */
export function ConfirmCheckbox({ checked, onToggle, label }: ConfirmCheckboxProps) {
  const theme = useTheme();

  return (
    <Pressable onPress={onToggle} style={styles.row} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <View
        style={[
          styles.box,
          {
            borderColor: checked ? theme.colors.primary : theme.colors.border,
            backgroundColor: checked ? theme.colors.primary : 'transparent',
            borderRadius: 6,
          },
        ]}
      >
        {checked && <ThemedText style={{ color: '#FFFFFF' }}>✓</ThemedText>}
      </View>
      <ThemedText variant="caption" color="muted" style={styles.text}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  box: {
    width: 20,
    height: 20,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
});
