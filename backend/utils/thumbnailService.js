// Server-side thumbnail generation + EXIF-orientation normalization (Phase 6:
// Photo Upload & Per-Photo UX Hardening). Uses the already-installed `sharp`
// library (previously only used for white-label logos, see
// backend/routes/whitelabel.js).
//
// Why normalize the full stored image, not just the thumbnail: modern browsers
// auto-rotate <img> tags per EXIF, but the PDF/DOCX export generators
// (properPdfGenerator.js / documentGenerator.js) embed the raw image bytes and
// do not read EXIF orientation -- without this, a phone photo taken in
// portrait/upside-down orientation renders sideways in an exported report.
const sharp = require('sharp');

const THUMBNAIL_MAX_DIMENSION = 320;

// sharp(...).rotate() with no arguments reads the image's own EXIF
// Orientation tag, physically rotates the pixel data to match it, and strips
// the tag from the output -- the standard "normalize orientation" recipe.
// Re-encodes to the original format where sharp supports it; unsupported/
// exotic formats (e.g. some HEIC variants on a libvips build without HEIF
// support, animated GIFs) throw, and the caller falls back to the original
// bytes rather than failing the whole photo upload over a cosmetic fix.
const normalizeOrientation = async (buffer) => {
  const image = sharp(buffer, { failOn: 'none' });
  const meta = await image.metadata();
  const rotated = sharp(buffer, { failOn: 'none' }).rotate();
  switch (meta.format) {
    case 'png':
      return rotated.png().toBuffer();
    case 'webp':
      return rotated.webp().toBuffer();
    case 'gif':
      return rotated.gif().toBuffer();
    default:
      return rotated.jpeg({ quality: 92 }).toBuffer();
  }
};

// Generates a small JPEG thumbnail (bounded to THUMBNAIL_MAX_DIMENSION on the
// long edge, aspect preserved, never upscaled). Also EXIF-normalizes, so a
// thumbnail generated straight from the original bytes (normalization failed
// or wasn't attempted) still displays right-side-up.
const generateThumbnail = async (buffer) =>
  sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();

module.exports = { normalizeOrientation, generateThumbnail, THUMBNAIL_MAX_DIMENSION };
