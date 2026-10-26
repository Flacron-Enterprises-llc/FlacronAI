/**
 * A tiny in-memory "reports changed" signal so list screens (Dashboard, Reports) refresh after
 * something that changes them happens elsewhere — a report generated, approved, sent back by a
 * reviewer, or its analysis retried — without polling and without refetching on every focus.
 *
 * Writers call `notifyReportsChanged()`. Readers use `useRefreshOnFocus` (below), which refreshes
 * when a screen regains focus only if a change was signalled since it last loaded, or its data
 * is older than `STALE_AFTER_MS`.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

export const STALE_AFTER_MS = 2 * 60 * 1000;

let version = 0;

export function notifyReportsChanged(): void {
  version += 1;
}

export function getReportsVersion(): number {
  return version;
}

export interface FocusSnapshot {
  version: number;
  loadedAt: number;
}

/** Pure decision used by `useRefreshOnFocus` — exported for tests. */
export function shouldRefreshOnFocus(last: FocusSnapshot, currentVersion: number, now: number): boolean {
  return currentVersion !== last.version || now - last.loadedAt >= STALE_AFTER_MS;
}

/**
 * Calls `refresh` when the screen regains focus and its data may be out of date. The first focus
 * is skipped — the screen's own mount effect already performs the initial load.
 */
export function useRefreshOnFocus(refresh: () => void): void {
  const snapshot = useRef<FocusSnapshot | null>(null);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Stable callback: `useFocusEffect` re-runs whenever its callback identity changes, which
  // would turn every re-render of the screen into a focus check.
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (snapshot.current === null) {
        snapshot.current = { version: getReportsVersion(), loadedAt: now };
        return;
      }
      if (shouldRefreshOnFocus(snapshot.current, getReportsVersion(), now)) {
        snapshot.current = { version: getReportsVersion(), loadedAt: now };
        refreshRef.current();
      }
    }, [])
  );
}
