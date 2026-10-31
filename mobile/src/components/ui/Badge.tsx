import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';

export type BadgeTone = 'neutral' | 'brand' | 'navy' | 'success' | 'warning' | 'error' | 'info';

export function toneColors(tone: BadgeTone, theme: ReturnType<typeof useTheme>): { bg: string; fg: string } {
  const c = theme.colors;
  switch (tone) {
    case 'brand':
      return { bg: c.primarySoft, fg: c.primary };
    case 'navy':
      return { bg: c.navy + '1F', fg: c.navy };
    case 'success':
      return { bg: c.success + '1F', fg: c.success };
    case 'warning':
      return { bg: c.warning + '1F', fg: c.warning };
    case 'error':
      return { bg: c.error + '1F', fg: c.error };
    case 'info':
      return { bg: c.info + '1F', fg: c.info };
    default:
      return { bg: c.surface, fg: c.muted };
  }
}

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
}

/** Pill badge (web `rounded-full px-2.5 py-0.5 text-xs font-semibold`). */
export function Badge({ label, tone = 'neutral', icon }: BadgeProps) {
  const theme = useTheme();
  const { bg, fg } = toneColors(tone, theme);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon ? <Icon name={icon} size={12} color={fg} /> : null}
      <ThemedText variant="caption" style={{ color: fg, fontFamily: theme.typography.fontFamily.bodySemiBold }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
});
