import { Tabs } from 'expo-router';

import { useTheme } from '@/theme';

/**
 * Phase 5 — Core Dashboard Feature Parity. Text-only tab labels: no icon library
 * (`@expo/vector-icons` or similar) is installed anywhere in this app yet, and adding one
 * solely for three tab-bar glyphs would be exactly the kind of unrelated dependency Phase 5's
 * scope excludes — every other screen in this app (including every auth screen) is icon-free
 * too, so this matches the app's existing visual language rather than introducing a new one.
 *
 * `initialRouteName: 'dashboard'` (not `index`) is deliberate: an `index` route nested two
 * groups deep — `(app)/(tabs)/index` — would resolve to the same `/` pathname as the
 * top-level anchor route `app/index.tsx` (group segments are stripped from the URL). Naming
 * it `dashboard` avoids that collision outright instead of relying on navigator-nesting
 * disambiguation.
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
        },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
