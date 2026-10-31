/**
 * Phase 7 — typed wrappers for `backend/routes/billing.js` (App Store / Google Play
 * subscriptions). Web (Stripe) billing is untouched and still read via `payment.ts`.
 *
 * The backend is the only authority on entitlement: a store purchase grants nothing until
 * `POST /billing/store/verify` has verified it with Apple/Google server-side. The app never
 * reports "success" on its own.
 */
import { apiRequest } from './client';
import type { BaseTier } from './payment';

export type StorePlatform = 'ios' | 'android';
export type BillingPeriod = 'monthly' | 'annual';

export type StoreSubscriptionState =
  | 'active'
  | 'grace_period'
  | 'billing_retry'
  | 'on_hold'
  | 'paused'
  | 'pending'
  | 'expired'
  | 'revoked'
  | 'replaced'
  | 'unknown';

export interface StoreEntitlement {
  platform: StorePlatform;
  productId: string;
  tier: BaseTier;
  period: BillingPeriod;
  state: StoreSubscriptionState;
  /** ISO timestamp from the store's verified data. */
  expiresAt: string | null;
  autoRenew: boolean;
  isTest: boolean;
  /** A plan change the store reports for the next renewal (Apple downgrade/crossgrade). */
  renewsToTier: BaseTier | null;
  renewsToPeriod: BillingPeriod | null;
  active: boolean;
}

export type PurchaseBlockedReason = 'WEB_SUBSCRIPTION_ACTIVE' | 'TEAM_PLAN_ACTIVE' | 'STORE_SUBSCRIPTION_ACTIVE';

export interface BillingStatus {
  success: true;
  /** Effective tier across every billing source — what the server enforces. */
  tier: BaseTier;
  stripe: { active: boolean; status: string | null; tier: BaseTier | null };
  store: StoreEntitlement | null;
  /** Non-billing grants (team plan, admin grant) — explain the plan; never purchasable. */
  team: { active: boolean };
  admin: { active: boolean; tier: BaseTier | null };
  canPurchaseInApp: boolean;
  purchaseBlockedReason: PurchaseBlockedReason | null;
}

export interface CatalogProduct {
  tierKey: string;
  tier: BaseTier;
  period: BillingPeriod;
  productId: string;
  /** Google Play base plan; null on iOS. */
  basePlanId: string | null;
  planName: string;
  /** -1 = unlimited. Live value from the server's plan configuration. */
  reportsPerMonth: number;
  exportFormats: string[];
}

export interface StoreCatalog {
  success: true;
  platform: StorePlatform;
  available: boolean;
  reason: 'STORE_NOT_CONFIGURED' | 'NO_PRODUCTS' | null;
  products: CatalogProduct[];
}

export interface VerifyRequest {
  platform: StorePlatform;
  productId: string;
  /** iOS StoreKit 2 transaction id. */
  transactionId?: string;
  /** Google Play purchase token. */
  purchaseToken?: string;
  source: 'purchase' | 'restore';
}

export interface VerifyResult extends BillingStatus {
  verified: true;
  entitled: boolean;
  subscription: StoreEntitlement | null;
  /** True once the server has durably recorded the purchase — only then may the app
   * finish/acknowledge the store transaction. */
  finish: boolean;
}

export const billingApi = {
  getStatus: () => apiRequest<BillingStatus>('/billing/status'),

  getCatalog: (platform: StorePlatform) =>
    apiRequest<StoreCatalog>('/billing/store/catalog', { params: { platform } }),

  /** Create-if-absent, so repeating it is safe. */
  getAccountToken: () =>
    apiRequest<{ success: true; accountToken: string }>('/billing/store/account-token', {
      method: 'POST',
      idempotent: true,
    }),

  /** Idempotent server-side (same store state → same record), so transient failures may be
   * retried. */
  verify: (body: VerifyRequest) =>
    apiRequest<VerifyResult>('/billing/store/verify', { method: 'POST', body, idempotent: true, timeoutMs: 30000 }),
};
