/**
 * Typed wrappers for the subset of `backend/routes/reports.js` (a large, ~5900-line file)
 * that Phase 5's planned scope actually needs (`MOBILE_DEVELOPMENT_PHASES.md` Phase 5:
 * reports list + dashboard summary; the generate wizard including camera/photo-library
 * capture-and-upload; report detail — photos, comments, versions; approve/review-response;
 * export/download; templates). Every method here maps to a route confirmed to exist by a
 * direct Phase 4 audit of that file — never an invented endpoint.
 *
 * Deliberately NOT covered here (confirmed to exist, out of Phase 5's stated scope):
 * sharing (`/:id/share*`), supervisor review-request creation (`/:id/request-review`),
 * archive/restore/duplicate/delete (`DELETE /:id`, `/:id/restore`, `/:id/duplicate`), photo
 * reorder/annotations/regenerate (`PATCH /:id/photos/reorder`, `PUT .../annotations`,
 * `POST /:id/photos/regenerate`), the standalone analyze-without-saving preview
 * (`POST /reports/analyze-images`), adding photos to an existing report
 * (`POST /:id/images`), and the Estimate/Invoice/Coverage-Letter/Mold-supplement
 * sub-document routes. Add typed wrappers for these only when a phase actually needs the
 * screen that calls them.
 */
import { File } from 'expo-file-system';

import { apiRequest, apiRequestBinary, type BinaryResponse } from './client';
import type { QueryParams } from '@/types/api';

/** Every value `reports/{id}.status` takes server-side: `processing` while the background
 * pipeline runs, `failed` when it errors (with `pipelineError` set — recover via
 * `retryAnalysis`), `draft` awaiting review, `finalized` once approved (`completed`/`approved`
 * are legacy reviewed values the backend still treats as reviewed), `archived` when hidden. */
export type ReportStatus = 'processing' | 'failed' | 'draft' | 'finalized' | 'completed' | 'approved' | 'archived';

/** Statuses the backend treats as already human-reviewed (`REVIEWED_STATUSES`,
 * backend/utils/watermarkPolicy.js). */
export const REVIEWED_STATUSES: readonly ReportStatus[] = ['finalized', 'approved', 'completed'];

export type ReportAccess = 'owner' | 'review' | 'comment' | 'view';

/** `report.reviewRequest` as written by `POST /:id/request-review` and updated by
 * `/approve`/`/review-response`. */
export interface ReviewRequest {
  reviewerUid: string;
  reviewerEmail?: string | null;
  requestedBy?: string;
  requestedByEmail?: string | null;
  requestedAt?: string;
  status: 'pending' | 'approved' | 'rejected' | 'changes_requested' | string;
  notes?: string | null;
  respondedAt?: string | null;
}

/** A photo attached to a report/draft, as returned inline on the report doc itself (list/
 * detail responses) — a different, smaller shape than `ReportPhoto` from
 * `GET /:id/photos` below. Raw Storage paths (`objectPath`/`thumbnailPath`/`originalPath`)
 * are stripped by the backend before a report is ever returned to the client. */
export interface ReportPhotoRecord {
  id: string;
  fileName?: string;
  status?: 'uploaded' | 'failed' | 'duplicate' | string;
  analysisStatus?: string;
  /** Set on a photo `POST /generate` demoted to `failed` because the plan's photo capacity
   * was exceeded at commit time — it was never analyzed. */
  capacityRejected?: boolean;
  error?: string;
  [key: string]: unknown;
}

/**
 * The backend `reports/{id}` document shape, narrowed to the fields Phase 5's planned
 * screens need. Confirmed directly against `backend/routes/reports.js`'s `reportDoc`
 * object (`POST /generate`) — not exhaustive (specialty per-claim-type fields like
 * `vin`/`floodZone`/`roofType` exist but are read through the index signature below rather
 * than enumerated, since they're only ever meaningful for one `claimType`/`lossType` at a
 * time and Phase 5 doesn't need to branch on most of them directly).
 */
export interface Report {
  id: string;
  userId: string;
  claimNumber: string;
  insuredName: string;
  insuredEmail: string;
  propertyAddress: string;
  lossDate: string;
  lossType: string;
  reportType: string;
  additionalNotes?: string;
  propertyDetails?: string;
  lossDescription?: string;
  damagesObserved?: string;
  recommendations?: string;
  /** `null` while `status === 'processing'` (the background AI pipeline hasn't finished
   * yet) — never render this as an empty report, poll `analysis-status` instead. */
  content: string | null;
  photos?: ReportPhotoRecord[];
  imageCount: number;
  qualityScore?: number | null;
  pipelineError?: string | null;
  status: ReportStatus;
  /** `true` while a regenerate is in flight — approval/export are rejected server-side. */
  regenerating?: boolean;
  reviewRequest?: ReviewRequest | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  clientId?: string | null;
  claimId?: string | null;
  createdByEmail?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  documents?: { fileName: string; size: number; mimeType: string; uploadedAt: string }[];
  // Specialty/less-common fields (policyNumber, insuranceCompany, claimType, propertyType,
  // inspectionDate/Time, inspectorName/Id, weatherConditions, occupancyStatus, and the
  // per-claim-type-only fields such as vin/floodZone/roofType/claimantName) are real but
  // intentionally accessed through this index signature rather than enumerated above.
  [key: string]: unknown;
}

export interface DashboardSummary {
  reportsAwaitingReview: number;
  reportsCompleted: number;
  photosAnalyzed: number;
  /** Always `false` today — no per-file byte-size accounting exists in Storage/Firestore.
   * Render as "not yet available," never as a computed 0 (Golden Rule #1). */
  storageAvailable: false;
}

export interface ListReportsParams {
  page?: number;
  limit?: number;
  status?: string;
  lossType?: string;
  reportType?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  clientId?: string;
  claimNumber?: string;
  /** Derived documents of a report / estimate (owner's own reports only). */
  relatedReportId?: string;
  documentType?: string;
}

export interface ListReportsResult {
  success: true;
  data: Report[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ReportTemplate {
  id: string;
  userId: string;
  name: string;
  fields: Record<string, unknown>;
  createdAt: string;
}

/** React Native's multipart file-part shape (Expo's `expo-image-picker`/`expo-camera`
 * return a local `uri`; RN's `FormData.append` accepts `{uri, name, type}` in place of a
 * `Blob`, which the DOM `FormData` type doesn't model — hence the cast in `appendFile`). */
export interface RNFile {
  uri: string;
  name: string;
  type: string;
}

/**
 * Expo SDK 57 replaces the global `fetch` with `expo/fetch`, whose multipart encoder does NOT
 * accept React Native's `{ uri, name, type }` file parts — it throws "Unsupported FormDataPart
 * implementation" before anything is sent, which surfaced as "Unable to reach the server" on
 * every photo upload (found on the Phase 10 cloud Android emulator + iOS simulator). The encoder
 * accepts any part exposing `bytes()`, taking the multipart filename/content-type from the part's
 * own `name`/`type`, so the local file is read through expo-file-system at send time.
 */
export function toUploadPart(file: RNFile): { name: string; type: string; bytes: () => Promise<Uint8Array> } {
  return {
    name: file.name,
    type: file.type,
    bytes: async () => new File(file.uri).bytes(),
  };
}

function appendFile(form: FormData, field: string, file: RNFile): void {
  form.append(field, toUploadPart(file) as unknown as Blob);
}

export interface GenerateReportFields {
  claimNumber: string;
  insuredName: string;
  insuredEmail: string;
  propertyAddress: string;
  /** `YYYY-MM-DD` — validated server-side, must match exactly. */
  lossDate: string;
  lossType: string;
  reportType?: string;
  additionalNotes?: string;
  propertyDetails?: string;
  lossDescription?: string;
  damagesObserved?: string;
  recommendations?: string;
  /** Folds in photos already uploaded via `stagePhoto` during the wizard's Photos step —
   * the server downloads their already-stored bytes instead of requiring a re-upload.
   * Re-submitting the same `draftId` twice is rejected with a `conflict`-category error
   * (`DUPLICATE_GENERATE_REQUEST`), never silently create a second report. */
  draftId?: string;
  templateId?: string;
  claimId?: string;
  clientId?: string;
  // ~29 additional optional claim/inspection fields exist server-side (policyNumber,
  // insuranceCompany, inspectionDate/Time, inspectorName/Id, weatherConditions,
  // occupancyStatus, and the per-claim-type-only fields) — passed through via the index
  // signature below rather than enumerated, since Phase 5's wizard steps will only ever
  // populate a subset depending on claimType/lossType.
  [key: string]: string | undefined;
}

/** One staging result. `POST /photos/stage` answers 201 for every processed file, including
 * ones it rejected — `status: 'failed'` (with a human-readable `error`, e.g. "File is not a
 * valid image") is a real outcome of a successful HTTP call, never an upload success. */
export interface StagedPhotoRecord {
  id: string;
  fileName?: string;
  status: 'uploaded' | 'failed' | 'duplicate';
  error?: string;
  contentHash?: string;
  [key: string]: unknown;
}

/** `GET /reports/photos/capacity` — the caller's plan photo limit (PlanConfig), and how much of
 * it the given draft already uses. `effectiveCapacity`/`remaining` are `null` when unlimited. */
export interface PhotoCapacity {
  success: true;
  plan?: string;
  effectiveCapacity: number | null;
  unlimited: boolean;
  used: number;
  remaining: number | null;
  uploadAllowed: boolean;
}

export interface ReportPhoto {
  id: string;
  fileName: string;
  size: number;
  mimeType: string;
  status: string;
  hasThumbnail: boolean;
  hasOriginal: boolean;
  analysisStatus?: string;
  analysis?: unknown;
  review?: unknown;
  reviewable: boolean;
  position: number;
  qualityWarning?: boolean;
  qualityReasons?: string[];
  capturedAt?: string | null;
  roomOrArea?: string | null;
  annotations?: unknown;
  [key: string]: unknown;
}

export type PhotoReviewAction = 'approve' | 'edit' | 'exclude' | 'include' | 'note' | 'set_area';

export interface ReportComment {
  id: string;
  body: string;
  resolved?: boolean;
  parentId?: string | null;
  authorName?: string | null;
  authorEmail?: string | null;
  createdAt?: string;
  [key: string]: unknown;
}

export interface ReportVersion {
  action: 'generated' | 'edited' | 'approved' | string;
  by: string;
  note: string;
  content: unknown;
  at: string;
}

export type ExportFormat = 'pdf' | 'docx' | 'html';

export interface ExportOptions {
  format?: ExportFormat;
  includeImages?: boolean;
  includeCoverPage?: boolean;
  includePhotoCaptions?: boolean;
  includePageNumbers?: boolean;
  includeAppendix?: boolean;
  includeCompanyBranding?: boolean;
  photoLayout?: 1 | 2 | 4;
}

export interface ExportResult {
  success: true;
  downloadUrl: string;
  /** ISO timestamp — advertised, not independently confirmed enforced server-side; treat
   * the download link as "not guaranteed alive after this," not "guaranteed dead." */
  expiresAt: string;
  format: ExportFormat;
  filename: string;
}

export interface ApprovalSignature {
  name: string;
  licenseNumber: string;
  licenseState: string;
  company: string;
  title?: string;
}

const REPORTS_BASE = '/reports';
/** `GET /reports/:id/analysis-status` (photoJobService.getAnalysisStatus). */
export interface AnalysisStatus {
  reportStatus: ReportStatus;
  pipelineError: string | null;
  totalPhotos: number;
  analyzed: number;
  needsAttention: number;
  failed: number;
  generation: { status: string; error?: string | null } | null;
}

/** `GET /reports/assigned-to-me` — reports another account shared with or sent for review to the caller. */
export interface AssignedReport {
  id: string;
  claimNumber: string | null;
  insuredName: string | null;
  status: string | null;
  updatedAt: string | null;
  myPermission: ReportAccess | null;
  reviewRequestStatus: string | null;
}

export type SharePermission = 'view' | 'comment' | 'review';
export type ShareExpiry = '24h' | '7d' | '30d';

export interface ReportShare {
  id: string;
  permission: SharePermission;
  expiresAt: string | null;
  createdAt: string | null;
  url: string;
  [key: string]: unknown;
}

export const EXPORT_TIMEOUT_MS = 120000;

export const reportsApi = {
  getDashboardSummary: () =>
    apiRequest<{ success: true; summary: DashboardSummary }>(`${REPORTS_BASE}/dashboard-summary`),

  /** Offset-paginated (not cursor-based) — fine for a mobile "page 1, load more" list, not
   * suitable for infinite server-side cursoring. Archived reports are hidden unless
   * `status: 'archived'` is explicitly requested. */
  list: (params: ListReportsParams = {}) =>
    apiRequest<ListReportsResult>(REPORTS_BASE, { params: params as QueryParams }),

  get: (id: string) =>
    apiRequest<{ success: true; report: Report; myAccess: ReportAccess }>(
      `${REPORTS_BASE}/${encodeURIComponent(id)}`
    ),

  /** Editing `content` on an already-`finalized`/`approved` report reopens it to `draft`
   * server-side (clears the prior approval) — surface this to the user as "this will
   * un-approve the report," never call it silently after approval. Not marked
   * `idempotent` — a content edit is a real, repeatable-but-not-safe-to-blindly-retry
   * side effect (see `client.ts`'s retry contract). */
  update: (id: string, updates: { content?: string; additionalNotes?: string; clientId?: string | null }) =>
    apiRequest<{ success: true; message: string; updates: unknown }>(`${REPORTS_BASE}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: updates,
    }),

  getAnalysisStatus: (id: string) =>
    apiRequest<{ success: true } & AnalysisStatus>(`${REPORTS_BASE}/${encodeURIComponent(id)}/analysis-status`),

  /** Owner only (review grantees get 404), team capability canEditReports, shares the 10/min generation limit.
   * Returns a suggestion only — nothing is written until the caller saves the content. */
  assistSection: (id: string, action: string, title: string, body: string) =>
    apiRequest<{ success: true; suggestion: string }>(`${REPORTS_BASE}/${encodeURIComponent(id)}/sections/assist`, {
      method: 'POST',
      body: { action, title, body },
      timeoutMs: 90000,
    }),

  /** "Regenerate Section": same rules as assistSection; `instructions` ≤ 2000 chars. */
  suggestSection: (id: string, title: string, body: string, instructions?: string) =>
    apiRequest<{ success: true; suggestion: string }>(`${REPORTS_BASE}/${encodeURIComponent(id)}/sections/suggest`, {
      method: 'POST',
      body: { title, body, ...(instructions ? { instructions } : {}) },
      timeoutMs: 90000,
    }),

  /** Owner only; reviewer must be an active member of the same organization (REVIEWER_NOT_IN_ORG otherwise). */
  requestReview: (id: string, reviewerUid: string, notes?: string) =>
    apiRequest<{ success: true; message: string; reviewRequest: ReviewRequest }>(
      `${REPORTS_BASE}/${encodeURIComponent(id)}/request-review`,
      { method: 'POST', body: { reviewerUid, ...(notes ? { notes } : {}) } }
    ),

  listAssignedToMe: () => apiRequest<{ success: true; reports: AssignedReport[] }>(`${REPORTS_BASE}/assigned-to-me`),

  /** Archive (default) or permanently delete (`permanent`) — owner only. Permanent deletion removes Storage objects. */
  remove: (id: string, permanent = false) =>
    apiRequest<{ success: true; message: string }>(`${REPORTS_BASE}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      params: permanent ? { permanent: 'true' } : undefined,
    }),

  restore: (id: string) =>
    apiRequest<{ success: true; message: string }>(`${REPORTS_BASE}/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
    }),

  /** Copies claim/property fields into a new draft (no photos, no generated content). */
  duplicate: (id: string) =>
    apiRequest<{ success: true; report: Report }>(`${REPORTS_BASE}/${encodeURIComponent(id)}/duplicate`, {
      method: 'POST',
    }),

  deleteAllArchived: () =>
    apiRequest<{ success: true; deletedCount: number; message?: string }>(`${REPORTS_BASE}/archived/delete-all`, { method: 'POST' }),

  listShares: (id: string) =>
    apiRequest<{ success: true; shares: ReportShare[] }>(`${REPORTS_BASE}/${encodeURIComponent(id)}/shares`),

  /** A view link requires a finalized report (server: NOT_FINALIZED). */
  createShare: (id: string, permission: SharePermission, expiresIn?: ShareExpiry) =>
    apiRequest<{ success: true; url: string; [key: string]: unknown }>(
      `${REPORTS_BASE}/${encodeURIComponent(id)}/shares`,
      { method: 'POST', body: { permission, ...(expiresIn ? { expiresIn } : {}) } }
    ),

  revokeShare: (id: string, shareId: string) =>
    shareId === 'legacy'
      ? apiRequest<{ success: true }>(`${REPORTS_BASE}/${encodeURIComponent(id)}/share`, { method: 'DELETE' })
      : apiRequest<{ success: true }>(
          `${REPORTS_BASE}/${encodeURIComponent(id)}/shares/${encodeURIComponent(shareId)}`,
          { method: 'DELETE' }
        ),

  retryAnalysis: (id: string) =>
    apiRequest<{ success: true; message: string }>(`${REPORTS_BASE}/${encodeURIComponent(id)}/analysis/retry`, {
      method: 'POST',
    }),

  /**
   * Creates a new report and kicks off the background AI pipeline — the server responds
   * immediately with `status: 'processing'`/`content: null`; poll `getAnalysisStatus` or
   * `get(id)` for completion, never block the wizard's "Generate" button on this call
   * finishing analysis. Every call creates a brand-new report id — never retried
   * automatically by the shared client (not `idempotent`), and must not be re-submitted
   * with the same `draftId` after a failure (that is rejected with a `conflict` error, not
   * silently deduplicated into the original report).
   */
  generate: (fields: GenerateReportFields, images: RNFile[] = [], documents: RNFile[] = []) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) form.append(key, value);
    }
    for (const image of images) appendFile(form, 'images', image);
    for (const doc of documents) appendFile(form, 'documents', doc);
    return apiRequest<{ success: true; report: Report }>(`${REPORTS_BASE}/generate`, {
      method: 'POST',
      multipart: form,
      timeoutMs: 60000,
    });
  },

  /** One HTTP call per captured/selected photo during the wizard's Photos step, so a slow
   * network never has to hold 100 photos in memory for one giant request. Marked
   * `idempotent`: the backend content-hashes against already-staged photos for the same
   * `draftId` and marks a repeat as `status: 'duplicate'` instead of double-adding it, so a
   * client-side retry after a dropped response can never double-charge a photo slot. */
  stagePhoto: (draftId: string, image: RNFile) => {
    const form = new FormData();
    form.append('draftId', draftId);
    appendFile(form, 'image', image);
    return apiRequest<{ success: true; photo: StagedPhotoRecord; uploadedCount: number }>(
      `${REPORTS_BASE}/photos/stage`,
      { method: 'POST', multipart: form, idempotent: true, timeoutMs: 30000 }
    );
  },

  /** Plan photo capacity for the wizard's Photos step (Phase 44 PlanConfig) — the staging
   * route enforces the same limit and rejects with `MAX_PHOTOS` (plus `limit`/`used`). */
  getPhotoCapacity: (draftId?: string) =>
    apiRequest<PhotoCapacity>(`${REPORTS_BASE}/photos/capacity`, { params: draftId ? { draftId } : undefined }),

  /** Resumes the wizard's photo list after an app relaunch mid-session. Returns an empty
   * array (never a 404) if the draft doesn't exist or belongs to another account. */
  getStagedPhotos: (draftId: string) =>
    apiRequest<{ success: true; photos: StagedPhotoRecord[] }>(
      `${REPORTS_BASE}/photos/stage/${encodeURIComponent(draftId)}`
    ),

  getStagedPhotoImage: (draftId: string, photoId: string, variant?: 'thumbnail'): Promise<BinaryResponse> =>
    apiRequestBinary(
      `${REPORTS_BASE}/photos/stage/${encodeURIComponent(draftId)}/${encodeURIComponent(photoId)}/image`,
      { params: variant ? { variant } : undefined }
    ),

  deleteStagedPhoto: (draftId: string, photoId: string) =>
    apiRequest<{ success: true }>(
      `${REPORTS_BASE}/photos/stage/${encodeURIComponent(draftId)}/${encodeURIComponent(photoId)}`,
      { method: 'DELETE' }
    ),

  getPhotos: (id: string) =>
    apiRequest<{ success: true; photos: ReportPhoto[] }>(`${REPORTS_BASE}/${encodeURIComponent(id)}/photos`),

  getPhotoImage: (id: string, photoId: string, variant?: 'thumbnail' | 'original'): Promise<BinaryResponse> =>
    apiRequestBinary(`${REPORTS_BASE}/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}/image`, {
      params: variant ? { variant } : undefined,
    }),

  /** `approve`/`exclude`/`include` are state-sets (safe to repeat); `note`/`edit` append or
   * overwrite content and are not marked `idempotent` here out of caution — the backend
   * doesn't document them as a pure no-op on repeat. */
  reviewPhoto: (
    id: string,
    photoId: string,
    action: PhotoReviewAction,
    extra: { observation?: string; note?: string; roomOrArea?: string } = {}
  ) =>
    apiRequest<{ success: true; photo: ReportPhoto }>(
      `${REPORTS_BASE}/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}/review`,
      { method: 'PUT', body: { action, ...extra } }
    ),

  getComments: (id: string) =>
    apiRequest<{ success: true; comments: ReportComment[] }>(`${REPORTS_BASE}/${encodeURIComponent(id)}/comments`),

  addComment: (id: string, body: string, opts: { sectionAnchor?: { title: string }; parentId?: string } = {}) =>
    apiRequest<{ success: true; comment: ReportComment }>(`${REPORTS_BASE}/${encodeURIComponent(id)}/comments`, {
      method: 'POST',
      body: { body, ...opts },
    }),

  resolveComment: (id: string, commentId: string) =>
    apiRequest<{ success: true }>(
      `${REPORTS_BASE}/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}/resolve`,
      { method: 'POST', idempotent: true }
    ),

  reopenComment: (id: string, commentId: string) =>
    apiRequest<{ success: true }>(
      `${REPORTS_BASE}/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}/reopen`,
      { method: 'POST', idempotent: true }
    ),

  getVersions: (id: string) =>
    apiRequest<{ success: true; versions: ReportVersion[] }>(`${REPORTS_BASE}/${encodeURIComponent(id)}/versions`),

  /** The human legal-attestation gate (Golden Rule #3) — only a `finalized` report exports
   * without a DRAFT watermark. Not `idempotent`: re-approving an already-finalized report
   * is not a documented no-op. */
  approve: (id: string, signature: ApprovalSignature, content?: string) =>
    apiRequest<{ success: true; message: string; report: Report }>(
      `${REPORTS_BASE}/${encodeURIComponent(id)}/approve`,
      { method: 'POST', body: { signature, confirmReview: true, content } }
    ),

  /** Only the reviewer named on the report's pending review request may call this. */
  submitReviewResponse: (id: string, decision: 'rejected' | 'changes_requested', notes?: string) =>
    apiRequest<{ success: true; message: string; reviewRequest: ReviewRequest }>(
      `${REPORTS_BASE}/${encodeURIComponent(id)}/review-response`,
      { method: 'POST', body: { decision, notes } }
    ),

  /**
   * Starts an export job; bytes are NOT returned here — fetch them with
   * `downloadExport(id, result.filename)`. Two concurrent exports of the same
   * report+format are rejected with a `conflict`-category error
   * (`EXPORT_IN_PROGRESS`); a sequential retry after a genuine failure is fine (the lock
   * releases), but this is not marked `idempotent` since a blind automatic retry could
   * race an export already in flight.
   */
  exportReport: (id: string, options: ExportOptions = {}) =>
    apiRequest<ExportResult>(`${REPORTS_BASE}/${encodeURIComponent(id)}/export`, {
      method: 'POST',
      body: options,
      // Rendering a PDF/DOCX with every photo embedded routinely takes far longer than the
      // client's 20s default.
      timeoutMs: EXPORT_TIMEOUT_MS,
    }),

  /** Proxied private bytes — never a public URL. Pass the `filename` from
   * `exportReport`'s response. */
  downloadExport: (id: string, file: string, inline = false): Promise<BinaryResponse> =>
    apiRequestBinary(`${REPORTS_BASE}/${encodeURIComponent(id)}/download`, {
      params: { file, ...(inline ? { inline: true } : {}) },
      timeoutMs: EXPORT_TIMEOUT_MS,
    }),

  /** Downloads one of the wizard's uploaded supporting documents (PDF/DOC/DOCX/TXT) — not
   * for photos. Pass a `fileName` from the report's `documents` array. */
  downloadDocument: (id: string, file: string): Promise<BinaryResponse> =>
    apiRequestBinary(`${REPORTS_BASE}/${encodeURIComponent(id)}/documents/download`, { params: { file } }),

  listTemplates: () => apiRequest<{ success: true; templates: ReportTemplate[] }>(`${REPORTS_BASE}/templates`),

  saveTemplate: (name: string, fields: Record<string, unknown> = {}) =>
    apiRequest<{ success: true; template: ReportTemplate }>(`${REPORTS_BASE}/templates`, {
      method: 'POST',
      body: { name, fields },
    }),

  deleteTemplate: (templateId: string) =>
    apiRequest<{ success: true; message: string }>(`${REPORTS_BASE}/templates/${encodeURIComponent(templateId)}`, {
      method: 'DELETE',
      idempotent: true,
    }),
};
