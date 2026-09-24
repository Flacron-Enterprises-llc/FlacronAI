const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Security + regression coverage for the sharp 0.35.4 upgrade and the
// hardened image pipeline (utils/safeImage.js). Every fixture is a small,
// benign image generated in-process by sharp (or a deliberately corrupt /
// truncated / mislabelled copy of one) -- no exploit payloads.
const {
  sharp,
  ALLOWED_DECODERS,
  MAX_INPUT_PIXELS,
  PHOTO_TYPES,
  LOGO_TYPES,
  inspectImage,
  isAllowedStoredImage,
  isSvgDocument,
  ImageValidationError,
} = require('../utils/safeImage');
const {
  normalizeOrientation,
  generateThumbnail,
  THUMBNAIL_MAX_DIMENSION,
} = require('../utils/thumbnailService');
const { assessPhotoQuality } = require('../utils/photoQuality');
const { resolveCapturedAt } = require('../utils/photoCaptureTime');
const { processPhotoBatch } = require('../utils/photoBatchProcessor');

// ---- fixtures ---------------------------------------------------------------

const solid = (width, height, background, channels = 3) =>
  sharp({ create: { width, height, channels, background } });

const noise = (width, height) =>
  sharp({
    create: { width, height, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 60 } },
  });

// 40x20 with four coloured quadrants: TL red, TR blue, BL green, BR white.
const quadrantJpeg = async (orientation) => {
  const q = (bg) => solid(20, 10, bg).png().toBuffer();
  const base = await solid(40, 20, '#000')
    .composite([
      { input: await q('#ff0000'), left: 0, top: 0 },
      { input: await q('#0000ff'), left: 20, top: 0 },
      { input: await q('#00ff00'), left: 0, top: 10 },
      { input: await q('#ffffff'), left: 20, top: 10 },
    ])
    .png()
    .toBuffer();
  return sharp(base).jpeg({ quality: 100 }).withMetadata({ orientation }).toBuffer();
};

const pixelAt = async (buffer, x, y) => {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2], info.channels === 4 ? data[i + 3] : 255];
};

const colourName = ([r, g, b]) => {
  const hi = (v) => v > 160;
  const lo = (v) => v < 90;
  if (hi(r) && lo(g) && lo(b)) return 'red';
  if (lo(r) && lo(g) && hi(b)) return 'blue';
  if (lo(r) && hi(g) && lo(b)) return 'green';
  if (hi(r) && hi(g) && hi(b)) return 'white';
  return `rgb(${r},${g},${b})`;
};

// A real VIPS-format file can only be written to disk by sharp.
const vipsFixture = async () => {
  const file = path.join(os.tmpdir(), `flacron-vips-fixture-${process.pid}-${Date.now()}.v`);
  await solid(8, 8, '#ffffff').toFile(file);
  try {
    return fs.readFileSync(file);
  } finally {
    fs.rmSync(file, { force: true });
  }
};

const formats = async () => ({
  jpeg: await solid(16, 16, '#336699').jpeg().toBuffer(),
  png: await solid(16, 16, { r: 255, g: 0, b: 0, alpha: 0.5 }, 4).png().toBuffer(),
  webp: await solid(16, 16, { r: 0, g: 0, b: 255, alpha: 0.5 }, 4)
    .webp({ lossless: true })
    .toBuffer(),
  gif: await solid(16, 16, '#00ff00').gif().toBuffer(),
  tiff: await solid(16, 16, '#123456').tiff().toBuffer(),
  avif: await solid(16, 16, '#654321').avif().toBuffer(),
  vips: await vipsFixture(),
});

// Rewrites an ISO-BMFF major brand (bytes 8..11), e.g. to disguise AVIF as the
// generic 'mif1' or as 'heic'. Benign: only the container label changes.
const withBrand = (buf, brand) => {
  const copy = Buffer.from(buf);
  copy.write(brand, 8, 'latin1');
  return copy;
};

const expectRejection = async (promise, code) => {
  await assert.rejects(promise, (err) => {
    assert.ok(
      err instanceof ImageValidationError,
      `expected ImageValidationError, got ${err && err.name}`
    );
    assert.equal(err.code, code);
    assert.equal(err.status, 400);
    return true;
  });
};

// ---- runtime versions -----------------------------------------------------

const atLeast = (actual, min) => {
  const a = String(actual).split('.').map(Number);
  const m = min.split('.').map(Number);
  for (let i = 0; i < m.length; i += 1) {
    if ((a[i] || 0) !== m[i]) return (a[i] || 0) > m[i];
  }
  return true;
};

test("runtime: sharp >= 0.35.4 with libvips >= 8.18.3 and libheif >= 1.23.2 (both advisories' fixed versions)", () => {
  const pkg = JSON.parse(
    fs.readFileSync(require.resolve('sharp').replace(/dist[\\/].*$/, 'package.json'), 'utf8')
  );
  assert.ok(atLeast(pkg.version, '0.35.4'), `sharp ${pkg.version}`);
  assert.ok(atLeast(sharp.versions.vips, '8.18.3'), `libvips ${sharp.versions.vips}`);
  assert.ok(atLeast(sharp.versions.heif, '1.23.2'), `libheif ${sharp.versions.heif}`);
});

// ---- decoder allow-list -----------------------------------------------------

test('decoder allow-list: only JPEG/PNG/WebP/GIF/HEIF decoders are enabled', () => {
  assert.deepEqual([...ALLOWED_DECODERS].sort(), [
    'VipsForeignLoadHeif',
    'VipsForeignLoadJpeg',
    'VipsForeignLoadNsgif',
    'VipsForeignLoadPng',
    'VipsForeignLoadWebp',
  ]);
});

test('decoder allow-list: TIFF, VIPS and SVG bytes are refused by sharp itself; supported formats decode', async () => {
  const fx = await formats();
  for (const key of ['jpeg', 'png', 'webp', 'gif']) {
    const meta = await sharp(fx[key]).metadata();
    assert.ok(meta.width > 0, key);
  }
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>'
  );
  for (const [key, buf] of [
    ['tiff', fx.tiff],
    ['vips', fx.vips],
    ['svg', svg],
  ]) {
    await assert.rejects(
      () => sharp(buf).metadata(),
      /unsupported image format/i,
      `${key} must not be decodable`
    );
  }
});

// ---- inspectImage: allowed formats, mislabelled, corrupt, limits ---------

test('inspectImage accepts every product-supported photo format', async () => {
  const fx = await formats();
  for (const key of ['jpeg', 'png', 'webp', 'gif']) {
    const { type, meta } = await inspectImage(fx[key], { allowed: PHOTO_TYPES });
    assert.equal(type, key);
    assert.equal(meta.width, 16);
  }
});

test('inspectImage rejects TIFF, VIPS and plain AVIF (not supported types)', async () => {
  const fx = await formats();
  for (const key of ['tiff', 'vips', 'avif']) {
    await expectRejection(
      inspectImage(fx[key], { allowed: PHOTO_TYPES }),
      'UNSUPPORTED_IMAGE_TYPE'
    );
  }
});

test('inspectImage rejects AVIF disguised with a generic mif1/msf1 or heic brand (HEIF must be HEVC)', async () => {
  const { avif } = await formats();
  for (const brand of ['mif1', 'msf1', 'heic']) {
    await expectRejection(
      inspectImage(withBrand(avif, brand), { allowed: PHOTO_TYPES }),
      'UNSUPPORTED_IMAGE_TYPE'
    );
  }
});

test('inspectImage: GIF is a valid photo but not a valid logo type', async () => {
  const { gif } = await formats();
  await inspectImage(gif, { allowed: PHOTO_TYPES });
  await expectRejection(inspectImage(gif, { allowed: LOGO_TYPES }), 'UNSUPPORTED_IMAGE_TYPE');
});

test('inspectImage: a declared type that does not match the bytes is IMAGE_TYPE_MISMATCH when a match is required', async () => {
  const fx = await formats();
  await expectRejection(
    inspectImage(fx.jpeg, {
      allowed: LOGO_TYPES,
      declaredMimeType: 'image/png',
      requireDeclaredMatch: true,
    }),
    'IMAGE_TYPE_MISMATCH'
  );
  const ok = await inspectImage(fx.png, {
    allowed: LOGO_TYPES,
    declaredMimeType: 'image/png',
    requireDeclaredMatch: true,
  });
  assert.equal(ok.type, 'png');
});

test('corrupt accepted-format files (valid signature, garbage body) are rejected as IMAGE_UNREADABLE', async () => {
  const garbage = Buffer.alloc(64, 0x5a);
  const corrupt = {
    jpeg: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), garbage]),
    png: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), garbage]),
    gif: Buffer.concat([Buffer.from('GIF89a', 'latin1'), garbage]),
    webp: Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.alloc(4),
      Buffer.from('WEBP', 'latin1'),
      garbage,
    ]),
  };
  for (const [key, buf] of Object.entries(corrupt)) {
    await expectRejection(inspectImage(buf, { allowed: PHOTO_TYPES }), 'IMAGE_UNREADABLE');
    assert.ok(key);
  }
});

test('truncated accepted-format files never crash: readable headers pass, thumbnails degrade gracefully', async () => {
  const full = {
    jpeg: await noise(400, 300).jpeg().toBuffer(),
    png: await noise(200, 150).png().toBuffer(),
    webp: await noise(200, 150).webp().toBuffer(),
    gif: await noise(200, 150).gif().toBuffer(),
  };
  for (const [key, buf] of Object.entries(full)) {
    const truncated = buf.subarray(0, Math.floor(buf.length / 2));
    let accepted = true;
    try {
      await inspectImage(truncated, { allowed: PHOTO_TYPES });
    } catch (err) {
      accepted = false;
      assert.ok(
        err instanceof ImageValidationError,
        `${key}: only a clean validation error is allowed`
      );
    }
    if (accepted) {
      // The pipeline treats these helpers as best-effort; they must settle, not hang or crash the process.
      await Promise.allSettled([generateThumbnail(truncated), normalizeOrientation(truncated)]);
    }
  }
});

// Minimal ISO-BMFF box: 4-byte size + 4-char type + payload.
const box = (type, payload = Buffer.alloc(0)) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + payload.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, payload]);
};
// Synthetic HEIC-shaped container (ftyp + meta declaring an hvc1 item with an
// hvcC property). Structure only, no image data -- NOT a real iPhone HEIC,
// since no safe real fixture exists in the repo.
const syntheticHeic = (
  brand = 'heic',
  metaPayload = Buffer.from('iinfinfehvc1ipcohvcC', 'latin1')
) =>
  Buffer.concat([
    box('ftyp', Buffer.from(`${brand}\0\0\0\0mif1heic`, 'latin1')),
    box('meta', metaPayload),
  ]);

test('HEIC tolerance: a structurally-HEVC HEIF that libvips cannot parse is still accepted (pre-existing behaviour)', async () => {
  for (const brand of ['heic', 'heix', 'mif1']) {
    const { type, meta } = await inspectImage(syntheticHeic(brand), { allowed: PHOTO_TYPES });
    assert.equal(type, 'heic');
    assert.equal(meta, null);
  }
});

test('HEIC structure check: no meta box, no HEVC markers, or any AV1 marker is rejected before libheif parses it', async () => {
  const ftypOnly = box('ftyp', Buffer.from('heic\0\0\0\0mif1heic', 'latin1'));
  const noHevc = syntheticHeic('heic', Buffer.from('iinfinfejpeg', 'latin1'));
  const mixed = syntheticHeic('heic', Buffer.from('iinfinfehvc1ipcohvcCav1C', 'latin1'));
  const truncatedBox = Buffer.concat([
    ftypOnly,
    Buffer.from([0x00, 0x00, 0xff, 0xff]),
    Buffer.from('meta', 'latin1'),
  ]);
  for (const buf of [ftypOnly, noHevc, mixed, truncatedBox]) {
    await expectRejection(inspectImage(buf, { allowed: PHOTO_TYPES }), 'UNSUPPORTED_IMAGE_TYPE');
    assert.equal(isAllowedStoredImage(buf), false);
  }
  assert.equal(isAllowedStoredImage(syntheticHeic()), true);
});

test("pixel limit: the explicit limit equals sharp's default and oversized images are IMAGE_TOO_LARGE", async () => {
  assert.equal(MAX_INPUT_PIXELS, 0x3fff * 0x3fff);
  const img = await solid(20, 20, '#888').png().toBuffer();
  await expectRejection(
    inspectImage(img, { allowed: PHOTO_TYPES, maxPixels: 399 }),
    'IMAGE_TOO_LARGE'
  );
  const ok = await inspectImage(img, { allowed: PHOTO_TYPES, maxPixels: 400 });
  assert.equal(ok.meta.width, 20);
});

// ---- stored-image / SVG gates ----------------------------------------------

test('isAllowedStoredImage only admits allowed signatures (export-time gate)', async () => {
  const fx = await formats();
  assert.equal(isAllowedStoredImage(fx.jpeg), true);
  assert.equal(isAllowedStoredImage(fx.gif), true);
  assert.equal(isAllowedStoredImage(fx.tiff), false);
  assert.equal(isAllowedStoredImage(fx.vips), false);
  assert.equal(isAllowedStoredImage(fx.avif), false);
  for (const brand of ['mif1', 'msf1', 'heic']) {
    assert.equal(
      isAllowedStoredImage(withBrand(fx.avif, brand)),
      false,
      `AVIF relabelled ${brand}`
    );
  }
  assert.equal(isAllowedStoredImage(fx.gif, ['jpeg', 'png']), false);
  assert.equal(isAllowedStoredImage(null), false);
});

test('isSvgDocument accepts a real SVG and rejects binary images or non-SVG text wearing an SVG label', async () => {
  const fx = await formats();
  assert.equal(
    isSvgDocument(
      Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    ),
    true
  );
  assert.equal(isSvgDocument(Buffer.from('FEFF  <svg viewBox="0 0 1 1"/>')), true);
  for (const bin of [fx.tiff, fx.png, fx.gif, fx.avif, fx.vips])
    assert.equal(isSvgDocument(bin), false);
  assert.equal(isSvgDocument(Buffer.from('<html><body>hi</body></html>')), false);
  assert.equal(isSvgDocument(Buffer.from('not markup <svg>')), false);
  assert.equal(isSvgDocument(Buffer.alloc(0)), false);
});

// ---- orientation, alpha, animation, thumbnails -----------------------------

// Expected displayed top-left quadrant + output dimensions for each EXIF
// orientation of the 40x20 quadrant fixture (TL red, TR blue, BL green, BR white).
const ORIENTATION_EXPECTED = {
  1: { tl: 'red', w: 40, h: 20 },
  2: { tl: 'blue', w: 40, h: 20 },
  3: { tl: 'white', w: 40, h: 20 },
  4: { tl: 'green', w: 40, h: 20 },
  5: { tl: 'red', w: 20, h: 40 },
  6: { tl: 'green', w: 20, h: 40 },
  7: { tl: 'white', w: 20, h: 40 },
  8: { tl: 'blue', w: 20, h: 40 },
};

for (const [orientation, expected] of Object.entries(ORIENTATION_EXPECTED)) {
  test(`JPEG EXIF orientation ${orientation}: normalized pixels are upright and the tag is removed`, async () => {
    const input = await quadrantJpeg(Number(orientation));
    assert.equal((await sharp(input).metadata()).orientation, Number(orientation));
    const out = await normalizeOrientation(input);
    const meta = await sharp(out).metadata();
    assert.equal(meta.width, expected.w);
    assert.equal(meta.height, expected.h);
    assert.ok(
      !meta.orientation || meta.orientation === 1,
      'orientation tag must not survive normalization'
    );
    assert.equal(colourName(await pixelAt(out, 3, 3)), expected.tl);
    // The thumbnail is upright too.
    const thumb = await generateThumbnail(input);
    const tmeta = await sharp(thumb).metadata();
    assert.equal(tmeta.width, expected.w);
    assert.equal(tmeta.height, expected.h);
  });
}

test('transparent PNG and WebP keep their alpha channel through orientation normalization', async () => {
  const fx = await formats();
  for (const key of ['png', 'webp']) {
    const out = await normalizeOrientation(fx[key]);
    const meta = await sharp(out).metadata();
    assert.equal(meta.format, key);
    assert.equal(meta.hasAlpha, true, `${key} must keep alpha`);
    const [, , , alpha] = await pixelAt(out, 4, 4);
    assert.ok(alpha > 100 && alpha < 160, `${key} alpha preserved (~128), got ${alpha}`);
  }
});

test('animated GIF: the thumbnail is the first frame only, at single-frame dimensions', async () => {
  const frame = (bg) => solid(10, 10, bg).png().toBuffer();
  const gif = await sharp(
    [await frame('#ff0000'), await frame('#00ff00'), await frame('#0000ff')],
    {
      join: { animated: true },
    }
  )
    .gif()
    .toBuffer();
  assert.equal((await sharp(gif, { pages: -1 }).metadata()).pages, 3);
  await inspectImage(gif, { allowed: PHOTO_TYPES });
  const thumb = await generateThumbnail(gif);
  const meta = await sharp(thumb).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 10);
  assert.equal(meta.height, 10, 'never the stacked 30px strip of all frames');
  assert.equal(colourName(await pixelAt(thumb, 5, 5)), 'red');
});

test('thumbnails are JPEG, bounded to THUMBNAIL_MAX_DIMENSION, aspect preserved, never enlarged', async () => {
  const large = await generateThumbnail(await noise(1600, 800).jpeg().toBuffer());
  const lm = await sharp(large).metadata();
  assert.equal(lm.format, 'jpeg');
  assert.equal(lm.width, THUMBNAIL_MAX_DIMENSION);
  assert.equal(lm.height, THUMBNAIL_MAX_DIMENSION / 2);
  const small = await generateThumbnail(await noise(100, 50).png().toBuffer());
  const sm = await sharp(small).metadata();
  assert.equal(sm.width, 100);
  assert.equal(sm.height, 50);
});

// ---- photo quality + capture time -------------------------------------------

test('photo quality: a detailed large photo is not flagged; a tiny blurred one is flagged for both reasons', async () => {
  const good = await assessPhotoQuality(await noise(1200, 900).jpeg({ quality: 95 }).toBuffer());
  assert.equal(good.qualityWarning, false);
  const bad = await assessPhotoQuality(await noise(200, 150).blur(20).jpeg().toBuffer());
  assert.equal(bad.qualityWarning, true);
  assert.deepEqual(bad.qualityReasons.sort(), ['blurry', 'low_resolution']);
});

test('photo quality fails open (no warning, no throw) for bytes the allow-listed decoders refuse', async () => {
  const { tiff } = await formats();
  const res = await assessPhotoQuality(tiff);
  assert.equal(res.qualityWarning, false);
});

test('capture time: EXIF DateTimeOriginal is used when trustworthy; refused bytes fall back to upload time', async () => {
  const uploadedAt = '2026-09-20T12:00:00.000Z';
  const withExif = await solid(16, 16, '#abcdef')
    .jpeg()
    .withExif({ IFD2: { DateTimeOriginal: '2026:09:19 10:30:00' } })
    .toBuffer();
  const fromExif = await resolveCapturedAt(withExif, uploadedAt);
  assert.equal(fromExif.source, 'exif');
  assert.match(fromExif.value, /^2026-09-19T/);

  const { tiff } = await formats();
  const fallback = await resolveCapturedAt(tiff, uploadedAt);
  assert.deepEqual(fallback, { value: uploadedAt, source: 'upload' });
});

// ---- batch pipeline (real sharp, fake storage) ------------------------------

const fakeUpload = () => {
  const stored = [];
  return {
    stored,
    uploadBufferFn: async (objectPath, buffer, mimetype) =>
      stored.push({ objectPath, buffer, mimetype }),
  };
};

test('photo batch (real sharp): disguised TIFF/VIPS/AVIF and corrupt files fail individually and store nothing', async () => {
  const fx = await formats();
  const good = await noise(64, 48).jpeg().toBuffer();
  const files = [
    { originalname: 'good.jpg', mimetype: 'image/jpeg', size: good.length, buffer: good },
    { originalname: 'tiff.jpg', mimetype: 'image/jpeg', size: fx.tiff.length, buffer: fx.tiff },
    { originalname: 'vips.jpg', mimetype: 'image/jpeg', size: fx.vips.length, buffer: fx.vips },
    {
      originalname: 'avif.heic',
      mimetype: 'image/heic',
      size: 1,
      buffer: withBrand(fx.avif, 'mif1'),
    },
    {
      originalname: 'corrupt.jpg',
      mimetype: 'image/jpeg',
      size: 68,
      buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]),
    },
  ];
  const up = fakeUpload();
  const { records } = await processPhotoBatch('uid-1', 'report-1', files, [], 0, {
    uploadBufferFn: up.uploadBufferFn,
  });
  const byName = Object.fromEntries(records.map((r) => [r.fileName, r]));
  assert.equal(byName['good.jpg'].status, 'uploaded');
  assert.ok(byName['good.jpg'].thumbnailPath);
  for (const name of ['tiff.jpg', 'vips.jpg', 'avif.heic', 'corrupt.jpg']) {
    assert.equal(byName[name].status, 'failed', name);
    assert.ok(byName[name].error, `${name} has a clear error`);
  }
  // Only the good photo's original, display copy and thumbnail were stored.
  assert.equal(up.stored.length, 3);
});

test('concurrency: ~20 safe images process in parallel without crashes or abnormal memory growth', async () => {
  const buffers = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      noise(1600, 1200)
        .jpeg({ quality: 80 + (i % 10) })
        .toBuffer()
    )
  );
  const files = buffers.map((buffer, i) => ({
    originalname: `p${i}.jpg`,
    mimetype: 'image/jpeg',
    size: buffer.length,
    buffer,
  }));
  const up = fakeUpload();
  if (global.gc) global.gc();
  const rssBefore = process.memoryUsage().rss;
  const { records } = await processPhotoBatch('uid-1', 'report-1', files, [], 0, {
    uploadBufferFn: up.uploadBufferFn,
  });
  const rssGrowthMb = (process.memoryUsage().rss - rssBefore) / (1024 * 1024);
  assert.equal(records.length, 20);
  assert.ok(
    records.every((r) => r.status === 'uploaded'),
    'every photo uploaded'
  );
  assert.ok(
    records.every((r) => r.thumbnailPath),
    'every photo thumbnailed'
  );
  // Generous bound: 20 x 1600x1200 decodes should stay far below this; a leak
  // or unbounded parallel decode would blow past it.
  assert.ok(rssGrowthMb < 600, `RSS grew ${rssGrowthMb.toFixed(1)} MB`);
});
