import { apiRequest } from './client';

export type AnalyticsRange = '7d' | '30d' | '90d' | '365d' | 'all';

/** `GET /api/analytics` (backend/services/analyticsService.js getAnalytics). Organization scope adds per-user rows. */
export interface Analytics {
  scope: 'personal' | 'organization' | string;
  range: { startDate: string; endDate: string; label: string };
  metrics: {
    reportsGenerated: number;
    photosAnalyzed: number;
    avgCompletionHours: number | null;
    avgCompletionSampleSize: number;
    reportsByType: Record<string, number>;
    reportsByStatus: Record<string, number>;
  };
  monthlyUsage: { key: string; label: string; reports: number; photos: number }[];
  reportsPerUser:
    | { uid: string; displayName?: string | null; email?: string | null; reportsGenerated: number; photosAnalyzed: number }[]
    | null;
}

export const analyticsApi = {
  get: (range: AnalyticsRange = '30d') =>
    apiRequest<{ success: true; analytics: Analytics }>('/analytics', {
      params: { range, tzOffset: -new Date().getTimezoneOffset() },
    }),
};
