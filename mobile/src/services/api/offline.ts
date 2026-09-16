/**
 * Thin, defensive wrapper around `@react-native-community/netinfo` (the standard
 * Expo-compatible network-status module — installed via `expo install` so its version is
 * matched to this app's Expo SDK). Kept in its own file so the retry/offline contract in
 * `client.ts` is testable without pulling in the real native module, and so a future screen
 * can reuse `isOffline()`/`subscribeToConnectivity()` without importing the whole HTTP
 * client.
 *
 * Every export here degrades gracefully: if NetInfo throws (unlinked native module,
 * unsupported platform, a bad mock in tests), callers get `null`/a no-op unsubscribe
 * instead of a crash — the request pipeline in `client.ts` falls back to attempting the
 * real fetch and classifying failures itself when connectivity state is genuinely unknown.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

/**
 * True only when NetInfo is confident the device has no connectivity at all. `null` means
 * "unknown" (NetInfo unavailable, or its own `isConnected` is `null`) — callers must treat
 * `null` as "don't know, attempt the request and classify the outcome," never as `false`.
 */
export async function isOffline(): Promise<boolean | null> {
  try {
    const state: NetInfoState = await NetInfo.fetch();
    if (state.isConnected === null || state.isConnected === undefined) return null;
    return state.isConnected === false;
  } catch {
    return null;
  }
}

/**
 * Subscribes to connectivity changes so a caller can react the moment the device comes back
 * online (e.g. to flush a queued action) — no UI, no queuing here, just the raw signal.
 * Always returns a callable unsubscribe function, even if the underlying subscribe call
 * itself throws.
 */
export function subscribeToConnectivity(onChange: (online: boolean | null) => void): () => void {
  try {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      if (state.isConnected === null || state.isConnected === undefined) {
        onChange(null);
      } else {
        onChange(state.isConnected);
      }
    });
    return () => {
      try {
        unsubscribe();
      } catch {
        // Nothing to do — best-effort teardown.
      }
    };
  } catch {
    return () => {};
  }
}
