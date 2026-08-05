const test = require('node:test');
const assert = require('node:assert/strict');
const {
  API_KEY_SCOPES,
  LEGACY_API_KEY_SCOPES,
  normalizeApiKeyScopes,
} = require('../config/apiScopes');
const { requireApiScope } = require('../middleware/auth');

const runScopeCheck = (scope, apiKey) => {
  let statusCode = 200;
  let payload;
  let nextCalled = false;
  const req = { apiKey };
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) { payload = body; return this; },
  };
  requireApiScope(scope)(req, res, () => { nextCalled = true; });
  return { statusCode, payload, nextCalled };
};

test('scope normalization rejects unknown values and removes duplicates', () => {
  assert.deepEqual(normalizeApiKeyScopes(['reports:read', 'invalid', 'reports:read']), ['reports:read']);
  assert.ok(API_KEY_SCOPES.includes('crm:write'));
});

test('legacy unscoped keys preserve prior report access but do not gain CRM access', () => {
  assert.deepEqual(normalizeApiKeyScopes(undefined, { legacy: true }), [...LEGACY_API_KEY_SCOPES]);
  assert.equal(LEGACY_API_KEY_SCOPES.includes('crm:read'), false);
});

test('bearer sessions bypass API-key scope checks', () => {
  assert.equal(runScopeCheck('reports:write', undefined).nextCalled, true);
});

test('API keys receive a structured 403 when permission is missing', () => {
  const result = runScopeCheck('reports:export', { scopes: ['reports:read'] });
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.equal(result.payload.code, 'API_SCOPE_REQUIRED');
  assert.equal(result.payload.requiredScope, 'reports:export');
});

test('API keys pass when the exact endpoint permission is granted', () => {
  assert.equal(runScopeCheck('crm:write', { scopes: ['crm:write'] }).nextCalled, true);
});
