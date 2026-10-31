import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Badge, type BadgeTone } from '@/components/ui';
import { useApiResource } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { StateMessage } from '@/features/reports/components/StateMessage';
import { usersApi } from '@/services/api/users';
import { useTheme } from '@/theme';
import { AccountScaffold, Card } from '../components/AccountScaffold';

const ACTIONS: Record<string, { label: string; tone: BadgeTone }> = {
  login_success: { label: 'Signed in', tone: 'success' },
  login_failed: { label: 'Failed sign-in', tone: 'error' },
  suspicious_login_new_device: { label: 'New device', tone: 'warning' },
  logout: { label: 'Signed out', tone: 'neutral' },
};

/** Coarse device description from the user agent (no third-party parsing). */
export function describeAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  const app = /okhttp|Expo|FlacronAI|CFNetwork|Dalvik/i.test(ua)
    ? 'FlacronAI app'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  return [app, os].filter(Boolean).join(' on ');
}

/** Web Settings → Security → Login history: the caller's own sign-in events (GET /users/login-history). */
export function LoginHistoryScreen() {
  const theme = useTheme();
  const [page, setPage] = useState(1);
  const res = useApiResource(() => usersApi.getLoginHistory(page, 10), [page]);
  const data = res.data;

  return (
    <AccountScaffold title="Login history">
      <ThemedText variant="body" color="muted" style={styles.intro}>
        Recent sign-ins to your account. If you don’t recognise one, change your password and turn on two-factor
        authentication.
      </ThemedText>
      {res.loading && !data ? (
        <StateMessage title="Loading…" />
      ) : res.error && !data ? (
        <StateMessage title="Could not load login history" description={res.error} onRetry={res.retry} />
      ) : !data || data.items.length === 0 ? (
        <StateMessage title="No sign-in events yet" />
      ) : (
        <>
          <Card>
            {data.items.map((e, i) => {
              const a = ACTIONS[e.action] ?? { label: e.action, tone: 'neutral' as const };
              return (
                <View key={e.id ?? `${e.timestamp}-${i}`} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }]}>
                  <View style={styles.flex}>
                    <ThemedText variant="body">{new Date(e.timestamp).toLocaleString()}</ThemedText>
                    <ThemedText variant="caption" color="muted">
                      {describeAgent(e.userAgent)}
                      {e.ip ? ` · ${e.ip}` : ''}
                    </ThemedText>
                  </View>
                  <Badge label={a.label} tone={a.tone} />
                </View>
              );
            })}
          </Card>
          <View style={styles.pager}>
            <View style={styles.flex}>
              <PrimaryButton variant="secondary" label="Newer" onPress={() => setPage((p) => p - 1)} disabled={data.page <= 1 || res.loading} />
            </View>
            <ThemedText variant="caption" color="muted">
              {data.page} / {data.totalPages}
            </ThemedText>
            <View style={styles.flex}>
              <PrimaryButton variant="secondary" label="Older" onPress={() => setPage((p) => p + 1)} disabled={data.page >= data.totalPages || res.loading} />
            </View>
          </View>
        </>
      )}
    </AccountScaffold>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  flex: { flex: 1 },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
});
