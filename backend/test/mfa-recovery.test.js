const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('../routes/auth');

const { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode, verifySecondFactor } = router._mfaRecovery;

test('recovery codes are unique, readable, and stored only as hashes', () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  for (const code of codes) {
    assert.match(code, /^[A-F0-9]{8}-[A-F0-9]{8}$/);
    assert.match(hashRecoveryCode(code), /^[a-f0-9]{64}$/);
    assert.notEqual(hashRecoveryCode(code), code);
  }
  assert.equal(normalizeRecoveryCode(codes[0].toLowerCase()), codes[0].replace('-', ''));
});

test('a recovery code is consumed atomically and cannot be reused', async () => {
  const code = generateRecoveryCodes()[0];
  let hashes = [hashRecoveryCode(code)];
  const userRef = { id: 'user-1' };
  const db = {
    runTransaction: async callback => callback({
      get: async () => ({ data: () => ({ mfaRecoveryCodeHashes: hashes }) }),
      update: (_ref, update) => { hashes = update.mfaRecoveryCodeHashes; },
    }),
  };

  const first = await verifySecondFactor({ db, userRef, userData: { mfaSecret: 'unused' }, code });
  const second = await verifySecondFactor({ db, userRef, userData: { mfaSecret: 'unused' }, code });

  assert.deepEqual(first, { verified: true, method: 'recovery_code' });
  assert.deepEqual(second, { verified: false });
  assert.deepEqual(hashes, []);
});
