const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAndComputeCanonicalEstimate } = require('../utils/canonicalEstimate');
const { buildSection7DetailMarkdown } = require('../utils/canonicalEstimateContent');

// Phase 43. Regression tests for the edits this phase made to the
// already-"Complete" Phase 41 file backend/utils/canonicalEstimate.js:
//   1. Estimate-level `pricingSourceMeta.source` is now computed
//      server-side from the just-validated line items instead of being
//      hardcoded 'manual' -- completing the gap Phase 42's own doc
//      comments flagged as deferred to this phase.
//   2. Trust-boundary correction (2026-09-19): `providerModel`/an
//      'ai_suggested' `pricingSource` claim is now trusted ONLY when backed
//      by a fresh `trustedOverridesByRowId` match (a caller-supplied,
//      already-verified proposal record -- see canonicalEstimateStore.js's
//      resolveAppliedProposals) or a legitimate carry-forward from an
//      already-trusted PREVIOUS revision (`previousById`). A raw
//      `row.providerModel`/`row.pricingSource:'ai_suggested'` with NEITHER
//      is never trusted at face value -- this superseded the phase's
//      original, now-fixed design where `row.providerModel` was preserved
//      unconditionally (a client-controlled trust boundary bug).
// All edits are proven here to be backward-compatible: a legacy caller that
// never sends `providerModel`/an ai_suggested `pricingSource` gets EXACTLY
// today's behavior, unchanged.

const li = (overrides = {}) => ({
  category: 'Drywall',
  room: 'Living Room',
  description: 'Replace water-damaged drywall',
  quantity: 10,
  unit: 'SF',
  materialUnitCost: 2,
  laborUnitCost: 3,
  ...overrides,
});

test('legacy callers that omit providerModel still get {provider:null, model:null, promptVersion:null} unchanged', () => {
  const result = validateAndComputeCanonicalEstimate({ lineItems: [li({ id: 'li-1' })] });
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(result.lineItems[0].providerModel, {
    provider: null,
    model: null,
    promptVersion: null,
  });
});

// ---- trust-boundary correction (2026-09-19) -------------------------------

test('a RAW client-submitted providerModel/pricingSource:"ai_suggested" with NO backing (no trustedOverridesByRowId, no previous history) is never trusted -- downgraded to manual, providerModel discarded', () => {
  const result = validateAndComputeCanonicalEstimate({
    lineItems: [
      li({
        id: 'li-1',
        pricingSource: 'ai_suggested',
        providerModel: { provider: 'attacker', model: 'attacker-model', promptVersion: 'v1' },
      }),
    ],
  });
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.lineItems[0].pricingSource, 'manual', 'an unbacked ai_suggested claim is never trusted at face value');
  assert.deepEqual(result.lineItems[0].providerModel, { provider: null, model: null, promptVersion: null });
});

test('a suggestion backed by a valid trustedOverridesByRowId match: providerModel/pricingSource come ONLY from the trusted record, never row.providerModel, and cost components are replaced with the trusted values (tamper protection)', () => {
  const trustedOverridesByRowId = new Map([
    [
      'li-1',
      {
        materialUnitCost: 2.5,
        laborUnitCost: 3,
        equipmentUnitCost: 0,
        providerModel: { provider: 'openai', model: 'gpt-4o-mini', promptVersion: 'v1' },
      },
    ],
  ]);
  const result = validateAndComputeCanonicalEstimate(
    {
      lineItems: [
        li({
          id: 'li-1',
          materialUnitCost: 999, // tamper attempt -- must be replaced, not trusted
          laborUnitCost: 999,
          providerModel: { provider: 'attacker', model: 'attacker-model', promptVersion: 'x' }, // must be ignored entirely
        }),
      ],
    },
    { trustedOverridesByRowId }
  );
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.lineItems[0].pricingSource, 'ai_suggested');
  assert.deepEqual(result.lineItems[0].providerModel, {
    provider: 'openai',
    model: 'gpt-4o-mini',
    promptVersion: 'v1',
  });
  assert.equal(result.lineItems[0].materialUnitCost, 2.5, 'the tampered 999 was replaced with the trusted value');
  assert.equal(result.lineItems[0].laborUnitCost, 3, 'the tampered 999 was replaced with the trusted value');
});

test('providerModel is never trusted for money, even via a trusted record -- only 3 length-capped strings are read off it', () => {
  const trustedOverridesByRowId = new Map([
    [
      'li-1',
      {
        materialUnitCost: 2,
        laborUnitCost: 3,
        equipmentUnitCost: 0,
        providerModel: {
          provider: 'x'.repeat(200),
          model: 'y'.repeat(200),
          promptVersion: 'z'.repeat(200),
          unitPrice: 999999, // an attacker-style attempt to smuggle a money field through providerModel
        },
      },
    ],
  ]);
  const result = validateAndComputeCanonicalEstimate(
    { lineItems: [li({ id: 'li-1' })] },
    { trustedOverridesByRowId }
  );
  assert.equal(result.error, undefined, result.error);
  const pm = result.lineItems[0].providerModel;
  assert.equal(pm.provider.length, 60);
  assert.equal(pm.model.length, 60);
  assert.equal(pm.promptVersion.length, 40);
  assert.equal(
    Object.keys(pm).sort().join(','),
    'model,promptVersion,provider',
    'no extra field (e.g. unitPrice) survives onto providerModel'
  );
  // The line item's own unitPrice is the reconciled trusted component sum
  // (2 material + 3 labor) * qty 10 = 50, never the smuggled 999999.
  assert.equal(result.lineItems[0].unitPrice, 5);
});

test('a legitimate carry-forward: a line item already ai_suggested (with real providerModel) in the PREVIOUS revision keeps that trusted metadata on a later save that does not touch its pricing (no trustedOverridesByRowId this time)', () => {
  const previousById = new Map([
    [
      'li-1',
      {
        pricingSource: 'ai_suggested',
        providerModel: { provider: 'openai', model: 'gpt-4o-mini', promptVersion: 'v1' },
      },
    ],
  ]);
  const result = validateAndComputeCanonicalEstimate(
    { lineItems: [li({ id: 'li-1', pricingSource: 'ai_suggested' })] },
    { previousById }
  );
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.lineItems[0].pricingSource, 'ai_suggested');
  assert.deepEqual(result.lineItems[0].providerModel, {
    provider: 'openai',
    model: 'gpt-4o-mini',
    promptVersion: 'v1',
  });
});

test('a carry-forward is never taken from a RAW row.providerModel even when previous history exists -- only the PREVIOUS record\'s own providerModel is trusted', () => {
  const previousById = new Map([
    [
      'li-1',
      {
        pricingSource: 'ai_suggested',
        providerModel: { provider: 'openai', model: 'gpt-4o-mini', promptVersion: 'v1' },
      },
    ],
  ]);
  const result = validateAndComputeCanonicalEstimate(
    {
      lineItems: [
        li({
          id: 'li-1',
          pricingSource: 'ai_suggested',
          providerModel: { provider: 'attacker', model: 'attacker-model', promptVersion: 'x' },
        }),
      ],
    },
    { previousById }
  );
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(
    result.lineItems[0].providerModel,
    { provider: 'openai', model: 'gpt-4o-mini', promptVersion: 'v1' },
    "the attacker's row.providerModel is completely ignored; only the previous revision's real record is trusted"
  );
});

test('a pre-existing user-overridden line item is never re-trusted even if trustedOverridesByRowId claims to back it (server-side mirror of the frontend skip rule)', () => {
  const previousById = new Map([
    ['li-1', { pricingSource: 'manual', userOverride: { active: true, reason: 'contractor quote' }, providerModel: { provider: null, model: null, promptVersion: null } }],
  ]);
  const trustedOverridesByRowId = new Map([
    ['li-1', { materialUnitCost: 999, laborUnitCost: 0, equipmentUnitCost: 0, providerModel: { provider: 'openai', model: 'x', promptVersion: 'v1' } }],
  ]);
  const result = validateAndComputeCanonicalEstimate(
    { lineItems: [li({ id: 'li-1', materialUnitCost: 2, laborUnitCost: 3 })] },
    { previousById, trustedOverridesByRowId }
  );
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.lineItems[0].pricingSource, 'manual');
  assert.equal(result.lineItems[0].materialUnitCost, 2, 'the trusted override is never applied to a previously user-overridden item');
  assert.deepEqual(result.lineItems[0].providerModel, { provider: null, model: null, promptVersion: null });
});

test('pricingSourceMeta.source is "manual" for an all-manual estimate (no behavior change from Phase 42)', () => {
  const result = validateAndComputeCanonicalEstimate({
    lineItems: [li({ id: 'li-1' }), li({ id: 'li-2', pricingSource: 'manual' })],
  });
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.pricingSourceMeta.source, 'manual');
});

test('pricingSourceMeta.source becomes "ai_suggested" once at least one line item is LEGITIMATELY ai_suggested (even mixed with manual items) -- backed here via trustedOverridesByRowId, since an unbacked claim is no longer trusted (see the trust-boundary correction tests above)', () => {
  const trustedOverridesByRowId = new Map([
    ['li-2', { materialUnitCost: 2, laborUnitCost: 3, equipmentUnitCost: 0, providerModel: { provider: 'openai', model: 'gpt-4o-mini', promptVersion: 'v1' } }],
  ]);
  const result = validateAndComputeCanonicalEstimate(
    {
      lineItems: [
        li({ id: 'li-1', pricingSource: 'manual' }),
        li({ id: 'li-2', pricingSource: 'ai_suggested' }),
      ],
    },
    { trustedOverridesByRowId }
  );
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.lineItems[1].pricingSource, 'ai_suggested');
  assert.equal(result.pricingSourceMeta.source, 'ai_suggested');
});

test('pricingSourceMeta.source is never taken from a client-submitted pricingSourceMeta object directly', () => {
  const result = validateAndComputeCanonicalEstimate({
    lineItems: [li({ id: 'li-1', pricingSource: 'manual' })],
    pricingSourceMeta: { source: 'ai_suggested', provider: 'attacker', model: 'attacker-model' }, // must be ignored
  });
  assert.equal(result.error, undefined, result.error);
  assert.equal(
    result.pricingSourceMeta.source,
    'manual',
    'the estimate has no ai_suggested line items, so the client override must be ignored'
  );
  assert.equal(result.pricingSourceMeta.provider, null);
});

// ---- end-to-end through the FULL canonicalEstimateContent.js rendering pipeline ----

test('end-to-end: an estimate with a LEGITIMATELY ai_suggested line item (backed by trustedOverridesByRowId) renders "Pricing Source generated by: Flacron Engine" via the full rendering pipeline', () => {
  const trustedOverridesByRowId = new Map([
    ['li-1', { materialUnitCost: 2, laborUnitCost: 3, equipmentUnitCost: 0, providerModel: { provider: 'openai', model: 'gpt-4o-mini', promptVersion: 'v1' } }],
  ]);
  const estimate = {
    ...validateAndComputeCanonicalEstimate(
      { lineItems: [li({ id: 'li-1', pricingSource: 'ai_suggested' })] },
      { trustedOverridesByRowId }
    ),
    revision: 1,
  };
  assert.equal(estimate.error, undefined, estimate.error);
  const markdown = buildSection7DetailMarkdown(estimate, { reportStatus: 'draft' });
  assert.match(markdown, /Pricing Source: Pricing Source generated by: Flacron Engine/);
  // Golden-rule label hygiene: the rendered text never names the actual
  // provider/model -- only the fixed "Flacron Engine" label.
  assert.doesNotMatch(markdown, /openai/i);
  assert.doesNotMatch(markdown, /gpt-4o-mini/i);
});

test('end-to-end: an all-manual estimate still renders "Manually entered by preparer" exactly as before (no regression)', () => {
  const estimate = {
    ...validateAndComputeCanonicalEstimate({ lineItems: [li({ id: 'li-1' })] }),
    revision: 1,
  };
  assert.equal(estimate.error, undefined, estimate.error);
  const markdown = buildSection7DetailMarkdown(estimate, { reportStatus: 'draft' });
  assert.match(markdown, /Pricing Source: Manually entered by preparer/);
});

test('end-to-end: an UNBACKED raw pricingSource:"ai_suggested" claim (no trustedOverridesByRowId, no previous history) still renders "Manually entered by preparer" -- the trust-boundary downgrade reaches all the way through the rendering pipeline, never leaks a false "Flacron Engine" label', () => {
  const estimate = {
    ...validateAndComputeCanonicalEstimate({
      lineItems: [
        li({
          id: 'li-1',
          pricingSource: 'ai_suggested',
          providerModel: { provider: 'attacker', model: 'attacker-model', promptVersion: 'x' },
        }),
      ],
    }),
    revision: 1,
  };
  assert.equal(estimate.error, undefined, estimate.error);
  assert.equal(estimate.pricingSourceMeta.source, 'manual');
  const markdown = buildSection7DetailMarkdown(estimate, { reportStatus: 'draft' });
  assert.match(markdown, /Pricing Source: Manually entered by preparer/);
  assert.doesNotMatch(markdown, /attacker/i);
});
