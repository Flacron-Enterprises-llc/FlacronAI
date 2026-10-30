import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

interface ProgressBarProps {
  /** 0–100. */
  percent: number;
  color?: string;
  height?: number;
  accessibilityLabel?: string;
}

export function ProgressBar({ percent, color, height = 8, accessibilityLabel }: ProgressBarProps) {
  const theme = useTheme();
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: value }}
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: theme.colors.border }]}
    >
      <View
        style={[styles.fill, { width: `${value}%`, borderRadius: height / 2, backgroundColor: color ?? theme.colors.primary }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
  fill: { height: '100%' },
});
