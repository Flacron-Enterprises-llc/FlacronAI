import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';

/** Phase 8 — one tappable settings/info row (≥48pt touch target, labelled for screen readers). */
export function SettingsRow({
  label,
  detail,
  onPress,
  destructive = false,
  accessibilityHint,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
  destructive?: boolean;
  accessibilityHint?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.colors.border, opacity: pressed ? 0.6 : 1 }]}
    >
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
      <ThemedText variant="body" color="muted" accessibilityElementsHidden importantForAccessibility="no">
        ›
      </ThemedText>
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
});
