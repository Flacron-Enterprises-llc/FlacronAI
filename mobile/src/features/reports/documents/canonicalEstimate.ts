/**
 * TypeScript port of frontend/src/utils/canonicalEstimateEditor.js + the apply/request helpers in
 * frontend/src/utils/pricingSuggestions.js. Same draft shape, validation messages and payload, so a Detailed Estimate
 * saved from the app is identical to one saved from the web. The server recomputes every total; these are previews.
 */
export const CANONICAL_UNIT_OPTIONS = ['SF', 'LF', 'SY', 'CY', 'EA', 'HR', 'DAY', 'LOAD', 'VISIT', 'ALLOWANCE', 'LS'] as const;
export const CANONICAL_CONFIDENCE_OPTIONS = ['low', 'medium', 'high'] as const;
export const CANONICAL_STATUS_OPTIONS = ['preliminary', 'confirmed'] as const;

export interface DraftLineItem {
  id: string;
  room: string;
  trade: string;
  category: string;
  damageType: string;
  repairAction: string;
  description: string;
  material: string;
  quantity: string;
  unit: string;
  materialUnitCost: string;
  laborUnitCost: string;
  equipmentUnitCost: string;
  overrideActive: boolean;
  unitPriceOverride: string;
  overrideReason: string;
  taxable: boolean;
  assumptions: string;
  confidence: string;
  lineStatus: string;
  evidencePhotoIds: string[];
  pricingSource: string;
  appliedProposalId?: string;
  appliedSuggestionId?: string;
}

export interface DraftAmount {
  id: string;
  description: string;
  amount: string;
  taxable: boolean;
}

export interface CanonicalDraft {
  currency: string;
  region: string;
  lineItems: DraftLineItem[];
  permits: DraftAmount[];
  generalConditions: DraftAmount[];
  manualAdjustments: DraftAmount[];
  overheadProfitPercent: string;
  taxRatePercent: string;
}

/** Server estimate (GET/PUT /:id/canonical-estimate), only the fields the editor reads. */
export interface ServerCanonicalEstimate {
  revision?: number;
  schemaVersion?: number;
  currency?: string;
  status?: string;
  locationContext?: { region?: string };
  lineItems?: Record<string, unknown>[];
  permits?: Record<string, unknown>[];
  generalConditions?: Record<string, unknown>[];
  manualAdjustments?: Record<string, unknown>[];
  totals?: Record<string, unknown>;
  updatedAt?: string;
  [key: string]: unknown;
}

export const newStableId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const emptyCanonicalLineItem = (): DraftLineItem => ({
  id: newStableId('li'),
  room: '',
  trade: '',
  category: '',
  damageType: '',
  repairAction: '',
  description: '',
  material: '',
  quantity: '1',
  unit: 'SF',
  materialUnitCost: '0',
  laborUnitCost: '0',
  equipmentUnitCost: '0',
  overrideActive: false,
  unitPriceOverride: '0',
  overrideReason: '',
  taxable: true,
  assumptions: '',
  confidence: 'medium',
  lineStatus: 'preliminary',
  evidencePhotoIds: [],
  pricingSource: 'manual',
});

export const emptyLabeledAmount = (taxable = true): DraftAmount => ({ id: newStableId('amt'), description: '', amount: '0', taxable });

const s = (v: unknown) => (typeof v === 'string' ? v : '');
const n = (v: unknown, d = 0) => String(v ?? d);

export const draftFromServerLineItem = (li: Record<string, unknown>): DraftLineItem => {
  const override = (li.userOverride ?? null) as { active?: boolean; reason?: string } | null;
  return {
    id: String(li.id),
    room: s(li.room),
    trade: s(li.trade),
    category: s(li.category),
    damageType: s(li.damageType),
    repairAction: s(li.repairAction),
    description: s(li.description),
    material: s(li.material),
    quantity: n(li.quantity, 1),
    unit: s(li.unit) || 'SF',
    materialUnitCost: n(li.materialUnitCost),
    laborUnitCost: n(li.laborUnitCost),
    equipmentUnitCost: n(li.equipmentUnitCost),
    overrideActive: !!override?.active,
    unitPriceOverride: n(li.unitPrice),
    overrideReason: override?.reason || '',
    taxable: li.taxable !== false,
    assumptions: s(li.assumptions),
    confidence: s(li.confidence) || 'medium',
    lineStatus: s(li.lineStatus) || 'preliminary',
    evidencePhotoIds: Array.isArray(li.evidencePhotoIds) ? (li.evidencePhotoIds as string[]) : [],
    pricingSource: s(li.pricingSource) || 'manual',
  };
};

export const draftFromServerAmount = (row: Record<string, unknown>): DraftAmount => ({
  id: String(row.id),
  description: s(row.description),
  amount: n(row.amount),
  taxable: row.taxable !== false,
});

export const draftFromServerEstimate = (est: ServerCanonicalEstimate | null): CanonicalDraft => ({
  currency: est?.currency || 'USD',
  region: est?.locationContext?.region || '',
  lineItems: est?.lineItems?.length ? est.lineItems.map(draftFromServerLineItem) : [emptyCanonicalLineItem()],
  permits: est?.permits?.map(draftFromServerAmount) || [],
  generalConditions: est?.generalConditions?.map(draftFromServerAmount) || [],
  manualAdjustments: est?.manualAdjustments?.map(draftFromServerAmount) || [],
  overheadProfitPercent: n(est?.totals?.overheadProfitPercent),
  taxRatePercent: n(est?.totals?.taxRatePercent),
});

export const reorderLineItems = <T>(list: T[], index: number, direction: number): T[] => {
  const j = index + direction;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
};

export const lineUnitPrice = (li: DraftLineItem) =>
  li.overrideActive
    ? parseAmount(li.unitPriceOverride) || 0
    : (parseAmount(li.materialUnitCost) || 0) + (parseAmount(li.laborUnitCost) || 0) + (parseAmount(li.equipmentUnitCost) || 0);

export function computeEstimatePreviewTotals(draft: Pick<CanonicalDraft, 'lineItems' | 'permits' | 'generalConditions' | 'manualAdjustments' | 'overheadProfitPercent' | 'taxRatePercent'>) {
  const items = draft.lineItems.map((li) => ({ total: (parseAmount(li.quantity) || 0) * lineUnitPrice(li), taxable: li.taxable !== false }));
  const sum = (rows: DraftAmount[], onlyTaxable = false) => rows.filter((r) => !onlyTaxable || r.taxable).reduce((t, r) => t + (parseAmount(r.amount) || 0), 0);
  const lineSubtotal = items.reduce((t, i) => t + i.total, 0);
  const permitsTotal = sum(draft.permits);
  const gcTotal = sum(draft.generalConditions);
  const adjTotal = sum(draft.manualAdjustments);
  const directCost = lineSubtotal + permitsTotal + gcTotal + adjTotal;
  const taxableBasis =
    items.filter((i) => i.taxable).reduce((t, i) => t + i.total, 0) +
    sum(draft.permits, true) +
    sum(draft.generalConditions, true) +
    sum(draft.manualAdjustments, true);
  const tax = taxableBasis * ((parseAmount(draft.taxRatePercent) || 0) / 100);
  const op = directCost * ((parseAmount(draft.overheadProfitPercent) || 0) / 100);
  return { lineSubtotal, permitsTotal, gcTotal, adjTotal, directCost, taxableBasis, tax, op, grandTotal: directCost + op + tax };
}

/** Parses a typed amount, tolerating "$" and thousands separators ("1,250.50" -> 1250.5). NaN when not a number. */
export function parseAmount(v: string | number | null | undefined): number {
  if (typeof v === 'number') return v;
  const t = String(v ?? '').replace(/[$,\s]/g, '');
  if (t === '' || t === '-') return 0;
  return /^-?\d*\.?\d+$|^-?\d+\.$/.test(t) ? Number(t) : NaN;
}

const joinList = (parts: string[]) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/**
 * Validates the whole draft at once and reports EVERY missing field per row ("Item 1: add a room/area, category and
 * description."), instead of stopping at the first problem. Returns null when the draft can be saved.
 */
export function validateCanonicalEstimateDraft(
  lineItems: DraftLineItem[],
  amountGroups: { label: string; rows: DraftAmount[]; allowNegative: boolean }[] = []
): string | null {
  if (!lineItems.length) return 'At least one line item is required.';
  const problems: string[] = [];
  lineItems.forEach((li, i) => {
    const missing: string[] = [];
    if (!li.room.trim()) missing.push('a room/area');
    if (!li.category.trim() && !li.trade.trim()) missing.push('a category');
    if (!li.description.trim()) missing.push('a description');
    const other: string[] = [];
    const qty = parseAmount(li.quantity);
    if (!(qty > 0)) other.push('quantity must be greater than 0');
    for (const [k, label] of [['materialUnitCost', 'material'], ['laborUnitCost', 'labor'], ['equipmentUnitCost', 'equipment']] as const) {
      const n = parseAmount(li[k]);
      if (Number.isNaN(n) || n < 0) other.push(`${label} cost must be a number of 0 or more`);
    }
    if (li.overrideActive && !li.overrideReason.trim()) other.push('a reason is required for the price override');
    const msg = [missing.length ? `add ${joinList(missing)}` : '', ...other].filter(Boolean).join('; ');
    if (msg) problems.push(`Item ${i + 1}: ${msg}.`);
  });
  for (const g of amountGroups) {
    g.rows.forEach((r, i) => {
      const n = parseAmount(r.amount);
      const issues: string[] = [];
      if (!r.description.trim()) issues.push('add a description');
      if (Number.isNaN(n)) issues.push('amount must be a number');
      else if (!g.allowNegative && n < 0) issues.push("amount can't be negative");
      if (issues.length) problems.push(`${g.label} ${i + 1}: ${issues.join('; ')}.`);
    });
  }
  return problems.length ? problems.join('\n') : null;
}

function buildAppliedProposals(lineItems: DraftLineItem[]) {
  const byProposal = new Map<string, Set<string>>();
  for (const li of lineItems) {
    if (li.pricingSource !== 'ai_suggested' || !li.appliedProposalId || !li.appliedSuggestionId) continue;
    if (!byProposal.has(li.appliedProposalId)) byProposal.set(li.appliedProposalId, new Set());
    byProposal.get(li.appliedProposalId)!.add(li.appliedSuggestionId);
  }
  return [...byProposal.entries()].map(([proposalId, ids]) => ({ proposalId, acceptedSuggestionIds: [...ids] }));
}

export function buildCanonicalEstimatePayload(serverEstimate: ServerCanonicalEstimate | null, draft: CanonicalDraft, changeSummary: string) {
  const amounts = (rows: DraftAmount[]) => rows.map((r) => ({ id: r.id, description: r.description.trim(), amount: parseAmount(r.amount) || 0, taxable: r.taxable }));
  return {
    schemaVersion: serverEstimate?.schemaVersion,
    currency: draft.currency.trim().toUpperCase() || 'USD',
    locationContext: { region: draft.region.trim(), source: 'manual' as const },
    baseRevision: serverEstimate?.revision || 0,
    changeSummary: changeSummary.trim(),
    overheadProfitPercent: parseAmount(draft.overheadProfitPercent) || 0,
    taxRatePercent: parseAmount(draft.taxRatePercent) || 0,
    appliedProposals: buildAppliedProposals(draft.lineItems),
    lineItems: draft.lineItems.map((li) => {
      const item: Record<string, unknown> = {
        id: li.id,
        room: li.room.trim(),
        trade: li.trade.trim(),
        category: li.category.trim() || li.trade.trim(),
        damageType: li.damageType.trim(),
        repairAction: li.repairAction.trim(),
        description: li.description.trim(),
        material: li.material.trim(),
        quantity: parseAmount(li.quantity),
        unit: li.unit,
        materialUnitCost: parseAmount(li.materialUnitCost) || 0,
        laborUnitCost: parseAmount(li.laborUnitCost) || 0,
        equipmentUnitCost: parseAmount(li.equipmentUnitCost) || 0,
        taxable: li.taxable !== false,
        assumptions: li.assumptions.trim(),
        confidence: li.confidence,
        lineStatus: li.lineStatus,
        evidencePhotoIds: li.evidencePhotoIds,
        pricingSource: li.pricingSource || 'manual',
      };
      if (li.appliedSuggestionId) item.appliedSuggestionId = li.appliedSuggestionId;
      if (li.overrideActive) item.userOverride = { active: true, unitPrice: parseAmount(li.unitPriceOverride) || 0, reason: li.overrideReason.trim() };
      return item;
    }),
    permits: amounts(draft.permits),
    generalConditions: amounts(draft.generalConditions),
    manualAdjustments: amounts(draft.manualAdjustments),
  };
}

/* ---------------- Preliminary pricing (pricingSuggestions.js) ---------------- */

export interface PriceSuggestion {
  suggestionId: string;
  targetLineItemId?: string | null;
  room?: string;
  trade?: string;
  category?: string;
  damageType?: string;
  repairAction?: string;
  description?: string;
  material?: string;
  quantity?: number;
  unit?: string;
  materialUnitCost?: number;
  laborUnitCost?: number;
  equipmentUnitCost?: number;
  unitPrice?: number;
  lineTotal?: number;
  assumptions?: string;
  confidence?: string;
}

const CAP = { room: 100, damageType: 100, repairAction: 60, description: 300, material: 150, tradeOrCategory: 60 };
const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

export interface PricingLocation {
  country: string;
  state: string;
  city: string;
  postalCode: string;
}

export function validatePriceSuggestionsRequest(location: PricingLocation, targets: DraftLineItem[]): string | null {
  if (!clean(location.country, 60)) return 'A country is required to generate preliminary pricing.';
  if (!targets.length) return 'Select at least one item to price.';
  for (const t of targets) {
    if (!clean(t.room, CAP.room)) return 'Every item needs a room/area before pricing it.';
    if (!clean(t.description, CAP.description)) return 'Every item needs a description before pricing it.';
    if (!(Number(t.quantity) > 0)) return 'Every item needs a positive quantity before pricing it.';
  }
  return null;
}

export function buildPriceSuggestionsRequestPayload(location: PricingLocation, currency: string, targets: DraftLineItem[], regenerate: boolean) {
  return {
    locationContext: {
      country: clean(location.country, 60),
      state: clean(location.state, 60),
      city: clean(location.city, 100),
      postalCode: clean(location.postalCode, 20),
    },
    currency: (currency || 'USD').trim().toUpperCase(),
    regenerate,
    items: targets.map((t) => ({
      targetLineItemId: t.id ?? null,
      room: clean(t.room, CAP.room),
      damageType: clean(t.damageType, CAP.damageType),
      repairAction: clean(t.repairAction, CAP.repairAction),
      description: clean(t.description, CAP.description),
      material: clean(t.material, CAP.material),
      trade: clean(t.trade, CAP.tradeOrCategory),
      category: clean(t.category, CAP.tradeOrCategory),
      quantity: Number(t.quantity),
      unit: t.unit,
    })),
  };
}

/** Accepted suggestions merge into their target line (or append); a line with an active manual override is skipped. */
export function mergeProposedPricingIntoLineItems(existing: DraftLineItem[], proposalId: string, proposed: PriceSuggestion[], acceptedIds: string[]) {
  const accepted = new Set(acceptedIds);
  const lineItems = [...existing];
  const applied: { suggestionId: string; targetLineItemId: string; mode: 'merged' | 'appended' }[] = [];
  const skipped: { suggestionId: string; targetLineItemId: string; reason: 'user_override_active' }[] = [];
  const fields = (p: PriceSuggestion): Partial<DraftLineItem> => ({
    room: p.room || '',
    trade: p.trade || '',
    category: p.category || '',
    damageType: p.damageType || '',
    repairAction: p.repairAction || '',
    description: p.description || '',
    material: p.material || '',
    quantity: String(p.quantity ?? 1),
    unit: p.unit || 'SF',
    materialUnitCost: String(p.materialUnitCost ?? 0),
    laborUnitCost: String(p.laborUnitCost ?? 0),
    equipmentUnitCost: String(p.equipmentUnitCost ?? 0),
    assumptions: p.assumptions || '',
    confidence: p.confidence || 'medium',
    pricingSource: 'ai_suggested',
    appliedProposalId: proposalId,
    appliedSuggestionId: p.suggestionId,
  });
  for (const p of proposed) {
    if (!accepted.has(p.suggestionId)) continue;
    const bySource = lineItems.findIndex((li) => li.appliedSuggestionId === p.suggestionId);
    const byTarget = bySource === -1 && p.targetLineItemId ? lineItems.findIndex((li) => li.id === p.targetLineItemId) : -1;
    const idx = bySource !== -1 ? bySource : byTarget;
    if (idx !== -1) {
      const cur = lineItems[idx];
      if (cur.overrideActive) {
        skipped.push({ suggestionId: p.suggestionId, targetLineItemId: cur.id, reason: 'user_override_active' });
        continue;
      }
      lineItems[idx] = { ...cur, ...fields(p) };
      applied.push({ suggestionId: p.suggestionId, targetLineItemId: cur.id, mode: 'merged' });
    } else {
      const item = { ...emptyCanonicalLineItem(), ...fields(p) };
      lineItems.push(item);
      applied.push({ suggestionId: p.suggestionId, targetLineItemId: item.id, mode: 'appended' });
    }
  }
  return { lineItems, applied, skipped };
}
