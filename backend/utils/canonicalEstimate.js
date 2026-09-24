// Phase 41 (Canonical Structured Estimate Data Model & Calculation Engine).
// Pure, dependency-free validation + calculation engine for the canonical,
// versioned, structured Section 7 estimate that the PRIMARY report owns.
// This is deliberately a SEPARATE module from estimateCalculations.js (the
// existing standalone `RepairEstimate` document's math) -- per the approved
// architecture, the canonical estimate is never coupled to that sibling
// document's lifecycle, and this phase must not change its behavior or
// totals. Any resemblance in style (cents-based money, cleanString, finite/
// range validation) is intentional reuse of a proven pattern, not shared
// code -- see CLAUDE.md Golden Rule #7 (micro-changes only) and the Phase 41
// task's explicit instruction not to couple the two lifecycles.
//
// Money discipline: every amount is validated/computed in INTEGER CENTS
// first; a `xCents` field is always the authoritative value, with a decimal-
// dollar mirror (no `Cents` suffix) returned alongside for convenience/
// display, matching estimateCalculations.js's own convention. No float
// money math ever crosses a rounding boundary more than once per figure.
//
// Golden Rule #2/#4: this module never calls AI and never invents a price --
// `pricingSource`/`providerModel` are placeholder metadata for Phase 43 to
// populate; every dollar figure here comes only from adjuster/user-entered
// component costs or an explicit, provenance-preserved manual override.

const CANONICAL_ESTIMATE_SCHEMA_VERSION = 1;
const SUPPORTED_SCHEMA_VERSIONS = new Set([1]);

const MAX_LINE_ITEMS = 500;
const MAX_LABELED_AMOUNTS = 50; // permits / generalConditions / manualAdjustments, each
const MAX_MONEY = 100_000_000; // dollars ceiling -- blocks overflow/garbage input
const MAX_QTY = 1_000_000;
const MAX_EVIDENCE_PER_LINE = 30;
const MAX_UNIT_PRICE_RECONCILE_TOLERANCE_CENTS = 1; // rounding slack only

const DEFAULT_CURRENCY = 'USD';
const CURRENCY_RE = /^[A-Z]{3}$/;

// Centrally configurable unit vocabulary superset (Phase 44's PlanConfig will
// make this admin-editable; hardcoded here for Phase 41). Units are matched
// case-insensitively and normalized to uppercase.
const UNIT_VOCABULARY = new Set([
  'SF', 'LF', 'SY', 'CY', 'EA', 'HR', 'DAY', 'LOAD', 'VISIT', 'ALLOWANCE', 'LS',
]);

// Action vocabulary superset -- exported for future admin/UI use (Phase 44+).
// Not enforced as a hard validation gate in Phase 41: `repairAction` is
// otherwise free text, since real-world trade actions vary too widely to
// safely hard-code an exhaustive enum this early.
const ACTION_VOCABULARY = [
  'Replace', 'Repair', 'Remove', 'Install', 'Clean', 'Paint', 'Detach & Reset',
  'Tear Out', 'Secure', 'Stabilize', 'Allowance', 'Finish', 'Texture', 'Manage',
  'Monitor', 'Dry',
];

const CONFIDENCE_LEVELS = new Set(['low', 'medium', 'high']);
const PRICING_SOURCES = new Set(['manual', 'price_list', 'ai_suggested', 'historical']);
const LINE_STATUSES = new Set(['preliminary', 'confirmed']);

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);
const toCents = (dollars) => Math.round(dollars * 100);
const centsToAmount = (cents) => cents / 100;
const cleanString = (v, maxLen) => String(v ?? '').trim().slice(0, maxLen);

const isValidCurrency = (code) => typeof code === 'string' && CURRENCY_RE.test(code);

const normalizeCurrency = (raw) => {
  if (raw === undefined || raw === null || raw === '') return { value: DEFAULT_CURRENCY };
  const code = String(raw).trim().toUpperCase();
  if (!isValidCurrency(code)) {
    return { error: `currency must be a 3-letter ISO 4217 code (received "${raw}")` };
  }
  return { value: code };
};

const normalizeSchemaVersion = (raw) => {
  if (raw === undefined || raw === null) return { value: CANONICAL_ESTIMATE_SCHEMA_VERSION };
  const version = Number(raw);
  if (!Number.isInteger(version) || !SUPPORTED_SCHEMA_VERSIONS.has(version)) {
    return {
      error: `Unsupported estimate schemaVersion "${raw}" -- this server supports version(s): ${[...SUPPORTED_SCHEMA_VERSIONS].join(', ')}`,
    };
  }
  return { value: version };
};

// A 0-100 percentage input (overheadProfitPercent / taxRatePercent).
const validatePercent = (value, label) => {
  if (value === undefined || value === null || value === '') return { value: 0 };
  const n = Number(value);
  if (!isFiniteNumber(n) || n < 0 || n > 100) {
    return { error: `${label} must be a finite number between 0 and 100` };
  }
  return { value: n };
};

// A single money component (materialUnitCost/laborUnitCost/equipmentUnitCost/
// permit or adjustment amount). Negative is allowed only when `allowNegative`
// (manual adjustments may be a credit); otherwise must be >= 0.
const validateMoney = (value, label, { allowNegative = false, defaultValue = 0 } = {}) => {
  if (value === undefined || value === null || value === '') return { value: defaultValue };
  const n = Number(value);
  if (!isFiniteNumber(n) || Math.abs(n) > MAX_MONEY || (!allowNegative && n < 0)) {
    return {
      error: allowNegative
        ? `${label} must be a finite number with magnitude no greater than ${MAX_MONEY}`
        : `${label} must be a non-negative finite number no greater than ${MAX_MONEY}`,
    };
  }
  return { value: n };
};

// Validates + normalizes evidence photo IDs against the SET of photo IDs
// that actually exist on THIS report's own `photos` array. This is the
// structural boundary that makes a cross-report photo reference impossible:
// callers always pass the CURRENT report's own photo IDs, read fresh inside
// the same transaction as the write (see canonicalEstimateStore.js) -- an ID
// belonging to another report's photos array is never in this set.
const validateEvidencePhotoIds = (raw, existingPhotoIds, label) => {
  if (raw === undefined || raw === null) return { value: [] };
  if (!Array.isArray(raw)) return { error: `${label} must be an array of photo IDs` };
  if (raw.length > MAX_EVIDENCE_PER_LINE) {
    return { error: `${label} may reference at most ${MAX_EVIDENCE_PER_LINE} photos` };
  }
  const ids = [...new Set(raw.map((id) => cleanString(id, 100)).filter(Boolean))];
  for (const id of ids) {
    if (!existingPhotoIds.has(id)) {
      return { error: `${label} references unknown or unowned photo ID "${id}"` };
    }
  }
  return { value: ids };
};

// --- Line items -------------------------------------------------------

const validateLineItems = (raw, existingPhotoIds, previousById, trustedOverridesByRowId) => {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'At least one line item is required' };
  }
  if (raw.length > MAX_LINE_ITEMS) {
    return { error: `At most ${MAX_LINE_ITEMS} line items are allowed` };
  }

  const items = [];
  const seenIds = new Set();
  const now = new Date().toISOString();

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] && typeof raw[i] === 'object' ? raw[i] : {};
    const label = `Line item ${i + 1}`;

    const id = cleanString(row.id, 60) || `li_${i}_${Math.random().toString(36).slice(2, 10)}`;
    if (seenIds.has(id)) return { error: `${label}: duplicate line item ID "${id}"` };
    seenIds.add(id);

    // Read `previous` (the same-id line item from the last persisted
    // revision, if any) up front -- both the trust resolution below AND
    // createdAt-preservation further down need it.
    const previous = previousById?.get(id);

    // Phase 43 trust-boundary correction (2026-09-19). `trustedOverridesByRowId`
    // (Map<lineItemId, trustedSuggestion>) is built by canonicalEstimateStore
    // .js's resolveAppliedProposals BEFORE this function is ever called --
    // it is the ONLY source of a matched row's trusted AI-pricing metadata.
    // A row already carrying a user override from a PRIOR save is never
    // re-trusted here even if the client's `appliedProposal` claims it --
    // this mirrors pricingSuggestions.js's own frontend skip rule
    // (mergeProposedPricingIntoLineItems never touches overrideActive===true)
    // at the server boundary too, so a raw API call can't bypass it.
    const previousOverrideActive = previous?.userOverride?.active === true;
    const trusted =
      trustedOverridesByRowId?.get(id) && !previousOverrideActive
        ? trustedOverridesByRowId.get(id)
        : null;

    const trade = cleanString(row.trade, 60);
    const category = cleanString(row.category, 60);
    const room = cleanString(row.room, 100);
    const damageType = cleanString(row.damageType, 100);
    const repairAction = cleanString(row.repairAction, 60);
    const description = cleanString(row.description, 300);
    const material = cleanString(row.material, 150);
    const assumptions = cleanString(row.assumptions, 500);

    if (!category) return { error: `${label}: category is required` };
    if (!room) return { error: `${label}: room is required` };
    if (!description) return { error: `${label}: description is required` };

    const qty = Number(row.quantity);
    if (!isFiniteNumber(qty) || qty <= 0 || qty > MAX_QTY) {
      return { error: `${label}: quantity must be a positive finite number no greater than ${MAX_QTY}` };
    }

    const unit = cleanString(row.unit, 10).toUpperCase();
    if (!UNIT_VOCABULARY.has(unit)) {
      return {
        error: `${label}: unit "${row.unit}" is not a supported unit (${[...UNIT_VOCABULARY].join(', ')})`,
      };
    }

    // Phase 43 trust-boundary correction: when this row is backed by a
    // freshly-verified trusted suggestion (`trusted`, resolved above), its
    // cost components are ALWAYS taken from the trusted proposal record,
    // never from the client's own submitted values -- a tamper attempt
    // (submitting a different materialUnitCost than the proposal actually
    // said) is silently replaced with the trusted figure rather than
    // rejected outright (Phase 41's engine recomputes every total from
    // these components anyway, so replace-with-trusted is safe and, unlike
    // an outright rejection, doesn't block the rest of an otherwise-valid
    // save). Structural/scope fields (room/description/quantity/unit/etc.)
    // are deliberately NOT reconciled here -- those always come from the
    // user's own request per the generation-time design (pricingService.js
    // never even asks the provider for them), so there is nothing
    // AI-authored to reconcile them against.
    const { value: materialUnitCost, error: matErr } = validateMoney(
      trusted ? trusted.materialUnitCost : row.materialUnitCost,
      `${label}: materialUnitCost`
    );
    if (matErr) return { error: matErr };
    const { value: laborUnitCost, error: laborErr } = validateMoney(
      trusted ? trusted.laborUnitCost : row.laborUnitCost,
      `${label}: laborUnitCost`
    );
    if (laborErr) return { error: laborErr };
    const { value: equipmentUnitCost, error: equipErr } = validateMoney(
      trusted ? trusted.equipmentUnitCost : row.equipmentUnitCost,
      `${label}: equipmentUnitCost`
    );
    if (equipErr) return { error: equipErr };

    const materialUnitCostCents = toCents(materialUnitCost);
    const laborUnitCostCents = toCents(laborUnitCost);
    const equipmentUnitCostCents = toCents(equipmentUnitCost);
    const componentSumCents = materialUnitCostCents + laborUnitCostCents + equipmentUnitCostCents;
    const hasComponents = materialUnitCost > 0 || laborUnitCost > 0 || equipmentUnitCost > 0;

    // Component reconciliation: reconciled unitPrice must equal the
    // component sum UNLESS an explicit, valid manual override is present.
    // The override's provenance (original reconciled value + reason) is
    // preserved, never silently discarded.
    let unitPriceCents;
    let userOverride = { active: false, originalUnitPriceCents: null, reason: null, overriddenBy: null, overriddenAt: null };
    const overrideRaw = row.userOverride && typeof row.userOverride === 'object' ? row.userOverride : null;
    const overrideRequested =
      overrideRaw?.active === true || (row.unitPrice !== undefined && row.unitPrice !== null && !hasComponents);

    if (overrideRaw?.active === true) {
      const { value: overrideUnitPrice, error: ovErr } = validateMoney(overrideRaw.unitPrice ?? row.unitPrice, `${label}: userOverride.unitPrice`);
      if (ovErr) return { error: ovErr };
      const reason = cleanString(overrideRaw.reason, 300);
      if (!reason) return { error: `${label}: userOverride.reason is required when overriding the unit price` };
      unitPriceCents = toCents(overrideUnitPrice);
      userOverride = {
        active: true,
        originalUnitPriceCents: componentSumCents,
        reason,
        overriddenBy: cleanString(overrideRaw.overriddenBy ?? row.overriddenBy, 200) || null,
        overriddenAt: cleanString(overrideRaw.overriddenAt, 40) || now,
      };
    } else if (hasComponents) {
      // No override: unitPrice (if the client sent one) must reconcile to
      // the component sum within rounding tolerance -- never silently
      // replaced with a different client-sent number.
      unitPriceCents = componentSumCents;
      if (row.unitPrice !== undefined && row.unitPrice !== null) {
        const { value: submittedUnitPrice, error: subErr } = validateMoney(row.unitPrice, `${label}: unitPrice`);
        if (subErr) return { error: subErr };
        const submittedCents = toCents(submittedUnitPrice);
        if (Math.abs(submittedCents - componentSumCents) > MAX_UNIT_PRICE_RECONCILE_TOLERANCE_CENTS) {
          return {
            error: `${label}: unitPrice (${submittedUnitPrice}) does not reconcile to the material+labor+equipment component sum (${centsToAmount(componentSumCents)}); provide userOverride with a reason to intentionally diverge`,
          };
        }
      }
    } else if (overrideRequested) {
      // No components at all -- unitPrice entered directly is itself the
      // override (e.g. an allowance line with no cost breakdown).
      const { value: directUnitPrice, error: dirErr } = validateMoney(row.unitPrice, `${label}: unitPrice`);
      if (dirErr) return { error: dirErr };
      unitPriceCents = toCents(directUnitPrice);
      userOverride = {
        active: true,
        originalUnitPriceCents: 0,
        reason: cleanString(row.overrideReason, 300) || 'Directly entered unit price (no cost components provided)',
        overriddenBy: cleanString(row.overriddenBy, 200) || null,
        overriddenAt: now,
      };
    } else {
      return { error: `${label}: provide materialUnitCost/laborUnitCost/equipmentUnitCost or a unitPrice` };
    }

    const lineTotalCents = Math.round(qty * unitPriceCents);
    if (!Number.isFinite(lineTotalCents) || lineTotalCents < 0) {
      return { error: `${label}: computed lineTotal is invalid` };
    }

    const currency = cleanString(row.currency, 3).toUpperCase() || null; // reconciled against estimate currency by the caller

    const confidence = CONFIDENCE_LEVELS.has(row.confidence) ? row.confidence : 'medium';
    const lineStatus = LINE_STATUSES.has(row.lineStatus) ? row.lineStatus : 'preliminary';

    // Phase 43 trust-boundary correction (2026-09-19): `pricingSource`/
    // `providerModel` are no longer read from `row.providerModel` under ANY
    // circumstance -- that field is now completely ignored on input, which
    // is what closes the vulnerability this correction exists for (a client
    // could previously set `providerModel:{provider:'OpenAI', model:'anything'}`
    // directly in the save payload and have it persisted verbatim). There
    // are exactly three legitimate sources for a line item's `pricingSource`
    // /`providerModel`, resolved in this order:
    //   1. `trusted` -- this row was matched THIS save to a suggestionId in
    //      a valid, atomically-reverified `appliedProposal` (see
    //      canonicalEstimateStore.js's resolveAppliedProposals). This is the
    //      ONLY way `pricingSource` can become 'ai_suggested' with FRESH
    //      providerModel metadata.
    //   2. Carry-forward -- this row already legitimately WAS
    //      'ai_suggested' (with real providerModel metadata) as of the last
    //      persisted revision, and this save isn't touching its pricing.
    //      Its trusted metadata survives unchanged rather than being wiped
    //      (or, worse, silently re-trusted from whatever the client echoed
    //      back in `row.providerModel` -- which is never read).
    //   3. Neither of the above -- a client-claimed `pricingSource:
    //      'ai_suggested'` with no backing (fresh or carried-forward) is
    //      NEVER trusted at face value; it is downgraded to 'manual', per
    //      Phase 41's own safe default, and `providerModel` stays
    //      {provider:null, model:null, promptVersion:null}.
    let pricingSource = PRICING_SOURCES.has(row.pricingSource) ? row.pricingSource : 'manual';
    let providerModel = { provider: null, model: null, promptVersion: null };
    const previousProviderModel = previous?.providerModel;
    const previousWasLegitimatelyAiSuggested =
      previous?.pricingSource === 'ai_suggested' &&
      !!(previousProviderModel?.provider || previousProviderModel?.model);

    if (trusted) {
      pricingSource = 'ai_suggested';
      providerModel = {
        provider: cleanString(trusted.providerModel?.provider, 60) || null,
        model: cleanString(trusted.providerModel?.model, 60) || null,
        promptVersion: cleanString(trusted.providerModel?.promptVersion, 40) || null,
      };
    } else if (pricingSource === 'ai_suggested' && previousWasLegitimatelyAiSuggested) {
      providerModel = {
        provider: cleanString(previousProviderModel.provider, 60) || null,
        model: cleanString(previousProviderModel.model, 60) || null,
        promptVersion: cleanString(previousProviderModel.promptVersion, 40) || null,
      };
    } else {
      pricingSource = pricingSource === 'ai_suggested' ? 'manual' : pricingSource;
    }

    const { value: evidencePhotoIds, error: evErr } = validateEvidencePhotoIds(
      row.evidencePhotoIds,
      existingPhotoIds,
      `${label}: evidencePhotoIds`
    );
    if (evErr) return { error: evErr };

    items.push({
      id,
      trade,
      category,
      room,
      damageType,
      repairAction,
      description,
      material,
      quantity: qty,
      unit,
      materialUnitCost: centsToAmount(materialUnitCostCents),
      materialUnitCostCents,
      laborUnitCost: centsToAmount(laborUnitCostCents),
      laborUnitCostCents,
      equipmentUnitCost: centsToAmount(equipmentUnitCostCents),
      equipmentUnitCostCents,
      componentSumCents,
      componentSum: centsToAmount(componentSumCents),
      unitPrice: centsToAmount(unitPriceCents),
      unitPriceCents,
      lineTotal: centsToAmount(lineTotalCents),
      lineTotalCents,
      taxable: row.taxable !== false,
      currency,
      assumptions,
      confidence,
      pricingSource,
      // Phase 43 trust-boundary correction (2026-09-19): `providerModel` is
      // resolved above from `trusted`/carry-forward ONLY -- `row.providerModel`
      // (whatever the client submitted directly) is never read here. A
      // legacy caller with no trust context and no ai_suggested history
      // still gets exactly {provider:null, model:null, promptVersion:null}.
      providerModel,
      lineStatus,
      userOverride,
      evidencePhotoIds,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    });
  }
  return { items };
};

// --- Labeled amounts (permits / general conditions / manual adjustments) --

// Manual adjustments may be negative (a credit); permits/general conditions
// may not (they represent a real incurred cost, never a discount).
const validateLabeledAmounts = (raw, { label, maxCount = MAX_LABELED_AMOUNTS, allowNegative = false, defaultTaxable }) => {
  if (raw === undefined || raw === null) return { rows: [] };
  if (!Array.isArray(raw)) return { error: `${label} must be an array` };
  if (raw.length > maxCount) return { error: `At most ${maxCount} ${label} entries are allowed` };

  const rows = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] && typeof raw[i] === 'object' ? raw[i] : {};
    const rowLabel = `${label}[${i + 1}]`;
    const description = cleanString(row.description, 300);
    if (!description) return { error: `${rowLabel}: description is required` };
    const { value: amount, error: amtErr } = validateMoney(row.amount, `${rowLabel}: amount`, { allowNegative });
    if (amtErr) return { error: amtErr };
    const amountCents = toCents(amount);
    rows.push({
      id: cleanString(row.id, 60) || `${label}_${i}`,
      description,
      amount: centsToAmount(amountCents),
      amountCents,
      taxable: row.taxable === undefined ? defaultTaxable : row.taxable === true,
      reason: cleanString(row.reason, 300),
    });
  }
  return { rows };
};

// --- Rollups & calculation contract ------------------------------------
//
// Exact roll-up order (documented per Phase 41's calculation contract --
// CORRECTED 2026-09-18 to match the application's already-verified,
// authoritative rule in estimateCalculations.js/invoiceCalculations.js:
// O&P is added to the total but is itself NEVER part of the sales-tax
// basis. Verified reference case: $550.00 taxable services, O&P 10% =
// $55.00, tax = 8% of $550.00 (NOT of $605.00) = $44.00, final total =
// $649.00 -- see canonical-estimate-calculations.test.js's dedicated
// regression test for this exact case):
//   1. line-item subtotal          (sum of every line item's lineTotal)
//   2. + permits                   (labeled, contractor/adjuster-entered)
//   3. + general conditions        (labeled, contractor/adjuster-entered)
//   4. + manual adjustments        (labeled, may be negative)
//      => "direct cost" (the adjusted subtotal after 1-4)
//   5. taxable basis               (ONLY the taxable-flagged line items +
//                                    taxable-flagged permits/GC/adjustments
//                                    -- O&P is deliberately excluded, same
//                                    rule as both existing calculation
//                                    modules)
//   6. tax                         (rate x taxable basis; rate is
//                                    contractor/adjuster-controlled)
//   7. overhead/profit             (rate x direct cost; rate is
//                                    contractor/adjuster-controlled, never
//                                    AI-decided; computed independently of
//                                    tax -- neither is a function of the
//                                    other, so their order relative to each
//                                    other doesn't affect the result, but
//                                    tax is listed first here to make the
//                                    "O&P is not part of the tax basis"
//                                    rule visually unambiguous)
//   8. final total                 (direct cost + overhead/profit + tax --
//                                    each of the three added exactly once)
//
// Every figure is derived exactly once from stored line items -- summary/
// category rollups below are informational aggregates of the SAME line
// items, never re-added into the total (no double counting).
//
// Permits/GC/manual adjustments are NOT assumed taxable or non-taxable by
// fiat -- each entry carries its own explicit `taxable` flag (see
// validateLabeledAmounts above), defaulted per a documented, real-world-
// consistent rule (permits default non-taxable -- permit fees are commonly
// tax-exempt; general conditions/manual adjustments default taxable, same
// as a line item's own default). A caller can always override the default
// per entry; nothing here silently taxes an adjustment the caller marked
// non-taxable, or vice versa.
const computeRollups = (items, permits, generalConditions, manualAdjustments, overheadProfitPercent, taxRatePercent) => {
  const lineItemSubtotalCents = items.reduce((s, li) => s + li.lineTotalCents, 0);
  const permitsTotalCents = permits.reduce((s, p) => s + p.amountCents, 0);
  const generalConditionsTotalCents = generalConditions.reduce((s, g) => s + g.amountCents, 0);
  const manualAdjustmentsTotalCents = manualAdjustments.reduce((s, a) => s + a.amountCents, 0);

  const directCostCents =
    lineItemSubtotalCents + permitsTotalCents + generalConditionsTotalCents + manualAdjustmentsTotalCents;

  // O&P is computed on direct cost only, and -- critically -- is NEVER
  // folded into taxableBasisCents below. This matches
  // estimateCalculations.js's computeTotals and invoiceCalculations.js's
  // computeInvoiceTotals exactly (both apply O&P to the subtotal but
  // compute `taxableCents` purely from the taxable line items, unchanged).
  const overheadProfitCents = Math.round(directCostCents * (overheadProfitPercent / 100));

  const taxableLineItemsCents = items.filter((li) => li.taxable).reduce((s, li) => s + li.lineTotalCents, 0);
  const taxablePermitsCents = permits.filter((p) => p.taxable).reduce((s, p) => s + p.amountCents, 0);
  const taxableGeneralConditionsCents = generalConditions.filter((g) => g.taxable).reduce((s, g) => s + g.amountCents, 0);
  const taxableManualAdjustmentsCents = manualAdjustments.filter((a) => a.taxable).reduce((s, a) => s + a.amountCents, 0);

  const taxableBasisCents =
    taxableLineItemsCents + taxablePermitsCents + taxableGeneralConditionsCents + taxableManualAdjustmentsCents;

  const taxCents = Math.round(taxableBasisCents * (taxRatePercent / 100));
  const grandTotalCents = directCostCents + overheadProfitCents + taxCents;

  const byGroup = (keyFn) => {
    const map = new Map();
    for (const li of items) {
      const key = keyFn(li) || 'Unspecified';
      map.set(key, (map.get(key) || 0) + li.lineTotalCents);
    }
    return [...map.entries()].map(([key, cents]) => ({ key, totalCents: cents, total: centsToAmount(cents) }));
  };

  return {
    lineItemSubtotal: centsToAmount(lineItemSubtotalCents),
    lineItemSubtotalCents,
    permitsTotal: centsToAmount(permitsTotalCents),
    permitsTotalCents,
    generalConditionsTotal: centsToAmount(generalConditionsTotalCents),
    generalConditionsTotalCents,
    manualAdjustmentsTotal: centsToAmount(manualAdjustmentsTotalCents),
    manualAdjustmentsTotalCents,
    directCost: centsToAmount(directCostCents),
    directCostCents,
    overheadProfitPercent,
    overheadProfit: centsToAmount(overheadProfitCents),
    overheadProfitCents,
    taxableBasis: centsToAmount(taxableBasisCents),
    taxableBasisCents,
    taxRatePercent,
    tax: centsToAmount(taxCents),
    taxCents,
    grandTotal: centsToAmount(grandTotalCents),
    grandTotalCents,
    byCategory: byGroup((li) => li.category),
    byRoom: byGroup((li) => li.room),
    byTrade: byGroup((li) => li.trade),
  };
};

// Top-level entry point. `existingPhotoIds` must be the Set of photo IDs
// that genuinely exist on the SAME report's own `photos` array (read fresh
// by the caller inside its own transaction) -- this is what makes a
// cross-report photo reference structurally impossible. `previousById` (a
// Map of previous line items by id, or undefined for a first write) lets
// `createdAt` survive an update instead of being reset on every save.
const validateAndComputeCanonicalEstimate = (
  body = {},
  { existingPhotoIds = new Set(), previousById, trustedOverridesByRowId } = {}
) => {
  const { value: schemaVersion, error: schemaErr } = normalizeSchemaVersion(body.schemaVersion);
  if (schemaErr) return { error: schemaErr, code: 'UNSUPPORTED_SCHEMA_VERSION' };

  const { value: currency, error: currencyErr } = normalizeCurrency(body.currency);
  if (currencyErr) return { error: currencyErr, code: 'VALIDATION_ERROR' };

  const { items, error: lineItemsError } = validateLineItems(
    body.lineItems,
    existingPhotoIds,
    previousById,
    trustedOverridesByRowId
  );
  if (lineItemsError) return { error: lineItemsError, code: 'VALIDATION_ERROR' };

  // Single-currency enforcement: a line item may declare its own currency
  // only if it matches the estimate's -- never silently converted, never
  // silently dropped.
  for (const li of items) {
    if (li.currency && li.currency !== currency) {
      return {
        error: `Line item "${li.id}" currency (${li.currency}) does not match the estimate currency (${currency}); mixed-currency estimates are not supported`,
        code: 'MIXED_CURRENCY',
      };
    }
    li.currency = currency;
  }

  const { rows: permits, error: permitsErr } = validateLabeledAmounts(body.permits, {
    label: 'permits',
    allowNegative: false,
    defaultTaxable: false,
  });
  if (permitsErr) return { error: permitsErr, code: 'VALIDATION_ERROR' };

  const { rows: generalConditions, error: gcErr } = validateLabeledAmounts(body.generalConditions, {
    label: 'generalConditions',
    allowNegative: false,
    defaultTaxable: true,
  });
  if (gcErr) return { error: gcErr, code: 'VALIDATION_ERROR' };

  const { rows: manualAdjustments, error: adjErr } = validateLabeledAmounts(body.manualAdjustments, {
    label: 'manualAdjustments',
    allowNegative: true,
    defaultTaxable: true,
  });
  if (adjErr) return { error: adjErr, code: 'VALIDATION_ERROR' };

  const { value: overheadProfitPercent, error: opErr } = validatePercent(body.overheadProfitPercent, 'overheadProfitPercent');
  if (opErr) return { error: opErr, code: 'VALIDATION_ERROR' };

  const { value: taxRatePercent, error: taxErr } = validatePercent(body.taxRatePercent, 'taxRatePercent');
  if (taxErr) return { error: taxErr, code: 'VALIDATION_ERROR' };

  const totals = computeRollups(items, permits, generalConditions, manualAdjustments, overheadProfitPercent, taxRatePercent);

  const overriddenLineItemIds = items.filter((li) => li.userOverride.active).map((li) => li.id);
  const pricingSources = new Set(items.map((li) => li.pricingSource));
  const pricingStatus = pricingSources.size === 1 && pricingSources.has('manual') ? 'manual' : 'ai_assisted';

  return {
    schemaVersion,
    currency,
    lineItems: items,
    permits,
    generalConditions,
    manualAdjustments,
    totals,
    pricingStatus,
    userOverrideIndicators: {
      hasOverrides: overriddenLineItemIds.length > 0,
      overriddenLineItemIds,
    },
    locationContext: {
      region: cleanString(body.locationContext?.region ?? body.region, 200) || null,
      source: body.locationContext?.source === 'property_lookup' ? 'property_lookup' : 'manual',
    },
    // Phase 43 (minimal, additive edit -- 2026-09-19): computed SERVER-SIDE
    // from the just-validated line items -- never trusted from a
    // client-submitted `pricingSourceMeta` object directly -- mirroring the
    // adjacent `pricingStatus` computation above. This completes the gap
    // Phase 42's own doc comments flagged as deferred to this phase (see
    // canonicalEstimateContent.js's PRICING_SOURCE_LABELS['ai_suggested']
    // comment): once any line item carries `pricingSource: 'ai_suggested'`
    // (Phase 43's pricing service always sets this), the rendered Section 7
    // "Pricing Source" line now genuinely reads "Pricing Source generated
    // by: Flacron Engine" instead of always defaulting to "manual". An
    // all-manual estimate is completely unaffected (still 'manual').
    pricingSourceMeta: {
      source: pricingSources.has('ai_suggested') ? 'ai_suggested' : 'manual',
      provider: null,
      model: null,
      promptVersion: null,
    },
  };
};

// Recomputes the bidirectional photo <-> line-item evidence index. Always
// derived fresh from the just-validated line items -- never trusted as a
// separately maintained/editable copy, so it can't drift.
const computeReversePhotoIndex = (photos, lineItems) => {
  const byPhotoId = new Map();
  for (const li of lineItems) {
    for (const photoId of li.evidencePhotoIds) {
      if (!byPhotoId.has(photoId)) byPhotoId.set(photoId, []);
      byPhotoId.get(photoId).push(li.id);
    }
  }
  return (photos || []).map((p) => ({ ...p, relatedLineItemIds: byPhotoId.get(p.id) || [] }));
};

module.exports = {
  CANONICAL_ESTIMATE_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  MAX_LINE_ITEMS,
  MAX_LABELED_AMOUNTS,
  MAX_MONEY,
  MAX_QTY,
  MAX_EVIDENCE_PER_LINE,
  DEFAULT_CURRENCY,
  UNIT_VOCABULARY,
  ACTION_VOCABULARY,
  isFiniteNumber,
  toCents,
  centsToAmount,
  isValidCurrency,
  normalizeCurrency,
  normalizeSchemaVersion,
  validatePercent,
  validateMoney,
  validateEvidencePhotoIds,
  validateLineItems,
  validateLabeledAmounts,
  computeRollups,
  validateAndComputeCanonicalEstimate,
  computeReversePhotoIndex,
};
