// Phase 22 (Photo Analysis Library): pure helpers for backend/routes/photos.js
// -- kept dependency-free (no Firestore) so the flatten/filter/sort/paginate
// logic can be unit-tested directly, matching the organizationService.js /
// reportAccess.js precedent from earlier phases.
//
// There is no dedicated `photos` Firestore collection -- every photo lives
// inside its owning report's `photos[]` array (or, for legacy pre-Phase-6
// reports, a flat `imagePaths[]`). backend/routes/photos.js does a bounded,
// permission-scoped scan of the caller's own + Phase-19-assigned reports
// (mirroring search.js's exact access model -- never a wider organization
// pool), flattens each report's photos into one entry per photo via
// `toLibraryEntry` below, then this module's pure functions filter/sort/
// paginate that already-authorized, in-memory window. This is explicitly NOT
// "load everything and filter client-side" -- the scoping happens server-side
// in the route, and only the final page is ever sent to the browser.

const VALID_SORTS = new Set(['newest', 'oldest', 'claim', 'category']);
const isValidSort = (value) => VALID_SORTS.has(value);

const VALID_INCLUSION_STATES = new Set(['included', 'excluded']);
const isValidInclusionState = (value) => VALID_INCLUSION_STATES.has(value);

// A photo's reviewable-and-analyzed lifecycle state, collapsed to one label a
// filter dropdown can offer -- distinct from `review.status` (approved/
// edited/excluded/pending), which is the HUMAN review outcome, not whether
// the AI analysis itself ran. Legacy (non-reviewable) or still-nonexistent
// analysis both surface as 'unavailable' -- an honest label, never a silent
// empty state or a fabricated "completed".
const computeAnalysisStatus = (entry) => {
  if (!entry.reviewable) return 'unavailable';
  if (entry.analysisStatus === 'queued' || entry.analysisStatus === 'analyzing') return entry.analysisStatus;
  if (entry.analysisStatus === 'needs_attention') return 'needs_attention';
  if (entry.analysis) return 'completed';
  return 'unavailable';
};

// Builds one flattened, redacted library entry from a report doc + one of its
// photo records (or a synthesized legacy entry) -- never includes a raw
// Storage object/thumbnail/original path; images are always fetched through
// the existing authenticated GET /reports/:id/photos/:photoId/image proxy.
//
// `canReview` is passed in fully pre-computed by the route, NOT derived here
// from `myPermission` alone -- on the owner path it also depends on the
// caller's OWN team-role capability (canEditReports), mirroring PUT
// /reports/:id/photos/:photoId/review's exact dual-path check. Deriving it
// from myPermission alone here would render Edit/Approve/Exclude controls
// for a restricted-role owner (e.g. an Inspector without canEditReports) that
// would then 403 on click instead of correctly staying read-only.
const toLibraryEntry = (report, reportId, photo, myPermission, canReview) => {
  const analysisStatus = computeAnalysisStatus(photo);
  return {
    reportId,
    photoId: photo.id,
    fileName: photo.fileName || null,
    hasThumbnail: !!photo.hasThumbnail,
    uploadedAt: photo.uploadedAt || report.createdAt || null,
    reviewable: !!photo.reviewable,
    analysisStatus,
    location: photo.analysis?.location || null,
    category: photo.analysis?.category || null,
    severity: photo.analysis?.severity || null,
    observation: photo.analysis?.observation || null,
    confidence: photo.analysis?.confidence || null,
    review: photo.review || null,
    claimNumber: report.claimNumber || null,
    insuredName: report.insuredName || null,
    propertyAddress: report.propertyAddress || null,
    reportStatus: report.status || null,
    myPermission,
    canReview: !!canReview,
    // Phase 24 additions -- all optional/additive, null-safe for any
    // pre-Phase-24 or legacy (non-reviewable) photo.
    position: Number.isFinite(photo.position) ? photo.position : null,
    qualityWarning: !!photo.qualityWarning,
    qualityReasons: photo.qualityReasons || [],
    roomOrArea: photo.roomOrArea || null,
    hasAnnotations: !!(photo.annotations?.shapes?.length),
  };
};

const norm = (v) => String(v || '').toLowerCase();

// Phase 24: a distinct, human-set "which room/area is this" tag, separate
// from `location` above (the AI's own classification) -- '__unassigned__' is
// a reserved sentinel meaning "no area tag set yet", never a real area name.
const UNASSIGNED_AREA = '__unassigned__';

const matchesFilters = (entry, filters = {}) => {
  const { claim, location, category, analysisStatus, inclusion, dateFrom, dateTo, search, area } = filters;
  if (claim && !norm(entry.claimNumber).includes(norm(claim))) return false;
  if (location && entry.location !== location) return false;
  if (category && entry.category !== category) return false;
  if (analysisStatus && entry.analysisStatus !== analysisStatus) return false;
  if (area) {
    if (area === UNASSIGNED_AREA) {
      if (entry.roomOrArea) return false;
    } else if (entry.roomOrArea !== area) {
      return false;
    }
  }
  if (inclusion) {
    const isExcluded = entry.review?.status === 'excluded';
    if (inclusion === 'excluded' && !isExcluded) return false;
    if (inclusion === 'included' && isExcluded) return false;
  }
  if (dateFrom && (!entry.uploadedAt || entry.uploadedAt < dateFrom)) return false;
  if (dateTo && (!entry.uploadedAt || entry.uploadedAt > dateTo)) return false;
  if (search) {
    const q = norm(search);
    const haystack = [
      entry.fileName, entry.claimNumber, entry.insuredName, entry.propertyAddress,
      entry.location, entry.category, entry.observation, entry.review?.observation,
    ];
    if (!haystack.some((h) => norm(h).includes(q))) return false;
  }
  return true;
};

const sortEntries = (entries, sort) => {
  const list = [...entries];
  switch (sort) {
    case 'oldest':
      return list.sort((a, b) => new Date(a.uploadedAt || 0) - new Date(b.uploadedAt || 0));
    case 'claim':
      return list.sort((a, b) => norm(a.claimNumber).localeCompare(norm(b.claimNumber)));
    case 'category':
      return list.sort((a, b) => norm(a.category).localeCompare(norm(b.category)));
    case 'newest':
    default:
      return list.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
  }
};

// Opaque offset-encoded cursor -- not a true incremental Firestore cursor
// (the underlying data model has no dedicated photos collection to page
// natively; see the module header), but bounded and never re-scans an
// unbounded collection: the route recomputes the same bounded, already-
// permission-scoped, filtered+sorted in-memory window on every page and
// slices it, exactly the "server-side scoping + matching" precedent search.js
// already established.
const encodeCursor = (offset) => Buffer.from(String(offset), 'utf8').toString('base64');
const decodeCursor = (token) => {
  if (!token) return 0;
  try {
    const n = parseInt(Buffer.from(String(token), 'base64').toString('utf8'), 10);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
};

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 60;
const clampLimit = (value) => {
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
};

const paginate = (entries, cursorToken, limitValue) => {
  const offset = decodeCursor(cursorToken);
  const limit = clampLimit(limitValue);
  const page = entries.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    page,
    nextCursor: nextOffset < entries.length ? encodeCursor(nextOffset) : null,
    totalCount: entries.length,
  };
};

module.exports = {
  isValidSort,
  isValidInclusionState,
  computeAnalysisStatus,
  toLibraryEntry,
  matchesFilters,
  sortEntries,
  encodeCursor,
  decodeCursor,
  clampLimit,
  paginate,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  UNASSIGNED_AREA,
};
