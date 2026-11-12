/**
 * Mobile brand chrome (2026-10-31 reference redesign): deep-navy app bar, light canvas, white cards, orange actions.
 * Navy/orange are the logo colours from `frontend/tailwind.config.js`; the soft tone pairs are tints of the web's
 * status colours (blue-600, green-600, red-600, amber-600, violet-600) used for stat chips, tiles and loss-type pills.
 */
export const brand = {
  navy: '#002A64',
  navyDeep: '#001A42',
  navySoft: '#0B3A7E',
  orange: '#FD4403',
  orangeDeep: '#E23C02',
  canvas: '#F3F5F9',
  card: '#FFFFFF',
  ink: '#0B1F44',
  muted: '#5B6B85',
  line: '#E4E8F0',
  onNavyMuted: '#AFC0DA',
} as const;

export type ToneName = 'blue' | 'orange' | 'green' | 'red' | 'violet' | 'amber' | 'slate' | 'teal';

export const tones: Record<ToneName, { bg: string; fg: string }> = {
  blue: { bg: '#EAF1FF', fg: '#2563EB' },
  orange: { bg: '#FFF0E8', fg: '#FD4403' },
  green: { bg: '#E7F7EE', fg: '#16A34A' },
  red: { bg: '#FDECEC', fg: '#DC2626' },
  violet: { bg: '#F1ECFF', fg: '#7C3AED' },
  amber: { bg: '#FFF5E3', fg: '#D97706' },
  slate: { bg: '#EEF1F6', fg: '#475569' },
  teal: { bg: '#E6F6F6', fg: '#0D9488' },
};

/** Loss-type pill colour (reference: Water = blue, Mold = green, Fire = red, Storm = violet). */
export function lossTone(lossType: string | null | undefined): ToneName {
  const t = (lossType ?? '').toLowerCase();
  if (/water|flood|plumb|leak/.test(t)) return 'blue';
  if (/mold|mould/.test(t)) return 'green';
  if (/fire|smoke/.test(t)) return 'red';
  if (/storm|wind|hail|hurricane|tornado/.test(t)) return 'violet';
  if (/theft|vandal|burglar/.test(t)) return 'amber';
  if (/auto|vehicle|collision/.test(t)) return 'teal';
  return 'slate';
}

export const shadows = {
  card: {
    shadowColor: '#0B1F44',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  lift: {
    shadowColor: '#FD4403',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;
