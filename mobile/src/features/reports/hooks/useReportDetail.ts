/**
 * A single report's detail, with polling while `status === 'processing'` (the background AI
 * pipeline hasn't finished yet — `Report.content` is `null` until then, see
 * `services/api/reports.ts`'s own doc comment on that field).
 *
 * Polling rules:
 * - Exactly one timer at a time — every load clears any pending one first, so a manual
 *   refresh mid-poll can never start a second loop.
 * - A transient failure (offline/timeout/5xx/429) while polling keeps the last good report on
 *   screen, reports the problem, and retries with backoff (`nextPollDelay`) — it never silently
 *   stops.
 * - Stops when the report leaves `processing`, on a non-recoverable error (404/permission/
 *   auth), after `MAX_POLL_DURATION_MS` (the user can resume with Refresh), or on unmount.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { reportsApi, type Report, type ReportAccess } from '@/services/api/reports';
import { ApiRequestError } from '@/types/api';
import { notifyReportsChanged } from '../reportsEvents';

export const POLL_INTERVAL_MS = 5000;
export const MAX_POLL_BACKOFF_MS = 30000;
export const MAX_POLL_DURATION_MS = 10 * 60 * 1000;

/** Delay before the next poll given how many consecutive polls have failed. */
export function nextPollDelay(consecutiveErrors: number): number {
  if (consecutiveErrors <= 0) return POLL_INTERVAL_MS;
  return Math.min(MAX_POLL_BACKOFF_MS, POLL_INTERVAL_MS * 2 ** consecutiveErrors);
}

export function isTransientError(err: unknown): boolean {
  return (
    err instanceof ApiRequestError &&
    (err.category === 'offline' || err.category === 'timeout' || err.category === 'transient_server' || err.category === 'rate_limited')
  );
}

interface State {
  report: Report | null;
  myAccess: ReportAccess | null;
  loading: boolean;
  /** Initial-load failure (nothing to show yet). */
  error: string | null;
  /** A refresh/poll problem while a report is already on screen. */
  pollIssue: string | null;
  /** Polling gave up (time limit or a non-recoverable error) while still `processing`. */
  pollingStopped: boolean;
  retryingAnalysis: boolean;
  actionError: string | null;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return 'We could not load this report. Please try again.';
}

const INITIAL: State = {
  report: null,
  myAccess: null,
  loading: true,
  error: null,
  pollIssue: null,
  pollingStopped: false,
  retryingAnalysis: false,
  actionError: null,
};

export function useReportDetail(reportId: string) {
  const [state, setState] = useState<State>(INITIAL);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  // The report this hook currently shows. A response for a previous id (the route's id changed
  // while a request was in flight — deep link / notification tap) is ignored (Phase 9).
  const activeIdRef = useRef(reportId);
  const hasReportRef = useRef(false);
  const errorsRef = useRef(0);
  const pollStartedAtRef = useRef<number | null>(null);
  const lastStatusRef = useRef<string | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const schedule = useCallback((delay: number) => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      loadRef.current();
    }, delay);
  }, []);

  const load = useCallback(async () => {
    clearTimer();
    try {
      const { report, myAccess } = await reportsApi.get(reportId);
      if (!mountedRef.current || activeIdRef.current !== reportId) return;
      errorsRef.current = 0;
      hasReportRef.current = true;
      const previousStatus = lastStatusRef.current;
      lastStatusRef.current = report.status;
      if (previousStatus === 'processing' && report.status !== 'processing') notifyReportsChanged();

      let pollingStopped = false;
      if (report.status === 'processing') {
        if (pollStartedAtRef.current === null) pollStartedAtRef.current = Date.now();
        if (Date.now() - pollStartedAtRef.current >= MAX_POLL_DURATION_MS) pollingStopped = true;
        else schedule(POLL_INTERVAL_MS);
      } else {
        pollStartedAtRef.current = null;
      }
      setState((s) => ({ ...s, report, myAccess, loading: false, error: null, pollIssue: null, pollingStopped }));
    } catch (err) {
      if (!mountedRef.current || activeIdRef.current !== reportId) return;
      const message = errorMessage(err);
      if (!hasReportRef.current) {
        setState((s) => ({ ...s, loading: false, error: message }));
        return;
      }
      const stillProcessing = lastStatusRef.current === 'processing';
      if (stillProcessing && isTransientError(err)) {
        errorsRef.current += 1;
        const delay = nextPollDelay(errorsRef.current);
        schedule(delay);
        setState((s) => ({
          ...s,
          loading: false,
          pollIssue: `${message} Retrying in ${Math.round(delay / 1000)}s…`,
          pollingStopped: false,
        }));
      } else {
        setState((s) => ({
          ...s,
          loading: false,
          pollIssue: `Couldn’t refresh this report: ${message}`,
          pollingStopped: stillProcessing,
        }));
      }
    }
  }, [reportId, schedule]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    mountedRef.current = true;
    activeIdRef.current = reportId;
    hasReportRef.current = false;
    errorsRef.current = 0;
    pollStartedAtRef.current = null;
    lastStatusRef.current = null;
    (async () => {
      setState(INITIAL);
      await load();
    })();
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [load, reportId]);

  /** Manual refresh — also resumes polling that previously stopped. */
  const refresh = useCallback(() => {
    pollStartedAtRef.current = null;
    errorsRef.current = 0;
    setState((s) => ({ ...s, pollIssue: null, pollingStopped: false }));
    return load();
  }, [load]);

  const applyUpdate = useCallback((updated: Report) => {
    lastStatusRef.current = updated.status;
    setState((s) => ({ ...s, report: { ...s.report, ...updated } }));
    notifyReportsChanged();
  }, []);

  const retryAnalysis = useCallback(async () => {
    setState((s) => ({ ...s, retryingAnalysis: true, actionError: null }));
    try {
      await reportsApi.retryAnalysis(reportId);
      notifyReportsChanged();
    } catch (err) {
      // ALREADY_PROCESSING means a run is already in flight — just pick its status up.
      if (!(err instanceof ApiRequestError && err.code === 'ALREADY_PROCESSING')) {
        if (mountedRef.current) setState((s) => ({ ...s, retryingAnalysis: false, actionError: errorMessage(err) }));
        return;
      }
    }
    if (!mountedRef.current) return;
    setState((s) => ({ ...s, retryingAnalysis: false }));
    await refresh();
  }, [reportId, refresh]);

  return {
    ...state,
    retry: refresh,
    refresh,
    applyUpdate,
    retryAnalysis,
    clearActionError: () => setState((s) => ({ ...s, actionError: null })),
  };
}
