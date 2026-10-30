import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { Card } from './Card';
import { Icon, type IconName } from './Icon';

interface MetricCardProps {
  icon: IconName;
  label: string;
  value: number | string | null | undefined;
  sub?: string;
  loading?: boolean;
  error?: boolean;
}

/**
 * Web `MetricCard` (Dashboard.jsx): icon tile + label + value. Shows "—" / "Unavailable"
 * rather than a guessed number when the server value is missing (Golden Rules #1/#4).
 */
export function MetricCard({ icon, label, value, sub, loading, error }: MetricCardProps) {
  const theme = useTheme();
  const shown = error || value == null ? '—' : value;
  return (
    <Card style={styles.card}>
      <View style={[styles.iconTile, { backgroundColor: theme.colors.primarySoft }]}>
        <Icon name={icon} size={18} color={theme.colors.primary} />
      </View>
      <ThemedText variant="caption" color="muted" numberOfLines={2} style={styles.label}>
        {label}
      </ThemedText>
      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
      ) : (
        <ThemedText variant="title" accessibilityLabel={`${label}: ${error ? 'unavailable' : shown}`} style={styles.value}>
          {shown}
        </ThemedText>
      )}
      {error ? (
        <ThemedText variant="caption" color="muted">
          Unavailable
        </ThemedText>
      ) : sub ? (
        <ThemedText variant="caption" color="muted" numberOfLines={1}>
          {sub}
        </ThemedText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexGrow: 1, flexBasis: '45%', minWidth: 140 },
  iconTile: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  label: { marginBottom: 4 },
  value: { marginBottom: 2 },
  loader: { alignSelf: 'flex-start', marginVertical: 6 },
});
