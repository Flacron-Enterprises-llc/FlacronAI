import { Easing } from 'react-native-reanimated';

/**
 * Shared motion tokens. Everything uses eased timing (no springs), so nothing
 * overshoots or bounces: short, quiet transitions read as professional.
 */
export const motion = {
  /** Press feedback on cards/buttons. */
  press: { duration: 110, easing: Easing.out(Easing.quad) },
  /** Release back to rest. */
  release: { duration: 160, easing: Easing.out(Easing.quad) },
  /** Indicator / selection moves (tab underline, active tab). */
  move: { duration: 220, easing: Easing.out(Easing.cubic) },
  /** Screen content entering. */
  enter: { duration: 260, easing: Easing.out(Easing.cubic) },
  /** Per-item stagger for lists of cards/tiles (capped by callers). */
  stagger: 30,
  /** How far entering content rises, in px. */
  rise: 8,
} as const;
