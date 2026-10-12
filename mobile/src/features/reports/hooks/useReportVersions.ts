import { useCallback, useEffect, useState } from 'react';

import { useActiveId } from './useActiveId';

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
  // The id whose versions are loaded (not a boolean), so a new report id loads its own.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const activeId = useActiveId(reportId);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { versions } = await reportsApi.getVersions(reportId);
      if (activeId.current !== reportId) return;
      setState({ versions, loading: false, error: null });
      setLoadedFor(reportId);
    } catch (err) {
      if (activeId.current !== reportId) return;
      setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
    }
  }, [reportId, activeId]);

  useEffect(() => {
    if (enabled && loadedFor !== reportId) load();
  }, [enabled, loadedFor, reportId, load]);

  return { ...state, retry: load };
}
