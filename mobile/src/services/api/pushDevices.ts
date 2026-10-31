/**
 * Typed wrappers for the push device-binding endpoints (`backend/routes/notifications.js`,
 * Mobile Phase 6). The account is always the signed-in session's — no uid is ever sent.
 *
 * - `register` binds this device's Expo token to the account for this sign-in (`bindingId` is a
 *   random UUID the app creates per sign-in; the server stores only its hash).
 * - `revoke` ends a binding by its `bindingId` WITHOUT authentication (possession of the random
 *   id is the proof), so it also works after a local sign-out, including one done offline.
 * - `status` reports only server facts: whether pushes are being sent at all, and whether the
 *   provider recently reported a credential problem for this platform.
 *
 * None opt into the shared client's automatic retry: the push lifecycle owns its own bounded
 * retry, so retries never stack.
 */
import { apiRequest } from './client';

export type ProviderStatus = 'unverified' | 'credential-error';

export interface PushServerStatus {
  /** Whether the server currently sends pushes at all (`PUSH_NOTIFICATIONS_ENABLED`). */
  deliveryEnabled: boolean;
  /** Never proof of delivery: `unverified` is the best the server can say. */
  providerStatus: ProviderStatus;
}

export interface PushDeviceRegistration extends PushServerStatus {
  success: true;
  registered: true;
}

export const pushDevicesApi = {
  register: (token: string, platform: 'ios' | 'android', bindingId: string) =>
    apiRequest<PushDeviceRegistration>('/notifications/devices', {
      method: 'POST',
      body: { token, platform, bindingId },
      timeoutMs: 15000,
    }),

  revoke: (bindingId: string) =>
    apiRequest<{ success: true }>('/notifications/devices/revoke', {
      method: 'POST',
      body: { bindingId },
      skipAuth: true,
      timeoutMs: 5000,
    }),

  status: (platform: 'ios' | 'android') =>
    apiRequest<{ success: true } & PushServerStatus>('/notifications/push-status', {
      params: { platform },
      timeoutMs: 10000,
    }),
};
