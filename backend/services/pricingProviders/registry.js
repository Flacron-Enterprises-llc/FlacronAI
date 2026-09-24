// Phase 43 (OpenAI Preliminary Pricing Service). Provider registry.
//
// `PreliminaryPricingProvider` contract (documented here, not enforced by a
// TypeScript interface since this codebase is plain JS -- see CLAUDE.md
// section 4):
//   PROVIDER_NAME: string
//   PROMPT_VERSION: string
//   async generatePricing(normalizedInput, options) -> { items, meta }
//     normalizedInput: { locationContext, currency, pricingDate, items: [
//       { requestId, room, damageType, repairAction, description, material,
//         quantity, unit, trade, category } ] } -- already sanitized,
//       non-PII (see pricingService.js's buildNormalizedInput).
//     options: { timeoutMs, signal, callModel? } -- `callModel` is a
//       provider-internal test seam, not part of the public contract.
//     Returns RAW (not yet business-validated) items -- pricingService.js
//       does all validation/normalization/money math/caching. A provider
//       throws a categorized Error (`.code` one of the PRICING_* codes,
//       optionally `.transient`/`.retryAfterMs`) on failure; it never lets
//       a raw SDK error escape uncategorized.
//
// The provider is selected PURELY from server env config
// (`PRICING_PROVIDER`, default 'openai') -- a client request body can NEVER
// select provider/model/baseURL/prompt (see reports.js's
// POST /:id/estimate-detail/price-suggestions, which never reads any such
// field from req.body). Adding a future backend/services/pricingProviders/
// claudePricingProvider.js only requires registering it in PROVIDERS below
// -- no change to pricingService.js or the route.
const openaiPricingProvider = require('./openaiPricingProvider');

const PROVIDERS = {
  openai: openaiPricingProvider,
};

const DEFAULT_PROVIDER = 'openai';

// Returns the configured provider module, or `null` if `PRICING_PROVIDER`
// names an unknown provider (never throws -- the caller maps this to the
// same PRICING_PROVIDER_UNAVAILABLE response as a missing API key).
const getPricingProvider = () => {
  const key = (process.env.PRICING_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase();
  return PROVIDERS[key] || null;
};

module.exports = { getPricingProvider, PROVIDERS, DEFAULT_PROVIDER };
