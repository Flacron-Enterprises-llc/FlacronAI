const API_KEY_SCOPES = Object.freeze([
  'reports:read',
  'reports:write',
  'reports:generate',
  'reports:export',
  'crm:read',
  'crm:write',
]);

// Keys created before scopes existed retain only the report access they
// previously had. CRM access must always be granted explicitly.
const LEGACY_API_KEY_SCOPES = Object.freeze([
  'reports:read',
  'reports:write',
  'reports:generate',
  'reports:export',
]);

const normalizeApiKeyScopes = (scopes, { legacy = false } = {}) => {
  if (scopes === undefined && legacy) return [...LEGACY_API_KEY_SCOPES];
  if (!Array.isArray(scopes)) return [];
  return [...new Set(scopes.filter(scope => API_KEY_SCOPES.includes(scope)))];
};

module.exports = { API_KEY_SCOPES, LEGACY_API_KEY_SCOPES, normalizeApiKeyScopes };
