import type { Radii, Spacing } from '@/types/theme';

export const spacing: Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

/** rounded-btn (0.75rem) / rounded-card (1rem) from frontend/tailwind.config.js, at a 16px root. */
export const radii: Radii = {
  btn: 12,
  card: 16,
};
