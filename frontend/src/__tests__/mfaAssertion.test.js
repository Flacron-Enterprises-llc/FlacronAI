import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getMfaAssertion,
  setMfaAssertion,
  clearMfaAssertion,
  notifyMfaRequired,
  MFA_REQUIRED_EVENT,
} from '../services/mfaAssertion.js';

// Deliberately imports the module in isolation (no ../services/api.js, which pulls in
// firebase/app initialization) -- see that module's own header comment for why the split
// exists. A simple in-memory Storage stand-in since vitest's default 'node' environment
// has no real sessionStorage.
function makeMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

describe('mfaAssertion storage (session-scoped, not localStorage)', () => {
  beforeEach(() => {
    globalThis.sessionStorage = makeMemoryStorage();
  });

  it('returns null when nothing has been stored yet', () => {
    expect(getMfaAssertion()).toBeNull();
  });

  it('round-trips a stored assertion', () => {
    setMfaAssertion('assertion-token-abc');
    expect(getMfaAssertion()).toBe('assertion-token-abc');
  });

  it('clearMfaAssertion removes it', () => {
    setMfaAssertion('assertion-token-abc');
    clearMfaAssertion();
    expect(getMfaAssertion()).toBeNull();
  });

  it('setMfaAssertion ignores an empty/undefined token rather than storing a falsy value', () => {
    setMfaAssertion('');
    expect(getMfaAssertion()).toBeNull();
    setMfaAssertion(undefined);
    expect(getMfaAssertion()).toBeNull();
  });

  it('never throws when sessionStorage access itself throws (private-mode/quota failure)', () => {
    globalThis.sessionStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(() => setMfaAssertion('x')).not.toThrow();
    expect(() => getMfaAssertion()).not.toThrow();
    expect(() => clearMfaAssertion()).not.toThrow();
    expect(getMfaAssertion()).toBeNull();
  });
});

describe('notifyMfaRequired', () => {
  // No jsdom in this project's vitest setup (plain 'node' environment, see
  // vite.config.js) -- stub `window` with Node's own built-in EventTarget, which
  // implements the same addEventListener/dispatchEvent contract notifyMfaRequired
  // actually uses, so this exercises the real dispatch path rather than mocking it away.
  beforeEach(() => {
    globalThis.sessionStorage = makeMemoryStorage();
    globalThis.window = new EventTarget();
  });

  it('dispatches MFA_REQUIRED_EVENT on window so AuthContext can drop back to the MFA gate', () => {
    const handler = vi.fn();
    window.addEventListener(MFA_REQUIRED_EVENT, handler);
    notifyMfaRequired();
    window.removeEventListener(MFA_REQUIRED_EVENT, handler);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('never throws even when window is unavailable (non-browser context)', () => {
    delete globalThis.window;
    expect(() => notifyMfaRequired()).not.toThrow();
  });
});
