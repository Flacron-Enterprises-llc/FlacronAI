import { useLocalSearchParams } from 'expo-router';

import { ReportDetailScreen } from '@/features/reports/screens/ReportDetailScreen';

export default function ReportDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReportDetailScreen reportId={id} />;
}
