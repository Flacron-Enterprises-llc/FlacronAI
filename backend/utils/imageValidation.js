// Magic-byte (file-signature) validation for uploaded images.
// Multer only checks the client-supplied mimetype, which is trivially spoofed.
// This inspects the actual bytes so a disguised file (e.g. a script renamed
// .jpg) is rejected before it is stored or processed (Rule #6).

const startsWith = (buf, bytes, offset = 0) =>
  bytes.every((b, i) => buf[offset + i] === b);

// Returns the detected image type ('jpeg'|'png'|'gif'|'webp'|'heic') or null.
const sniffImageType = (buf) => {
  if (!buf || buf.length < 12) return null;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return 'gif'; // GIF8
  // WEBP: "RIFF"...."WEBP"
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  // HEIC/HEIF: ISO-BMFF "ftyp" box at offset 4, brand heic/heix/mif1/msf1
  if (startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = buf.slice(8, 12).toString('latin1');
    if (['heic', 'heix', 'mif1', 'msf1', 'heif', 'hevc'].includes(brand)) return 'heic';
  }
  return null;
};

const isValidImageBuffer = (buf) => sniffImageType(buf) !== null;

module.exports = { sniffImageType, isValidImageBuffer };
