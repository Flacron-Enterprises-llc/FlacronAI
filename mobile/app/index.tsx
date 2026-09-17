import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/context/AuthProvider';

/**
 * The single always-reachable anchor route ("/") — computes where to send the user based
 * on AuthProvider's derived `status` and issues a declarative `<Redirect>`. Kept
 * deliberately outside every Stack.Protected group (see app/_layout.tsx) so there is
 * always exactly one unambiguous entry point, instead of relying on Expo Router's
 * "redirect to the anchor route" default when a guarded route is denied.
 *
 * Renders nothing while `status === 'loading'` — the root layout keeps the splash screen
 * up for that entire window, so this is never visibly reached mid-decision (prevents any
 * flash of the wrong destination).
 */
export default function RootIndex() {
  const { status } = useAuth();

  switch (status) {
    case 'signed-out':
      return <Redirect href="/login" />;
    case 'needs-email-verification':
      return <Redirect href="/verify-email" />;
    case 'needs-mfa':
      return <Redirect href="/mfa" />;
    case 'profile-unavailable':
      return <Redirect href="/account-unavailable" />;
    case 'authenticated':
      return <Redirect href="/dashboard" />;
    case 'loading':
    default:
      return null;
  }
}
