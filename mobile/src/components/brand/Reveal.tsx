import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

interface RevealProps {
  /** Position in a staggered group: each step waits a little longer. */
  index?: number;
  delay?: number;
  from?: 'below' | 'above';
  style?: StyleProp<ViewStyle>;
}

/** Fades content in with a short spring rise; used to stagger cards, tiles and list rows as a screen mounts. */
export function Reveal({ children, index = 0, delay = 0, from = 'below', style }: PropsWithChildren<RevealProps>) {
  const base = from === 'below' ? FadeInDown : FadeInUp;
  const entering = base.delay(delay + Math.min(index, 12) * 55).duration(420).springify().damping(18);
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
