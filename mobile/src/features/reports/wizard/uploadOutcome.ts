/**
 * Pure mapping from what `POST /reports/photos/stage` actually returned (or threw) to the
 * wizard's photo outcome. The route answers `201` for every processed file — including ones it
 * refused (`photo.status: 'failed'` + a human-readable `photo.error`) — so "the request
 * succeeded" must never be read as "the photo uploaded".
 */
import type { StagedPhotoRecord } from '@/services/api/reports';
import { ApiRequestError } from '@/types/api';
import type { PhotoFailureReason } from './wizardTypes';

export type StageOutcome =
  | { kind: 'uploaded'; serverId: string }
  | { kind: 'duplicate'; serverId: string }
  | { kind: 'failed'; reason: PhotoFailureReason; message: string; serverId?: string };

export function outcomeFromStagedRecord(photo: StagedPhotoRecord): StageOutcome {
  if (photo.status === 'uploaded') return { kind: 'uploaded', serverId: photo.id };
  if (photo.status === 'duplicate') return { kind: 'duplicate', serverId: photo.id };
  return {
    kind: 'failed',
    reason: 'rejected',
    message: photo.error || 'This photo was rejected by the server. Try a different photo.',
    // The server keeps the failed record on the draft — remember its id so Remove cleans it up.
    serverId: photo.id,
  };
}

export function outcomeFromStageError(err: unknown): StageOutcome {
  if (err instanceof ApiRequestError) {
    if (err.code === 'MAX_PHOTOS') {
      return { kind: 'failed', reason: 'capacity', message: err.message || 'Your plan’s photo limit has been reached.' };
    }
    if (err.status === 413 || err.code === 'LIMIT_FILE_SIZE') {
      return { kind: 'failed', reason: 'too-large', message: 'This photo is larger than 10 MB. Choose a smaller photo.' };
    }
    const transport =
      err.category === 'offline' ||
      err.category === 'timeout' ||
      err.category === 'transient_server' ||
      err.category === 'rate_limited';
    if (transport) {
      return { kind: 'failed', reason: 'network', message: `${err.message} Tap Retry to upload it again.` };
    }
    return { kind: 'failed', reason: 'rejected', message: err.message };
  }
  return { kind: 'failed', reason: 'network', message: 'Upload failed. Tap Retry to try again.' };
}

/** Message shown for a photo refused on-device because the plan has no room left. */
export function capacityMessage(limit: number): string {
  return `Your plan allows ${limit} photo${limit === 1 ? '' : 's'} per report. Remove a photo to add another.`;
}
