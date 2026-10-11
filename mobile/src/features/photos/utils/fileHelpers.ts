/**
 * Pure helpers for turning an `expo-image-picker` asset into the `RNFile` shape
 * `reportsApi.stagePhoto`/`generate` expect (`services/api/reports.ts`). Kept dependency-free
 * (no RN/Expo imports) so it's trivially unit-testable.
 */
import type { RNFile } from '@/services/api/reports';

const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** Best-effort mime type from a file extension — used only as a fallback when the picker
 * itself didn't report one (rare, but not guaranteed on every OS/picker path). */
export function mimeTypeFromUri(uri: string): string {
  const match = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(uri);
  const ext = match?.[1]?.toLowerCase();
  return (ext && EXTENSION_TO_MIME[ext]) || 'image/jpeg';
}

export function fileNameFromUri(uri: string, fallback: string): string {
  const clean = uri.split('?')[0];
  const parts = clean.split('/');
  const last = parts[parts.length - 1];
  return last && last.includes('.') ? last : fallback;
}

export interface PickedAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string;
  /** Bytes, when the picker reports it (not guaranteed on every platform/picker path). */
  fileSize?: number;
}

/** Formats the backend's AI photo analysis can actually read (Claude vision: JPEG/PNG/GIF/
 * WebP). The staging route *accepts* HEIC/HEIF bytes but the analysis step skips them, so
 * uploading one would look successful while silently contributing nothing to the report. */
export const ANALYZABLE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

/** Mirrors the backend's multer `fileSize` limit for `POST /reports/photos/stage`. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export type PhotoCheck =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'too-large'; message: string };

const EXTENSION_FOR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

function normalizeMime(mime: string): string {
  const lower = mime.toLowerCase();
  return lower === 'image/jpg' ? 'image/jpeg' : lower;
}

/** On-device pre-flight check run before any upload. The picker is already asked to hand back
 * a compatible (JPEG) representation where the OS supports converting (see
 * `useImageCapture.ts`); this catches whatever still slips through so the user gets an
 * actionable message instead of a photo that counts but is never analyzed. */
export function checkPhotoAsset(asset: PickedAsset): PhotoCheck {
  const mime = normalizeMime(asset.mimeType || mimeTypeFromUri(asset.uri));
  if (!(ANALYZABLE_MIME_TYPES as readonly string[]).includes(mime)) {
    const isHeic = mime === 'image/heic' || mime === 'image/heif';
    return {
      ok: false,
      reason: 'unsupported',
      message: isHeic
        ? 'HEIC photos can’t be analyzed. Pick it again from your library (it’s converted to JPEG where your phone supports it), or switch your camera to “Most Compatible” (JPEG) format.'
        : 'This file type can’t be analyzed. Use a JPEG, PNG, GIF, or WebP photo.',
    };
  }
  if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_PHOTO_BYTES) {
    return { ok: false, reason: 'too-large', message: 'This photo is larger than 10 MB. Choose a smaller photo.' };
  }
  return { ok: true };
}

let counter = 0;

/** A picked/captured photo doesn't always carry a `fileName` (camera captures rarely do) —
 * synthesize a stable-enough unique one so multiple photos from the same batch never collide
 * server-side (the backend content-hashes for dedup, not filename, but a readable name still
 * helps support/debugging). When the picker converted the bytes (e.g. HEIC → JPEG) but kept the
 * original `IMG_0001.HEIC` name, the extension is corrected to match the real content type. */
export function assetToRNFile(asset: PickedAsset): RNFile {
  counter += 1;
  const mimeType = normalizeMime(asset.mimeType || mimeTypeFromUri(asset.uri));
  const fallbackName = `photo-${Date.now()}-${counter}.jpg`;
  let name = asset.fileName || fileNameFromUri(asset.uri, fallbackName);
  const expectedExt = EXTENSION_FOR_MIME[mimeType];
  const currentMime = mimeTypeFromUri(name);
  if (expectedExt && /\.[a-zA-Z0-9]+$/.test(name) && normalizeMime(currentMime) !== mimeType) {
    name = name.replace(/\.[a-zA-Z0-9]+$/, `.${expectedExt}`);
  }
  return { uri: asset.uri, name, type: mimeType };
}
