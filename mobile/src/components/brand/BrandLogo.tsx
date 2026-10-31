import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { brand } from '@/theme/brand';

interface BrandLogoProps {
  /** Wordmark font size; the mark scales with it. */
  size?: number;
  /** `light` = white "Flacron" for navy/photo backgrounds, `dark` = navy "Flacron" for light backgrounds. */
  tone?: 'light' | 'dark';
}

/** FA mark + "FlacronAI" wordmark ("AI" in brand orange), built from the real logo assets. */
export function BrandLogo({ size = 22, tone = 'light' }: BrandLogoProps) {
  const mark = tone === 'light' ? require('@/assets/images/brand-mark-light.png') : require('@/assets/images/brand-mark.png');
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel="FlacronAI">
      <Image source={mark} style={{ width: size * 1.35, height: size * 1.35 }} contentFit="contain" />
      <Text style={[styles.word, { fontSize: size, color: tone === 'light' ? '#FFFFFF' : brand.navy }]}>
        Flacron<Text style={{ color: brand.orange }}>AI</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  word: { fontFamily: 'SpaceGrotesk_700Bold', letterSpacing: -0.3, includeFontPadding: false },
});
