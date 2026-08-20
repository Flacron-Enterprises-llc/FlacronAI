const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { resolveCapturedAt, isTrustworthy } = require('../utils/photoCaptureTime');

// A minimal, valid EXIF APP1 segment can't be hand-built easily in a unit
// test without a real camera-captured fixture file, so these tests exercise
// `resolveCapturedAt` against buffers with NO exif (the realistic case for
// most non-photo test fixtures and for genuinely exif-less uploads) plus
// `isTrustworthy` directly (unit-testable without needing real EXIF bytes)
// for the trustworthiness rules themselves.

test('a plain PNG with no EXIF falls back to the upload timestamp', async () => {
  const buffer = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .png()
    .toBuffer();
  const result = await resolveCapturedAt(buffer, '2026-08-19T12:00:00.000Z');
  assert.deepEqual(result, { value: '2026-08-19T12:00:00.000Z', source: 'upload' });
});

test('an undecodable buffer falls back to the upload timestamp without throwing', async () => {
  const result = await resolveCapturedAt(Buffer.from('garbage'), '2026-08-19T12:00:00.000Z');
  assert.deepEqual(result, { value: '2026-08-19T12:00:00.000Z', source: 'upload' });
});

test('falls back to "now" when no upload timestamp is provided at all', async () => {
  const before = Date.now();
  const result = await resolveCapturedAt(Buffer.from('garbage'), undefined);
  const after = Date.now();
  assert.equal(result.source, 'upload');
  const ms = new Date(result.value).getTime();
  assert.ok(ms >= before && ms <= after);
});

test('isTrustworthy: a normal recent capture time is trustworthy', () => {
  const uploadedAt = new Date('2026-08-19T12:00:00.000Z');
  const captured = new Date('2026-08-19T11:55:00.000Z');
  assert.equal(isTrustworthy(captured, uploadedAt), true);
});

test('isTrustworthy: an invalid Date is never trustworthy', () => {
  assert.equal(isTrustworthy(new Date('not a date'), new Date()), false);
});

test('isTrustworthy: a camera-clock-reset default (1970-01-01) is untrustworthy', () => {
  const uploadedAt = new Date('2026-08-19T12:00:00.000Z');
  assert.equal(isTrustworthy(new Date('1970-01-01T00:00:00.000Z'), uploadedAt), false);
});

test('isTrustworthy: another common default (2000-01-01) is untrustworthy', () => {
  const uploadedAt = new Date('2026-08-19T12:00:00.000Z');
  assert.equal(isTrustworthy(new Date('2000-01-01T00:00:00.000Z'), uploadedAt), false);
});

test('isTrustworthy: a date before 1995 is untrustworthy', () => {
  const uploadedAt = new Date('2026-08-19T12:00:00.000Z');
  assert.equal(isTrustworthy(new Date('1990-06-15T00:00:00.000Z'), uploadedAt), false);
});

test('isTrustworthy: a capture time more than a day after the upload time is untrustworthy', () => {
  const uploadedAt = new Date('2026-08-19T12:00:00.000Z');
  const captured = new Date('2026-08-25T12:00:00.000Z');
  assert.equal(isTrustworthy(captured, uploadedAt), false);
});

test('isTrustworthy: a capture time within the small future-drift grace window is still trustworthy', () => {
  const uploadedAt = new Date('2026-08-19T12:00:00.000Z');
  const captured = new Date('2026-08-19T18:00:00.000Z'); // 6h ahead, within 24h grace
  assert.equal(isTrustworthy(captured, uploadedAt), true);
});
