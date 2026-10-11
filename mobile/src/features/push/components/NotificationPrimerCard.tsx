import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { usePushNotifications } from '../PushNotificationsProvider';
import { PERMISSION_EXPLANATION, shouldShowPrimer } from '../pushStatus';

/** One-time, dismissible explanation shown on the dashboard before the OS permission prompt.
 * The prompt itself only appears when the user taps "Turn on"; either choice hides this card
 * for good (Settings keeps the control). */
export function NotificationPrimerCard() {
  const theme = useTheme();
  const { state, enable, primerDismissed, dismissPrimer } = usePushNotifications();
  if (!shouldShowPrimer(state, primerDismissed)) return null;

  return (
    <View
      style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card }]}
    >
      <ThemedText variant="subtitle">Get report updates</ThemedText>
      <ThemedText variant="caption" color="muted" style={styles.body}>
        {PERMISSION_EXPLANATION}
      </ThemedText>
      <View style={styles.actions}>
        <View style={styles.action}>
          <PrimaryButton label="Turn on" onPress={() => enable()} loading={state.requesting} />
        </View>
        <View style={styles.action}>
          <PrimaryButton variant="secondary" label="Not now" onPress={dismissPrimer} disabled={state.requesting} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 14,
    marginBottom: 20,
  },
  body: {
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  action: {
    flex: 1,
  },
});
