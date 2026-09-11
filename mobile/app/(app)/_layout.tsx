import { Stack } from 'expo-router';

/** Protected app shell — only ever rendered once AuthProvider's status is
 * 'authenticated' (see app/_layout.tsx's Stack.Protected guard). Placeholder-scoped:
 * Phase 3 stops at a signed-in confirmation screen, per its own boundaries — no
 * dashboard/report work starts here (that's Phase 5). */
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
