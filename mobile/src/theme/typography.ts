import type { TypographyScale } from '@/types/theme';

/**
 * Font pairing matches frontend/tailwind.config.js: Space Grotesk for headings
 * (`font-display`), Inter for body (`font-sans`). Loaded via @expo-google-fonts/*
 * in app/_layout.tsx — these string values must match the exported constant names
 * from those packages exactly, or React Native will silently fall back to the
 * platform default font.
 */
export const typography: TypographyScale = {
  fontFamily: {
    display: 'SpaceGrotesk_700Bold',
    displayMedium: 'SpaceGrotesk_500Medium',
    body: 'Inter_400Regular',
    bodyMedium: 'Inter_500Medium',
    bodySemiBold: 'Inter_600SemiBold',
  },
  size: {
    caption: 12,
    body: 15,
    subtitle: 17,
    title: 22,
    heading: 28,
  },
};
