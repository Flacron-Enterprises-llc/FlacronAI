// Phase 43 (OpenAI Preliminary Pricing Service). Implements the
// `PreliminaryPricingProvider` contract (see registry.js's header comment)
// against backend/config/openai.js. This module is deliberately THIN: it
// only (a) builds the sanitized prompt/schema and (b) parses the raw
// response into a plain `{ items, meta }` shape. It does NOT do business
// validation (money/unit/currency/length caps), does NOT compute
// unitPrice/lineTotal, and does NOT cache -- all of that lives in
// pricingService.js, which is provider-agnostic. This split is what lets a
// future backend/services/pricingProviders/claudePricingProvider.js exist
// without pricingService.js or the route changing at all.
//
// Golden Rule #2/#4: the model is asked ONLY for preliminary material/
// labor/equipment cost components, a confidence level, and assumptions --
// never a tax rate, O&P rate, or a "total" (pricingService.js discards any
// total-like field even if one were present, and always computes
// qty * (material+labor+equipment) itself). `room`/`damageType`/
// `repairAction`/`description`/`material`/`quantity`/`unit` are NOT asked
// of the model at all -- they are echoed straight from the caller's own
// request (see pricingService.js's `normalizedInput.items[].requestId`
// matching), so the model can never invent or alter the scope of what's
// being priced, only suggest a price for the exact scope the user entered.
const openaiConfig = require('../../config/openai');

const PROVIDER_NAME = 'openai';
// Bump this whenever SYSTEM_PROMPT/buildJsonSchema's shape changes in a way
// that would make an old cached suggestion (keyed in part on this string,
// see pricingFingerprint.js) no longer comparable to a freshly generated one.
const PROMPT_VERSION = 'v1';

const SYSTEM_PROMPT = [
  'You are a preliminary cost-estimation assistant for insurance property-damage repair line items.',
  'You suggest PRELIMINARY, EDITABLE material, labor, and equipment unit costs for a described repair scope.',
  'You are NOT a licensed contractor, adjuster, or engineer, and your output is never a final determination of cost, coverage, liability, cause of loss, or repair necessity -- a qualified professional always reviews and may change every figure you suggest.',
  'Do not suggest a tax rate, an overhead/profit rate, permits, general conditions, or any kind of "total" -- suggest ONLY per-unit materialUnitCost, laborUnitCost, and equipmentUnitCost (any component that does not apply is 0), plus a confidence level and brief assumptions.',
  'Use only the region and repair-scope fields provided. Do not invent property details, brand names, or specific vendor pricing you cannot reasonably justify from general market knowledge. If you are not reasonably confident, use "low" confidence and say so in assumptions rather than guessing high.',
  "Respond ONLY with the requested structured JSON -- echo each item's exact requestId so your suggestions can be matched back to the correct line item.",
].join(' ');

const buildUserPrompt = (normalizedInput) =>
  JSON.stringify(
    {
      instruction:
        "Suggest preliminary material/labor/equipment unit costs (per the stated unit and currency) for each item below, for the given region and pricing date. Echo each item's requestId exactly.",
      locationContext: normalizedInput.locationContext,
      currency: normalizedInput.currency,
      pricingDate: normalizedInput.pricingDate,
      items: normalizedInput.items,
    },
    null,
    0
  );

// Structured-output JSON schema. `strict: true` (set by config/openai.js)
// requires every property to be listed in `required` and
// `additionalProperties: false` at every object level -- both satisfied
// here, which is what makes the response shape schema-GUARANTEED rather
// than merely schema-requested.
const buildJsonSchema = () => ({
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          requestId: { type: 'string' },
          trade: { type: 'string' },
          category: { type: 'string' },
          materialUnitCost: { type: 'number' },
          laborUnitCost: { type: 'number' },
          equipmentUnitCost: { type: 'number' },
          currency: { type: 'string' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          assumptions: { type: 'string' },
        },
        required: [
          'requestId',
          'trade',
          'category',
          'materialUnitCost',
          'laborUnitCost',
          'equipmentUnitCost',
          'currency',
          'confidence',
          'assumptions',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
});

// `callModel` is injectable (defaults to config/openai.js's real network
// call) purely so tests can stub the SDK boundary without ever reaching the
// real OpenAI API -- the same dependency-injection convention this
// codebase's image-analysis-batching.test.js already uses for
// `callVisionApi`.
const generatePricing = async (
  normalizedInput,
  { callModel = openaiConfig.generateStructuredPricing, timeoutMs, signal } = {}
) => {
  const { parsed, usage, model } = await callModel({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(normalizedInput),
    jsonSchema: buildJsonSchema(),
    schemaName: 'pricing_suggestions',
    timeoutMs,
    signal,
  });

  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  return {
    items,
    meta: {
      provider: PROVIDER_NAME,
      model: model || openaiConfig.MODEL,
      promptVersion: PROMPT_VERSION,
      usage,
    },
  };
};

module.exports = {
  PROVIDER_NAME,
  PROMPT_VERSION,
  generatePricing,
  // exported for direct unit testing (privacy/shape assertions) without a
  // network call
  buildUserPrompt,
  buildJsonSchema,
  SYSTEM_PROMPT,
};
