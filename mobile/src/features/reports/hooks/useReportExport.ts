/**
 * Export + save-and-share for a report. `GET /:id/download` proxies private bytes rather than
 * redirecting to a public URL (see `reportsApi.downloadExport`'s own comment) — there is no
 * "just open this link" option on mobile, so the flow is: start the export job, download its
 * bytes through the authenticated client, write them to a temp cache file, then hand that file
 * to the native share sheet (`expo-sharing`). Never attempts an unauthenticated fetch of the
 * download URL.
 *
 * Storage, stated accurately to the user: the file lives in this app's temporary cache only —
 * it is not in the device's Files/Downloads, it's replaced by the next export, and it's removed
 * on sign-out (or whenever the OS clears app caches). Saving a permanent copy happens through
 * the share sheet ("Save to Files", Drive, email…), which is why the file is kept until then.
 */
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';

import { reportsApi, type ExportFormat, type ExportOptions } from '@/services/api/reports';
import { clearExportFiles, exportDirectory, safePathSegment } from '@/services/localData/fileCache';
import { ApiRequestError } from '@/types/api';

/** Shown whenever the share sheet didn't complete — where the file actually is. */
export const TEMP_FILE_NOTICE =
  'The export is held in this app’s temporary storage only until your next export or sign-out — it is not saved to your Files or Downloads. Use Share to save a copy.';

const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  html: 'text/html',
};

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.category === 'timeout') return 'The export is taking longer than expected. Please try again in a moment.';
    return err.message;
  }
  return 'We could not export this report. Please try again.';
}

/** A server-supplied filename is never trusted as a path. Exported for tests. */
export function exportFileName(serverName: string, format: ExportFormat): string {
  const safe = safePathSegment(serverName || '', '');
  if (!safe || safe === '_') return `report.${format}`;
  return /\.[a-zA-Z0-9]+$/.test(safe) ? safe : `${safe}.${format}`;
}

/** Clears any previously exported files before writing a new one — bounded, best-effort
 * cleanup (task requirement: "Clean temporary files where appropriate") that never races an
 * in-flight share, since it only ever runs before a NEW export starts. */
function resetExportDir(): void {
  clearExportFiles();
  try {
    exportDirectory().create({ intermediates: true, idempotent: true });
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
        const file = new File(exportDirectory(), exportFileName(job.filename, job.format));
        file.write(new Uint8Array(binary.data));

        const available = await Sharing.isAvailableAsync();
        if (!available) {
          const reason = `Sharing isn’t available on this device, so the export can’t be saved elsewhere from here. ${TEMP_FILE_NOTICE}`;
          setExporting(false);
          return { status: 'saved-only', uri: file.uri, reason };
        }

        try {
          await Sharing.shareAsync(file.uri, {
            mimeType: binary.contentType || MIME_BY_FORMAT[job.format],
            dialogTitle: file.name,
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
