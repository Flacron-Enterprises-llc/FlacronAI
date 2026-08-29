// A multi-file wizard selection used to fire one immediate-upload request per
// photo simultaneously (Dashboard.jsx's auto-upload effect had no concurrency
// cap). Every one of those requests appends to the SAME reportDrafts/{draftId}
// document via a Firestore transaction, so a 7+ file selection created 7+-way
// contention on one hot document -- exhausting the transaction's retry budget
// for most of them and surfacing as "upload failed" for all but one photo.
// This caps how many stage requests run at once so contention stays low
// regardless of how many photos were selected.
export const MAX_CONCURRENT_UPLOADS = 3;

// Pure selection function: given the current staged-photo list and how many
// uploads are already in flight, returns the next batch (up to the free
// slots) that should start uploading now. Called from a useEffect that reruns
// whenever `photos` changes, so as each upload finishes (success or failure)
// a freed slot picks up the next ready photo -- a simple self-driving queue
// with no extra state to keep in sync.
export const selectPhotosToUpload = (photos, maxConcurrent = MAX_CONCURRENT_UPLOADS) => {
  const inFlight = photos.filter((p) => p.uploading).length;
  const freeSlots = maxConcurrent - inFlight;
  if (freeSlots <= 0) return [];
  return photos
    .filter((p) => p.status === 'ready' && p.file && !p.uploaded && !p.uploading && !p.uploadError)
    .slice(0, freeSlots);
};
