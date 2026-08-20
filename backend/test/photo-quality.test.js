const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { assessPhotoQuality, MIN_WIDTH, MIN_HEIGHT, BLUR_VARIANCE_THRESHOLD } = require('../utils/photoQuality');

// Deterministic synthetic fixtures (no external image files, no Math.random)
// -- a fixed pseudo-noise fill gives a photo-like fixture with plenty of
// high-frequency edges ("sharp"); blurring it heavily simulates an
// out-of-focus photo. Empirically measured variances (see photoQuality.js's
// header comment): noise ~5461, blur(20) of the same pattern ~32, flat ~0.
// BLUR_VARIANCE_THRESHOLD=50 sits well inside that gap.
const noisePattern = (width, height) => {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const v = (x * 37 + y * 59) % 256;
      raw[idx] = v;
      raw[idx + 1] = (v * 3) % 256;
      raw[idx + 2] = (v * 7) % 256;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
};

test('a sharp, adequately-sized synthetic photo gets no quality warning', async () => {
  const buffer = await noisePattern(1200, 900);
  const result = await assessPhotoQuality(buffer);
  assert.equal(result.qualityWarning, false);
  assert.deepEqual(result.qualityReasons, []);
  assert.equal(result.qualityMetrics.width, 1200);
  assert.equal(result.qualityMetrics.height, 900);
  assert.ok(result.qualityMetrics.laplacianVariance > BLUR_VARIANCE_THRESHOLD);
});

test('a heavily blurred version of the same photo is flagged "blurry"', async () => {
  const sharpBuffer = await noisePattern(1200, 900);
  const blurryBuffer = await sharp(sharpBuffer).blur(20).toBuffer();
  const result = await assessPhotoQuality(blurryBuffer);
  assert.equal(result.qualityWarning, true);
  assert.ok(result.qualityReasons.includes('blurry'));
  assert.ok(result.qualityMetrics.laplacianVariance < BLUR_VARIANCE_THRESHOLD);
});

test('a photo below the minimum resolution is flagged "low_resolution" even if sharp', async () => {
  const buffer = await noisePattern(400, 300);
  const result = await assessPhotoQuality(buffer);
  assert.equal(result.qualityWarning, true);
  assert.ok(result.qualityReasons.includes('low_resolution'));
  assert.ok(!result.qualityReasons.includes('blurry')); // the noise pattern itself is still sharp
  assert.ok(400 < MIN_WIDTH && 300 < MIN_HEIGHT);
});

test('a flat, single-color image is flagged "blurry" (zero edge variance)', async () => {
  const buffer = await sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 128, g: 128, b: 128 } } })
    .png()
    .toBuffer();
  const result = await assessPhotoQuality(buffer);
  assert.ok(result.qualityReasons.includes('blurry'));
  assert.equal(result.qualityMetrics.laplacianVariance, 0);
});

test('a photo can be flagged for both reasons at once', async () => {
  const sharpBuffer = await noisePattern(400, 300);
  const blurrySmall = await sharp(sharpBuffer).blur(20).toBuffer();
  const result = await assessPhotoQuality(blurrySmall);
  assert.equal(result.qualityWarning, true);
  assert.ok(result.qualityReasons.includes('low_resolution'));
  assert.ok(result.qualityReasons.includes('blurry'));
});

test('an undecodable buffer fails open -- no warning, never throws', async () => {
  const result = await assessPhotoQuality(Buffer.from('not an image at all'));
  assert.equal(result.qualityWarning, false);
  assert.deepEqual(result.qualityReasons, []);
});

test('this never rejects -- it only ever returns a warning flag, no error/exception path exists for "bad quality"', async () => {
  const sharpBuffer = await noisePattern(200, 150);
  const blurry = await sharp(sharpBuffer).blur(30).toBuffer();
  await assert.doesNotReject(() => assessPhotoQuality(blurry));
});
