import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';

import { useTheme } from '@/theme';

type Variant = 'heading' | 'title' | 'subtitle' | 'body' | 'caption';

interface ThemedTextProps extends TextProps, PropsWithChildren {
  variant?: Variant;
  color?: 'ink' | 'muted' | 'primary';
}

/** Text with FlacronAI's font pairing (Space Grotesk display / Inter body) pre-applied. */
export function ThemedText({
  variant = 'body',
  color = 'ink',
  style,
  children,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();
  const isDisplay = variant === 'heading' || variant === 'title';

  return (
    <Text
      style={[
        {
          color: theme.colors[color],
          fontFamily: isDisplay ? theme.typography.fontFamily.display : theme.typography.fontFamily.body,
          fontSize: theme.typography.size[variant],
        },
        styles.base,
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});
