import { useColorScheme } from 'react-native';

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

/** Resolves the active theme from the device color scheme, defaulting to light. */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkTheme : lightTheme;
}

export * from '@/types/theme';
