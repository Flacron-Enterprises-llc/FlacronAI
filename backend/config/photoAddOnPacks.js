// Phase 45 (Stripe Report-Specific Photo Add-Ons).
//
// The ONE server-authoritative catalogue of report-specific photo add-on
// packs -- client sends only a `packId`; every other attribute (label,
// capacity, price, currency, active status, and the environment-matched
// Stripe Price ID) is resolved here, server-side, never trusted from a
// request. Mirrors planConfig.js's own "one seam, never scattered" pattern
// for tier limits (Phase 44) -- this is that same idea for add-on packs.
//
// AUTHORITATIVE CLIENT CONFIRMATION (do not change without a new client
// confirmation): +25=$4.99, +50=$7.99, +100=$12.99, +250=$24.99, USD,
// one-time purchases tied to one specific report.
//
// Stripe Price IDs are read from environment variables, kept in clearly
// separate test/live slots per pack (never mixed) -- see .env.example. A
// pack whose environment-matched slot is empty still appears in the public
// catalogue (so pricing UI can render) but cannot be checked out against;
// see resolvePackForCheckout below, which is the only function permitted to
// gate on Price ID presence.
const SCHEMA_VERSION = 1;

// Stripe account access has not been accepted yet (see PHASES.md Phase 45).
// No live/test Price ID exists anywhere in this file -- every slot below is
// read from an environment variable that is empty until an operator
// configures it post-access. This is intentional: shipping a fabricated
// `price_xxx`-looking default would be indistinguishable from a real one and
// is explicitly disallowed.
const CATALOGUE = Object.freeze([
  Object.freeze({
    id: 'photos_25',
    label: '+25 Photos',
    capacity: 25,
    amountCents: 499,
    currency: 'usd',
    active: true,
    stripePriceId: Object.freeze({
      test: process.env.STRIPE_PRICE_PHOTOS_25_TEST || null,
      live: process.env.STRIPE_PRICE_PHOTOS_25_LIVE || null,
    }),
  }),
  Object.freeze({
    id: 'photos_50',
    label: '+50 Photos',
    capacity: 50,
    amountCents: 799,
    currency: 'usd',
    active: true,
    stripePriceId: Object.freeze({
      test: process.env.STRIPE_PRICE_PHOTOS_50_TEST || null,
      live: process.env.STRIPE_PRICE_PHOTOS_50_LIVE || null,
    }),
  }),
  Object.freeze({
    id: 'photos_100',
    label: '+100 Photos',
    capacity: 100,
    amountCents: 1299,
    currency: 'usd',
    active: true,
    stripePriceId: Object.freeze({
      test: process.env.STRIPE_PRICE_PHOTOS_100_TEST || null,
      live: process.env.STRIPE_PRICE_PHOTOS_100_LIVE || null,
    }),
  }),
  Object.freeze({
    id: 'photos_250',
    label: '+250 Photos',
    capacity: 250,
    amountCents: 2499,
    currency: 'usd',
    active: true,
    stripePriceId: Object.freeze({
      test: process.env.STRIPE_PRICE_PHOTOS_250_TEST || null,
      live: process.env.STRIPE_PRICE_PHOTOS_250_LIVE || null,
    }),
  }),
]);

// Tamper-proof, cannot be spoofed by a client or by NODE_ENV drifting from
// reality: Stripe's own key prefix is the only thing that actually
// determines which mode a secret key operates in. Defaults to 'test'
// whenever the key is absent/malformed -- never silently "live".
const resolveStripeMode = (secretKey = process.env.STRIPE_SECRET_KEY) =>
  typeof secretKey === 'string' && secretKey.startsWith('sk_live_') ? 'live' : 'test';

const isPositiveInteger = (v) => Number.isInteger(v) && v > 0;

// Validates the catalogue shape itself (unique ids, positive integers, valid
// currency/label/active) -- independent of whether any Price ID env var is
// set, since a pack can be validly defined and simply not yet purchasable.
const validateCatalogue = (packs = CATALOGUE) => {
  const errors = [];
  if (!Array.isArray(packs) || packs.length === 0) {
    return { valid: false, errors: ['catalogue must be a non-empty array'] };
  }
  const seenIds = new Set();
  for (const pack of packs) {
    if (!pack || typeof pack !== 'object') {
      errors.push('pack entry is not an object');
      continue;
    }
    if (!pack.id || typeof pack.id !== 'string') {
      errors.push(`pack has invalid id: ${JSON.stringify(pack.id)}`);
    } else if (seenIds.has(pack.id)) {
      errors.push(`duplicate pack id: ${pack.id}`);
    } else {
      seenIds.add(pack.id);
    }
    if (!pack.label || typeof pack.label !== 'string') errors.push(`pack "${pack.id}" missing a label`);
    if (!isPositiveInteger(pack.capacity)) errors.push(`pack "${pack.id}".capacity must be a positive integer (got ${JSON.stringify(pack.capacity)})`);
    if (!isPositiveInteger(pack.amountCents)) errors.push(`pack "${pack.id}".amountCents must be a positive integer (got ${JSON.stringify(pack.amountCents)})`);
    if (typeof pack.currency !== 'string' || pack.currency !== pack.currency.toLowerCase() || pack.currency.length !== 3) {
      errors.push(`pack "${pack.id}".currency must be a lowercase 3-letter ISO code (got ${JSON.stringify(pack.currency)})`);
    }
    if (typeof pack.active !== 'boolean') errors.push(`pack "${pack.id}".active must be a boolean`);
  }
  return { valid: errors.length === 0, errors };
};

// Internal (never sent to the client): looks up any pack by id, active or not.
const findPack = (packId, packs = CATALOGUE) => packs.find((p) => p.id === packId) || null;

// Only an ACTIVE, known pack may be purchased. Used by the checkout route
// before anything else -- an unknown or deliberately-deactivated pack is
// rejected identically (never distinguishes "unknown" from "inactive" to a
// client, avoiding an enumeration oracle).
const resolveActivePack = (packId, packs = CATALOGUE) => {
  const pack = findPack(packId, packs);
  return pack && pack.active ? pack : null;
};

// The environment-matched Price ID for a pack, or null if that slot isn't
// configured yet. Never falls back across modes (a test-mode key must never
// resolve a live Price ID, and vice versa).
const getPackPriceId = (pack, mode = resolveStripeMode()) => (pack && pack.stripePriceId ? pack.stripePriceId[mode] || null : null);

// Sanitized shape safe to send to the browser: display info only, never the
// Stripe Price ID or which slots are configured.
const toPublicPack = (pack) => ({
  id: pack.id,
  label: pack.label,
  capacity: pack.capacity,
  amountCents: pack.amountCents,
  currency: pack.currency,
  active: pack.active,
});

const getPublicCatalogue = (packs = CATALOGUE) => packs.filter((p) => p.active).map(toPublicPack);

// Phase 48 admin view: the full catalogue (including inactive packs and
// display order) plus a SANITIZED per-mode Price ID status -- 'configured'
// (an env var is set) or 'not_configured'. Never 'verified': no live Stripe
// retrieval is performed anywhere in this codebase yet (Phase 45's own
// pending-live-validation status), so a Price ID can never be reported as
// more than "configured" here. Never returns the Price ID value itself.
// Read-only by design -- capacity/amountCents/currency are the client's
// confirmed, contractual values (see header comment) and are not exposed as
// admin-editable in this phase, so this catalogue never becomes a second,
// independently-editable source of truth alongside this file.
const getAdminCatalogue = (packs = CATALOGUE) =>
  packs.map((pack, index) => ({
    id: pack.id,
    label: pack.label,
    capacity: pack.capacity,
    amountCents: pack.amountCents,
    currency: pack.currency,
    active: pack.active,
    order: index,
    priceIdStatus: {
      test: pack.stripePriceId?.test ? 'configured' : 'not_configured',
      live: pack.stripePriceId?.live ? 'configured' : 'not_configured',
    },
  }));

module.exports = {
  SCHEMA_VERSION,
  CATALOGUE,
  resolveStripeMode,
  validateCatalogue,
  findPack,
  resolveActivePack,
  getPackPriceId,
  getPublicCatalogue,
  getAdminCatalogue,
  toPublicPack,
};
