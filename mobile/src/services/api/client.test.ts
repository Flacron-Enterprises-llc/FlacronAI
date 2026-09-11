// client.ts's MFA-enforcement wiring (2026-09-08 fix, AUTHENTICATION_ARCHITECTURE.md
// §12): every non-skipAuth request must attach a stored assertion as X-MFA-Token, and a
// 403 MFA_REQUIRED response must clear the stored assertion and notify AuthProvider so
// it can drop back to MfaScreen. Firebase, env config, and secure storage are mocked at
// their own module boundaries — this suite only exercises client.ts's own logic.

import { apiRequest, subscribeToMfaRequired } from './client';

jest.mock('@/config/env', () => ({
  getApiBaseUrl: () => 'https://api.test.example/api/v1',
}));

jest.mock('../firebase/client', () => ({
  getFirebaseAuth: () => ({ currentUser: { getIdToken: () => Promise.resolve('fake-id-token') } }),
}));

const mockGetMfaAssertion = jest.fn<Promise<string | null>, []>();
const mockClearMfaAssertion = jest.fn<Promise<void>, []>();
jest.mock('../mfaAssertionStorage', () => ({
  getMfaAssertion: () => mockGetMfaAssertion(),
  clearMfaAssertion: () => mockClearMfaAssertion(),
}));

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    clone() {
      return jsonResponse(status, body);
    },
  } as unknown as Response;
}

beforeEach(() => {
  mockGetMfaAssertion.mockReset().mockResolvedValue(null);
  mockClearMfaAssertion.mockReset().mockResolvedValue(undefined);
  globalThis.fetch = jest.fn();
});

describe('apiRequest — X-MFA-Token attachment', () => {
  it('attaches X-MFA-Token when an assertion is stored', async () => {
    mockGetMfaAssertion.mockResolvedValue('stored-assertion');
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { success: true }));

    await apiRequest('/reports');

    const [, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(init.headers['X-MFA-Token']).toBe('stored-assertion');
  });

  it('does not attach the header at all when no assertion is stored', async () => {
    mockGetMfaAssertion.mockResolvedValue(null);
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { success: true }));

    await apiRequest('/reports');

    const [, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(init.headers['X-MFA-Token']).toBeUndefined();
  });

  it('does not attach the header on a skipAuth request', async () => {
    mockGetMfaAssertion.mockResolvedValue('stored-assertion');
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { success: true }));

    await apiRequest('/auth/forgot-password', { method: 'POST', skipAuth: true, body: { email: 'a@b.com' } });

    const [, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(init.headers['X-MFA-Token']).toBeUndefined();
    expect(mockGetMfaAssertion).not.toHaveBeenCalled();
  });
});

describe('apiRequest — 403 MFA_REQUIRED handling', () => {
  it('clears the stored assertion and notifies subscribers, then still surfaces the error', async () => {
    mockGetMfaAssertion.mockResolvedValue('stale-assertion');
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(403, { success: false, error: 'Multi-factor verification required', code: 'MFA_REQUIRED' })
    );

    const listener = jest.fn();
    const unsubscribe = subscribeToMfaRequired(listener);

    await expect(apiRequest('/reports')).rejects.toThrow();

    expect(mockClearMfaAssertion).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does not notify subscribers for an unrelated 403 (e.g. TEAM_ACCESS_SUSPENDED)', async () => {
    mockGetMfaAssertion.mockResolvedValue(null);
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(403, { success: false, error: 'Your team access has been suspended', code: 'TEAM_ACCESS_SUSPENDED' })
    );

    const listener = jest.fn();
    const unsubscribe = subscribeToMfaRequired(listener);

    await expect(apiRequest('/reports')).rejects.toThrow();

    expect(mockClearMfaAssertion).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('unsubscribe actually stops further notifications', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(403, { success: false, error: 'Multi-factor verification required', code: 'MFA_REQUIRED' })
    );

    const listener = jest.fn();
    const unsubscribe = subscribeToMfaRequired(listener);
    unsubscribe();

    await expect(apiRequest('/reports')).rejects.toThrow();

    expect(listener).not.toHaveBeenCalled();
  });
});
