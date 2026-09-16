import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Regression guard for the 2026-09-08 password-change SEQUENCING fix
// (AUTHENTICATION_ARCHITECTURE.md §12.3): confirmed by direct inspection that
// backend/routes/users.js's PUT /users/change-password performs the actual Firebase
// password mutation itself (Admin SDK getAuth().updateUser) and does NOT re-check the
// current password (no `currentPassword` field, no server-side verifyPassword() call) --
// it trusts the already-authenticated session. So Firebase's client-side
// reauthenticateWithCredential() is the ONLY real "prove you know the current password"
// step in this whole flow, and it must complete before the backend performs the single,
// authoritative mutation. The previous version of this flow called BOTH a client-side
// updatePassword() AND the backend endpoint, changing the password twice per user action,
// and swallowed the backend call's failure behind a best-effort .catch() that still showed
// "Password changed successfully" regardless. Both are fixed here: no client-side
// updatePassword() call exists anymore, and the backend call's failure is awaited,
// surfaced as a real error, and returns before any success state is set.
//
// Extended for the 2026-09-08 follow-up (server-side requireRecentAuth
// enforcement, middleware/auth.js): the client now force-refreshes the Firebase
// ID token (getIdToken(true)) right after reauthenticating, so the token's own
// auth_time claim -- which the backend independently checks -- actually reflects
// that reauthentication rather than a possibly-older cached token. A dedicated
// RECENT_LOGIN_REQUIRED branch surfaces that specific rejection without falling
// through to the generic error message. On confirmed success the flow now also
// signs the user out locally and redirects to /login, since the backend's own
// tokenValidAfter bump already invalidates the session's cached ID token from
// the server's point of view.
//
// A source-text check, not a rendered-component test: this project has no jsdom/React
// Testing Library set up (see the other files under src/__tests__/, all pure-function or
// source-level checks) and adding that infrastructure is out of scope for this fix. The
// strongest available integration-level proof of the actual mutation contract lives in
// backend/test/password-change-contract.test.js (real Express app, real route, real
// authenticateToken) -- see that file for "mutates exactly once" / "failure doesn't bump
// revocation fields" coverage this source-level file cannot provide on its own, and
// backend/test/require-recent-auth.test.js for the requireRecentAuth window/skew behavior.

const settingsPath = fileURLToPath(new URL('../pages/Settings.jsx', import.meta.url));
const source = readFileSync(settingsPath, 'utf8');

function extractFunctionBody(src, functionSignature) {
  const start = src.indexOf(functionSignature);
  if (start === -1) throw new Error(`Could not find "${functionSignature}" in Settings.jsx`);
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

/** Finds every `console.<method>(...)` call span in `text` (balanced-paren aware) and
 * returns their full source text, so callers can check what was actually passed to them
 * without false-matching a mention of "console" inside an unrelated string/comment. */
function extractConsoleCalls(text) {
  const calls = [];
  const callStart = /console\.\w+\(/g;
  let match = callStart.exec(text);
  while (match) {
    const openParenIndex = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = openParenIndex; i < text.length; i += 1) {
      if (text[i] === '(') depth += 1;
      if (text[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          calls.push(text.slice(match.index, i + 1));
          break;
        }
      }
    }
    match = callStart.exec(text);
  }
  return calls;
}

describe('Settings.jsx handlePasswordChange — corrected single-mutation sequence', () => {
  const body = extractFunctionBody(source, 'const handlePasswordChange = async (e) => {');

  it('still reauthenticates via Firebase BEFORE calling the backend (recent-login protection preserved)', () => {
    const reauthIndex = body.indexOf('reauthenticateWithCredential(');
    const backendCallIndex = body.indexOf('usersAPI.changePassword(');
    expect(reauthIndex).toBeGreaterThan(-1);
    expect(backendCallIndex).toBeGreaterThan(reauthIndex);
  });

  it('force-refreshes the Firebase ID token AFTER reauthenticating and BEFORE the backend call', () => {
    // Matches only the real call shape (`currentUser.getIdToken(true)`), not this file's
    // or Settings.jsx's own explanatory comments that mention the bare phrase
    // "getIdToken(true)" without the receiver -- same self-match pitfall as the
    // updatePassword() check above.
    const reauthIndex = body.indexOf('await reauthenticateWithCredential(');
    const forceRefreshIndex = body.indexOf('currentUser.getIdToken(true)');
    const backendCallIndex = body.indexOf('await usersAPI.changePassword(');
    expect(reauthIndex).toBeGreaterThan(-1);
    expect(forceRefreshIndex).toBeGreaterThan(reauthIndex);
    expect(backendCallIndex).toBeGreaterThan(forceRefreshIndex);
  });

  it('has NO client-side updatePassword() call anywhere -- the current password is never mutated before the backend runs', () => {
    // Matches only a real call site (`updatePassword(currentUser, ...)`), not this file's
    // own explanatory comments, which mention the bare phrase "updatePassword()" without
    // ever writing the actual call shape.
    expect(body).not.toMatch(/updatePassword\(currentUser/);
    // Belt-and-suspenders: the import itself should also be gone from the file, not just
    // unused in this function.
    expect(source).not.toMatch(/\bupdatePassword\b\s*,/); // no longer destructured from 'firebase/auth'
  });

  it('the password is mutated at exactly one call site client-side: the backend contract call', () => {
    const matches = body.match(/usersAPI\.changePassword\(/g) || [];
    expect(matches.length).toBe(1);
  });

  it('the backend call is awaited, its failure is caught in its own block, surfaces a real error, and returns before any success state', () => {
    const backendCallIndex = body.indexOf('await usersAPI.changePassword(');
    expect(backendCallIndex).toBeGreaterThan(-1);

    // Its own dedicated catch, not the outer Firebase-error catch.
    const dedicatedCatchIndex = body.indexOf('} catch (err) {', backendCallIndex);
    expect(dedicatedCatchIndex).toBeGreaterThan(backendCallIndex);

    const errorToastIndex = body.indexOf('toast.error(', dedicatedCatchIndex);
    expect(errorToastIndex).toBeGreaterThan(dedicatedCatchIndex);

    const returnIndex = body.indexOf('return;', errorToastIndex);
    expect(returnIndex).toBeGreaterThan(errorToastIndex);

    // The success toast (and the state cleanup before it) must be textually AFTER this
    // whole guarded block, i.e. unreachable unless the backend call actually resolved.
    const successToastIndex = body.indexOf('toast.success(');
    expect(successToastIndex).toBeGreaterThan(returnIndex);
  });

  it('surfaces RECENT_LOGIN_REQUIRED with its own dedicated, non-generic message and still returns before success', () => {
    const backendCallIndex = body.indexOf('await usersAPI.changePassword(');
    const dedicatedCatchIndex = body.indexOf('} catch (err) {', backendCallIndex);
    const recentLoginCheckIndex = body.indexOf("'RECENT_LOGIN_REQUIRED'", dedicatedCatchIndex);
    expect(recentLoginCheckIndex).toBeGreaterThan(dedicatedCatchIndex);

    const recentLoginToastIndex = body.indexOf('toast.error(', recentLoginCheckIndex);
    expect(recentLoginToastIndex).toBeGreaterThan(recentLoginCheckIndex);

    const successToastIndex = body.indexOf('toast.success(');
    expect(successToastIndex).toBeGreaterThan(recentLoginToastIndex);
  });

  it('clears local form/MFA state only after the success toast path, not before the backend call', () => {
    const backendCallIndex = body.indexOf('await usersAPI.changePassword(');
    const setPwFormIndex = body.indexOf('setPwForm({ currentPassword:');
    const clearMfaIndex = body.indexOf('clearMfaAssertion()');
    expect(setPwFormIndex).toBeGreaterThan(backendCallIndex);
    expect(clearMfaIndex).toBeGreaterThan(backendCallIndex);
  });

  it('signs the user out and redirects to /login only after the success toast, not on any failure path', () => {
    const backendCallIndex = body.indexOf('await usersAPI.changePassword(');
    const successToastIndex = body.indexOf('toast.success(');
    const logoutIndex = body.indexOf('await logout()');
    const navigateIndex = body.indexOf("navigate('/login')");

    expect(successToastIndex).toBeGreaterThan(backendCallIndex);
    expect(logoutIndex).toBeGreaterThan(successToastIndex);
    expect(navigateIndex).toBeGreaterThan(logoutIndex);

    // Neither the dedicated backend-failure catch nor the outer Firebase-error catch
    // should be able to reach the sign-out/redirect -- both must return/end before it.
    const dedicatedCatchIndex = body.indexOf('} catch (err) {', backendCallIndex);
    const dedicatedCatchEnd = body.indexOf('return;', dedicatedCatchIndex);
    expect(dedicatedCatchEnd).toBeGreaterThan(dedicatedCatchIndex);
    expect(dedicatedCatchEnd).toBeLessThan(logoutIndex);
  });

  it('existing client-side validation guards (strength, match, current!=new) remain intact and unchanged', () => {
    expect(source).toMatch(/if \(!pwForm\.currentPassword\)/);
    expect(source).toMatch(/if \(!pwForm\.newPassword\)/);
    expect(source).toMatch(/validatePassword\(pwForm\.newPassword\)/);
    expect(source).toMatch(/pwForm\.newPassword !== pwForm\.confirmPassword/);
    expect(source).toMatch(/pwForm\.currentPassword === pwForm\.newPassword/);
  });

  it('never logs the current password, new password, or the reauthentication credential', () => {
    const consoleCalls = extractConsoleCalls(body);
    for (const call of consoleCalls) {
      expect(call).not.toMatch(/pwForm\.currentPassword/);
      expect(call).not.toMatch(/pwForm\.newPassword/);
      expect(call).not.toMatch(/\bcredential\b/);
    }
  });
});
