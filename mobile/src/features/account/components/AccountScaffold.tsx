/**
 * Phase 8 — shared layout for account/info screens: back button, heading, keyboard-aware scroll,
 * and a centered max-width column so forms stay readable on tablets.
 */
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { AuthFormScroll } from '@/features/auth/components/AuthFormScroll';

export function AccountScaffold({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <ScreenContainer>
      <AuthFormScroll>
        <View style={styles.column}>
          <ScreenHeader title={title} />
          {children}
        </View>
      </AuthFormScroll>
    </ScreenContainer>
  );
}

export function Card({ children }: PropsWithChildren) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card }]}>
      {children}
    </View>
  );
}

export function Notice({ tone, text }: { tone: 'success' | 'error' | 'info'; text: string | null }) {
  const theme = useTheme();
  if (!text) return null;
  const color = tone === 'success' ? theme.colors.success : tone === 'error' ? theme.colors.error : theme.colors.ink;
  return (
    <ThemedText variant="body" accessibilityLiveRegion="polite" accessibilityRole={tone === 'error' ? 'alert' : undefined} style={[styles.notice, { color }]}>
      {text}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  card: { borderWidth: StyleSheet.hairlineWidth * 2, padding: 14, marginBottom: 20 },
  notice: { marginBottom: 12 },
});
