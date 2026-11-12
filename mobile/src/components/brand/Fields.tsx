import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { brand, lossTone, tones, type ToneName } from '@/theme/brand';

/** Reference search bar: rounded light field with a search glyph and an optional trailing control (filter). */
export function SearchField({ trailing, ...rest }: TextInputProps & { trailing?: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.search}>
        <Icon name="search" size={17} color={brand.muted} />
        <TextInput
          placeholderTextColor="#8A97AD"
          returnKeyType="search"
          autoCorrect={false}
          style={styles.input}
          {...rest}
        />
      </View>
      {trailing}
    </View>
  );
}

/** Tinted rounded tag (reference: "Water Damage", "Mold", "Fire Damage"). */
export function Pill({ label, tone = 'slate' }: { label: string; tone?: ToneName }) {
  const t = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.pillText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A report's loss type as a coloured pill, e.g. "Water" → "Water Damage". */
export function LossPill({ lossType }: { lossType: string | null | undefined }) {
  if (!lossType) return null;
  const label = /damage|loss/i.test(lossType) ? lossType : `${lossType} Damage`;
  return <Pill label={label} tone={lossTone(lossType)} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: brand.line,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  input: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14.5, color: brand.ink, paddingVertical: 10 },
  pill: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontFamily: 'Inter_600SemiBold', fontSize: 11.5 },
});
