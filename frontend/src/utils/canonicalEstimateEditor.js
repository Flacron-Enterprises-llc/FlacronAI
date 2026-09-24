// Phase 42 (Section 7 Rendering, Editor & Report Integration) -- 2026-09-18
// correction (CHECK 2). All of `CanonicalEstimateEditor`'s (ReportPreviewPage
// .jsx) business logic used to live inline inside the React component,
// meaning it had no dedicated test coverage of its own (only the backend
// renderer/persistence tests existed). This codebase has no React
// component-render test infrastructure (no @testing-library/react/jsdom
// dependency anywhere), so -- following the SAME convention already used
// for `estimateInvoiceEligibility.js`/`invoiceTotals.js`/`reportImmutability
// .js` -- every piece of logic that doesn't strictly require a live DOM
// (state-shape mapping, validation, payload building, preview computation,
// array-reorder/remove/toggle, error classification) is extracted here as
// pure functions and unit-tested directly. The component only wires these
// to React state/JSX.

export const CANONICAL_UNIT_OPTIONS = ['SF', 'LF', 'SY', 'CY', 'EA', 'HR', 'DAY', 'LOAD', 'VISIT', 'ALLOWANCE', 'LS'];
export const CANONICAL_CONFIDENCE_OPTIONS = ['low', 'medium', 'high'];
export const CANONICAL_STATUS_OPTIONS = ['preliminary', 'confirmed'];

// Stable client-generated IDs (never array indexes) -- sent to the server
// as-is and persisted verbatim, so no id-remapping is ever needed after a
// save (see canonicalEstimate.js's `id = cleanString(row.id, 60) || fallback`).
export const newStableId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const emptyCanonicalLineItem = () => ({
  id: newStableId('li'),
  room: '', trade: '', category: '', damageType: '', repairAction: '', description: '', material: '',
  quantity: '1', unit: 'SF',
  materialUnitCost: '0', laborUnitCost: '0', equipmentUnitCost: '0',
  overrideActive: false, unitPriceOverride: '0', overrideReason: '',
  taxable: true, assumptions: '', confidence: 'medium', lineStatus: 'preliminary',
  evidencePhotoIds: [],
  pricingSource: 'manual',
});

export const emptyLabeledAmount = () => ({ id: newStableId('amt'), description: '', amount: '0', taxable: true });

export const draftFromServerLineItem = (li) => ({
  id: li.id,
  room: li.room || '', trade: li.trade || '', category: li.category || '', damageType: li.damageType || '',
  repairAction: li.repairAction || '', description: li.description || '', material: li.material || '',
  quantity: String(li.quantity ?? 1), unit: li.unit || 'SF',
  materialUnitCost: String(li.materialUnitCost ?? 0),
  laborUnitCost: String(li.laborUnitCost ?? 0),
  equipmentUnitCost: String(li.equipmentUnitCost ?? 0),
  overrideActive: !!li.userOverride?.active,
  unitPriceOverride: String(li.unitPrice ?? 0),
  overrideReason: li.userOverride?.reason || '',
  taxable: li.taxable !== false,
  assumptions: li.assumptions || '',
  confidence: li.confidence || 'medium',
  lineStatus: li.lineStatus || 'preliminary',
  evidencePhotoIds: Array.isArray(li.evidencePhotoIds) ? li.evidencePhotoIds : [],
  pricingSource: li.pricingSource || 'manual',
  // Trust-boundary correction (2026-09-19): a reloaded line item's
  // `providerModel` is intentionally NOT carried into the editable draft at
  // all any more, and buildCanonicalEstimatePayload below never sends one.
  // The server is the sole owner of that metadata: it carries an already-
  // trusted item's providerModel forward itself on every subsequent save
  // (canonicalEstimate.js's `previousWasLegitimatelyAiSuggested` carry-
  // forward), so the client has no legitimate reason to ever read, hold, or
  // resend it -- removing the field here removes the temptation/surface for
  // a client to echo one back.
});

export const draftFromServerAmount = (row) => ({
  id: row.id, description: row.description || '', amount: String(row.amount ?? 0), taxable: row.taxable !== false,
});

// Maps a GET/PUT canonical-estimate response (or `null`, the legacy/no-
// estimate-yet case) into the editor's full draft shape -- always seeding
// at least one blank line item so the empty state is immediately editable,
// never a dead end. Used both on initial load and to replace the client
// preview with the server's authoritative state after a successful save.
export const draftFromServerEstimate = (est) => ({
  currency: est?.currency || 'USD',
  region: est?.locationContext?.region || '',
  lineItems: est?.lineItems?.length ? est.lineItems.map(draftFromServerLineItem) : [emptyCanonicalLineItem()],
  permits: est?.permits?.map(draftFromServerAmount) || [],
  generalConditions: est?.generalConditions?.map(draftFromServerAmount) || [],
  manualAdjustments: est?.manualAdjustments?.map(draftFromServerAmount) || [],
  overheadProfitPercent: String(est?.totals?.overheadProfitPercent ?? 0),
  taxRatePercent: String(est?.totals?.taxRatePercent ?? 0),
});

// Pure array operations -- each returns a NEW array (or, for a no-op move,
// the SAME reference) and never touches array indexes as persisted
// identity; every item keeps its own `id` through every operation.
export const reorderLineItems = (list, index, direction) => {
  const j = index + direction;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
};

export const removeLineItemAt = (list, index) => list.filter((_, idx) => idx !== index);

export const toggleLineItemEvidence = (list, index, photoId) =>
  list.map((li, idx) => {
    if (idx !== index) return li;
    const has = li.evidencePhotoIds.includes(photoId);
    return {
      ...li,
      evidencePhotoIds: has ? li.evidencePhotoIds.filter((p) => p !== photoId) : [...li.evidencePhotoIds, photoId],
    };
  });

// Client-side PREVIEW only -- mirrors Phase 41's documented roll-up order
// (line items -> + permits/GC/adjustments = direct cost -> taxable basis
// EXCLUDES O&P -> tax on taxable basis -> O&P on direct cost -> total). The
// server independently recomputes and returns the authoritative figures
// after save (`draftFromServerEstimate` above is what replaces this preview
// with that authoritative state) -- this is never submitted or trusted as
// final.
export const computeEstimatePreviewTotals = (
  lineItems,
  permits,
  generalConditions,
  manualAdjustments,
  overheadProfitPercent,
  taxRatePercent
) => {
  const lineTotal = (li) => {
    const comp = (Number(li.materialUnitCost) || 0) + (Number(li.laborUnitCost) || 0) + (Number(li.equipmentUnitCost) || 0);
    const unitPrice = li.overrideActive ? (Number(li.unitPriceOverride) || 0) : comp;
    return { unitPrice, total: (Number(li.quantity) || 0) * unitPrice, taxable: li.taxable !== false };
  };
  const items = lineItems.map(lineTotal);
  const lineSubtotal = items.reduce((s, i) => s + i.total, 0);
  const permitsTotal = permits.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const gcTotal = generalConditions.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const adjTotal = manualAdjustments.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const directCost = lineSubtotal + permitsTotal + gcTotal + adjTotal;
  const taxableBasis =
    items.filter((i) => i.taxable).reduce((s, i) => s + i.total, 0) +
    permits.filter((r) => r.taxable).reduce((s, r) => s + (Number(r.amount) || 0), 0) +
    generalConditions.filter((r) => r.taxable).reduce((s, r) => s + (Number(r.amount) || 0), 0) +
    manualAdjustments.filter((r) => r.taxable).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const tax = taxableBasis * ((Number(taxRatePercent) || 0) / 100);
  const op = directCost * ((Number(overheadProfitPercent) || 0) / 100);
  return { lineSubtotal, permitsTotal, gcTotal, adjTotal, directCost, taxableBasis, tax, op, grandTotal: directCost + op + tax };
};

// Client-side pre-check mirroring the server's own required-field/positive-
// quantity/override-reason validation (canonicalEstimate.js) -- gives fast
// feedback, but the server re-validates independently and is the only
// authority that can actually reject a save.
export const validateCanonicalEstimateDraft = (lineItems) => {
  if (!lineItems.length) return 'At least one line item is required.';
  for (const li of lineItems) {
    if (!li.category.trim() && !li.trade.trim()) return 'Every line item needs a category or trade.';
    if (!li.room.trim()) return 'Every line item needs a room/area.';
    if (!li.description.trim()) return 'Every line item needs a description.';
    if (!(Number(li.quantity) > 0)) return 'Every line item needs a positive quantity.';
    if (li.overrideActive && !li.overrideReason.trim()) return 'A reason is required when overriding a unit price.';
  }
  return null;
};

// Trust-boundary correction (2026-09-19): builds `appliedProposal` from
// whichever draft line items currently carry BOTH `appliedProposalId` and
// `appliedSuggestionId` (stamped only by mergeProposedPricingIntoLineItems
// -- see pricingSuggestions.js -- when a suggestion was actually merged in,
// never by hand-editing an ordinary field) AND still claim
// `pricingSource === 'ai_suggested'`. Grouped by proposalId since a user
// may Generate + Apply more than once (against different proposals) before
// a single Save; the server independently re-verifies every entry (see
// canonicalEstimateStore.js's resolveAppliedProposals) -- this is a request
// hint, never trusted at face value.
const buildAppliedProposals = (lineItems) => {
  const byProposalId = new Map();
  for (const li of lineItems) {
    if (li.pricingSource !== 'ai_suggested' || !li.appliedProposalId || !li.appliedSuggestionId) continue;
    if (!byProposalId.has(li.appliedProposalId)) byProposalId.set(li.appliedProposalId, new Set());
    byProposalId.get(li.appliedProposalId).add(li.appliedSuggestionId);
  }
  return [...byProposalId.entries()].map(([proposalId, suggestionIds]) => ({
    proposalId,
    acceptedSuggestionIds: [...suggestionIds],
  }));
};

export const buildCanonicalEstimatePayload = ({
  serverEstimate,
  currency,
  region,
  changeSummary,
  overheadProfitPercent,
  taxRatePercent,
  lineItems,
  permits,
  generalConditions,
  manualAdjustments,
}) => ({
  schemaVersion: serverEstimate?.schemaVersion,
  currency: currency.trim().toUpperCase() || 'USD',
  locationContext: { region: region.trim(), source: 'manual' },
  baseRevision: serverEstimate?.revision || 0,
  changeSummary: changeSummary.trim(),
  overheadProfitPercent: Number(overheadProfitPercent) || 0,
  taxRatePercent: Number(taxRatePercent) || 0,
  // Trust-boundary correction (2026-09-19): the server independently
  // re-verifies and re-resolves this against its own short-lived proposal
  // record -- see backend/utils/pricingProposalStore.js. Empty when no
  // AI-suggested item was applied since the last save (the common case),
  // which is a harmless no-op server-side.
  appliedProposals: buildAppliedProposals(lineItems),
  lineItems: lineItems.map((li) => {
    const payloadItem = {
      id: li.id,
      room: li.room.trim(),
      trade: li.trade.trim(),
      category: li.category.trim() || li.trade.trim(),
      damageType: li.damageType.trim(),
      repairAction: li.repairAction.trim(),
      description: li.description.trim(),
      material: li.material.trim(),
      quantity: Number(li.quantity),
      unit: li.unit,
      materialUnitCost: Number(li.materialUnitCost) || 0,
      laborUnitCost: Number(li.laborUnitCost) || 0,
      equipmentUnitCost: Number(li.equipmentUnitCost) || 0,
      taxable: li.taxable !== false,
      assumptions: li.assumptions.trim(),
      confidence: li.confidence,
      lineStatus: li.lineStatus,
      evidencePhotoIds: li.evidencePhotoIds,
      // Phase 43: must be sent explicitly -- the server defaults an omitted
      // pricingSource to 'manual' (canonicalEstimate.js), so without this an
      // AI-accepted item would silently revert to "manual" on save and the
      // "Pricing Source generated by: Flacron Engine" label would never
      // appear. This is only a HINT, never trusted at face value: the
      // server downgrades an 'ai_suggested' claim back to 'manual' unless
      // it's backed by a matching entry in `appliedProposals` above or a
      // legitimate carry-forward from an already-trusted prior save (see
      // canonicalEstimate.js's validateLineItems).
      pricingSource: li.pricingSource || 'manual',
    };
    // Trust-boundary correction (2026-09-19): `providerModel` is NEVER sent
    // -- it is now exclusively server-owned metadata (see this file's
    // draftFromServerLineItem comment). `appliedSuggestionId` (an OPAQUE
    // handle, never a provider/model string) is included only for an item
    // this save is actively applying trust to, so the server can match this
    // row to the corresponding entry in `appliedProposals` above.
    if (li.appliedSuggestionId) payloadItem.appliedSuggestionId = li.appliedSuggestionId;
    if (li.overrideActive) {
      payloadItem.userOverride = { active: true, unitPrice: Number(li.unitPriceOverride) || 0, reason: li.overrideReason.trim() };
    }
    return payloadItem;
  }),
  permits: permits.map((r) => ({ id: r.id, description: r.description.trim(), amount: Number(r.amount) || 0, taxable: r.taxable })),
  generalConditions: generalConditions.map((r) => ({ id: r.id, description: r.description.trim(), amount: Number(r.amount) || 0, taxable: r.taxable })),
  manualAdjustments: manualAdjustments.map((r) => ({ id: r.id, description: r.description.trim(), amount: Number(r.amount) || 0, taxable: r.taxable })),
});

// Classifies a failed `PUT /canonical-estimate` axios error into exactly
// one of the states the editor's UI branches on. `err.response` absent =>
// the request never reached the server (offline/DNS/timeout) => 'network'
// (Retry resubmits the same payload); every other case reads the server's
// own {code, error} envelope.
export const classifyCanonicalEstimateSaveError = (err) => {
  const data = err?.response?.data;
  const status = err?.response?.status;
  if (!err?.response) {
    return { kind: 'network', message: 'Network error -- check your connection, then Retry.' };
  }
  if (data?.code === 'REVISION_CONFLICT') {
    return { kind: 'conflict', message: data.error, currentRevision: data.currentRevision };
  }
  if (data?.code === 'REPORT_FINALIZED') {
    return { kind: 'finalized', message: data.error };
  }
  if (status === 403) {
    return { kind: 'unauthorized', message: data?.error || 'You do not have permission to save this estimate.' };
  }
  if (['VALIDATION_ERROR', 'MIXED_CURRENCY', 'UNSUPPORTED_SCHEMA_VERSION'].includes(data?.code)) {
    return { kind: 'validation', message: data.error };
  }
  return { kind: 'unknown', message: data?.error || 'Could not save the estimate.' };
};

// Duplicate-submission guard -- a second click while a save is already in
// flight, or any attempt on a read-only (finalized/non-editor) view, is a
// no-op rather than firing a second overlapping request.
export const canStartCanonicalEstimateSave = ({ saving, readOnly }) => !saving && !readOnly;

// Whether closing the editor needs an explicit confirmation first -- true
// only when there are unsaved edits and no save is currently in flight (a
// save-in-progress close is handled by disabling the close button itself,
// not this warning).
export const shouldWarnBeforeClosingCanonicalEstimateEditor = ({ dirty, saving }) => dirty && !saving;

// Finalized-report immutability (Golden Rule #3) always wins over edit
// capability -- a finalized report is read-only for every viewer, including
// its own owner.
export const isCanonicalEstimateReadOnly = ({ isFinalized, canEdit }) => !!isFinalized || !canEdit;
