// Vision payload sizing: per-image encoded (base64) limit, per-request byte
// budget, and the stored original left untouched.
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const {
  prepareImageForVision,
  packVisionBatches,
  analyzeImages,
  VISION_MAX_IMAGE_B64_BYTES,
  VISION_MAX_BATCH_B64_BYTES,
} = require('../services/aiService');

const noisyJpeg = (w, h, quality = 95) =>
  sharp({ create: { width: w, height: h, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 70 } } })
    .jpeg({ quality })
    .toBuffer();
const b64 = (n) => 4 * Math.ceil(n / 3);

test('large phone photo is brought under the per-image base64 limit; original untouched', async () => {
  const original = await noisyJpeg(4032, 3024);
  const copy = Buffer.from(original);
  assert.ok(b64(original.length) > VISION_MAX_IMAGE_B64_BYTES, 'fixture must exceed the limit');
  const out = await prepareImageForVision({ buffer: original, mimetype: 'image/jpeg', photoId: 'p' });
  assert.ok(out);
  assert.ok(b64(out.buffer.length) <= VISION_MAX_IMAGE_B64_BYTES);
  const meta = await sharp(out.buffer).metadata();
  assert.ok(Math.max(meta.width, meta.height) <= 2576);
  assert.ok(original.equals(copy), 'stored original buffer must not be modified');
});

test('small image passes through unchanged', async () => {
  const small = await noisyJpeg(800, 600, 80);
  const out = await prepareImageForVision({ buffer: small, mimetype: 'image/jpeg' });
  assert.ok(out.buffer.equals(small));
});

test('unresizable type over the limit is skipped, not sent', async () => {
  const huge = Buffer.alloc(VISION_MAX_IMAGE_B64_BYTES); // > limit once base64-encoded
  assert.equal(await prepareImageForVision({ buffer: huge, mimetype: 'image/gif' }), null);
});

test('batches respect both photo count and total encoded bytes', () => {
  const block = (bytes) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'x'.repeat(bytes) } });
  const big = Math.floor(VISION_MAX_BATCH_B64_BYTES / 3) + 1; // 3 of these exceed the budget
  const batches = packVisionBatches([block(big), block(big), block(big), block(10)], ['a', 'b', 'c', 'd']);
  batches.forEach((b) => assert.ok(b.bytes <= VISION_MAX_BATCH_B64_BYTES));
  assert.deepEqual(batches.map((b) => b.photoIds), [['a', 'b'], ['c', 'd']]);
  const many = packVisionBatches(Array.from({ length: 23 }, () => block(10)), Array.from({ length: 23 }, (_, i) => i));
  assert.deepEqual(many.map((b) => b.blocks.length), [10, 10, 3]);
});

test('analyzeImages sends every batch within the request byte budget', async () => {
  const photos = await Promise.all(Array.from({ length: 12 }, (_, i) => noisyJpeg(3000, 2250, 92).then((buffer) => ({ buffer, mimetype: 'image/jpeg', photoId: `p${i}` }))));
  const sent = [];
  await analyzeImages(photos, {
    callVisionApi: async (prompt, blocks) => {
      sent.push(blocks.reduce((n, bl) => n + bl.source.data.length, 0));
      return JSON.stringify({ photos: blocks.map(() => ({ observation: 'ok' })) });
    },
  });
  assert.ok(sent.length >= 2);
  sent.forEach((bytes) => assert.ok(bytes <= VISION_MAX_BATCH_B64_BYTES, `batch ${bytes} over budget`));
});
