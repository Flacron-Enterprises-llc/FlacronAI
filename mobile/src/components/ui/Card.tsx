import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

interface CardProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}

/** The web `.card` class: surface fill, 1px border, rounded-card (index.css .card). */
export function Card({ children, style, padded = true }: CardProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.card,
        },
        theme.scheme === 'light' && styles.shadow,
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  padded: { padding: 16 },
  shadow: {
    shadowColor: '#0B1F44',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
});
