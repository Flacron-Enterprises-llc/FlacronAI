import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';

interface TermsCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  error?: string;
}

/** Required Terms + Privacy acknowledgement — NEVER pre-checked by default (Golden Rule
 * #5 / mirrors `frontend/src/pages/Auth.jsx`'s `agreedToTerms` starting at `false`). The
 * legal document text itself is web-hosted (Phase 8 scope, see reuse-strategy §2.8) — this
 * component only renders the checkbox + inline links out to those pages. */
export function TermsCheckbox({ checked, onToggle, error }: TermsCheckboxProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onToggle}
        style={styles.row}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
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
          I agree to the Terms of Service and Privacy Policy
        </ThemedText>
      </Pressable>
      {!!error && (
        <ThemedText variant="caption" style={{ color: theme.colors.error, marginTop: 4 }}>
          {error}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
