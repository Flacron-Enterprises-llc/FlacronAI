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
import { Notice } from './AccountScaffold';

export function ReauthPanel({ actionLabel, onConfirmed, disabled = false }: { actionLabel: string; onConfirmed: () => void | Promise<void>; disabled?: boolean }) {
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
