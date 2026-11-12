import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { ScalePressable } from '@/components/brand/ScalePressable';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { isGoogleSignInConfigured } from '../services/googleSignIn';
import { isAppleSignInAvailable } from '../services/appleSignIn';
import { isFederatedLoginEnabled } from '@/config/identityConfig';
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

      <ScalePressable
        onPress={onGoogle}
        disabled={!googleConfigured || loading}
        accessibilityRole="button"
        accessibilityLabel={googleConfigured ? 'Continue with Google' : 'Google sign-in not enabled in this build'}
        accessibilityState={{ disabled: !googleConfigured || loading, busy: loading }}
        style={[styles.google, { borderColor: theme.colors.border, opacity: !googleConfigured ? 0.55 : 1 }]}
      >
        {loading ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : (
          <>
            <Text style={styles.gMark}>
              <Text style={{ color: '#4285F4' }}>G</Text>
            </Text>
            <Text style={[styles.googleText, { color: theme.colors.ink }]}>
              {googleConfigured ? 'Continue with Google' : 'Google (not enabled in this build)'}
            </Text>
          </>
        )}
      </ScalePressable>
      {!googleConfigured && (
        <ThemedText variant="caption" color="muted" style={styles.note}>
          {isFederatedLoginEnabled()
            ? 'Google sign-in is not available in this QA build. Sign in with your FlacronAI website email and password.'
            : 'Google sign-in has not been configured for this build yet. Please sign in with your email and password. (Google sign-in needs a native app build — it does not work in Expo Go.)'}
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
    marginTop: 20,
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
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
  },
  gMark: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, lineHeight: 26 },
  googleText: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
});
