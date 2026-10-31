import { useCallback, useEffect, useState } from 'react';

import { useActiveId } from './useActiveId';

import { reportsApi, type PhotoReviewAction, type ReportPhoto } from '@/services/api/reports';
import { ApiRequestError } from '@/types/api';

interface State {
  photos: ReportPhoto[];
  loading: boolean;
  /** Load failure — nothing to show. */
  error: string | null;
  /** A single photo-review action failed; the already-loaded list is still valid and stays. */
  reviewError: string | null;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return 'We could not load these photos. Please try again.';
}

export function useReportPhotos(reportId: string) {
  const [state, setState] = useState<State>({ photos: [], loading: true, error: null, reviewError: null });
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const activeId = useActiveId(reportId);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { photos } = await reportsApi.getPhotos(reportId);
      if (activeId.current !== reportId) return;
      setState({ photos, loading: false, error: null, reviewError: null });
    } catch (err) {
      if (activeId.current !== reportId) return;
      setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
    }
  }, [reportId, activeId]);

  useEffect(() => {
    load();
  }, [load]);

  const review = useCallback(
    async (photoId: string, action: PhotoReviewAction, extra: { observation?: string; note?: string; roomOrArea?: string } = {}) => {
      setReviewingId(photoId);
      setState((s) => ({ ...s, reviewError: null }));
      try {
        const { photo } = await reportsApi.reviewPhoto(reportId, photoId, action, extra);
        setState((s) => ({ ...s, photos: s.photos.map((p) => (p.id === photoId ? photo : p)) }));
        return true;
      } catch (err) {
        setState((s) => ({ ...s, reviewError: errorMessage(err) }));
        return false;
      } finally {
        setReviewingId(null);
      }
    },
    [reportId]
  );

  const clearReviewError = useCallback(() => setState((s) => ({ ...s, reviewError: null })), []);

  return { ...state, retry: load, review, reviewingId, clearReviewError };
}
