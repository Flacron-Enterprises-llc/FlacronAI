import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { BrandMark } from '@/components/BrandMark';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { useAuth } from '../context/AuthProvider';
import { validateLogin, type LoginValidationErrors } from '../utils/validation';
import { getAuthErrorMessage } from '../utils/errorMessages';
import { AuthTextInput } from '../components/AuthTextInput';
import { PasswordInput } from '../components/PasswordInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { FormError } from '../components/FormError';
import { SocialSignInButtons } from '../components/SocialSignInButtons';
import { AuthFormScroll } from '../components/AuthFormScroll';

/**
 * Email/password login. Verified users continue into the app automatically once
 * `AuthProvider`'s derived `status` updates (the root layout's route guards react to
 * that, not this screen) — unverified users land on `verify-email`, MFA-enabled accounts
 * land on `mfa`, both driven the same way. See AUTHENTICATION_ARCHITECTURE.md §5.3/§5.4.
 */
export function LoginScreen() {
  const theme = useTheme();
  const { login, loginWithGoogle, loginWithApple } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<LoginValidationErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);

  const handleSubmit = async () => {
    if (loading) return; // prevents a duplicate submit while a request is already in flight
    const validation = validateLogin({ email, password });
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setLoading(true);
    setGeneralError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setGeneralError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (socialLoading) return;
    setSocialLoading(true);
    setGeneralError(null);
    try {
      await loginWithGoogle();
    } catch (err) {
      setGeneralError(getAuthErrorMessage(err));
    } finally {
      setSocialLoading(false);
    }
  };

  const handleApple = async () => {
    if (socialLoading) return;
    setSocialLoading(true);
    setGeneralError(null);
    try {
      await loginWithApple();
    } catch (err) {
      setGeneralError(getAuthErrorMessage(err));
    } finally {
      setSocialLoading(false);
    }
  };

  return (
    <ScreenContainer>
    <AuthFormScroll>
      <View style={styles.header}>
        <BrandMark size={64} />
        <ThemedText variant="heading" style={styles.title}>
          Welcome back
        </ThemedText>
        <ThemedText variant="body" color="muted" style={styles.subtitle}>
          Sign in to your FlacronAI account
        </ThemedText>
      </View>

      <FormError message={generalError} />

      <AuthTextInput
        label="Email"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          setErrors((e) => ({ ...e, email: undefined }));
        }}
        error={errors.email}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@company.com"
      />
      <PasswordInput
        label="Password"
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          setErrors((e) => ({ ...e, password: undefined }));
        }}
        error={errors.password}
        textContentType="password"
        placeholder="••••••••••••"
      />

      <Link href="/forgot-password" asChild>
        <Pressable style={styles.forgotLink}>
          <ThemedText variant="caption" color="primary">
            Forgot password?
          </ThemedText>
        </Pressable>
      </Link>

      <PrimaryButton label="Sign in" onPress={handleSubmit} loading={loading} disabled={socialLoading} />

      <SocialSignInButtons onGoogle={handleGoogle} onApple={handleApple} loading={socialLoading} />

      <View style={styles.footer}>
        <ThemedText variant="body" color="muted">
          Don&apos;t have an account?{' '}
        </ThemedText>
        <Link href="/signup" asChild>
          <Pressable>
            <ThemedText variant="body" color="primary" style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
              Sign up
            </ThemedText>
          </Pressable>
        </Link>
      </View>
    </AuthFormScroll>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    marginTop: 12,
  },
  subtitle: {
    marginTop: 4,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginBottom: 20,
    marginTop: -8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
});
