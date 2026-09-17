import { useCallback, useEffect, useState } from 'react';

import { reportsApi, type PhotoReviewAction, type ReportPhoto } from '@/services/api/reports';
import { ApiRequestError } from '@/types/api';

interface State {
  photos: ReportPhoto[];
  loading: boolean;
  error: string | null;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return 'We could not load these photos. Please try again.';
}

export function useReportPhotos(reportId: string) {
  const [state, setState] = useState<State>({ photos: [], loading: true, error: null });
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { photos } = await reportsApi.getPhotos(reportId);
      setState({ photos, loading: false, error: null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
    }
  }, [reportId]);

  useEffect(() => {
    load();
  }, [load]);

  const review = useCallback(
    async (photoId: string, action: PhotoReviewAction, extra: { observation?: string; note?: string; roomOrArea?: string } = {}) => {
      setReviewingId(photoId);
      try {
        const { photo } = await reportsApi.reviewPhoto(reportId, photoId, action, extra);
        setState((s) => ({ ...s, photos: s.photos.map((p) => (p.id === photoId ? photo : p)) }));
        return true;
      } catch (err) {
        setState((s) => ({ ...s, error: errorMessage(err) }));
        return false;
      } finally {
        setReviewingId(null);
      }
    },
    [reportId]
  );

  return { ...state, retry: load, review, reviewingId };
}
