import { describe, it, expect } from 'vitest';
import {
  isRepairEstimateFinalized,
  INVOICE_BLOCKED_ON_DRAFT_ESTIMATE_MESSAGE,
} from '../utils/estimateInvoiceEligibility.js';

// QA fix: the Invoice button/action on a Repair Estimate must be
// disabled/unavailable (with a clear explanation) until the estimate is
// itself approved/finalized. This mirrors the backend's authoritative
// `isReviewed` gate in routes/reports.js's POST /:id/invoice -- this
// predicate is UI-only convenience; the server independently re-checks the
// estimate's current persisted status regardless of what this says.

describe('isRepairEstimateFinalized', () => {
  it('blocks a draft Repair Estimate', () => {
    expect(isRepairEstimateFinalized('draft')).toBe(false);
  });

  it('blocks a processing Repair Estimate', () => {
    expect(isRepairEstimateFinalized('processing')).toBe(false);
  });

  it('blocks a failed Repair Estimate', () => {
    expect(isRepairEstimateFinalized('failed')).toBe(false);
  });

  it('blocks a missing/undefined status rather than defaulting to allowed', () => {
    expect(isRepairEstimateFinalized(undefined)).toBe(false);
    expect(isRepairEstimateFinalized('')).toBe(false);
  });

  it('allows the canonical "finalized" status', () => {
    expect(isRepairEstimateFinalized('finalized')).toBe(true);
  });

  it('allows the legacy reviewed statuses ("approved", "completed") for consistency with the rest of the app', () => {
    expect(isRepairEstimateFinalized('approved')).toBe(true);
    expect(isRepairEstimateFinalized('completed')).toBe(true);
  });
});

describe('INVOICE_BLOCKED_ON_DRAFT_ESTIMATE_MESSAGE', () => {
  it('matches the exact required explanation text', () => {
    expect(INVOICE_BLOCKED_ON_DRAFT_ESTIMATE_MESSAGE).toBe(
      'Approve and finalize the Repair Estimate before generating an Invoice.'
    );
  });
});
