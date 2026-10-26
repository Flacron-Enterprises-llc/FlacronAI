import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { useProfile } from '../hooks/useProfile';
import { StateMessage } from '@/features/reports/components/StateMessage';
import { NotificationSettingsCard } from '@/features/push/components/NotificationSettingsCard';
import { SettingsRow } from '@/features/account/components/SettingsRow';

const TIER_LABELS: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  agency: 'Agency',
  enterprise: 'Enterprise',
};

/**
 * Settings hub (Phase 8): plan summary, account screens (profile, subscription, sign-in &
 * security), notifications, legal & support, sign out and account deletion.
 */
export function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { firebaseUser, userProfile, logout } = useAuth();
  const { usage, usageLoading, usageError, retryUsage } = useProfile();
  const cardStyle = [styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card }];

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <ThemedText variant="heading" accessibilityRole="header" style={styles.heading}>
            Settings
          </ThemedText>

          <View style={cardStyle}>
            <ThemedText variant="caption" color="muted">
              Signed in as
            </ThemedText>
            <ThemedText variant="body" style={styles.email}>
              {userProfile?.displayName ? `${userProfile.displayName} · ` : ''}
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
                {/* Never imply a plan the server didn't report (Golden Rule #4). */}
                <ThemedText variant="body">
                  {(usage?.tier && TIER_LABELS[usage.tier]) || usage?.tierName || 'Plan unavailable'}
                </ThemedText>
                <ThemedText variant="caption" color="muted" style={styles.usage}>
                  {usage?.reportsThisMonth ?? 0} of {usage && usage.reportsLimit === -1 ? 'unlimited' : (usage?.reportsLimit ?? 0)} reports
                  used this month
                </ThemedText>
              </>
            )}
          </View>

          <ThemedText variant="subtitle" accessibilityRole="header" style={styles.sectionTitle}>
            Account
          </ThemedText>
          <View style={cardStyle}>
            <SettingsRow label="Profile" detail="Name, company, phone, address" onPress={() => router.push('/account/profile')} />
            <SettingsRow label="Subscription" detail="Plan, billing and purchases" onPress={() => router.push('/subscription')} />
            <SettingsRow label="Sign-in & security" detail="Password and two-factor authentication" onPress={() => router.push('/account/security')} />
          </View>

          <ThemedText variant="subtitle" accessibilityRole="header" style={styles.sectionTitle}>
            Notifications
          </ThemedText>
          <NotificationSettingsCard />

          <ThemedText variant="subtitle" accessibilityRole="header" style={[styles.sectionTitle, styles.spacedLarge]}>
            Help & legal
          </ThemedText>
          <View style={cardStyle}>
            <SettingsRow label="Legal & support" detail="Policies, help, contact and app version" onPress={() => router.push('/account/legal')} />
          </View>

          <View style={styles.signOut}>
            <PrimaryButton variant="secondary" label="Sign out" onPress={() => logout()} />
          </View>
          <View style={[cardStyle, styles.danger]}>
            <SettingsRow label="Delete account" destructive detail="Permanently delete your account and data" onPress={() => router.push('/account/delete')} />
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  heading: { marginBottom: 16 },
  card: { borderWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 20 },
  email: { marginTop: 2 },
  spaced: { marginTop: 12 },
  spacedLarge: { marginTop: 8 },
  usage: { marginTop: 2 },
  sectionTitle: { marginBottom: 8 },
  signOut: { marginTop: 4, marginBottom: 16 },
  danger: { marginBottom: 32 },
});
