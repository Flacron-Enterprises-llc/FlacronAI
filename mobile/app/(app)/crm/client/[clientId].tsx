import { useLocalSearchParams } from 'expo-router';

import { ClientProfileScreen } from '@/features/crm/CrmProfileScreens';

export default function ClientRoute() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  return <ClientProfileScreen clientId={String(clientId)} />;
}
