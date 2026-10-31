import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { brand } from '@/theme/brand';
import { HeaderButton } from './AppHeader';
import { BrandLogo } from './BrandLogo';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  /** Show a back arrow (to the welcome screen when there is no history). */
  back?: boolean;
}

/** Sign-in / sign-up / recovery layout: the welcome photo under a navy gradient with the logo and title, and the form on
 * a white sheet that rises over it. */
export function AuthShell({ title, subtitle, back = true, children }: PropsWithChildren<AuthShellProps>) {
  const router = useRouter();
  return (
    <View style={styles.fill}>
      <Image source={require('@/assets/images/welcome-hero.jpg')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient colors={['rgba(0,26,66,0.82)', 'rgba(0,26,66,0.92)', brand.navyDeep]} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
          <SafeAreaView edges={['top']}>
            <View style={styles.topBar}>
              {back ? (
                <HeaderButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))} />
              ) : (
                <View style={styles.spacer} />
              )}
            </View>
            <Animated.View entering={FadeInUp.duration(500)} style={styles.hero}>
              <BrandLogo size={28} />
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </Animated.View>
          </SafeAreaView>
          <Animated.View entering={FadeInDown.delay(120).duration(520).springify().damping(18)} style={styles.sheet}>
            <SafeAreaView edges={['bottom']}>{children}</SafeAreaView>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: brand.navyDeep },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  topBar: { height: 52, paddingHorizontal: 8, justifyContent: 'center' },
  spacer: { height: 44 },
  hero: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 28, paddingTop: 4 },
  title: { color: '#FFFFFF', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 26, marginTop: 18, textAlign: 'center' },
  subtitle: { color: brand.onNavyMuted, fontFamily: 'Inter_400Regular', fontSize: 14.5, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  sheet: {
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 16,
  },
});
