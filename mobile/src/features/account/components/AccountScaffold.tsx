/**
 * Phase 8 — shared layout for account/info screens: back button, heading, keyboard-aware scroll,
 * and a centered max-width column so forms stay readable on tablets.
 */
import { useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { AuthFormScroll } from '@/features/auth/components/AuthFormScroll';

export function AccountScaffold({ title, children }: PropsWithChildren<{ title: string }>) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <ScreenContainer>
      <AuthFormScroll>
        <View style={styles.column}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={8}
            style={styles.back}
          >
            <ThemedText variant="body" style={{ color: theme.colors.primary }}>
              ‹ Back
            </ThemedText>
          </Pressable>
          <ThemedText variant="heading" accessibilityRole="header" style={styles.heading}>
            {title}
          </ThemedText>
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
  back: { paddingVertical: 10, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  heading: { marginBottom: 16 },
  card: { borderWidth: StyleSheet.hairlineWidth * 2, padding: 14, marginBottom: 20 },
  notice: { marginBottom: 12 },
});
