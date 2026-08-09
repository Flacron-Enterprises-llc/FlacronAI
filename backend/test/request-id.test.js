const test = require('node:test');
const assert = require('node:assert/strict');
const { requestIdMiddleware } = require('../middleware/requestId');

test('middleware generates a request ID when none is supplied', () => {
  const req = { headers: {} };
  const res = { setHeader: (k, v) => { res._headers = res._headers || {}; res._headers[k] = v; } };
  requestIdMiddleware(req, res, () => {});
  assert.ok(typeof req.requestId === 'string');
  assert.ok(req.requestId.startsWith('req_'));
  assert.equal(res._headers['X-Request-Id'], req.requestId);
});

test('middleware accepts a safe client-supplied ID', () => {
  const supplied = 'client-trace-abc123';
  const req = { headers: { 'x-request-id': supplied } };
  const res = { setHeader: () => {} };
  requestIdMiddleware(req, res, () => {});
  assert.equal(req.requestId, supplied);
});

test('middleware rejects an unsafe client ID (injection guard)', () => {
  const malicious = 'trace\n[INJECTED LOG] admin=true';
  const req = { headers: { 'x-request-id': malicious } };
  const res = { setHeader: () => {} };
  requestIdMiddleware(req, res, () => {});
  // Should generate a new ID instead of using the malicious one
  assert.notEqual(req.requestId, malicious);
  assert.ok(req.requestId.startsWith('req_'));
});

test('middleware rejects an overly long client ID', () => {
  const tooLong = 'x'.repeat(100);
  const req = { headers: { 'x-request-id': tooLong } };
  const res = { setHeader: () => {} };
  requestIdMiddleware(req, res, () => {});
  assert.notEqual(req.requestId, tooLong);
  assert.ok(req.requestId.startsWith('req_'));
});
