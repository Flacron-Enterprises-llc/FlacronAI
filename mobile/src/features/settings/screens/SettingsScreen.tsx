import type React from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ThemedText } from '@/components/ThemedText';
import { Card, ProgressBar, TierBadge } from '@/components/ui';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { useProfile } from '../hooks/useProfile';
import { StateMessage } from '@/features/reports/components/StateMessage';
import { NotificationSettingsCard } from '@/features/push/components/NotificationSettingsCard';
import { SettingsRow } from '@/features/account/components/SettingsRow';
import { EmailNotificationsCard } from '../components/EmailNotificationsCard';
import { DataControlsCard } from '../components/DataControlsCard';

/**
 * Settings, organised like the web Settings tabs: Profile, Billing, Security, Notifications, Data, Help, and the
 * danger zone. Plan and usage always come from `GET /users/usage` (Golden Rule #4).
 */
export function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { firebaseUser, userProfile, logout } = useAuth();
  const { usage, usageLoading, usageError, retryUsage } = useProfile();
  const unlimited = usage?.reportsLimit === -1;
  const percent = usage && !unlimited && usage.reportsLimit > 0 ? Math.min(100, (usage.reportsThisMonth / usage.reportsLimit) * 100) : 0;

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <ScreenHeader title="Settings" />

          <Card style={styles.block}>
            <View style={styles.planRow}>
              <View style={styles.flex}>
                <ThemedText variant="body" numberOfLines={1} style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
                  {userProfile?.displayName || firebaseUser?.email}
                </ThemedText>
                <ThemedText variant="caption" color="muted" numberOfLines={1}>
                  {firebaseUser?.email}
                </ThemedText>
              </View>
              <TierBadge tier={usage?.tier} />
            </View>
            {usageLoading ? (
              <ThemedText variant="caption" color="muted">
                Loading plan…
              </ThemedText>
            ) : usageError ? (
              <StateMessage title="Could not load plan usage" description={usageError} onRetry={retryUsage} />
            ) : usage ? (
              <>
                <ThemedText variant="caption" color="muted" style={styles.usage}>
                  {usage.reportsThisMonth} of {unlimited ? 'unlimited' : usage.reportsLimit} reports used this month
                </ThemedText>
                <ProgressBar percent={unlimited ? 100 : percent} color={unlimited ? theme.colors.success : undefined} height={6} />
              </>
            ) : null}
          </Card>

          <Section title="Account">
            <SettingsRow icon="user" label="Profile" detail="Name, company, phone, address" onPress={() => router.push('/account/profile')} />
            <SettingsRow icon="star" label="Subscription" detail="Plan, store purchases and restore" onPress={() => router.push('/subscription')} />
            <SettingsRow icon="credit-card" label="Usage & Billing" detail="Usage meter and invoices" onPress={() => router.push('/billing')} />
          </Section>

          <Section title="Security">
            <SettingsRow icon="lock" label="Sign-in & security" detail="Password and two-factor authentication" onPress={() => router.push('/account/security')} />
            <SettingsRow icon="clock" label="Login history" detail="Recent sign-ins to your account" onPress={() => router.push('/account/login-history')} />
          </Section>

          <SectionTitle title="Push notifications" />
          <NotificationSettingsCard />

          <SectionTitle title="Email notifications" spaced />
          <EmailNotificationsCard />

          <SectionTitle title="Data" />
          <DataControlsCard />

          <Section title="Help & legal">
            <SettingsRow icon="help-circle" label="Help, legal & contact" detail="FAQs, policies, support and app version" onPress={() => router.push('/account/legal')} />
          </Section>

          <View style={styles.signOut}>
            <PrimaryButton variant="secondary" icon="log-out" label="Sign out" onPress={() => logout()} />
          </View>
          <Card style={[styles.danger, { borderColor: theme.colors.error + '4D' }]}>
            <SettingsRow icon="trash-2" label="Delete account" destructive detail="Permanently delete your account and data" onPress={() => router.push('/account/delete')} />
          </Card>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function SectionTitle({ title, spaced }: { title: string; spaced?: boolean }) {
  return (
    <ThemedText variant="subtitle" accessibilityRole="header" style={[styles.sectionTitle, spaced && styles.spaced]}>
      {title}
    </ThemedText>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <SectionTitle title={title} />
      <Card style={[styles.block, styles.rows]}>{children}</Card>
    </>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  block: { marginBottom: 20 },
  rows: { paddingVertical: 4 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  flex: { flex: 1 },
  usage: { marginBottom: 6 },
  sectionTitle: { marginBottom: 8 },
  spaced: { marginTop: 12 },
  signOut: { marginTop: 4, marginBottom: 16 },
  danger: { marginBottom: 32, paddingVertical: 4 },
});
