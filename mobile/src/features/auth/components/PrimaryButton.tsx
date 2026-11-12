import { ActivityIndicator, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { ScalePressable } from '@/components/brand/ScalePressable';

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
  const fg = isPrimary ? '#FFFFFF' : variant === 'danger' ? theme.colors.error : theme.colors.navy;
  const bg = isPrimary ? theme.colors.primary : variant === 'danger' ? theme.colors.error + '14' : theme.colors.surface;
  const border = variant === 'danger' ? theme.colors.error + '4D' : theme.colors.border;

  return (
    <ScalePressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      pressScale={0.97}
      style={[
        styles.base,
        isPrimary && !isDisabled && styles.shadow,
        {
          borderRadius: 14,
          backgroundColor: bg,
          borderWidth: isPrimary ? 0 : 1.5,
          borderColor: variant === 'secondary' ? theme.colors.navy + '40' : border,
          opacity: isDisabled ? 0.6 : 1,
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
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    fontWeight: '600',
    fontSize: 16,
  },
  shadow: {
    shadowColor: '#FD4403',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
});
