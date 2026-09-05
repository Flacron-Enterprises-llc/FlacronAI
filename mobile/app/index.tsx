import { StyleSheet, View } from 'react-native';

import { BrandMark } from '@/components/BrandMark';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';

export default function HomeScreen() {
  const theme = useTheme();

  return (
    <ScreenContainer centered>
      <View style={styles.hero}>
        <BrandMark size={112} />

        <ThemedText variant="heading" style={styles.title}>
          FlacronAI
        </ThemedText>

        <ThemedText variant="subtitle" color="muted" style={styles.tagline}>
          AI-assisted insurance inspection reports
        </ThemedText>
      </View>

      <View
        style={[
          styles.badge,
          { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
        ]}
      >
        <ThemedText variant="caption" color="muted">
          Foundation build — mobile app in development
        </ThemedText>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: 12,
  },
  title: {
    marginTop: 8,
    textAlign: 'center',
  },
  tagline: {
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
