import { useLocalSearchParams } from 'expo-router';

import { MemberProfileScreen } from '@/features/organization/MemberProfileScreen';

export default function MemberRoute() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  return <MemberProfileScreen memberId={String(memberId)} />;
}
