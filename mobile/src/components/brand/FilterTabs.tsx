import { useEffect, useState } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { brand } from '@/theme/brand';

export interface FilterTab {
  key: string;
  label: string;
  /** Server-reported count; omitted while unknown. */
  count?: number | null;
}

/** Reference underline tabs ("All (12)  Active (8)  Completed (3)  Draft (1)") with a sliding orange indicator. */
export function FilterTabs({ tabs, value, onChange }: { tabs: FilterTab[]; value: string; onChange: (key: string) => void }) {
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);

  useEffect(() => {
    const l = layouts[value];
    if (!l) return;
    x.set(withSpring(l.x, { damping: 18, stiffness: 200 }));
    w.set(withSpring(l.width, { damping: 18, stiffness: 200 }));
  }, [layouts, value, x, w]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: w.value }));

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {tabs.map((tab) => {
          const active = tab.key === value;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              onLayout={(e: LayoutChangeEvent) => {
                const { x: lx, width } = e.nativeEvent.layout;
                setLayouts((prev) => (prev[tab.key]?.x === lx && prev[tab.key]?.width === width ? prev : { ...prev, [tab.key]: { x: lx, width } }));
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={styles.tab}
            >
              <Text style={[styles.label, { color: active ? brand.orange : brand.muted, fontFamily: active ? 'Inter_600SemiBold' : 'Inter_500Medium' }]}>
                {tab.label}
                {tab.count != null ? ` (${tab.count})` : ''}
              </Text>
            </Pressable>
          );
        })}
        <Animated.View style={[styles.indicator, indicator]} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1, borderBottomColor: brand.line, marginBottom: 6 },
  row: { paddingRight: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  label: { fontSize: 13.5 },
  indicator: { position: 'absolute', left: 0, bottom: 0, height: 3, borderRadius: 2, backgroundColor: brand.orange },
});
