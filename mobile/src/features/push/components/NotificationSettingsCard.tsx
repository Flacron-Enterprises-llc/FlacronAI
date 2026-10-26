import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { usePushNotifications } from '../PushNotificationsProvider';
import { describePushStatus } from '../pushStatus';

const ACTION_LABELS = {
  enable: 'Turn on notifications',
  'open-settings': 'Open device settings',
  retry: 'Try again',
} as const;

/** Settings → Notifications: current status, the permission explanation, and the one action
 * that makes sense for the current state. */
export function NotificationSettingsCard() {
  const theme = useTheme();
  const { state, enable, openSettings, retry } = usePushNotifications();
  const view = describePushStatus(state);
  const toneColor =
    view.tone === 'success' ? theme.colors.success : view.tone === 'warning' ? theme.colors.warning : theme.colors.ink;

  const onAction = () => {
    if (view.action === 'enable') enable();
    else if (view.action === 'open-settings') openSettings();
    else if (view.action === 'retry') retry();
  };

  return (
    <View
      style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card }]}
      accessibilityLabel={`Push notifications: ${view.label}`}
    >
      <ThemedText variant="caption" color="muted">
        Push notifications
      </ThemedText>
      <ThemedText variant="body" style={[styles.label, { color: toneColor }]}>
        {view.label}
      </ThemedText>
      {view.description ? (
        <ThemedText variant="caption" color="muted" style={styles.description}>
          {view.description}
        </ThemedText>
      ) : null}
      {view.action ? (
        <View style={styles.action}>
          <PrimaryButton
            variant={view.action === 'enable' ? 'primary' : 'secondary'}
            label={ACTION_LABELS[view.action]}
            onPress={onAction}
            loading={view.action === 'enable' && state.requesting}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 14,
    marginBottom: 24,
  },
  label: {
    marginTop: 2,
  },
  description: {
    marginTop: 6,
  },
  action: {
    marginTop: 12,
  },
});
