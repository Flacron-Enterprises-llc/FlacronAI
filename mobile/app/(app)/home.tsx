import { StyleSheet, View } from 'react-native';

import { BrandMark } from '@/components/BrandMark';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';

/**
 * PLACEHOLDER protected home — Phase 3 stops here by design (its own scope boundary is
 * "any dashboard data fetch beyond a logged-in confirmation call" is out of scope; see
 * MOBILE_DEVELOPMENT_PHASES.md Phase 3 / Phase 5). Confirms the full auth chain worked
 * (Firebase session + backend profile fetch) without starting real dashboard work.
 */
export default function AppHomeScreen() {
  const theme = useTheme();
  const { userProfile, firebaseUser, logout } = useAuth();

  const displayName = userProfile?.displayName || firebaseUser?.displayName || firebaseUser?.email || 'there';

  return (
    <ScreenContainer centered>
      <BrandMark size={80} />
      <ThemedText variant="heading" style={styles.title}>
        Welcome, {displayName}
      </ThemedText>
      <ThemedText variant="body" color="muted" style={styles.subtitle}>
        You&apos;re signed in to FlacronAI.
      </ThemedText>

      <View
        style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card }]}
      >
        <ThemedText variant="caption" color="muted">
          Email
        </ThemedText>
        <ThemedText variant="body" style={styles.cardValue}>
          {firebaseUser?.email}
        </ThemedText>
        <ThemedText variant="caption" color="muted" style={styles.cardLabelSpaced}>
          Plan
        </ThemedText>
        <ThemedText variant="body" style={styles.cardValue}>
          {userProfile?.tier ?? 'starter'}
        </ThemedText>
      </View>

      <View style={styles.signOut}>
        <PrimaryButton variant="secondary" label="Sign out" onPress={() => logout()} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 20,
  },
  card: {
    alignSelf: 'stretch',
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 16,
  },
  cardValue: {
    marginTop: 2,
  },
  cardLabelSpaced: {
    marginTop: 12,
  },
  signOut: {
    alignSelf: 'stretch',
    marginTop: 24,
  },
});
