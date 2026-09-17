/**
 * Photo/thumbnail bytes never come from a public URL (`reportsApi.getPhotoImage`/
 * `getStagedPhotoImage` proxy private, authenticated bytes — see that file's own comments).
 * `expo-image`'s `<Image>` only knows how to load a `uri` (network URL or local file), so each
 * fetched image is written to a small on-device cache file and that file's `uri` is what gets
 * rendered — never a raw data: URI built by hand, which would duplicate the bytes in memory as
 * a base64 string for no benefit here.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';

import type { BinaryResponse } from '@/services/api/client';

const CACHE_DIR = new Directory(Paths.cache, 'flac-photo-cache');

function ensureCacheDir(): void {
  try {
    if (!CACHE_DIR.exists) CACHE_DIR.create({ intermediates: true, idempotent: true });
  } catch {
    // Falls through — the write below will surface any real problem.
  }
}

export function useAuthenticatedPhoto(cacheKey: string, fetcher: () => Promise<BinaryResponse>, enabled = true) {
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setUri(null);
      try {
        const response = await fetcher();
        if (cancelled) return;
        ensureCacheDir();
        const safeName = cacheKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        const file = new File(CACHE_DIR, `${safeName}.img`);
        file.write(new Uint8Array(response.data));
        setUri(file.uri);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this photo.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, enabled]);

  return { uri, loading, error };
}
