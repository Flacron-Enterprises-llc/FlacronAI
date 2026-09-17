/**
 * The human-review attestation gate (Golden Rule #3 — a report only exports clean once a
 * licensed reviewer explicitly approves it). Eligibility mirrors `POST /:id/approve`'s own
 * server-side checks exactly (`backend/routes/reports.js`: rejects `status === 'processing'`
 * with `REPORT_PROCESSING`, and `regenerating === true` with `REPORT_REGENERATING`) — the
 * client only pre-disables the button using the same rule so the server's real rejection
 * message is what the user ultimately sees if they ever manage to race it, never a
 * client-invented approval rule of its own.
 */
import { useCallback, useState } from 'react';

import { reportsApi, type ApprovalSignature, type Report } from '@/services/api/reports';
import { ApiRequestError } from '@/types/api';

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return 'We could not approve this report. Please try again.';
}

export function isApprovalEligible(report: Report | null): boolean {
  if (!report) return false;
  if (report.status === 'processing') return false;
  if (report.regenerating === true) return false;
  return true;
}

export function useReportApproval(reportId: string, onApproved: (report: Report) => void) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approve = useCallback(
    async (signature: ApprovalSignature, content?: string) => {
      if (submitting) return; // guards a duplicate tap from firing two approvals
      setSubmitting(true);
      setError(null);
      try {
        const { report } = await reportsApi.approve(reportId, signature, content);
        onApproved(report);
        return true;
      } catch (err) {
        setError(errorMessage(err));
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [reportId, onApproved, submitting]
  );

  return { approve, submitting, error, clearError: () => setError(null) };
}
