import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';

interface PasswordInputProps extends Omit<TextInputProps, 'secureTextEntry'> {
  label: string;
  error?: string;
  hint?: string;
}

/** Password field with a show/hide toggle — never logs or persists the entered value
 * (see AUTHENTICATION_ARCHITECTURE.md §6 "no password/token logging"). */
export function PasswordInput({ label, error, hint, style, ...rest }: PasswordInputProps) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <ThemedText variant="caption" color="muted" style={styles.label}>
        {label}
      </ThemedText>
      <View style={styles.row}>
        <TextInput
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
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
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={10}
          style={styles.toggle}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        >
          <ThemedText variant="caption" color="primary">
            {visible ? 'Hide' : 'Show'}
          </ThemedText>
        </Pressable>
      </View>
      {!!error && (
        <ThemedText variant="caption" style={[styles.helper, { color: theme.colors.error }]}>
          {error}
        </ThemedText>
      )}
      {!error && !!hint && (
        <ThemedText variant="caption" color="muted" style={styles.helper}>
          {hint}
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
  row: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingRight: 56,
  },
  toggle: {
    position: 'absolute',
    right: 14,
  },
  helper: {
    marginTop: 6,
  },
});
