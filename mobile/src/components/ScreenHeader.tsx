import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Show the back control (stack screens). Tab roots pass false. */
  back?: boolean;
  action?: { label: string; onPress: () => void; disabled?: boolean };
  right?: ReactNode;
}

/** Page header shared by stack screens: back, display-font title (web page `h1`), optional action. Back falls back to
 * the dashboard when the screen was opened directly (notification tap / deep link) with nothing to go back to. */
export function ScreenHeader({ title, subtitle, back = true, action, right }: ScreenHeaderProps) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/dashboard'))}
          hitSlop={8}
          style={styles.back}
        >
          <Icon name="chevron-left" size={20} color={theme.colors.primary} />
          <ThemedText variant="body" style={{ color: theme.colors.primary }}>
            Back
          </ThemedText>
        </Pressable>
      ) : null}
      <View style={styles.row}>
        <View style={styles.titles}>
          <ThemedText variant="heading" accessibilityRole="header">
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
            style={[styles.action, { opacity: action.disabled ? 0.5 : 1 }]}
          >
            <ThemedText variant="body" color="primary" style={{ fontFamily: theme.typography.fontFamily.bodyMedium }}>
              {action.label}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 44 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titles: { flex: 1 },
  subtitle: { marginTop: 4 },
  action: { minHeight: 44, justifyContent: 'center' },
});
