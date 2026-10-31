/**
 * Phase 8 — sign-in & security: how the account signs in, password change (email/password
 * accounts only; Google/Apple passwords are managed by those providers), and two-factor
 * authentication (same TOTP endpoints as web Settings).
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Linking, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { AuthTextInput } from '@/features/auth/components/AuthTextInput';
import { PasswordInput } from '@/features/auth/components/PasswordInput';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { PASSWORD_REQUIREMENTS_HINT, validatePassword } from '@/features/auth/utils/validation';
import { authApi } from '@/services/api/auth';
import { usersApi } from '@/services/api/users';
import { ApiRequestError } from '@/types/api';
import { AccountScaffold, Card, Notice } from '../components/AccountScaffold';
import { ReauthPanel } from '../components/ReauthPanel';
import { signInMethodsOf, type SignInMethod } from '../reauth';
import { WEBSITE_LOGIN_URL } from '@/config/identityConfig';

const METHOD_LABEL: Record<SignInMethod, string> = { password: 'Email & password', google: 'Google', apple: 'Apple' };

const apiMessage = (err: unknown, fallback: string) => {
  if (err instanceof ApiRequestError) {
    if (err.category === 'offline' || err.category === 'timeout') return 'You appear to be offline. Check your connection and try again.';
    if (err.code === 'INVALID_MFA_CODE') return 'That code is incorrect or expired.';
    if (err.code === 'RECENT_LOGIN_REQUIRED') return 'Please confirm it’s you again.';
    if (err.category === 'rate_limited') return 'Too many attempts. Wait a minute and try again.';
  }
  return fallback;
};

function PasswordSection() {
  const { logout } = useAuth();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const validation = validatePassword(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = validation.valid && confirm === next;

  const change = async () => {
    setError(null);
    try {
      await usersApi.changePassword(next);
    } catch (err) {
      setError(apiMessage(err, 'Your password could not be changed. Please try again.'));
      return;
    }
    // The server signs out every session (including this one) after a password change.
    Alert.alert('Password changed', 'Sign in again with your new password.');
    await logout();
  };

  return (
    <Card>
      <ThemedText variant="subtitle" style={styles.cardTitle}>
        Change password
      </ThemedText>
      <Notice tone="error" text={error} />
      <PasswordInput
        label="New password"
        value={next}
        onChangeText={setNext}
        hint={PASSWORD_REQUIREMENTS_HINT}
        error={next.length > 0 && !validation.valid ? validation.message : undefined}
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <PasswordInput
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        error={mismatch ? 'Passwords don’t match.' : undefined}
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <ThemedText variant="caption" color="muted" style={styles.gap}>
        You’ll be signed out on all devices afterwards.
      </ThemedText>
      <ReauthPanel actionLabel="Change password" onConfirmed={change} disabled={!ready} />
    </Card>
  );
}

type MfaState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'off' }
  | { phase: 'enrolling'; secret: string; qrCode: string }
  | { phase: 'recovery'; codes: string[] }
  | { phase: 'on' };

function TwoFactorSection() {
  const { firebaseUser, markMfaVerified } = useAuth();
  const [state, setState] = useState<MfaState>({ phase: 'loading' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { mfaEnabled } = await authApi.mfaStatus();
      setState({ phase: mfaEnabled ? 'on' : 'off' });
    } catch (err) {
      setState({ phase: 'error', message: apiMessage(err, 'Two-factor status is unavailable right now.') });
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(apiMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      const r = await authApi.mfaSetup();
      setCode('');
      setState({ phase: 'enrolling', secret: r.secret, qrCode: r.qrCode });
    }, 'Couldn’t start two-factor setup. Please try again.');

  const verify = () =>
    run(async () => {
      const r = await authApi.mfaVerifySetup(code.trim());
      if (r.mfaAssertion) markMfaVerified(r.mfaAssertion);
      setCode('');
      setState({ phase: 'recovery', codes: r.recoveryCodes ?? [] });
    }, 'Couldn’t verify that code. Please try again.');

  const disable = () =>
    run(async () => {
      await authApi.mfaDisable(code.trim());
      setCode('');
      setState({ phase: 'off' });
    }, 'Couldn’t turn off two-factor authentication. Please try again.');

  const openAuthenticator = async (secret: string) => {
    const label = encodeURIComponent(`FlacronAI:${firebaseUser?.email ?? 'account'}`);
    try {
      await Linking.openURL(`otpauth://totp/${label}?secret=${secret}&issuer=FlacronAI`);
    } catch {
      setError('No authenticator app could open the link. Scan the QR code or enter the key manually.');
    }
  };

  const codeValid = /^\d{6}$/.test(code.trim()) || /^[A-Za-z0-9-]{8,17}$/.test(code.trim());

  return (
    <Card>
      <ThemedText variant="subtitle" style={styles.cardTitle}>
        Two-factor authentication
      </ThemedText>
      <Notice tone="error" text={error} />
      {state.phase === 'loading' && <ThemedText variant="body">Loading…</ThemedText>}
      {state.phase === 'error' && (
        <>
          <Notice tone="error" text={state.message} />
          <PrimaryButton variant="secondary" label="Try again" onPress={load} />
        </>
      )}
      {state.phase === 'off' && (
        <>
          <ThemedText variant="body" style={styles.gap}>
            Off. Add a code from an authenticator app to each sign-in.
          </ThemedText>
          <PrimaryButton label="Set up two-factor" onPress={start} loading={busy} />
        </>
      )}
      {state.phase === 'enrolling' && (
        <>
          <ThemedText variant="body" style={styles.gap}>
            Scan this code with your authenticator app, or enter the key manually.
          </ThemedText>
          <Image source={{ uri: state.qrCode }} style={styles.qr} accessibilityLabel="Two-factor setup QR code" />
          <ThemedText variant="caption" color="muted">
            Setup key
          </ThemedText>
          <ThemedText variant="body" selectable style={styles.gap}>
            {state.secret}
          </ThemedText>
          <PrimaryButton variant="secondary" label="Open authenticator app" onPress={() => openAuthenticator(state.secret)} />
          <View style={styles.gap} />
          <AuthTextInput
            label="6-digit code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
          <PrimaryButton label="Verify & turn on" onPress={verify} loading={busy} disabled={!/^\d{6}$/.test(code.trim())} />
        </>
      )}
      {state.phase === 'recovery' && (
        <>
          <Notice tone="success" text="Two-factor authentication is on." />
          <ThemedText variant="body" style={styles.gap}>
            Save these recovery codes somewhere safe. Each works once if you lose your authenticator. They won’t be shown again.
          </ThemedText>
          <ThemedText variant="body" selectable style={styles.codes} accessibilityLabel={`Recovery codes: ${state.codes.join(', ')}`}>
            {state.codes.join('\n')}
          </ThemedText>
          <PrimaryButton label="I’ve saved them" onPress={() => setState({ phase: 'on' })} />
        </>
      )}
      {state.phase === 'on' && (
        <>
          <ThemedText variant="body" style={styles.gap}>
            On. To turn it off, enter a current code or a recovery code.
          </ThemedText>
          <AuthTextInput label="Authenticator or recovery code" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} />
          <PrimaryButton variant="secondary" label="Turn off two-factor" onPress={disable} loading={busy} disabled={!codeValid} />
        </>
      )}
    </Card>
  );
}

export function SecurityScreen() {
  const { firebaseUser, isFederated } = useAuth();
  const methods = signInMethodsOf(firebaseUser);
  if (isFederated) {
    // QA federation: sign-in, password and two-factor belong to the website account.
    return (
      <AccountScaffold title="Sign-in & security">
        <Card>
          <ThemedText variant="body">
            This QA app signs in with your FlacronAI website account. Change your password or two-factor
            authentication on flacronai.com; the change applies here the next time you sign in (and within an
            hour for an open session).
          </ThemedText>
          <View style={styles.gap} />
          <PrimaryButton variant="secondary" label="Open flacronai.com" onPress={() => Linking.openURL(WEBSITE_LOGIN_URL)} />
        </Card>
      </AccountScaffold>
    );
  }
  return (
    <AccountScaffold title="Sign-in & security">
      <Card>
        <ThemedText variant="caption" color="muted">
          Signs in with
        </ThemedText>
        <ThemedText variant="body">{methods.length ? methods.map((m) => METHOD_LABEL[m]).join(', ') : '—'}</ThemedText>
        {!methods.includes('password') && methods.length > 0 && (
          <ThemedText variant="caption" color="muted" style={{ marginTop: 6 }}>
            Your password is managed by {methods.includes('google') ? 'Google' : 'Apple'}, not FlacronAI.
          </ThemedText>
        )}
      </Card>
      {methods.includes('password') && <PasswordSection />}
      <TwoFactorSection />
    </AccountScaffold>
  );
}

const styles = StyleSheet.create({
  cardTitle: { marginBottom: 10 },
  gap: { marginBottom: 12 },
  qr: { width: 200, height: 200, alignSelf: 'center', marginVertical: 12, backgroundColor: '#FFFFFF' },
  codes: { fontFamily: 'monospace', marginBottom: 12 },
});
