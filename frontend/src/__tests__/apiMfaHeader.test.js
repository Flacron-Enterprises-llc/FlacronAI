import { describe, it, expect, beforeEach, vi } from 'vitest';
import api, {
  setMfaAssertion,
  clearMfaAssertion,
  getMfaAssertion,
  MFA_REQUIRED_EVENT,
} from '../services/api.js';

// Exercises the REAL interceptors registered on the shared axios instance (via axios's own
// `interceptors.request/response.handlers[0].fulfilled/rejected`, the same technique axios
// itself exposes for direct interceptor invocation when no mock-adapter dependency is
// available) rather than re-testing the pure mfaAssertion.js module in isolation again
// (see mfaAssertion.test.js) -- this proves api.js actually wires that module in.

function makeMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

beforeEach(() => {
  globalThis.sessionStorage = makeMemoryStorage();
  globalThis.localStorage = makeMemoryStorage();
  globalThis.window = new EventTarget();
  clearMfaAssertion();
});

describe('api.js request interceptor — X-MFA-Token attachment', () => {
  it('attaches X-MFA-Token when an assertion is stored', async () => {
    setMfaAssertion('web-assertion-abc');
    const requestFulfilled = api.interceptors.request.handlers[0].fulfilled;
    const config = await requestFulfilled({ headers: {} });
    expect(config.headers['X-MFA-Token']).toBe('web-assertion-abc');
  });

  it('does not attach the header when no assertion is stored', async () => {
    const requestFulfilled = api.interceptors.request.handlers[0].fulfilled;
    const config = await requestFulfilled({ headers: {} });
    expect(config.headers['X-MFA-Token']).toBeUndefined();
  });
});

describe('api.js response interceptor — 403 MFA_REQUIRED handling', () => {
  it('clears the stored assertion and notifies MFA_REQUIRED_EVENT listeners', async () => {
    setMfaAssertion('stale-assertion');
    const listener = vi.fn();
    window.addEventListener(MFA_REQUIRED_EVENT, listener);

    const responseRejected = api.interceptors.response.handlers[0].rejected;
    const error = {
      response: { status: 403, data: { success: false, code: 'MFA_REQUIRED' } },
      config: {},
    };
    await expect(responseRejected(error)).rejects.toBe(error);

    expect(getMfaAssertion()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(MFA_REQUIRED_EVENT, listener);
  });

  it('does not touch the assertion or notify for an unrelated 403', async () => {
    setMfaAssertion('still-valid-assertion');
    const listener = vi.fn();
    window.addEventListener(MFA_REQUIRED_EVENT, listener);

    const responseRejected = api.interceptors.response.handlers[0].rejected;
    const error = {
      response: { status: 403, data: { success: false, code: 'TEAM_ACCESS_SUSPENDED' } },
      config: { _authRetry: true, _transientRetry: true }, // short-circuit the other branches
    };
    await expect(responseRejected(error)).rejects.toBe(error);

    expect(getMfaAssertion()).toBe('still-valid-assertion');
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(MFA_REQUIRED_EVENT, listener);
  });
});
