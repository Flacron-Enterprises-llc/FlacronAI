/**
 * Phase 8 — "confirm it's you" step before a sensitive action, matched to the account's sign-in
 * provider: current password, Google, or Apple (iOS). Calls `onConfirmed` only after Firebase
 * re-authenticated the CURRENT user and a fresh ID token was obtained.
 */
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { PasswordInput } from '@/features/auth/components/PasswordInput';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { reauthenticate, reauthMethodFor, signInMethodsOf } from '../reauth';
import { AuthTextInput } from '@/features/auth/components/AuthTextInput';
import { identityMethods, reauthenticateIdentity } from '@/features/auth/services/federatedLogin';
import { getAuthErrorMessage } from '@/features/auth/utils/errorMessages';
import { Notice } from './AccountScaffold';

type ReauthPanelProps = { actionLabel: string; onConfirmed: () => void | Promise<void>; disabled?: boolean };

export function ReauthPanel(props: ReauthPanelProps) {
  const { isFederated } = useAuth();
  return isFederated ? <FederatedReauthPanel {...props} /> : <StagingReauthPanel {...props} />;
}

/** QA federation: confirm with the FlacronAI WEBSITE account (fresh production sign-in,
 * plus its MFA code when enabled), which re-issues the QA session. */
function FederatedReauthPanel({ actionLabel, onConfirmed, disabled = false }: ReauthPanelProps) {
  const methods = identityMethods();
  const method = methods.includes('password') ? 'password' : methods.includes('google') ? 'google' : null;
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaStep, setMfaStep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!method) {
    return <Notice tone="info" text="Sign out and sign in again with your FlacronAI website account, then try again." />;
  }

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await reauthenticateIdentity(method, mfaStep ? { mfaCode: code.trim() } : { password });
      if (outcome === 'cancelled') return;
      if (outcome === 'mfa_required') {
        setMfaStep(true);
        return;
      }
      setPassword('');
      setCode('');
      setMfaStep(false);
      await onConfirmed();
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Notice tone="error" text={error} />
      {mfaStep ? (
        <AuthTextInput
          label="Authentication code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          placeholder="123456"
        />
      ) : method === 'password' ? (
        <PasswordInput
          label="FlacronAI password"
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          textContentType="password"
          accessibilityLabel="FlacronAI password"
        />
      ) : (
        <ThemedText variant="caption" color="muted" style={{ marginBottom: 12 }}>
          You’ll be asked to sign in with Google again.
        </ThemedText>
      )}
      <PrimaryButton
        label={mfaStep ? `Verify & ${actionLabel.toLowerCase()}` : method === 'password' ? actionLabel : `Confirm with Google & ${actionLabel.toLowerCase()}`}
        onPress={confirm}
        loading={busy}
        disabled={disabled || (mfaStep ? code.trim().length < 6 : method === 'password' && !password)}
      />
    </View>
  );
}

function StagingReauthPanel({ actionLabel, onConfirmed, disabled = false }: ReauthPanelProps) {
  const { firebaseUser } = useAuth();
  const method = reauthMethodFor(signInMethodsOf(firebaseUser), Platform.OS);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!method) {
    return (
      <Notice
        tone="info"
        text="This account signs in with Apple, which isn't available on this device. Use an iPhone or iPad (or the FlacronAI website) to confirm it's you."
      />
    );
  }

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await reauthenticate(firebaseUser, method, { password });
    if (result.ok) {
      setPassword('');
      try {
        await onConfirmed();
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(false);
    if (!result.cancelled) setError(result.message);
  };

  return (
    <View>
      <Notice tone="error" text={error} />
      {method === 'password' ? (
        <PasswordInput
          label="Current password"
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          textContentType="password"
          accessibilityLabel="Current password"
        />
      ) : (
        <ThemedText variant="caption" color="muted" style={{ marginBottom: 12 }}>
          {method === 'google' ? 'You’ll be asked to sign in with Google again.' : 'You’ll be asked to sign in with Apple again.'}
        </ThemedText>
      )}
      <PrimaryButton
        label={method === 'password' ? actionLabel : `${method === 'google' ? 'Confirm with Google' : 'Confirm with Apple'} & ${actionLabel.toLowerCase()}`}
        onPress={confirm}
        loading={busy}
        disabled={disabled || (method === 'password' && !password)}
      />
    </View>
  );
}
