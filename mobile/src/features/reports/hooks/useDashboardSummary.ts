import { useCallback, useEffect, useState } from 'react';

import { reportsApi, type DashboardSummary } from '@/services/api/reports';
import { ApiRequestError } from '@/types/api';

interface State {
  summary: DashboardSummary | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return 'We could not load your dashboard. Please try again.';
}

/** Server is the sole source of truth for these counts (Golden Rule #4/#1 — never compute or
 * guess a stat client-side). */
export function useDashboardSummary() {
  const [state, setState] = useState<State>({ summary: null, loading: true, refreshing: false, error: null });

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    setState((s) => ({ ...s, loading: !opts.silent && !s.summary, refreshing: !!opts.silent, error: null }));
    try {
      const { summary } = await reportsApi.getDashboardSummary();
      setState({ summary, loading: false, refreshing: false, error: null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, refreshing: false, error: errorMessage(err) }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, refresh: () => load({ silent: true }), retry: () => load() };
}
