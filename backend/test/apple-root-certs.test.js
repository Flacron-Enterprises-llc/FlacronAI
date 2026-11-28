const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// App Store JWS verification needs Apple's root certificates. They ship in the image (backend/certs/apple) and are
// used when APPLE_ROOT_CA_CERT_PATHS is not set; the env var still overrides them.
const G3_SHA256 = '63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179';

test('bundled Apple root certificates load when APPLE_ROOT_CA_CERT_PATHS is unset', () => {
  delete process.env.APPLE_ROOT_CA_CERT_PATHS;
  const { loadAppleRootCerts } = require('../config/storeBilling');
  const certs = loadAppleRootCerts();
  assert.equal(certs.length, 2);
  const fps = certs.map((der) => new crypto.X509Certificate(der).fingerprint256.replace(/:/g, ''));
  assert.ok(fps.includes(G3_SHA256), 'Apple Root CA - G3 is bundled');
});

test('APPLE_ROOT_CA_CERT_PATHS overrides the bundled certificates; a missing file yields none', () => {
  process.env.APPLE_ROOT_CA_CERT_PATHS = '/nonexistent/AppleRootCA-G3.cer';
  const { loadAppleRootCerts } = require('../config/storeBilling');
  assert.deepEqual(loadAppleRootCerts(), []);
  delete process.env.APPLE_ROOT_CA_CERT_PATHS;
});
