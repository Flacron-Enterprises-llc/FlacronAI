const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Real HEVC-encoded HEIC files from the official libheif project, used to
// check that genuine HEIC passes the structural check and upload pipeline.
//
// The files are NOT committed to this repository (their licence is the
// libheif repository's, not ours). They are downloaded at a pinned commit and
// verified against the SHA-256 values below -- see HEIC_FIXTURES in
// .github/workflows/backend-pr-validation.yml. Set HEIC_FIXTURE_DIR to a
// directory containing them to run these tests; otherwise they are skipped.
//
// Source: https://github.com/strukturag/libheif at commit
// 5c7b41f3cc097447dd3c700cc9ec7d94fbb59eec
//   tests/data/rainbow-451x461.heic     (libheif repository, LGPL-3.0)
//   tests/data/with-alpha-512x512.heic  (libheif repository, LGPL-3.0)
//   examples/example.heic               (libheif examples/, MIT)
//
// None of these is a tiled/grid HEIC or an iPhone-generated file; both remain
// manual staging checks.
const {
  inspectImage,
  isHevcHeif,
  isAllowedStoredImage,
  PHOTO_TYPES,
} = require('../utils/safeImage');
const { sniffImageType } = require('../utils/imageValidation');
const { processPhotoBatch } = require('../utils/photoBatchProcessor');

const FIXTURES = [
  {
    file: 'rainbow-451x461.heic',
    sha256: '4b2ce727f093944975f143ba2b39c4c64511b766d94552f8d51a755916e7f983',
    width: 451,
    height: 461,
  },
  {
    file: 'with-alpha-512x512.heic',
    sha256: 'dac399d3bf1019baaf5f88eef8b277087d0643e735db947c42355237bb9d0221',
    width: 512,
    height: 512,
  },
  {
    file: 'example.heic',
    sha256: '7f8b363e4936c0666a25f64f3a92fda10bd8e5453be4592530b65a55dd98f3f2',
    width: 1280,
    height: 854,
  },
];

const dir = process.env.HEIC_FIXTURE_DIR;
const skip = dir ? false : 'HEIC_FIXTURE_DIR not set (upstream libheif fixtures not downloaded)';

const load = (file) => fs.readFileSync(path.join(dir, file));

for (const fx of FIXTURES) {
  test(
    `upstream HEIC ${fx.file}: pinned checksum, structurally HEVC, accepted with correct dimensions`,
    { skip },
    async () => {
      const buf = load(fx.file);
      assert.equal(
        crypto.createHash('sha256').update(buf).digest('hex'),
        fx.sha256,
        'fixture checksum'
      );
      assert.equal(sniffImageType(buf), 'heic');
      assert.equal(isHevcHeif(buf), true);
      assert.equal(isAllowedStoredImage(buf), true, 'export-time gate admits real HEIC');
      const { type, meta } = await inspectImage(buf, { allowed: PHOTO_TYPES });
      assert.equal(type, 'heic');
      assert.ok(meta, 'header is readable');
      assert.equal(meta.width, fx.width);
      assert.equal(meta.height, fx.height);
    }
  );

  test(
    `upstream HEIC ${fx.file}: the upload pipeline stores it; a missing thumbnail never fails the photo`,
    { skip },
    async () => {
      const buf = load(fx.file);
      const stored = [];
      const { records } = await processPhotoBatch(
        'uid-1',
        'report-1',
        [{ originalname: fx.file, mimetype: 'image/heic', size: buf.length, buffer: buf }],
        [],
        0,
        { uploadBufferFn: async (objectPath) => stored.push(objectPath) }
      );
      assert.equal(records[0].status, 'uploaded', records[0].error || '');
      assert.ok(records[0].originalPath && records[0].objectPath);
      // The prebuilt libvips has no HEVC decoder, so no thumbnail is expected
      // (pre-existing behaviour); if a future build adds one, a thumbnail is fine too.
      assert.ok(stored.length >= 2);
    }
  );
}

test(
  'upstream HEIC: inserting an AV1 marker into a real HEIC meta box makes it rejected',
  { skip },
  async () => {
    const buf = Buffer.from(load('rainbow-451x461.heic'));
    const at = buf.indexOf('hvcC', 0, 'latin1');
    assert.ok(at > 0);
    buf.write('av1C', at, 'latin1');
    assert.equal(isHevcHeif(buf), false);
    await assert.rejects(inspectImage(buf, { allowed: PHOTO_TYPES }), {
      code: 'UNSUPPORTED_IMAGE_TYPE',
    });
  }
);
