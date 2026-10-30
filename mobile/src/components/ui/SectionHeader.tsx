import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <ThemedText variant="subtitle" accessibilityRole="header" style={{ fontFamily: theme.typography.fontFamily.display }}>
        {title}
      </ThemedText>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={12} style={styles.action}>
          <ThemedText variant="body" color="primary" style={{ fontFamily: theme.typography.fontFamily.bodyMedium }}>
            {actionLabel}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  action: { minHeight: 44, justifyContent: 'center' },
});
