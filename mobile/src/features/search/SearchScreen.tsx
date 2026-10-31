import type React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ThemedText } from '@/components/ThemedText';
import { Card, Icon, type IconName } from '@/components/ui';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { StatusBadge } from '@/features/reports/components/StatusBadge';
import { MIN_SEARCH_LENGTH, searchApi, type SearchResults } from '@/services/api/search';
import { userScopedKey } from '@/services/localData/userDataLifecycle';
import { useTheme } from '@/theme';

const RECENT_KEY = 'recent_searches';
const MAX_RECENT = 5;

/** Web GlobalSearch (Ctrl+K): reports, photos and (for team admins) members, 300 ms debounce, stale responses
 * dropped, last five searches remembered per account on this device. */
export function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    if (!uid) return;
    AsyncStorage.getItem(userScopedKey(uid, RECENT_KEY))
      .then((raw) => setRecent(raw ? (JSON.parse(raw) as string[]).slice(0, MAX_RECENT) : []))
      .catch(() => undefined);
  }, [uid]);

  useEffect(() => {
    const term = q.trim();
    const id = ++seq.current;
    if (term.length < MIN_SEARCH_LENGTH) {
      const t = setTimeout(() => {
        if (id === seq.current) {
          setResults(null);
          setLoading(false);
          setError(false);
        }
      }, 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await searchApi.search(term);
        if (id === seq.current) setResults(res);
      } catch {
        if (id === seq.current) setError(true);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const remember = (term: string) => {
    if (!uid) return;
    const next = [term, ...recent.filter((r) => r !== term)].slice(0, MAX_RECENT);
    setRecent(next);
    AsyncStorage.setItem(userScopedKey(uid, RECENT_KEY), JSON.stringify(next)).catch(() => undefined);
  };

  const openReport = (id: string) => {
    remember(q.trim());
    router.push({ pathname: '/report/[id]', params: { id } });
  };
  const openMember = (id: string) => {
    remember(q.trim());
    router.push({ pathname: '/team/[memberId]', params: { memberId: id } });
  };

  const empty = results && results.reports.length + results.photos.length + results.team.length === 0;

  return (
    <ScreenContainer>
      <ScreenHeader title="Search" />
      <View style={[styles.search, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <Icon name="search" color={theme.colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          placeholder="Reports, photos, team members…"
          placeholderTextColor={theme.colors.muted}
          accessibilityLabel="Search"
          style={[styles.input, { color: theme.colors.ink, fontFamily: theme.typography.fontFamily.body }]}
        />
        {loading ? <ActivityIndicator color={theme.colors.primary} /> : null}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {!results && !error ? (
          recent.length ? (
            <>
              <ThemedText variant="caption" color="muted" style={styles.group}>
                RECENT SEARCHES
              </ThemedText>
              {recent.map((r) => (
                <Row key={r} icon="clock" title={r} onPress={() => setQ(r)} />
              ))}
            </>
          ) : (
            <ThemedText variant="body" color="muted" style={styles.hint}>
              Search by claim number, insured name, address, loss type, photo name or teammate email.
            </ThemedText>
          )
        ) : null}
        {error ? (
          <ThemedText variant="body" accessibilityRole="alert" style={[styles.hint, { color: theme.colors.error }]}>
            Search failed. Try again.
          </ThemedText>
        ) : null}
        {empty ? (
          <ThemedText variant="body" color="muted" style={styles.hint}>
            No results for “{q.trim()}”.
          </ThemedText>
        ) : null}
        {results?.reports.length ? (
          <Group title="REPORTS">
            {results.reports.map((r) => (
              <Row
                key={r.id}
                icon="file-text"
                title={r.claimNumber || 'Report'}
                detail={[r.insuredName, r.propertyAddress].filter(Boolean).join(' · ')}
                right={r.status ? <StatusBadge status={r.status} /> : null}
                onPress={() => openReport(r.id)}
              />
            ))}
          </Group>
        ) : null}
        {results?.photos.length ? (
          <Group title="PHOTOS">
            {results.photos.map((p) => (
              <Row
                key={`${p.reportId}-${p.photoId}`}
                icon="image"
                title={p.fileName}
                detail={p.claimNumber ? `Claim ${p.claimNumber}` : undefined}
                onPress={() => openReport(p.reportId)}
              />
            ))}
          </Group>
        ) : null}
        {results?.team.length ? (
          <Group title="TEAM">
            {results.team.map((m) => (
              <Row key={m.id} icon="user" title={m.email} detail={`${m.role} · ${m.status}`} onPress={() => openMember(m.id)} />
            ))}
          </Group>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <ThemedText variant="caption" color="muted" style={styles.group}>
        {title}
      </ThemedText>
      <Card padded={false}>{children}</Card>
    </>
  );
}

function Row({ icon, title, detail, right, onPress }: { icon: IconName; title: string; detail?: string; right?: React.ReactNode; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1, borderBottomColor: theme.colors.border }]}>
      <Icon name={icon} color={theme.colors.muted} />
      <View style={styles.flex}>
        <ThemedText variant="body" numberOfLines={1}>
          {title}
        </ThemedText>
        {detail ? (
          <ThemedText variant="caption" color="muted" numberOfLines={1}>
            {detail}
          </ThemedText>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 48 },
  input: { flex: 1, fontSize: 16, paddingVertical: 10 },
  content: { paddingBottom: 32 },
  group: { letterSpacing: 0.6, fontFamily: 'Inter_600SemiBold', marginTop: 18, marginBottom: 8 },
  hint: { marginTop: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1, minWidth: 0 },
});
