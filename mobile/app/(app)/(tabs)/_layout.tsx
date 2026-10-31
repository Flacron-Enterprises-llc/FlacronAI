import { Tabs, useRouter } from 'expo-router';

import { BrandTabBar } from '@/components/brand/BrandTabBar';

/**
 * Bottom tabs (reference design): Home (dashboard), Projects (every inspection report), the raised "+" (opens the
 * generate wizard as a stacked screen), Reports (reviewed reports ready to export), and More. Settings stays a routable
 * tab screen (`/settings`) but is reached through More and the side menu.
 *
 * `initialRouteName: 'dashboard'` (not `index`) is deliberate: an `index` route nested two groups deep —
 * `(app)/(tabs)/index` — would resolve to the same `/` pathname as the top-level anchor route `app/index.tsx`.
 */
export default function TabsLayout() {
  const router = useRouter();

  return (
    <Tabs
      initialRouteName="dashboard"
      tabBar={(props) => <BrandTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Home' }} />
      <Tabs.Screen name="reports" options={{ title: 'Projects' }} />
      <Tabs.Screen
        name="generate"
        options={{ title: 'New Inspection', tabBarAccessibilityLabel: 'New Inspection' }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/report/new');
          },
        }}
      />
      <Tabs.Screen name="library" options={{ title: 'Reports' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
    </Tabs>
  );
}
