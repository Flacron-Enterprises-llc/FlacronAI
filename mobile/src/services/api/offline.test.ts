// Overrides the global `jest.setup.js` netinfo mock with a per-test-controllable one, since
// this suite needs to assert behavior for specific connectivity states, not the default
// mock's fixed "connected" state.
import { isOffline, subscribeToConnectivity } from './offline';

const mockFetch = jest.fn();
const mockAddEventListener = jest.fn();
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: (...args: unknown[]) => mockFetch(...args),
    addEventListener: (...args: unknown[]) => mockAddEventListener(...args),
  },
}));

beforeEach(() => {
  mockFetch.mockReset();
  mockAddEventListener.mockReset();
});

describe('isOffline', () => {
  it('returns true when NetInfo reports isConnected: false', async () => {
    mockFetch.mockResolvedValue({ isConnected: false });
    await expect(isOffline()).resolves.toBe(true);
  });

  it('returns false when NetInfo reports isConnected: true', async () => {
    mockFetch.mockResolvedValue({ isConnected: true });
    await expect(isOffline()).resolves.toBe(false);
  });

  it('returns null (unknown) when isConnected itself is null', async () => {
    mockFetch.mockResolvedValue({ isConnected: null });
    await expect(isOffline()).resolves.toBeNull();
  });

  it('returns null (unknown) when isConnected is undefined', async () => {
    mockFetch.mockResolvedValue({});
    await expect(isOffline()).resolves.toBeNull();
  });

  it('degrades to null instead of throwing when NetInfo itself throws', async () => {
    mockFetch.mockRejectedValue(new Error('native module unavailable'));
    await expect(isOffline()).resolves.toBeNull();
  });
});

describe('subscribeToConnectivity', () => {
  it('forwards true/false connectivity changes to the callback', () => {
    let capturedListener: ((state: { isConnected: boolean | null }) => void) | null = null;
    mockAddEventListener.mockImplementation((listener) => {
      capturedListener = listener;
      return jest.fn();
    });

    const onChange = jest.fn();
    subscribeToConnectivity(onChange);
    expect(capturedListener).not.toBeNull();

    capturedListener!({ isConnected: true });
    expect(onChange).toHaveBeenLastCalledWith(true);

    capturedListener!({ isConnected: false });
    expect(onChange).toHaveBeenLastCalledWith(false);

    capturedListener!({ isConnected: null });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('always returns a callable unsubscribe function, even if NetInfo throws on subscribe', () => {
    mockAddEventListener.mockImplementation(() => {
      throw new Error('native module unavailable');
    });
    const unsubscribe = subscribeToConnectivity(jest.fn());
    expect(() => unsubscribe()).not.toThrow();
  });

  it('unsubscribe calls through to the real unsubscribe and never throws even if that throws', () => {
    const realUnsubscribe = jest.fn(() => {
      throw new Error('already removed');
    });
    mockAddEventListener.mockReturnValue(realUnsubscribe);

    const unsubscribe = subscribeToConnectivity(jest.fn());
    expect(() => unsubscribe()).not.toThrow();
    expect(realUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
