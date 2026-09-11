import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { useAuth } from '../context/AuthProvider';
import { authApi } from '@/services/api/auth';
import { getAuthErrorMessage } from '../utils/errorMessages';
import { PrimaryButton } from '../components/PrimaryButton';
import { FormError } from '../components/FormError';

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Blocking screen for a signed-in, unverified email/password user (route guard in
 * app/_layout.tsx only reaches this screen when AuthProvider's `status` is
 * 'needs-email-verification' — Google/Apple users are pre-verified and skip it
 * entirely, mirroring `ProtectedRoute.jsx`'s `isGoogleUser` check).
 *
 * DOCUMENTED LIMITATION: the verification link opens in the device's browser and its
 * "continue" destination is the existing WEB dashboard (`backend/routes/auth.js:500-506`
 * builds `FRONTEND_URL + '/dashboard'`, unaware this app exists) — there is no secure
 * mobile deep-link handling yet (see AUTHENTICATION_ARCHITECTURE.md §2.3/§7). Per the
 * Phase 3 task's explicit instruction, this uses that existing web behavior as-is rather
 * than inventing an unverified deep-link flow: the user verifies in their browser, then
 * returns to this screen and taps "I've Verified My Email," which reloads the Firebase
 * user and re-checks `emailVerified` (mirrors `AuthContext.jsx`'s `reloadUser`).
 */
export function VerifyEmailScreen() {
  const theme = useTheme();
  const { firebaseUser, reloadUser, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const [notYetVerified, setNotYetVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  const handleCheckVerified = async () => {
    if (checking) return;
    setChecking(true);
    setNotYetVerified(false);
    try {
      await reloadUser();
      // A brief settle delay mirrors Auth.jsx's own 500ms pause after reload() before
      // re-reading emailVerified — Firebase's local user object needs a beat to sync.
      await new Promise((resolve) => setTimeout(resolve, 500));
      // If still unverified, AuthProvider's status won't have changed and this screen
      // stays mounted — surface that explicitly rather than leaving the user guessing.
      setNotYetVerified(true);
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    if (resending || cooldown > 0) return;
    setResending(true);
    setResendError(null);
    try {
      await authApi.sendVerification();
      setCooldown(RESEND_COOLDOWN_SECONDS);
      cooldownTimer.current = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            if (cooldownTimer.current) clearInterval(cooldownTimer.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setResendError(getAuthErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <ScreenContainer centered>
      <View style={[styles.iconCircle, { backgroundColor: theme.colors.primarySoft, borderRadius: 999 }]}>
        <ThemedText variant="title">✉️</ThemedText>
      </View>
      <ThemedText variant="title" style={styles.title}>
        Verify your email
      </ThemedText>
      <ThemedText variant="body" color="muted" style={styles.body}>
        We sent a verification link to{' '}
        <ThemedText variant="body" style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
          {firebaseUser?.email ?? 'your email'}
        </ThemedText>
        . It opens in your browser — once verified there, come back here.
      </ThemedText>

      {notYetVerified && (
        <FormError message="Email not verified yet. Please check your inbox and tap the link, then try again." />
      )}
      {!!resendError && <FormError message={resendError} />}

      <PrimaryButton label="I've Verified My Email" onPress={handleCheckVerified} loading={checking} />

      <View style={styles.resendRow}>
        <PrimaryButton
          variant="secondary"
          label={cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend verification email'}
          onPress={handleResend}
          loading={resending}
          disabled={cooldown > 0}
        />
      </View>

      <PrimaryButton variant="secondary" label="Sign out" onPress={() => logout()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  iconCircle: {
    width: 64,
    height: 64,
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
  resendRow: {
    marginTop: 12,
    marginBottom: 24,
    alignSelf: 'stretch',
  },
});
