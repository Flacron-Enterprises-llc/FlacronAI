/**
 * Shared shape of the backend's response envelope (`backend/server.js` global handler +
 * every route in `backend/routes/*`) — `{ success, error, code }` on failure, an
 * endpoint-specific shape merged with `{ success: true }` on success. Mirrors
 * `WEB_TO_MOBILE_REUSE_STRATEGY.md` §2.2 ("Share only contract/type/constant").
 *
 * Do not invent new error codes here — if the backend returns one not listed below, treat
 * it as unknown/generic (see errorMessages.ts), never guess its meaning.
 */

export interface ApiErrorBody {
  success: false;
  error: string;
  code?: string;
  /** express-validator failures use this instead of `error`/`code` (no `code` field at all
   * on that shape) — confirmed in `backend/routes/users.js`/`reports.js`. */
  errors?: Record<string, { msg?: string }>;
  request_id?: string;
}

/** Error codes this app's auth flows are known to branch on. Not an exhaustive backend list. */
export type KnownAuthErrorCode =
  | 'NO_TOKEN'
  | 'INVALID_TOKEN'
  | 'TOKEN_REVOKED'
  | 'AUTH_VERIFY_UNAVAILABLE'
  | 'PROFILE_LOOKUP_FAILED'
  | 'TEAM_ACCESS_SUSPENDED'
  | 'AUTH_RATE_LIMITED'
  | 'MFA_RATE_LIMITED'
  | 'INVALID_MFA_CODE'
  | 'MFA_NOT_ENABLED'
  | 'MFA_SESSION_EXPIRED'
  | 'INVALID_MFA_TOKEN'
  | 'MFA_REQUIRED'
  | 'INVALID_PASSWORD'
  | 'INVALID_CREDENTIALS'
  | 'CONFIG_ERROR';

/**
 * Coarse-grained category every thrown `ApiRequestError` is classified into (Phase 4). A
 * resource client / future UI layer should branch on `category`, not on raw HTTP status or
 * a guessed `code` string, so a new backend error code that doesn't change the category
 * still behaves correctly by default.
 *
 * - `offline` — no network connectivity was detected (or the request failed in a way
 *   indistinguishable from it). Retryable once connectivity returns; never a reason to
 *   clear auth state.
 * - `timeout` — the request's own timeout elapsed before a response arrived. Retryable
 *   only for GET/idempotent requests.
 * - `cancelled` — the caller's own `AbortSignal` fired. Never retried, never surfaced as a
 *   user-facing error (the caller asked for this).
 * - `rate_limited` — HTTP 429 (a global/per-route/per-uid limiter). Retryable, honoring
 *   `Retry-After` when the backend sends one.
 * - `transient_server` — HTTP 503 or 5xx, or a code the backend documents as transient
 *   (`AUTH_VERIFY_UNAVAILABLE`, `PROFILE_LOOKUP_FAILED`). Retryable.
 * - `auth_fatal` — the bearer token is invalid/revoked, or the account/config itself is
 *   broken (`TOKEN_REVOKED`, `INVALID_TOKEN` after the one refresh-retry already failed,
 *   `TEAM_ACCESS_SUSPENDED`, `CONFIG_ERROR`, `INVALID_CREDENTIALS`, `INVALID_PASSWORD`,
 *   `NO_AUTH`/`NO_TOKEN`/`NO_API_KEY`/`INVALID_API_KEY`). Never retried automatically —
 *   the caller must re-authenticate or fix configuration.
 * - `mfa_required` — HTTP 403 `MFA_REQUIRED` specifically. Handled by `client.ts`'s
 *   existing MFA-assertion-clearing/notify logic (unchanged by Phase 4); never retried.
 * - `validation` — HTTP 400/422, or an express-validator `errors` map. Never retried.
 * - `conflict` — HTTP 409 (e.g. `DUPLICATE_GENERATE_REQUEST`, `REPORT_FINALIZED`,
 *   `EXPORT_IN_PROGRESS`). Never retried automatically — the caller must decide.
 * - `permission` — HTTP 403 for a real authorization decision that isn't an auth/account
 *   failure (`INSUFFICIENT_TIER`, `API_ACCESS_DENIED`, `TEAM_PERMISSION_DENIED`,
 *   `API_SCOPE_REQUIRED`, `SHARE_PERMISSION_DENIED`, etc.). Never retried.
 * - `not_found` — HTTP 404. Never retried.
 * - `unknown` — anything not classified above. Treated as non-retryable by default (safer
 *   than guessing it's transient).
 */
export type ApiErrorCategory =
  | 'offline'
  | 'timeout'
  | 'cancelled'
  | 'rate_limited'
  | 'transient_server'
  | 'auth_fatal'
  | 'mfa_required'
  | 'validation'
  | 'conflict'
  | 'permission'
  | 'not_found'
  | 'unknown';

export interface ApiRequestErrorOptions {
  status?: number | null;
  code?: string | null;
  isNetworkError?: boolean;
  category?: ApiErrorCategory;
  /** Whether the shared client's own bounded-retry loop is allowed to retry this error
   * (still gated separately on the request being GET/idempotent — see client.ts). */
  retryable?: boolean;
  /** Backend `Retry-After` (seconds or HTTP-date), pre-converted to milliseconds and
   * capped, when present on a 429/503 response. */
  retryAfterMs?: number | null;
  /** express-validator's field-level messages, when the failure came from that shape
   * instead of `{error, code}`. */
  fieldErrors?: Record<string, { msg?: string }> | null;
}

/**
 * A typed error thrown by the API client — never a raw Error with a guessed message. This
 * is this app's `ApiError` model (Phase 4): every resource-client method throws this on
 * failure, never a plain `Error`, so callers can branch on `category`/`code`/`status`
 * without re-deriving the classification themselves.
 */
export class ApiRequestError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly isNetworkError: boolean;
  readonly category: ApiErrorCategory;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  readonly fieldErrors: Record<string, { msg?: string }> | null;

  constructor(message: string, opts: ApiRequestErrorOptions = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = opts.status ?? null;
    this.code = opts.code ?? null;
    this.isNetworkError = opts.isNetworkError ?? false;
    this.category = opts.category ?? 'unknown';
    this.retryable = opts.retryable ?? false;
    this.retryAfterMs = opts.retryAfterMs ?? null;
    this.fieldErrors = opts.fieldErrors ?? null;
  }
}

/** Alias kept for Phase 4 call sites that prefer the more conventional name — same class,
 * not a parallel error type. */
export const ApiError = ApiRequestError;

/**
 * The `{ data, total, page, limit, hasMore }`-shaped list envelope used by
 * `GET /reports` and `GET /notifications` (offset/page-based, not cursor-based — see each
 * resource client for the exact field names, which differ slightly per route).
 */
export interface OffsetPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/** Query params accepted by `apiRequest`'s `params` option — values are stringified,
 * `undefined`/`null` entries are omitted entirely (never sent as the literal string
 * "undefined"). */
export type QueryParams = Record<string, string | number | boolean | undefined | null>;
