import { ApiRequestError } from '@/types/api';
import { enqueueRevocation, flushRevocations, MAX_AGE_MS, pendingRevocations } from './pushRevocationQueue';

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

beforeEach(() => mockStore.clear());

describe('pushRevocationQueue', () => {
  it('offline sign-out: the binding stays queued and is revoked once back online', async () => {
    await enqueueRevocation('b1');
    const offline = jest.fn(() => Promise.reject(new ApiRequestError('offline', { category: 'offline' })));
    await expect(flushRevocations(offline)).resolves.toBe(1);
    expect(await pendingRevocations()).toEqual(['b1']);

    const online = jest.fn(() => Promise.resolve());
    await expect(flushRevocations(online)).resolves.toBe(0);
    expect(online).toHaveBeenCalledWith('b1');
    expect(await pendingRevocations()).toEqual([]);
  });

  it('dedupes, is bounded in size, and drops entries past their maximum age', async () => {
    const t0 = 1_000_000;
    await enqueueRevocation('b1', t0);
    await enqueueRevocation('b1', t0);
    expect(await pendingRevocations()).toEqual(['b1']);
    for (let i = 0; i < 15; i++) await enqueueRevocation(`x${i}`, t0);
    expect((await pendingRevocations()).length).toBe(10);

    const revoke = jest.fn(() => Promise.resolve());
    await flushRevocations(revoke, t0 + MAX_AGE_MS + 1);
    expect(revoke).not.toHaveBeenCalled();
    expect(await pendingRevocations()).toEqual([]);
  });

  it('a permanent failure (4xx) is dropped, a transient one kept', async () => {
    await enqueueRevocation('bad');
    await enqueueRevocation('later');
    const revoke = jest.fn((id: string) =>
      Promise.reject(
        id === 'bad'
          ? new ApiRequestError('invalid', { status: 400, category: 'validation' })
          : new ApiRequestError('down', { status: 503, category: 'transient_server' })
      )
    );
    await expect(flushRevocations(revoke)).resolves.toBe(1);
    expect(await pendingRevocations()).toEqual(['later']);
  });

  it('concurrent enqueue + flush never lose an entry', async () => {
    const revoke = jest.fn(() => Promise.reject(new ApiRequestError('offline', { category: 'offline' })));
    await Promise.all([enqueueRevocation('a'), flushRevocations(revoke), enqueueRevocation('b'), flushRevocations(revoke)]);
    expect((await pendingRevocations()).sort()).toEqual(['a', 'b']);
  });

  it('storage failures never throw', async () => {
    const SecureStore = jest.requireMock('expo-secure-store');
    SecureStore.setItemAsync.mockImplementationOnce(() => Promise.reject(new Error('keychain locked')));
    await expect(enqueueRevocation('b1')).resolves.toBeUndefined();
  });
});
