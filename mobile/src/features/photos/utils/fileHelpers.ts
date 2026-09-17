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
}

let counter = 0;

/** A picked/captured photo doesn't always carry a `fileName` (camera captures rarely do) —
 * synthesize a stable-enough unique one so multiple photos from the same batch never collide
 * server-side (the backend content-hashes for dedup, not filename, but a readable name still
 * helps support/debugging). */
export function assetToRNFile(asset: PickedAsset): RNFile {
  counter += 1;
  const mimeType = asset.mimeType || mimeTypeFromUri(asset.uri);
  const fallbackName = `photo-${Date.now()}-${counter}.jpg`;
  return {
    uri: asset.uri,
    name: asset.fileName || fileNameFromUri(asset.uri, fallbackName),
    type: mimeType,
  };
}
