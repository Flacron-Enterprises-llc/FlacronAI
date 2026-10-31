import { Tabs, useRouter } from 'expo-router';
import type { ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { useTheme } from '@/theme';

function tabIcon(name: IconName) {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Icon name={name} color={color} size={size} />;
  }
  return TabIcon;
}

/**
 * Bottom tabs = the web dashboard sidebar adapted for touch: Dashboard, My Reports, Generate Report (opens the wizard as
 * a stacked screen), and More (Templates, Analytics, Usage & Billing, Settings, Help, web-only tools). Settings stays a
 * routable tab screen (`/settings`) but is reached through More, like the web sidebar's lower section.
 *
 * `initialRouteName: 'dashboard'` (not `index`) is deliberate: an `index` route nested two groups deep —
 * `(app)/(tabs)/index` — would resolve to the same `/` pathname as the top-level anchor route `app/index.tsx`.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarLabelStyle: { fontFamily: theme.typography.fontFamily.bodyMedium, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
        },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: tabIcon('grid') }} />
      <Tabs.Screen name="reports" options={{ title: 'My Reports', tabBarIcon: tabIcon('file-text') }} />
      <Tabs.Screen
        name="generate"
        options={{ title: 'Generate', tabBarIcon: tabIcon('zap'), tabBarAccessibilityLabel: 'Generate Report' }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/report/new');
          },
        }}
      />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon('menu') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
    </Tabs>
  );
}
