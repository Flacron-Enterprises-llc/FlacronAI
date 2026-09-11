import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { isGoogleSignInConfigured } from '../services/googleSignIn';
import { isAppleSignInAvailable } from '../services/appleSignIn';
import { PrimaryButton } from './PrimaryButton';

interface SocialSignInButtonsProps {
  onGoogle: () => void;
  onApple: () => void;
  loading?: boolean;
}

/**
 * Renders Google + (iOS-only) Apple sign-in buttons, each independently config-gated —
 * see googleSignIn.ts / appleSignIn.ts. A provider that isn't configured/available shows
 * a disabled button with a clear reason instead of silently disappearing or attempting a
 * call that can only fail (AUTHENTICATION_ARCHITECTURE.md §7 / task requirement: "mark
 * the provider as blocked—not complete").
 *
 * Per Apple App Store policy, Sign in with Apple is offered on iOS whenever Google
 * Sign-In is offered — both render together on iOS; only Google renders on Android.
 */
export function SocialSignInButtons({ onGoogle, onApple, loading = false }: SocialSignInButtonsProps) {
  const theme = useTheme();
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (Platform.OS === 'ios') {
      isAppleSignInAvailable().then((available) => {
        if (!cancelled) setAppleAvailable(available);
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const googleConfigured = isGoogleSignInConfigured();

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={[styles.line, { backgroundColor: theme.colors.border }]} />
        <ThemedText variant="caption" color="muted" style={styles.dividerText}>
          or continue with
        </ThemedText>
        <View style={[styles.line, { backgroundColor: theme.colors.border }]} />
      </View>

      <PrimaryButton
        variant="secondary"
        label={googleConfigured ? 'Continue with Google' : 'Google (setup required)'}
        onPress={onGoogle}
        disabled={!googleConfigured || loading}
        loading={loading}
      />
      {!googleConfigured && (
        <ThemedText variant="caption" color="muted" style={styles.note}>
          Google Sign-In requires an EAS development build and a configured OAuth client —
          not available in Expo Go yet.
        </ThemedText>
      )}

      {Platform.OS === 'ios' && (
        <View style={styles.appleWrap}>
          <PrimaryButton
            variant="secondary"
            label={appleAvailable ? 'Continue with Apple' : 'Apple (unavailable)'}
            onPress={onApple}
            disabled={!appleAvailable || loading}
            loading={loading}
          />
          {!appleAvailable && (
            <ThemedText variant="caption" color="muted" style={styles.note}>
              Sign in with Apple is unavailable on this device/OS version.
            </ThemedText>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    marginHorizontal: 10,
  },
  note: {
    marginTop: 6,
    marginBottom: 8,
  },
  appleWrap: {
    marginTop: 12,
  },
});
