/**
 * Turns a notification tap into navigation, through the same guard a deep link uses:
 * - signed in → push the target screen;
 * - not (yet) signed in → remember a report target with `rememberPendingReport`, which
 *   `app/index.tsx` honours after sign-in (and Sign Out clears), exactly like a deep link.
 * Access is still decided by the server: the report screen shows its own not-found /
 * access-denied state for a report this account can't open.
 *
 * Each delivered notification is acted on once, so a tap seen by both the launch check and the
 * live listener (or re-delivered) never navigates twice.
 */
import { rememberPendingReport } from '@/features/navigation/pendingDeepLink';
import type { AuthStatus } from '@/features/auth/types';
import { readPushMeta, resolveNotificationTarget, type NotificationTarget } from './pushPayload';
import type { NotificationTap } from './pushProvider';

const HANDLED_LIMIT = 50;

export interface TapNavigator {
  openReport(reportId: string): void;
  openDashboard(): void;
}

export type TapOutcome =
  | 'navigated'
  | 'deferred-until-sign-in'
  | 'ignored-duplicate'
  | 'ignored-invalid'
  | 'ignored-signed-out'
  | 'ignored-stale';

export function createTapRouter() {
  const handled: string[] = [];

  const seen = (key: string) => {
    if (handled.includes(key)) return true;
    handled.push(key);
    if (handled.length > HANDLED_LIMIT) handled.shift();
    return false;
  };

  /** `stale`: the push was addressed to a binding this device has ended (another sign-in) —
   * never navigated to, and never remembered for whoever signs in next. */
  return function routeTap(tap: NotificationTap, status: AuthStatus, nav: TapNavigator, opts: { stale?: boolean } = {}): TapOutcome {
    // Keyed on the OS notification id AND the backend's stable eventId, so the same event
    // re-delivered (at-least-once) as a second banner is still acted on only once.
    const { eventId } = readPushMeta(tap.data);
    const dupById = seen(`n:${tap.id}`);
    const dupByEvent = eventId ? seen(`e:${eventId}`) : false;
    if (dupById || dupByEvent) return 'ignored-duplicate';
    if (opts.stale) return 'ignored-stale';

    const target: NotificationTarget | null = resolveNotificationTarget(tap.data);
    if (!target) return 'ignored-invalid';

    if (status !== 'authenticated') {
      if (target.kind === 'report') {
        rememberPendingReport(target.reportId);
        return 'deferred-until-sign-in';
      }
      // Sign-in already lands on the dashboard.
      return 'ignored-signed-out';
    }

    if (target.kind === 'report') nav.openReport(target.reportId);
    else nav.openDashboard();
    return 'navigated';
  };
}
