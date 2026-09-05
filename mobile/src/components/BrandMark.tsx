import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

interface BrandMarkProps {
  size?: number;
}

/**
 * The FlacronAI mark, rasterized from the real brand vector source
 * (frontend/public/logo-mark.svg — navy #002A64 + orange #FD4403). Do not replace
 * with a different asset without confirming against that source file first.
 */
export function BrandMark({ size = 96 }: BrandMarkProps) {
  return (
    <Image
      source={require('@/assets/images/brand-mark.png')}
      style={[styles.image, { width: size, height: size }]}
      contentFit="contain"
      accessibilityLabel="FlacronAI"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    alignSelf: 'center',
  },
});
