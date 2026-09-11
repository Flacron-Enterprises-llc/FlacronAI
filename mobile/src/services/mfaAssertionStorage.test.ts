import { getMfaAssertion, setMfaAssertion, clearMfaAssertion } from './mfaAssertionStorage';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store's real native module has no implementation under Jest, and
// jest-expo's own auto-mock is a generic "don't crash on import" stub, not a working
// store — so this test supplies its own minimal in-memory implementation to actually
// exercise the get/set/clear round trip this module promises.
// Jest hoists jest.mock() factories above all other module-scope code and forbids them
// from closing over ordinary out-of-scope variables -- `mockStore` is allowed under
// Jest's own "variable names prefixed with mock are permitted" exception.
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockStore.has(key) ? mockStore.get(key)! : null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  }),
}));

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe('mfaAssertionStorage (Keychain/Keystore-backed via expo-secure-store)', () => {
  it('returns null when nothing has been stored yet', async () => {
    expect(await getMfaAssertion()).toBeNull();
  });

  it('round-trips a stored assertion', async () => {
    await setMfaAssertion('assertion-token-abc');
    expect(await getMfaAssertion()).toBe('assertion-token-abc');
  });

  it('clearMfaAssertion removes it', async () => {
    await setMfaAssertion('assertion-token-abc');
    await clearMfaAssertion();
    expect(await getMfaAssertion()).toBeNull();
  });

  it('never throws when the underlying SecureStore call rejects (fails safely closed)', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain unavailable'));
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain unavailable'));
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain unavailable'));

    await expect(getMfaAssertion()).resolves.toBeNull();
    await expect(setMfaAssertion('x')).resolves.toBeUndefined();
    await expect(clearMfaAssertion()).resolves.toBeUndefined();
  });
});
