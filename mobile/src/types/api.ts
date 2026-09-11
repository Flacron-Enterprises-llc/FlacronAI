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
  errors?: Record<string, { msg?: string }>;
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

/** A typed error thrown by the API client — never a raw Error with a guessed message. */
export class ApiRequestError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly isNetworkError: boolean;

  constructor(message: string, opts: { status?: number | null; code?: string | null; isNetworkError?: boolean } = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = opts.status ?? null;
    this.code = opts.code ?? null;
    this.isNetworkError = opts.isNetworkError ?? false;
  }
}
