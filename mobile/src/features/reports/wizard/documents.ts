/**
 * Supporting documents for `POST /reports/generate` (`documents` field): at most 10 files, 10 MB each, PDF / DOC /
 * DOCX / TXT only — the same allowlist as `generateUpload` in backend/routes/reports.js. The server also checks the
 * file content (`firstInvalidDocument`), so a renamed file is still rejected there with `INVALID_DOCUMENT`.
 */
export const MAX_DOCUMENTS = 10;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};
export const ALLOWED_DOCUMENT_MIME_TYPES = Object.values(MIME_BY_EXT);

export interface WizardDocument {
  localId: string;
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
}

/** Pickers sometimes report a generic type (`application/octet-stream`) — fall back to the extension. */
export function documentMimeType(name: string, reported?: string | null): string | null {
  if (reported && ALLOWED_DOCUMENT_MIME_TYPES.includes(reported)) return reported;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? null;
}

export function documentError(
  file: { name: string; mimeType?: string | null; size?: number | null },
  alreadyAdded: readonly WizardDocument[]
): string | null {
  if (alreadyAdded.length >= MAX_DOCUMENTS) return `You can attach up to ${MAX_DOCUMENTS} documents.`;
  if (!documentMimeType(file.name, file.mimeType)) return `"${file.name}" isn't a PDF, Word or text document.`;
  if (file.size != null && file.size > MAX_DOCUMENT_BYTES) return `"${file.name}" is larger than 10 MB.`;
  if (alreadyAdded.some((d) => d.name === file.name && d.size === (file.size ?? null))) return `"${file.name}" is already attached.`;
  return null;
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
