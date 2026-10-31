/**
 * The app's two on-device file caches, both under `Paths.cache` (OS-purgeable, never backed
 * up, never user-visible):
 *
 * - Photo cache — authenticated photo/thumbnail bytes written to disk so `expo-image` can
 *   render them from a local `uri` (see `useAuthenticatedPhoto.ts`). Grouped into one
 *   sub-directory per *scope* (`report-<id>` / `draft-<draftId>`) so a screen can drop its
 *   own files when it's done with them instead of the cache growing forever.
 * - Export files — the latest exported PDF/DOCX/HTML, kept only long enough to hand to the
 *   share sheet (see `useReportExport.ts`).
 *
 * Every function is best-effort and never throws: losing a cached file only ever costs a
 * re-download, and cleanup must never be what breaks a sign-out or a screen unmount.
 */
import { Directory, File, Paths } from 'expo-file-system';

const PHOTO_CACHE_DIR_NAME = 'flac-photo-cache';
const EXPORT_DIR_NAME = 'flac-exports';

/** Collapses anything that isn't safe in a single path segment — scope keys and file names
 * can carry server-supplied ids/filenames, which must never be able to traverse directories. */
export function safePathSegment(value: string, fallback = 'file'): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '_').slice(0, 120);
  return cleaned || fallback;
}

function photoRoot(): Directory {
  return new Directory(Paths.cache, PHOTO_CACHE_DIR_NAME);
}

function deleteDirectory(dir: () => Directory): void {
  try {
    const d = dir();
    if (d.exists) d.delete();
  } catch {
    // Best-effort — see file header. (Also covers platforms without a file system, e.g. the web preview build.)
  }
}

/** Writes `bytes` for `key` inside `scope` and returns the local file uri. Replaces any
 * previous file for the same key (a stale copy must never be shown for a re-fetched photo). */
export function writeCachedPhoto(scope: string, key: string, bytes: ArrayBuffer): string {
  const dir = new Directory(photoRoot(), safePathSegment(scope, 'scope'));
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `${safePathSegment(key)}.img`);
  if (file.exists) file.delete();
  file.write(new Uint8Array(bytes));
  return file.uri;
}

export function clearPhotoCacheScope(scope: string): void {
  deleteDirectory(() => new Directory(photoRoot(), safePathSegment(scope, 'scope')));
}

export function clearAllPhotoCache(): void {
  deleteDirectory(photoRoot);
}

export function exportDirectory(): Directory {
  return new Directory(Paths.cache, EXPORT_DIR_NAME);
}

export function clearExportFiles(): void {
  deleteDirectory(exportDirectory);
}
