import { normalizeProduct, normalizePurchase, parseIsoPeriod, toStoreError } from './storeAdapter';

// Shapes mirror expo-iap 5.x types (ProductSubscriptionIOS/Android, PurchaseIOS). The native
// module itself is never loaded in tests.
describe('store adapter normalization', () => {
  it('iOS product: store-localized price + period', () => {
    expect(
      normalizeProduct(
        { platform: 'ios', id: 'test.pro', displayName: 'Pro', displayPrice: '£34.99', subscriptionPeriodUnitIOS: 'month', subscriptionPeriodNumberIOS: '1' },
        null
      )
    ).toEqual({ productId: 'test.pro', title: 'Pro', displayPrice: '£34.99', period: { unit: 'month', count: 1 }, basePlanId: null, offerToken: null, groupId: null });
  });

  it('a product without a store price is never presented', () => {
    expect(normalizeProduct({ platform: 'ios', id: 'test.pro', displayPrice: '' }, null)).toBeNull();
    expect(normalizeProduct({ platform: 'ios' }, null)).toBeNull();
  });

  it('Android product: picks the configured base plan, not an intro/promo offer', () => {
    const product = {
      platform: 'android',
      id: 'test_pro',
      title: 'Pro',
      subscriptionOffers: [
        {
          id: 'intro-50',
          basePlanIdAndroid: 'monthly',
          offerTokenAndroid: 'intro-token',
          pricingPhasesAndroid: { pricingPhaseList: [{ formattedPrice: '₹100', billingPeriod: 'P1M' }, { formattedPrice: '₹999', billingPeriod: 'P1M' }] },
        },
        {
          id: null,
          basePlanIdAndroid: 'monthly',
          offerTokenAndroid: 'base-token',
          pricingPhasesAndroid: { pricingPhaseList: [{ formattedPrice: '₹999', billingPeriod: 'P1M' }] },
        },
        {
          id: null,
          basePlanIdAndroid: 'annual',
          offerTokenAndroid: 'annual-token',
          pricingPhasesAndroid: { pricingPhaseList: [{ formattedPrice: '₹9,999', billingPeriod: 'P1Y' }] },
        },
      ],
    };
    expect(normalizeProduct(product, 'monthly')).toMatchObject({ offerToken: 'base-token', displayPrice: '₹999', period: { unit: 'month', count: 1 } });
    expect(normalizeProduct(product, 'annual')).toMatchObject({ offerToken: 'annual-token', basePlanId: 'annual', period: { unit: 'year', count: 1 } });
    expect(normalizeProduct(product, 'weekly')).toBeNull();
  });

  it('parses ISO billing periods', () => {
    expect(parseIsoPeriod('P3M')).toEqual({ unit: 'month', count: 3 });
    expect(parseIsoPeriod('P1W')).toEqual({ unit: 'week', count: 1 });
    expect(parseIsoPeriod('bogus')).toBeNull();
  });

  it('iOS purchase: transaction id + appAccountToken (lowercased), no token', () => {
    expect(
      normalizePurchase({ productId: 'test.pro', transactionId: '2000', purchaseState: 'purchased', appAccountToken: 'ABCDEF00-1111-4111-8111-111111111111' })
    ).toMatchObject({ platform: 'ios', transactionId: '2000', purchaseToken: null, state: 'purchased', accountToken: 'abcdef00-1111-4111-8111-111111111111' });
    expect(normalizePurchase({})).toBeNull();
  });

  it('maps store error codes to UI kinds', () => {
    expect(toStoreError({ code: 'user-cancelled' }).kind).toBe('cancelled');
    expect(toStoreError({ code: 'deferred-payment' }).kind).toBe('pending');
    expect(toStoreError({ code: 'already-owned', productId: 'p' })).toEqual({ kind: 'already_owned', productId: 'p' });
    expect(toStoreError({ code: 'network-error' }).kind).toBe('network');
    expect(toStoreError({ code: 'sku-not-found' }).kind).toBe('product_unavailable');
    expect(toStoreError(new Error('???')).kind).toBe('unknown');
  });
});
