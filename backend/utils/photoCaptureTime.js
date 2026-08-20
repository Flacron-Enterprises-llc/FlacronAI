// Phase 24: EXIF capture-time extraction with a trustworthiness check.
// Falls back to the server's upload-received timestamp whenever EXIF is
// absent, unparseable, or looks untrustworthy (e.g. a camera clock reset to
// a well-known default, or a claimed capture time in the future relative to
// the upload). Must be called with the ORIGINAL, unmodified upload bytes --
// `normalizeOrientation()` (thumbnailService.js) re-encodes through sharp
// without `.withMetadata()`, which strips EXIF entirely from its output, so
// the display/thumbnail buffers never carry capture-time data.
const sharp = require('sharp');
const exifReader = require('exif-reader');

// Cameras with an unset/reset clock commonly default to one of these exact
// instants -- treated as untrustworthy rather than a real capture time.
const SUSPICIOUS_DEFAULTS_MS = [
  new Date('1970-01-01T00:00:00.000Z').getTime(),
  new Date('1980-01-01T00:00:00.000Z').getTime(),
  new Date('2000-01-01T00:00:00.000Z').getTime(),
];
// Before consumer digital cameras commonly embedded EXIF DateTimeOriginal.
const EARLIEST_TRUSTWORTHY_YEAR = 1995;
// Clock drift grace window -- a claimed capture time up to a day after the
// server-recorded upload time is still plausible (client clock skew); much
// further ahead is treated as untrustworthy.
const FUTURE_GRACE_MS = 24 * 60 * 60 * 1000;

const isTrustworthy = (date, uploadedAt) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const ms = date.getTime();
  if (date.getUTCFullYear() < EARLIEST_TRUSTWORTHY_YEAR) return false;
  if (SUSPICIOUS_DEFAULTS_MS.includes(ms)) return false;
  const uploadMs = uploadedAt instanceof Date ? uploadedAt.getTime() : Date.parse(uploadedAt);
  if (Number.isFinite(uploadMs) && ms > uploadMs + FUTURE_GRACE_MS) return false;
  return true;
};

// Returns `{ value: ISOString, source: 'exif' | 'upload' }`. Never throws --
// any decode/parse failure falls back to the upload timestamp.
const resolveCapturedAt = async (originalBuffer, uploadedAtIso) => {
  const uploadedAt = new Date(uploadedAtIso || Date.now());
  try {
    const meta = await sharp(originalBuffer).metadata();
    if (meta.exif) {
      const tags = exifReader(meta.exif);
      const candidate = tags?.Photo?.DateTimeOriginal || tags?.Image?.DateTime || null;
      if (candidate && isTrustworthy(candidate, uploadedAt)) {
        return { value: candidate.toISOString(), source: 'exif' };
      }
    }
  } catch {
    // Fall through to the upload-time fallback below.
  }
  return { value: uploadedAt.toISOString(), source: 'upload' };
};

module.exports = { resolveCapturedAt, isTrustworthy, EARLIEST_TRUSTWORTHY_YEAR, FUTURE_GRACE_MS };
