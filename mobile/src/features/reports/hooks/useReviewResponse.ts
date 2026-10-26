/**
 * The reviewer's side of a review request (`POST /reports/:id/review-response`): send the report
 * back for changes, or reject it. Approving is the separate attestation flow
 * (`useReportApproval` / `ApprovalSheet`) — the backend marks the review request `approved`
 * itself when the named reviewer approves.
 *
 * The server only accepts this from the reviewer named on a `pending` request; it then sets the
 * request's status and, if the report had already been finalized, reopens it to `draft`.
 */
import { useCallback, useRef, useState } from 'react';

import { reportsApi, type Report, type ReviewRequest } from '@/services/api/reports';
import { ApiRequestError } from '@/types/api';
import { isReviewedStatus } from '../reportActions';

export type ReviewDecision = 'changes_requested' | 'rejected';

export const MAX_REVIEW_NOTES = 1000;

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return 'We could not send your response. Please try again.';
}

/** The report as it is after a successful response — mirrors the route's own update. */
export function applyReviewResponse(report: Report, reviewRequest: ReviewRequest): Report {
  return { ...report, reviewRequest, status: isReviewedStatus(report.status) ? 'draft' : report.status };
}

export function useReviewResponse(report: Report | null, onResponded: (report: Report) => void) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const respond = useCallback(
    async (decision: ReviewDecision, notes: string): Promise<boolean> => {
      if (!report || inFlight.current) return false;
      inFlight.current = true;
      setSubmitting(true);
      setError(null);
      try {
        const trimmed = notes.trim().slice(0, MAX_REVIEW_NOTES);
        const result = await reportsApi.submitReviewResponse(report.id, decision, trimmed || undefined);
        onResponded(applyReviewResponse(report, result.reviewRequest));
        return true;
      } catch (err) {
        setError(errorMessage(err));
        return false;
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    },
    [report, onResponded]
  );

  return { respond, submitting, error, clearError: () => setError(null) };
}
