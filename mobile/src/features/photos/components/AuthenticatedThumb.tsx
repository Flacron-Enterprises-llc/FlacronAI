import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import type { BinaryResponse } from '@/services/api/client';
import { useAuthenticatedPhoto } from '../hooks/useAuthenticatedPhoto';

interface AuthenticatedThumbProps {
  scope: string;
  cacheKey: string;
  fetcher: () => Promise<BinaryResponse>;
  style?: StyleProp<ViewStyle>;
}

/** A thumbnail loaded through the authenticated photo proxy, with explicit loading, failed
 * (tap to retry), and loaded states — a failed fetch never spins forever. */
export function AuthenticatedThumb({ scope, cacheKey, fetcher, style }: AuthenticatedThumbProps) {
  const theme = useTheme();
  const { uri, loading, error, reload } = useAuthenticatedPhoto(scope, cacheKey, fetcher);

  if (uri) {
    // `cachePolicy="none"`: the cache file path is stable per photo, so expo-image's own cache
    // could otherwise keep showing a previous file's pixels after a re-fetch.
    return <Image source={{ uri }} style={[styles.fill, style as object]} contentFit="cover" cachePolicy="none" />;
  }

  if (error && !loading) {
    return (
      <Pressable
        onPress={reload}
        accessibilityRole="button"
        accessibilityLabel="Photo failed to load. Tap to retry."
        style={[styles.fill, styles.center, { backgroundColor: theme.colors.surface }, style]}
      >
        <ThemedText variant="caption" color="muted" style={styles.text}>
          Couldn’t load
        </ThemedText>
        <ThemedText variant="caption" style={[styles.text, { color: theme.colors.primary }]}>
          Retry
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <View style={[styles.fill, styles.center, style]} accessibilityLabel="Loading photo">
      <ActivityIndicator size="small" />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 11,
    textAlign: 'center',
  },
});
