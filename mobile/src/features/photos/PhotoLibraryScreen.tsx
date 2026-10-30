import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ThemedText } from '@/components/ThemedText';
import { Badge, Icon } from '@/components/ui';
import { apiErrorMessage } from '@/hooks/useApiResource';
import { AuthenticatedThumb } from '@/features/photos/components/AuthenticatedThumb';
import { StateMessage } from '@/features/reports/components/StateMessage';
import { ChoiceChips } from '@/features/reports/wizard/components/ChoiceChips';
import { clearPhotoCacheScope } from '@/services/localData/fileCache';
import { photosApi, type LibraryPhoto } from '@/services/api/photos';
import { reportsApi } from '@/services/api/reports';
import { useTheme } from '@/theme';

const SORTS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Claim', value: 'claim' },
  { label: 'Category', value: 'category' },
] as const;
const INCLUSION = [
  { label: 'All', value: undefined },
  { label: 'Included', value: 'included' },
  { label: 'Excluded', value: 'excluded' },
] as const;
const SCOPE = 'photo-library';

/** Web Photo Library: every photo across your reports with search, sort and included/excluded filters. Tapping a photo
 * opens its report, where the photo review (accept / edit / exclude / note) happens. */
export function PhotoLibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cols = width >= 900 ? 5 : width >= 600 ? 4 : 2;
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<string>('Newest');
  const [inclusion, setInclusion] = useState<string>('All');
  const [items, setItems] = useState<LibraryPhoto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => () => clearPhotoCacheScope(SCOPE), []);

  const load = useCallback(
    async (next: string | null) => {
      const id = ++seq.current;
      if (next) setMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await photosApi.list({
          cursor: next ?? undefined,
          search: search || undefined,
          sort: SORTS.find((s) => s.label === sort)?.value,
          inclusion: INCLUSION.find((i) => i.label === inclusion)?.value,
        });
        if (id !== seq.current) return;
        setItems((prev) => (next ? [...prev, ...res.photos] : res.photos));
        setCursor(res.nextCursor);
        setTotal(res.totalCount);
      } catch (err) {
        if (id === seq.current) setError(apiErrorMessage(err, 'Could not load photos.'));
      } finally {
        if (id === seq.current) {
          setLoading(false);
          setMore(false);
        }
      }
    },
    [search, sort, inclusion]
  );
  useEffect(() => {
    (async () => {
      await load(null);
    })();
  }, [load]);

  const size = (width - 32 - (cols - 1) * 8) / cols;

  return (
    <ScreenContainer>
      <ScreenHeader title="Photo Library" subtitle={total ? `${total} photo${total === 1 ? '' : 's'}` : undefined} />
      <View style={[styles.search, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <Icon name="search" color={theme.colors.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search claim, file, location…" placeholderTextColor={theme.colors.muted} accessibilityLabel="Search photos" style={[styles.input, { color: theme.colors.ink }]} />
      </View>
      <ChoiceChips label="Sort" value={sort} options={SORTS.map((s) => s.label)} onChange={setSort} />
      <ChoiceChips label="Show" value={inclusion} options={INCLUSION.map((i) => i.label)} onChange={setInclusion} />
      {loading && !items.length ? (
        <StateMessage title="Loading…" />
      ) : error && !items.length ? (
        <StateMessage title="Could not load photos" description={error} onRetry={() => load(null)} />
      ) : (
        <FlatList
          key={cols}
          data={items}
          numColumns={cols}
          keyExtractor={(p) => `${p.reportId}-${p.photoId}`}
          columnWrapperStyle={cols > 1 ? styles.gap : undefined}
          onEndReachedThreshold={0.5}
          onEndReached={() => cursor && !more && load(cursor)}
          ListEmptyComponent={<StateMessage title="No photos found" />}
          ListFooterComponent={more ? <ActivityIndicator color={theme.colors.primary} style={styles.more} /> : null}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/report/[id]', params: { id: item.reportId } })}
              accessibilityRole="button"
              accessibilityLabel={`${item.fileName ?? 'Photo'}, claim ${item.claimNumber ?? ''}`}
              style={[styles.tile, { width: size, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
            >
              <View style={{ width: '100%', height: size * 0.75 }}>
                {item.hasThumbnail ? (
                  <AuthenticatedThumb scope={SCOPE} cacheKey={`${item.reportId}-${item.photoId}`} fetcher={() => reportsApi.getPhotoImage(item.reportId, item.photoId, 'thumbnail')} />
                ) : (
                  <View style={[styles.noThumb, { backgroundColor: theme.colors.border }]}>
                    <Icon name="image" color={theme.colors.muted} />
                  </View>
                )}
              </View>
              <View style={styles.meta}>
                <ThemedText variant="caption" numberOfLines={1} style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
                  {item.roomOrArea || item.location || item.fileName || 'Photo'}
                </ThemedText>
                <ThemedText variant="caption" color="muted" numberOfLines={1}>
                  {item.claimNumber ?? ''}
                </ThemedText>
                {item.review?.status === 'excluded' ? <Badge label="Excluded" tone="error" /> : item.analysisStatus === 'needs_attention' ? <Badge label="Needs attention" tone="warning" /> : null}
              </View>
            </Pressable>
          )}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 46, marginBottom: 12 },
  input: { flex: 1, fontSize: 15, paddingVertical: 8 },
  gap: { gap: 8 },
  tile: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  noThumb: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  meta: { padding: 8, gap: 2 },
  more: { marginVertical: 16 },
});
