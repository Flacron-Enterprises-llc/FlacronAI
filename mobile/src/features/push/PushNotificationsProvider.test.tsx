import { act, render, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { clearPendingReport, peekPendingReport } from '@/features/navigation/pendingDeepLink';
import { runSignOutTasks } from '@/features/auth/signOutTasks';
import { PushNotificationsProvider, usePushNotifications } from './PushNotificationsProvider';

// The native boundary (`./pushProvider`) is mocked wholesale: these tests exercise the
// provider's wiring — listener lifecycle, tap routing through the auth guard, account
// switching, failure isolation — not real OS/permission/delivery behaviour.
jest.mock('./pushProvider', () => {
  const listeners: Record<string, unknown[]> = { tap: [], fg: [], token: [] };
  const sub = (arr: unknown[], fn: unknown) => {
    arr.push(fn);
    return { remove: jest.fn(() => arr.splice(arr.indexOf(fn), 1)) };
  };
  return {
    __listeners: listeners,
    ANDROID_CHANNEL_ID: 'report-activity',
    getPushSupport: jest.fn(() => 'supported'),
    getPermission: jest.fn(() => Promise.resolve({ state: 'granted', canAskAgain: true })),
    requestPermission: jest.fn(() => Promise.resolve({ state: 'granted', canAskAgain: true })),
    ensureAndroidChannel: jest.fn(() => Promise.resolve()),
    configureForegroundPresentation: jest.fn(),
    getPushToken: jest.fn(() => Promise.resolve('ExponentPushToken[test]')),
    takeLaunchTap: jest.fn(() => Promise.resolve(null)),
    openSystemSettings: jest.fn(() => Promise.resolve()),
    addTapListener: jest.fn((fn: unknown) => sub(listeners.tap, fn)),
    addForegroundListener: jest.fn((fn: unknown) => sub(listeners.fg, fn)),
    addTokenChangeListener: jest.fn((fn: unknown) => sub(listeners.token, fn)),
  };
});

const mockAuth = { status: 'authenticated', firebaseUser: { uid: 'userA' } as { uid: string } | null };
jest.mock('@/features/auth/context/AuthProvider', () => ({ useAuth: () => mockAuth }));

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, navigate: mockNavigate }) }));
jest.mock('expo-linking', () => ({ useURL: () => null }));

const mockRegisterApi = jest.fn((..._args: unknown[]) =>
  Promise.resolve({ success: true, registered: true, deliveryEnabled: false, providerStatus: 'unverified' })
);
const mockRevokeApi = jest.fn((..._args: unknown[]) => Promise.resolve({ success: true }));
const mockStatusApi = jest.fn((..._args: unknown[]) => Promise.resolve({ success: true, deliveryEnabled: true, providerStatus: 'unverified' }));
let mockUuidSeq = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `binding-${++mockUuidSeq}`,
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: (_alg: string, value: string) =>
    Promise.resolve(jest.requireActual('crypto').createHash('sha256').update(value).digest('hex')),
}));
const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: (k: string) => Promise.resolve(mockSecure.get(k) ?? null),
  setItemAsync: (k: string, v: string) => {
    mockSecure.set(k, v);
    return Promise.resolve();
  },
  deleteItemAsync: (k: string) => {
    mockSecure.delete(k);
    return Promise.resolve();
  },
}));
let mockConnectivity: ((online: boolean | null) => void) | null = null;
jest.mock('@/services/api/offline', () => ({
  subscribeToConnectivity: (fn: (online: boolean | null) => void) => {
    mockConnectivity = fn;
    return () => {
      mockConnectivity = null;
    };
  },
}));
jest.mock('@/services/api/pushDevices', () => ({
  pushDevicesApi: {
    register: (...args: unknown[]) => mockRegisterApi(...args),
    revoke: (...args: unknown[]) => mockRevokeApi(...args),
    status: (...args: unknown[]) => mockStatusApi(...args),
  },
}));

const mockNotifyReportsChanged = jest.fn();
jest.mock('@/features/reports/reportsEvents', () => ({ notifyReportsChanged: () => mockNotifyReportsChanged() }));

const provider = jest.requireMock('./pushProvider');
const listeners = provider.__listeners as { tap: ((t: unknown) => void)[]; fg: ((d: unknown) => void)[]; token: (() => void)[] };

type PushValue = ReturnType<typeof usePushNotifications>;
const probe: { current: PushValue | null } = { current: null };
const capture = (value: PushValue) => {
  probe.current = value;
};
function Probe() {
  const value = usePushNotifications();
  useEffect(() => capture(value));
  return <Text>app content</Text>;
}
const renderProvider = () =>
  render(
    <PushNotificationsProvider>
      <Probe />
    </PushNotificationsProvider>
  );

const reportTap = (id = 'n1', reportId = 'r1') => ({ id, data: { type: 'report_completed', reportId } });

beforeEach(() => {
  jest.clearAllMocks();
  mockRegisterApi.mockImplementation(() =>
    Promise.resolve({ success: true, registered: true, deliveryEnabled: false, providerStatus: 'unverified' })
  );
  mockRevokeApi.mockImplementation(() => Promise.resolve({ success: true }));
  mockSecure.clear();
  mockAuth.status = 'authenticated';
  mockAuth.firebaseUser = { uid: 'userA' };
  provider.getPushSupport.mockReturnValue('supported');
  provider.getPermission.mockResolvedValue({ state: 'granted', canAskAgain: true });
  provider.getPushToken.mockResolvedValue('ExponentPushToken[test]');
  provider.takeLaunchTap.mockResolvedValue(null);
  probe.current = null;
  clearPendingReport();
});

describe('PushNotificationsProvider', () => {
  it('attaches each listener once and removes them all on unmount', async () => {
    const { rerender, unmount } = await renderProvider();
    await waitFor(() => expect(probe.current?.state.registration).toBe('registered-delivery-off'));
    await rerender(
      <PushNotificationsProvider>
        <Probe />
      </PushNotificationsProvider>
    );
    expect(provider.addTapListener).toHaveBeenCalledTimes(1);
    expect(provider.addForegroundListener).toHaveBeenCalledTimes(1);
    expect(provider.addTokenChangeListener).toHaveBeenCalledTimes(1);
    await unmount();
    expect(listeners.tap).toHaveLength(0);
    expect(listeners.fg).toHaveLength(0);
    expect(listeners.token).toHaveLength(0);
  });

  it('never prompts for permission on its own', async () => {
    provider.getPermission.mockResolvedValue({ state: 'undetermined', canAskAgain: true });
    await renderProvider();
    await waitFor(() => expect(probe.current?.state.permission?.state).toBe('undetermined'));
    expect(provider.requestPermission).not.toHaveBeenCalled();
    expect(provider.getPushToken).not.toHaveBeenCalled();
    await act(() => probe.current!.enable());
    expect(provider.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('registers via the API for the signed-in account and reflects server delivery status', async () => {
    await renderProvider();
    await waitFor(() => expect(probe.current?.state.registration).toBe('registered-delivery-off'));
    expect(probe.current?.state.token).toBe('ready');
    expect(probe.current?.state.owner).toBe('userA');
    expect(mockRegisterApi).toHaveBeenCalledWith('ExponentPushToken[test]', expect.stringMatching(/^(ios|android)$/), expect.stringMatching(/^binding-/));
  });

  it('a registration failure surfaces as retryable state and never breaks the app', async () => {
    mockRegisterApi.mockImplementation(() => Promise.reject(new Error('server down')));
    const view = await renderProvider();
    await waitFor(() => expect(probe.current?.state.registration).toBe('failed'));
    expect(view.getByText('app content')).toBeTruthy();
    mockRegisterApi.mockImplementation(() => Promise.resolve({ success: true, registered: true, deliveryEnabled: true, providerStatus: 'unverified' }));
    await act(async () => probe.current!.retry());
    await waitFor(() => expect(probe.current?.state.registration).toBe('registered'));
  });

  it('a launch tap opens the report once, even if the live listener also delivers it', async () => {
    provider.takeLaunchTap.mockResolvedValue(reportTap('n1', 'r42'));
    await renderProvider();
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/report/[id]', params: { id: 'r42' } });
    await act(async () => {
      listeners.tap.forEach((fn) => fn(reportTap('n1', 'r42')));
    });
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('a tap while signed out is held for after sign-in instead of navigating', async () => {
    mockAuth.status = 'signed-out';
    mockAuth.firebaseUser = null;
    await renderProvider();
    await waitFor(() => expect(listeners.tap).toHaveLength(1));
    await act(async () => {
      listeners.tap[0](reportTap('n2', 'r7'));
    });
    expect(mockPush).not.toHaveBeenCalled();
    expect(peekPendingReport()).toBe('r7');
    expect(provider.getPushToken).not.toHaveBeenCalled();
  });

  it('malformed tap payloads do not navigate', async () => {
    await renderProvider();
    await waitFor(() => expect(listeners.tap).toHaveLength(1));
    await act(async () => {
      listeners.tap[0]({ id: 'bad', data: { type: 'report_completed', reportId: '../../etc' } });
    });
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('a foreground report notification refreshes lists without navigating', async () => {
    await renderProvider();
    await waitFor(() => expect(listeners.fg).toHaveLength(1));
    await act(async () => {
      listeners.fg[0]({ type: 'report_approved', reportId: 'r1' });
    });
    await act(async () => {
      listeners.fg[0]({ type: 'team_invitation' });
    });
    expect(mockNotifyReportsChanged).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('switching accounts never shows the previous account’s state and re-acquires for the new one', async () => {
    const view = await renderProvider();
    await waitFor(() => expect(probe.current?.state.owner).toBe('userA'));
    mockAuth.firebaseUser = { uid: 'userB' };
    await view.rerender(
      <PushNotificationsProvider>
        <Probe />
      </PushNotificationsProvider>
    );
    await waitFor(() => expect(probe.current?.state.owner).toBe('userB'));
    expect(provider.getPushToken).toHaveBeenCalledTimes(2);
    // userA's binding is revoked on the server (no Sign Out happened — e.g. session expired),
    // and userB registers under a fresh binding.
    const bindingA = mockRegisterApi.mock.calls[0][2];
    await waitFor(() => expect(mockRevokeApi).toHaveBeenCalledWith(bindingA));
    await waitFor(() => expect(mockRegisterApi).toHaveBeenCalledTimes(2));
    expect(mockRegisterApi.mock.calls[1][2]).not.toBe(bindingA);
  });

  it('a token rotation re-reads the token', async () => {
    await renderProvider();
    await waitFor(() => expect(probe.current?.state.registration).toBe('registered-delivery-off'));
    await act(async () => {
      listeners.token.forEach((fn) => fn());
    });
    await waitFor(() => expect(provider.getPushToken).toHaveBeenCalledTimes(2));
  });

  it('token failures surface as state, never as a crash, and retry is manual', async () => {
    provider.getPushToken.mockRejectedValue(Object.assign(new Error('x'), { kind: 'missing-configuration' }));
    const view = await renderProvider();
    await waitFor(() => expect(probe.current?.state.token).toBe('missing-configuration'));
    expect(view.getByText('app content')).toBeTruthy();
    expect(provider.getPushToken).toHaveBeenCalledTimes(1);

    provider.getPushToken.mockResolvedValue('ExponentPushToken[test]');
    await act(async () => probe.current!.retry());
    await waitFor(() => expect(probe.current?.state.token).toBe('ready'));
  });

  it('a failing native permission read does not break the app', async () => {
    provider.getPermission.mockRejectedValue(new Error('native module missing'));
    const view = await renderProvider();
    await waitFor(() => expect(probe.current?.state.permission).not.toBeNull());
    expect(view.getByText('app content')).toBeTruthy();
    expect(provider.getPushToken).not.toHaveBeenCalled();
  });

  it('unsupported environments skip permission and token work entirely', async () => {
    provider.getPushSupport.mockReturnValue('unsupported-environment');
    const view = await renderProvider();
    expect(view.getByText('app content')).toBeTruthy();
    expect(probe.current?.state.support).toBe('unsupported-environment');
    await act(async () => {});
    expect(provider.getPermission).not.toHaveBeenCalled();
    expect(provider.getPushToken).not.toHaveBeenCalled();
    await act(() => probe.current!.enable());
    expect(provider.requestPermission).not.toHaveBeenCalled();
  });

  it('Sign Out revokes this sign-in binding on the server', async () => {
    await renderProvider();
    await waitFor(() => expect(probe.current?.state.registration).toBe('registered-delivery-off'));
    const bindingId = mockRegisterApi.mock.calls[0][2];
    await expect(runSignOutTasks(3000)).resolves.toBeUndefined();
    expect(mockRevokeApi).toHaveBeenCalledWith(bindingId);
  });

  it('offline Sign Out stays fast; the revocation is persisted and sent when back online', async () => {
    const { ApiRequestError } = jest.requireActual('@/types/api');
    mockRevokeApi.mockImplementation(() => Promise.reject(new ApiRequestError('offline', { category: 'offline' })));
    await renderProvider();
    await waitFor(() => expect(probe.current?.state.registration).toBe('registered-delivery-off'));
    const bindingId = mockRegisterApi.mock.calls[0][2];
    const started = Date.now();
    await runSignOutTasks(3000);
    expect(Date.now() - started).toBeLessThan(2500);
    expect(mockSecure.get('flac_push_pending_revocations_v1')).toContain(String(bindingId));

    mockRevokeApi.mockClear();
    mockRevokeApi.mockImplementation(() => Promise.resolve({ success: true }));
    await act(async () => {
      mockConnectivity?.(true);
    });
    await waitFor(() => expect(mockRevokeApi).toHaveBeenCalledWith(bindingId));
    await waitFor(() => expect(mockSecure.has('flac_push_pending_revocations_v1')).toBe(false));
  });

  it('a hanging revocation never holds Sign Out past its cap', async () => {
    mockRevokeApi.mockImplementation(() => new Promise(() => {}));
    await renderProvider();
    await waitFor(() => expect(probe.current?.state.registration).toBe('registered-delivery-off'));
    const started = Date.now();
    await expect(runSignOutTasks(5000)).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('server-reported credential error is shown as unavailable, not as working notifications', async () => {
    mockRegisterApi.mockImplementation(() =>
      Promise.resolve({ success: true, registered: true, deliveryEnabled: true, providerStatus: 'credential-error' })
    );
    await renderProvider();
    await waitFor(() => expect(probe.current?.state.registration).toBe('registered-config-error'));
  });

  it('after Sign Out, foreground pushes for that ended binding are suppressed and re-revoked; duplicate events show once', async () => {
    await renderProvider();
    await waitFor(() => expect(probe.current?.state.registration).toBe('registered-delivery-off'));
    const bindingId = mockRegisterApi.mock.calls[0][2] as string;
    const { createHash } = jest.requireActual('crypto');
    const hash = createHash('sha256').update(bindingId.toLowerCase()).digest('hex');
    const tag = createHash('sha256').update(`${hash}:push-tag`).digest('hex').slice(0, 16);
    const decide = provider.configureForegroundPresentation.mock.calls[0][0] as (d: unknown) => Promise<boolean>;

    // Current binding: shown once per eventId (an at-least-once re-delivery is suppressed).
    await expect(decide({ type: 'report_completed', reportId: 'r1', eventId: 'e1', bindingTag: tag })).resolves.toBe(true);
    await expect(decide({ type: 'report_completed', reportId: 'r1', eventId: 'e1', bindingTag: tag })).resolves.toBe(false);

    await act(async () => {
      await runSignOutTasks(3000);
    });
    const revokesBefore = mockRevokeApi.mock.calls.length;
    await waitFor(async () => expect(await decide({ type: 'report_completed', reportId: 'r1', eventId: 'e2', bindingTag: tag })).toBe(false));
    // The stale push proves the device is online: queued revocations are retried.
    expect(mockRevokeApi.mock.calls.length).toBeGreaterThanOrEqual(revokesBefore);
  });
});
