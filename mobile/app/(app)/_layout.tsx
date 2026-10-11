import { Stack } from 'expo-router';

import { BillingProvider } from '@/features/billing/BillingProvider';

/** Protected app shell — only ever rendered once AuthProvider's status is
 * 'authenticated' (see app/_layout.tsx's Stack.Protected guard). Hosts the `(tabs)` group
 * (dashboard/reports/settings) plus the stack-pushed `report/new` wizard, `report/[id]`
 * detail and `subscription` screens.
 *
 * BillingProvider (Phase 7) lives here so store listeners exist only for a signed-in
 * account and are torn down on Sign Out / account switch. */
export default function AppLayout() {
  return (
    <BillingProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </BillingProvider>
  );
}
