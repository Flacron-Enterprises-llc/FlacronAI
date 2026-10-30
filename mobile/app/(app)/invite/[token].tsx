import { useLocalSearchParams } from 'expo-router';

import { AcceptInviteScreen } from '@/features/organization/AcceptInviteScreen';

export default function InviteRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <AcceptInviteScreen token={String(token)} />;
}
