// Phase 16 (Integrations Page & Webhook Management UI) hardening. Extracted
// from `backend/routes/webhooks.js`'s original inline `isSafeWebhookUrl` --
// that version had 3 real gaps, confirmed by direct execution before this fix:
//   1. It only blocked the single literal string '127.0.0.1', not the other
//      ~16.7 million addresses in the 127.0.0.0/8 loopback range (e.g.
//      https://127.0.0.2/x passed clean).
//   2. Its IPv6 loopback check compared against the bare string '::1', but
//      `new URL('https://[::1]/x').hostname` returns '[::1]' WITH the
//      brackets -- the comparison could never match, and no IPv6 private/
//      unique-local range (fd00::/8) was covered at all.
//   3. No DNS-rebinding protection: a wildcard-DNS hostname (e.g. a
//      nip.io/sslip.io-style name that resolves straight to 127.0.0.1) isn't
//      a blocked literal string, so it sailed through the old check even
//      though it resolves to loopback -- the classic SSRF-via-DNS-rebinding
//      bypass of a hostname-string-only blocklist.
// This version keeps the same fail-fast literal checks but ALSO resolves the
// hostname (or parses it directly if it's already an IP literal) and rejects
// if ANY resolved address is private/loopback/link-local/reserved. Fails
// closed: a DNS lookup error is treated as unsafe, not allowed through.
const dns = require('dns');
const net = require('net');

const isPrivateOrReservedIPv4 = (ip) => {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b, c] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback (the full range, not just 127.0.0.1)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 shared/CGNAT
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && b === 18) return true; // 198.18.0.0/15 benchmarking
  if (a >= 224) return true; // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved, 255.255.255.255 broadcast
  return false;
};

// An IPv4-mapped IPv6 address's last 32 bits are two hex groups (e.g.
// "7f00:1"), NOT the dotted-decimal form -- Node's URL parser canonicalizes
// "::ffff:127.0.0.1" straight to "::ffff:7f00:1" before this code ever sees
// it (confirmed directly: `new URL('https://[::ffff:127.0.0.1]/x').hostname`
// is "[::ffff:7f00:1]"), so a check that only looked for the dotted textual
// form would silently never match. Handles both forms defensively anyway,
// since a DNS lookup result could in principle come back either way.
const ipv4FromMappedHexGroups = (hexPart) => {
  const groups = hexPart.split(':');
  if (groups.length !== 2) return null;
  const [g1, g2] = groups.map((g) => parseInt(g || '0', 16));
  if (!Number.isInteger(g1) || !Number.isInteger(g2)) return null;
  return [(g1 >> 8) & 0xff, g1 & 0xff, (g2 >> 8) & 0xff, g2 & 0xff].join('.');
};

const isPrivateOrReservedIPv6 = (ip) => {
  const norm = ip.toLowerCase();
  if (norm === '::1' || norm === '::') return true; // loopback / unspecified
  if (/^fe[89ab][0-9a-f]:/.test(norm)) return true; // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(norm)) return true; // fc00::/7 unique local
  if (norm.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 -- unwrap and re-check the embedded IPv4 address,
    // whichever textual form it's written in.
    const rest = norm.slice('::ffff:'.length);
    if (net.isIPv4(rest)) return isPrivateOrReservedIPv4(rest);
    const v4 = ipv4FromMappedHexGroups(rest);
    if (v4) return isPrivateOrReservedIPv4(v4);
  }
  return false;
};

const isPrivateOrReservedIP = (ip) => {
  if (net.isIPv4(ip)) return isPrivateOrReservedIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateOrReservedIPv6(ip);
  return true; // not a recognizable IP -- treat as unsafe rather than guess
};

const BLOCKED_HOSTNAME_LITERALS = new Set(['localhost', 'metadata.google.internal']);

// Strips the [] wrapper Node's URL parser puts around a bracketed IPv6 host
// (e.g. "[::1]" -> "::1") so it can be compared/parsed as a plain address.
const unwrapIPv6Host = (host) => (host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host);

// `lookup` is dependency-injectable (matching this codebase's existing DI
// test pattern, e.g. aiService.js's `callVisionApi` param) so tests can run
// fully offline/deterministically instead of depending on real DNS. When
// called by express-validator's `.custom()`, the second argument is its own
// `meta` object ({req, location, path}) -- destructuring a `lookup` property
// off of that safely yields `undefined` and falls back to the real
// `dns.promises.lookup`, so no route-side wiring is needed for this to work
// in both production and tests.
const isSafeWebhookUrl = async (value, { lookup = dns.promises.lookup } = {}) => {
  let u;
  try { u = new URL(value); } catch { return false; }
  if (u.protocol !== 'https:') return false;

  const rawHost = u.hostname.toLowerCase();
  const host = unwrapIPv6Host(rawHost);
  if (BLOCKED_HOSTNAME_LITERALS.has(host)) return false;

  // A literal IP address in the URL itself -- check it directly, no DNS needed.
  if (net.isIP(host)) return !isPrivateOrReservedIP(host);

  // Otherwise resolve the hostname and check every address it actually
  // points to right now (closes the DNS-rebinding bypass a string-only
  // hostname blocklist can never catch).
  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (!records.length) return false;
    return records.every((r) => !isPrivateOrReservedIP(r.address));
  } catch {
    return false; // DNS failure -- fail closed
  }
};

// express-validator's async `.custom()` determines pass/fail by whether the
// returned promise REJECTS, not by the resolved value -- confirmed directly:
// a custom validator that resolves to `false` is (surprisingly) treated as
// VALID, identically to resolving `true`. Only a thrown/rejected promise
// registers as a validation failure. This is the actual wiring bug this fix
// had to close on top of the 3 SSRF gaps above -- a first pass that returned
// booleans from an async function let every URL through, including the
// still-unsafe ones, which live browser testing against the real endpoint
// caught immediately. `isSafeWebhookUrl` itself stays a plain boolean
// predicate so it's simple to unit-test directly; this adapter is what the
// route actually wires into `.custom()`.
const assertSafeWebhookUrl = async (value, meta) => {
  if (!(await isSafeWebhookUrl(value, meta))) {
    throw new Error('url must be a public HTTPS URL that does not resolve to a private, loopback, or link-local address');
  }
  return true;
};

module.exports = {
  isSafeWebhookUrl,
  assertSafeWebhookUrl,
  isPrivateOrReservedIP,
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
};
