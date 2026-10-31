/**
 * Photo/thumbnail bytes never come from a public URL (`reportsApi.getPhotoImage`/
 * `getStagedPhotoImage` proxy private, authenticated bytes — see that file's own comments).
 * `expo-image`'s `<Image>` only knows how to load a `uri` (network URL or local file), so each
 * fetched image is written to an on-device cache file and that file's `uri` is what gets
 * rendered — never a raw data: URI built by hand, which would duplicate the bytes in memory as
 * a base64 string for no benefit here.
 *
 * Files live in a per-*scope* cache directory (`report-<id>` / `draft-<draftId>`, see
 * `services/localData/fileCache.ts`) that the owning screen deletes when it's done, and every
 * user-scoped file is wiped on sign-out. Fetches are capped at `MAX_CONCURRENT` so a report with
 * dozens of photos never fires dozens of simultaneous fully-buffered downloads.
 */
import { useCallback, useEffect, useState } from 'react';

import type { BinaryResponse } from '@/services/api/client';
import { writeCachedPhoto } from '@/services/localData/fileCache';

const MAX_CONCURRENT = 4;
let active = 0;
const waiting: (() => void)[] = [];

/** Runs `task` once a slot is free. Exported for tests. */
export async function withPhotoFetchSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active += 1;
  try {
    return await task();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

export function useAuthenticatedPhoto(scope: string, cacheKey: string, fetcher: () => Promise<BinaryResponse>, enabled = true) {
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setUri(null);
      try {
        const response = await withPhotoFetchSlot(() => (cancelled ? Promise.reject(new Error('cancelled')) : fetcher()));
        if (cancelled) return;
        setUri(writeCachedPhoto(scope, cacheKey, response.data));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this photo.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `fetcher` is a fresh closure every render — keyed on scope/cacheKey/attempt instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, cacheKey, enabled, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { uri, loading, error, reload };
}
