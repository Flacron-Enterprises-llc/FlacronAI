import { useCallback, useEffect, useState } from 'react';

import { useActiveId } from './useActiveId';

import { reportsApi, type ReportComment } from '@/services/api/reports';
import { ApiRequestError } from '@/types/api';

interface State {
  comments: ReportComment[];
  loading: boolean;
  /** Load failure — nothing to show. */
  error: string | null;
  /** A post/resolve/reopen failed; the loaded comments stay on screen. */
  actionError: string | null;
  posting: boolean;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return 'Something went wrong. Please try again.';
}

export function useReportComments(reportId: string) {
  const [state, setState] = useState<State>({ comments: [], loading: true, error: null, actionError: null, posting: false });
  const activeId = useActiveId(reportId);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { comments } = await reportsApi.getComments(reportId);
      if (activeId.current !== reportId) return;
      setState({ comments, loading: false, error: null, actionError: null, posting: false });
    } catch (err) {
      if (activeId.current !== reportId) return;
      setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
    }
  }, [reportId, activeId]);

  useEffect(() => {
    load();
  }, [load]);

  const addComment = useCallback(
    async (body: string, parentId?: string): Promise<boolean> => {
      const trimmed = body.trim();
      if (!trimmed) return false;
      setState((s) => ({ ...s, posting: true, actionError: null }));
      try {
        const { comment } = await reportsApi.addComment(reportId, trimmed, parentId ? { parentId } : {});
        if (activeId.current !== reportId) return true;
        setState((s) => ({ ...s, comments: [...s.comments, comment], posting: false }));
        return true;
      } catch (err) {
        setState((s) => ({ ...s, posting: false, actionError: errorMessage(err) }));
        return false;
      }
    },
    [reportId, activeId]
  );

  const setResolved = useCallback(
    async (commentId: string, resolved: boolean) => {
      // Optimistic — this is a low-stakes toggle and the resolve/reopen endpoints are
      // idempotent, so a failed attempt is safe to just roll back visually.
      setState((s) => ({
        ...s,
        actionError: null,
        comments: s.comments.map((c) => (c.id === commentId ? { ...c, resolved } : c)),
      }));
      try {
        if (resolved) await reportsApi.resolveComment(reportId, commentId);
        else await reportsApi.reopenComment(reportId, commentId);
      } catch (err) {
        setState((s) => ({
          ...s,
          comments: s.comments.map((c) => (c.id === commentId ? { ...c, resolved: !resolved } : c)),
          actionError: errorMessage(err),
        }));
      }
    },
    [reportId]
  );

  const clearActionError = useCallback(() => setState((s) => ({ ...s, actionError: null })), []);

  return { ...state, retry: load, addComment, setResolved, clearActionError };
}
