/**
 * Validates a push notification's `data` payload and decides where a tap should go.
 *
 * Contract (PROPOSED — the backend sends no push today; see MOBILE_DEVELOPMENT_PHASES.md §6):
 *   data: { type: <NOTIFICATION_TYPES value>, reportId?: string }
 * `type` values are exactly `backend/utils/notificationService.js`'s `NOTIFICATION_TYPES`, so a
 * push mirrors an in-app feed entry. `link` (the feed's web path, e.g. `/reports/{id}/preview`)
 * is accepted as a fallback source for the report id. Anything else is ignored — a malformed or
 * unknown payload opens the app without navigating, never a guessed screen.
 */
import { isValidReportId } from '@/features/navigation/pendingDeepLink';
import type { NotificationType } from '@/services/api/notifications';

const REPORT_TYPES: readonly NotificationType[] = [
  'analysis_completed',
  'analysis_failed',
  'report_completed',
  'review_requested',
  'review_declined',
  'report_approved',
  'report_shared',
  'export_completed',
];

/** Account-level events. There is no team or billing screen on mobile yet (Phase 7/8), so these
 * open the dashboard. */
const ACCOUNT_TYPES: readonly NotificationType[] = ['team_invitation', 'subscription_issue'];

export type NotificationTarget = { kind: 'report'; reportId: string } | { kind: 'dashboard' };

const WEB_REPORT_LINK = /^\/reports\/([A-Za-z0-9_-]{1,128})(?:\/preview)?\/?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reportIdFrom(data: Record<string, unknown>): string | null {
  if (isValidReportId(data.reportId)) return data.reportId;
  if (typeof data.link === 'string') {
    const match = WEB_REPORT_LINK.exec(data.link);
    if (match && isValidReportId(match[1])) return match[1];
  }
  return null;
}

export function isReportNotificationType(type: unknown): type is NotificationType {
  return typeof type === 'string' && (REPORT_TYPES as readonly string[]).includes(type);
}

const EVENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const BINDING_TAG = /^[0-9a-f]{16}$/;

/** Delivery metadata the backend adds to every push (Phase 6 follow-up): `eventId` is stable
 * per notification (identical on every retry), `bindingTag` identifies the device binding the
 * push was addressed to. Malformed values are treated as absent. */
export function readPushMeta(data: unknown): { eventId: string | null; bindingTag: string | null } {
  if (!isRecord(data)) return { eventId: null, bindingTag: null };
  return {
    eventId: typeof data.eventId === 'string' && EVENT_ID.test(data.eventId) ? data.eventId : null,
    bindingTag: typeof data.bindingTag === 'string' && BINDING_TAG.test(data.bindingTag) ? data.bindingTag : null,
  };
}

export function resolveNotificationTarget(data: unknown): NotificationTarget | null {
  if (!isRecord(data)) return null;
  const { type } = data;
  if (isReportNotificationType(type)) {
    const reportId = reportIdFrom(data);
    return reportId ? { kind: 'report', reportId } : null;
  }
  if (typeof type === 'string' && (ACCOUNT_TYPES as readonly string[]).includes(type)) return { kind: 'dashboard' };
  return null;
}
