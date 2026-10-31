import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { brand, shadows, tones, type ToneName } from '@/theme/brand';
import { ScalePressable } from './ScalePressable';

/** Reference stat chip: tinted tile, big coloured number, small label. A missing value shows "—", never a guess. */
export function StatChip({
  value,
  label,
  tone,
  loading,
  onPress,
}: {
  value: number | string | null | undefined;
  label: string;
  tone: ToneName;
  loading?: boolean;
  onPress?: () => void;
}) {
  const t = tones[tone];
  const shown = value == null ? '—' : String(value);
  return (
    <ScalePressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${loading ? 'loading' : shown}`}
      style={[styles.chip, { backgroundColor: t.bg }]}
    >
      {loading ? (
        <ActivityIndicator color={t.fg} style={styles.loader} />
      ) : (
        <Text style={[styles.chipValue, { color: t.fg }]} numberOfLines={1} adjustsFontSizeToFit>
          {shown}
        </Text>
      )}
      <Text style={[styles.chipLabel, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </ScalePressable>
  );
}

/** Reference feature tile: white card, coloured glyph, label. `locked` tiles route to the plan page instead. */
export function ActionTile({
  icon,
  label,
  tone,
  onPress,
  locked,
}: {
  icon: IconName;
  label: string;
  tone: ToneName;
  onPress: () => void;
  locked?: boolean;
}) {
  const t = tones[tone];
  return (
    <ScalePressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={locked ? `${label}, not included in your plan` : label}
      style={[styles.tile, shadows.card]}
    >
      <View style={[styles.tileIcon, { backgroundColor: t.bg }]}>
        <Icon name={icon} size={24} color={t.fg} />
      </View>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
      {locked ? (
        <View style={styles.lock}>
          <Icon name="lock" size={11} color={brand.muted} />
        </View>
      ) : null}
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  chip: { flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', minHeight: 74, justifyContent: 'center' },
  chipValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 24, lineHeight: 28 },
  chipLabel: { fontFamily: 'Inter_500Medium', fontSize: 11.5, marginTop: 2 },
  loader: { height: 28 },
  tile: {
    flex: 1,
    backgroundColor: brand.card,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: brand.line,
  },
  tileIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontFamily: 'Inter_500Medium', fontSize: 12.5, color: brand.ink },
  lock: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: brand.canvas, alignItems: 'center', justifyContent: 'center' },
});
