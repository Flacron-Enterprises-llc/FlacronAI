import type { BillingStatus, CatalogProduct, StoreCatalog } from '@/services/api/billing';
import { buildPlanOffers, changeOptions, formatBillingPeriod, replacementModeFor, resolveAvailability } from './planCatalog';
import type { StoreProduct } from './storeAdapter';

// Product IDs are test fixtures, not real store products.
const catalog: CatalogProduct[] = [
  { tierKey: 'professional', tier: 'professional', period: 'monthly', productId: 'test.pro', basePlanId: 'monthly', planName: 'Professional', reportsPerMonth: 50, exportFormats: ['pdf'] },
  { tierKey: 'professional_annual', tier: 'professional', period: 'annual', productId: 'test.pro', basePlanId: 'annual', planName: 'Professional', reportsPerMonth: 50, exportFormats: ['pdf'] },
  { tierKey: 'agency', tier: 'agency', period: 'monthly', productId: 'test.agency', basePlanId: 'monthly', planName: 'Agency', reportsPerMonth: 200, exportFormats: ['pdf'] },
];
const store = (o: Partial<StoreProduct>): StoreProduct => ({
  productId: 'test.pro',
  title: 'Pro',
  displayPrice: '39,99 €',
  period: { unit: 'month', count: 1 },
  basePlanId: 'monthly',
  offerToken: 'offer',
  groupId: null,
  ...o,
});

const status = (o: Partial<BillingStatus> = {}): BillingStatus => ({
  success: true,
  tier: 'starter',
  stripe: { active: false, status: null, tier: null },
  store: null,
  team: { active: false },
  admin: { active: false, tier: null },
  canPurchaseInApp: true,
  purchaseBlockedReason: null,
  ...o,
});
const storeCatalog = (o: Partial<StoreCatalog> = {}): StoreCatalog => ({ success: true, platform: 'android', available: true, reason: null, products: catalog, ...o });

describe('buildPlanOffers', () => {
  it('uses the store localized price and only marks matched products purchasable', () => {
    const offers = buildPlanOffers(catalog, [store({}), store({ basePlanId: 'annual', displayPrice: '399,99 €', period: { unit: 'year', count: 1 } })]);
    expect(offers.map((o) => [o.key, o.purchasable, o.store?.displayPrice ?? null, o.unavailableReason])).toEqual([
      ['professional', true, '39,99 €', null],
      ['professional_annual', true, '399,99 €', null],
      ['agency', false, null, 'NOT_IN_STORE'],
    ]);
    expect(formatBillingPeriod(offers[1])).toBe('per year');
  });

  it('refuses a store product whose billing period contradicts the server mapping', () => {
    const [monthly] = buildPlanOffers(catalog.slice(0, 1), [store({ period: { unit: 'year', count: 1 } })]);
    expect(monthly.purchasable).toBe(false);
    expect(monthly.unavailableReason).toBe('PERIOD_MISMATCH');
  });

  it('formats multi-unit periods from the store', () => {
    expect(formatBillingPeriod({ period: 'monthly', store: store({ period: { unit: 'month', count: 3 } }) })).toBe('every 3 months');
    expect(formatBillingPeriod({ period: 'monthly', store: null })).toBe('per month');
  });
});

describe('resolveAvailability', () => {
  const offers = buildPlanOffers(catalog, [store({})]);
  const base = { platform: 'android' as const, loading: false, offline: false, error: false, supported: true, connected: true, status: status(), catalog: storeCatalog(), offers };

  it.each([
    [{ loading: true }, 'loading'],
    [{ status: null, offline: true }, 'offline'],
    [{ status: null }, 'error'],
    [{ supported: false }, 'unsupported'],
    [{ connected: false }, 'unsupported'],
    [{ catalog: storeCatalog({ available: false, reason: 'STORE_NOT_CONFIGURED', products: [] }) }, 'store_unconfigured'],
    [{ catalog: storeCatalog({ available: false, reason: 'NO_PRODUCTS', products: [] }) }, 'no_products'],
    [{ offers: buildPlanOffers(catalog, []) }, 'no_products'],
    [{}, 'ready'],
  ] as const)('%j -> %s', (patch, expected) => {
    expect(resolveAvailability({ ...base, ...patch })).toBe(expected);
  });

  it('existing subscribers see their plan even when the store is unavailable', () => {
    expect(
      resolveAvailability({ ...base, supported: false, status: status({ canPurchaseInApp: false, purchaseBlockedReason: 'WEB_SUBSCRIPTION_ACTIVE' }) })
    ).toBe('blocked_web');
    expect(resolveAvailability({ ...base, status: status({ canPurchaseInApp: false, purchaseBlockedReason: 'STORE_SUBSCRIPTION_ACTIVE' }) })).toBe(
      'blocked_store'
    );
  });
});

describe('plan changes', () => {
  const activeStore = (platform: 'ios' | 'android', productId = 'test.pro', period: 'monthly' | 'annual' = 'monthly') =>
    status({
      canPurchaseInApp: false,
      purchaseBlockedReason: 'STORE_SUBSCRIPTION_ACTIVE',
      store: { platform, productId, tier: 'professional', period, state: 'active', expiresAt: null, autoRenew: true, isTest: false, renewsToTier: null, renewsToPeriod: null, active: true },
    });
  const offers = buildPlanOffers(catalog, [
    store({ basePlanId: 'monthly', groupId: 'g1' }),
    store({ basePlanId: 'annual', period: { unit: 'year', count: 1 }, groupId: 'g1' }),
    store({ productId: 'test.agency', basePlanId: 'monthly', groupId: 'g2' }),
  ]);

  it('Android: every other purchasable plan, never the current one', () => {
    expect(changeOptions(offers, activeStore('android'), 'android').map((o) => o.key)).toEqual(['professional_annual', 'agency']);
  });

  it('iOS: only plans in the current subscription group (no second subscription)', () => {
    expect(changeOptions(offers, activeStore('ios'), 'ios').map((o) => o.key)).toEqual(['professional_annual']);
  });

  it('a subscription from the other store, or none, offers no in-app change', () => {
    expect(changeOptions(offers, activeStore('ios'), 'android')).toEqual([]);
    expect(changeOptions(offers, status(), 'android')).toEqual([]);
  });

  it('availability: change_plan on the same store, blocked_store otherwise; team plans are never sold', () => {
    const base = { loading: false, offline: false, error: false, supported: true, connected: true, catalog: storeCatalog(), offers };
    expect(resolveAvailability({ ...base, platform: 'android', status: activeStore('android') })).toBe('change_plan');
    expect(resolveAvailability({ ...base, platform: 'ios', status: activeStore('android') })).toBe('blocked_store');
    expect(resolveAvailability({ ...base, platform: 'android', status: status({ canPurchaseInApp: false, purchaseBlockedReason: 'TEAM_PLAN_ACTIVE' }) })).toBe('blocked_team');
  });

  it('replacement mode: upgrade -> prorated charge now; otherwise time-prorated switch', () => {
    expect(replacementModeFor('professional', { tier: 'agency' })).toBe('charge-prorated-price');
    expect(replacementModeFor('agency', { tier: 'professional' })).toBe('with-time-proration');
    expect(replacementModeFor('professional', { tier: 'professional' })).toBe('with-time-proration');
  });
});
