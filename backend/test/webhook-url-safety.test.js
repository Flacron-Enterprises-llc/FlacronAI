const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isSafeWebhookUrl,
  assertSafeWebhookUrl,
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
} = require('../utils/webhookUrlSafety');

// A fake `dns.promises.lookup` so these tests never touch the real network --
// deterministic and offline, matching this codebase's existing DI test style.
const fakeLookup = (hostToAddress) => async (host) => {
  const address = hostToAddress[host];
  if (!address) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
  const records = (Array.isArray(address) ? address : [address]).map((a) => ({
    address: a,
    family: a.includes(':') ? 6 : 4,
  }));
  return records;
};

test('rejects non-HTTPS and malformed URLs', async () => {
  assert.equal(await isSafeWebhookUrl('http://example.com/x'), false);
  assert.equal(await isSafeWebhookUrl('not a url'), false);
  assert.equal(await isSafeWebhookUrl(''), false);
  assert.equal(await isSafeWebhookUrl('ftp://example.com/x'), false);
});

test('rejects literal blocked hostnames without needing DNS', async () => {
  assert.equal(await isSafeWebhookUrl('https://localhost/x'), false);
  assert.equal(await isSafeWebhookUrl('https://metadata.google.internal/x'), false);
});

test('rejects the FULL 127.0.0.0/8 loopback range as a literal IP, not just 127.0.0.1', async () => {
  assert.equal(await isSafeWebhookUrl('https://127.0.0.1/x'), false);
  assert.equal(await isSafeWebhookUrl('https://127.0.0.2/x'), false);
  assert.equal(await isSafeWebhookUrl('https://127.255.255.255/x'), false);
});

test('rejects other private/reserved IPv4 ranges as literal IPs', async () => {
  assert.equal(await isSafeWebhookUrl('https://10.0.0.5/x'), false);
  assert.equal(await isSafeWebhookUrl('https://172.16.0.1/x'), false);
  assert.equal(await isSafeWebhookUrl('https://172.31.255.255/x'), false);
  assert.equal(await isSafeWebhookUrl('https://192.168.1.1/x'), false);
  assert.equal(await isSafeWebhookUrl('https://169.254.169.254/x'), false); // cloud metadata range
  assert.equal(await isSafeWebhookUrl('https://0.0.0.1/x'), false);
  assert.equal(await isSafeWebhookUrl('https://224.0.0.1/x'), false); // multicast
  assert.equal(await isSafeWebhookUrl('https://255.255.255.255/x'), false); // broadcast
  assert.equal(await isSafeWebhookUrl('https://100.64.0.1/x'), false); // CGNAT
});

test('accepts a normal public IPv4 literal', async () => {
  assert.equal(await isSafeWebhookUrl('https://93.184.216.34/x'), true);
});

test('rejects a bracketed IPv6 loopback literal ("[::1]") -- the original inline check never matched this', async () => {
  assert.equal(await isSafeWebhookUrl('https://[::1]/x'), false);
  assert.equal(await isSafeWebhookUrl('https://[::]/x'), false);
});

test('rejects IPv6 link-local and unique-local (private) ranges', async () => {
  assert.equal(await isSafeWebhookUrl('https://[fe80::1]/x'), false);
  assert.equal(await isSafeWebhookUrl('https://[fd00::1]/x'), false);
  assert.equal(await isSafeWebhookUrl('https://[fc00::1]/x'), false);
});

test('rejects an IPv4-mapped IPv6 literal pointing at a private address', async () => {
  assert.equal(await isSafeWebhookUrl('https://[::ffff:127.0.0.1]/x'), false);
});

test('accepts a normal public IPv6 literal', async () => {
  assert.equal(await isSafeWebhookUrl('https://[2606:2800:220:1:248:1893:25c8:1946]/x'), true);
});

test('DNS-rebinding protection: rejects a hostname that resolves to a loopback/private address (the wildcard-DNS bypass)', async () => {
  const lookup = fakeLookup({ 'attacker-controlled.example': '127.0.0.1' });
  assert.equal(await isSafeWebhookUrl('https://attacker-controlled.example/x', { lookup }), false);
});

test('DNS-rebinding protection: rejects if ANY resolved address (out of several) is private', async () => {
  const lookup = fakeLookup({ 'multi.example': ['93.184.216.34', '10.0.0.1'] });
  assert.equal(await isSafeWebhookUrl('https://multi.example/x', { lookup }), false);
});

test('accepts a hostname that resolves only to genuine public addresses', async () => {
  const lookup = fakeLookup({ 'real-customer-endpoint.example': ['93.184.216.34'] });
  assert.equal(await isSafeWebhookUrl('https://real-customer-endpoint.example/x', { lookup }), true);
});

test('fails closed when DNS resolution errors (e.g. NXDOMAIN)', async () => {
  const lookup = fakeLookup({});
  assert.equal(await isSafeWebhookUrl('https://this-domain-does-not-exist.example/x', { lookup }), false);
});

test('fails closed when DNS resolves to zero addresses', async () => {
  const lookup = async () => [];
  assert.equal(await isSafeWebhookUrl('https://empty-result.example/x', { lookup }), false);
});

test('isPrivateOrReservedIPv4 treats a malformed address as unsafe rather than guessing', () => {
  assert.equal(isPrivateOrReservedIPv4('not.an.ip.address'), true);
  assert.equal(isPrivateOrReservedIPv4('999.999.999.999'), true);
});

test('isPrivateOrReservedIPv6 recognizes the unique-local fc00::/7 block across both halves (fc and fd)', () => {
  assert.equal(isPrivateOrReservedIPv6('fc00::1'), true);
  assert.equal(isPrivateOrReservedIPv6('fd12:3456::1'), true);
  assert.equal(isPrivateOrReservedIPv6('2001:db8::1'), false); // documentation range, not actually reserved-private here
});

test('assertSafeWebhookUrl rejects (rejects the promise) for an unsafe URL and resolves for a safe one', async () => {
  await assert.rejects(() => assertSafeWebhookUrl('https://127.0.0.1/x'));
  await assert.doesNotReject(() => assertSafeWebhookUrl('https://93.184.216.34/x'));
});

// Locks in a real, previously-shipping wiring bug: express-validator's async
// `.custom()` determines pass/fail by whether the returned promise REJECTS,
// not by its resolved value. A first version of this fix wired the plain
// boolean-returning `isSafeWebhookUrl` directly into `.custom()`; every URL
// -- including http://, literal 127.0.0.1, and "not-a-url" -- was accepted,
// confirmed by a real POST to the running dev server before this test
// existed. This exercises the EXACT express-validator chain shape
// `backend/routes/webhooks.js` uses, end-to-end, against a real (ephemeral,
// throwaway) HTTP server, so a future refactor can't silently reintroduce it.
test('the exact express-validator wiring used in webhooks.js actually rejects an unsafe URL and accepts a safe one', async () => {
  const express = require(require.resolve('express'));
  const { body, validationResult } = require(require.resolve('express-validator'));
  const app = express();
  app.use(express.json());
  app.post('/test-webhook-url', [
    body('url').isString().custom(assertSafeWebhookUrl).withMessage('unsafe url'),
  ], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok: false });
    return res.status(200).json({ ok: true });
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  try {
    const post = (url) => fetch(`http://127.0.0.1:${port}/test-webhook-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const unsafe = await post('https://127.0.0.1/x');
    assert.equal(unsafe.status, 400);
    assert.equal((await unsafe.json()).ok, false);

    const alsoUnsafe = await post('http://example.com/not-https');
    assert.equal(alsoUnsafe.status, 400);

    const safe = await post('https://93.184.216.34/x');
    assert.equal(safe.status, 200);
    assert.equal((await safe.json()).ok, true);
  } finally {
    server.close();
  }
});
