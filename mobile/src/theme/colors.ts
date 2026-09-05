import type { ColorPalette } from '@/types/theme';

/**
 * Ported from the single source of truth for FlacronAI brand color, which is
 * `frontend/tailwind.config.js` (brandOrange/brandNavy scales) and the light/dark
 * semantic tokens in `frontend/src/index.css` (:root / .dark). Do not invent new
 * brand colors here — if a value is needed that isn't listed in either of those
 * files, confirm the addition there first so web and mobile never diverge.
 */
export const light: ColorPalette = {
  primary: '#FD4403', // brand orange 500
  primaryHover: '#E23C02', // brand orange 600
  primarySoft: '#FFF3EE', // brand orange 50 (--brand-50, light)
  navy: '#002A64', // brand navy 800 (logo navy)
  ink: '#002250', // --color-ink (light)
  background: '#FFFFFF', // --color-bg (light)
  surface: '#F8F8F8', // --color-surface (light)
  border: '#E5E7EB', // --color-border (light)
  muted: '#4B5563', // gray-600 (light)
  success: '#16A34A', // green-600
  warning: '#D97706', // amber-600
  error: '#DC2626', // red-600
  info: '#2563EB', // blue-600
};

export const dark: ColorPalette = {
  primary: '#FD4403',
  primaryHover: '#E23C02',
  primarySoft: '#3A1F14', // --brand-50 (dark)
  navy: '#5585C2', // brand navy 400 — lighter navy reads on dark surfaces
  ink: '#EEF2F8', // --color-ink (dark)
  background: '#0A0A0C', // --color-bg (dark)
  surface: '#131316', // --color-surface (dark)
  border: '#24242B', // --color-border (dark)
  muted: '#A8B1BD', // gray-600 (dark)
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
};
