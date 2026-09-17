import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { AuthTextInput } from '@/features/auth/components/AuthTextInput';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { FormError } from '@/features/auth/components/FormError';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { useProfile } from '../hooks/useProfile';
import { StateMessage } from '@/features/reports/components/StateMessage';

const TIER_LABELS: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  agency: 'Agency',
  enterprise: 'Enterprise',
};

export function SettingsScreen() {
  const theme = useTheme();
  const { firebaseUser, logout } = useAuth();
  const { userProfile, usage, usageLoading, usageError, retryUsage, saveProfile, saving, saveError, clearSaveError } = useProfile();

  const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
  const [company, setCompany] = useState(userProfile?.company || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    clearSaveError();
    setSaved(false);
    const ok = await saveProfile({ displayName: displayName.trim(), company: company.trim(), phone: phone.trim() });
    if (ok) setSaved(true);
  };

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ThemedText variant="heading" style={styles.heading}>
          Settings
        </ThemedText>

        <View
          style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card }]}
        >
          <ThemedText variant="caption" color="muted">
            Signed in as
          </ThemedText>
          <ThemedText variant="body" style={styles.email}>
            {firebaseUser?.email}
          </ThemedText>

          <ThemedText variant="caption" color="muted" style={styles.spaced}>
            Plan
          </ThemedText>
          {usageLoading ? (
            <ThemedText variant="body">Loading…</ThemedText>
          ) : usageError ? (
            <StateMessage title="Could not load plan usage" description={usageError} onRetry={retryUsage} />
          ) : (
            <>
              <ThemedText variant="body">{TIER_LABELS[usage?.tier || 'starter'] || usage?.tierName}</ThemedText>
              <ThemedText variant="caption" color="muted" style={styles.usage}>
                {usage?.reportsThisMonth ?? 0} of {usage && usage.reportsLimit === -1 ? 'unlimited' : (usage?.reportsLimit ?? 0)} reports
                used this month
              </ThemedText>
            </>
          )}
        </View>

        <ThemedText variant="subtitle" style={styles.sectionTitle}>
          Profile
        </ThemedText>
        <FormError message={saveError} />
        {saved && (
          <ThemedText variant="caption" style={{ color: theme.colors.success, marginBottom: 12 }}>
            Saved.
          </ThemedText>
        )}
        <AuthTextInput label="Display name" value={displayName} onChangeText={(v) => { setDisplayName(v); setSaved(false); }} />
        <AuthTextInput label="Company" value={company} onChangeText={(v) => { setCompany(v); setSaved(false); }} />
        <AuthTextInput label="Phone" value={phone} onChangeText={(v) => { setPhone(v); setSaved(false); }} keyboardType="phone-pad" />
        <PrimaryButton label="Save changes" onPress={handleSave} loading={saving} />

        <View style={styles.signOut}>
          <PrimaryButton variant="secondary" label="Sign out" onPress={() => logout()} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heading: {
    marginBottom: 16,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 14,
    marginBottom: 24,
  },
  email: {
    marginTop: 2,
  },
  spaced: {
    marginTop: 12,
  },
  usage: {
    marginTop: 2,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  signOut: {
    marginTop: 24,
    marginBottom: 32,
  },
});
