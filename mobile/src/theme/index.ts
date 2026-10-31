import type { ColorScheme, Theme } from '@/types/theme';
import { dark, light } from './colors';
import { radii, spacing } from './spacing';
import { typography } from './typography';

const buildTheme = (scheme: ColorScheme): Theme => ({
  scheme,
  colors: scheme === 'dark' ? dark : light,
  spacing,
  radii,
  typography,
});

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');

/** The app follows the reference design's light canvas + navy chrome on every device (2026-10-31 redesign); the dark
 * palette stays defined for the web build and future use but is not applied. */
export function useTheme(): Theme {
  return lightTheme;
}

export * from '@/types/theme';
export { brand, tones, lossTone, shadows, type ToneName } from './brand';
