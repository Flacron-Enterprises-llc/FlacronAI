import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Reveal } from '@/components/brand/Reveal';
import { ScalePressable } from '@/components/brand/ScalePressable';
import { Icon } from '@/components/ui/Icon';
import { brand } from '@/theme/brand';

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
  const { userProfile, firebaseUser, logout } = useAuth();
  const usage = useApiResource(() => usersApi.getUsage().then((r) => r.usage));
  const tier = usage.data?.tier ?? userProfile?.tier;
  const features = usage.data?.features;
  const nonProd = safeEnv() !== 'production';
  const displayName = userProfile?.displayName || firebaseUser?.displayName || firebaseUser?.email || 'FlacronAI user';
  const signOut = () =>
    Alert.alert('Sign out?', 'You can sign back in with the same FlacronAI account at any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ]);

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

          <Reveal>
            <LinearGradient colors={[brand.navy, brand.navyDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.profile}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(displayName || 'U').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.profileText}>
                <Text style={styles.name} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={styles.email} numberOfLines={1}>
                  {firebaseUser?.email}
                </Text>
              </View>
              {tier !== 'enterprise' ? (
                <ScalePressable onPress={() => router.push('/subscription')} accessibilityRole="button" accessibilityLabel="Upgrade plan" style={styles.upgrade}>
                  <Icon name="award" size={15} color="#FFFFFF" />
                  <Text style={styles.upgradeText}>Upgrade</Text>
                </ScalePressable>
              ) : null}
            </LinearGradient>
          </Reveal>

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
            <SettingsRow icon="log-out" label="Sign out" destructive onPress={signOut} />
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
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 16, marginBottom: 20 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' },
  avatarText: { color: '#FFFFFF', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20 },
  profileText: { flex: 1, minWidth: 0 },
  name: { color: '#FFFFFF', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16 },
  email: { color: brand.onNavyMuted, fontFamily: 'Inter_400Regular', fontSize: 12.5, marginTop: 2 },
  upgrade: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: brand.orange, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  upgradeText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  sectionTitle: { marginBottom: 8 },
  note: { marginBottom: 8 },
  card: { paddingVertical: 4 },
});
