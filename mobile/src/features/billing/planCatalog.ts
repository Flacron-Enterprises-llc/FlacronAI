/**
 * Phase 7 — merges the server's configured plan catalog (tier mapping, plan limits) with the
 * store's own product data (localized price, billing period). Nothing here is hardcoded:
 * a plan is purchasable only when the server maps it AND the store returned a matching,
 * consistent product.
 */
import type { BillingStatus, CatalogProduct, StoreCatalog } from '@/services/api/billing';
import type { ReplacementMode, StoreProduct } from './storeAdapter';

export type PlanUnavailableReason = 'NOT_IN_STORE' | 'PERIOD_MISMATCH';

export interface PlanOffer {
  key: string;
  tier: CatalogProduct['tier'];
  period: CatalogProduct['period'];
  planName: string;
  reportsPerMonth: number;
  productId: string;
  store: StoreProduct | null;
  purchasable: boolean;
  unavailableReason: PlanUnavailableReason | null;
}

const expectedPeriod = (p: CatalogProduct['period']) =>
  p === 'annual' ? { unit: 'year', count: 1 } : { unit: 'month', count: 1 };

export function buildPlanOffers(catalog: CatalogProduct[], storeProducts: StoreProduct[]): PlanOffer[] {
  return catalog.map((c) => {
    const store =
      storeProducts.find((s) => s.productId === c.productId && (!c.basePlanId || s.basePlanId === c.basePlanId)) ?? null;
    const want = expectedPeriod(c.period);
    // A store period that contradicts the server mapping means a misconfigured product —
    // never sell it under the wrong billing period.
    const periodMismatch = !!(store && store.period && (store.period.unit !== want.unit || store.period.count !== want.count));
    const reason: PlanUnavailableReason | null = !store ? 'NOT_IN_STORE' : periodMismatch ? 'PERIOD_MISMATCH' : null;
    return {
      key: c.tierKey,
      tier: c.tier,
      period: c.period,
      planName: c.planName,
      reportsPerMonth: c.reportsPerMonth,
      productId: c.productId,
      store,
      purchasable: !reason,
      unavailableReason: reason,
    };
  });
}

/** "per month", "per year", "every 3 months" — from the store's period when present. */
export function formatBillingPeriod(offer: Pick<PlanOffer, 'period' | 'store'>): string {
  const p = offer.store?.period ?? expectedPeriod(offer.period);
  if (p.count === 1) return `per ${p.unit}`;
  return `every ${p.count} ${p.unit}s`;
}

export type BillingAvailability =
  | 'loading'
  | 'offline'
  | 'error'
  | 'unsupported'
  | 'store_unconfigured'
  | 'no_products'
  | 'blocked_web'
  | 'blocked_team'
  | 'blocked_store'
  | 'change_plan'
  | 'ready';

export function resolveAvailability(input: {
  platform: 'ios' | 'android';
  loading: boolean;
  offline: boolean;
  error: boolean;
  supported: boolean;
  connected: boolean;
  status: BillingStatus | null;
  catalog: StoreCatalog | null;
  offers: PlanOffer[];
}): BillingAvailability {
  if (input.loading) return 'loading';
  if (!input.status) return input.offline ? 'offline' : 'error';
  // Existing subscribers are handled before anything store-related, so they always see
  // their real plan even when in-app purchases are unavailable.
  if (input.status.purchaseBlockedReason === 'WEB_SUBSCRIPTION_ACTIVE') return 'blocked_web';
  if (input.status.purchaseBlockedReason === 'TEAM_PLAN_ACTIVE') return 'blocked_team';
  if (input.status.purchaseBlockedReason === 'STORE_SUBSCRIPTION_ACTIVE') {
    // Same store on this device: plans can be changed in the app (store-side replacement).
    const sameStore = input.status.store?.platform === input.platform && input.supported && input.connected;
    return sameStore && changeOptions(input.offers, input.status, input.platform).length ? 'change_plan' : 'blocked_store';
  }
  if (!input.supported || !input.connected) return 'unsupported';
  if (!input.catalog) return input.offline ? 'offline' : 'error';
  if (input.catalog.reason === 'STORE_NOT_CONFIGURED') return 'store_unconfigured';
  if (!input.catalog.available || !input.offers.some((o) => o.purchasable)) return 'no_products';
  return 'ready';
}

const TIER_RANK = ['starter', 'professional', 'agency', 'enterprise'];

/**
 * Plans an active store subscriber may switch to from the app. Excludes the current plan.
 * iOS: only products in the current product's subscription group (the App Store then treats
 * it as an upgrade/downgrade/crossgrade — never a second subscription); unknown group → none.
 * Android: any other purchasable plan (Google Play replaces the current subscription).
 */
export function changeOptions(offers: PlanOffer[], status: BillingStatus, platform: 'ios' | 'android'): PlanOffer[] {
  const store = status.store;
  if (!store || !store.active || store.platform !== platform) return [];
  const current = offers.find((o) => o.productId === store.productId && o.period === store.period);
  const currentGroup = current?.store?.groupId ?? null;
  return offers.filter((o) => {
    if (!o.purchasable || !o.store || o === current) return false;
    if (platform === 'ios') return !!currentGroup && o.store.groupId === currentGroup;
    return true;
  });
}

/** Google Play replacement mode: a higher tier starts now and charges the prorated price
 * difference; anything else switches now with the unused value credited as time. */
export function replacementModeFor(currentTier: string, target: Pick<PlanOffer, 'tier'>): ReplacementMode {
  return TIER_RANK.indexOf(target.tier) > TIER_RANK.indexOf(currentTier) ? 'charge-prorated-price' : 'with-time-proration';
}
