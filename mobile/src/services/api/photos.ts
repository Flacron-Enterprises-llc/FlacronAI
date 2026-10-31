import { apiRequest } from './client';

/** backend/routes/photos.js — photos across the caller's own and shared (non-archived) reports. */
export interface LibraryPhoto {
  reportId: string;
  photoId: string;
  fileName: string | null;
  hasThumbnail: boolean;
  uploadedAt: string | null;
  analysisStatus: 'completed' | 'queued' | 'analyzing' | 'needs_attention' | 'unavailable';
  location: string | null;
  category: string | null;
  observation: string | null;
  review: { status?: string } | null;
  claimNumber: string | null;
  insuredName: string | null;
  roomOrArea: string | null;
  qualityWarning: boolean;
  canReview: boolean;
}

export const photosApi = {
  list: (params: { cursor?: string; limit?: number; search?: string; sort?: 'newest' | 'oldest' | 'claim' | 'category'; inclusion?: 'included' | 'excluded' } = {}) =>
    apiRequest<{ success: true; photos: LibraryPhoto[]; nextCursor: string | null; totalCount: number; truncated?: boolean }>('/photos', {
      params: { limit: 30, ...params },
    }),
};
