import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ThemedText } from '@/components/ThemedText';
import { Card, TierBadge } from '@/components/ui';
import { getAppEnv } from '@/config/env';
import { useApiResource } from '@/hooks/useApiResource';
import { SettingsRow } from '@/features/account/components/SettingsRow';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { openExternal } from '@/features/legal/links';
import { requestTourReplay } from '@/features/tour/ProductTour';
import { usersApi } from '@/services/api/users';

const WEB = 'https://flacronai.com';

function safeEnv(): string {
  try {
    return getAppEnv();
  } catch {
    return 'production';
  }
}

/**
 * The web dashboard sidebar's remaining entries (Templates, Analytics, Integrations, CRM, Usage & Billing, Settings,
 * Organization, Enterprise Portal) plus Help. Desktop admin consoles that are not built natively are listed under
 * "On flacronai.com" and only for plans that actually include them (server-reported features / tier), so the app never
 * advertises a tool the account can't use (Golden Rule #4).
 */
export function MoreScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const usage = useApiResource(() => usersApi.getUsage().then((r) => r.usage));
  const tier = usage.data?.tier ?? userProfile?.tier;
  const features = usage.data?.features;
  const nonProd = safeEnv() !== 'production';

  const replayTour = () => {
    router.navigate('/dashboard');
    setTimeout(requestTourReplay, 300);
  };

  // Desktop-only consoles pending the client's review (see mobile/docs/WEB_MOBILE_PARITY.md "Desktop exceptions").
  const webTools = [
    features?.apiAccess && { label: 'Integrations & API keys', detail: 'Webhooks and developer access', icon: 'link' as const, path: '/integrations' },
    tier === 'enterprise' && { label: 'White-label & Enterprise portal', detail: 'Branding, subdomain and portal settings', icon: 'globe' as const, path: '/enterprise-dashboard' },
    { label: 'Template Builder', detail: 'Design structural report templates', icon: 'layout' as const, path: '/templates' },
  ].filter(Boolean) as { label: string; detail: string; icon: 'link'; path: string }[];

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <ScreenHeader title="More" back={false} right={<TierBadge tier={tier} />} />

          <Section title="Workspace">
            <SettingsRow icon="search" label="Search" detail="Reports, photos and team members" onPress={() => router.push('/search')} />
            <SettingsRow icon="image" label="Photo Library" detail="Review photos across all reports" onPress={() => router.push('/photos')} />
            <SettingsRow icon="trending-up" label="Analytics" detail="Report volume, turnaround and status" onPress={() => router.push('/analytics')} />
            <SettingsRow icon="folder" label="Templates" detail="Saved claim templates for the wizard" onPress={() => router.push('/templates')} />
            <SettingsRow icon="bell" label="Notifications" detail="Report, review and billing updates" onPress={() => router.push('/notifications')} />
            <SettingsRow icon="credit-card" label="Usage & Billing" detail="Plan usage and invoices" onPress={() => router.push('/billing')} />
          </Section>

          {features?.crmAccess || tier === 'enterprise' ? (
            <Section title="Team & clients">
              {features?.crmAccess ? (
                <SettingsRow icon="users" label="CRM" detail="Clients, claims and appointments" onPress={() => router.push('/crm')} />
              ) : null}
              {tier === 'enterprise' ? (
                <SettingsRow icon="briefcase" label="Organization" detail="Members, roles, security and audit logs" onPress={() => router.push('/organization')} />
              ) : null}
            </Section>
          ) : null}

          <Section title="Account">
            <SettingsRow icon="settings" label="Settings" detail="Profile, security, notifications and data" onPress={() => router.push('/settings')} />
            <SettingsRow icon="star" label="Subscription" detail="Plans and store purchases" onPress={() => router.push('/subscription')} />
          </Section>

          <Section title="Help & support">
            <SettingsRow icon="play-circle" label="Replay app tour" detail="A one-minute walkthrough" onPress={replayTour} />
            <SettingsRow icon="help-circle" label="Help, legal & contact" detail="FAQs, policies, support and app version" onPress={() => router.push('/account/legal')} />
          </Section>

          <Section
            title="Desktop tools on flacronai.com"
            note={
              nonProd
                ? 'These desktop tools open the live website. This QA app uses staging data, which the website does not show.'
                : 'These desktop tools open in your browser, signed in with the same FlacronAI account.'
            }
          >
            {webTools.map((t) => (
              <SettingsRow key={t.path} icon={t.icon} label={t.label} detail={t.detail} external onPress={() => openExternal(WEB + t.path)} />
            ))}
          </Section>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText variant="subtitle" accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {note ? (
        <ThemedText variant="caption" color="muted" style={styles.note}>
          {note}
        </ThemedText>
      ) : null}
      <Card style={styles.card}>{children}</Card>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingBottom: 24 },
  section: { marginBottom: 20 },
  sectionTitle: { marginBottom: 8 },
  note: { marginBottom: 8 },
  card: { paddingVertical: 4 },
});
