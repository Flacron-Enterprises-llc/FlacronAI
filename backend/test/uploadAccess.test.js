const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { resolvePublicUpload } = require('../middleware/uploadAccess');

const ROOT = path.join('C:', 'app', 'uploads'); // arbitrary absolute root for tests

test('serves user + white-label logos (public branding)', () => {
  assert.ok(resolvePublicUpload(ROOT, '/uid123/logos/logo.png'));
  assert.ok(resolvePublicUpload(ROOT, '/uid123/whitelabel/brand.svg'));
});

test('blocks claim/report photos', () => {
  assert.equal(resolvePublicUpload(ROOT, '/uid123/reports/rep1/photo.jpg'), null);
});

test('blocks generated exports', () => {
  assert.equal(resolvePublicUpload(ROOT, '/uid123/exports/report.pdf'), null);
});

test('blocks traversal that smuggles a sensitive file past a branding segment', () => {
  assert.equal(resolvePublicUpload(ROOT, '/uid123/logos/../reports/rep1/photo.jpg'), null);
  assert.equal(resolvePublicUpload(ROOT, '/uid123/logos/%2e%2e/reports/rep1/photo.jpg'), null);
});

test('blocks paths that escape the uploads root', () => {
  assert.equal(resolvePublicUpload(ROOT, '/../config/storage.js'), null);
  assert.equal(resolvePublicUpload(ROOT, '/uid123/logos/../../../secret.env'), null);
});

test('blocks malformed percent-encoding instead of throwing', () => {
  assert.equal(resolvePublicUpload(ROOT, '/uid123/logos/%ZZ.png'), null);
});

test('blocks the uploads root itself and non-branding top-level files', () => {
  assert.equal(resolvePublicUpload(ROOT, '/'), null);
  assert.equal(resolvePublicUpload(ROOT, '/random.txt'), null);
});
