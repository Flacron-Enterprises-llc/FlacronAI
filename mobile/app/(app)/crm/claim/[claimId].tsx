import { useLocalSearchParams } from 'expo-router';

import { ClaimProfileScreen } from '@/features/crm/CrmProfileScreens';

export default function ClaimRoute() {
  const { claimId } = useLocalSearchParams<{ claimId: string }>();
  return <ClaimProfileScreen claimId={String(claimId)} />;
}
