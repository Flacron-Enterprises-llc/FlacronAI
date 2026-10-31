import { apiRequest } from './client';

/** `GET /api/search` (backend/routes/search.js). Fewer than 2 characters returns empty groups; at most 8 per group;
 * `team` is only filled for callers who can manage or view their organization's profiles. */
export interface SearchResults {
  query: string;
  reports: { id: string; claimNumber: string | null; insuredName: string | null; propertyAddress: string | null; status: string | null; link: string }[];
  photos: { reportId: string; photoId: string; fileName: string; claimNumber: string | null; link: string }[];
  team: { id: string; email: string; role: string; status: string; link: string }[];
}

export const MIN_SEARCH_LENGTH = 2;

export const searchApi = {
  search: (q: string) => apiRequest<{ success: true } & SearchResults>('/search', { params: { q } }),
};
