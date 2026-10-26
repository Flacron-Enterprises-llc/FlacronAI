/**
 * Phase 7 — the ONE place that talks to the native store billing library (`expo-iap`:
 * StoreKit 2 on iOS, Google Play Billing on Android). Everything else in the app works with
 * the normalized types below, so the platform specifics stay behind this adapter and the
 * rest of the billing feature is testable without native code.
 *
 * `expo-iap` is a native module: it exists only in a development/production build, never in
 * Expo Go or on web. It is required lazily inside `load()` so importing this file can never
 * crash the app — an unavailable module just reports `isSupported() === false` and the
 * subscription screen shows an honest "not available in this build" state.
 *
 * Never logs a transaction, purchase token or account token.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { StorePlatform } from '@/services/api/billing';

export interface StoreProduct {
  productId: string;
  title: string;
  /** Localized, store-formatted recurring price (e.g. "$39.99", "39,99 €"). */
  displayPrice: string;
  /** Recurring billing period from the store, if the store reported one. */
  period: { unit: 'day' | 'week' | 'month' | 'year'; count: number } | null;
  /** Google Play only: the base plan + offer token for this product's matched base plan. */
  basePlanId: string | null;
  offerToken: string | null;
  /** iOS subscription group. Plan changes are only offered within the current group, so the
   * App Store treats them as an upgrade/downgrade, never a second subscription. */
  groupId: string | null;
}

/** Google Play replacement mode for an in-app plan change. */
export type ReplacementMode = 'charge-prorated-price' | 'with-time-proration';

export interface PlanReplacement {
  oldProductId: string;
  oldPurchaseToken: string;
  mode: ReplacementMode;
}

export type StorePurchaseState = 'purchased' | 'pending' | 'unknown';

export interface StorePurchase {
  platform: StorePlatform;
  productId: string;
  /** iOS transaction id. */
  transactionId: string | null;
  /** Android purchase token. */
  purchaseToken: string | null;
  state: StorePurchaseState;
  /** appAccountToken (iOS) / obfuscatedAccountId (Android) the purchase was made with. */
  accountToken: string | null;
  /** Opaque native object, only ever handed back to `finish()`. */
  native: unknown;
}

export type StoreErrorKind =
  | 'cancelled'
  | 'pending'
  | 'already_owned'
  | 'network'
  | 'unavailable'
  | 'product_unavailable'
  | 'unknown';

export interface StoreError {
  kind: StoreErrorKind;
  productId: string | null;
}

export interface StoreAdapter {
  platform: StorePlatform;
  isSupported(): boolean;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  fetchSubscriptions(skus: string[], basePlans: Record<string, string | null>): Promise<StoreProduct[]>;
  /** Starts the store sheet. The result arrives through `onPurchaseUpdated`/`onPurchaseError`. */
  requestSubscription(input: { product: StoreProduct; accountToken: string; replace?: PlanReplacement }): Promise<void>;
  finish(purchase: StorePurchase): Promise<void>;
  getAvailablePurchases(): Promise<StorePurchase[]>;
  /** User-initiated restore: syncs with the store (may prompt for the store sign-in on iOS),
   * then returns the store's current purchases. */
  restore(): Promise<StorePurchase[]>;
  onPurchaseUpdated(listener: (purchase: StorePurchase) => void): () => void;
  onPurchaseError(listener: (error: StoreError) => void): () => void;
  openManageSubscriptions(productId: string | null): Promise<void>;
}

type ExpoIap = typeof import('expo-iap');

let cached: ExpoIap | null | undefined;
function load(): ExpoIap | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-iap') as ExpoIap;
  } catch {
    cached = null;
  }
  return cached;
}

const PLATFORM: StorePlatform = Platform.OS === 'ios' ? 'ios' : 'android';

const ERROR_KINDS: Record<string, StoreErrorKind> = {
  'user-cancelled': 'cancelled',
  'deferred-payment': 'pending',
  pending: 'pending',
  'already-owned': 'already_owned',
  'network-error': 'network',
  'service-timeout': 'network',
  'service-disconnected': 'network',
  'connection-closed': 'network',
  'billing-unavailable': 'unavailable',
  'iap-not-available': 'unavailable',
  'feature-not-supported': 'unavailable',
  'init-connection': 'unavailable',
  'item-unavailable': 'product_unavailable',
  'sku-not-found': 'product_unavailable',
  'sku-offer-mismatch': 'product_unavailable',
};

export function toStoreError(raw: unknown): StoreError {
  const r = (raw ?? {}) as { code?: unknown; productId?: unknown };
  const code = typeof r.code === 'string' ? r.code : '';
  return { kind: ERROR_KINDS[code] ?? 'unknown', productId: typeof r.productId === 'string' ? r.productId : null };
}

const PERIOD_UNITS = new Set(['day', 'week', 'month', 'year']);

/** ISO-8601 billing period (Google, e.g. "P1M", "P1Y") → unit/count. */
export function parseIsoPeriod(iso: string | null | undefined): StoreProduct['period'] {
  const m = /^P(\d+)([DWMY])$/.exec(iso || '');
  if (!m) return null;
  const unit = ({ D: 'day', W: 'week', M: 'month', Y: 'year' } as const)[m[2] as 'D' | 'W' | 'M' | 'Y'];
  return { unit, count: Number(m[1]) };
}

/** Normalizes one `expo-iap` subscription product. Exported for tests. */
export function normalizeProduct(raw: Record<string, unknown>, basePlanId: string | null): StoreProduct | null {
  const productId = typeof raw.id === 'string' ? raw.id : null;
  if (!productId) return null;
  const title = String(raw.displayName || raw.title || productId);
  if (raw.platform === 'ios') {
    const unit = raw.subscriptionPeriodUnitIOS as string | undefined;
    const count = Number(raw.subscriptionPeriodNumberIOS || 1);
    const displayPrice = typeof raw.displayPrice === 'string' ? raw.displayPrice : '';
    if (!displayPrice) return null;
    return {
      productId,
      title,
      displayPrice,
      period: unit && PERIOD_UNITS.has(unit) ? { unit: unit as 'month', count: count > 0 ? count : 1 } : null,
      basePlanId: null,
      offerToken: null,
      groupId: typeof raw.subscriptionGroupIdIOS === 'string' ? raw.subscriptionGroupIdIOS : null,
    };
  }
  // Android: pick the configured base plan's own offer (no offer id = the base plan itself,
  // not a promotional/intro offer), and use its last (recurring) pricing phase.
  const offers = (Array.isArray(raw.subscriptionOffers) ? raw.subscriptionOffers : []) as Record<string, unknown>[];
  const candidates = offers.filter((o) => !basePlanId || o.basePlanIdAndroid === basePlanId);
  const phasesOf = (o: Record<string, unknown>) =>
    (o.pricingPhasesAndroid as { pricingPhaseList?: Record<string, unknown>[] } | null)?.pricingPhaseList ?? [];
  // Fallback: an offer with exactly one (recurring) phase is the plain base plan.
  const baseOffer =
    candidates.find((o) => !o.id || o.id === o.basePlanIdAndroid) ?? candidates.find((o) => phasesOf(o).length === 1) ?? null;
  if (!baseOffer || typeof baseOffer.offerTokenAndroid !== 'string') return null;
  const phases = phasesOf(baseOffer);
  const recurring = phases[phases.length - 1];
  const displayPrice = String((recurring && recurring.formattedPrice) || baseOffer.displayPrice || '');
  if (!displayPrice) return null;
  return {
    productId,
    title,
    displayPrice,
    period: parseIsoPeriod(recurring ? String(recurring.billingPeriod) : null),
    basePlanId: (baseOffer.basePlanIdAndroid as string) ?? basePlanId,
    offerToken: baseOffer.offerTokenAndroid,
    groupId: null,
  };
}

/** Normalizes one `expo-iap` purchase. Exported for tests. */
export function normalizePurchase(raw: Record<string, unknown>): StorePurchase | null {
  const productId = typeof raw.productId === 'string' ? raw.productId : null;
  if (!productId) return null;
  const isIos = PLATFORM === 'ios';
  const state = raw.purchaseState === 'pending' || raw.purchaseState === 'purchased' ? raw.purchaseState : 'unknown';
  const accountToken = (isIos ? raw.appAccountToken : raw.obfuscatedAccountIdAndroid) as string | null | undefined;
  return {
    platform: PLATFORM,
    productId,
    transactionId: isIos ? ((raw.transactionId as string) || (raw.id as string) || null) : null,
    purchaseToken: isIos ? null : ((raw.purchaseToken as string) || null),
    state: isIos && state === 'unknown' ? 'purchased' : state,
    accountToken: typeof accountToken === 'string' && accountToken ? accountToken.toLowerCase() : null,
    native: raw,
  };
}

export const expoIapAdapter: StoreAdapter = {
  platform: PLATFORM,

  isSupported: () => (Platform.OS === 'ios' || Platform.OS === 'android') && load() !== null,

  async connect() {
    const iap = load();
    if (!iap) return false;
    try {
      return !!(await iap.initConnection());
    } catch {
      return false;
    }
  },

  async disconnect() {
    const iap = load();
    if (!iap) return;
    try {
      await iap.endConnection();
    } catch {
      // ignore
    }
  },

  async fetchSubscriptions(skus, basePlans) {
    const iap = load();
    if (!iap || skus.length === 0) return [];
    const result = (await iap.fetchProducts({ skus, type: 'subs' })) ?? [];
    return (result as unknown as Record<string, unknown>[])
      .map((p) => normalizeProduct(p, basePlans[String(p.id)] ?? null))
      .filter((p): p is StoreProduct => p !== null);
  },

  async requestSubscription({ product, accountToken, replace }) {
    const iap = load();
    if (!iap) throw { code: 'iap-not-available' };
    await iap.requestPurchase({
      type: 'subs',
      request: {
        apple: { sku: product.productId, appAccountToken: accountToken },
        google: {
          skus: [product.productId],
          subscriptionOffers: product.offerToken ? [{ sku: product.productId, offerToken: product.offerToken }] : [],
          obfuscatedAccountId: accountToken,
          // Plan change: replaces the current Play subscription instead of adding a second one.
          ...(replace
            ? {
                purchaseToken: replace.oldPurchaseToken,
                subscriptionProductReplacementParams: { oldProductId: replace.oldProductId, replacementMode: replace.mode },
              }
            : {}),
        },
      },
    });
  },

  async finish(purchase) {
    const iap = load();
    if (!iap) return;
    await iap.finishTransaction({ purchase: purchase.native as never, isConsumable: false });
  },

  async getAvailablePurchases() {
    const iap = load();
    if (!iap) return [];
    const list = ((await iap.getAvailablePurchases()) ?? []) as unknown as Record<string, unknown>[];
    return list.map(normalizePurchase).filter((p): p is StorePurchase => p !== null);
  },

  async restore() {
    const iap = load();
    if (!iap) return [];
    await iap.restorePurchases();
    return expoIapAdapter.getAvailablePurchases();
  },

  onPurchaseUpdated(listener) {
    const iap = load();
    if (!iap) return () => {};
    const sub = iap.purchaseUpdatedListener((p) => {
      const normalized = normalizePurchase(p as unknown as Record<string, unknown>);
      if (normalized) listener(normalized);
    });
    return () => sub.remove();
  },

  onPurchaseError(listener) {
    const iap = load();
    if (!iap) return () => {};
    const sub = iap.purchaseErrorListener((e) => listener(toStoreError(e)));
    return () => sub.remove();
  },

  async openManageSubscriptions(productId) {
    const iap = load();
    if (!iap) return;
    await iap.deepLinkToSubscriptions({
      skuAndroid: productId,
      packageNameAndroid: Constants.expoConfig?.android?.package ?? null,
    });
  },
};
