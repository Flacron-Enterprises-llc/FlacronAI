// Phase 24: a fast, deterministic, server-side photo-quality heuristic.
// Two independent checks, either of which sets `qualityWarning: true` --
// this NEVER rejects a photo. A flagged photo still uploads, still gets
// analyzed, and still appears in every review/report/export workflow; the
// warning is purely informational for the human reviewer.
//
// 1. Resolution: below MIN_WIDTH x MIN_HEIGHT pixels. Modern phone cameras
//    shoot well above 3000px on the long edge, so 800x600 is a low bar that
//    only catches genuinely tiny/thumbnail-sized uploads, not ordinary
//    compression.
//
// 2. Blur: the "variance of the Laplacian" metric (the same one commonly
//    used with OpenCV's `cv2.Laplacian(img, CV_64F).var()`), computed here
//    with `sharp` -- already a project dependency, so this adds none --
//    instead of pulling in a dedicated blur/OpenCV library. A greyscale
//    3x3 discrete-Laplacian convolution kernel produces an edge-response
//    image; a sharp, detailed photo has many strong edges (high variance
//    in that response), while a blurry/out-of-focus photo has few (low
//    variance).
//
// Threshold calibration (empirically measured against this module's own
// fixtures -- see backend/test/photo-quality.test.js): a deterministic
// pseudo-noise 64x64 test pattern scores ~5461; the same pattern with a
// 20px Gaussian blur applied scores ~32; a flat solid-color image scores 0.
// BLUR_VARIANCE_THRESHOLD=50 sits well inside that ~30-to-thousands gap.
// This is a heuristic, not a certainty -- re-tune here if real-world use
// shows too many false positives/negatives.
const sharp = require('sharp');

const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;
const BLUR_VARIANCE_THRESHOLD = 50;

const LAPLACIAN_KERNEL = { width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] };

// Assesses one already-decoded image buffer. Never throws -- any decode
// failure fails open (`qualityWarning: false`) rather than blocking the
// upload or falsely flagging a format this heuristic can't read.
const assessPhotoQuality = async (buffer) => {
  const reasons = [];
  const metrics = { width: null, height: null, laplacianVariance: null };

  try {
    const image = sharp(buffer);
    const meta = await image.metadata();
    metrics.width = meta.width || null;
    metrics.height = meta.height || null;
    if ((meta.width || 0) < MIN_WIDTH || (meta.height || 0) < MIN_HEIGHT) {
      reasons.push('low_resolution');
    }

    const stats = await image
      .clone()
      .greyscale()
      .convolve(LAPLACIAN_KERNEL)
      .stats();
    const stdev = stats.channels?.[0]?.stdev || 0;
    const variance = Math.round(stdev * stdev * 100) / 100;
    metrics.laplacianVariance = variance;
    if (variance < BLUR_VARIANCE_THRESHOLD) {
      reasons.push('blurry');
    }
  } catch {
    return { qualityWarning: false, qualityReasons: [], qualityMetrics: metrics };
  }

  return { qualityWarning: reasons.length > 0, qualityReasons: reasons, qualityMetrics: metrics };
};

const QUALITY_REASON_LABELS = {
  low_resolution: 'Low resolution',
  blurry: 'Possibly blurry',
};

module.exports = {
  assessPhotoQuality,
  QUALITY_REASON_LABELS,
  MIN_WIDTH,
  MIN_HEIGHT,
  BLUR_VARIANCE_THRESHOLD,
};
