import { useCallback, useEffect, useState } from 'react';

import { reportsApi, type ReportComment } from '@/services/api/reports';
import { ApiRequestError } from '@/types/api';

interface State {
  comments: ReportComment[];
  loading: boolean;
  error: string | null;
  posting: boolean;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return 'Something went wrong. Please try again.';
}

export function useReportComments(reportId: string) {
  const [state, setState] = useState<State>({ comments: [], loading: true, error: null, posting: false });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { comments } = await reportsApi.getComments(reportId);
      setState({ comments, loading: false, error: null, posting: false });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
    }
  }, [reportId]);

  useEffect(() => {
    load();
  }, [load]);

  const addComment = useCallback(
    async (body: string, parentId?: string): Promise<boolean> => {
      const trimmed = body.trim();
      if (!trimmed) return false;
      setState((s) => ({ ...s, posting: true, error: null }));
      try {
        const { comment } = await reportsApi.addComment(reportId, trimmed, parentId ? { parentId } : {});
        setState((s) => ({ ...s, comments: [...s.comments, comment], posting: false }));
        return true;
      } catch (err) {
        setState((s) => ({ ...s, posting: false, error: errorMessage(err) }));
        return false;
      }
    },
    [reportId]
  );

  const setResolved = useCallback(
    async (commentId: string, resolved: boolean) => {
      // Optimistic — this is a low-stakes toggle and the resolve/reopen endpoints are
      // idempotent, so a failed attempt is safe to just roll back visually.
      setState((s) => ({
        ...s,
        comments: s.comments.map((c) => (c.id === commentId ? { ...c, resolved } : c)),
      }));
      try {
        if (resolved) await reportsApi.resolveComment(reportId, commentId);
        else await reportsApi.reopenComment(reportId, commentId);
      } catch (err) {
        setState((s) => ({
          ...s,
          comments: s.comments.map((c) => (c.id === commentId ? { ...c, resolved: !resolved } : c)),
          error: errorMessage(err),
        }));
      }
    },
    [reportId]
  );

  return { ...state, retry: load, addComment, setResolved };
}
