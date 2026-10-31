import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Reveal } from '@/components/brand/Reveal';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Kept for call-site compatibility: back now lives in the navy app bar (ScreenContainer). */
  back?: boolean;
  action?: { label: string; onPress: () => void; disabled?: boolean };
  right?: ReactNode;
}

/** Page title row under the navy app bar (reference: "Projects", "Room Details", "Estimate"): bold display title,
 * optional subtitle, optional action on the right. */
export function ScreenHeader({ title, subtitle, action, right }: ScreenHeaderProps) {
  const theme = useTheme();
  return (
    <Reveal style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.titles}>
          <ThemedText variant="title" accessibilityRole="header" style={styles.title}>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText variant="body" color="muted" style={styles.subtitle}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        {right}
        {action ? (
          <Pressable
            onPress={action.onPress}
            disabled={action.disabled}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: theme.colors.primarySoft, opacity: action.disabled ? 0.5 : pressed ? 0.75 : 1 },
            ]}
          >
            <ThemedText variant="caption" color="primary" style={{ fontFamily: theme.typography.fontFamily.bodySemiBold, fontSize: 14 }}>
              {action.label}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titles: { flex: 1 },
  title: { fontSize: 24, letterSpacing: -0.3 },
  subtitle: { marginTop: 4 },
  action: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
});
