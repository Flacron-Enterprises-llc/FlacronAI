/**
 * Typed wrappers for the subset of `backend/routes/payment.js` mobile v1 needs. Confirmed
 * against the actual route file (Phase 4 endpoint audit):
 *
 * - `GET /payment/current-subscription` and `GET /payment/invoices` are safe, read-only,
 *   and already in scope per `WEB_TO_MOBILE_REUSE_STRATEGY.md` §2.6 ("Mobile can safely
 *   **read** subscription state through these existing endpoints even before Phase 7 (IAP)
 *   ships").
 * - `POST /payment/cancel-subscription` only sets `cancel_at_period_end: true` (no
 *   immediate termination, no charge) and is confirmed idempotent server-side (repeat
 *   calls just re-set the same flag) — included as the one safe mutation.
 *
 * Deliberately NOT included: `POST /payment/create-checkout-session` and
 * `POST /payment/confirm-checkout`. Both create/modify a **real, live Stripe
 * subscription** (the checkout-session route can trigger an immediate proration charge on
 * an upgrade) — Apple/Google store policy requires IAP for mobile-initiated digital
 * subscription purchases, which is explicit Phase 7 scope
 * (`MOBILE_DEVELOPMENT_PHASES.md` — "highest-risk phase, flagged explicitly"), not Phase 4/5.
 * Do not add these here without a resolved IAP-vs-Stripe policy decision.
 */
import { apiRequest } from './client';

/** `tier` matches `backend/config/tiers.js`'s `TIER_ORDER` — always a base tier key, never
 * an `_annual` Stripe price variant (the backend already strips that suffix before this
 * response is built). */
export type BaseTier = 'starter' | 'professional' | 'agency' | 'enterprise';

export interface SubscriptionDetails {
  id: string;
  status: string;
  /** Raw Stripe subscription status, or `'cancelling'` when `cancelAtPeriodEnd` is true —
   * already resolved server-side, this app should not re-derive it from Stripe's raw enum. */
  stripeStatus: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  plan: string;
}

export interface CurrentSubscriptionResult {
  success: true;
  subscription: SubscriptionDetails | null;
  tier: BaseTier;
}

export interface Invoice {
  id: string;
  date: string;
  /** Already converted from Stripe cents to a decimal currency amount by the backend. */
  amount: number;
  currency: string;
  status: string;
  /** Direct Stripe-hosted invoice PDF URL. */
  pdf: string | null;
  description: string | null;
}

export const paymentApi = {
  getCurrentSubscription: () => apiRequest<CurrentSubscriptionResult>('/payment/current-subscription'),

  getInvoices: () => apiRequest<{ success: true; invoices: Invoice[] }>('/payment/invoices'),

  /** Idempotent server-side (re-flags the same cancel-at-period-end state on repeat
   * calls) — the one payment mutation marked retry-eligible. Never triggers an immediate
   * charge or termination. */
  cancelSubscription: () =>
    apiRequest<{ success: true; message: string; cancelAt: string }>('/payment/cancel-subscription', {
      method: 'POST',
      idempotent: true,
    }),
};
