import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { useAuth } from '../context/AuthProvider';
import { authApi } from '@/services/api/auth';
import { getAuthErrorMessage } from '../utils/errorMessages';
import { AuthTextInput } from '../components/AuthTextInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { FormError } from '../components/FormError';

/**
 * TOTP / recovery-code challenge for MFA-enabled accounts — reached only via the
 * verified `POST /auth/mfa/verify` gate (already-authenticated-session, proven by real
 * web traffic), NOT the untested `mfaRequired`/`/auth/mfa/login-verify` pre-session
 * challenge (see AUTHENTICATION_ARCHITECTURE.md §1/§4/§5.11). A valid Firebase session
 * already exists at this point; this only confirms possession of the second factor
 * before the route guard unlocks the app shell.
 *
 * `mfaVerified` lives in AuthProvider's React state only (never persisted) — mirrors
 * `AuthContext.jsx`'s `mfaVerified` exactly, so merely re-opening the app never skips
 * this gate; only a fresh, successful verification does.
 */
export function MfaScreen() {
  const theme = useTheme();
  const { markMfaVerified, logout } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const normalizedLength = code.replace(/[^a-z0-9]/gi, '').length;
  const canSubmit = normalizedLength >= 6;

  const handleSubmit = async () => {
    if (loading || !canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const result = await authApi.mfaVerify(code);
      markMfaVerified(result.mfaAssertion);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer centered>
      <View style={[styles.iconCircle, { backgroundColor: theme.colors.primarySoft }]}>
        <ThemedText variant="title">🔐</ThemedText>
      </View>
      <ThemedText variant="title" style={styles.title}>
        Two-factor authentication
      </ThemedText>
      <ThemedText variant="body" color="muted" style={styles.body}>
        Enter the 6-digit code from your authenticator app, or a recovery code.
      </ThemedText>

      <FormError message={error} />

      <View style={styles.field}>
        <AuthTextInput
          label="Authentication code"
          value={code}
          onChangeText={(v) => {
            setCode(v.replace(/[^a-z0-9-]/gi, '').toUpperCase());
            setError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={17}
          textContentType="oneTimeCode"
          placeholder="000000 or XXXXXXXX-XXXXXXXX"
        />
      </View>

      <PrimaryButton label="Verify" onPress={handleSubmit} loading={loading} disabled={!canSubmit} />

      <PrimaryButton variant="secondary" label="Sign in with a different account" onPress={() => logout()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    marginTop: 8,
    textAlign: 'center',
  },
  body: {
    marginTop: 8,
    marginBottom: 24,
    textAlign: 'center',
  },
  field: {
    alignSelf: 'stretch',
  },
});
