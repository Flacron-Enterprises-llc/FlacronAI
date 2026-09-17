import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';

interface StateMessageProps {
  title: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

/** Shared loading/empty/error placeholder — every list/detail screen in Phase 5 uses this
 * instead of hand-rolling its own centered-message layout. */
export function StateMessage({ title, description, retryLabel = 'Try again', onRetry }: StateMessageProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <ThemedText variant="subtitle" style={styles.title}>
        {title}
      </ThemedText>
      {!!description && (
        <ThemedText variant="body" color="muted" style={styles.description}>
          {description}
        </ThemedText>
      )}
      {!!onRetry && (
        <View style={[styles.retry, { marginTop: theme.spacing.md }]}>
          <PrimaryButton label={retryLabel} onPress={onRetry} variant="secondary" />
        </View>
      )}
    </View>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={theme.colors.primary} />
      {!!label && (
        <ThemedText variant="body" color="muted" style={styles.description}>
          {label}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
    marginTop: 6,
  },
  retry: {
    minWidth: 160,
  },
});
