import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand/BrandLogo';
import { ScalePressable } from '@/components/brand/ScalePressable';
import { Icon, type IconName } from '@/components/ui/Icon';
import { brand } from '@/theme/brand';

/** What the app actually does, rotated under the headline (no claims beyond the product's real features). */
const HIGHLIGHTS: { icon: IconName; text: string }[] = [
  { icon: 'camera', text: 'Capture inspection photos on site' },
  { icon: 'cpu', text: 'Super Intelligence drafts the report' },
  { icon: 'check-circle', text: 'You review and approve every finding' },
  { icon: 'download', text: 'Export PDF or DOCX and share' },
];

/** Signed-out landing (reference screen 1): photo hero with a slow zoom, brand, headline, Get Started / Sign In. */
export function WelcomeScreen() {
  const router = useRouter();
  const zoom = useSharedValue(1);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    zoom.set(withRepeat(withTiming(1.12, { duration: 14000, easing: Easing.inOut(Easing.quad) }), -1, true));
    const t = setInterval(() => setHighlight((i) => (i + 1) % HIGHLIGHTS.length), 2600);
    return () => clearInterval(t);
  }, [zoom]);

  const heroStyle = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));
  const item = HIGHLIGHTS[highlight];

  return (
    <View style={styles.fill}>
      <Animated.View style={[StyleSheet.absoluteFill, heroStyle]}>
        <Image source={require('@/assets/images/welcome-hero.jpg')} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} />
      </Animated.View>
      <LinearGradient
        colors={['rgba(0,26,66,0.78)', 'rgba(0,26,66,0.15)', 'rgba(0,26,66,0.55)', 'rgba(0,20,52,0.97)']}
        locations={[0, 0.3, 0.55, 0.82]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.flex}>
        <Animated.View entering={FadeInDown.duration(600)} style={styles.brand}>
          <BrandLogo size={36} />
          <Text style={styles.tagline}>INSPECT • DOCUMENT • ESTIMATE • RESOLVE</Text>
        </Animated.View>

        <View style={styles.bottom}>
          <Animated.Text entering={FadeInDown.delay(250).duration(600)} style={styles.headline}>
            Smarter Inspections.{'\n'}Faster Claims.{'\n'}
            <Text style={styles.accent}>Greater Results.</Text>
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(400).duration(600)} style={styles.body}>
            The all-in-one platform for insurance inspections, documentation and restoration workflows.
          </Animated.Text>

          <View style={styles.highlightSlot}>
            <Animated.View key={highlight} entering={FadeIn.duration(350)} exiting={FadeOut.duration(250)} style={styles.highlight}>
              <Icon name={item.icon} size={16} color={brand.orange} />
              <Text style={styles.highlightText}>{item.text}</Text>
            </Animated.View>
          </View>

          <Animated.View entering={FadeInDown.delay(550).duration(600)}>
            <ScalePressable onPress={() => router.push('/signup')} accessibilityRole="button" style={[styles.primary]}>
              <Text style={styles.primaryText}>Get Started</Text>
              <Icon name="arrow-right" size={20} color="#FFFFFF" />
            </ScalePressable>
            <ScalePressable onPress={() => router.push('/login')} accessibilityRole="button" style={styles.secondary}>
              <Text style={styles.secondaryText}>Sign In</Text>
            </ScalePressable>
            <Text style={styles.note}>Use the same account you use on flacronai.com — same reports, same plan.</Text>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: brand.navyDeep },
  flex: { flex: 1 },
  brand: { alignItems: 'center', marginTop: 28, gap: 10 },
  tagline: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 11.5, letterSpacing: 1.6 },
  bottom: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 26, paddingBottom: 18 },
  headline: { color: '#FFFFFF', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 34, lineHeight: 40, textAlign: 'center' },
  accent: { color: brand.orange },
  body: { color: '#E1E8F3', fontFamily: 'Inter_400Regular', fontSize: 15.5, lineHeight: 22, textAlign: 'center', marginTop: 14 },
  highlightSlot: { height: 40, alignItems: 'center', justifyContent: 'center', marginTop: 14, marginBottom: 14 },
  highlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  highlightText: { color: '#FFFFFF', fontFamily: 'Inter_500Medium', fontSize: 13 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: brand.orange,
    minHeight: 56,
    borderRadius: 16,
    shadowColor: brand.orange,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  primaryText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 17 },
  secondary: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  secondaryText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 17 },
  note: { color: '#B9C6DA', fontFamily: 'Inter_400Regular', fontSize: 12.5, textAlign: 'center', marginTop: 16, lineHeight: 18 },
});
