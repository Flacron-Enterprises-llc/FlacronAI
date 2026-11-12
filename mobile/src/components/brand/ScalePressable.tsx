import type { PropsWithChildren } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { motion } from '@/theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ScalePressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** How far the control sinks while pressed (1 = no motion). */
  pressScale?: number;
}

/** Pressable with a subtle eased "sink" on touch (no spring bounce) — the feedback every tappable card, tile and button uses. */
export function ScalePressable({ children, style, pressScale = 0.98, onPressIn, onPressOut, disabled, ...rest }: PropsWithChildren<ScalePressableProps>) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        scale.set(withTiming(pressScale, motion.press));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withTiming(1, motion.release));
        onPressOut?.(e);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
