import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import type { ReportStatus } from '@/services/api/reports';

const LABELS: Record<string, string> = {
  processing: 'Processing',
  draft: 'Draft — needs review',
  finalized: 'Finalized',
  completed: 'Completed',
  approved: 'Approved',
  archived: 'Archived',
};

function toneFor(status: string, theme: ReturnType<typeof useTheme>): { bg: string; fg: string } {
  switch (status) {
    case 'processing':
      return { bg: theme.colors.info + '22', fg: theme.colors.info };
    case 'draft':
      return { bg: theme.colors.warning + '22', fg: theme.colors.warning };
    case 'finalized':
    case 'completed':
    case 'approved':
      return { bg: theme.colors.success + '22', fg: theme.colors.success };
    case 'archived':
      return { bg: theme.colors.border, fg: theme.colors.muted };
    default:
      return { bg: theme.colors.surface, fg: theme.colors.muted };
  }
}

export function StatusBadge({ status }: { status: ReportStatus | string }) {
  const theme = useTheme();
  const { bg, fg } = toneFor(status, theme);
  const label = LABELS[status] ?? status;

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderRadius: theme.radii.btn }]}>
      <ThemedText variant="caption" style={{ color: fg, fontFamily: theme.typography.fontFamily.bodyMedium }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});
