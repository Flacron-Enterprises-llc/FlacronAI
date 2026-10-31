import type { Tabs } from 'expo-router';
import { useEffect, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/Icon';
import { brand, shadows } from '@/theme/brand';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Visible tabs in reference order; `generate` is the raised orange "+" in the middle. */
const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'dashboard', label: 'Home', icon: 'home' },
  { name: 'reports', label: 'Projects', icon: 'folder' },
  { name: 'generate', label: 'New', icon: 'plus' },
  { name: 'library', label: 'Reports', icon: 'file-text' },
  { name: 'more', label: 'More', icon: 'more-horizontal' },
];

/** Reference bottom bar: Home, Projects, the floating orange "+" (new inspection), Reports, More. */
export function BrandTabBar({ state, navigation, descriptors }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name;

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((tab) => {
        const route = state.routes.find((r) => r.name === tab.name);
        if (!route) return null;
        const focused = activeName === tab.name;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        const label = descriptors[route.key]?.options.tabBarAccessibilityLabel ?? tab.label;
        if (tab.name === 'generate') return <CenterButton key={tab.name} onPress={onPress} label={label} />;
        return <TabItem key={tab.name} tab={tab} focused={focused} onPress={onPress} label={label} />;
      })}
    </View>
  );
}

function TabItem({ tab, focused, onPress, label }: { tab: (typeof TABS)[number]; focused: boolean; onPress: () => void; label: string }) {
  const lift = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    lift.set(withSpring(focused ? 1 : 0, { damping: 14, stiffness: 220 }));
  }, [focused, lift]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -2 * lift.value }, { scale: 1 + 0.08 * lift.value }] }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: lift.value, transform: [{ scaleX: lift.value }] }));
  const color = focused ? brand.orange : '#7A879C';
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label} style={styles.item}>
      <Animated.View style={iconStyle}>
        <Icon name={tab.icon} size={22} color={color} />
      </Animated.View>
      <Text style={[styles.label, { color, fontFamily: focused ? 'Inter_600SemiBold' : 'Inter_500Medium' }]}>{tab.label}</Text>
      <Animated.View style={[styles.dot, dotStyle]} />
    </Pressable>
  );
}

function CenterButton({ onPress, label }: { onPress: () => void; label: string }) {
  const scale = useSharedValue(1);
  const spin = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { rotate: `${spin.value * 90}deg` }] }));
  return (
    <View style={styles.centerSlot}>
      <Pressable
        onPress={() => {
          spin.set(withSequence(withTiming(1, { duration: 180 }), withTiming(0, { duration: 0 })));
          onPress();
        }}
        onPressIn={() => scale.set(withSpring(0.9, { damping: 16, stiffness: 400 }))}
        onPressOut={() => scale.set(withSpring(1, { damping: 10, stiffness: 260 }))}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={6}
      >
        <Animated.View style={[styles.fab, shadows.lift, style]}>
          <Icon name="plus" size={32} color="#FFFFFF" />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    paddingHorizontal: 6,
    shadowColor: '#0B1F44',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: 52, gap: 3 },
  label: { fontSize: 11 },
  dot: { width: 18, height: 3, borderRadius: 2, backgroundColor: brand.orange, marginTop: 2 },
  centerSlot: { flex: 1, alignItems: 'center' },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: brand.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -30,
    marginBottom: 10,
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
});
