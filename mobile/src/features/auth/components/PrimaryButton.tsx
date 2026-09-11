import { ActivityIndicator, Pressable, StyleSheet, type GestureResponderEvent } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';

interface PrimaryButtonProps {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

/** The one button component every auth screen uses — owns its own loading/disabled
 * visual state so screens can't accidentally allow a duplicate submit while a request is
 * in flight (see AUTHENTICATION_ARCHITECTURE.md §5.3 "loading state and prevention of
 * duplicate submissions"). */
export function PrimaryButton({ label, onPress, loading = false, disabled = false, variant = 'primary' }: PrimaryButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const isSecondary = variant === 'secondary';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: theme.radii.btn,
          backgroundColor: isSecondary ? theme.colors.surface : theme.colors.primary,
          borderWidth: isSecondary ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: theme.colors.border,
          opacity: isDisabled ? 0.6 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isSecondary ? theme.colors.primary : '#FFFFFF'} />
      ) : (
        <ThemedText
          variant="body"
          style={[styles.label, { color: isSecondary ? theme.colors.ink : '#FFFFFF' }]}
        >
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  label: {
    fontWeight: '600',
  },
});
