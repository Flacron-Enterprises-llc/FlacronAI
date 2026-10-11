import type { BillingStatus } from '@/services/api/billing';
import { ApiRequestError } from '@/types/api';
import {
  acknowledgementText,
  deletedText,
  deletionWarnings,
  requestAccountDeletion,
  requiresBillingAcknowledgement,
  stillBillingText,
  warningText,
} from './deletion';

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
const store = (platform: 'ios' | 'android', autoRenew = true) => ({
  platform,
  productId: 'p',
  tier: 'professional' as const,
  period: 'monthly' as const,
  state: 'active' as const,
  expiresAt: null,
  autoRenew,
  isTest: false,
  renewsToTier: null,
  renewsToPeriod: null,
  active: true,
});

describe('subscription warnings before deletion', () => {
  it('no subscription: nothing to acknowledge', () => {
    const w = deletionWarnings(status(), 'ios');
    expect(w).toEqual([]);
    expect(requiresBillingAcknowledgement(w)).toBe(false);
  });

  it('Stripe, Apple and Google subscriptions are each called out and must be acknowledged', () => {
    const w = deletionWarnings(status({ stripe: { active: true, status: 'active', tier: 'agency' }, store: store('android') }), 'ios');
    expect(w.map((x) => x.kind)).toEqual(['stripe_active', 'store_active']);
    expect(requiresBillingAcknowledgement(w)).toBe(true);
    // Stripe: cancelled by deletion, consequence explained up front (no refund).
    expect(warningText(w[0])).toMatch(/cancels it immediately/);
    expect(warningText(w[0])).toMatch(/not refunded/);
    expect(acknowledgementText(w)).toMatch(/cancels my FlacronAI web subscription without a refund, and does not cancel App Store or Google Play/);
    // Store: never cancelled by deletion.
    expect(warningText(w[1])).toMatch(/does not cancel it/);
    expect(warningText(w[1])).toMatch(/Google Play/);
    expect(warningText(w[1])).toMatch(/on that device/);
    const ios = deletionWarnings(status({ store: store('ios') }), 'ios');
    expect(ios[0]).toEqual({ kind: 'store_active', platform: 'ios', sameDevice: true });
    expect(warningText(ios[0])).toMatch(/Manage subscription/);
  });

  it('already-cancelled subscriptions are informational only', () => {
    const w = deletionWarnings(status({ stripe: { active: true, status: 'cancelling', tier: 'agency' }, store: store('ios', false) }), 'ios');
    expect(w.map((x) => x.kind)).toEqual(['stripe_cancelling', 'store_cancelled']);
    expect(requiresBillingAcknowledgement(w)).toBe(false);
  });

  it('unknown billing status still warns (never assumes there is nothing to cancel)', () => {
    const w = deletionWarnings(null, 'android');
    expect(w).toEqual([{ kind: 'status_unknown' }]);
    expect(requiresBillingAcknowledgement(w)).toBe(true);
    expect(warningText(w[0])).toMatch(/cannot cancel App Store or Google Play/);
  });

  it('pre-deletion warnings never claim a store subscription was or will be cancelled', () => {
    const all = [
      ...deletionWarnings(status({ store: store('ios') }), 'ios'),
      ...deletionWarnings(status({ store: store('android') }), 'ios'),
    ].map(warningText);
    for (const t of all) expect(t).not.toMatch(/(subscription (was|has been) cancel)|(we cancel)|cancels it/i);
    expect(acknowledgementText(deletionWarnings(status({ store: store('ios') }), 'ios'))).toMatch(/does not cancel my App Store or Google Play/);
    expect(stillBillingText({ stripe: true, store: 'ios' })).toMatch(/still active/);
    expect(stillBillingText({ stripe: false, store: null })).toBeNull();
  });

  it('final message: Stripe cancellation only claimed when the server confirmed it; store still billing is stated', () => {
    expect(deletedText({ kind: 'deleted', stillBilling: { stripe: false, store: null }, stripeCancelled: 2 })).toMatch(/web subscription was cancelled/);
    const none = deletedText({ kind: 'deleted', stillBilling: { stripe: false, store: 'ios' }, stripeCancelled: 0 });
    expect(none).not.toMatch(/cancelled/);
    expect(none).toMatch(/App Store subscription is still active/);
  });
});

describe('deletion request', () => {
  const err = (code: string | null, category: ApiRequestError['category'], status = 500) =>
    new ApiRequestError('x', { status, code, category, retryable: category !== 'validation' });

  it('success: local cleanup (sign-out, wipe) runs only after the server confirmed', async () => {
    const order: string[] = [];
    const out = await requestAccountDeletion({
      deleteAccount: async () => {
        order.push('delete');
        return { success: true, message: 'ok', subscriptionsStillBilling: { stripe: false, store: 'android' }, stripeSubscriptionsCancelled: 1 };
      },
      cleanup: async () => {
        order.push('cleanup');
      },
    });
    expect(order).toEqual(['delete', 'cleanup']);
    expect(out).toEqual({ kind: 'deleted', stillBilling: { stripe: false, store: 'android' }, stripeCancelled: 1 });
  });

  it.each([
    ['RECENT_LOGIN_REQUIRED', 'permission', 403, 'reauth_required'],
    ['TEAM_OWNER_BLOCKED', 'conflict', 409, 'team_owner'],
    ['DELETE_ACCOUNT_INCOMPLETE', 'transient_server', 500, 'retry'],
    ['STRIPE_CANCELLATION_FAILED', 'transient_server', 502, 'retry'],
    ['STRIPE_CANCELLATION_FAILED', 'unknown', 502, 'retry'],
    ['DELETE_IN_PROGRESS', 'conflict', 409, 'retry'],
    [null, 'offline', 0, 'retry'],
    [null, 'timeout', 0, 'retry'],
    ['SOMETHING_ELSE', 'validation', 400, 'failed'],
  ] as const)('%s -> %s, and the user stays signed in', async (code, category, status, kind) => {
    const cleanup = jest.fn(() => Promise.resolve());
    const out = await requestAccountDeletion({ deleteAccount: () => Promise.reject(err(code, category, status)), cleanup });
    expect(out.kind).toBe(kind);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('retry after an ambiguous failure: an already-deleted account counts as deleted', async () => {
    const cleanup = jest.fn(() => Promise.resolve());
    const out = await requestAccountDeletion({ deleteAccount: () => Promise.reject(err('ACCOUNT_DELETED', 'auth_fatal', 401)), cleanup });
    expect(out.kind).toBe('deleted');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('a failing local cleanup never turns a confirmed deletion into an error', async () => {
    const out = await requestAccountDeletion({
      deleteAccount: async () => ({ success: true, message: 'ok' }),
      cleanup: () => Promise.reject(new Error('storage busy')),
    });
    expect(out.kind).toBe('deleted');
  });
});
