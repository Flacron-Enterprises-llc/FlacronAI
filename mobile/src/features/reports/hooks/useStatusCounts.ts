import { useCallback, useEffect, useState } from 'react';

import { reportsApi } from '@/services/api/reports';

async function fetchCounts(key: string): Promise<Record<string, number>> {
  const list = JSON.parse(key) as (string | null)[];
  const results = await Promise.all(
    list.map((status) =>
      reportsApi
        .list({ page: 1, limit: 1, ...(status ? { status } : {}) })
        .then((r) => [status ?? '', r.total] as const)
        .catch(() => null)
    )
  );
  return Object.fromEntries(results.filter((r): r is readonly [string, number] => r !== null));
}

/**
 * Per-status report totals for the list's filter tabs ("All (12)", "Draft (1)"), read from the server's own `total`
 * (`GET /reports?status=…&limit=1`). A count that fails to load stays unknown (no number shown) rather than guessed.
 */
export function useStatusCounts(statuses: (string | undefined)[]) {
  const key = JSON.stringify(statuses);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    fetchCounts(key).then((c) => active && setCounts(c));
    return () => {
      active = false;
    };
  }, [key]);

  const refresh = useCallback(() => {
    fetchCounts(key).then(setCounts);
  }, [key]);

  return { get: (status: string | undefined): number | null => counts[status ?? ''] ?? null, refresh };
}
