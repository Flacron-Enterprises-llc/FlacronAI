import { useSegments } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader, type HeaderLeft } from '@/components/brand/AppHeader';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { useTheme } from '@/theme';
import { brand } from '@/theme/brand';

interface ScreenContainerProps extends PropsWithChildren {
  centered?: boolean;
  /** `app` (default) = navy logo bar over a rounded light canvas; `none` = bare canvas (full-bleed custom screens). */
  chrome?: 'app' | 'none';
  /** Header left control; defaults to the menu on tab roots and back everywhere else. */
  headerLeft?: HeaderLeft;
  /** Header right control; defaults to the notification bell on tab roots. */
  headerRight?: ReactNode;
  /** Edge-to-edge content (lists that manage their own gutters). */
  flush?: boolean;
}

/** Themed, safe-area-aware page wrapper used by every route in app/: the reference design's navy app bar with the
 * FlacronAI logo, and the page on a light canvas whose top corners round over the bar. */
export function ScreenContainer({ children, centered = false, chrome = 'app', headerLeft, headerRight, flush = false }: ScreenContainerProps) {
  const theme = useTheme();
  const segments = useSegments() as string[];
  const isTabRoot = segments.includes('(tabs)');
  const left = headerLeft ?? (isTabRoot ? 'menu' : 'back');
  const right = headerRight ?? (isTabRoot ? <NotificationBell onNavy /> : null);

  const content = (
    <View
      style={[
        styles.content,
        { paddingHorizontal: flush ? 0 : theme.spacing.md, paddingTop: theme.spacing.md },
        centered && styles.centered,
      ]}
    >
      {children}
    </View>
  );

  if (chrome === 'none') {
    return (
      <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
        <SafeAreaView style={styles.fill}>{content}</SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: brand.navy }]}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <AppHeader left={left} right={right} />
      </SafeAreaView>
      <View style={[styles.sheet, { backgroundColor: theme.colors.background }]}>
        <SafeAreaView edges={isTabRoot ? [] : ['bottom']} style={styles.fill}>
          {content}
        </SafeAreaView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { backgroundColor: brand.navy },
  sheet: { flex: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  content: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
});
