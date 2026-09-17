/**
 * Export + save-and-share for a report. `GET /:id/download` proxies private bytes rather than
 * redirecting to a public URL (see `reportsApi.downloadExport`'s own comment) — there is no
 * "just open this link" option on mobile, so the flow is: start the export job, download its
 * bytes through the authenticated client, write them to a temp cache file, then hand that file
 * to the native share sheet (`expo-sharing`). Never attempts an unauthenticated fetch of the
 * download URL.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';

import { reportsApi, type ExportFormat, type ExportOptions } from '@/services/api/reports';
import { ApiRequestError } from '@/types/api';

const EXPORT_DIR = new Directory(Paths.cache, 'flac-exports');

const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  html: 'text/html',
};

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return 'We could not export this report. Please try again.';
}

/** Clears any previously exported files before writing a new one — bounded, best-effort
 * cleanup (task requirement: "Clean temporary files where appropriate") that never races an
 * in-flight share, since it only ever runs before a NEW export starts. */
function resetExportDir(): void {
  try {
    if (EXPORT_DIR.exists) EXPORT_DIR.delete();
  } catch {
    // Best-effort — a leftover file from a previous export is harmless; `create` below still
    // succeeds once the stale directory is out of the way, or already is.
  }
  try {
    EXPORT_DIR.create({ intermediates: true, idempotent: true });
  } catch {
    // If this genuinely fails (e.g. no disk space), the write below will surface the real error.
  }
}

export type ExportOutcome =
  | { status: 'shared'; uri: string }
  | { status: 'saved-only'; uri: string; reason: string }
  | { status: 'share-failed'; uri: string; message: string }
  | { status: 'error'; message: string };

export function useReportExport(reportId: string) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportAndShare = useCallback(
    async (options: ExportOptions = { format: 'pdf' }): Promise<ExportOutcome> => {
      setExporting(true);
      setError(null);
      try {
        const job = await reportsApi.exportReport(reportId, options);
        const binary = await reportsApi.downloadExport(reportId, job.filename);

        resetExportDir();
        const file = new File(EXPORT_DIR, job.filename);
        file.write(new Uint8Array(binary.data));

        const available = await Sharing.isAvailableAsync();
        if (!available) {
          const reason = 'Sharing is not available on this device. The exported file was saved on-device only.';
          setExporting(false);
          return { status: 'saved-only', uri: file.uri, reason };
        }

        try {
          await Sharing.shareAsync(file.uri, {
            mimeType: binary.contentType || MIME_BY_FORMAT[job.format],
            dialogTitle: job.filename,
            UTI: job.format === 'pdf' ? 'com.adobe.pdf' : undefined,
          });
          setExporting(false);
          return { status: 'shared', uri: file.uri };
        } catch (shareErr) {
          // The export itself succeeded and the file is safely on-device — only the share
          // sheet step failed (or the user backed out in a way the OS surfaces as an error on
          // this platform version). Not treated as a hard failure.
          setExporting(false);
          return {
            status: 'share-failed',
            uri: file.uri,
            message: shareErr instanceof Error ? shareErr.message : 'Could not open the share sheet.',
          };
        }
      } catch (err) {
        const message = errorMessage(err);
        setError(message);
        setExporting(false);
        return { status: 'error', message };
      }
    },
    [reportId]
  );

  return { exportAndShare, exporting, error, clearError: () => setError(null) };
}
