import { describe, it, expect } from 'vitest';
import {
  emptyCanonicalLineItem,
  emptyLabeledAmount,
  draftFromServerLineItem,
  draftFromServerEstimate,
  reorderLineItems,
  removeLineItemAt,
  toggleLineItemEvidence,
  computeEstimatePreviewTotals,
  buildCanonicalEstimatePayload,
  validateCanonicalEstimateDraft,
  classifyCanonicalEstimateSaveError,
  canStartCanonicalEstimateSave,
  shouldWarnBeforeClosingCanonicalEstimateEditor,
  isCanonicalEstimateReadOnly,
} from '../utils/canonicalEstimateEditor';

// Phase 42 (Section 7 Rendering, Editor & Report Integration) -- 2026-09-18
// correction (CHECK 2). This codebase has no React component-render test
// infrastructure (no @testing-library/react/jsdom anywhere), so
// `CanonicalEstimateEditor`'s business logic was extracted into
// canonicalEstimateEditor.js and is tested here directly, following the
// same convention as estimateInvoiceEligibility.test.js/invoiceTotals.test.js.
// Backend renderer/persistence tests (canonical-estimate-*.test.js) are a
// SEPARATE, non-overlapping layer -- they never exercise this file.

describe('empty/legacy states', () => {
  it('draftFromServerEstimate(null) seeds one blank line item and USD/0% defaults -- the empty-report state', () => {
    const draft = draftFromServerEstimate(null);
    expect(draft.lineItems).toHaveLength(1);
    expect(draft.currency).toBe('USD');
    expect(draft.region).toBe('');
    expect(draft.permits).toEqual([]);
    expect(draft.generalConditions).toEqual([]);
    expect(draft.manualAdjustments).toEqual([]);
    expect(draft.overheadProfitPercent).toBe('0');
    expect(draft.taxRatePercent).toBe('0');
  });

  it('draftFromServerEstimate seeds one blank line item for a legacy report whose estimate has zero line items', () => {
    const draft = draftFromServerEstimate({ currency: 'USD', lineItems: [], totals: {} });
    expect(draft.lineItems).toHaveLength(1);
  });

  it('emptyCanonicalLineItem gives every new item a unique stable id, distinct from array position', () => {
    const a = emptyCanonicalLineItem();
    const b = emptyCanonicalLineItem();
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^li_/);
  });
});

describe('add / edit / delete / reorder line items with stable IDs', () => {
  it('reorderLineItems swaps two items but every item keeps its own id (identity travels with content, not index)', () => {
    const list = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }];
    const moved = reorderLineItems(list, 0, 1); // move "a" down past "b"
    expect(moved.map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(moved.find((x) => x.id === 'a').v).toBe(1); // content travels WITH the id
    expect(list.map((x) => x.id)).toEqual(['a', 'b', 'c'], 'original array is untouched (pure)');
  });

  it('reorderLineItems is a no-op (same reference) at either boundary', () => {
    const list = [{ id: 'a' }, { id: 'b' }];
    expect(reorderLineItems(list, 0, -1)).toBe(list);
    expect(reorderLineItems(list, 1, 1)).toBe(list);
  });

  it('removeLineItemAt removes exactly the targeted item by position, other items keep their own ids', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const next = removeLineItemAt(list, 1);
    expect(next.map((x) => x.id)).toEqual(['a', 'c']);
    expect(list).toHaveLength(3, 'original array is untouched (pure)');
  });

  it('editing a field (simulated via map) never changes the id, matching updateLineItem\'s own pattern', () => {
    const list = [emptyCanonicalLineItem()];
    const edited = list.map((li, idx) => (idx === 0 ? { ...li, description: 'Replace drywall' } : li));
    expect(edited[0].id).toBe(list[0].id);
    expect(edited[0].description).toBe('Replace drywall');
  });
});

describe('cost components and manual unit-price override', () => {
  it('computeEstimatePreviewTotals derives unit price from material+labor+equipment when no override is active', () => {
    const li = { ...emptyCanonicalLineItem(), quantity: '2', materialUnitCost: '10', laborUnitCost: '5', equipmentUnitCost: '0', taxable: true };
    const totals = computeEstimatePreviewTotals([li], [], [], [], '0', '0');
    expect(totals.lineSubtotal).toBe(30); // 2 * (10+5)
  });

  it('an active override replaces the computed component sum with the override value', () => {
    const li = {
      ...emptyCanonicalLineItem(),
      quantity: '1', materialUnitCost: '10', laborUnitCost: '5', equipmentUnitCost: '0',
      overrideActive: true, unitPriceOverride: '999', taxable: true,
    };
    const totals = computeEstimatePreviewTotals([li], [], [], [], '0', '0');
    expect(totals.lineSubtotal).toBe(999); // override wins, not the 15 component sum
  });

  it('buildCanonicalEstimatePayload includes userOverride with provenance (reason) only when override is active', () => {
    const li = { ...emptyCanonicalLineItem(), overrideActive: true, unitPriceOverride: '42', overrideReason: 'Contractor quote' };
    const payload = buildCanonicalEstimatePayload({
      serverEstimate: null, currency: 'USD', region: '', changeSummary: '', overheadProfitPercent: '0', taxRatePercent: '0',
      lineItems: [li], permits: [], generalConditions: [], manualAdjustments: [],
    });
    expect(payload.lineItems[0].userOverride).toEqual({ active: true, unitPrice: 42, reason: 'Contractor quote' });
  });

  it('buildCanonicalEstimatePayload omits userOverride entirely when no override is active (server computes from components)', () => {
    const li = emptyCanonicalLineItem();
    const payload = buildCanonicalEstimatePayload({
      serverEstimate: null, currency: 'USD', region: '', changeSummary: '', overheadProfitPercent: '0', taxRatePercent: '0',
      lineItems: [li], permits: [], generalConditions: [], manualAdjustments: [],
    });
    expect(payload.lineItems[0].userOverride).toBeUndefined();
  });
});

// Trust-boundary correction (2026-09-19). Previously, `buildCanonicalEstimatePayload`
// echoed a client-held `providerModel` object straight into the save
// payload -- a raw devtools-editable field with no server-side proof behind
// it. It now NEVER sends `providerModel` at all; trusted AI-pricing
// metadata is exclusively server-owned (see canonicalEstimate.js's
// validateLineItems). The client instead sends only OPAQUE handles
// (`appliedSuggestionId` per line item, `appliedProposals` at the top
// level) that the server independently re-verifies against its own
// short-lived proposal record before trusting anything.
describe('trust-boundary correction: providerModel is never sent by the client', () => {
  it('buildCanonicalEstimatePayload never includes a providerModel field, even when the draft line item carries one (e.g. a stale/tampered field)', () => {
    const li = { ...emptyCanonicalLineItem(), pricingSource: 'ai_suggested', providerModel: { provider: 'attacker', model: 'attacker-model', promptVersion: 'v1' } };
    const payload = buildCanonicalEstimatePayload({
      serverEstimate: null, currency: 'USD', region: '', changeSummary: '', overheadProfitPercent: '0', taxRatePercent: '0',
      lineItems: [li], permits: [], generalConditions: [], manualAdjustments: [],
    });
    expect(payload.lineItems[0].providerModel).toBeUndefined();
    expect('providerModel' in payload.lineItems[0]).toBe(false);
  });

  it('draftFromServerLineItem no longer carries providerModel into the editable draft at all', () => {
    const draft = draftFromServerLineItem({
      id: 'li-1', room: 'Living Room', description: 'x', quantity: 1, unit: 'SF',
      pricingSource: 'ai_suggested', providerModel: { provider: 'openai', model: 'gpt-4o-mini', promptVersion: 'v1' },
    });
    expect(draft.providerModel).toBeUndefined();
  });

  it('an ai_suggested line item with no appliedProposalId/appliedSuggestionId contributes nothing to appliedProposals (a carried-forward item -- server trusts it via its OWN prior-revision history, not a fresh proposal)', () => {
    const li = { ...emptyCanonicalLineItem(), id: 'li-1', pricingSource: 'ai_suggested' };
    const payload = buildCanonicalEstimatePayload({
      serverEstimate: null, currency: 'USD', region: '', changeSummary: '', overheadProfitPercent: '0', taxRatePercent: '0',
      lineItems: [li], permits: [], generalConditions: [], manualAdjustments: [],
    });
    expect(payload.appliedProposals).toEqual([]);
    expect(payload.lineItems[0].appliedSuggestionId).toBeUndefined();
  });

  it('a freshly-applied suggestion (appliedProposalId + appliedSuggestionId set by mergeProposedPricingIntoLineItems) builds a correct appliedProposals entry and forwards appliedSuggestionId per line item', () => {
    const li = {
      ...emptyCanonicalLineItem(), id: 'li-1', pricingSource: 'ai_suggested',
      appliedProposalId: 'pp-1', appliedSuggestionId: 'sug-1',
    };
    const payload = buildCanonicalEstimatePayload({
      serverEstimate: null, currency: 'USD', region: '', changeSummary: '', overheadProfitPercent: '0', taxRatePercent: '0',
      lineItems: [li], permits: [], generalConditions: [], manualAdjustments: [],
    });
    expect(payload.appliedProposals).toEqual([{ proposalId: 'pp-1', acceptedSuggestionIds: ['sug-1'] }]);
    expect(payload.lineItems[0].appliedSuggestionId).toBe('sug-1');
    expect(payload.lineItems[0].providerModel).toBeUndefined();
  });

  it('two applied suggestions from the SAME proposal group into one appliedProposals entry with both suggestionIds', () => {
    const liA = { ...emptyCanonicalLineItem(), id: 'li-1', pricingSource: 'ai_suggested', appliedProposalId: 'pp-1', appliedSuggestionId: 'sug-1' };
    const liB = { ...emptyCanonicalLineItem(), id: 'li-2', pricingSource: 'ai_suggested', appliedProposalId: 'pp-1', appliedSuggestionId: 'sug-2' };
    const payload = buildCanonicalEstimatePayload({
      serverEstimate: null, currency: 'USD', region: '', changeSummary: '', overheadProfitPercent: '0', taxRatePercent: '0',
      lineItems: [liA, liB], permits: [], generalConditions: [], manualAdjustments: [],
    });
    expect(payload.appliedProposals).toHaveLength(1);
    expect(payload.appliedProposals[0].proposalId).toBe('pp-1');
    expect(payload.appliedProposals[0].acceptedSuggestionIds.sort()).toEqual(['sug-1', 'sug-2']);
  });

  it('applied suggestions from TWO DIFFERENT proposals produce two separate appliedProposals entries', () => {
    const liA = { ...emptyCanonicalLineItem(), id: 'li-1', pricingSource: 'ai_suggested', appliedProposalId: 'pp-1', appliedSuggestionId: 'sug-1' };
    const liB = { ...emptyCanonicalLineItem(), id: 'li-2', pricingSource: 'ai_suggested', appliedProposalId: 'pp-2', appliedSuggestionId: 'sug-9' };
    const payload = buildCanonicalEstimatePayload({
      serverEstimate: null, currency: 'USD', region: '', changeSummary: '', overheadProfitPercent: '0', taxRatePercent: '0',
      lineItems: [liA, liB], permits: [], generalConditions: [], manualAdjustments: [],
    });
    expect(payload.appliedProposals.map((p) => p.proposalId).sort()).toEqual(['pp-1', 'pp-2']);
  });

  it('a manually-priced item (pricingSource manual) with a leftover appliedSuggestionId is NOT included in appliedProposals -- only an actual ai_suggested item counts', () => {
    const li = { ...emptyCanonicalLineItem(), id: 'li-1', pricingSource: 'manual', appliedProposalId: 'pp-1', appliedSuggestionId: 'sug-1' };
    const payload = buildCanonicalEstimatePayload({
      serverEstimate: null, currency: 'USD', region: '', changeSummary: '', overheadProfitPercent: '0', taxRatePercent: '0',
      lineItems: [li], permits: [], generalConditions: [], manualAdjustments: [],
    });
    expect(payload.appliedProposals).toEqual([]);
  });
});

describe('permits, general conditions, manual adjustments, tax, and O&P', () => {
  it('the $550/$55/$44/$649 verified reference case reproduces exactly at preview level (O&P excluded from tax basis)', () => {
    const li = { ...emptyCanonicalLineItem(), quantity: '1', materialUnitCost: '550', laborUnitCost: '0', taxable: true };
    const totals = computeEstimatePreviewTotals([li], [], [], [], '10', '8');
    expect(totals.lineSubtotal).toBe(550);
    expect(totals.directCost).toBe(550);
    expect(totals.taxableBasis).toBe(550, 'O&P is never folded into the taxable basis');
    expect(totals.op).toBe(55);
    expect(totals.tax).toBe(44);
    expect(totals.grandTotal).toBe(649);
  });

  it('permits/GC/adjustments add to direct cost, and only taxable-flagged entries enter the taxable basis', () => {
    const totals = computeEstimatePreviewTotals(
      [],
      [{ amount: '100', taxable: false }], // permit, non-taxable
      [{ amount: '50', taxable: true }], // general conditions, taxable
      [{ amount: '-20', taxable: true }], // manual adjustment (credit)
      '0',
      '10'
    );
    expect(totals.directCost).toBe(130); // 100 + 50 - 20
    expect(totals.taxableBasis).toBe(30); // only the taxable GC (50) + taxable adjustment (-20)
    expect(totals.tax).toBeCloseTo(3, 5); // 10% of 30
  });

  it('buildCanonicalEstimatePayload sends O&P%/tax% as numbers and trims labeled-amount descriptions', () => {
    const payload = buildCanonicalEstimatePayload({
      serverEstimate: null, currency: 'usd', region: '  TX  ', changeSummary: '', overheadProfitPercent: '12.5', taxRatePercent: '8',
      lineItems: [emptyCanonicalLineItem()],
      permits: [{ id: 'p1', description: '  Permit fee  ', amount: '75', taxable: false }],
      generalConditions: [], manualAdjustments: [],
    });
    expect(payload.overheadProfitPercent).toBe(12.5);
    expect(payload.taxRatePercent).toBe(8);
    expect(payload.currency).toBe('USD');
    expect(payload.locationContext.region).toBe('TX');
    expect(payload.permits[0]).toEqual({ id: 'p1', description: 'Permit fee', amount: 75, taxable: false });
  });
});

describe('authoritative server totals replace the client preview', () => {
  it('draftFromServerEstimate maps the PUT/GET response\'s real O&P%/tax% back into editable fields exactly (what applyServerEstimate uses after a save)', () => {
    const serverEstimate = {
      currency: 'USD',
      locationContext: { region: 'Austin, TX' },
      lineItems: [{ id: 'li-1', room: 'Kitchen', category: 'Drywall', description: 'Replace drywall', quantity: 1, unit: 'SF', unitPrice: 15, taxable: true }],
      permits: [{ id: 'p1', description: 'Permit', amount: 20, taxable: false }],
      totals: { overheadProfitPercent: 10, taxRatePercent: 8, grandTotal: 649 },
    };
    const draft = draftFromServerEstimate(serverEstimate);
    expect(draft.overheadProfitPercent).toBe('10');
    expect(draft.taxRatePercent).toBe('8');
    expect(draft.region).toBe('Austin, TX');
    expect(draft.lineItems[0].id).toBe('li-1');
    expect(draft.permits[0].amount).toBe('20');
  });

  it('a manipulated/attacker-supplied totals field on the server response is never read by the mapping (only real fields are consumed)', () => {
    const serverEstimate = {
      lineItems: [{ id: 'li-1', room: 'Kitchen', category: 'Drywall', description: 'x', quantity: 1, unit: 'SF', unitPrice: 10 }],
      totals: { overheadProfitPercent: 5, taxRatePercent: 5, grandTotal: 999999999 },
    };
    const draft = draftFromServerEstimate(serverEstimate);
    // draftFromServerEstimate has no field that would ever surface grandTotal
    // as an editable number -- proven by exhaustively checking its keys.
    expect(Object.keys(draft).sort()).toEqual(
      ['currency', 'generalConditions', 'lineItems', 'manualAdjustments', 'overheadProfitPercent', 'permits', 'region', 'taxRatePercent'].sort()
    );
  });
});

describe('photo linking / unlinking', () => {
  it('toggleLineItemEvidence links an unlinked photo, then unlinks it again on a second toggle', () => {
    const list = [{ ...emptyCanonicalLineItem(), evidencePhotoIds: [] }];
    const linked = toggleLineItemEvidence(list, 0, 'photo-1');
    expect(linked[0].evidencePhotoIds).toEqual(['photo-1']);
    const unlinked = toggleLineItemEvidence(linked, 0, 'photo-1');
    expect(unlinked[0].evidencePhotoIds).toEqual([]);
  });

  it('toggleLineItemEvidence only affects the targeted line item, leaving siblings untouched', () => {
    const list = [
      { ...emptyCanonicalLineItem(), id: 'a', evidencePhotoIds: [] },
      { ...emptyCanonicalLineItem(), id: 'b', evidencePhotoIds: ['photo-2'] },
    ];
    const next = toggleLineItemEvidence(list, 0, 'photo-1');
    expect(next[0].evidencePhotoIds).toEqual(['photo-1']);
    expect(next[1].evidencePhotoIds).toEqual(['photo-2'], 'sibling line item is untouched');
  });

  it('buildCanonicalEstimatePayload forwards evidencePhotoIds verbatim per line item', () => {
    const li = { ...emptyCanonicalLineItem(), evidencePhotoIds: ['p1', 'p2'] };
    const payload = buildCanonicalEstimatePayload({
      serverEstimate: null, currency: 'USD', region: '', changeSummary: '', overheadProfitPercent: '0', taxRatePercent: '0',
      lineItems: [li], permits: [], generalConditions: [], manualAdjustments: [],
    });
    expect(payload.lineItems[0].evidencePhotoIds).toEqual(['p1', 'p2']);
  });
});

describe('validation errors', () => {
  it('rejects an empty line-item list', () => {
    expect(validateCanonicalEstimateDraft([])).toMatch(/at least one line item/i);
  });
  it('requires a category or trade', () => {
    const li = { ...emptyCanonicalLineItem(), category: '', trade: '', room: 'Kitchen', description: 'x', quantity: '1' };
    expect(validateCanonicalEstimateDraft([li])).toMatch(/category or trade/i);
  });
  it('requires a room/area', () => {
    const li = { ...emptyCanonicalLineItem(), category: 'Drywall', room: '', description: 'x', quantity: '1' };
    expect(validateCanonicalEstimateDraft([li])).toMatch(/room\/area/i);
  });
  it('requires a description', () => {
    const li = { ...emptyCanonicalLineItem(), category: 'Drywall', room: 'Kitchen', description: '', quantity: '1' };
    expect(validateCanonicalEstimateDraft([li])).toMatch(/description/i);
  });
  it('requires a positive quantity', () => {
    const li = { ...emptyCanonicalLineItem(), category: 'Drywall', room: 'Kitchen', description: 'x', quantity: '0' };
    expect(validateCanonicalEstimateDraft([li])).toMatch(/positive quantity/i);
  });
  it('requires a reason when overriding the unit price', () => {
    const li = { ...emptyCanonicalLineItem(), category: 'Drywall', room: 'Kitchen', description: 'x', quantity: '1', overrideActive: true, overrideReason: '' };
    expect(validateCanonicalEstimateDraft([li])).toMatch(/reason is required/i);
  });
  it('passes for a fully valid draft', () => {
    const li = { ...emptyCanonicalLineItem(), category: 'Drywall', room: 'Kitchen', description: 'Replace drywall', quantity: '1' };
    expect(validateCanonicalEstimateDraft([li])).toBeNull();
  });
});

describe('save error classification (409 conflict, 403 unauthorized, network, validation, finalized)', () => {
  it('no err.response at all -> network error (Retry resubmits)', () => {
    expect(classifyCanonicalEstimateSaveError({})).toEqual({
      kind: 'network', message: 'Network error -- check your connection, then Retry.',
    });
  });
  it('409 REVISION_CONFLICT -> conflict, carrying currentRevision for a "Discard & Reload" action', () => {
    const err = { response: { status: 409, data: { code: 'REVISION_CONFLICT', error: 'stale', currentRevision: 4 } } };
    expect(classifyCanonicalEstimateSaveError(err)).toEqual({ kind: 'conflict', message: 'stale', currentRevision: 4 });
  });
  it('409 REPORT_FINALIZED -> finalized', () => {
    const err = { response: { status: 409, data: { code: 'REPORT_FINALIZED', error: 'locked' } } };
    expect(classifyCanonicalEstimateSaveError(err)).toEqual({ kind: 'finalized', message: 'locked' });
  });
  it('403 -> unauthorized, with a sensible default message if the server omits one', () => {
    expect(classifyCanonicalEstimateSaveError({ response: { status: 403, data: {} } })).toEqual({
      kind: 'unauthorized', message: 'You do not have permission to save this estimate.',
    });
  });
  it('400 VALIDATION_ERROR/MIXED_CURRENCY/UNSUPPORTED_SCHEMA_VERSION -> validation, message passed through verbatim', () => {
    const err = { response: { status: 400, data: { code: 'MIXED_CURRENCY', error: 'currency mismatch' } } };
    expect(classifyCanonicalEstimateSaveError(err)).toEqual({ kind: 'validation', message: 'currency mismatch' });
  });
  it('an unrecognized error code/status -> unknown, with a generic fallback message', () => {
    expect(classifyCanonicalEstimateSaveError({ response: { status: 500, data: {} } })).toEqual({
      kind: 'unknown', message: 'Could not save the estimate.',
    });
  });
});

describe('duplicate-save prevention and unsaved-changes warning', () => {
  it('canStartCanonicalEstimateSave refuses a second concurrent save', () => {
    expect(canStartCanonicalEstimateSave({ saving: true, readOnly: false })).toBe(false);
  });
  it('canStartCanonicalEstimateSave refuses any save while read-only', () => {
    expect(canStartCanonicalEstimateSave({ saving: false, readOnly: true })).toBe(false);
  });
  it('canStartCanonicalEstimateSave allows a save when idle and editable', () => {
    expect(canStartCanonicalEstimateSave({ saving: false, readOnly: false })).toBe(true);
  });
  it('shouldWarnBeforeClosingCanonicalEstimateEditor warns only when dirty and not mid-save', () => {
    expect(shouldWarnBeforeClosingCanonicalEstimateEditor({ dirty: true, saving: false })).toBe(true);
    expect(shouldWarnBeforeClosingCanonicalEstimateEditor({ dirty: false, saving: false })).toBe(false);
    expect(shouldWarnBeforeClosingCanonicalEstimateEditor({ dirty: true, saving: true })).toBe(false);
  });
});

describe('finalized-report read-only state', () => {
  it('a finalized report is read-only even for its own editor-capable owner', () => {
    expect(isCanonicalEstimateReadOnly({ isFinalized: true, canEdit: true })).toBe(true);
  });
  it('a non-finalized report is read-only for a viewer without edit capability', () => {
    expect(isCanonicalEstimateReadOnly({ isFinalized: false, canEdit: false })).toBe(true);
  });
  it('an editable, non-finalized report is NOT read-only', () => {
    expect(isCanonicalEstimateReadOnly({ isFinalized: false, canEdit: true })).toBe(false);
  });
});

describe('server-shape mapping helpers used directly (draftFromServerLineItem, emptyLabeledAmount)', () => {
  it('draftFromServerLineItem carries override provenance (reason) into the editable draft', () => {
    const draft = draftFromServerLineItem({
      id: 'li-1', room: 'Kitchen', category: 'Drywall', description: 'x', quantity: 2, unit: 'SF',
      unitPrice: 42, userOverride: { active: true, reason: 'Contractor quote' },
    });
    expect(draft.overrideActive).toBe(true);
    expect(draft.overrideReason).toBe('Contractor quote');
    expect(draft.unitPriceOverride).toBe('42');
  });

  it('emptyLabeledAmount defaults to taxable and a unique id', () => {
    const row = emptyLabeledAmount();
    expect(row.taxable).toBe(true);
    expect(row.amount).toBe('0');
    expect(row.id).toMatch(/^amt_/);
  });
});
