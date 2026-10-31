/**
 * What the signed-in user may do with one report, derived from the report's own state and the
 * `myAccess` value `GET /reports/:id` returns. Every rule mirrors a check the backend already
 * enforces (it stays the authority — this only avoids offering an action that is certain to be
 * refused):
 *
 * - Approve (`POST /:id/approve`): owner, or a `review` grantee; rejected while `processing`
 *   (`REPORT_PROCESSING`) or `regenerating` (`REPORT_REGENERATING`). Not offered once already
 *   reviewed, when there is no content to attest to (`failed`), or for `archived`.
 * - Export / download (`POST /:id/export`): owner only (`userId === uid`, else 404), not
 *   `archived`, not `processing`/`regenerating`; `failed` has no content to export.
 * - Retry analysis (`POST /:id/analysis/retry`): owner only, when the report `failed` or a
 *   photo is stuck `needs_attention`; refused while `processing` (`ALREADY_PROCESSING`).
 * - Review response (`POST /:id/review-response`): only the reviewer named on a `pending`
 *   `reviewRequest` (`NOT_ASSIGNED_REVIEWER` / `REVIEW_ALREADY_RESOLVED` otherwise).
 * - Comment / resolve (`POST /:id/comments*`): `comment` or higher.
 * - Photo review (`PUT /:id/photos/:photoId/review`): owner or `review`.
 * - Edit content (`PUT /:id`): owner or `review`; refused while `processing` / `regenerating` and once `finalized`
 *   (`REPORT_FINALIZED`). Editing a legacy `approved`/`completed` report reopens it as a draft.
 * - Share links, archive / restore / delete / duplicate (`/:id/shares`, `DELETE /:id`, `/:id/restore`,
 *   `/:id/duplicate`): owner only; no new links for an `archived` report.
 *
 * An owner may still be refused by a team-role capability (`TEAM_PERMISSION_DENIED`) the client
 * can't see — that surfaces as the server's own message.
 */
import { REVIEWED_STATUSES, type Report, type ReportAccess } from '@/services/api/reports';

export interface ReportActions {
  isReviewed: boolean;
  canApprove: boolean;
  /** Why Approve isn't offered, when the user would otherwise expect it. */
  approveNote: string | null;
  canExport: boolean;
  exportNote: string | null;
  canRetryAnalysis: boolean;
  canRespondToReview: boolean;
  canComment: boolean;
  canReviewPhotos: boolean;
  canEdit: boolean;
  /** Editing will reopen an approved (legacy) report as a draft. */
  editReopens: boolean;
  canShare: boolean;
  isOwner: boolean;
  /** POST /:id/request-review: owner, not yet reviewed, no review already pending. */
  canRequestReview: boolean;
  /** POST /:id/sections/assist|suggest: owner only (404 for grantees) and the content must be editable. */
  canUseSectionTools: boolean;
  /** Owner or review grantee (team capabilities are checked server-side). */
  hasEditAccess: boolean;
}

export function isReviewedStatus(status: string | undefined): boolean {
  return !!status && (REVIEWED_STATUSES as readonly string[]).includes(status);
}

export function hasStuckPhotos(report: Report): boolean {
  return (report.photos ?? []).some((p) => p.analysisStatus === 'needs_attention');
}

export function getReportActions(report: Report | null, access: ReportAccess | null, uid: string | null): ReportActions {
  const none: ReportActions = {
    isReviewed: false,
    canApprove: false,
    approveNote: null,
    canExport: false,
    exportNote: null,
    canRetryAnalysis: false,
    canRespondToReview: false,
    canComment: false,
    canReviewPhotos: false,
    canEdit: false,
    editReopens: false,
    canShare: false,
    isOwner: false,
    canRequestReview: false,
    canUseSectionTools: false,
    hasEditAccess: false,
  };
  if (!report || !access) return none;

  const isOwner = access === 'owner';
  const status = report.status;
  const busy = status === 'processing' || report.regenerating === true;
  const reviewed = isReviewedStatus(status);
  const hasContent = typeof report.content === 'string' && report.content.trim().length > 0;

  let approveNote: string | null = null;
  const mayApprove = isOwner || access === 'review';
  if (!mayApprove) approveNote = 'You have view or comment access only.';
  else if (status === 'archived') approveNote = 'Archived reports can’t be approved.';
  else if (busy) approveNote = 'Available once processing finishes.';
  else if (status === 'failed') approveNote = 'Report generation failed — retry the analysis first.';
  else if (reviewed) approveNote = 'Already approved.';
  else if (!hasContent) approveNote = 'There is no draft content to approve yet.';
  const canApprove = mayApprove && approveNote === null;

  let exportNote: string | null = null;
  if (!isOwner) exportNote = 'Only the report owner can export.';
  else if (status === 'archived') exportNote = 'Archived reports can’t be exported.';
  else if (busy) exportNote = 'Available once processing finishes.';
  else if (status === 'failed' || !hasContent) exportNote = 'There is no report content to export yet.';
  const canExport = isOwner && exportNote === null;

  const pending = report.reviewRequest?.status === 'pending';
  // Estimates, invoices and coverage letters are edited through their own Revise forms, never as free text.
  const structured = ['RepairEstimate', 'Invoice', 'CoverageDeterminationLetter'].includes(String(report.documentType ?? ''));

  return {
    isReviewed: reviewed,
    canApprove,
    approveNote: mayApprove ? approveNote : null,
    canExport,
    exportNote,
    canRetryAnalysis: isOwner && status !== 'processing' && (status === 'failed' || hasStuckPhotos(report)),
    canRespondToReview: !!uid && pending && report.reviewRequest?.reviewerUid === uid,
    canComment: access !== 'view',
    canReviewPhotos: isOwner || access === 'review',
    canEdit: !structured && mayApprove && !busy && hasContent && status !== 'finalized' && status !== 'archived' && status !== 'failed',
    editReopens: status === 'approved' || status === 'completed',
    canShare: isOwner && status !== 'archived' && !busy && status !== 'failed',
    isOwner,
    hasEditAccess: mayApprove,
    canRequestReview: isOwner && !reviewed && !busy && hasContent && status !== 'archived' && status !== 'failed' && !pending,
    canUseSectionTools: !structured && isOwner && mayApprove && !busy && hasContent && status !== 'finalized' && status !== 'archived' && status !== 'failed',
  };
}
