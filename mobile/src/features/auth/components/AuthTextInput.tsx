import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';

interface AuthTextInputProps extends TextInputProps {
  label: string;
  error?: string;
}

/** Labeled, themed text input with inline field-level error text — the base building
 * block for every auth form (see features/README.md convention: reusable auth form
 * components belong here, not duplicated per-screen). */
export function AuthTextInput({ label, error, style, ...rest }: AuthTextInputProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <ThemedText variant="caption" color="muted" style={styles.label}>
        {label}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.colors.muted}
        style={[
          styles.input,
          {
            borderColor: error ? theme.colors.error : theme.colors.border,
            backgroundColor: theme.colors.surface,
            color: theme.colors.ink,
            borderRadius: theme.radii.btn,
            fontFamily: theme.typography.fontFamily.body,
            fontSize: theme.typography.size.body,
          },
          style,
        ]}
        {...rest}
      />
      {!!error && (
        <ThemedText variant="caption" color="primary" style={[styles.error, { color: theme.colors.error }]}>
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
  label: {
    marginBottom: 6,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  error: {
    marginTop: 6,
  },
});
