/**
 * Phase 8 — account deletion: subscription warnings (from the server's billing status) and the
 * deletion request flow. Policy (decision §10.26, 2026-10-07): deleting the account cancels the
 * account's FlacronAI web (Stripe) subscriptions — the server confirms with Stripe before deleting
 * anything, with no refund for past payments. App Store / Google Play subscriptions can only be
 * cancelled by the user in the store; the app never says those were cancelled.
 */
import type { BillingStatus, StorePlatform } from '@/services/api/billing';
import type { DeleteAccountResult } from '@/services/api/users';
import { ApiRequestError } from '@/types/api';

export type DeletionWarning =
  | { kind: 'stripe_active' }
  | { kind: 'stripe_cancelling' }
  | { kind: 'store_active'; platform: StorePlatform; sameDevice: boolean }
  | { kind: 'store_cancelled'; platform: StorePlatform }
  | { kind: 'status_unknown' };

const storeName = (p: StorePlatform) => (p === 'ios' ? 'App Store' : 'Google Play');

export function deletionWarnings(status: BillingStatus | null, platform: StorePlatform): DeletionWarning[] {
  if (!status) return [{ kind: 'status_unknown' }];
  const out: DeletionWarning[] = [];
  if (status.stripe.active) out.push({ kind: status.stripe.status === 'cancelling' ? 'stripe_cancelling' : 'stripe_active' });
  const store = status.store;
  if (store && store.active) {
    out.push(
      store.autoRenew
        ? { kind: 'store_active', platform: store.platform, sameDevice: store.platform === platform }
        : { kind: 'store_cancelled', platform: store.platform }
    );
  }
  return out;
}

export function warningText(w: DeletionWarning): string {
  switch (w.kind) {
    case 'stripe_active':
      return 'You have a subscription billed through the FlacronAI website (Stripe). Deleting your account cancels it immediately, so you will not be charged for it again. Your plan ends right away and past payments are not refunded.';
    case 'stripe_cancelling':
      return 'Your web subscription is already set to end at the close of the current billing period. Deleting your account ends it immediately; past payments are not refunded.';
    case 'store_active':
      return w.sameDevice
        ? `Your subscription is billed by the ${storeName(w.platform)}. Deleting your account does not cancel it — cancel it in your ${storeName(w.platform)} subscriptions first (use “Manage subscription” below).`
        : `Your subscription is billed by the ${storeName(w.platform)}. Deleting your account does not cancel it — cancel it in ${storeName(w.platform)} subscriptions on that device first.`;
    case 'store_cancelled':
      return `Your ${storeName(w.platform)} subscription is already cancelled and will not renew.`;
    case 'status_unknown':
      return "We couldn't check your subscriptions right now. Deleting your account cancels any subscription billed through the FlacronAI website (no refund for past payments), but it cannot cancel App Store or Google Play subscriptions — check those yourself before continuing.";
  }
}

/** Billing consequences the user must acknowledge: a Stripe plan ending now, or one that keeps billing. */
export const requiresBillingAcknowledgement = (warnings: DeletionWarning[]) =>
  warnings.some((w) => w.kind === 'stripe_active' || w.kind === 'store_active' || w.kind === 'status_unknown');

export function acknowledgementText(warnings: DeletionWarning[]): string {
  const stripe = warnings.some((w) => w.kind === 'stripe_active' || w.kind === 'status_unknown');
  const store = warnings.some((w) => w.kind === 'store_active' || w.kind === 'status_unknown');
  if (stripe && store) {
    return 'I understand that deleting my account cancels my FlacronAI web subscription without a refund, and does not cancel App Store or Google Play subscriptions.';
  }
  if (stripe) return 'I understand that deleting my account cancels my FlacronAI web subscription immediately, without a refund.';
  return 'I understand that deleting my account does not cancel my App Store or Google Play subscription.';
}

export type DeletionOutcome =
  | { kind: 'deleted'; stillBilling: DeleteAccountResult['subscriptionsStillBilling'] | null; stripeCancelled: number }
  | { kind: 'reauth_required' }
  | { kind: 'team_owner'; message: string }
  | { kind: 'retry'; message: string }
  | { kind: 'failed'; message: string };

const RETRYABLE = new Set(['offline', 'timeout', 'rate_limited', 'transient_server']);

/**
 * Calls the (idempotent) deletion endpoint and classifies the result. Local cleanup / sign-out
 * runs ONLY after the server confirmed deletion — a failed or unknown result keeps the user
 * signed in so they can retry.
 */
export async function requestAccountDeletion(deps: {
  deleteAccount: () => Promise<DeleteAccountResult>;
  cleanup: () => Promise<void>;
}): Promise<DeletionOutcome> {
  let result: DeleteAccountResult | null = null;
  try {
    result = await deps.deleteAccount();
  } catch (err) {
    const code = err instanceof ApiRequestError ? err.code : (err as { code?: string })?.code;
    // A retry after an earlier request already completed: the account is gone.
    if (code === 'ACCOUNT_DELETED' || code === 'auth/user-not-found') {
      await deps.cleanup().catch(() => {});
      return { kind: 'deleted', stillBilling: null, stripeCancelled: 0 };
    }
    if (code === 'RECENT_LOGIN_REQUIRED') return { kind: 'reauth_required' };
    if (code === 'TEAM_OWNER_BLOCKED') {
      return {
        kind: 'team_owner',
        message: 'You still own an enterprise team. Remove all team members (on the web) before deleting your account.',
      };
    }
    // Stripe could not confirm the cancellation: the server deleted nothing.
    if (code === 'STRIPE_CANCELLATION_FAILED') {
      return {
        kind: 'retry',
        message:
          "We couldn't confirm with Stripe that your web subscription was cancelled, so your account was not deleted and nothing was removed. Please try again in a moment.",
      };
    }
    if (code === 'DELETE_IN_PROGRESS') {
      return { kind: 'retry', message: 'Your account deletion is already in progress. Wait a moment, then tap Delete again.' };
    }
    if (err instanceof ApiRequestError && (err.code === 'DELETE_ACCOUNT_INCOMPLETE' || RETRYABLE.has(err.category))) {
      return {
        kind: 'retry',
        message: 'Your account was not fully deleted yet. Check your connection and tap Delete again — it is safe to retry.',
      };
    }
    return { kind: 'failed', message: "Your account couldn't be deleted. Please try again or contact support." };
  }
  await deps.cleanup().catch(() => {});
  return {
    kind: 'deleted',
    stillBilling: result?.subscriptionsStillBilling ?? null,
    stripeCancelled: result?.stripeSubscriptionsCancelled ?? 0,
  };
}

/** Final message after a confirmed deletion — states only what the server confirmed. */
export function deletedText(outcome: Extract<DeletionOutcome, { kind: 'deleted' }>): string {
  const base =
    outcome.stripeCancelled > 0
      ? 'Your FlacronAI account and its data have been deleted, and your web subscription was cancelled — you will not be charged for it again.'
      : 'Your FlacronAI account and its data have been deleted.';
  const still = stillBillingText(outcome.stillBilling);
  return still ? `${base} ${still}` : base;
}

export function stillBillingText(still: DeleteAccountResult['subscriptionsStillBilling'] | null): string | null {
  if (!still) return null;
  const parts: string[] = [];
  if (still.stripe) parts.push('your web subscription is still active — cancel it at flacronai.com');
  if (still.store) parts.push(`your ${storeName(still.store)} subscription is still active — cancel it in ${storeName(still.store)} subscriptions`);
  return parts.length ? `Note: ${parts.join(', and ')}.` : null;
}
