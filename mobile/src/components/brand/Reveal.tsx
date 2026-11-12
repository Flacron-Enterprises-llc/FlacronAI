import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { motion } from '@/theme/motion';

interface RevealProps {
  /** Position in a staggered group: each step waits a little longer. */
  index?: number;
  delay?: number;
  from?: 'below' | 'above';
  style?: StyleProp<ViewStyle>;
}

/** Fades content in with a short, eased rise (no spring/overshoot); used to stagger cards, tiles and list rows as a screen mounts. */
export function Reveal({ children, index = 0, delay = 0, from = 'below', style }: PropsWithChildren<RevealProps>) {
  const base = from === 'below' ? FadeInDown : FadeInUp;
  const entering = base
    .delay(delay + Math.min(index, 8) * motion.stagger)
    .duration(motion.enter.duration)
    .easing(motion.enter.easing)
    .withInitialValues({ opacity: 0, transform: [{ translateY: from === 'below' ? motion.rise : -motion.rise }] });
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
