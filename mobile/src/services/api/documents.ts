/**
 * Derived documents on a report (backend/routes/reports.js). Each created document is a normal `reports` doc with
 * `documentType` + `relatedReportId`, so it is opened, approved, exported and versioned through the usual report
 * endpoints. Creates count toward the plan's monthly report limit (429 LIMIT_EXCEEDED) and need team capability
 * canGenerate; revisions require a changeSummary and always reopen the document as a draft.
 */
import { apiRequest } from './client';
import type { Report } from './reports';
import type { PriceSuggestion, ServerCanonicalEstimate } from '@/features/reports/documents/canonicalEstimate';

const R = (id: string) => `/reports/${encodeURIComponent(id)}`;
type Doc = { success: true; report: Report };

export type DocumentType = 'RepairEstimate' | 'Invoice' | 'CoverageDeterminationLetter' | 'MoldSupplement';

export interface PropertyIntelligenceField {
  value: unknown;
  source?: string;
  verificationStatus?: string;
  userOverride?: unknown;
}

export interface PropertyLookupResult {
  status: 'full' | 'partial' | 'no_match' | 'ambiguous' | 'not_eligible';
  reason?: 'address_not_confirmed' | 'country_not_supported' | 'incomplete_address';
  lookupId?: string;
  expiresAt?: string;
  cacheHit?: boolean;
  fields?: Record<string, PropertyIntelligenceField>;
  disclaimers?: string[];
  intelligence?: unknown;
}

export interface PropertyIntelligence {
  status?: string;
  fields?: Record<string, PropertyIntelligenceField>;
  confirmedAt?: string | null;
  disclaimers?: string[];
  [key: string]: unknown;
}

export const documentsApi = {
  /** Repair Estimate — POST on the parent report (owner only, never AI). */
  createEstimate: (parentId: string, body: Record<string, unknown>) =>
    apiRequest<Doc>(`${R(parentId)}/estimate`, { method: 'POST', body }),
  /** PUT on the estimate itself (owner with canEditReports, or a review grantee). */
  reviseEstimate: (estimateId: string, body: Record<string, unknown>) =>
    apiRequest<Doc>(`${R(estimateId)}/estimate`, { method: 'PUT', body }),

  /** Invoice — POST on the finalized Repair Estimate (409 ESTIMATE_NOT_FINALIZED otherwise). */
  createInvoice: (estimateId: string, body: Record<string, unknown>) =>
    apiRequest<Doc>(`${R(estimateId)}/invoice`, { method: 'POST', body }),
  reviseInvoice: (invoiceId: string, body: Record<string, unknown>) => apiRequest<Doc>(`${R(invoiceId)}/invoice`, { method: 'PUT', body }),

  /** Coverage Determination Letter — POST on the reviewed base report; body names a reviewed linked `estimateId`. */
  createCoverageLetter: (parentId: string, body: Record<string, unknown>) =>
    apiRequest<Doc>(`${R(parentId)}/coverage-letter`, { method: 'POST', body }),
  reviseCoverageLetter: (letterId: string, body: Record<string, unknown>) =>
    apiRequest<Doc>(`${R(letterId)}/coverage-letter`, { method: 'PUT', body }),

  /** Mold Supplement — Super Intelligence draft from the parent's reviewed photos (10/min generation limit). */
  createMoldSupplement: (parentId: string, body: { dateOfDiscovery: string; relatedClaimId?: string }) =>
    apiRequest<Doc>(`${R(parentId)}/mold-supplement`, { method: 'POST', body, timeoutMs: 120000 }),

  /** Detailed Estimate (Section 7). Any access level may read. */
  getCanonicalEstimate: (id: string) =>
    apiRequest<{ success: true; estimate: ServerCanonicalEstimate | null; legacy: boolean; detailMarkdown: string }>(`${R(id)}/canonical-estimate`),
  saveCanonicalEstimate: (id: string, body: Record<string, unknown>) =>
    apiRequest<{ success: true; estimate: ServerCanonicalEstimate }>(`${R(id)}/canonical-estimate`, { method: 'PUT', body }),
  /** Professional+ (403 FEATURE_NOT_IN_PLAN). Stores a 20-minute proposal only — nothing is saved to the estimate. */
  priceSuggestions: (id: string, body: Record<string, unknown>) =>
    apiRequest<{ success: true; proposalId: string; items: PriceSuggestion[]; cacheStatus: string; pricingDate: string }>(
      `${R(id)}/estimate-detail/price-suggestions`,
      { method: 'POST', body, timeoutMs: 90000 }
    ),

  /** Property Intelligence (Section 3). */
  getPropertyIntelligence: (id: string) =>
    apiRequest<{ success: true; propertyIntelligence: PropertyIntelligence | null }>(`${R(id)}/property-lookup/intelligence`),
  lookupPropertyIntelligence: (id: string, recheck = false) =>
    apiRequest<{ success: true } & PropertyLookupResult>(`${R(id)}/property-lookup/intelligence`, {
      method: 'POST',
      body: recheck ? { recheck: true } : {},
      timeoutMs: 45000,
    }),
  confirmPropertyIntelligence: (id: string, body: { mode?: 'provider_confirmed' | 'manual'; lookupId?: string; selectedKeys: string[]; overrides?: Record<string, unknown> }) =>
    apiRequest<{ success: true; propertyIntelligence: PropertyIntelligence }>(`${R(id)}/property-intelligence`, { method: 'PUT', body }),
};
