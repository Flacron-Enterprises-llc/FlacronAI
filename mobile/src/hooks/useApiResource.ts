import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiRequestError } from '@/types/api';

export interface ApiResource<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** Re-fetch keeping the current data on screen (pull-to-refresh / focus refresh). */
  refresh: () => Promise<void>;
  /** Re-fetch showing the loading state (after an error). */
  retry: () => Promise<void>;
}

export function apiErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return err instanceof ApiRequestError ? err.message : fallback;
}

/**
 * One server read with loading / refreshing / error state. A response that arrives after a newer request started
 * (or after unmount) is dropped, so a slow earlier call can never overwrite fresher data.
 */
export function useApiResource<T>(fetcher: () => Promise<T>, deps: readonly unknown[] = [], enabled = true): ApiResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  // Latest fetcher without re-creating `load` every render; `deps` (serialised) decides when to refetch.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const depsKey = JSON.stringify(deps);

  const load = useCallback(
    async (silent: boolean) => {
      if (!enabled) return;
      const id = ++seq.current;
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await fetcherRef.current();
        if (id === seq.current) setData(result);
      } catch (err) {
        if (id === seq.current) setError(apiErrorMessage(err));
      } finally {
        if (id === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [depsKey, enabled]
  );

  useEffect(() => {
    (async () => {
      await load(false);
    })();
    return () => {
      seq.current += 1;
    };
  }, [load]);

  return { data, loading, refreshing, error, refresh: () => load(true), retry: () => load(false) };
}
