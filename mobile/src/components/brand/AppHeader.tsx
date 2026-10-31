import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { BrandLogo } from './BrandLogo';
import { useDrawer } from './AppDrawer';

export type HeaderLeft = 'menu' | 'back' | 'none';

interface AppHeaderProps {
  left?: HeaderLeft;
  right?: ReactNode;
}

/** The navy app bar from the reference: menu or back on the left, the FlacronAI logo centred, one action on the right. */
export function AppHeader({ left = 'back', right }: AppHeaderProps) {
  const router = useRouter();
  const drawer = useDrawer();
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {left === 'menu' ? (
          <HeaderButton icon="menu" label="Open menu" onPress={drawer.open} />
        ) : left === 'back' ? (
          <HeaderButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/dashboard'))} />
        ) : null}
      </View>
      <BrandLogo size={22} />
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

export function HeaderButton({ icon, label, onPress }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Icon name={icon} size={23} color="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 },
  side: { width: 52, flexDirection: 'row', alignItems: 'center' },
  right: { justifyContent: 'flex-end' },
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: 'rgba(255,255,255,0.12)' },
});
