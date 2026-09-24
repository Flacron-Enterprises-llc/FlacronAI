// Single, hardened entry point for `sharp` plus byte-level validation of
// untrusted images (claim photos, profile/template/white-label logos, and
// stored images re-read at export time).
//
// Every backend module that decodes images must obtain `sharp` from here
// (never `require('sharp')` directly) so the decoder allow-list below is
// always in force before any untrusted bytes are touched.
//
// Why: GHSA-f88m-g3jw-g9cj (libvips; GIF/TIFF/VIPS loaders) and
// GHSA-rgj7-g3m4-5g8c (libheif; HEIF/AVIF loader) showed that libvips will
// happily run ANY decoder it was built with, chosen from the bytes -- not
// from the client's declared MIME type. The sharp upgrade fixes those
// specific CVEs; this module additionally shrinks the attack surface so a
// future decoder bug in a format the product never supports (TIFF, VIPS,
// SVG, JP2K, ...) cannot be reached at all.
const sharp = require('sharp');
const { sniffImageType } = require('./imageValidation');

// libvips decoder classes the product actually needs. Everything else under
// VipsForeignLoad is blocked process-wide. Encoders (savers) are unaffected.
// SVG is deliberately NOT decoded by sharp: SVG logos are stored as-is and
// never rasterised server-side.
const ALLOWED_DECODERS = Object.freeze([
  'VipsForeignLoadJpeg',
  'VipsForeignLoadPng',
  'VipsForeignLoadWebp',
  'VipsForeignLoadNsgif',
  'VipsForeignLoadHeif',
]);
sharp.block({ operation: ['VipsForeignLoad'] });
sharp.unblock({ operation: [...ALLOWED_DECODERS] });

// sharp's own default input-pixel limit (0x3FFF * 0x3FFF), made explicit so
// it is enforced before decoding and visible in one place. Unchanged value.
const MAX_INPUT_PIXELS = 0x3fff * 0x3fff;

// Formats (as named by sniffImageType) each surface accepts.
const PHOTO_TYPES = Object.freeze(['jpeg', 'png', 'gif', 'webp', 'heic']);
const LOGO_TYPES = Object.freeze(['jpeg', 'png', 'webp']);
// pdfkit (PDF export) can only embed these two.
const PDF_EMBEDDABLE_TYPES = Object.freeze(['jpeg', 'png']);

// sniffImageType name -> the `format` sharp's metadata() reports.
const SHARP_FORMAT = Object.freeze({
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
  heic: 'heif',
});
// sniffImageType name -> MIME types a client may legitimately declare for it.
const DECLARED_MIME = Object.freeze({
  jpeg: ['image/jpeg', 'image/jpg', 'image/pjpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  heic: ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'],
});

const LABEL = { jpeg: 'JPG', png: 'PNG', webp: 'WebP', gif: 'GIF', heic: 'HEIC' };

// HEIF containers can carry HEVC (HEIC) or AV1 (AVIF) pixel data, and the
// major brand (heic/mif1/msf1/...) is only a label: libvips even derives its
// reported `compression` from that label, so it cannot be trusted. Instead,
// read the top-level box list (bounded walk, no recursion) and look inside
// the `meta` box for the codec configuration/item-type markers: HEIC has
// hvcC/hvc1, AVIF has av1C/av01. Returns null if the structure is malformed
// or has no meta box.
const heifCodecMarkers = (buf) => {
  const n = buf.length;
  let off = 0;
  for (let boxes = 0; off + 8 <= n && boxes < 64; boxes += 1) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    let header = 8;
    if (size === 1) {
      if (off + 16 > n) return null;
      const large = buf.readBigUInt64BE(off + 8);
      if (large > BigInt(n - off)) return null;
      size = Number(large);
      header = 16;
    } else if (size === 0) {
      size = n - off;
    }
    if (size < header || off + size > n) return null;
    if (type === 'meta') {
      const body = buf.subarray(off + header, off + size);
      return {
        hevc: body.includes('hvcC', 0, 'latin1') || body.includes('hvc1', 0, 'latin1'),
        av1: body.includes('av1C', 0, 'latin1') || body.includes('av01', 0, 'latin1'),
      };
    }
    off += size;
  }
  return null;
};

// True only for a HEIF container whose metadata describes HEVC and no AV1.
const isHevcHeif = (buf) => {
  const markers = heifCodecMarkers(buf);
  return !!markers && markers.hevc && !markers.av1;
};

class ImageValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ImageValidationError';
    this.code = code;
    this.status = 400;
  }
}

// Validates untrusted image bytes. Resolves `{ type, meta }` or rejects with
// an ImageValidationError (status 400). Layers, cheapest first:
//   1. file signature (magic bytes) must be one of `allowed`;
//   2. optionally, the client-declared MIME type must match those bytes;
//   3. HEIF must structurally be HEVC (isHevcHeif) -- real HEIC, never AVIF
//      riding on a heic/mif1/msf1 brand;
//   4. sharp's header parse must agree on the format;
//   5. width x height must be within `maxPixels`.
// Headers are parsed only by the allow-listed decoders above.
const inspectImage = async (
  buffer,
  {
    allowed,
    declaredMimeType = null,
    requireDeclaredMatch = false,
    maxPixels = MAX_INPUT_PIXELS,
  } = {}
) => {
  const allowedList = allowed && allowed.length ? allowed : PHOTO_TYPES;
  const allowedText = allowedList.map((t) => LABEL[t] || t).join(', ');
  const type = sniffImageType(buffer);
  if (!type || !allowedList.includes(type)) {
    throw new ImageValidationError(
      `Unsupported image type. Allowed: ${allowedText}.`,
      'UNSUPPORTED_IMAGE_TYPE'
    );
  }
  if (requireDeclaredMatch) {
    const declared = String(declaredMimeType || '').toLowerCase();
    if (!DECLARED_MIME[type].includes(declared)) {
      throw new ImageValidationError(
        'The file contents do not match its declared image type.',
        'IMAGE_TYPE_MISMATCH'
      );
    }
  }

  // HEIF must structurally be HEVC (real HEIC), never AVIF on a HEIC-looking
  // brand. Checked before any libheif parsing.
  if (type === 'heic' && !isHevcHeif(buffer)) {
    throw new ImageValidationError(
      `Unsupported image type. Allowed: ${allowedText}.`,
      'UNSUPPORTED_IMAGE_TYPE'
    );
  }

  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: maxPixels }).metadata();
  } catch (err) {
    if (/pixel limit/i.test(String(err && err.message))) {
      throw new ImageValidationError(
        'The image dimensions are too large to process.',
        'IMAGE_TOO_LARGE'
      );
    }
    // HEIC keeps its pre-existing tolerance: the prebuilt libvips has no HEVC
    // decoder and may not parse some HEIC variants, and those uploads were
    // always accepted (stored as-is, no thumbnail). Only structurally-HEVC
    // files (checked above) reach here. Every other format must at least
    // have a readable header.
    if (type === 'heic') return { type, meta: null };
    throw new ImageValidationError(
      'The image could not be read (corrupt or truncated file).',
      'IMAGE_UNREADABLE'
    );
  }

  if (meta.format !== SHARP_FORMAT[type]) {
    throw new ImageValidationError(
      'The file contents do not match a supported image format.',
      'IMAGE_TYPE_MISMATCH'
    );
  }
  const pixels = (meta.width || 0) * (meta.height || 0);
  if (!pixels) {
    throw new ImageValidationError(
      'The image could not be read (corrupt or truncated file).',
      'IMAGE_UNREADABLE'
    );
  }
  if (pixels > maxPixels) {
    throw new ImageValidationError(
      'The image dimensions are too large to process.',
      'IMAGE_TOO_LARGE'
    );
  }
  return { type, meta };
};

// Cheap synchronous gate for bytes read back from storage at export time:
// only a signature in `allowed` may reach a decoder/embedder.
const isAllowedStoredImage = (buffer, allowed = PHOTO_TYPES) => {
  const type = sniffImageType(buffer);
  if (!type || !allowed.includes(type)) return false;
  return type !== 'heic' || isHevcHeif(buffer);
};

// Minimal SVG sanity check for SVG logo uploads (stored as-is, never
// rasterised). Rejects binary data wearing an image/svg+xml label: the bytes
// must not match any raster signature, contain no NUL bytes, and look like an
// XML/SVG document with an <svg> root element.
const isSvgDocument = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
  if (sniffImageType(buffer)) return false;
  if (buffer.includes(0)) return false;
  const text = buffer.toString('utf8').replace(/^FEFF/, '').trimStart();
  if (!text.startsWith('<')) return false;
  return /<svg[\s>]/i.test(text);
};

// Multer fileFilter for a declared-MIME pre-check. Raises an
// ImageValidationError (status 400) instead of a bare Error, so a rejected
// upload is a clear 4xx rather than a 500. This is only the first, cheap
// gate -- routes must still call inspectImage() on the actual bytes.
const mimeFileFilter = (allowedMimes, message) => (req, file, cb) => {
  if (allowedMimes.includes(file.mimetype)) return cb(null, true);
  return cb(new ImageValidationError(message, 'UNSUPPORTED_IMAGE_TYPE'));
};

// Validates one multer logo file. A declared SVG must really be an SVG
// document (it is stored as-is, never rasterised); anything else must be a
// raster logo whose bytes match its declared type. Resolves 'svg' or the
// sniffed raster type; rejects with ImageValidationError.
const validateLogoUpload = async (file, { allowSvg = false } = {}) => {
  if (allowSvg && file.mimetype === 'image/svg+xml') {
    if (!isSvgDocument(file.buffer)) {
      throw new ImageValidationError(
        'The file contents do not match its declared image type.',
        'IMAGE_TYPE_MISMATCH'
      );
    }
    return 'svg';
  }
  const { type } = await inspectImage(file.buffer, {
    allowed: LOGO_TYPES,
    declaredMimeType: file.mimetype,
    requireDeclaredMatch: true,
  });
  return type;
};

// Uniform 400 body for an ImageValidationError caught inside a route handler.
const imageErrorResponse = (res, err) =>
  res.status(400).json({ success: false, error: err.message, code: err.code });

module.exports = {
  sharp,
  mimeFileFilter,
  validateLogoUpload,
  imageErrorResponse,
  ALLOWED_DECODERS,
  MAX_INPUT_PIXELS,
  PHOTO_TYPES,
  LOGO_TYPES,
  PDF_EMBEDDABLE_TYPES,
  ImageValidationError,
  inspectImage,
  isHevcHeif,
  isAllowedStoredImage,
  isSvgDocument,
};
