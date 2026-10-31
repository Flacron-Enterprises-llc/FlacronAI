import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Icon } from '@/components/ui';
import { notificationsApi } from '@/services/api/notifications';
import { useTheme } from '@/theme';

/** Web NotificationBell: unread badge from the live `unreadCount` on the first inbox page; refreshed on focus. */
export function NotificationBell() {
  const theme = useTheme();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      notificationsApi
        .list(1, 1)
        .then((page) => active && setUnread(page.unreadCount ?? 0))
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [])
  );

  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Icon name="bell" size={20} />
      {unread > 0 ? (
        <View style={[styles.dot, { backgroundColor: theme.colors.primary, borderColor: theme.colors.background }]}>
          <ThemedText variant="caption" style={styles.dotText}>
            {unread > 99 ? '99+' : unread}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { color: '#FFFFFF', fontSize: 10, fontFamily: 'Inter_600SemiBold' },
});
