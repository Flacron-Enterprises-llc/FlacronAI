/**
 * The one shared, typed HTTP client for the backend's `/api/v1/*` surface — used by every
 * resource client in this directory (`auth.ts`, `users.ts`, `reports.ts`, `payment.ts`,
 * `notifications.ts`). Phase 3 (Authentication) built the original version of this file
 * scoped to what auth/profile needed; Phase 4 (Backend/API Integration Layer) extends it
 * in place rather than forking a second client, so there is exactly one place that owns
 * the token-attachment/MFA-header/retry/offline/error-classification contract.
 *
 * Deliberately uses the platform `fetch` (no axios) — React Native/Expo's fetch already
 * supports `AbortController`-based cancellation and `FormData` multipart bodies, so there
 * is no reason to add a new HTTP dependency.
 *
 * Contract every resource-client method relies on:
 * - Resolves with the parsed JSON body (or, for `responseType: 'binary'`, an
 *   `{ data, contentType, contentDisposition }` triple) on any 2xx response.
 * - Throws `ApiRequestError` (never a plain `Error`) on anything else, with a `category`
 *   (see `types/api.ts` for the full enum + reasoning), the verified backend `code`/HTTP
 *   `status`, a safe display `message`, and `retryable`/`retryAfterMs` hints.
 * - Auth: attaches `Authorization: Bearer <Firebase ID token>` unless `skipAuth`. A 401
 *   forces exactly one token refresh + one replay of the same request — never more.
 * - MFA (Phase 3, unchanged): attaches the stored `X-MFA-Token` assertion on every
 *   non-skipAuth request; a `403 MFA_REQUIRED` response clears the stored assertion and
 *   notifies `subscribeToMfaRequired` listeners (AuthProvider), then still surfaces the
 *   error as usual.
 * - Retry/backoff (Phase 4): only GET requests, or a mutation explicitly marked
 *   `idempotent: true` by its resource-client method (only when the backend route is
 *   confirmed safe to repeat — see each resource client's own comments), are ever retried
 *   automatically, and only for a `retryable` category (`offline`, `timeout`,
 *   `rate_limited`, `transient_server`) — never for `validation`/`conflict`/`permission`/
 *   `not_found`/`auth_fatal`/`mfa_required`/`cancelled`. Bounded exponential backoff with
 *   full jitter, honoring a numeric-seconds or HTTP-date `Retry-After` header when present
 *   (capped at 15s so a hostile/misconfigured value can't stall the app).
 * - Offline: a known-offline device short-circuits before attempting the network call at
 *   all; an actual network failure is classified the same way. Neither ever clears auth
 *   state — only a `401`/`403` from a real response can do that (see auth.ts/AuthProvider).
 * - Timeout/cancellation: every request has a bounded timeout (default 20s, overridable
 *   per call for large uploads) and accepts a caller-owned `AbortSignal`; both are
 *   distinguished from each other and from a generic network failure.
 * - Never logs a token, a request/response body, or any header value.
 */
import { getApiBaseUrl } from '@/config/env';
import { ApiRequestError, type ApiErrorCategory, type QueryParams } from '@/types/api';
import { getFirebaseAuth } from '../firebase/client';
import { clearMfaAssertion, getMfaAssertion } from '../mfaAssertionStorage';
import { isOffline } from './offline';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface RequestOptions {
  method?: HttpMethod;
  /** JSON-serializable body. Mutually exclusive with `multipart`. */
  body?: unknown;
  /** Query-string parameters — serialized via `buildQueryString`, `undefined`/`null`
   * values omitted entirely. */
  params?: QueryParams;
  /** Skip attaching an Authorization header and the X-MFA-Token header — only for the
   * handful of genuinely public/anonymous endpoints (e.g. `POST /auth/forgot-password`). */
  skipAuth?: boolean;
  /**
   * Opt-in: this specific call is confirmed safe for the shared client to retry
   * automatically on a transient failure, because the backend route is documented as
   * idempotent for it (a content-hash dedup, a state-set that no-ops on repeat, etc.) —
   * never set this for a call that creates a new resource or has an un-guarded side effect
   * each time it runs. GET requests are always retry-eligible regardless of this flag.
   */
  idempotent?: boolean;
  /** Per-request timeout in ms. Default 20000; large multipart uploads should pass a
   * longer value explicitly. */
  timeoutMs?: number;
  /** Caller-owned cancellation. Aborting rejects with a `cancelled`-category
   * `ApiRequestError` and skips the retry loop entirely. */
  signal?: AbortSignal;
  /** Pre-built multipart body (React Native `FormData`). Mutually exclusive with `body` —
   * when set, no `Content-Type` is attached manually so `fetch` can set its own boundary. */
  multipart?: FormData;
  /** 'json' (default): parse and return the response body as `T`. 'binary': return the raw
   * bytes (`ArrayBuffer`) plus a couple of response headers instead of attempting
   * `JSON.parse` — for photo/export/document download endpoints, which never respond with
   * JSON on success. */
  responseType?: 'json' | 'binary';
}

export interface BinaryResponse {
  data: ArrayBuffer;
  contentType: string | null;
  contentDisposition: string | null;
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
// with a plain subscriber list instead of a CustomEvent). Unchanged from Phase 3 — every
// resource client (not just auth-adjacent calls) shares this one pub/sub, since MFA
// enforcement, once turned on server-side, applies to every authenticated route.
type MfaRequiredListener = () => void;
const mfaRequiredListeners = new Set<MfaRequiredListener>();
export function subscribeToMfaRequired(listener: MfaRequiredListener): () => void {
  mfaRequiredListeners.add(listener);
  return () => mfaRequiredListeners.delete(listener);
}
function notifyMfaRequired() {
  for (const listener of mfaRequiredListeners) listener();
}

/** Query-string serialization shared by every resource client — skips `undefined`/`null`
 * entirely rather than sending them as the literal string "undefined"/"null". */
export function buildQueryString(params?: QueryParams): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    usp.append(key, String(value));
  }
  return usp.toString();
}

/**
 * Central base-URL + path join. Defensive against a doubled `/api/v1` (or `/api`) prefix:
 * `getApiBaseUrl()` already returns a base ending in `/api/v1` (see `config/env.ts`), and
 * every resource-client path is written relative to that (e.g. `/reports`, not
 * `/api/v1/reports`) — but if either side ever accidentally included the versioned prefix
 * too, this strips the redundant one instead of silently producing a broken URL.
 */
function buildUrl(path: string, params?: QueryParams): string {
  const base = getApiBaseUrl().replace(/\/+$/, '');
  let p = path.startsWith('/') ? path : `/${path}`;
  if (/\/api(\/v1)?$/.test(base)) {
    p = p.replace(/^\/api\/v1(?=\/|$)/, '') || '/';
    p = p.replace(/^\/api(?=\/|$)/, '') || '/';
  }
  const url = `${base}${p}`;
  const qs = buildQueryString(params);
  return qs ? `${url}?${qs}` : url;
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'AbortError'
  );
}

const DEFAULT_TIMEOUT_MS = 20000;

async function doFetch(path: string, options: RequestOptions, authHeader: string | null): Promise<Response> {
  const url = buildUrl(path, options.params);
  const headers: Record<string, string> = {};
  if (!options.multipart) headers['Content-Type'] = 'application/json';
  if (authHeader) headers.Authorization = authHeader;
  if (!options.skipAuth) {
    const mfaToken = await getMfaAssertion();
    if (mfaToken) headers['X-MFA-Token'] = mfaToken;
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', onExternalAbort);
  }

  try {
    return await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.multipart ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    if (options.signal) options.signal.removeEventListener('abort', onExternalAbort);
  }
}

function parseRetryAfterMs(response: Response): number | null {
  try {
    const header = response.headers?.get?.('Retry-After');
    if (!header) return null;
    let ms: number;
    const asSeconds = Number(header);
    if (!Number.isNaN(asSeconds)) {
      ms = asSeconds * 1000;
    } else {
      const asDate = Date.parse(header);
      if (Number.isNaN(asDate)) return null;
      ms = asDate - Date.now();
    }
    if (!Number.isFinite(ms) || ms < 0) return 0;
    // Capped so a hostile/misconfigured header value can never stall the app for an
    // unbounded amount of time.
    return Math.min(ms, 15000);
  } catch {
    return null;
  }
}

// Error codes verified against backend/middleware/auth.js + the specific resource routes
// this app calls — never guessed. See types/api.ts's ApiErrorCategory doc for the mapping
// rationale.
const AUTH_FATAL_CODES = new Set([
  'NO_TOKEN',
  'NO_AUTH',
  'NO_API_KEY',
  'INVALID_API_KEY',
  'INVALID_TOKEN',
  'TOKEN_REVOKED',
  'TEAM_ACCESS_SUSPENDED',
  'CONFIG_ERROR',
  'INVALID_CREDENTIALS',
  'INVALID_PASSWORD',
]);
const TRANSIENT_CODES = new Set(['AUTH_VERIFY_UNAVAILABLE', 'PROFILE_LOOKUP_FAILED']);
const PERMISSION_CODES = new Set([
  'INSUFFICIENT_TIER',
  'API_ACCESS_DENIED',
  'API_SCOPE_REQUIRED',
  'TEAM_PERMISSION_DENIED',
  'SHARE_PERMISSION_DENIED',
  'ORG_EDIT_DENIED',
  'NOT_ASSIGNED_REVIEWER',
  'FORBIDDEN',
  'EXPORT_FORMAT_NOT_ALLOWED',
  'TEAM_OWNER_BLOCKED',
]);

function classify(status: number, code: string | null): { category: ApiErrorCategory; retryable: boolean } {
  if (code === 'MFA_REQUIRED') return { category: 'mfa_required', retryable: false };
  if (status === 429) return { category: 'rate_limited', retryable: true };
  if (status === 503 || (code && TRANSIENT_CODES.has(code))) return { category: 'transient_server', retryable: true };
  if (status >= 500) return { category: 'transient_server', retryable: true };
  if (status === 401 || status === 403) {
    if (code && PERMISSION_CODES.has(code)) return { category: 'permission', retryable: false };
    if (code && AUTH_FATAL_CODES.has(code)) return { category: 'auth_fatal', retryable: false };
    return { category: 'auth_fatal', retryable: false };
  }
  if (status === 404) return { category: 'not_found', retryable: false };
  if (status === 409) return { category: 'conflict', retryable: false };
  if (status === 400 || status === 422) return { category: 'validation', retryable: false };
  return { category: 'unknown', retryable: false };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function throwClassified(response: Response, body: unknown): never {
  const parsed = (body ?? {}) as { error?: string; code?: string; errors?: Record<string, { msg?: string }> };
  const { category, retryable } = classify(response.status, parsed.code ?? null);
  const retryAfterMs =
    category === 'rate_limited' || category === 'transient_server' ? parseRetryAfterMs(response) : null;
  const message =
    parsed.error || (parsed.errors ? 'Validation failed' : `Request failed (${response.status})`);
  throw new ApiRequestError(message, {
    status: response.status,
    code: parsed.code ?? null,
    category,
    retryable,
    retryAfterMs,
    fieldErrors: parsed.errors ?? null,
  });
}

function safeHeader(response: Response, name: string): string | null {
  try {
    return response.headers?.get?.(name) ?? null;
  } catch {
    return null;
  }
}

async function parseResponse<T>(response: Response, options: RequestOptions): Promise<T | BinaryResponse> {
  if (options.responseType === 'binary') {
    if (!response.ok) {
      throwClassified(response, await safeJson(response));
    }
    const data = await response.arrayBuffer();
    const result: BinaryResponse = {
      data,
      contentType: safeHeader(response, 'Content-Type'),
      contentDisposition: safeHeader(response, 'Content-Disposition'),
    };
    return result;
  }

  const json = await safeJson(response);
  if (!response.ok) {
    throwClassified(response, json);
  }
  return json as T;
}

/** Performs exactly one logical HTTP attempt (including the built-in single 401
 * refresh-and-replay and the MFA 403 side effects) — no transient retry loop here, that
 * lives in `apiRequestInternal` below. */
async function performAttempt<T>(path: string, options: RequestOptions): Promise<T | BinaryResponse> {
  const offline = await isOffline();
  if (offline === true) {
    throw new ApiRequestError('You appear to be offline. Check your connection and try again.', {
      isNetworkError: true,
      category: 'offline',
      retryable: true,
    });
  }

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
  } catch (err) {
    if (isAbortError(err)) {
      if (options.signal?.aborted) {
        throw new ApiRequestError('Request was cancelled.', { category: 'cancelled', retryable: false });
      }
      throw new ApiRequestError('The request timed out. Please try again.', {
        category: 'timeout',
        retryable: true,
        isNetworkError: true,
      });
    }
    throw new ApiRequestError('Unable to reach the server. Check your connection and try again.', {
      isNetworkError: true,
      category: 'offline',
      retryable: true,
    });
  }

  // 403 MFA_REQUIRED — the assertion is missing, expired, or was revoked
  // (logout/password-change/a fresh sign-in elsewhere). Clear the stale assertion and
  // notify AuthProvider so it drops back to the MFA gate instead of leaving stale
  // protected content mounted. No retry -- this can only be resolved by the user
  // completing MfaScreen again. Unchanged from Phase 3.
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

  // 401 — force-refresh the Firebase token once and retry, exactly once. Unchanged from
  // Phase 3; applies regardless of method, since this completes the SAME logical request
  // with a corrected credential rather than retrying due to transience.
  if (response.status === 401 && !options.skipAuth) {
    const freshHeader = await getAuthHeader(true).catch(() => null);
    if (freshHeader) {
      try {
        response = await doFetch(path, options, freshHeader);
      } catch (err) {
        if (isAbortError(err)) {
          if (options.signal?.aborted) {
            throw new ApiRequestError('Request was cancelled.', { category: 'cancelled', retryable: false });
          }
          throw new ApiRequestError('The request timed out. Please try again.', {
            category: 'timeout',
            retryable: true,
            isNetworkError: true,
          });
        }
        throw new ApiRequestError('Unable to reach the server. Check your connection and try again.', {
          isNetworkError: true,
          category: 'offline',
          retryable: true,
        });
      }
    }
  }

  return parseResponse<T>(response, options);
}

function backoffDelay(attempt: number): number {
  const base = 300;
  const cap = 4000;
  const exp = Math.min(cap, base * 2 ** (attempt - 1));
  // Full-range jitter within [exp/2, exp] so concurrent clients don't retry in lockstep.
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

/** Additional attempts beyond the first, for retry-eligible requests only (GET, or a
 * mutation explicitly marked `idempotent: true`). Bounded so a persistently-failing
 * backend can never turn into an unbounded retry loop. */
const MAX_RETRY_ATTEMPTS = 3;

async function apiRequestInternal<T>(path: string, options: RequestOptions): Promise<T | BinaryResponse> {
  const method = options.method ?? 'GET';
  const retryEligible = method === 'GET' || options.idempotent === true;

  let attempt = 0;
  for (;;) {
    try {
      return await performAttempt<T>(path, options);
    } catch (err) {
      if (!(err instanceof ApiRequestError)) throw err;
      const canRetry = retryEligible && err.retryable && attempt < MAX_RETRY_ATTEMPTS;
      if (!canRetry) throw err;
      if (options.signal?.aborted) {
        throw new ApiRequestError('Request was cancelled.', { category: 'cancelled', retryable: false });
      }
      attempt += 1;
      const delay = err.retryAfterMs ?? backoffDelay(attempt);
      await wait(delay);
    }
  }
}

/**
 * Performs one authenticated request against the backend, applying the full retry/offline/
 * timeout/MFA contract documented at the top of this file. Throws `ApiRequestError` on any
 * non-2xx outcome (after retries, if any, are exhausted).
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await apiRequestInternal<T>(path, options)) as T;
}

/**
 * Same contract as `apiRequest`, but for endpoints that respond with raw bytes on success
 * (photo images, PDF/DOCX export downloads, supporting-document downloads) instead of
 * JSON — never attempts `JSON.parse` on a 2xx response.
 */
export async function apiRequestBinary(
  path: string,
  options: Omit<RequestOptions, 'responseType'> = {}
): Promise<BinaryResponse> {
  return (await apiRequestInternal<never>(path, { ...options, responseType: 'binary' })) as BinaryResponse;
}
