import { ApiRequestError } from '@/types/api';
import {
  acquireToken,
  backendPushRegistrar,
  createRegistrationManager,
  stateFor,
  toResult,
  type PushTokenRegistrar,
} from './pushRegistration';

const mockRegisterApi = jest.fn();
const mockRevokeApi = jest.fn();
jest.mock('@/services/api/pushDevices', () => ({
  pushDevicesApi: {
    register: (token: string, platform: string, bindingId: string) => mockRegisterApi(token, platform, bindingId),
    revoke: (bindingId: string) => mockRevokeApi(bindingId),
  },
}));

const noSleep = () => Promise.resolve();
const transient = () => new ApiRequestError('offline', { category: 'offline', retryable: true });
const fatal = () => new ApiRequestError('denied', { category: 'auth_fatal', status: 401 });
const ON = { deliveryEnabled: true, providerStatus: 'unverified' as const };

function fakeRegistrar(): PushTokenRegistrar & { register: jest.Mock; revoke: jest.Mock } {
  return { register: jest.fn((..._a: unknown[]) => Promise.resolve(ON)), revoke: jest.fn((..._a: unknown[]) => Promise.resolve()) };
}

describe('backend registrar adapter', () => {
  it('sends token, platform and bindingId; maps server status safely', async () => {
    mockRegisterApi.mockResolvedValueOnce({ success: true, registered: true, deliveryEnabled: false, providerStatus: 'unverified' });
    await expect(backendPushRegistrar.register('tok', 'ios', 'b1')).resolves.toEqual({ deliveryEnabled: false, providerStatus: 'unverified' });
    expect(mockRegisterApi).toHaveBeenCalledWith('tok', 'ios', 'b1');
    mockRegisterApi.mockResolvedValueOnce({ success: true, registered: true });
    await expect(backendPushRegistrar.register('tok', 'ios', 'b1')).resolves.toEqual({ deliveryEnabled: false, providerStatus: 'unverified' });
    mockRevokeApi.mockResolvedValueOnce({ success: true });
    await backendPushRegistrar.revoke('b1');
    expect(mockRevokeApi).toHaveBeenCalledWith('b1');
  });

  it('status mapping never equates configuration with delivery', () => {
    expect(stateFor(toResult({ deliveryEnabled: true, providerStatus: 'unverified' }))).toBe('registered');
    expect(stateFor(toResult({ deliveryEnabled: true, providerStatus: 'credential-error' }))).toBe('registered-config-error');
    expect(stateFor(toResult({ deliveryEnabled: false, providerStatus: 'credential-error' }))).toBe('registered-delivery-off');
    expect(stateFor(toResult(null))).toBe('registered-delivery-off');
  });
});

describe('createRegistrationManager', () => {
  it('without a registrar every sync reports backend-unavailable', async () => {
    const m = createRegistrationManager({ registrar: null, platform: 'android' });
    await expect(m.sync('u1', 'tok', 'b1')).resolves.toBe('backend-unavailable');
  });

  it('registers once per uid+token+binding; concurrent calls share one request', async () => {
    const r = fakeRegistrar();
    const m = createRegistrationManager({ registrar: r, platform: 'ios', sleep: noSleep });
    const [a, b] = await Promise.all([m.sync('u1', 'tok', 'b1'), m.sync('u1', 'tok', 'b1')]);
    expect([a, b]).toEqual(['registered', 'registered']);
    await m.sync('u1', 'tok', 'b1');
    expect(r.register).toHaveBeenCalledTimes(1);
    expect(r.register).toHaveBeenCalledWith('tok', 'ios', 'b1');
  });

  it('renews the lease after RENEW_AFTER_MS', async () => {
    const r = fakeRegistrar();
    let now = 0;
    const m = createRegistrationManager({ registrar: r, platform: 'ios', sleep: noSleep, clock: () => now, renewAfterMs: 1000 });
    await m.sync('u1', 'tok', 'b1');
    expect(m.needsRenewal()).toBe(false);
    now = 1000;
    expect(m.needsRenewal()).toBe(true);
    await m.sync('u1', 'tok', 'b1');
    expect(r.register).toHaveBeenCalledTimes(2);
  });

  it('server delivery off / credential error map to honest states', async () => {
    const r = fakeRegistrar();
    r.register.mockResolvedValueOnce({ deliveryEnabled: false, providerStatus: 'unverified' });
    const m = createRegistrationManager({ registrar: r, platform: 'android', sleep: noSleep });
    await expect(m.sync('u1', 'tok', 'b1')).resolves.toBe('registered-delivery-off');
    expect(m.updateServerStatus({ deliveryEnabled: true, providerStatus: 'credential-error' })).toBe('registered-config-error');
  });

  it('retries transient failures a bounded number of times, then fails', async () => {
    const r = fakeRegistrar();
    r.register.mockRejectedValue(transient());
    const sleep = jest.fn((_ms: number) => Promise.resolve());
    const m = createRegistrationManager({ registrar: r, platform: 'android', sleep, maxAttempts: 3, baseDelayMs: 100 });
    await expect(m.sync('u1', 'tok', 'b1')).resolves.toBe('failed');
    expect(r.register).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
  });

  it('does not retry non-transient failures', async () => {
    const r = fakeRegistrar();
    r.register.mockRejectedValue(fatal());
    const m = createRegistrationManager({ registrar: r, platform: 'android', sleep: noSleep });
    await expect(m.sync('u1', 'tok', 'b1')).resolves.toBe('failed');
    expect(r.register).toHaveBeenCalledTimes(1);
  });

  it('a server "binding revoked" answer (late request after sign-out) is a quiet cancel, never retried', async () => {
    const r = fakeRegistrar();
    r.register.mockRejectedValue(new ApiRequestError('revoked', { status: 409, code: 'PUSH_BINDING_REVOKED', category: 'conflict' }));
    const m = createRegistrationManager({ registrar: r, platform: 'android', sleep: noSleep });
    await expect(m.sync('u1', 'tok', 'b1')).resolves.toBe('cancelled');
    expect(r.register).toHaveBeenCalledTimes(1);
    expect(m.isRegistered()).toBe(false);
  });

  it('account switch mid-flight: the late result is never recorded for the old account', async () => {
    const r = fakeRegistrar();
    let release!: (v: unknown) => void;
    r.register.mockImplementationOnce(() => new Promise((res) => (release = res)));
    const m = createRegistrationManager({ registrar: r, platform: 'android', sleep: noSleep });
    const first = m.sync('userA', 'tok', 'bA');
    m.reset(); // userA's binding ended
    const second = m.sync('userB', 'tok', 'bB');
    release(ON);
    await expect(first).resolves.toBe('cancelled');
    await expect(second).resolves.toBe('registered');
    expect(m.registeredUid()).toBe('userB');
  });
});

describe('acquireToken', () => {
  const err = (kind: string) => Object.assign(new Error(kind), { kind });

  it('returns the token / retries offline a bounded number of times / never retries config errors', async () => {
    await expect(acquireToken(() => Promise.resolve('tok'))).resolves.toEqual({ ok: true, token: 'tok' });
    const offline = jest.fn(() => Promise.reject(err('offline')));
    await expect(acquireToken(offline, { sleep: noSleep, maxAttempts: 3 })).resolves.toEqual({ ok: false, failure: 'offline' });
    expect(offline).toHaveBeenCalledTimes(3);
    const config = jest.fn(() => Promise.reject(err('missing-configuration')));
    await expect(acquireToken(config, { sleep: noSleep })).resolves.toEqual({ ok: false, failure: 'missing-configuration' });
    expect(config).toHaveBeenCalledTimes(1);
  });

  it('recovers on a later attempt and stops when cancelled', async () => {
    const get = jest.fn().mockRejectedValueOnce(err('error')).mockResolvedValueOnce('tok');
    await expect(acquireToken(get, { sleep: noSleep })).resolves.toEqual({ ok: true, token: 'tok' });
    const never = jest.fn(() => Promise.resolve('tok'));
    await expect(acquireToken(never, { isCancelled: () => true })).resolves.toEqual({ ok: false, failure: 'error' });
    expect(never).not.toHaveBeenCalled();
  });
});
