import { signInWithApple } from './appleSignIn';

// This suite's whole purpose is proving the anti-replay nonce wiring end-to-end: Apple's
// native request must receive the SHA-256 HASH of a fresh random nonce (never the raw
// value, and never no nonce at all), while Firebase's credential must receive the ORIGINAL
// RAW nonce (never the hash) so it can re-hash and verify the match itself. Getting this
// backwards (or omitting it, as the pre-fix code did with `rawNonce: undefined`) silently
// drops the replay protection without any visible symptom in normal use.

const mockSignInAsync = jest.fn();
jest.mock('expo-apple-authentication', () => ({
  signInAsync: (...args: unknown[]) => mockSignInAsync(...args),
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

const mockDigestStringAsync = jest.fn();
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'raw-nonce-fixed-for-test'),
  digestStringAsync: (...args: unknown[]) => mockDigestStringAsync(...args),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

const mockCredential = jest.fn();
const mockSignInWithCredential = jest.fn();
jest.mock('firebase/auth', () => ({
  OAuthProvider: class {
    credential(input: unknown) {
      return mockCredential(input);
    }
  },
  signInWithCredential: (...args: unknown[]) => mockSignInWithCredential(...args),
}));

jest.mock('@/services/firebase/client', () => ({
  getFirebaseAuth: () => ({ __fakeAuth: true }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockDigestStringAsync.mockResolvedValue('hashed-nonce-fixed-for-test');
  mockCredential.mockReturnValue({ __fakeFirebaseCredential: true });
  mockSignInWithCredential.mockResolvedValue({ user: { uid: 'abc' } });
});

describe('signInWithApple — anti-replay nonce flow', () => {
  it('sends Apple only the SHA-256 hash of the raw nonce, never the raw value', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: 'apple-id-token' });

    await signInWithApple();

    expect(mockDigestStringAsync).toHaveBeenCalledWith('SHA-256', 'raw-nonce-fixed-for-test');
    expect(mockSignInAsync).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: 'hashed-nonce-fixed-for-test' })
    );
    const signInAsyncArg = mockSignInAsync.mock.calls[0][0];
    expect(signInAsyncArg.nonce).not.toBe('raw-nonce-fixed-for-test');
  });

  it('hands Firebase the original RAW nonce (not the hash, not undefined)', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: 'apple-id-token' });

    await signInWithApple();

    expect(mockCredential).toHaveBeenCalledWith({
      idToken: 'apple-id-token',
      rawNonce: 'raw-nonce-fixed-for-test',
    });
  });

  it('generates a fresh nonce on every call (no reuse across sign-in attempts)', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: 'apple-id-token' });
    const { randomUUID } = jest.requireMock('expo-crypto') as { randomUUID: jest.Mock };

    await signInWithApple();
    await signInWithApple();

    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it('still returns cancelled on ERR_REQUEST_CANCELED, without ever reaching Firebase', async () => {
    mockSignInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });

    const result = await signInWithApple();

    expect(result).toEqual({ status: 'cancelled' });
    expect(mockSignInWithCredential).not.toHaveBeenCalled();
  });

  it('still throws when Apple returns no identity token, without ever reaching Firebase', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: null });

    await expect(signInWithApple()).rejects.toThrow(/did not return an identity token/i);
    expect(mockSignInWithCredential).not.toHaveBeenCalled();
  });
});
