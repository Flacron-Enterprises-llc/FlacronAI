/**
 * The only module that touches the native push stack (`expo-notifications`, `expo-device`,
 * `expo-constants`). Everything else in `features/push` talks to this boundary, so swapping the
 * provider (e.g. direct FCM/APNs instead of Expo's push service) means replacing this file only,
 * and tests mock exactly this surface.
 *
 * Provider: Expo push service (Expo push tokens via `getExpoPushTokenAsync`), the documented
 * recommendation in MOBILE_DEVELOPMENT_PHASES.md §3 Phase 6 — see §5 for the assumption record.
 *
 * Nothing here logs tokens or notification content.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

/** Android channel every FlacronAI push is posted to. The backend sender must use this
 * `channelId`; it is also the config plugin's `defaultChannel` (app.config.ts). */
export const ANDROID_CHANNEL_ID = 'report-activity';

export type PushSupport = 'supported' | 'unsupported-environment' | 'missing-configuration';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface PermissionSnapshot {
  state: PermissionState;
  /** False once the OS will no longer show its prompt (iOS after one answer; Android after the
   * second denial) — the only way forward is the system settings screen. */
  canAskAgain: boolean;
}

export type TokenFailure = 'offline' | 'missing-configuration' | 'error';

export class PushTokenError extends Error {
  constructor(public readonly kind: TokenFailure) {
    super(`push token unavailable: ${kind}`);
    this.name = 'PushTokenError';
  }
}

export function getEasProjectId(): string | null {
  const id = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** Remote push needs a native build on a physical device. Web, simulators/emulators and Expo Go
 * (remote push removed from Expo Go on Android since SDK 53) can't receive it. */
export function getPushSupport(): PushSupport {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'unsupported-environment';
  if (!Device.isDevice) return 'unsupported-environment';
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return 'unsupported-environment';
  if (!getEasProjectId()) return 'missing-configuration';
  return 'supported';
}

function toSnapshot(result: Notifications.NotificationPermissionsStatus): PermissionSnapshot {
  const iosStatus = result.ios?.status;
  const provisional =
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL || iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL;
  if (result.granted || result.status === 'granted' || provisional) return { state: 'granted', canAskAgain: true };
  if (result.status === 'denied') return { state: 'denied', canAskAgain: result.canAskAgain };
  return { state: 'undetermined', canAskAgain: result.canAskAgain !== false };
}

export async function getPermission(): Promise<PermissionSnapshot> {
  return toSnapshot(await Notifications.getPermissionsAsync());
}

/** Shows the OS prompt. Callers only invoke this from an explicit user action, after the
 * in-app explanation. */
export async function requestPermission(): Promise<PermissionSnapshot> {
  return toSnapshot(
    await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } })
  );
}

/** Android 13+ only shows the permission prompt once a channel exists, so this runs before any
 * request. Lock-screen visibility is PRIVATE: the content stays hidden on a locked screen. */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Report activity',
    description: 'Report generation, review and approval updates',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    showBadge: true,
  });
}

const OFFLINE_PATTERN = /network|offline|internet|timed? ?out|unreachable|ENOTFOUND|ECONN/i;
const CONFIG_PATTERN = /firebase|fcm|google-services|projectId|aps-environment|entitlement|credential|not configured/i;

/** Expo push token for this install. Never logged or persisted outside the registration
 * record. Errors are reduced to a category so no provider message (which may embed ids) leaks
 * into the UI. */
export async function getPushToken(): Promise<string> {
  const projectId = getEasProjectId();
  if (!projectId) throw new PushTokenError('missing-configuration');
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (typeof data !== 'string' || data.length === 0) throw new PushTokenError('error');
    return data;
  } catch (err) {
    if (err instanceof PushTokenError) throw err;
    const message = String((err as { message?: unknown })?.message ?? '');
    if (OFFLINE_PATTERN.test(message)) throw new PushTokenError('offline');
    if (CONFIG_PATTERN.test(message)) throw new PushTokenError('missing-configuration');
    throw new PushTokenError('error');
  }
}

/** Foreground presentation: show the banner + list entry, no sound, no badge change. */
/** `shouldPresent` decides per notification whether a foreground banner is shown (e.g. not
 * for a stale binding or an already-presented event). Defaults to always. Only affects the
 * app's foreground; background banners are drawn by the OS. */
export function configureForegroundPresentation(shouldPresent: (data: unknown) => Promise<boolean> = async () => true): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      let show = true;
      try {
        show = await shouldPresent(notification?.request?.content?.data ?? null);
      } catch {
        show = true;
      }
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: false, shouldSetBadge: false };
    },
  });
}

export interface NotificationTap {
  /** Unique per delivered notification — the duplicate-tap guard keys on it. */
  id: string;
  data: unknown;
}

function toTap(response: Notifications.NotificationResponse | null): NotificationTap | null {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  const request = response.notification?.request;
  if (!request?.identifier) return null;
  return { id: request.identifier, data: request.content?.data ?? null };
}

export interface Subscription {
  remove(): void;
}

export function addTapListener(onTap: (tap: NotificationTap) => void): Subscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const tap = toTap(response);
    if (tap) onTap(tap);
  });
}

export function addForegroundListener(onReceive: (data: unknown) => void): Subscription {
  return Notifications.addNotificationReceivedListener((notification) => onReceive(notification.request?.content?.data ?? null));
}

/** Fires when the OS rotates the underlying FCM/APNs token — the Expo token is then re-read. */
export function addTokenChangeListener(onChange: () => void): Subscription {
  return Notifications.addPushTokenListener(() => onChange());
}

/** The tap that launched the app from a killed state, if any — consumed once. */
export async function takeLaunchTap(): Promise<NotificationTap | null> {
  const tap = toTap(await Notifications.getLastNotificationResponseAsync());
  if (tap) await Notifications.clearLastNotificationResponseAsync().catch(() => {});
  return tap;
}

export async function openSystemSettings(): Promise<void> {
  await Linking.openSettings();
}
