import { StyleSheet, View } from 'react-native';

import { BrandMark } from '@/components/BrandMark';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { missingFirebaseConfigKeys } from '@/config/firebaseConfig';

/**
 * Shown instead of the normal auth flow when EXPO_PUBLIC_FIREBASE_* is not populated —
 * this is an EXPECTED state during local development until this app's iOS/Android "app"
 * is registered against the flacronai Firebase project (see
 * AUTHENTICATION_ARCHITECTURE.md §7). A raw crash deep inside the Firebase SDK would be a
 * much worse experience than this explicit, actionable screen.
 */
export function ConfigRequiredScreen() {
  const theme = useTheme();
  const missing = missingFirebaseConfigKeys();

  return (
    <ScreenContainer centered>
      <BrandMark size={72} />
      <ThemedText variant="title" style={styles.title}>
        Configuration required
      </ThemedText>
      <ThemedText variant="body" color="muted" style={styles.body}>
        This app&apos;s Firebase configuration hasn&apos;t been set yet. Copy{' '}
        <ThemedText variant="body" style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
          .env.example
        </ThemedText>{' '}
        to{' '}
        <ThemedText variant="body" style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
          .env.local
        </ThemedText>{' '}
        and fill in the EXPO_PUBLIC_FIREBASE_* values once this app has been registered
        against the flacronai Firebase project.
      </ThemedText>
      <View style={[styles.list, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card }]}>
        {missing.map((key) => (
          <ThemedText key={key} variant="caption" color="muted" style={styles.item}>
            • {key}
          </ThemedText>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: 16,
    textAlign: 'center',
  },
  body: {
    marginTop: 8,
    textAlign: 'center',
  },
  list: {
    marginTop: 20,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignSelf: 'stretch',
  },
  item: {
    marginBottom: 2,
  },
});
