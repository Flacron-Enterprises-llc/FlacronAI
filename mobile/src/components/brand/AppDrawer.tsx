import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/Icon';
import { useApiResource } from '@/hooks/useApiResource';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { usersApi } from '@/services/api/users';
import { brand } from '@/theme/brand';
import { BrandLogo } from './BrandLogo';
import { ScalePressable } from './ScalePressable';

interface DrawerApi {
  open: () => void;
  close: () => void;
}

const DrawerContext = createContext<DrawerApi>({ open: () => undefined, close: () => undefined });

export function useDrawer(): DrawerApi {
  return useContext(DrawerContext);
}

const TIER_LABEL: Record<string, string> = { starter: 'Starter', professional: 'Professional', agency: 'Agency', enterprise: 'Enterprise' };

interface Item {
  icon: IconName;
  label: string;
  path: string;
}

/** Side menu (reference screen 10): profile, every real app destination, plan upgrade, sign out. Items the account's
 * plan doesn't include (CRM, Organization) are left out, as on the web sidebar. */
export function DrawerProvider({ children }: PropsWithChildren) {
  const [visible, setVisible] = useState(false);
  const progress = useSharedValue(0);

  const open = useCallback(() => {
    setVisible(true);
    progress.set(withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
  }, [progress]);

  const close = useCallback(() => {
    progress.set(
      withTiming(0, { duration: 240, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) runOnJS(setVisible)(false);
      })
    );
  }, [progress]);

  const api = useMemo(() => ({ open, close }), [open, close]);

  return (
    <DrawerContext.Provider value={api}>
      {children}
      <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
        <DrawerPanel progress={progress} onClose={close} />
      </Modal>
    </DrawerContext.Provider>
  );
}

function DrawerPanel({ progress, onClose }: { progress: ReturnType<typeof useSharedValue<number>>; onClose: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(340, width * 0.84);
  const { userProfile, firebaseUser, logout } = useAuth();
  const usage = useApiResource(() => usersApi.getUsage().then((r) => r.usage));
  const tier = usage.data?.tier ?? userProfile?.tier;
  const features = usage.data?.features;

  const scrim = useAnimatedStyle(() => ({ opacity: progress.value * 0.55 }));
  const panel = useAnimatedStyle(() => ({ transform: [{ translateX: (progress.value - 1) * panelWidth }] }));

  const name = userProfile?.displayName || firebaseUser?.displayName || firebaseUser?.email || 'FlacronAI user';
  const email = firebaseUser?.email ?? '';

  const items: Item[] = [
    { icon: 'home', label: 'Home', path: '/dashboard' },
    { icon: 'folder', label: 'Projects', path: '/reports' },
    { icon: 'file-text', label: 'Reports', path: '/library' },
    { icon: 'image', label: 'Photo Library', path: '/photos' },
    ...(features?.crmAccess ? [{ icon: 'users' as const, label: 'Clients & Claims', path: '/crm' }] : []),
    { icon: 'layers', label: 'Templates', path: '/templates' },
    { icon: 'bar-chart-2', label: 'Analytics', path: '/analytics' },
    { icon: 'bell', label: 'Notifications', path: '/notifications' },
    ...(tier === 'enterprise' ? [{ icon: 'briefcase' as const, label: 'Team', path: '/organization' }] : []),
    { icon: 'credit-card', label: 'Usage & Billing', path: '/billing' },
    { icon: 'settings', label: 'Settings', path: '/settings' },
  ];

  const go = (path: string) => {
    onClose();
    setTimeout(() => router.navigate(path as never), 120);
  };

  const signOut = () =>
    Alert.alert('Sign out?', 'You can sign back in with the same FlacronAI account at any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { onClose(); logout(); } },
    ]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      </Animated.View>
      <Animated.View style={[styles.panel, { width: panelWidth, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }, panel]}>
        <View style={styles.top}>
          <BrandLogo size={22} />
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close menu">
            <Icon name="x" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {tier ? <Text style={styles.role}>{TIER_LABEL[tier] ?? tier} plan</Text> : null}
            <Text style={styles.email} numberOfLines={1}>
              {email}
            </Text>
          </View>
        </View>

        <ScrollView style={styles.flex} showsVerticalScrollIndicator={false}>
          {items.map((item) => (
            <Pressable
              key={item.path}
              onPress={() => go(item.path)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <Icon name={item.icon} size={19} color="#FFFFFF" />
              <Text style={styles.itemText}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {tier !== 'enterprise' ? (
          <ScalePressable onPress={() => go('/subscription')} accessibilityRole="button" style={styles.upgrade}>
            <Icon name="award" size={20} color={brand.orange} />
            <Text style={styles.upgradeText}>Upgrade Plan</Text>
            <Icon name="chevron-right" size={20} color="#FFFFFF" />
          </ScalePressable>
        ) : null}

        <Pressable onPress={signOut} accessibilityRole="button" style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}>
          <Icon name="log-out" size={19} color="#FFFFFF" />
          <Text style={styles.itemText}>Sign Out</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  scrim: { backgroundColor: '#000814' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: brand.navyDeep,
    paddingHorizontal: 20,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 18,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.18)',
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: brand.orange,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  avatarText: { color: '#FFFFFF', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22 },
  name: { color: '#FFFFFF', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17 },
  role: { color: brand.onNavyMuted, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 1 },
  email: { color: brand.onNavyMuted, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 46, paddingHorizontal: 6, borderRadius: 12 },
  itemPressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
  itemText: { color: '#FFFFFF', fontFamily: 'Inter_500Medium', fontSize: 15 },
  upgrade: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: brand.orange,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 52,
    marginVertical: 10,
  },
  upgradeText: { flex: 1, color: brand.orange, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16 },
});
