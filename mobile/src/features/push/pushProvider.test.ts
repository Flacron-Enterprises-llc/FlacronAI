// The native push stack is mocked at its module boundary. These tests cover this app's own
// mapping/classification logic only — they say nothing about real device delivery.
import { Platform } from 'react-native';
import * as push from './pushProvider';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  clearLastNotificationResponseAsync: jest.fn(() => Promise.resolve()),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  setNotificationHandler: jest.fn(),
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  AndroidImportance: { DEFAULT: 5 },
  AndroidNotificationVisibility: { PRIVATE: 2 },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
}));
jest.mock('expo-device', () => ({ __esModule: true, isDevice: true }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'standalone', expoConfig: null, easConfig: null },
  ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
}));


const mockNotifications = jest.requireMock('expo-notifications');
const mockDevice: { isDevice: boolean } = jest.requireMock('expo-device');
const mockConstants: { executionEnvironment: string; expoConfig: unknown } = jest.requireMock('expo-constants').default;

const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { value: os, configurable: true });

beforeEach(() => {
  jest.clearAllMocks();
  setOS('android');
  mockDevice.isDevice = true;
  mockConstants.executionEnvironment = 'standalone';
  mockConstants.expoConfig = { extra: { eas: { projectId: 'proj-1' } } };
});

describe('getPushSupport', () => {
  it('supported on a physical device in a native build', () => {
    expect(push.getPushSupport()).toBe('supported');
  });

  it.each([
    ['web', () => setOS('web')],
    ['a simulator/emulator', () => (mockDevice.isDevice = false)],
    ['Expo Go', () => (mockConstants.executionEnvironment = 'storeClient')],
  ])('unsupported on %s', (_label, arrange) => {
    arrange();
    expect(push.getPushSupport()).toBe('unsupported-environment');
  });

  it('missing configuration without an EAS project id', () => {
    mockConstants.expoConfig = { extra: {} };
    expect(push.getPushSupport()).toBe('missing-configuration');
  });
});

describe('permission mapping', () => {
  it.each([
    [{ status: 'granted', granted: true, canAskAgain: true }, { state: 'granted', canAskAgain: true }],
    [{ status: 'denied', granted: false, canAskAgain: true }, { state: 'denied', canAskAgain: true }],
    [{ status: 'denied', granted: false, canAskAgain: false }, { state: 'denied', canAskAgain: false }],
    [{ status: 'undetermined', granted: false, canAskAgain: true }, { state: 'undetermined', canAskAgain: true }],
    [
      { status: 'undetermined', granted: false, canAskAgain: true, ios: { status: 3 } },
      { state: 'granted', canAskAgain: true },
    ],
  ])('%j → %j', async (raw, expected) => {
    mockNotifications.getPermissionsAsync.mockResolvedValue(raw);
    await expect(push.getPermission()).resolves.toEqual(expected);
  });

  it('requests alert/badge/sound only', async () => {
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true });
    await push.requestPermission();
    expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalledWith({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
  });
});

describe('ensureAndroidChannel', () => {
  it('creates the private-on-lock-screen channel on Android only', async () => {
    await push.ensureAndroidChannel();
    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      push.ANDROID_CHANNEL_ID,
      expect.objectContaining({ lockscreenVisibility: 2 })
    );
    setOS('ios');
    mockNotifications.setNotificationChannelAsync.mockClear();
    await push.ensureAndroidChannel();
    expect(mockNotifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });
});

describe('getPushToken', () => {
  it('passes the EAS project id and returns the token', async () => {
    mockNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[x]' });
    await expect(push.getPushToken()).resolves.toBe('ExponentPushToken[x]');
    expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'proj-1' });
  });

  it.each([
    ['Network request failed', 'offline'],
    ['Default FirebaseApp is not initialized', 'missing-configuration'],
    ['no valid "aps-environment" entitlement', 'missing-configuration'],
    ['Something odd', 'error'],
  ])('classifies "%s" as %s', async (message, kind) => {
    mockNotifications.getExpoPushTokenAsync.mockRejectedValue(new Error(message));
    await expect(push.getPushToken()).rejects.toMatchObject({ kind });
  });

  it('missing project id fails fast without calling the provider', async () => {
    mockConstants.expoConfig = {};
    await expect(push.getPushToken()).rejects.toMatchObject({ kind: 'missing-configuration' });
    expect(mockNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('error messages never carry the provider text', async () => {
    mockNotifications.getExpoPushTokenAsync.mockRejectedValue(new Error('secret-detail-123'));
    await expect(push.getPushToken()).rejects.not.toThrow(/secret-detail/);
  });
});

describe('takeLaunchTap', () => {
  const response = (actionIdentifier: string) => ({
    actionIdentifier,
    notification: { request: { identifier: 'n1', content: { data: { type: 'report_completed', reportId: 'r1' } } } },
  });

  it('returns and clears a default-action launch tap', async () => {
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(response(mockNotifications.DEFAULT_ACTION_IDENTIFIER));
    await expect(push.takeLaunchTap()).resolves.toEqual({ id: 'n1', data: { type: 'report_completed', reportId: 'r1' } });
    expect(mockNotifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
  });

  it('ignores non-default actions and an empty launch', async () => {
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(response('some.other.action'));
    await expect(push.takeLaunchTap()).resolves.toBeNull();
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(null);
    await expect(push.takeLaunchTap()).resolves.toBeNull();
  });
});
