import { useCallback, useEffect, useState } from 'react';

import { reportsApi, type ReportVersion } from '@/services/api/reports';
import { ApiRequestError } from '@/types/api';

interface State {
  versions: ReportVersion[];
  loading: boolean;
  error: string | null;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return 'We could not load the version history. Please try again.';
}

/** Read-only audit trail — see `reports.js`'s `recordVersion()`. Loaded lazily (only when the
 * Versions tab is actually opened) since most report-detail visits never need it. */
export function useReportVersions(reportId: string, enabled: boolean) {
  const [state, setState] = useState<State>({ versions: [], loading: false, error: null });
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { versions } = await reportsApi.getVersions(reportId);
      setState({ versions, loading: false, error: null });
      setLoaded(true);
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
    }
  }, [reportId]);

  useEffect(() => {
    if (enabled && !loaded) load();
  }, [enabled, loaded, load]);

  return { ...state, retry: load };
}
