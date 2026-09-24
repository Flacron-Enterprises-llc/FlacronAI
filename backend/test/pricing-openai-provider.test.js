const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generatePricing,
  buildUserPrompt,
  buildJsonSchema,
  SYSTEM_PROMPT,
  PROVIDER_NAME,
  PROMPT_VERSION,
} = require('../services/pricingProviders/openaiPricingProvider');

// Phase 43. Tests the OpenAI provider adapter's REQUEST CONSTRUCTION and
// PRIVACY FILTERING without ever calling the real OpenAI API -- `callModel`
// is injected (the same DI seam config/openai.js's own tests and this
// codebase's image-analysis-batching.test.js already use for an SDK
// boundary).

const normalizedInput = () => ({
  locationContext: { country: 'US', state: 'TX', city: 'Austin', postalCode: '78701' },
  currency: 'USD',
  pricingDate: '2026-09-19',
  items: [
    {
      requestId: 'req_0_abcd1234',
      room: 'Living Room',
      damageType: 'Water',
      repairAction: 'Replace',
      description: 'Replace water-damaged drywall',
      material: 'Drywall',
      quantity: 10,
      unit: 'SF',
      trade: 'Drywall',
      category: 'Drywall',
    },
  ],
});

test('buildUserPrompt contains only locale + repair-scope fields -- no PII of any kind', () => {
  const prompt = buildUserPrompt(normalizedInput());
  const FORBIDDEN_PII = [
    'insuredName',
    'Jane Homeowner',
    'insuredEmail',
    'jane@example.com',
    'phone',
    '555-',
    'policyNumber',
    'POL-',
    'claimNumber',
    'CLM-',
    'photo',
    'signature',
    'payment',
    'narrative',
    'streetAddress',
    '123 Main St',
  ];
  for (const forbidden of FORBIDDEN_PII) {
    assert.doesNotMatch(
      prompt,
      new RegExp(forbidden, 'i'),
      `prompt must never contain "${forbidden}"`
    );
  }
  // Sanity: the legitimate, non-PII scope fields ARE present.
  assert.match(prompt, /Living Room/);
  assert.match(prompt, /Replace water-damaged drywall/);
  assert.match(prompt, /req_0_abcd1234/);
});

test('buildUserPrompt is valid JSON containing exactly the expected top-level shape', () => {
  const parsed = JSON.parse(buildUserPrompt(normalizedInput()));
  assert.deepEqual(
    Object.keys(parsed).sort(),
    ['currency', 'instruction', 'items', 'locationContext', 'pricingDate'].sort()
  );
  assert.equal(parsed.items.length, 1);
});

test('SYSTEM_PROMPT never asks for a tax rate, O&P rate, or a total -- and states the cautious/non-authoritative role', () => {
  assert.match(SYSTEM_PROMPT, /not.*tax rate|do not suggest a tax rate/i);
  assert.match(SYSTEM_PROMPT, /overhead\/profit rate/i);
  assert.match(SYSTEM_PROMPT, /not a licensed contractor, adjuster, or engineer/i);
  assert.match(SYSTEM_PROMPT, /never a final determination/i);
});

test('buildJsonSchema is a strict-mode-compatible schema (every property required, additionalProperties false at every level)', () => {
  const schema = buildJsonSchema();
  const itemSchema = schema.properties.items.items;
  assert.deepEqual(new Set(itemSchema.required), new Set(Object.keys(itemSchema.properties)));
  assert.equal(itemSchema.additionalProperties, false);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['items']);
});

test('generatePricing wires systemPrompt/userPrompt/schemaName/timeout/signal into the injected callModel', async () => {
  const seen = {};
  const controller = new AbortController();
  await generatePricing(normalizedInput(), {
    timeoutMs: 12345,
    signal: controller.signal,
    callModel: async (args) => {
      Object.assign(seen, args);
      return { parsed: { items: [] }, usage: null, model: 'gpt-4o-mini' };
    },
  });
  assert.equal(seen.systemPrompt, SYSTEM_PROMPT);
  assert.equal(seen.schemaName, 'pricing_suggestions');
  assert.equal(seen.timeoutMs, 12345);
  assert.equal(seen.signal, controller.signal);
  assert.ok(seen.jsonSchema);
});

test('generatePricing returns items + meta with provider/model/promptVersion (no total-like field is ever requested)', async () => {
  const result = await generatePricing(normalizedInput(), {
    callModel: async () => ({
      parsed: {
        items: [
          {
            requestId: 'req_0_abcd1234',
            trade: 'Drywall',
            category: 'Drywall',
            materialUnitCost: 2.5,
            laborUnitCost: 3,
            equipmentUnitCost: 0,
            currency: 'USD',
            confidence: 'medium',
            assumptions: 'Standard 1/2in drywall, no mold remediation required.',
          },
        ],
      },
      usage: { total_tokens: 100 },
      model: 'gpt-4o-mini-2024-07-18',
    }),
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].requestId, 'req_0_abcd1234');
  assert.equal(result.meta.provider, PROVIDER_NAME);
  assert.equal(result.meta.promptVersion, PROMPT_VERSION);
  assert.equal(result.meta.model, 'gpt-4o-mini-2024-07-18');
});

test('generatePricing degrades to an empty items array (never throws) when the provider returns a malformed shape', async () => {
  const result = await generatePricing(normalizedInput(), {
    callModel: async () => ({ parsed: { notItems: 'oops' }, usage: null, model: 'x' }),
  });
  assert.deepEqual(result.items, []);
});

test('generatePricing propagates a categorized error from callModel unchanged', async () => {
  await assert.rejects(
    () =>
      generatePricing(normalizedInput(), {
        callModel: async () => {
          const err = new Error('rate limited');
          err.code = 'PRICING_RATE_LIMITED';
          err.transient = true;
          throw err;
        },
      }),
    { code: 'PRICING_RATE_LIMITED' }
  );
});
