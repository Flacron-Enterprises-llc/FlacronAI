import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Regression guard for the 2026-09-08 rollout-safety correction: web's ordinary Sign Out
// must never silently call the backend's all-sessions-adjacent /auth/logout endpoint (see
// that route's own header comment in backend/routes/auth.js, and
// AUTHENTICATION_ARCHITECTURE.md §12, for the full reasoning). A source-text check, not a
// rendered-component test: this project has no jsdom/React Testing Library set up (see the
// other files under src/__tests__/, all pure-function tests) and adding that infrastructure
// is out of scope for this fix. This still catches the specific regression that matters --
// a future edit re-adding `authAPI.logout()` inside `logout()`.

const authContextPath = fileURLToPath(new URL('../context/AuthContext.jsx', import.meta.url));
const source = readFileSync(authContextPath, 'utf8');

function extractFunctionBody(src, functionSignature) {
  const start = src.indexOf(functionSignature);
  if (start === -1) throw new Error(`Could not find "${functionSignature}" in AuthContext.jsx`);
  const bodyStart = src.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(bodyStart, i + 1);
    }
  }
  throw new Error('Unbalanced braces while extracting function body');
}

describe('AuthContext.jsx logout() scope (web)', () => {
  it('ordinary Sign Out does not call the backend /auth/logout endpoint', () => {
    const logoutBody = extractFunctionBody(source, 'const logout = async () => {');
    expect(logoutBody).not.toMatch(/authAPI\.logout\(/);
  });

  it('ordinary Sign Out still clears local Firebase session and MFA state', () => {
    const logoutBody = extractFunctionBody(source, 'const logout = async () => {');
    expect(logoutBody).toMatch(/signOut\(auth\)/);
    expect(logoutBody).toMatch(/setMfaVerified\(false\)/);
    expect(logoutBody).toMatch(/clearMfaAssertion\(\)/);
  });
});
