const test = require('node:test');
const assert = require('node:assert/strict');
const { CORS_ALLOWED_HEADERS, CORS_ALLOWED_METHODS } = require('../config/corsOptions');

// Without 'X-MFA-Token' in the CORS allowedHeaders list, a browser's preflight (OPTIONS)
// request for ANY cross-origin call carrying that header is rejected before it ever
// reaches the server -- independent of whether server-side MFA enforcement is even
// enabled. This is required the moment a client starts attaching the header at all (see
// api.js's request interceptor), not just once enforcement is turned on.

test('X-MFA-Token is allowed by CORS preflight', () => {
  assert.ok(CORS_ALLOWED_HEADERS.includes('X-MFA-Token'));
});

test('pre-existing allowed headers are still present (no accidental removal)', () => {
  assert.ok(CORS_ALLOWED_HEADERS.includes('Content-Type'));
  assert.ok(CORS_ALLOWED_HEADERS.includes('Authorization'));
  assert.ok(CORS_ALLOWED_HEADERS.includes('X-API-Key'));
});

test('allowed methods are unchanged', () => {
  assert.deepEqual(CORS_ALLOWED_METHODS, ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']);
});
