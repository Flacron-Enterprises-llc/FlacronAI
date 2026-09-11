import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { authApi } from '@/services/api/auth';
import { getAuthErrorMessage } from '../utils/errorMessages';
import { isValidEmail } from '../utils/validation';
import { AuthTextInput } from '../components/AuthTextInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { FormError } from '../components/FormError';
import { AuthFormScroll } from '../components/AuthFormScroll';

/**
 * Forgot password — calls the existing `POST /auth/forgot-password`, which always
 * returns success (anti-enumeration; matches `frontend/src/pages/Auth.jsx`'s modal
 * exactly, see AUTHENTICATION_ARCHITECTURE.md §5.5).
 *
 * IMPORTANT LIMITATION (documented, not silently worked around — see
 * AUTHENTICATION_ARCHITECTURE.md §2.3/§7 and the Phase 3 task instructions): the backend
 * generates this link with NO custom `continueUrl` at all, so it uses Firebase's own
 * default hosted password-reset page — not even the FlacronAI web domain, and certainly
 * not a mobile deep link back into this app. The user completes the reset in their
 * device's browser and then returns to this app to sign in with the new password.
 */
export function ForgotPasswordScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (loading) return;
    if (!email) {
      setEmailError('Email is required');
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError('Invalid email');
      return;
    }

    setLoading(true);
    setGeneralError(null);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setGeneralError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer>
    <AuthFormScroll>
      <View style={styles.header}>
        <ThemedText variant="heading">Reset your password</ThemedText>
        <ThemedText variant="body" color="muted" style={styles.subtitle}>
          Enter the email on your account and we&apos;ll send you a reset link. It opens in
          your browser — once you&apos;ve reset your password there, come back here to sign in.
        </ThemedText>
      </View>

      <FormError message={generalError} />

      {sent ? (
        <View
          style={[
            styles.successBox,
            { borderColor: theme.colors.success, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card },
          ]}
        >
          <ThemedText variant="body" style={{ color: theme.colors.success }}>
            If that email exists, a reset link was sent. Check your inbox.
          </ThemedText>
        </View>
      ) : (
        <>
          <AuthTextInput
            label="Email"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setEmailError(undefined);
            }}
            error={emailError}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@company.com"
          />
          <PrimaryButton label="Send reset link" onPress={handleSubmit} loading={loading} />
        </>
      )}

      <Link href="/login" asChild>
        <Pressable style={styles.backLink}>
          <ThemedText variant="body" color="primary">
            ← Back to sign in
          </ThemedText>
        </Pressable>
      </Link>
    </AuthFormScroll>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 24,
  },
  subtitle: {
    marginTop: 8,
  },
  successBox: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 14,
    marginBottom: 20,
  },
  backLink: {
    alignSelf: 'center',
    marginTop: 24,
  },
});
