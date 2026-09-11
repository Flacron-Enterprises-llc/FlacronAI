import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { useAuth } from '../context/AuthProvider';
import { usersApi } from '@/services/api/users';
import { authApi } from '@/services/api/auth';
import { REGISTRATION_POLICY_VERSION } from '../constants';
import { validateSignUp, PASSWORD_REQUIREMENTS_HINT, type SignUpValidationErrors } from '../utils/validation';
import { getAuthErrorMessage } from '../utils/errorMessages';
import { AuthTextInput } from '../components/AuthTextInput';
import { PasswordInput } from '../components/PasswordInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { FormError } from '../components/FormError';
import { TermsCheckbox } from '../components/TermsCheckbox';
import { SocialSignInButtons } from '../components/SocialSignInButtons';
import { AuthFormScroll } from '../components/AuthFormScroll';

/**
 * Sign up: first/last name, work email, optional company, password + confirm, Terms
 * acceptance. Mirrors the EXACT real backend contract `frontend/src/pages/Auth.jsx` uses
 * (not just what the endpoints' own docs say) — see `persistSignupProfileDetails` there:
 * create the Firebase user → `getProfile()` (auto-creates the default Firestore doc) →
 * `updateProfile({firstName,lastName,company,displayName})` → record consent → send the
 * verification email. Each of these after Firebase user-creation is best-effort/
 * non-blocking so a transient failure never strands a user who already has an account —
 * `verify-email` has its own resend affordance for exactly that reason.
 */
export function SignUpScreen() {
  const theme = useTheme();
  const { register, loginWithGoogle, loginWithApple } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [errors, setErrors] = useState<SignUpValidationErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);

  const handleSubmit = async () => {
    if (loading) return;
    const validation = validateSignUp({ firstName, lastName, email, password, confirmPassword, agreedToTerms });
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setLoading(true);
    setGeneralError(null);
    const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
    try {
      await register(email.trim(), password, displayName);

      // Non-blocking from here — the account already exists; a failure in any of these
      // three must not strand the user on an error screen (mirrors Auth.jsx exactly).
      (async () => {
        try {
          await usersApi.getProfile();
          await usersApi.updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), company: company.trim(), displayName });
        } catch (err) {
          console.error('Failed to persist signup profile details:', err);
        }
      })();
      usersApi.recordRegistrationConsent(REGISTRATION_POLICY_VERSION).catch((err) => {
        console.error('Failed to record registration consent:', err);
      });
      authApi.sendVerification().catch((err) => {
        console.error('Failed to send verification email:', err);
      });
      // No manual navigation: AuthProvider's status becomes 'needs-email-verification'
      // the moment onAuthStateChanged fires for the new user, and the root layout's
      // route guard sends them to /verify-email automatically.
    } catch (err) {
      setGeneralError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (socialLoading) return;
    if (!agreedToTerms) {
      setErrors((e) => ({ ...e, agreedToTerms: 'You must agree to the Terms of Service and Privacy Policy to create an account' }));
      return;
    }
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
    if (!agreedToTerms) {
      setErrors((e) => ({ ...e, agreedToTerms: 'You must agree to the Terms of Service and Privacy Policy to create an account' }));
      return;
    }
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
        <ThemedText variant="heading">Create your account</ThemedText>
        <ThemedText variant="body" color="muted" style={styles.subtitle}>
          Start generating AI-assisted inspection reports
        </ThemedText>
      </View>

      <FormError message={generalError} />

      <View style={styles.nameRow}>
        <View style={styles.nameField}>
          <AuthTextInput
            label="First name"
            value={firstName}
            onChangeText={(v) => {
              setFirstName(v);
              setErrors((e) => ({ ...e, firstName: undefined }));
            }}
            error={errors.firstName}
            textContentType="givenName"
            placeholder="Jordan"
          />
        </View>
        <View style={styles.nameField}>
          <AuthTextInput
            label="Last name"
            value={lastName}
            onChangeText={(v) => {
              setLastName(v);
              setErrors((e) => ({ ...e, lastName: undefined }));
            }}
            error={errors.lastName}
            textContentType="familyName"
            placeholder="Rivera"
          />
        </View>
      </View>

      <AuthTextInput
        label="Work email"
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
      <AuthTextInput
        label="Company (optional)"
        value={company}
        onChangeText={setCompany}
        textContentType="organizationName"
        placeholder="Acme Adjusting"
      />
      <PasswordInput
        label="Password"
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          setErrors((e) => ({ ...e, password: undefined }));
        }}
        error={errors.password}
        hint={!errors.password ? PASSWORD_REQUIREMENTS_HINT : undefined}
        textContentType="newPassword"
        placeholder="••••••••••••"
      />
      <PasswordInput
        label="Confirm password"
        value={confirmPassword}
        onChangeText={(v) => {
          setConfirmPassword(v);
          setErrors((e) => ({ ...e, confirmPassword: undefined }));
        }}
        error={errors.confirmPassword}
        textContentType="newPassword"
        placeholder="••••••••••••"
      />

      <TermsCheckbox
        checked={agreedToTerms}
        onToggle={() => {
          setAgreedToTerms((v) => !v);
          setErrors((e) => ({ ...e, agreedToTerms: undefined }));
        }}
        error={errors.agreedToTerms}
      />

      <PrimaryButton label="Create account" onPress={handleSubmit} loading={loading} disabled={socialLoading} />

      <SocialSignInButtons onGoogle={handleGoogle} onApple={handleApple} loading={socialLoading} />

      <View style={styles.footer}>
        <ThemedText variant="body" color="muted">
          Already have an account?{' '}
        </ThemedText>
        <Link href="/login" asChild>
          <Pressable>
            <ThemedText variant="body" color="primary" style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
              Sign in
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
    marginBottom: 20,
  },
  subtitle: {
    marginTop: 4,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  nameField: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
});
