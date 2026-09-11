import { ApiRequestError } from '@/types/api';
import { getAuthErrorMessage, isTransientErrorCode } from './errorMessages';

describe('getAuthErrorMessage — Firebase SDK errors', () => {
  it('maps a known Firebase error code to a safe message', () => {
    expect(getAuthErrorMessage({ code: 'auth/wrong-password' })).toBe('Invalid email or password');
    expect(getAuthErrorMessage({ code: 'auth/user-not-found' })).toBe('Invalid email or password');
    expect(getAuthErrorMessage({ code: 'auth/email-already-in-use' })).toContain('already registered');
  });

  it('never surfaces a raw/unmapped Firebase error code or message to the user', () => {
    const message = getAuthErrorMessage({ code: 'auth/some-internal-code-nobody-mapped', message: 'raw SDK internals' });
    expect(message).not.toContain('auth/some-internal-code-nobody-mapped');
    expect(message).not.toContain('raw SDK internals');
    expect(message).toBe('Something went wrong. Please try again.');
  });

  it('falls back to a generic message for a non-Firebase-shaped, non-ApiRequestError value', () => {
    expect(getAuthErrorMessage(new Error('some unrelated crash'))).toBe('Something went wrong. Please try again.');
    expect(getAuthErrorMessage('a plain string')).toBe('Something went wrong. Please try again.');
    expect(getAuthErrorMessage(undefined)).toBe('Something went wrong. Please try again.');
  });
});

describe('getAuthErrorMessage — backend ApiRequestError', () => {
  it('maps a known backend error code to a safe message', () => {
    const err = new ApiRequestError('Session revoked, please log in again', { status: 401, code: 'TOKEN_REVOKED' });
    expect(getAuthErrorMessage(err)).toBe('Your session has ended. Please sign in again.');
  });

  it('falls back to the (already backend-sanitized) error string for an unmapped code', () => {
    const err = new ApiRequestError('This feature requires Agency tier or higher', { status: 403, code: 'INSUFFICIENT_TIER' });
    expect(getAuthErrorMessage(err)).toBe('This feature requires Agency tier or higher');
  });

  it('surfaces a distinct message for a genuine network failure', () => {
    const err = new ApiRequestError('Unable to reach the server. Check your connection and try again.', {
      isNetworkError: true,
    });
    expect(getAuthErrorMessage(err)).toContain('Unable to reach the server');
  });
});

describe('isTransientErrorCode', () => {
  it('treats AUTH_VERIFY_UNAVAILABLE and PROFILE_LOOKUP_FAILED as transient — never a reason to sign out', () => {
    expect(isTransientErrorCode('AUTH_VERIFY_UNAVAILABLE')).toBe(true);
    expect(isTransientErrorCode('PROFILE_LOOKUP_FAILED')).toBe(true);
  });

  it('treats a genuine auth failure code as NOT transient', () => {
    expect(isTransientErrorCode('TOKEN_REVOKED')).toBe(false);
    expect(isTransientErrorCode('INVALID_TOKEN')).toBe(false);
  });

  it('treats a missing code as not transient', () => {
    expect(isTransientErrorCode(null)).toBe(false);
    expect(isTransientErrorCode(undefined)).toBe(false);
  });
});
