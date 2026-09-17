/**
 * Reports list with offset pagination (`GET /reports` — see `reportsApi.list`'s own comment:
 * offset-based, not cursor-based), pull-to-refresh, "load more" on scroll, and an
 * offline-aware error state. One `status` filter is exposed (the dashboard's main use case);
 * more filters exist server-side but aren't needed for Phase 5's list screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { isOffline } from '@/services/api/offline';
import { reportsApi, type Report } from '@/services/api/reports';
import { ApiRequestError } from '@/types/api';

const PAGE_LIMIT = 20;

interface State {
  reports: Report[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  isOffline: boolean;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.category === 'offline') return 'You appear to be offline. Pull down to try again once connected.';
    return err.message;
  }
  return 'We could not load your reports. Please try again.';
}

export function useReportsList(status?: string) {
  const [state, setState] = useState<State>({
    reports: [],
    page: 1,
    hasMore: false,
    loading: true,
    refreshing: false,
    loadingMore: false,
    error: null,
    isOffline: false,
  });
  // Avoids a stale-closure race where a slow page-1 refresh response overwrites a
  // newer page-2 "load more" result (or vice versa) if both are in flight.
  const requestSeq = useRef(0);

  const load = useCallback(
    async (page: number, mode: 'initial' | 'refresh' | 'more') => {
      const seq = ++requestSeq.current;
      setState((s) => ({
        ...s,
        loading: mode === 'initial',
        refreshing: mode === 'refresh',
        loadingMore: mode === 'more',
        error: null,
      }));

      const offline = await isOffline();
      if (offline === true) {
        if (seq !== requestSeq.current) return;
        setState((s) => ({ ...s, loading: false, refreshing: false, loadingMore: false, isOffline: true }));
        return;
      }

      try {
        const result = await reportsApi.list({ page, limit: PAGE_LIMIT, status });
        if (seq !== requestSeq.current) return;
        setState((s) => ({
          reports: mode === 'more' ? [...s.reports, ...result.data] : result.data,
          page: result.page,
          hasMore: result.hasMore,
          loading: false,
          refreshing: false,
          loadingMore: false,
          error: null,
          isOffline: false,
        }));
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setState((s) => ({ ...s, loading: false, refreshing: false, loadingMore: false, error: errorMessage(err) }));
      }
    },
    [status]
  );

  useEffect(() => {
    load(1, 'initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const refresh = useCallback(() => load(1, 'refresh'), [load]);
  const loadMore = useCallback(() => {
    if (state.loading || state.refreshing || state.loadingMore || !state.hasMore) return;
    load(state.page + 1, 'more');
  }, [load, state.loading, state.refreshing, state.loadingMore, state.hasMore, state.page]);

  return { ...state, refresh, loadMore, retry: () => load(1, 'initial') };
}
