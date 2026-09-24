import { describe, it, expect } from 'vitest';
import {
  buildPriceSuggestionsRequestPayload,
  validatePriceSuggestionsRequest,
  classifyPriceSuggestionsError,
  mergeProposedPricingIntoLineItems,
  canStartPriceSuggestionsGeneration,
} from '../utils/pricingSuggestions';
import { emptyCanonicalLineItem, computeEstimatePreviewTotals } from '../utils/canonicalEstimateEditor';

// Phase 43 (OpenAI Preliminary Pricing Service). Pure unit tests for the
// "Generate Preliminary Pricing" workflow/merge logic -- same
// no-jsdom/no-@testing-library convention as canonicalEstimateEditor.test.js.

const target = (overrides = {}) => ({
  targetLineItemId: 'li-1',
  room: 'Living Room',
  damageType: 'Water',
  repairAction: 'Replace',
  description: 'Replace water-damaged drywall',
  material: 'Drywall',
  quantity: '10',
  unit: 'SF',
  ...overrides,
});

// Trust-boundary correction (2026-09-19): a proposal item from the server
// NEVER carries `providerModel` (stripped server-side) and is keyed by the
// opaque `suggestionId` (renamed from `proposalItemId`) -- this fixture
// mirrors the real POST .../price-suggestions response shape exactly.
const proposalItem = (overrides = {}) => ({
  suggestionId: 'sug-1',
  targetLineItemId: 'li-1',
  room: 'Living Room',
  trade: 'Drywall',
  category: 'Drywall',
  damageType: 'Water',
  repairAction: 'Replace',
  description: 'Replace water-damaged drywall',
  material: 'Drywall',
  quantity: 10,
  unit: 'SF',
  materialUnitCost: 2.5,
  laborUnitCost: 3,
  equipmentUnitCost: 0,
  unitPrice: 5.5,
  lineTotal: 55,
  assumptions: 'Standard 1/2in drywall.',
  confidence: 'medium',
  currency: 'USD',
  pricingSource: 'ai_suggested',
  pricingDate: '2026-09-19',
  ...overrides,
});

const PROPOSAL_ID = 'pp-1';

describe('buildPriceSuggestionsRequestPayload', () => {
  it('builds a sanitized payload with only locale + repair-scope fields', () => {
    const payload = buildPriceSuggestionsRequestPayload({
      locationContext: { country: 'us', state: 'tx', city: 'Austin', postalCode: '78701' },
      currency: 'usd',
      region: 'Central TX',
      targets: [target()],
      regenerate: false,
    });
    expect(payload.locationContext).toEqual({ country: 'us', state: 'tx', city: 'Austin', postalCode: '78701' });
    expect(payload.currency).toBe('USD');
    expect(payload.regenerate).toBe(false);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].targetLineItemId).toBe('li-1');
    expect(payload.items[0].quantity).toBe(10);
  });

  it('defaults regenerate to false and currency to USD when omitted', () => {
    const payload = buildPriceSuggestionsRequestPayload({ locationContext: { country: 'US' }, targets: [target()] });
    expect(payload.regenerate).toBe(false);
    expect(payload.currency).toBe('USD');
  });
});

describe('validatePriceSuggestionsRequest', () => {
  it('requires a country', () => {
    expect(validatePriceSuggestionsRequest({ locationContext: {}, targets: [target()] })).toMatch(/country/i);
  });
  it('requires at least one target', () => {
    expect(validatePriceSuggestionsRequest({ locationContext: { country: 'US' }, targets: [] })).toMatch(/select/i);
  });
  it('requires room/description/positive quantity on every target', () => {
    expect(validatePriceSuggestionsRequest({ locationContext: { country: 'US' }, targets: [target({ room: '' })] })).toMatch(/room/i);
    expect(validatePriceSuggestionsRequest({ locationContext: { country: 'US' }, targets: [target({ description: '' })] })).toMatch(/description/i);
    expect(validatePriceSuggestionsRequest({ locationContext: { country: 'US' }, targets: [target({ quantity: '0' })] })).toMatch(/quantity/i);
  });
  it('passes for a valid request', () => {
    expect(validatePriceSuggestionsRequest({ locationContext: { country: 'US' }, targets: [target()] })).toBeNull();
  });
});

describe('classifyPriceSuggestionsError', () => {
  it('classifies a network error (no response)', () => {
    expect(classifyPriceSuggestionsError({}).kind).toBe('network');
  });
  it('classifies cancellation distinctly (AbortController)', () => {
    expect(classifyPriceSuggestionsError({ code: 'ERR_CANCELED' }).kind).toBe('cancelled');
    expect(classifyPriceSuggestionsError({ name: 'CanceledError' }).kind).toBe('cancelled');
  });
  it('classifies PRICING_PROVIDER_UNAVAILABLE as "unavailable" -- never mentions the provider name', () => {
    const result = classifyPriceSuggestionsError({ response: { status: 503, data: { code: 'PRICING_PROVIDER_UNAVAILABLE', error: 'x' } } });
    expect(result.kind).toBe('unavailable');
    expect(result.message).not.toMatch(/openai/i);
  });
  it('classifies PRICING_TIMEOUT/PRICING_MALFORMED_RESPONSE as retryable', () => {
    expect(classifyPriceSuggestionsError({ response: { status: 504, data: { code: 'PRICING_TIMEOUT' } } }).kind).toBe('retryable');
    expect(classifyPriceSuggestionsError({ response: { status: 502, data: { code: 'PRICING_MALFORMED_RESPONSE' } } }).kind).toBe('retryable');
  });
  it('classifies PRICING_RATE_LIMITED/PRICING_LIMIT_EXCEEDED as rate_limited', () => {
    expect(classifyPriceSuggestionsError({ response: { status: 429, data: { code: 'PRICING_RATE_LIMITED' } } }).kind).toBe('rate_limited');
    expect(classifyPriceSuggestionsError({ response: { status: 429, data: { code: 'PRICING_LIMIT_EXCEEDED' } } }).kind).toBe('rate_limited');
  });
  it('classifies PRICING_QUOTA_EXCEEDED/PRICING_AUTH_FAILED as config_failure with a generic message', () => {
    const a = classifyPriceSuggestionsError({ response: { status: 402, data: { code: 'PRICING_QUOTA_EXCEEDED' } } });
    const b = classifyPriceSuggestionsError({ response: { status: 500, data: { code: 'PRICING_AUTH_FAILED' } } });
    expect(a.kind).toBe('config_failure');
    expect(b.kind).toBe('config_failure');
  });
  it('classifies VALIDATION_ERROR with its field', () => {
    const result = classifyPriceSuggestionsError({ response: { status: 400, data: { code: 'VALIDATION_ERROR', error: 'x', field: 'locationContext.country' } } });
    expect(result.kind).toBe('validation');
    expect(result.field).toBe('locationContext.country');
  });
  it('classifies REPORT_FINALIZED', () => {
    expect(classifyPriceSuggestionsError({ response: { status: 409, data: { code: 'REPORT_FINALIZED' } } }).kind).toBe('finalized');
  });
  it('classifies a 403/404 as unauthorized', () => {
    expect(classifyPriceSuggestionsError({ response: { status: 403, data: {} } }).kind).toBe('unauthorized');
    expect(classifyPriceSuggestionsError({ response: { status: 404, data: {} } }).kind).toBe('unauthorized');
  });
  it('falls back to unknown for an unrecognized code', () => {
    expect(classifyPriceSuggestionsError({ response: { status: 500, data: { code: 'SOMETHING_ELSE' } } }).kind).toBe('unknown');
  });
});

describe('mergeProposedPricingIntoLineItems', () => {
  it('nothing is applied unless its suggestionId is in acceptedSuggestionIds', () => {
    const existing = [{ ...emptyCanonicalLineItem(), id: 'li-1' }];
    const { lineItems, applied } = mergeProposedPricingIntoLineItems(existing, PROPOSAL_ID, [proposalItem()], []);
    expect(applied).toHaveLength(0);
    expect(lineItems).toEqual(existing);
  });

  it('merges an accepted proposal into a targeted, non-overridden existing item, stamping opaque appliedProposalId/appliedSuggestionId handles -- never providerModel', () => {
    const existing = [{ ...emptyCanonicalLineItem(), id: 'li-1', room: '', description: '' }];
    const { lineItems, applied, skipped } = mergeProposedPricingIntoLineItems(existing, PROPOSAL_ID, [proposalItem()], ['sug-1']);
    expect(skipped).toHaveLength(0);
    expect(applied).toEqual([{ suggestionId: 'sug-1', targetLineItemId: 'li-1', mode: 'merged' }]);
    const merged = lineItems.find((li) => li.id === 'li-1');
    expect(merged.materialUnitCost).toBe('2.5');
    expect(merged.laborUnitCost).toBe('3');
    expect(merged.pricingSource).toBe('ai_suggested');
    expect(merged.appliedProposalId).toBe(PROPOSAL_ID);
    expect(merged.appliedSuggestionId).toBe('sug-1');
    expect(merged.providerModel).toBeUndefined();
  });

  it('SKIPS a proposal targeting an item with overrideActive === true -- never silently overwrites a user override', () => {
    const existing = [{ ...emptyCanonicalLineItem(), id: 'li-1', overrideActive: true, overrideReason: 'contractor quote' }];
    const { lineItems, applied, skipped } = mergeProposedPricingIntoLineItems(existing, PROPOSAL_ID, [proposalItem()], ['sug-1']);
    expect(applied).toHaveLength(0);
    expect(skipped).toEqual([{ suggestionId: 'sug-1', targetLineItemId: 'li-1', reason: 'user_override_active' }]);
    expect(lineItems).toEqual(existing);
  });

  it('appends a brand-new line item when targetLineItemId is null (no existing item to match)', () => {
    const existing = [{ ...emptyCanonicalLineItem(), id: 'li-1' }];
    const proposal = proposalItem({ suggestionId: 'sug-2', targetLineItemId: null });
    const { lineItems, applied } = mergeProposedPricingIntoLineItems(existing, PROPOSAL_ID, [proposal], ['sug-2']);
    expect(lineItems).toHaveLength(2);
    expect(applied[0].mode).toBe('appended');
    const appended = lineItems[1];
    expect(appended.id).not.toBe('li-1');
    expect(appended.appliedProposalId).toBe(PROPOSAL_ID);
    expect(appended.appliedSuggestionId).toBe('sug-2');
    expect(appended.pricingSource).toBe('ai_suggested');
  });

  it('idempotent re-apply: applying the SAME suggestion twice updates the same item, never appends a duplicate (matched by appliedSuggestionId)', () => {
    const existing = [{ ...emptyCanonicalLineItem(), id: 'li-1' }];
    const proposal = proposalItem({ suggestionId: 'sug-2', targetLineItemId: null });
    const first = mergeProposedPricingIntoLineItems(existing, PROPOSAL_ID, [proposal], ['sug-2']);
    expect(first.lineItems).toHaveLength(2);

    // Regenerate produced a fresh suggestionId in a real flow, but a
    // literal re-application of the exact same suggestion (e.g. user
    // unchecks then re-checks Accept before Save) must still be a
    // no-op-duplicate.
    const second = mergeProposedPricingIntoLineItems(first.lineItems, PROPOSAL_ID, [proposal], ['sug-2']);
    expect(second.lineItems).toHaveLength(2, 'no duplicate line item was appended on re-apply');
    expect(second.applied[0].mode).toBe('merged');
  });

  it('idempotent re-apply also works for an item that was originally MERGED into an existing target (not appended)', () => {
    const existing = [{ ...emptyCanonicalLineItem(), id: 'li-1' }];
    const proposal = proposalItem({ suggestionId: 'sug-1', targetLineItemId: 'li-1' });
    const first = mergeProposedPricingIntoLineItems(existing, PROPOSAL_ID, [proposal], ['sug-1']);
    const second = mergeProposedPricingIntoLineItems(first.lineItems, PROPOSAL_ID, [proposal], ['sug-1']);
    expect(second.lineItems).toHaveLength(1);
    expect(second.applied[0]).toEqual({ suggestionId: 'sug-1', targetLineItemId: 'li-1', mode: 'merged' });
  });

  it('a cache-hit proposal applied to an overridden item is STILL a no-op/skip (the merge logic has no special case for cache origin)', () => {
    const existing = [{ ...emptyCanonicalLineItem(), id: 'li-1', overrideActive: true, overrideReason: 'x' }];
    const cacheHitProposal = proposalItem({ suggestionId: 'sug-cached' });
    const { applied, skipped } = mergeProposedPricingIntoLineItems(existing, PROPOSAL_ID, [cacheHitProposal], ['sug-cached']);
    expect(applied).toHaveLength(0);
    expect(skipped[0].reason).toBe('user_override_active');
  });

  it('merging does not touch tax/O&P/manual-adjustment fields -- the $550/$55/$44/$649 reference case is unaffected when run through computeEstimatePreviewTotals after a merge', () => {
    const existing = [
      { ...emptyCanonicalLineItem(), id: 'li-1', room: 'Living Room', category: 'General', description: 'Services', quantity: '1', unit: 'EA', materialUnitCost: '550', laborUnitCost: '0', taxable: true },
    ];
    // Merge an unrelated new AI-suggested item with a currently-unrealistic
    // 0-cost proposal so it doesn't change the $550 reference total, proving
    // the merge itself never reaches into overheadProfitPercent/taxRatePercent.
    const zeroCostProposal = proposalItem({ suggestionId: 'sug-3', targetLineItemId: null, materialUnitCost: 0, laborUnitCost: 0, equipmentUnitCost: 0, quantity: 0.0000001 });
    const { lineItems } = mergeProposedPricingIntoLineItems(existing, PROPOSAL_ID, [zeroCostProposal], ['sug-3']);
    const totals = computeEstimatePreviewTotals(lineItems, [], [], [], '10', '8');
    expect(Math.round(totals.lineSubtotal * 100) / 100).toBeCloseTo(550, 2);
    expect(Math.round(totals.op * 100) / 100).toBeCloseTo(55, 2);
    expect(Math.round(totals.tax * 100) / 100).toBeCloseTo(44, 2);
    expect(Math.round(totals.grandTotal * 100) / 100).toBeCloseTo(649, 2);
  });
});

describe('canStartPriceSuggestionsGeneration', () => {
  it('false while generating or read-only, true otherwise', () => {
    expect(canStartPriceSuggestionsGeneration({ generating: true, readOnly: false })).toBe(false);
    expect(canStartPriceSuggestionsGeneration({ generating: false, readOnly: true })).toBe(false);
    expect(canStartPriceSuggestionsGeneration({ generating: false, readOnly: false })).toBe(true);
  });
});
