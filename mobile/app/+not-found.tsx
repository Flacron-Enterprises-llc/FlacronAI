import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';

export default function NotFoundScreen() {
  return (
    <ScreenContainer centered>
      <ThemedText variant="title">This screen doesn&apos;t exist.</ThemedText>
      <Link href="/" style={styles.link}>
        <ThemedText variant="body" color="primary">
          Go to home screen
        </ThemedText>
      </Link>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  link: {
    marginTop: 16,
  },
});
