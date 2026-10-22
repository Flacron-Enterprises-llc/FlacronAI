const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidFcgeRef,
  normalizePromoCode,
  belongsToApp,
  resolveCheckoutDiscount,
  funnelMetadata,
  isDiscountRejection,
} = require('../utils/growthEngineFunnel');

const APP = 'flacron-ai';

const fakeStripe = (data, { fail = false } = {}) => {
  const calls = [];
  return {
    calls,
    promotionCodes: {
      list: async (params) => {
        calls.push(params);
        if (fail) throw new Error('network down');
        return { data };
      },
    },
  };
};

const promo = ({ id = 'promo_1', appId = APP, couponAppId, valid = true } = {}) => ({
  id,
  metadata: appId ? { app_id: appId } : {},
  coupon: { valid, metadata: couponAppId ? { app_id: couponAppId } : {} },
});

test('isValidFcgeRef accepts the Growth Engine ref format only', () => {
  assert.equal(isValidFcgeRef('wbn_abc.123-XYZ'), true);
  assert.equal(isValidFcgeRef('short'), false);
  assert.equal(isValidFcgeRef('has space in it'), false);
  assert.equal(isValidFcgeRef('a'.repeat(401)), false);
  assert.equal(isValidFcgeRef(undefined), false);
  assert.equal(isValidFcgeRef({ ref: 'wbn_abc.123-XYZ' }), false);
});

test('normalizePromoCode uppercases and rejects junk', () => {
  assert.equal(normalizePromoCode(' pilot50 '), 'PILOT50');
  assert.equal(normalizePromoCode('WEBINAR_797'), 'WEBINAR_797');
  assert.equal(normalizePromoCode('x'), null);
  assert.equal(normalizePromoCode('code with space'), null);
  assert.equal(normalizePromoCode('<script>'), null);
  assert.equal(normalizePromoCode(42), null);
});

test('belongsToApp needs our app_id and no other', () => {
  assert.equal(belongsToApp(promo(), APP), true);
  assert.equal(belongsToApp(promo({ appId: null, couponAppId: APP }), APP), true);
  assert.equal(belongsToApp(promo({ appId: 'flacron-energy' }), APP), false);
  assert.equal(belongsToApp(promo({ appId: APP, couponAppId: 'being-tchitaka-os' }), APP), false);
  assert.equal(belongsToApp(promo({ appId: null }), APP), false);
});

test('no code: Stripe shows its own promotion code field', async () => {
  const stripe = fakeStripe([]);
  const r = await resolveCheckoutDiscount(stripe, undefined, APP);
  assert.deepEqual(r, { options: { allow_promotion_codes: true }, appliedCode: null });
  assert.equal(stripe.calls.length, 0);
});

test('our live code is applied up front', async () => {
  const stripe = fakeStripe([promo({ id: 'promo_ours' })]);
  const r = await resolveCheckoutDiscount(stripe, 'pilot50', APP);
  assert.deepEqual(r, { options: { discounts: [{ promotion_code: 'promo_ours' }] }, appliedCode: 'PILOT50' });
  assert.deepEqual(stripe.calls[0], { code: 'PILOT50', active: true, limit: 1 });
});

test('another app\'s code, an expired coupon, an unknown code or a lookup error fall back to the code field', async () => {
  for (const stripe of [
    fakeStripe([promo({ appId: 'flacron-energy' })]),
    fakeStripe([promo({ valid: false })]),
    fakeStripe([]),
    fakeStripe([], { fail: true }),
  ]) {
    const r = await resolveCheckoutDiscount(stripe, 'PILOT50', APP);
    assert.deepEqual(r, { options: { allow_promotion_codes: true }, appliedCode: null });
  }
});

test('funnelMetadata carries a valid fcge_ref and the applied code only', () => {
  assert.deepEqual(funnelMetadata({ fcgeRef: 'wbn_abc.123-XYZ', appliedCode: 'PILOT50' }), { fcge_ref: 'wbn_abc.123-XYZ', promo_code: 'PILOT50' });
  assert.deepEqual(funnelMetadata({ fcgeRef: 'bad ref', appliedCode: null }), {});
  assert.deepEqual(funnelMetadata(), {});
});

test('isDiscountRejection matches Stripe errors on the discounts param only', () => {
  assert.equal(isDiscountRejection({ type: 'StripeInvalidRequestError', param: 'discounts[0][promotion_code]' }), true);
  assert.equal(isDiscountRejection({ type: 'StripeInvalidRequestError', param: 'line_items' }), false);
  assert.equal(isDiscountRejection({ type: 'StripeCardError', param: 'discounts' }), false);
  assert.equal(isDiscountRejection(null), false);
});
