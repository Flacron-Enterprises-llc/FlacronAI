import { Redirect, Stack, useSegments } from 'expo-router';

import { useAuth } from '@/features/auth/context/AuthProvider';
import { BillingProvider } from '@/features/billing/BillingProvider';

/** Routes a new account may open before finishing onboarding (account deletion and legal stay reachable). */
const ONBOARDING_EXEMPT = new Set(['onboarding', 'account', 'invite']);

/** Protected app shell — only ever rendered once AuthProvider's status is
 * 'authenticated' (see app/_layout.tsx's Stack.Protected guard). Hosts the `(tabs)` group
 * plus the stack-pushed screens.
 *
 * Onboarding gate (web ProtectedRoute): only `onboardingCompleted === false` — a new account — is sent to the
 * questionnaire; `undefined` means an account created before onboarding existed and is treated as done.
 *
 * BillingProvider (Phase 7) lives here so store listeners exist only for a signed-in
 * account and are torn down on Sign Out / account switch. */
export default function AppLayout() {
  const { userProfile } = useAuth();
  const segments = useSegments() as string[];
  const here = segments[1];
  if (userProfile?.onboardingCompleted === false && !ONBOARDING_EXEMPT.has(here ?? '')) {
    return <Redirect href="/onboarding" />;
  }
  return (
    <BillingProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </BillingProvider>
  );
}
