// Magic-byte (file-signature) validation for uploaded supporting documents.
// Mirrors utils/imageValidation.js: multer only checks the client-supplied
// mimetype, which is trivially spoofed, so this inspects the actual bytes
// before a file is stored (Rule #6).

const startsWith = (buf, bytes, offset = 0) =>
  bytes.every((b, i) => buf[offset + i] === b);

// Returns the detected document type ('pdf'|'docx'|'doc'|'txt') or null.
// 'docx' is detected via the generic ZIP signature (OOXML container) --
// same tradeoff already accepted for image sniffing (e.g. HEIC's shared
// ISO-BMFF container): the signature identifies the container format, not
// the specific document type, so a same-signature file with the matching
// extension is accepted.
const sniffDocumentType = (buf, originalName = '') => {
  if (!buf || buf.length < 4) return null;
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'; // "%PDF-"
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return 'docx'; // ZIP/OOXML
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'doc'; // OLE compound file
  // Plain text has no magic bytes -- accept only if the sampled bytes look
  // like text (no NUL bytes, which reliably rules out disguised binaries).
  if (/\.txt$/i.test(originalName)) {
    const sample = buf.slice(0, 1024);
    if (!sample.includes(0x00)) return 'txt';
  }
  return null;
};

const DOCUMENT_EXT_BY_TYPE = { pdf: '.pdf', docx: '.docx', doc: '.doc', txt: '.txt' };

const isValidDocumentBuffer = (buf, originalName = '') => {
  const detected = sniffDocumentType(buf, originalName);
  if (!detected) return false;
  const ext = (originalName.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  return DOCUMENT_EXT_BY_TYPE[detected] === ext;
};

module.exports = { sniffDocumentType, isValidDocumentBuffer, DOCUMENT_EXT_BY_TYPE };
