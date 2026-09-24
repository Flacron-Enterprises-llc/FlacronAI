const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeFirestore } = require('./helpers/fakeFirestore');
const { upsertCanonicalEstimate, getCanonicalEstimate } = require('../utils/canonicalEstimateStore');
const { createPricingProposal, proposalRefFor } = require('../utils/pricingProposalStore');
const { buildSection7DetailMarkdown } = require('../utils/canonicalEstimateContent');

// Phase 43 trust-boundary correction (2026-09-19). Focused tests for the
// opaque proposalId/suggestionId design described in
// backend/utils/pricingProposalStore.js's header comment: a generated
// pricing proposal is persisted server-side, and PUT /:id/canonical-estimate
// (via upsertCanonicalEstimate -- exercised directly here against a real
// FakeFirestore + transaction, same convention as canonical-estimate-
// persistence.test.js) is the ONLY place a proposal is ever applied, always
// re-verifying it atomically rather than trusting anything the client
// echoes back. This file does NOT re-litigate the full Phase 43 suite
// (pricing-service.test.js / pricing-route.test.js / pricing-canonical-
// integration.test.js already cover generation/route/pure-validation
// concerns) -- it isolates the NEW apply/save trust boundary specifically.

const OWNER_UID = 'owner-uid';
const OTHER_UID = 'other-uid';

const seedReport = async (db, id, overrides = {}) => {
  await db.collection('reports').doc(id).set({
    userId: OWNER_UID,
    status: 'draft',
    photos: [],
    ...overrides,
  });
};

const li = (overrides = {}) => ({
  category: 'Drywall',
  room: 'Living Room',
  description: 'Replace water-damaged drywall',
  quantity: 10,
  unit: 'SF',
  materialUnitCost: 1, // deliberately NOT the trusted value -- proves replace-with-trusted
  laborUnitCost: 1,
  ...overrides,
});

// A minimal, realistic trusted suggestion item -- the fields
// resolveAppliedProposals/canonicalEstimate.js's trust logic actually read.
const suggestion = (overrides = {}) => ({
  suggestionId: `sug-${Math.random().toString(36).slice(2, 8)}`,
  targetLineItemId: 'li-1',
  materialUnitCost: 2.5,
  laborUnitCost: 3,
  equipmentUnitCost: 0,
  currency: 'USD',
  confidence: 'medium',
  assumptions: 'Standard 1/2in drywall.',
  pricingSource: 'ai_suggested',
  pricingDate: '2026-09-19',
  providerModel: { provider: 'openai', model: 'gpt-4o-mini', promptVersion: 'v1' },
  ...overrides,
});

// Persists a proposal via the REAL createPricingProposal (not a hand-rolled
// Firestore doc) so these tests exercise the actual persisted shape.
const seedProposal = (db, reportId, { requestedByUid = OWNER_UID, baseRevision = 0, items } = {}) =>
  createPricingProposal(db, {
    reportId,
    requestedByUid,
    baseRevision,
    locationContext: { country: 'US' },
    currency: 'USD',
    pricingDate: '2026-09-19',
    items,
  });

test('1. a raw client-submitted providerModel on a line item, with NO appliedProposal at all, is ignored -- never persisted as submitted', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r1');
  const estimate = await upsertCanonicalEstimate(db, {
    reportId: 'r1',
    body: {
      lineItems: [
        li({ id: 'li-1', pricingSource: 'ai_suggested', providerModel: { provider: 'attacker', model: 'attacker-model', promptVersion: 'x' } }),
      ],
    },
    actor: { uid: OWNER_UID },
  });
  assert.equal(estimate.lineItems[0].pricingSource, 'manual');
  assert.deepEqual(estimate.lineItems[0].providerModel, { provider: null, model: null, promptVersion: null });
});

test('2. an accepted suggestion\'s persisted providerModel comes ONLY from the trusted server-side proposal record, never the request body', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r2');
  const sug = suggestion({ suggestionId: 'sug-1', targetLineItemId: 'li-1' });
  const { proposalId } = await seedProposal(db, 'r2', { items: [sug] });

  const estimate = await upsertCanonicalEstimate(db, {
    reportId: 'r2',
    body: {
      appliedProposals: [{ proposalId, acceptedSuggestionIds: ['sug-1'] }],
      lineItems: [
        li({
          id: 'li-1',
          appliedSuggestionId: 'sug-1',
          pricingSource: 'ai_suggested',
          providerModel: { provider: 'attacker', model: 'attacker-model', promptVersion: 'x' }, // must be ignored
        }),
      ],
    },
    actor: { uid: OWNER_UID },
  });
  assert.equal(estimate.lineItems[0].pricingSource, 'ai_suggested');
  assert.deepEqual(estimate.lineItems[0].providerModel, { provider: 'openai', model: 'gpt-4o-mini', promptVersion: 'v1' });
});

test('3. a proposal resolves correctly for the SAME user+report that generated it', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r3');
  const { proposalId } = await seedProposal(db, 'r3', {
    requestedByUid: OWNER_UID,
    items: [suggestion({ suggestionId: 'sug-1', targetLineItemId: 'li-1' })],
  });
  const estimate = await upsertCanonicalEstimate(db, {
    reportId: 'r3',
    body: {
      appliedProposals: [{ proposalId, acceptedSuggestionIds: ['sug-1'] }],
      lineItems: [li({ id: 'li-1', appliedSuggestionId: 'sug-1', pricingSource: 'ai_suggested' })],
    },
    actor: { uid: OWNER_UID },
  });
  assert.equal(estimate.lineItems[0].pricingSource, 'ai_suggested');
});

test('4. a DIFFERENT user applying the same proposalId is rejected (PRICING_PROPOSAL_FORBIDDEN)', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r4', { userId: OWNER_UID, assignedUsers: [{ uid: OTHER_UID, permission: 'review' }] });
  const { proposalId } = await seedProposal(db, 'r4', {
    requestedByUid: OWNER_UID,
    items: [suggestion({ suggestionId: 'sug-1', targetLineItemId: 'li-1' })],
  });
  await assert.rejects(
    () =>
      upsertCanonicalEstimate(db, {
        reportId: 'r4',
        body: {
          appliedProposals: [{ proposalId, acceptedSuggestionIds: ['sug-1'] }],
          lineItems: [li({ id: 'li-1', appliedSuggestionId: 'sug-1', pricingSource: 'ai_suggested' })],
        },
        actor: { uid: OTHER_UID },
      }),
    (err) => {
      assert.equal(err.code, 'PRICING_PROPOSAL_FORBIDDEN');
      return true;
    }
  );
  // Never partially applied: no estimate was ever created for r4.
  assert.equal(await getCanonicalEstimate(db, 'r4'), null);
});

test('5. a DIFFERENT report applying the same proposalId is rejected (PRICING_PROPOSAL_NOT_FOUND -- the proposal lives only under its own report\'s subcollection)', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r5a');
  await seedReport(db, 'r5b');
  const { proposalId } = await seedProposal(db, 'r5a', {
    requestedByUid: OWNER_UID,
    items: [suggestion({ suggestionId: 'sug-1', targetLineItemId: 'li-1' })],
  });
  await assert.rejects(
    () =>
      upsertCanonicalEstimate(db, {
        reportId: 'r5b',
        body: {
          appliedProposals: [{ proposalId, acceptedSuggestionIds: ['sug-1'] }],
          lineItems: [li({ id: 'li-1', appliedSuggestionId: 'sug-1', pricingSource: 'ai_suggested' })],
        },
        actor: { uid: OWNER_UID },
      }),
    (err) => {
      assert.equal(err.code, 'PRICING_PROPOSAL_NOT_FOUND');
      return true;
    }
  );
});

test('6. an expired proposal is rejected with PRICING_PROPOSAL_EXPIRED', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r6');
  const { proposalId } = await seedProposal(db, 'r6', {
    requestedByUid: OWNER_UID,
    items: [suggestion({ suggestionId: 'sug-1', targetLineItemId: 'li-1' })],
  });
  // Reach into the persisted record and force it into the past -- same
  // convention pricing-service.test.js already uses for an expired cache entry.
  const ref = proposalRefFor(db, 'r6', proposalId);
  const snap = await ref.get();
  await ref.set({ ...snap.data(), expiresAt: new Date(Date.now() - 1000).toISOString() });

  await assert.rejects(
    () =>
      upsertCanonicalEstimate(db, {
        reportId: 'r6',
        body: {
          appliedProposals: [{ proposalId, acceptedSuggestionIds: ['sug-1'] }],
          lineItems: [li({ id: 'li-1', appliedSuggestionId: 'sug-1', pricingSource: 'ai_suggested' })],
        },
        actor: { uid: OWNER_UID },
      }),
    { code: 'PRICING_PROPOSAL_EXPIRED' }
  );
});

test('7. an unknown/malformed proposalId is rejected with PRICING_PROPOSAL_NOT_FOUND, never a crash', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r7');
  await assert.rejects(
    () =>
      upsertCanonicalEstimate(db, {
        reportId: 'r7',
        body: {
          appliedProposals: [{ proposalId: 'not-a-real-proposal-id', acceptedSuggestionIds: ['sug-1'] }],
          lineItems: [li({ id: 'li-1' })],
        },
        actor: { uid: OWNER_UID },
      }),
    { code: 'PRICING_PROPOSAL_NOT_FOUND' }
  );
});

test('8. tampered line-item values (vs. what the trusted proposal stored) are always replaced with the trusted values -- persisted values never match the tampered request', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r8');
  const { proposalId } = await seedProposal(db, 'r8', {
    items: [suggestion({ suggestionId: 'sug-1', targetLineItemId: 'li-1', materialUnitCost: 2.5, laborUnitCost: 3, equipmentUnitCost: 0 })],
  });
  const estimate = await upsertCanonicalEstimate(db, {
    reportId: 'r8',
    body: {
      appliedProposals: [{ proposalId, acceptedSuggestionIds: ['sug-1'] }],
      lineItems: [
        li({
          id: 'li-1',
          appliedSuggestionId: 'sug-1',
          pricingSource: 'ai_suggested',
          materialUnitCost: 999999, // tamper attempt
          laborUnitCost: 999999,
        }),
      ],
    },
    actor: { uid: OWNER_UID },
  });
  assert.equal(estimate.lineItems[0].materialUnitCost, 2.5);
  assert.equal(estimate.lineItems[0].laborUnitCost, 3);
  assert.notEqual(estimate.lineItems[0].materialUnitCost, 999999);
});

test('9. a suggestionId NOT present in acceptedSuggestionIds is never applied, even if a line item in the payload references it via appliedSuggestionId', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r9');
  const { proposalId } = await seedProposal(db, 'r9', {
    items: [suggestion({ suggestionId: 'sug-1', targetLineItemId: 'li-1' })],
  });
  const estimate = await upsertCanonicalEstimate(db, {
    reportId: 'r9',
    body: {
      appliedProposals: [{ proposalId, acceptedSuggestionIds: [] }], // sug-1 NOT accepted
      lineItems: [
        li({ id: 'li-1', appliedSuggestionId: 'sug-1', pricingSource: 'ai_suggested' }), // client claims it anyway
      ],
    },
    actor: { uid: OWNER_UID },
  });
  // Never trusted: no backing accepted-suggestion entry means the
  // ai_suggested claim is downgraded, exactly like an entirely unbacked one.
  assert.equal(estimate.lineItems[0].pricingSource, 'manual');
  assert.deepEqual(estimate.lineItems[0].providerModel, { provider: null, model: null, promptVersion: null });
});

test('10. a stale proposal baseRevision (the estimate changed since the proposal was generated) returns the EXISTING REVISION_CONFLICT shape', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r10');
  // Generate the proposal against revision 0 (no estimate yet)...
  const { proposalId } = await seedProposal(db, 'r10', { baseRevision: 0, items: [suggestion({ suggestionId: 'sug-1', targetLineItemId: 'li-1' })] });
  // ...then someone else saves the estimate first, advancing it to revision 1.
  await upsertCanonicalEstimate(db, { reportId: 'r10', body: { lineItems: [li({ id: 'li-1' })] }, actor: { uid: OWNER_UID } });

  await assert.rejects(
    () =>
      upsertCanonicalEstimate(db, {
        reportId: 'r10',
        body: {
          appliedProposals: [{ proposalId, acceptedSuggestionIds: ['sug-1'] }],
          lineItems: [li({ id: 'li-1', appliedSuggestionId: 'sug-1', pricingSource: 'ai_suggested' })],
        },
        actor: { uid: OWNER_UID },
      }),
    (err) => {
      assert.equal(err.code, 'REVISION_CONFLICT');
      assert.equal(err.currentRevision, 1, 'the SAME err.currentRevision shape the editor already handles');
      return true;
    }
  );
});

test('11. replaying the same apply request twice (via the REAL transactional store, not just the pure merge function) never creates duplicate line items, and a second literal replay is a safe idempotent no-op', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r11');
  const { proposalId } = await seedProposal(db, 'r11', { items: [suggestion({ suggestionId: 'sug-1', targetLineItemId: null })] }); // targetLineItemId null -> a brand-new appended item

  const body = {
    appliedProposals: [{ proposalId, acceptedSuggestionIds: ['sug-1'] }],
    lineItems: [li({ id: 'new-li-1', appliedSuggestionId: 'sug-1', pricingSource: 'ai_suggested' })],
  };

  const first = await upsertCanonicalEstimate(db, { reportId: 'r11', body, actor: { uid: OWNER_UID } });
  assert.equal(first.lineItems.length, 1);

  // A literal repeated API call submitting the EXACT same body again (no
  // baseRevision supplied, so last-write-wins at the estimate layer) --
  // must still resolve to exactly one line item, not two.
  const second = await upsertCanonicalEstimate(db, { reportId: 'r11', body, actor: { uid: OWNER_UID } });
  assert.equal(second.lineItems.length, 1, 'no duplicate line item from a raw repeated apply request');
  assert.equal(second.lineItems[0].pricingSource, 'ai_suggested');

  // The suggestion is now marked consumed against 'new-li-1'; a THIRD
  // request trying to apply the SAME suggestion to a DIFFERENT (new) line
  // item id (e.g. an attacker's crafted request that doesn't even include
  // the original 'new-li-1' row -- only a fresh 'new-li-2' claiming the
  // same suggestionId) must be rejected, not silently create a second
  // AI-priced item.
  await assert.rejects(
    () =>
      upsertCanonicalEstimate(db, {
        reportId: 'r11',
        body: {
          appliedProposals: [{ proposalId, acceptedSuggestionIds: ['sug-1'] }],
          lineItems: [li({ id: 'new-li-2', appliedSuggestionId: 'sug-1', pricingSource: 'ai_suggested' })],
        },
        actor: { uid: OWNER_UID },
      }),
    { code: 'PRICING_SUGGESTION_ALREADY_CONSUMED' }
  );
});

test('11b. (regression) an already-consumed suggestion survives an ARBITRARY LATER unrelated save (revision advanced further by an unrelated edit in between) without tripping REVISION_CONFLICT -- the frontend keeps appliedSuggestionId on the draft item indefinitely, so every later save of that item re-submits the same appliedProposals entry, not just an immediate retry', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r11b');
  const { proposalId } = await seedProposal(db, 'r11b', { items: [suggestion({ suggestionId: 'sug-1', targetLineItemId: null })] });

  const applyBody = {
    appliedProposals: [{ proposalId, acceptedSuggestionIds: ['sug-1'] }],
    lineItems: [li({ id: 'new-li-1', appliedSuggestionId: 'sug-1', pricingSource: 'ai_suggested' })],
  };
  const first = await upsertCanonicalEstimate(db, { reportId: 'r11b', body: applyBody, actor: { uid: OWNER_UID } });
  assert.equal(first.revision, 1);

  // An unrelated save (e.g. editing O&P%) advances the revision further,
  // still re-submitting the SAME already-applied item (as the real editor
  // does -- it never clears appliedSuggestionId/appliedProposalId locally).
  const second = await upsertCanonicalEstimate(db, {
    reportId: 'r11b',
    body: {
      ...applyBody,
      lineItems: [li({ id: 'new-li-1', appliedSuggestionId: 'sug-1', pricingSource: 'ai_suggested' })],
      overheadProfitPercent: 10,
    },
    actor: { uid: OWNER_UID },
  });
  assert.equal(second.revision, 2, 'the save succeeded -- no REVISION_CONFLICT despite the proposal\'s frozen baseRevision (0) no longer matching');
  assert.equal(second.lineItems.length, 1, 'still no duplicate');
  assert.equal(second.lineItems[0].pricingSource, 'ai_suggested');
  assert.deepEqual(second.lineItems[0].providerModel, { provider: 'openai', model: 'gpt-4o-mini', promptVersion: 'v1' });
});

test('12. applying a proposal to a FINALIZED report is rejected with REPORT_FINALIZED, and this fires before any proposal resolution work (an intentionally-bogus proposalId never even gets looked up)', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r12', { status: 'finalized' });
  await assert.rejects(
    () =>
      upsertCanonicalEstimate(db, {
        reportId: 'r12',
        body: {
          appliedProposals: [{ proposalId: 'this-proposal-id-does-not-exist-and-must-never-be-looked-up', acceptedSuggestionIds: ['sug-1'] }],
          lineItems: [li({ id: 'li-1' })],
        },
        actor: { uid: OWNER_UID },
      }),
    (err) => {
      // If REPORT_FINALIZED did not fire FIRST, this would instead throw
      // PRICING_PROPOSAL_NOT_FOUND (the bogus id) -- proving ordering.
      assert.equal(err.code, 'REPORT_FINALIZED');
      return true;
    }
  );
});

test('13. a pre-existing user-overridden line item is NEVER touched by an apply, proposal-backed or not', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r13');
  // First save: a manually-overridden line item.
  const first = await upsertCanonicalEstimate(db, {
    reportId: 'r13',
    body: {
      lineItems: [
        li({ id: 'li-1', materialUnitCost: 0, laborUnitCost: 0, unitPrice: 500, userOverride: { active: true, unitPrice: 500, reason: 'Contractor quote' } }),
      ],
    },
    actor: { uid: OWNER_UID },
  });
  assert.equal(first.lineItems[0].userOverride.active, true);
  assert.equal(first.lineItems[0].unitPrice, 500);

  const { proposalId } = await seedProposal(db, 'r13', {
    baseRevision: first.revision,
    items: [suggestion({ suggestionId: 'sug-1', targetLineItemId: 'li-1', materialUnitCost: 2.5, laborUnitCost: 3 })],
  });

  // A raw API call tries to apply AI pricing over the overridden item anyway.
  const second = await upsertCanonicalEstimate(db, {
    reportId: 'r13',
    body: {
      baseRevision: first.revision,
      appliedProposals: [{ proposalId, acceptedSuggestionIds: ['sug-1'] }],
      lineItems: [
        li({
          id: 'li-1',
          appliedSuggestionId: 'sug-1',
          pricingSource: 'ai_suggested',
          materialUnitCost: 0,
          laborUnitCost: 0,
          unitPrice: 500,
          userOverride: { active: true, unitPrice: 500, reason: 'Contractor quote' },
        }),
      ],
    },
    actor: { uid: OWNER_UID },
  });
  assert.equal(second.lineItems[0].userOverride.active, true);
  assert.equal(second.lineItems[0].unitPrice, 500, 'the override survives untouched');
  assert.equal(second.lineItems[0].pricingSource, 'manual', 'never trusted as ai_suggested over a user override');
});

test('14. end-to-end through canonicalEstimateContent.js: report content shows only "Flacron Engine"/"Preliminary / Editable", never a raw provider/model/prompt string, for an estimate containing a proposal-applied item', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r14');
  const { proposalId } = await seedProposal(db, 'r14', {
    items: [suggestion({ suggestionId: 'sug-1', targetLineItemId: 'li-1', providerModel: { provider: 'openai', model: 'gpt-4o-mini-super-secret-internal-codename', promptVersion: 'v7' } })],
  });
  const estimate = await upsertCanonicalEstimate(db, {
    reportId: 'r14',
    body: {
      appliedProposals: [{ proposalId, acceptedSuggestionIds: ['sug-1'] }],
      lineItems: [li({ id: 'li-1', appliedSuggestionId: 'sug-1', pricingSource: 'ai_suggested' })],
    },
    actor: { uid: OWNER_UID },
  });
  const markdown = buildSection7DetailMarkdown(estimate, { reportStatus: 'draft' });
  assert.match(markdown, /Pricing Source: Pricing Source generated by: Flacron Engine/);
  assert.match(markdown, /Preliminary \/ Editable|Status:/i);
  assert.doesNotMatch(markdown, /openai/i);
  assert.doesNotMatch(markdown, /gpt-4o-mini-super-secret-internal-codename/i);
  assert.doesNotMatch(markdown, /promptVersion|v7/);
});

test('15. manual canonical-estimate editing/saving with NO appliedProposal is completely unaffected by any of this (no proposal ever generated/looked up)', async () => {
  const db = new FakeFirestore();
  await seedReport(db, 'r15');
  const estimate = await upsertCanonicalEstimate(db, {
    reportId: 'r15',
    body: { lineItems: [li({ id: 'li-1', materialUnitCost: 10, laborUnitCost: 5 })], changeSummary: 'Manual entry, no AI pricing involved' },
    actor: { uid: OWNER_UID },
  });
  assert.equal(estimate.lineItems[0].pricingSource, 'manual');
  assert.equal(estimate.lineItems[0].materialUnitCost, 10);
  assert.equal(estimate.totals.grandTotalCents, 15000);
  // (OPENAI_API_KEY-unset -> 503 PRICING_PROVIDER_UNAVAILABLE on the
  // GENERATION path is already covered by pricing-service.test.js's first
  // test, which must run module-fresh in its own file -- see that file's
  // own header comment for why it can't be duplicated here without
  // interfering with config/openai.js's lazy client caching.)
});
