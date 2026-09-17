/**
 * A single report's detail, with lightweight polling while `status === 'processing'` (the
 * background AI pipeline hasn't finished yet — `Report.content` is `null` until then, see
 * `services/api/reports.ts`'s own doc comment on that field). Polling stops the moment status
 * changes away from `processing`, and never runs while the screen is unmounted.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { reportsApi, type Report } from '@/services/api/reports';
import { ApiRequestError } from '@/types/api';

const POLL_INTERVAL_MS = 5000;

interface State {
  report: Report | null;
  loading: boolean;
  error: string | null;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return 'We could not load this report. Please try again.';
}

export function useReportDetail(reportId: string) {
  const [state, setState] = useState<State>({ report: null, loading: true, error: null });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const { report } = await reportsApi.get(reportId);
      if (!mountedRef.current) return;
      setState({ report, loading: false, error: null });
      if (report.status === 'processing') {
        timerRef.current = setTimeout(load, POLL_INTERVAL_MS);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
    }
  }, [reportId]);

  useEffect(() => {
    mountedRef.current = true;
    setState({ report: null, loading: true, error: null });
    load();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load]);

  const applyUpdate = useCallback((updated: Report) => {
    setState((s) => ({ ...s, report: updated }));
  }, []);

  return { ...state, retry: load, applyUpdate };
}
