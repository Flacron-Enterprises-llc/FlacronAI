import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

interface ScreenContainerProps extends PropsWithChildren {
  centered?: boolean;
}

/** Themed, safe-area-aware page wrapper used by every route in app/. */
export function ScreenContainer({ children, centered = false }: ScreenContainerProps) {
  const theme = useTheme();

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      <SafeAreaView style={styles.fill}>
        <View
          style={[
            styles.content,
            { padding: theme.spacing.lg },
            centered && styles.centered,
          ]}
        >
          {children}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
