import { describe, it, expect } from 'vitest';
import { selectPhotosToUpload, MAX_CONCURRENT_UPLOADS } from '../utils/uploadQueue.js';

const ready = (id) => ({ id, file: {}, status: 'ready' });

describe('selectPhotosToUpload', () => {
  it('caps how many photos start uploading at once, regardless of selection size', () => {
    // A 7-photo (or 20, or 100) multi-select used to fire one stage request
    // per photo simultaneously, putting all of them in contention for the
    // same draft document server-side. This is the fix: never hand back
    // more than the concurrency cap in one pass.
    const photos = Array.from({ length: 7 }, (_, i) => ready(`p${i}`));
    const batch = selectPhotosToUpload(photos);
    expect(batch.length).toBe(MAX_CONCURRENT_UPLOADS);
  });

  it('accounts for uploads already in flight when computing free slots', () => {
    const photos = [
      { id: 'a', file: {}, status: 'ready', uploading: true },
      { id: 'b', file: {}, status: 'ready', uploading: true },
      ready('c'),
      ready('d'),
    ];
    const batch = selectPhotosToUpload(photos, 3);
    expect(batch.map((p) => p.id)).toEqual(['c']);
  });

  it('returns nothing once the cap is already saturated', () => {
    const photos = Array.from({ length: 5 }, (_, i) => ({ id: `u${i}`, file: {}, status: 'ready', uploading: true }));
    expect(selectPhotosToUpload(photos, 3)).toEqual([]);
  });

  it('skips photos that are already uploaded, already failed, or still validating', () => {
    const photos = [
      { id: 'done', file: {}, status: 'ready', uploaded: true },
      { id: 'failed', file: {}, status: 'ready', uploadError: 'Upload failed' },
      { id: 'checking', file: {}, status: 'checking' },
      { id: 'corrupt', file: {}, status: 'corrupt' },
      ready('eligible'),
    ];
    const batch = selectPhotosToUpload(photos, 3);
    expect(batch.map((p) => p.id)).toEqual(['eligible']);
  });

  it('a freed slot (upload finished) picks up the next ready photo on the next pass', () => {
    const photos = [
      { id: 'a', file: {}, status: 'ready', uploaded: true }, // just finished, frees no slot (not counted as in-flight)
      { id: 'still-going', file: {}, status: 'ready', uploading: true },
      ready('b'),
      ready('c'),
      ready('d'),
    ];
    // Cap 3, 1 already in flight ("still-going") -> exactly 2 free slots.
    const batch = selectPhotosToUpload(photos, 3);
    expect(batch.map((p) => p.id)).toEqual(['b', 'c']);
  });
});
