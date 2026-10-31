import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { useTheme } from '@/theme';

export type IconName = ComponentProps<typeof Feather>['name'];

interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorValue;
}

/**
 * Feather glyphs: lucide (the web's icon set, lucide-react) is a fork of Feather, so the
 * shapes match the web dashboard without bundling an SVG renderer. Decorative by default;
 * the surrounding control carries the accessible label.
 */
export function Icon({ name, size = 18, color }: IconProps) {
  const theme = useTheme();
  return (
    <Feather
      name={name}
      size={size}
      color={color ?? theme.colors.ink}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

export const iconFont = Feather.font;
