import type React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useTheme } from '@/theme';

/** Phase 8 — one tappable settings/info row (≥48pt touch target, labelled for screen readers). */
export function SettingsRow({
  label,
  detail,
  onPress,
  destructive = false,
  accessibilityHint,
  icon,
  external = false,
  trailing,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
  destructive?: boolean;
  accessibilityHint?: string;
  icon?: IconName;
  /** Opens outside the app (browser) — shows an external-link glyph instead of a chevron. */
  external?: boolean;
  trailing?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.colors.border, opacity: pressed ? 0.6 : 1 }]}
    >
      {icon ? (
        <View style={[styles.iconTile, { backgroundColor: destructive ? theme.colors.error + '14' : theme.colors.primarySoft }]}>
          <Icon name={icon} size={18} color={destructive ? theme.colors.error : theme.colors.primary} />
        </View>
      ) : null}
      <View style={styles.text}>
        <ThemedText variant="body" style={destructive ? { color: theme.colors.error } : undefined}>
          {label}
        </ThemedText>
        {!!detail && (
          <ThemedText variant="caption" color="muted">
            {detail}
          </ThemedText>
        )}
      </View>
      {trailing}
      <Icon name={external ? 'external-link' : 'chevron-right'} size={external ? 16 : 18} color={theme.colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, paddingRight: 12 },
  iconTile: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
});
