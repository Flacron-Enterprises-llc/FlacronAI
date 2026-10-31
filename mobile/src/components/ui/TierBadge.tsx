import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';

const LABELS: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  agency: 'Agency',
  enterprise: 'Enterprise',
};

/** Web TierBadge (`index.css` .tier-badge-*): gray pill for Starter, blue pill for paid plans. Renders nothing for an
 * unknown tier rather than implying a plan the server didn't report (Golden Rule #4). */
export function TierBadge({ tier }: { tier: string | null | undefined }) {
  const theme = useTheme();
  if (!tier || !LABELS[tier]) return null;
  const paid = tier !== 'starter';
  const base = paid ? '#3B82F6' : '#6B7280';
  const text = paid ? (theme.scheme === 'dark' ? '#93C5FD' : '#1D4ED8') : theme.colors.muted;
  return (
    <View
      accessibilityLabel={`${LABELS[tier]} plan`}
      style={[styles.badge, { backgroundColor: base + '33', borderColor: base + '4D' }]}
    >
      <ThemedText variant="caption" style={{ color: text, fontFamily: theme.typography.fontFamily.bodySemiBold }}>
        {LABELS[tier]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
});
