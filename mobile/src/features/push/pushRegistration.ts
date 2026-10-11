/**
 * Push-token registration lifecycle on the device side.
 *
 * Backend contract (backend/routes/notifications.js, Mobile Phase 6): `POST
 * /notifications/devices {token, platform, bindingId}` → `{registered, deliveryEnabled,
 * providerStatus}`; `POST /notifications/devices/revoke {bindingId}` (no auth). The server
 * enforces the important guarantees — a revoked bindingId can never be registered again (so a
 * request still in flight at Sign Out can't resurrect the binding), a request from an older
 * session can't take a device back from a newer one, and every binding has a renewable lease.
 * See backend/utils/pushDeviceStore.js. Adapter: `services/api/pushDevices.ts`.
 *
 * Rules enforced here:
 * - A token is registered for the uid + bindingId current when the sync started; a sign-out or
 *   account switch bumps a generation counter so a late result is never recorded locally.
 * - The same uid+token+binding is registered at most once per RENEW_AFTER_MS (lease renewal).
 * - Retries are bounded (`maxAttempts`) and only for transient failures; no loops.
 * - Tokens are kept in memory only and never logged.
 */
import { ApiRequestError } from '@/types/api';
import { pushDevicesApi, type ProviderStatus } from '@/services/api/pushDevices';

export interface RegistrationResult {
  deliveryEnabled: boolean;
  providerStatus: ProviderStatus;
}

export interface PushTokenRegistrar {
  register(token: string, platform: 'ios' | 'android', bindingId: string): Promise<RegistrationResult>;
  revoke(bindingId: string): Promise<void>;
}

/** The confirmed backend contract — see file header. */
export const backendPushRegistrar: PushTokenRegistrar = {
  register: async (token, platform, bindingId) => {
    const res = await pushDevicesApi.register(token, platform, bindingId);
    return toResult(res);
  },
  revoke: async (bindingId) => {
    await pushDevicesApi.revoke(bindingId);
  },
};

export function toResult(res: Partial<RegistrationResult> | null | undefined): RegistrationResult {
  return {
    deliveryEnabled: res?.deliveryEnabled === true,
    providerStatus: res?.providerStatus === 'credential-error' ? 'credential-error' : 'unverified',
  };
}

/**
 * - `registered`: linked to the account and the server is sending (still not proof of delivery);
 * - `registered-delivery-off`: linked, but the server isn't sending pushes;
 * - `registered-config-error`: linked, but the provider recently reported a credential problem
 *   for this platform, so delivery is currently unavailable.
 */
export type RegistrationState =
  | 'idle'
  | 'registering'
  | 'registered'
  | 'registered-delivery-off'
  | 'registered-config-error'
  | 'backend-unavailable'
  | 'failed'
  | 'cancelled';

export function stateFor(result: RegistrationResult): RegistrationState {
  if (!result.deliveryEnabled) return 'registered-delivery-off';
  return result.providerStatus === 'credential-error' ? 'registered-config-error' : 'registered';
}

/** Lease renewal cadence (on launch/foreground) — well inside the server's lease (default 7
 * days, configurable 1–14). */
export const RENEW_AFTER_MS = 12 * 60 * 60 * 1000;

export interface RegistrationManagerOptions {
  registrar: PushTokenRegistrar | null;
  platform: 'ios' | 'android';
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  renewAfterMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function isRetryableRegistrationError(err: unknown): boolean {
  if (err instanceof ApiRequestError) {
    return ['offline', 'timeout', 'rate_limited', 'transient_server'].includes(err.category);
  }
  return false;
}

/** The server refused because this binding was already signed out (409 PUSH_BINDING_REVOKED). */
function isRevoked(err: unknown): boolean {
  return err instanceof ApiRequestError && err.code === 'PUSH_BINDING_REVOKED';
}

interface Registered {
  uid: string;
  token: string;
  bindingId: string;
  at: number;
  result: RegistrationResult;
}

export function createRegistrationManager({
  registrar,
  platform,
  maxAttempts = 3,
  baseDelayMs = 2000,
  sleep = defaultSleep,
  clock = () => Date.now(),
  renewAfterMs = RENEW_AFTER_MS,
}: RegistrationManagerOptions) {
  let generation = 0;
  let registered: Registered | null = null;
  let inFlight: { key: string; promise: Promise<RegistrationState> } | null = null;

  const keyOf = (uid: string, token: string, bindingId: string) => `${uid}\n${token}\n${bindingId}`;

  async function attempt(uid: string, token: string, bindingId: string, gen: number): Promise<RegistrationState> {
    if (!registrar) return 'backend-unavailable';
    for (let i = 1; i <= maxAttempts; i += 1) {
      if (gen !== generation) return 'cancelled';
      try {
        const result = toResult(await registrar.register(token, platform, bindingId));
        // Cancelled while in flight: the server may have accepted it, but the binding was (or
        // will be) revoked by id, and the server rejects/removes it — never recorded here.
        if (gen !== generation) return 'cancelled';
        registered = { uid, token, bindingId, at: clock(), result };
        return stateFor(result);
      } catch (err) {
        if (isRevoked(err)) return 'cancelled';
        if (!isRetryableRegistrationError(err) || i === maxAttempts) return 'failed';
        await sleep(baseDelayMs * 2 ** (i - 1));
      }
    }
    return 'failed';
  }

  return {
    /** Registers (or renews) `token` for `uid` under `bindingId`. Concurrent calls share one attempt. */
    sync(uid: string, token: string, bindingId: string): Promise<RegistrationState> {
      if (!registrar) return Promise.resolve('backend-unavailable');
      const key = keyOf(uid, token, bindingId);
      if (registered && keyOf(registered.uid, registered.token, registered.bindingId) === key && clock() - registered.at < renewAfterMs) {
        return Promise.resolve(stateFor(registered.result));
      }
      if (inFlight && inFlight.key === key) return inFlight.promise;
      generation += 1;
      const gen = generation;
      const promise = attempt(uid, token, bindingId, gen).finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
      });
      inFlight = { key, promise };
      return promise;
    },

    /** Server-reported status changed (e.g. `GET /push-status`) — keep the cached result in step. */
    updateServerStatus(result: RegistrationResult): RegistrationState | null {
      if (!registered) return null;
      registered = { ...registered, result };
      return stateFor(result);
    },

    needsRenewal(): boolean {
      return !!registered && clock() - registered.at >= renewAfterMs;
    },

    isRegistered(): boolean {
      return registered !== null;
    },

    /** Forget everything locally and cancel in-flight work. Server-side cleanup is done by
     * revoking the binding id (see pushRevocationQueue.ts), never by this call. */
    reset(): void {
      generation += 1;
      inFlight = null;
      registered = null;
    },

    /** Test/diagnostic view — the uid only, never the token. */
    registeredUid(): string | null {
      return registered?.uid ?? null;
    },
  };
}

export type RegistrationManager = ReturnType<typeof createRegistrationManager>;

export type TokenResult = { ok: true; token: string } | { ok: false; failure: 'offline' | 'missing-configuration' | 'error' };

/** Reads the push token with a small bounded retry for transient failures (offline / provider
 * hiccup). A configuration failure is never retried — it won't fix itself at runtime. */
export async function acquireToken(
  getToken: () => Promise<string>,
  {
    maxAttempts = 3,
    baseDelayMs = 1500,
    sleep = defaultSleep,
    isCancelled = () => false,
  }: {
    maxAttempts?: number;
    baseDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
    isCancelled?: () => boolean;
  } = {}
): Promise<TokenResult> {
  let failure: 'offline' | 'missing-configuration' | 'error' = 'error';
  for (let i = 1; i <= maxAttempts; i += 1) {
    if (isCancelled()) break;
    try {
      return { ok: true, token: await getToken() };
    } catch (err) {
      const kind = (err as { kind?: unknown })?.kind;
      failure = kind === 'offline' || kind === 'missing-configuration' ? kind : 'error';
      if (failure === 'missing-configuration' || i === maxAttempts) break;
      await sleep(baseDelayMs * 2 ** (i - 1));
    }
  }
  return { ok: false, failure };
}
