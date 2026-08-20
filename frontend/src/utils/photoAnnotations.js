// Phase 24: client-side annotation helpers shared between PhotoAnnotator.jsx
// and any code that needs to read/summarize a photo's saved shapes. Mirrors
// (but does not import -- frontend/backend are separate runtimes) the
// validation limits in backend/services/photoJobService.js so the editor UI
// can enforce the same caps before ever hitting the server.

export const ANNOTATION_SHAPE_TYPES = ['arrow', 'circle', 'rect', 'freehand', 'measurement'];
export const MAX_ANNOTATION_SHAPES = 60;
export const MAX_ANNOTATION_POINTS = 200;
export const DEFAULT_ANNOTATION_COLOR = '#FD4403';
export const DEFAULT_STROKE_WIDTH = 3;

let idCounter = 0;
export const generateShapeId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `shape-${Date.now()}-${idCounter}`;
};

// Points are stored normalized (0..1 fractions of the image's real pixel
// width/height), not raw pixels -- resolution-independent, so a shape drawn
// on a small preview still lands in the right place on the full-size image.
// Measurement labels convert back to real image pixels using the photo's
// actual natural width/height -- NEVER a physical unit, since there is no
// calibration scale anywhere in this product.
export const distanceInImagePixels = (pointA, pointB, imageWidth, imageHeight) => {
  const dx = (pointB.x - pointA.x) * imageWidth;
  const dy = (pointB.y - pointA.y) * imageHeight;
  return Math.sqrt(dx * dx + dy * dy);
};

export const formatMeasurementLabel = (pointA, pointB, imageWidth, imageHeight) => {
  if (!imageWidth || !imageHeight) return '';
  const px = distanceInImagePixels(pointA, pointB, imageWidth, imageHeight);
  return `~${Math.round(px)} px (image pixels, not a physical measurement)`;
};

// Mirrors photoCaptureTime.js's presentation intent: always say plainly
// whether a timestamp came from the photo's own EXIF data or is just the
// server's upload-received time, never presenting the fallback as if it
// were a real capture time.
export const formatCapturedAt = (capturedAt) => {
  if (!capturedAt?.value) return null;
  const date = new Date(capturedAt.value);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  return capturedAt.source === 'exif'
    ? { text: formatted, caption: 'From the photo’s own capture data' }
    : { text: formatted, caption: 'Upload time — no reliable capture time was available' };
};
