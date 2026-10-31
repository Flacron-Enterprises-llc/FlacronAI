import { ActivityIndicator, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useTheme } from '@/theme';

interface PrimaryButtonProps {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: IconName;
  accessibilityHint?: string;
}

/** The one button component every screen uses — owns its own loading/disabled
 * visual state so screens can't accidentally allow a duplicate submit while a request is
 * in flight (see AUTHENTICATION_ARCHITECTURE.md §5.3 "loading state and prevention of
 * duplicate submissions"). Variants mirror the web `.btn-primary` / `.btn-secondary` / `.btn-danger` classes. */
export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  icon,
  accessibilityHint,
}: PrimaryButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const isPrimary = variant === 'primary';
  const fg = isPrimary ? '#FFFFFF' : variant === 'danger' ? theme.colors.error : theme.colors.ink;
  const bg = isPrimary ? theme.colors.primary : variant === 'danger' ? theme.colors.error + '14' : theme.colors.background;
  const border = variant === 'danger' ? theme.colors.error + '4D' : theme.colors.border;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        isPrimary && theme.scheme === 'light' && !isDisabled && styles.shadow,
        {
          borderRadius: theme.radii.btn,
          backgroundColor: isPrimary && pressed ? theme.colors.primaryHover : bg,
          borderWidth: isPrimary ? 0 : 1,
          borderColor: border,
          opacity: isDisabled ? 0.6 : pressed && !isPrimary ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#FFFFFF' : theme.colors.primary} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={16} color={fg} /> : null}
          <ThemedText variant="body" style={[styles.label, { color: fg, fontFamily: theme.typography.fontFamily.bodySemiBold }]}>
            {label}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    fontWeight: '600',
  },
  shadow: {
    shadowColor: '#FD4403',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
});
