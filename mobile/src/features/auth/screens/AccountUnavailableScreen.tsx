import { StyleSheet } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useAuth } from '../context/AuthProvider';
import { PrimaryButton } from '../components/PrimaryButton';
import { FormError } from '../components/FormError';

/**
 * Shown when Firebase auth succeeded but the backend profile fetch failed (mirrors
 * `ProtectedRoute.jsx`'s inline "Account data unavailable" card exactly — a real,
 * previously-live incident class, see `backend/middleware/auth.js`'s extensive comments
 * on 503 AUTH_VERIFY_UNAVAILABLE/PROFILE_LOOKUP_FAILED). A signed-in user with a broken
 * profile fetch must land somewhere real, not loop back through a guarded-away /login.
 */
export function AccountUnavailableScreen() {
  const { profileError, retryProfile, logout } = useAuth();

  return (
    <ScreenContainer centered>
      <ThemedText variant="title" style={styles.title}>
        Account data unavailable
      </ThemedText>
      <FormError message={profileError || 'Your account data has not loaded yet.'} />
      <PrimaryButton label="Retry loading" onPress={() => retryProfile()} />
      <PrimaryButton variant="secondary" label="Sign out" onPress={() => logout()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: 12,
    textAlign: 'center',
  },
});
