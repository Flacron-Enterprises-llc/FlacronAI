/**
 * Phase 6 — push notifications. Mounted once inside the root navigator (app/_layout.tsx), below
 * AuthProvider, so it sees the auth status and can navigate.
 *
 * Owns: permission state (re-read whenever the app returns to the foreground, e.g. after the
 * user visits system settings), token acquisition for the signed-in account, the device
 * binding (a random `bindingId` per sign-in; registration via `pushRegistration.ts`), ending
 * that binding whenever the signed-in identity changes (Sign Out, expiry, account switch) via
 * the persistent `pushRevocationQueue.ts`, lease renewal + server-status refresh on
 * foreground, tap routing, and foreground handling. Every native/network call is guarded: a
 * push failure never blocks sign-in, sign-out or report work. Listeners are attached once per
 * mount and removed on unmount.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '@/features/auth/context/AuthProvider';
import { pushDevicesApi } from '@/services/api/pushDevices';
import { subscribeToConnectivity } from '@/services/api/offline';
import { registerSignOutTask } from '@/features/auth/signOutTasks';
import { notifyReportsChanged } from '@/features/reports/reportsEvents';
import { createTapRouter, type TapNavigator } from './notificationRouting';
import { computeBindingTag, isEndedTag, rememberEndedTag } from './endedBindingTags';
import { isReportNotificationType, readPushMeta } from './pushPayload';
import * as provider from './pushProvider';
import { acquireToken, backendPushRegistrar, createRegistrationManager, toResult } from './pushRegistration';
import { enqueueRevocation, flushRevocations } from './pushRevocationQueue';
import { INITIAL_PUSH_STATE, type PushState } from './pushStatus';

/** Device-level (not per-account) — the OS permission is device-level too. Holds no personal data. */
export const PRIMER_DISMISSED_KEY = 'flac_push_primer_dismissed_v1';
/** Sign Out waits at most this long for the server revocation; the queue retries later. */
export const SIGN_OUT_REVOKE_CAP_MS = 1500;
const STATUS_REFRESH_MS = 10 * 60 * 1000;
const PLATFORM: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const revokeOnServer = (bindingId: string) => backendPushRegistrar.revoke(bindingId);

interface PushContextValue {
  state: PushState;
  /** Shows the OS prompt — call only from an explicit user action after the explanation. */
  enable: () => Promise<void>;
  openSettings: () => Promise<void>;
  retry: () => void;
  primerDismissed: boolean;
  dismissPrimer: () => void;
}

function safeSupport(): PushState['support'] {
  try {
    return provider.getPushSupport();
  } catch {
    return 'unsupported-environment';
  }
}

const PushContext = createContext<PushContextValue | null>(null);

export function usePushNotifications(): PushContextValue {
  const ctx = useContext(PushContext);
  if (!ctx) throw new Error('usePushNotifications must be used inside PushNotificationsProvider');
  return ctx;
}

export function PushNotificationsProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const { status, firebaseUser } = useAuth();
  const uid = status === 'authenticated' ? (firebaseUser?.uid ?? null) : null;
  // The signed-in identity, regardless of transient auth states (profile refresh, MFA gate):
  // a binding ends only when this changes, not when `uid` briefly drops to null.
  const identityUid = firebaseUser?.uid ?? null;

  const [state, setState] = useState<PushState>(() => ({ ...INITIAL_PUSH_STATE, support: safeSupport() }));
  const [primerDismissed, setPrimerDismissed] = useState(true);
  const [tokenEpoch, setTokenEpoch] = useState(0);
  const patch = useCallback((next: Partial<PushState>) => setState((prev) => ({ ...prev, ...next })), []);

  const manager = useMemo(
    () => createRegistrationManager({ registrar: backendPushRegistrar, platform: PLATFORM }),
    []
  );
  const routeTap = useMemo(() => createTapRouter(), []);

  // Stale (ended-binding) pushes: retry the server revocation now — the device is evidently
  // online. Events already presented/handled are de-duplicated by the backend's eventId.
  const flushNow = useCallback(() => {
    flushRevocations(revokeOnServer).catch(() => {});
  }, []);
  const [presented] = useState(() => new Set<string>());
  const [refreshed] = useState(() => new Set<string>());
  const remember = (set: Set<string>, id: string) => {
    if (set.has(id)) return false;
    set.add(id);
    if (set.size > 100) set.delete(set.values().next().value as string);
    return true;
  };
  const shouldPresentForeground = useCallback(
    async (data: unknown) => {
      const { eventId, bindingTag } = readPushMeta(data);
      if (await isEndedTag(bindingTag)) {
        flushNow();
        return false;
      }
      return eventId ? remember(presented, eventId) : true;
    },
    [flushNow, presented]
  );

  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  const navigator = useRef<TapNavigator>({
    openReport: (id) => router.push({ pathname: '/report/[id]', params: { id } }),
    openDashboard: () => router.navigate('/dashboard'),
  });

  // Support check, Android channel, initial permission read, foreground presentation.
  useEffect(() => {
    let active = true;
    const support = state.support;
    AsyncStorage.getItem(PRIMER_DISMISSED_KEY)
      .then((v) => active && setPrimerDismissed(v === '1'))
      .catch(() => active && setPrimerDismissed(false));
    if (support !== 'supported') return () => {
      active = false;
    };
    (async () => {
      try {
        provider.configureForegroundPresentation(shouldPresentForeground);
        await provider.ensureAndroidChannel();
      } catch {
        // Presentation/channel setup is cosmetic relative to sign-in and reports.
      }
      try {
        const permission = await provider.getPermission();
        if (active) patch({ permission });
      } catch {
        if (active) patch({ permission: { state: 'undetermined', canAskAgain: false } });
      }
    })();
    return () => {
      active = false;
    };
    // Runs once: support is fixed for the life of the process.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-read permission whenever the app comes back to the foreground (system settings visit).
  useEffect(() => {
    if (state.support !== 'supported') return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      provider
        .getPermission()
        .then((permission) =>
          setState((prev) =>
            prev.permission?.state === permission.state && prev.permission?.canAskAgain === permission.canAskAgain
              ? prev
              : { ...prev, permission }
          )
        )
        .catch(() => {});
    });
    return () => sub.remove();
  }, [state.support]);

  // A tap on a push for an ended binding never navigates (nor is remembered for the next
  // sign-in); the revocation is retried right away.
  const routeTapChecked = useCallback(
    async (tap: provider.NotificationTap) => {
      let stale = false;
      try {
        stale = await isEndedTag(readPushMeta(tap.data).bindingTag);
      } catch {
        stale = false;
      }
      if (stale) flushNow();
      return routeTap(tap, statusRef.current, navigator.current, { stale });
    },
    [routeTap, flushNow]
  );

  // Taps (running app + cold launch), foreground receipt, token rotation. One set per mount.
  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    const subs: provider.Subscription[] = [];
    try {
      subs.push(provider.addTapListener((tap) => void routeTapChecked(tap)));
      subs.push(
        provider.addForegroundListener((data) => {
          // A report changed server-side — let list screens refresh on next focus. No auto-navigation.
          if (!(data && typeof data === 'object' && isReportNotificationType((data as { type?: unknown }).type))) return;
          const { eventId, bindingTag } = readPushMeta(data);
          isEndedTag(bindingTag)
            .then((stale) => {
              if (stale) return flushNow();
              if (!eventId || remember(refreshed, eventId)) notifyReportsChanged();
            })
            .catch(() => {});
        })
      );
      subs.push(provider.addTokenChangeListener(() => setTokenEpoch((n) => n + 1)));
    } catch {
      // Native module unavailable — taps simply won't route.
    }
    provider
      .takeLaunchTap()
      .then((tap) => tap && routeTapChecked(tap))
      .catch(() => {});
    return () => subs.forEach((s) => s.remove());
  }, [routeTapChecked, flushNow, refreshed]);

  // ── Device binding ──────────────────────────────────────────────────────────────────────
  // One random bindingId per sign-in on this device. Ending it = queue it persistently, then
  // try the (unauthenticated) server revocation within a short cap; anything left is retried
  // on next launch / when connectivity returns. The server rejects any later registration
  // carrying an ended bindingId, so an in-flight request can't resurrect it.
  const binding = useRef<{ uid: string; bindingId: string } | null>(null);
  const endedBindings = useRef(new Set<string>());

  const endBinding = useCallback(
    async (capMs: number) => {
      const current = binding.current;
      binding.current = null;
      manager.reset();
      if (!current || endedBindings.current.has(current.bindingId)) return;
      endedBindings.current.add(current.bindingId);
      try {
        await enqueueRevocation(current.bindingId);
        // Lets late pushes for this ended sign-in be recognised as stale (see endedBindingTags.ts).
        void computeBindingTag(current.bindingId)
          .then((tag) => rememberEndedTag(tag))
          .catch(() => {});
        await Promise.race([flushRevocations(revokeOnServer), wait(capMs)]);
      } catch {
        // Never blocks sign-out; the server lease bounds the binding regardless.
      }
    },
    [manager]
  );

  const bindingFor = useCallback(
    (forUid: string) => {
      if (binding.current && binding.current.uid !== forUid) void endBinding(SIGN_OUT_REVOKE_CAP_MS);
      if (!binding.current) binding.current = { uid: forUid, bindingId: Crypto.randomUUID() };
      return binding.current.bindingId;
    },
    [endBinding]
  );

  // Sign Out: end this sign-in's binding before Firebase sign-out (bounded, offline-safe).
  useEffect(() => registerSignOutTask(() => endBinding(SIGN_OUT_REVOKE_CAP_MS)), [endBinding]);

  // Identity change without (or after) Sign Out — session expiry, account switch: end the
  // previous identity's binding too. Idempotent with the sign-out task above.
  useEffect(() => {
    if (binding.current && binding.current.uid !== identityUid) void endBinding(SIGN_OUT_REVOKE_CAP_MS);
  }, [identityUid, endBinding]);

  // Retry queued revocations (e.g. an offline sign-out) at launch and when back online.
  useEffect(() => {
    const flush = () => {
      flushRevocations(revokeOnServer).catch(() => {});
    };
    flush();
    return subscribeToConnectivity((online) => {
      if (online) flush();
    });
  }, []);

  // Token + registration for the signed-in account, once permission is granted.
  const granted = state.support === 'supported' && state.permission?.state === 'granted';
  useEffect(() => {
    if (!granted || !uid) return;
    let cancelled = false;
    (async () => {
      patch({ token: 'fetching', registration: 'idle', owner: uid });
      const result = await acquireToken(provider.getPushToken, { isCancelled: () => cancelled });
      if (cancelled) return;
      if (!result.ok) {
        patch({ token: result.failure });
        return;
      }
      patch({ token: 'ready', registration: 'registering' });
      const registration = await manager.sync(uid, result.token, bindingFor(uid));
      if (!cancelled && registration !== 'cancelled') patch({ registration });
    })();
    return () => {
      cancelled = true;
    };
  }, [granted, uid, tokenEpoch, manager, patch, bindingFor]);

  // Foreground: renew the server lease when due, otherwise refresh the server's delivery status
  // (throttled) so Settings never shows a stale "On" after the server turns sending off.
  const lastStatusAt = useRef(0);
  useEffect(() => {
    if (!granted || !uid) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (manager.needsRenewal()) {
        setTokenEpoch((n) => n + 1);
        return;
      }
      if (!manager.isRegistered() || Date.now() - lastStatusAt.current < STATUS_REFRESH_MS) return;
      lastStatusAt.current = Date.now();
      pushDevicesApi
        .status(PLATFORM)
        .then((res) => {
          const registration = manager.updateServerStatus(toResult(res));
          if (registration) patch({ registration });
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, [granted, uid, manager, patch]);

  const enable = useCallback(async () => {
    if (state.support !== 'supported' || state.requesting) return;
    patch({ requesting: true });
    try {
      await provider.ensureAndroidChannel().catch(() => {});
      const permission = await provider.requestPermission();
      patch({ permission });
    } catch {
      // Leave the previous state; the card stays actionable.
    } finally {
      patch({ requesting: false });
      setPrimerDismissed(true);
      AsyncStorage.setItem(PRIMER_DISMISSED_KEY, '1').catch(() => {});
    }
  }, [state.support, state.requesting, patch]);

  const openSettings = useCallback(async () => {
    await provider.openSystemSettings().catch(() => {});
  }, []);

  const retry = useCallback(() => setTokenEpoch((n) => n + 1), []);

  const dismissPrimer = useCallback(() => {
    setPrimerDismissed(true);
    AsyncStorage.setItem(PRIMER_DISMISSED_KEY, '1').catch(() => {});
  }, []);

  const visibleState = useMemo<PushState>(
    () => (state.owner === uid ? state : { ...state, token: 'idle', registration: 'idle' }),
    [state, uid]
  );
  const value = useMemo(
    () => ({ state: visibleState, enable, openSettings, retry, primerDismissed, dismissPrimer }),
    [visibleState, enable, openSettings, retry, primerDismissed, dismissPrimer]
  );

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}
