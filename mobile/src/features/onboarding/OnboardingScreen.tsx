import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BrandMark } from '@/components/BrandMark';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { Icon, ProgressBar, type IconName } from '@/components/ui';
import { apiErrorMessage, useApiResource } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { InviteCard } from '@/features/organization/OrganizationScreen';
import { teamsApi } from '@/services/api/teams';
import { usersApi } from '@/services/api/users';
import { useTheme } from '@/theme';

/** Same values/labels as frontend/src/utils/onboarding.js (enum-checked by the server). */
export const USER_TYPES: { value: string; label: string; icon: IconName }[] = [
  { value: 'independent_adjuster', label: 'Independent Adjuster', icon: 'user' },
  { value: 'adjusting_company', label: 'Adjusting Company', icon: 'briefcase' },
  { value: 'insurance_company', label: 'Insurance Company', icon: 'shield' },
  { value: 'inspector', label: 'Inspector', icon: 'search' },
  { value: 'contractor', label: 'Contractor', icon: 'tool' },
  { value: 'other', label: 'Other', icon: 'more-horizontal' },
];
export const VOLUMES = [
  { value: '1-10', label: '1–10 reports / month' },
  { value: '11-50', label: '11–50 reports / month' },
  { value: '51-200', label: '51–200 reports / month' },
  { value: '200+', label: '200+ reports / month' },
];
const LAST = 4;

/** Steps shown for this plan: the team step (3) is Enterprise-only, exactly like the web. */
export function visibleSteps(tier: string | undefined): number[] {
  return tier === 'enterprise' ? [0, 1, 2, 3, 4] : [0, 1, 2, 4];
}

/**
 * Web /onboarding for new accounts (`onboardingCompleted === false`): welcome → role → monthly volume → (Enterprise)
 * invite team → finish. Every step is saved server-side so it resumes where it left off, on web or mobile.
 */
export function OnboardingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { userProfile, refreshProfile } = useAuth();
  const steps = visibleSteps(userProfile?.tier);
  const [step, setStep] = useState(() => {
    const s = Math.min(Math.max(userProfile?.onboardingStep ?? 0, 0), LAST);
    return steps.includes(s) ? s : 0;
  });
  const [userType, setUserType] = useState(userProfile?.userType ?? '');
  const [volume, setVolume] = useState(userProfile?.monthlyVolume ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roles = useApiResource(() => teamsApi.roles(), [], userProfile?.tier === 'enterprise');

  const go = async (next: number) => {
    setSaving(true);
    setError(null);
    try {
      await usersApi.saveOnboardingStep(next, { userType: userType || undefined, monthlyVolume: volume || undefined });
      setStep(next);
      refreshProfile().catch(() => undefined);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save this step.'));
    } finally {
      setSaving(false);
    }
  };
  const nextOf = (s: number) => steps[steps.indexOf(s) + 1] ?? LAST;
  const prevOf = (s: number) => steps[Math.max(0, steps.indexOf(s) - 1)];

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      await usersApi.completeOnboarding();
      await refreshProfile();
      router.replace('/report/new');
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not finish onboarding.'));
      setSaving(false);
    }
  };

  const option = (selected: boolean) => [
    styles.option,
    { borderColor: selected ? theme.colors.primary : theme.colors.border, backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface },
  ];

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <BrandMark />
          <View style={styles.progress}>
            <ProgressBar percent={((steps.indexOf(step) + 1) / steps.length) * 100} accessibilityLabel={`Step ${steps.indexOf(step) + 1} of ${steps.length}`} />
          </View>

          {step === 0 ? (
            <>
              <ThemedText variant="heading" accessibilityRole="header" style={styles.title}>
                Welcome to FlacronAI
              </ThemedText>
              <ThemedText variant="body" color="muted" style={styles.sub}>
                Let&apos;s set up your account in a few quick steps so your first report goes smoothly.
              </ThemedText>
              <PrimaryButton icon="arrow-right" label="Get Started" onPress={() => go(1)} loading={saving} />
            </>
          ) : null}

          {step === 1 ? (
            <>
              <ThemedText variant="title" accessibilityRole="header" style={styles.title}>
                What best describes you?
              </ThemedText>
              <ThemedText variant="body" color="muted" style={styles.sub}>
                This helps us tailor your experience.
              </ThemedText>
              <View style={styles.grid}>
                {USER_TYPES.map((t) => (
                  <Pressable key={t.value} onPress={() => setUserType(t.value)} accessibilityRole="radio" accessibilityState={{ selected: userType === t.value }} style={option(userType === t.value)}>
                    <Icon name={t.icon} color={userType === t.value ? theme.colors.primary : theme.colors.muted} />
                    <ThemedText variant="body" style={styles.optionText}>
                      {t.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <ThemedText variant="title" accessibilityRole="header" style={styles.title}>
                How many reports do you generate per month?
              </ThemedText>
              <ThemedText variant="body" color="muted" style={styles.sub}>
                A rough estimate is fine — you can change plans anytime.
              </ThemedText>
              {VOLUMES.map((v) => (
                <Pressable key={v.value} onPress={() => setVolume(v.value)} accessibilityRole="radio" accessibilityState={{ selected: volume === v.value }} style={[option(volume === v.value), styles.full]}>
                  <ThemedText variant="body">{v.label}</ThemedText>
                </Pressable>
              ))}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <ThemedText variant="title" accessibilityRole="header" style={styles.title}>
                Invite your team
              </ThemedText>
              <ThemedText variant="body" color="muted" style={styles.sub}>
                Optional — you can always invite people later from More → Organization.
              </ThemedText>
              {roles.data?.assignableRoles?.length ? <InviteCard roles={roles.data.assignableRoles} onDone={() => go(LAST)} /> : null}
            </>
          ) : null}

          {step === LAST ? (
            <>
              <ThemedText variant="heading" accessibilityRole="header" style={styles.title}>
                You&apos;re all set
              </ThemedText>
              <ThemedText variant="body" color="muted" style={styles.sub}>
                Let&apos;s generate your first automated inspection report.
              </ThemedText>
              <PrimaryButton icon="zap" label="Generate Your First Report" onPress={finish} loading={saving} />
            </>
          ) : null}

          {error ? (
            <View style={styles.error}>
              <ThemedText variant="body" accessibilityRole="alert" style={{ color: theme.colors.error }}>
                {error}
              </ThemedText>
            </View>
          ) : null}

          {step > 0 && step < LAST ? (
            <View style={styles.actions}>
              <View style={styles.flex}>
                <PrimaryButton variant="secondary" label="Back" onPress={() => go(prevOf(step))} disabled={saving} />
              </View>
              <View style={styles.flex}>
                <PrimaryButton
                  label={step === 3 ? 'Continue' : 'Next'}
                  onPress={() => go(nextOf(step))}
                  loading={saving}
                  disabled={(step === 1 && !userType) || (step === 2 && !volume)}
                />
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  column: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  progress: { marginVertical: 20 },
  title: { marginBottom: 6 },
  sub: { marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8, minHeight: 56 },
  optionText: { fontFamily: 'Inter_500Medium' },
  full: { flexBasis: 'auto', marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  flex: { flex: 1 },
  error: { marginTop: 12 },
});
