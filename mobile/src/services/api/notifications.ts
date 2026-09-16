/**
 * Typed wrappers for the in-app notification feed (`backend/routes/notifications.js`).
 * This is the existing in-app-only feed — push/device-token registration does not exist
 * anywhere in the backend yet (confirmed by a Phase 4 repo-wide search), so there is no
 * `registerDeviceToken`-type method here; that is real, later, additive backend work
 * (Phase 6 — Push Notifications), not something this phase can call into.
 *
 * Notification *preferences* also live here as thin re-exports of `usersApi`'s profile
 * methods (confirmed: no dedicated `/notifications/preferences` endpoint exists — the 6
 * boolean categories in `backend/utils/notificationPrefs.js` are read/written as part of
 * the user profile doc), so a notification-settings screen only needs to import from this
 * one module instead of also reaching into `users.ts` directly.
 */
import { apiRequest } from './client';
import { usersApi } from './users';
import type { NotificationPreferences } from '@/features/auth/types';

/** Exact string values confirmed in `backend/utils/notificationService.js`'s
 * `NOTIFICATION_TYPES`. Treat any other string as unknown/generic in the UI, never guess
 * its meaning. */
export type NotificationType =
  | 'analysis_completed'
  | 'analysis_failed'
  | 'report_completed'
  | 'review_requested'
  | 'review_declined'
  | 'report_approved'
  | 'report_shared'
  | 'export_completed'
  | 'team_invitation'
  | 'subscription_issue';

export interface AppNotification {
  id: string;
  uid: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Click-through destination (a web-app path like `/reports/{id}/preview`) — a mobile
   * screen must map this to its own route, never navigate a WebView/browser to it. */
  link: string | null;
  meta: { reportId?: string; claimNumber?: string } | Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationsPage {
  success: true;
  notifications: AppNotification[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  unreadCount: number;
  /** True when the backend's fixed 200-doc scan window trimmed older results — there is
   * no cursor-based way to page past this; treat `total`/`hasMore` as bounded by it. */
  windowCapped: boolean;
}

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

export const notificationsApi = {
  /** `limit` is silently capped at 50 server-side (`MAX_PAGE_SIZE`) — clamped here too so a
   * caller's mistake never produces a confusing partial-looking page. There is no separate
   * "unread count" endpoint; `unreadCount` on every page response is the live value. */
  list: (page = 1, limit = DEFAULT_PAGE_SIZE) =>
    apiRequest<NotificationsPage>('/notifications', {
      params: { page, limit: Math.min(limit, MAX_PAGE_SIZE) },
    }),

  /** Confirmed idempotent server-side (`markAsRead` no-ops with `{alreadyRead: true}` if
   * already read, inside a transaction with the unread-counter update) — safe to mark
   * retry-eligible. */
  markAsRead: (id: string) =>
    apiRequest<{ success: true; alreadyRead: boolean }>(`/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST',
      idempotent: true,
    }),

  /** Confirmed idempotent in effect (a repeat call after everything is already read
   * returns `{updated: 0, more: false}`), but each call is capped at 500 notifications
   * server-side (`MARK_ALL_BATCH_CAP`) — `more: true` means the caller must call again to
   * finish clearing a larger backlog; each individual call remains safe to retry. */
  markAllAsRead: () =>
    apiRequest<{ success: true; updated: number; more: boolean }>('/notifications/mark-all-read', {
      method: 'POST',
      idempotent: true,
    }),

  /** Thin wrapper over `GET /users/profile` — the backend does not backfill defaults on
   * read, so an account that never set preferences will get `undefined` here; apply
   * default-enabled semantics in the UI, never treat `undefined` as "opted out." */
  getPreferences: async (): Promise<NotificationPreferences | undefined> => {
    const { user } = await usersApi.getProfile();
    return user.notifications;
  },

  /** Thin wrapper over `PUT /users/profile` — merges (not replaces) with the caller's
   * existing preferences server-side (`sanitizeNotifications`). */
  updatePreferences: (notifications: NotificationPreferences) =>
    usersApi.updateNotificationPreferences(notifications),
};
