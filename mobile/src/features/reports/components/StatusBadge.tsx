import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import type { ReportStatus } from '@/services/api/reports';

/** Same wording as the web StatusBadge (`formatStatus` in Dashboard.jsx), except `draft`, which keeps the
 * "needs review" hint because mobile has no separate review column. */
const LABELS: Record<string, string> = {
  processing: 'Processing',
  failed: 'Failed',
  draft: 'Draft — needs review',
  finalized: 'Finalized',
  completed: 'Completed',
  complete: 'Completed',
  approved: 'Approved',
  archived: 'Archived',
};

/** Web STATUS_STYLES: base colour at 20% fill, 30% border, 600-weight text. */
const TONES: Record<string, { base: string; text: string }> = {
  finalized: { base: '#22C55E', text: '#16A34A' },
  approved: { base: '#22C55E', text: '#16A34A' },
  completed: { base: '#22C55E', text: '#16A34A' },
  complete: { base: '#22C55E', text: '#16A34A' },
  draft: { base: '#F59E0B', text: '#D97706' },
  processing: { base: '#F59E0B', text: '#D97706' },
  failed: { base: '#EF4444', text: '#EF4444' },
};
const DEFAULT_TONE = { base: '#9CA3AF', text: '#6B7280' };

export function formatStatus(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return status
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function StatusBadge({ status }: { status: ReportStatus | string }) {
  const theme = useTheme();
  const tone = TONES[status] ?? DEFAULT_TONE;
  const text = theme.scheme === 'dark' && tone === DEFAULT_TONE ? theme.colors.muted : tone.text;
  const label = LABELS[status] ?? formatStatus(status);

  return (
    <View style={[styles.badge, { backgroundColor: tone.base + '33', borderColor: tone.base + '4D' }]}>
      <ThemedText variant="caption" style={{ color: text, fontFamily: theme.typography.fontFamily.bodySemiBold }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});
