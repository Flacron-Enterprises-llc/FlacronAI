#!/usr/bin/env node
// Creates / verifies FlacronAI's Stripe catalog in the shared Flacron
// Enterprises account, per the company Stripe standard:
//   - Products named "FlacronAI - <Plan>", fixed product ids
//   - Prices with stable lookup keys, app_id metadata on Product AND Price
//   - Idempotent: re-running converges. A changed amount archives the old
//     Price and moves the lookup key to a new one (Prices are immutable).
// Amounts mirror frontend/src/data/plans.js (monthly; annual = 12 x 80%) and
// backend/config/photoAddOnPacks.js -- what customers see is what they pay.
//
// Usage (key from env, never a CLI argument):
//   STRIPE_SECRET_KEY=rk_test_... node scripts/stripe-sync-catalog.js [--dry-run] [--verify]
// Prints the STRIPE_PRICE_* env lines for the key's mode.

const Stripe = require('stripe');
const { APP_ID } = require('../config/stripeApp');

const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error('STRIPE_SECRET_KEY is required'); process.exit(2); }
const stripe = Stripe(key);
const live = /^(sk|rk)_live_/.test(key);
const DRY = process.argv.includes('--dry-run');
const VERIFY = process.argv.includes('--verify');

const BRAND = 'FlacronAI';
// The site shows the annual plan as a per-month rate rounded to the cent
// (plans.js annualRate), so the yearly charge is exactly 12 x that rate.
const annual = (monthlyCents) => Math.round(monthlyCents * 0.8) * 12;

const PLANS = [
  { id: 'professional', name: 'Professional', monthly: 3999 },
  { id: 'agency', name: 'Agency', monthly: 9999 },
  { id: 'enterprise', name: 'Enterprise', monthly: 49900 },
];
const PACKS = [
  { id: 'photos_25', name: 'Photo Pack +25', amount: 499, env: 'PHOTOS_25' },
  { id: 'photos_50', name: 'Photo Pack +50', amount: 799, env: 'PHOTOS_50' },
  { id: 'photos_100', name: 'Photo Pack +100', amount: 1299, env: 'PHOTOS_100' },
  { id: 'photos_250', name: 'Photo Pack +250', amount: 2499, env: 'PHOTOS_250' },
];

// Desired catalog: one entry per Price.
const desired = [];
for (const p of PLANS) {
  const productId = `flacron_ai_${p.id}`;
  const product = { id: productId, name: `${BRAND} - ${p.name}`, metadata: { app_id: APP_ID, flacron_ai_plan: p.id } };
  desired.push({ product, lookup: `flacron_ai_${p.id}_monthly`, amount: p.monthly, recurring: { interval: 'month' },
    nickname: `${BRAND} - ${p.name} (monthly)`, env: `STRIPE_PRICE_${p.id.toUpperCase()}`,
    metadata: { app_id: APP_ID, flacron_ai_plan: p.id, flacron_ai_interval: 'month' } });
  desired.push({ product, lookup: `flacron_ai_${p.id}_annual`, amount: annual(p.monthly), recurring: { interval: 'year' },
    nickname: `${BRAND} - ${p.name} (annual)`, env: `STRIPE_PRICE_${p.id.toUpperCase()}_ANNUAL`,
    metadata: { app_id: APP_ID, flacron_ai_plan: p.id, flacron_ai_interval: 'year' } });
}
for (const pk of PACKS) {
  const product = { id: `flacron_ai_${pk.id}`, name: `${BRAND} - ${pk.name}`, metadata: { app_id: APP_ID, flacron_ai_pack: pk.id } };
  desired.push({ product, lookup: `flacron_ai_${pk.id}`, amount: pk.amount, recurring: null,
    nickname: `${BRAND} - ${pk.name}`, env: `STRIPE_PRICE_${pk.env}_${live ? 'LIVE' : 'TEST'}`,
    metadata: { app_id: APP_ID, flacron_ai_pack: pk.id } });
}

const sameMeta = (have = {}, want) => Object.entries(want).every(([k, v]) => have[k] === v);

async function ensureProduct(want) {
  let prod = null;
  try { prod = await stripe.products.retrieve(want.id); } catch (e) { if (e.code !== 'resource_missing') throw e; }
  if (!prod) {
    if (VERIFY) return { problem: `missing product ${want.id}` };
    if (DRY) return { action: `create product ${want.id}` };
    prod = await stripe.products.create({ id: want.id, name: want.name, metadata: want.metadata });
    return { prod, action: `created product ${want.id}` };
  }
  if (prod.name !== want.name || !sameMeta(prod.metadata, want.metadata) || !prod.active) {
    if (VERIFY) return { prod, problem: `product ${want.id} name/metadata/active differs` };
    if (DRY) return { prod, action: `update product ${want.id}` };
    prod = await stripe.products.update(want.id, { name: want.name, metadata: want.metadata, active: true });
    return { prod, action: `updated product ${want.id}` };
  }
  return { prod };
}

async function ensurePrice(d) {
  const found = (await stripe.prices.list({ lookup_keys: [d.lookup], limit: 1 })).data[0] || null;
  const matches = found && found.active && found.unit_amount === d.amount && found.currency === 'usd'
    && found.product === d.product.id
    && (d.recurring ? found.recurring?.interval === d.recurring.interval : !found.recurring);
  if (matches) {
    if (!sameMeta(found.metadata, d.metadata) || found.nickname !== d.nickname) {
      if (VERIFY) return { price: found, problem: `price ${d.lookup} metadata/nickname differs` };
      if (!DRY) await stripe.prices.update(found.id, { metadata: d.metadata, nickname: d.nickname });
      return { price: found, action: `tagged price ${d.lookup}` };
    }
    return { price: found };
  }
  if (VERIFY) return { problem: `price ${d.lookup} missing or wrong (amount/interval/product)` };
  if (DRY) return { action: `create price ${d.lookup} (${d.amount})${found ? ` and archive ${found.id}` : ''}` };
  const price = await stripe.prices.create({
    product: d.product.id, currency: 'usd', unit_amount: d.amount,
    ...(d.recurring ? { recurring: d.recurring } : {}),
    lookup_key: d.lookup, transfer_lookup_key: true, nickname: d.nickname, metadata: d.metadata,
  });
  if (found && found.active) await stripe.prices.update(found.id, { active: false });
  return { price, action: `created price ${d.lookup}${found ? ` (archived ${found.id})` : ''}` };
}

(async () => {
  const acct = await stripe.accounts.retrieve();
  console.log(`account ${acct.id} (${acct.settings?.dashboard?.display_name}) | mode ${live ? 'LIVE' : 'TEST'} | app_id ${APP_ID}${DRY ? ' | DRY RUN' : ''}${VERIFY ? ' | VERIFY' : ''}`);
  const problems = [];
  const env = [];
  const seenProducts = new Set();
  for (const d of desired) {
    if (!seenProducts.has(d.product.id)) {
      seenProducts.add(d.product.id);
      const r = await ensureProduct(d.product);
      if (r.action) console.log('  ' + r.action);
      if (r.problem) problems.push(r.problem);
    }
    const r = await ensurePrice(d);
    if (r.action) console.log('  ' + r.action);
    if (r.problem) problems.push(r.problem);
    if (r.price) env.push(`${d.env}=${r.price.id}`);
  }
  console.log('\n# env for this mode');
  env.forEach((l) => console.log(l));
  if (problems.length) { console.log('\nPROBLEMS:\n  ' + problems.join('\n  ')); process.exit(1); }
  console.log(`\nOK: ${desired.length} prices verified for ${APP_ID}`);
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
