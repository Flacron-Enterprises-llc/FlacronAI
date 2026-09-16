// client.ts's MFA-enforcement wiring (2026-09-08 fix, AUTHENTICATION_ARCHITECTURE.md
// §12): every non-skipAuth request must attach a stored assertion as X-MFA-Token, and a
// 403 MFA_REQUIRED response must clear the stored assertion and notify AuthProvider so
// it can drop back to MfaScreen. Firebase, env config, and secure storage are mocked at
// their own module boundaries — this suite only exercises client.ts's own logic.

import { apiRequest, apiRequestBinary, buildQueryString, subscribeToMfaRequired } from './client';
import { isOffline } from './offline';

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

// Phase 4: client.ts checks connectivity before every attempt via ./offline — mocked here
// so the retry/error-classification tests below are deterministic and don't depend on the
// real @react-native-community/netinfo mock's default state.
jest.mock('./offline', () => ({ isOffline: jest.fn() }));
const mockIsOffline = isOffline as jest.MockedFunction<typeof isOffline>;

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    headers: { get: (name: string) => headers[name] ?? null },
    clone() {
      return jsonResponse(status, body, headers);
    },
  } as unknown as Response;
}

beforeEach(() => {
  mockGetMfaAssertion.mockReset().mockResolvedValue(null);
  mockClearMfaAssertion.mockReset().mockResolvedValue(undefined);
  mockIsOffline.mockReset().mockResolvedValue(false);
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

// ── Phase 4 (Backend/API Integration Layer) additions below ────────────────────────────

describe('buildQueryString', () => {
  it('serializes primitives and omits undefined/null entirely', () => {
    const qs = buildQueryString({ page: 1, limit: 20, search: undefined, archived: null, flag: false });
    expect(qs).toContain('page=1');
    expect(qs).toContain('limit=20');
    expect(qs).toContain('flag=false');
    expect(qs).not.toContain('search');
    expect(qs).not.toContain('archived');
    expect(qs).not.toContain('undefined');
    expect(qs).not.toContain('null');
  });

  it('returns an empty string for no params', () => {
    expect(buildQueryString()).toBe('');
    expect(buildQueryString({})).toBe('');
  });
});

describe('apiRequest — URL construction', () => {
  it('appends query params to the request URL', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { success: true }));
    await apiRequest('/reports', { params: { page: 1, status: 'draft' } });
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.test.example/api/v1/reports?page=1&status=draft');
  });

  it('strips a redundant /api/v1 prefix from the path so the URL is never doubled', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { success: true }));
    await apiRequest('/api/v1/reports');
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.test.example/api/v1/reports');
  });
});

describe('apiRequest — offline handling', () => {
  it('short-circuits with an offline-category error and never calls fetch when known offline', async () => {
    mockIsOffline.mockResolvedValue(true);
    await expect(apiRequest('/reports')).rejects.toMatchObject({ category: 'offline', retryable: true });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('proceeds normally when connectivity is unknown (null)', async () => {
    mockIsOffline.mockResolvedValue(null);
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { success: true }));
    await expect(apiRequest('/reports')).resolves.toEqual({ success: true });
  });

  it('classifies a genuine fetch failure as offline even when connectivity looked fine', async () => {
    (globalThis.fetch as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
    await expect(apiRequest('/reports/generate', { method: 'POST' })).rejects.toMatchObject({
      category: 'offline',
      isNetworkError: true,
    });
  });
});

describe('apiRequest — timeout vs. cancellation', () => {
  function hangingFetchMock() {
    return jest.fn((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const rejectAborted = () => {
          const err = new Error('Aborted');
          (err as Error & { name: string }).name = 'AbortError';
          reject(err);
        };
        // Mirrors real fetch: a signal that's ALREADY aborted by the time fetch is called
        // (as happens here — the caller's `controller.abort()` fires while `apiRequest`
        // is still awaiting the offline check, before `doFetch` ever runs) must reject
        // immediately — an 'abort' event listener alone would never fire for a past event.
        if (init.signal?.aborted) {
          rejectAborted();
          return;
        }
        init.signal?.addEventListener('abort', rejectAborted);
      });
    });
  }

  it('classifies an elapsed internal timeout distinctly, as retryable', async () => {
    globalThis.fetch = hangingFetchMock() as unknown as typeof fetch;
    await expect(
      apiRequest('/reports/generate', { method: 'POST', timeoutMs: 25 })
    ).rejects.toMatchObject({ category: 'timeout', retryable: true });
  });

  it('classifies a caller-driven cancellation distinctly, as non-retryable, with no retry attempted', async () => {
    globalThis.fetch = hangingFetchMock() as unknown as typeof fetch;
    const controller = new AbortController();
    const promise = apiRequest('/reports', { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ category: 'cancelled', retryable: false });
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(1);
  });
});

describe('apiRequest — retry/backoff eligibility', () => {
  it('retries a GET on a transient 503, honoring a zero-second Retry-After, then succeeds', async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(503, { success: false, error: 'busy', code: 'AUTH_VERIFY_UNAVAILABLE' }, { 'Retry-After': '0' })
      )
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: 'ok' }));

    await expect(apiRequest('/reports')).resolves.toEqual({ success: true, data: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a 429 rate-limit response for a GET, honoring Retry-After', async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, { success: false, error: 'slow down', code: 'RATE_LIMITED' }, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true }));

    await expect(apiRequest('/reports')).resolves.toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry a non-idempotent POST on a transient 503', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(503, { success: false, error: 'busy', code: 'AUTH_VERIFY_UNAVAILABLE' })
    );
    await expect(apiRequest('/reports/generate', { method: 'POST' })).rejects.toMatchObject({
      category: 'transient_server',
    });
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(1);
  });

  it('DOES retry a POST explicitly marked idempotent on a transient failure', async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503, { success: false, error: 'busy', code: 'AUTH_VERIFY_UNAVAILABLE' }, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, alreadyRead: false }));

    await expect(
      apiRequest('/notifications/n1/read', { method: 'POST', idempotent: true })
    ).resolves.toEqual({ success: true, alreadyRead: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never retries validation/conflict/permission/not_found errors even for a GET', async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValue(jsonResponse(404, { success: false, error: 'gone', code: 'NOT_FOUND' }));
    await expect(apiRequest('/reports/x')).rejects.toMatchObject({ category: 'not_found', retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after a bounded number of attempts for a persistently transient GET', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(503, { success: false, error: 'down', code: 'AUTH_VERIFY_UNAVAILABLE' }, { 'Retry-After': '0' })
    );
    await expect(apiRequest('/reports')).rejects.toMatchObject({ category: 'transient_server' });
    // 1 initial attempt + a bounded number of retries — must never loop forever.
    const calls = (globalThis.fetch as jest.Mock).mock.calls.length;
    expect(calls).toBeGreaterThan(1);
    expect(calls).toBeLessThanOrEqual(6);
  }, 15000);
});

describe('apiRequest — error classification', () => {
  it.each([
    [400, 'VALIDATION_ERROR', 'validation'],
    [404, 'NOT_FOUND', 'not_found'],
    [409, 'DUPLICATE_GENERATE_REQUEST', 'conflict'],
    [403, 'TEAM_PERMISSION_DENIED', 'permission'],
    [403, 'TEAM_ACCESS_SUSPENDED', 'auth_fatal'],
    [401, 'TOKEN_REVOKED', 'auth_fatal'],
    [500, 'INTERNAL_ERROR', 'transient_server'],
  ])('classifies HTTP %d code %s as category %s', async (status, code, category) => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(status, { success: false, error: 'x', code }));
    await expect(apiRequest('/reports/x')).rejects.toMatchObject({ category, code });
  });

  it('classifies an express-validator errors-map response as validation with fieldErrors set', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(400, { success: false, errors: { email: { msg: 'Invalid email' } } })
    );
    await expect(apiRequest('/reports/x', { method: 'PUT', body: {} })).rejects.toMatchObject({
      category: 'validation',
      fieldErrors: { email: { msg: 'Invalid email' } },
    });
  });
});

describe('apiRequest — no sensitive logging', () => {
  it('never logs via console.* during a request lifecycle, even with a stored MFA token and a body containing a password', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetMfaAssertion.mockResolvedValue('super-secret-assertion');
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(200, { success: true, token: 'should-not-be-logged' })
    );

    await apiRequest('/reports/generate', { method: 'POST', body: { password: 'hunter2' } });

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('apiRequestBinary', () => {
  it('returns raw bytes plus headers on success without attempting JSON.parse', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      arrayBuffer: async () => bytes,
      headers: {
        get: (name: string) =>
          ({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="r.pdf"' })[name] ?? null,
      },
      clone() {
        return this;
      },
    } as unknown as Response);

    const result = await apiRequestBinary('/reports/r1/download', { params: { file: 'r1.pdf' } });
    expect(result.data).toBe(bytes);
    expect(result.contentType).toBe('application/pdf');
    expect(result.contentDisposition).toContain('r.pdf');
  });

  it('throws a classified error on failure instead of returning bytes', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(404, { success: false, error: 'not found', code: 'FILE_NOT_FOUND' })
    );
    await expect(apiRequestBinary('/reports/r1/download', { params: { file: 'missing.pdf' } })).rejects.toMatchObject(
      { category: 'not_found', code: 'FILE_NOT_FOUND' }
    );
  });
});
