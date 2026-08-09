const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeSignature,
  buildSignatureHeader,
  verifySignature,
  generateSecret,
  maskSecret,
} = require('../services/webhookService');
const { isValidWebhookEvent, WEBHOOK_EVENTS } = require('../config/webhookEvents');

test('signature is deterministic for the same secret, timestamp and body', () => {
  const secret = 'whsec_test';
  const a = computeSignature(secret, 1000, '{"id":"evt_1"}');
  const b = computeSignature(secret, 1000, '{"id":"evt_1"}');
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
});

test('signature changes when body, timestamp, or secret changes', () => {
  const base = computeSignature('s1', 1000, 'body');
  assert.notEqual(base, computeSignature('s1', 1000, 'body2'));
  assert.notEqual(base, computeSignature('s1', 1001, 'body'));
  assert.notEqual(base, computeSignature('s2', 1000, 'body'));
});

test('verifySignature accepts a freshly built header', () => {
  const secret = generateSecret();
  const body = JSON.stringify({ id: 'evt_abc', type: 'report.finalized' });
  const t = 2000;
  const header = buildSignatureHeader(secret, t, body);
  assert.equal(verifySignature(secret, header, body, { now: t }), true);
});

test('verifySignature rejects a tampered body', () => {
  const secret = generateSecret();
  const t = 3000;
  const header = buildSignatureHeader(secret, t, '{"amount":10}');
  assert.equal(verifySignature(secret, header, '{"amount":9999}', { now: t }), false);
});

test('verifySignature rejects a wrong secret', () => {
  const t = 4000;
  const body = 'payload';
  const header = buildSignatureHeader('right-secret', t, body);
  assert.equal(verifySignature('wrong-secret', header, body, { now: t }), false);
});

test('verifySignature rejects a stale timestamp beyond tolerance (replay guard)', () => {
  const secret = generateSecret();
  const signedAt = 5000;
  const header = buildSignatureHeader(secret, signedAt, 'x');
  // 10 minutes later, default tolerance is 5 minutes → reject.
  assert.equal(verifySignature(secret, header, 'x', { now: signedAt + 600 }), false);
  // within tolerance → accept.
  assert.equal(verifySignature(secret, header, 'x', { now: signedAt + 60 }), true);
});

test('verifySignature rejects malformed headers', () => {
  assert.equal(verifySignature('s', undefined, 'b'), false);
  assert.equal(verifySignature('s', 'garbage', 'b'), false);
  assert.equal(verifySignature('s', 't=abc,v1=', 'b'), false);
});

test('generated secrets are unique and prefixed', () => {
  const a = generateSecret();
  const b = generateSecret();
  assert.match(a, /^whsec_[a-f0-9]{48}$/);
  assert.notEqual(a, b);
});

test('maskSecret never reveals the full secret', () => {
  const secret = generateSecret();
  const masked = maskSecret(secret);
  assert.notEqual(masked, secret);
  assert.ok(masked.length < secret.length);
  assert.ok(masked.startsWith('whsec_'));
});

test('only catalogued events are valid', () => {
  assert.equal(isValidWebhookEvent('report.finalized'), true);
  assert.equal(isValidWebhookEvent('report.generated'), true);
  assert.equal(isValidWebhookEvent('report.invented'), false);
  assert.ok(WEBHOOK_EVENTS.length >= 2);
});
