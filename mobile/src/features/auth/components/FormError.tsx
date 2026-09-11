import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';

/** A single, sanitized error banner — screens pass an already-safe message from
 * `errorMessages.ts`, never a raw SDK/HTTP error. */
export function FormError({ message }: { message: string | null }) {
  const theme = useTheme();
  if (!message) return null;

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.error, borderRadius: theme.radii.card },
      ]}
    >
      <ThemedText variant="caption" style={{ color: theme.colors.error }}>
        {message}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 12,
    marginBottom: 16,
  },
});
