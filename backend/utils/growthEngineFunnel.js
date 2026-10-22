// Flacron Growth Engine (FCGE) funnel hand-off for subscription checkout.
//
// Webinar / giveaway offers live in the Growth Engine, not in this app. An
// offer link opens FlacronAI with `?code=<OFFER>&fcge_ref=<ref>`; the frontend
// keeps both for the session and sends them with the checkout request. Here we:
//   - stamp `fcge_ref` on the Checkout Session and subscription metadata, so
//     the Growth Engine (which receives this account's Stripe webhooks and
//     filters them by app_id) credits the webinar or giveaway that made the sale;
//   - apply the offer code when it is a live Stripe promotion code that belongs
//     to this app (FCGE mirrors its offer codes into Stripe tagged with our
//     app_id); otherwise let the buyer type a code on the Stripe Checkout page.
// Nothing about a specific offer is configured in this app.

const FCGE_REF = /^[A-Za-z0-9_\-.]{10,400}$/;
const PROMO_CODE = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;

const isValidFcgeRef = (value) => typeof value === 'string' && FCGE_REF.test(value);

const normalizePromoCode = (value) => {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return PROMO_CODE.test(code) ? code : null;
};

const belongsToApp = (promotionCode, appId) => {
  const coupon = promotionCode && promotionCode.coupon;
  const tagged = [promotionCode && promotionCode.metadata, coupon && coupon.metadata]
    .map((m) => (m && m.app_id) || null)
    .filter(Boolean);
  // Tagged for another product on the shared account: never apply it here.
  return tagged.length > 0 && tagged.every((id) => id === appId);
};

// Checkout options for an optional offer code. Always returns either
// `{ discounts: [...] }` (code applied up front) or `{ allow_promotion_codes: true }`
// (Stripe shows its own code field) -- Stripe accepts only one of the two.
const resolveCheckoutDiscount = async (stripe, rawCode, appId) => {
  const code = normalizePromoCode(rawCode);
  if (!code) return { options: { allow_promotion_codes: true }, appliedCode: null };
  try {
    const { data } = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
    const promotionCode = data && data[0];
    if (promotionCode && promotionCode.coupon && promotionCode.coupon.valid && belongsToApp(promotionCode, appId)) {
      return { options: { discounts: [{ promotion_code: promotionCode.id }] }, appliedCode: code };
    }
  } catch (err) {
    console.warn('[Checkout] promotion code lookup failed:', err.message);
  }
  return { options: { allow_promotion_codes: true }, appliedCode: null };
};

// Metadata fields the Growth Engine reads from the session / subscription.
const funnelMetadata = ({ fcgeRef, appliedCode } = {}) => ({
  ...(isValidFcgeRef(fcgeRef) ? { fcge_ref: fcgeRef } : {}),
  ...(appliedCode ? { promo_code: appliedCode } : {}),
});

// Stripe rejects a session whose up-front discount doesn't fit the price
// (e.g. a coupon limited to other products); the checkout then falls back to
// the plain code field instead of failing.
const isDiscountRejection = (err) =>
  Boolean(err && err.type === 'StripeInvalidRequestError' && typeof err.param === 'string' && err.param.startsWith('discounts'));

module.exports = {
  isValidFcgeRef,
  normalizePromoCode,
  belongsToApp,
  resolveCheckoutDiscount,
  funnelMetadata,
  isDiscountRejection,
};
