/**
 * Minimal authenticated HTTP client for the backend's `/api/v1/*` surface, scoped to what
 * Phase 3 (Authentication) actually needs — profile + auth/MFA endpoints. A full typed
 * client covering every resource is Phase 4 scope (see
 * `mobile/src/services/README.md` and `WEB_TO_MOBILE_REUSE_STRATEGY.md` §2.2); this file
 * exists now only so auth flows have something real to call, not to get ahead of Phase 4.
 *
 * Deliberately uses the platform `fetch` (no axios) — Phase 3 doesn't need multipart
 * uploads, request cancellation, or upload-progress events, so there is no reason yet to
 * add a new dependency.
 *
 * Mirrors `frontend/src/services/api.js`'s proven retry/error contract (see
 * AUTHENTICATION_ARCHITECTURE.md §5.8/§6):
 * - 401: force-refresh the Firebase ID token once and retry. If that also fails (or there
 *   is no signed-in Firebase user), the error is surfaced as-is — callers must not retry a
 *   401 more than this once, and a `TOKEN_REVOKED`/`INVALID_TOKEN` code means "the caller
 *   should treat the session as gone," never "loop forever."
 * - 429: retry once after a fixed delay.
 * - 503 or a plain network failure (no response at all): retry once after a short delay —
 *   `AUTH_VERIFY_UNAVAILABLE`/`PROFILE_LOOKUP_FAILED` mean "the backend is having a
 *   moment," never "log the user out."
 */
import { getApiBaseUrl } from '@/config/env';
import { ApiRequestError } from '@/types/api';
import { getFirebaseAuth } from '../firebase/client';
import { clearMfaAssertion, getMfaAssertion } from '../mfaAssertionStorage';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  /** Skip attaching an Authorization header (e.g. none of Phase 3's calls need this, kept
   * for completeness/parity with the web client's shape). */
  skipAuth?: boolean;
}

async function getAuthHeader(forceRefresh: boolean): Promise<string | null> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return null;
  const token = await user.getIdToken(forceRefresh);
  return `Bearer ${token}`;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Notifies AuthProvider when the backend rejects a request with MFA_REQUIRED (assertion
// missing/expired/revoked), so it can drop `mfaVerified` back to false and the route
// guard re-shows MfaScreen instead of leaving a protected screen mounted. React Native
// has no DOM `window` to dispatch a browser event on (mirrors web's `api.js` pattern
// with a plain subscriber list instead of a CustomEvent).
type MfaRequiredListener = () => void;
const mfaRequiredListeners = new Set<MfaRequiredListener>();
export function subscribeToMfaRequired(listener: MfaRequiredListener): () => void {
  mfaRequiredListeners.add(listener);
  return () => mfaRequiredListeners.delete(listener);
}
function notifyMfaRequired() {
  for (const listener of mfaRequiredListeners) listener();
}

async function doFetch(path: string, options: RequestOptions, authHeader: string | null): Promise<Response> {
  const url = `${getApiBaseUrl()}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader) headers.Authorization = authHeader;
  if (!options.skipAuth) {
    const mfaToken = await getMfaAssertion();
    if (mfaToken) headers['X-MFA-Token'] = mfaToken;
  }

  return fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

/**
 * Performs one authenticated request against the backend, applying the retry contract
 * above. Throws `ApiRequestError` on any non-2xx outcome (after retries are exhausted).
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let authHeader: string | null = null;
  if (!options.skipAuth) {
    try {
      authHeader = await getAuthHeader(false);
    } catch {
      authHeader = null;
    }
  }

  let response: Response;
  try {
    response = await doFetch(path, options, authHeader);
  } catch {
    // No response at all — a real network failure. Retry once after a short delay.
    try {
      await wait(1000);
      response = await doFetch(path, options, authHeader);
    } catch {
      throw new ApiRequestError('Unable to reach the server. Check your connection and try again.', {
        isNetworkError: true,
      });
    }
  }

  // 403 MFA_REQUIRED — the assertion is missing, expired, or was revoked
  // (logout/password-change/a fresh sign-in elsewhere). Clear the stale assertion and
  // notify AuthProvider so it drops back to the MFA gate instead of leaving stale
  // protected content mounted. No retry -- this can only be resolved by the user
  // completing MfaScreen again.
  if (response.status === 403 && !options.skipAuth) {
    const peekedBody = await response
      .clone()
      .json()
      .catch(() => null);
    if ((peekedBody as { code?: string } | null)?.code === 'MFA_REQUIRED') {
      await clearMfaAssertion();
      notifyMfaRequired();
    }
  }

  // 401 — force-refresh the Firebase token once and retry, exactly once.
  if (response.status === 401 && !options.skipAuth) {
    const freshHeader = await getAuthHeader(true).catch(() => null);
    if (freshHeader) {
      response = await doFetch(path, options, freshHeader);
    }
  }

  // 429 — retry once after a fixed delay.
  if (response.status === 429) {
    await wait(2000);
    response = await doFetch(path, options, authHeader);
  }

  // 503 — transient backend issue. Retry once after a short delay.
  if (response.status === 503) {
    await wait(1000);
    response = await doFetch(path, options, authHeader);
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    const body = (json ?? {}) as { error?: string; code?: string };
    throw new ApiRequestError(body.error || `Request failed (${response.status})`, {
      status: response.status,
      code: body.code ?? null,
    });
  }

  return json as T;
}
