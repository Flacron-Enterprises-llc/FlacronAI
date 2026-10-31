/**
 * Phase 7 — handles one store purchase/transaction end to end, independent of React:
 *
 *  1. Never trusts the device: the purchase is sent to the backend, which verifies it with
 *     Apple/Google before any access is granted.
 *  2. Finishes (iOS) / acknowledges (Android) the store transaction ONLY after the server
 *     says it durably recorded it (`finish: true`). Pending purchases, failures and
 *     transient errors leave the transaction unfinished so the store redelivers it and it can
 *     be recovered later (next launch, restore, or the server's store notifications).
 *  3. Account isolation: each signed-in session has a generation number. A purchase made
 *     with another FlacronAI account's token is not submitted for this account, and a
 *     verification result that arrives after sign-out / account switch is never applied to
 *     the new session's UI.
 *  4. The same transaction is never processed twice concurrently (listener + restore +
 *     reconcile can all see it).
 */
import { ApiRequestError } from '@/types/api';
import type { VerifyRequest, VerifyResult } from '@/services/api/billing';
import type { StorePurchase } from './storeAdapter';

export interface BillingSession {
  uid: string;
  generation: number;
  /** Server-issued token for this account, once fetched. */
  accountToken: string | null;
}

/** The current signed-in billing session (one per uid mount). Plain closure, not React state:
 * read only from callbacks, never during render. */
export function createSessionStore() {
  let session: BillingSession | null = null;
  return {
    get: (): BillingSession | null => session,
    set: (next: BillingSession | null) => {
      session = next;
    },
    /** Clears the session only if it is still the given generation. */
    end: (generation: number) => {
      if (session?.generation === generation) session = null;
    },
  };
}
export type SessionStore = ReturnType<typeof createSessionStore>;

export type ProcessOutcome =
  | { kind: 'verified'; result: VerifyResult }
  | { kind: 'pending' }
  | { kind: 'other_account' }
  | { kind: 'owned_elsewhere' }
  | { kind: 'retry_later' }
  | { kind: 'failed'; code: string | null }
  | { kind: 'stale' }
  | { kind: 'duplicate' };

export interface PurchaseProcessorDeps {
  verify: (req: VerifyRequest) => Promise<VerifyResult>;
  finish: (purchase: StorePurchase) => Promise<void>;
  getSession: () => BillingSession | null;
}

const RETRYABLE = new Set(['offline', 'timeout', 'rate_limited', 'transient_server']);

export const purchaseKey = (p: StorePurchase) => `${p.platform}:${p.transactionId || p.purchaseToken || ''}`;

export function createPurchaseProcessor(deps: PurchaseProcessorDeps) {
  const inFlight = new Set<string>();

  async function process(purchase: StorePurchase, source: VerifyRequest['source']): Promise<ProcessOutcome> {
    const session = deps.getSession();
    if (!session) return { kind: 'stale' }; // signed out — keep the transaction for later
    if (!purchase.transactionId && !purchase.purchaseToken) return { kind: 'failed', code: 'INVALID_PURCHASE' };

    const key = purchaseKey(purchase);
    if (inFlight.has(key)) return { kind: 'duplicate' };

    if (purchase.accountToken && session.accountToken && purchase.accountToken !== session.accountToken) {
      return { kind: 'other_account' };
    }
    if (purchase.state === 'pending') return { kind: 'pending' };

    inFlight.add(key);
    try {
      let result: VerifyResult;
      try {
        result = await deps.verify({
          platform: purchase.platform,
          productId: purchase.productId,
          ...(purchase.platform === 'ios' ? { transactionId: purchase.transactionId! } : { purchaseToken: purchase.purchaseToken! }),
          source,
        });
      } catch (err) {
        if (err instanceof ApiRequestError) {
          if (err.code === 'ACCOUNT_MISMATCH') return { kind: 'other_account' };
          if (err.code === 'PURCHASE_OWNED_BY_OTHER_ACCOUNT') return { kind: 'owned_elsewhere' };
          if (err.retryable || RETRYABLE.has(err.category) || err.code === 'STORE_UNAVAILABLE') return { kind: 'retry_later' };
          return { kind: 'failed', code: err.code ?? null };
        }
        return { kind: 'retry_later' };
      }

      if (result.finish) {
        try {
          await deps.finish(purchase);
        } catch {
          // The server already holds the purchase; the store will redeliver it and the
          // idempotent verify path will simply finish it next time.
        }
      }
      const now = deps.getSession();
      if (!now || now.generation !== session.generation) return { kind: 'stale' };
      if (!result.finish) return { kind: 'pending' };
      return { kind: 'verified', result };
    } finally {
      inFlight.delete(key);
    }
  }

  return { process };
}

export function outcomeMessage(outcome: ProcessOutcome, storeName: string): { tone: 'success' | 'info' | 'error'; text: string } | null {
  switch (outcome.kind) {
    case 'verified':
      return outcome.result.entitled
        ? { tone: 'success', text: 'Your subscription is active on this account.' }
        : { tone: 'info', text: `${storeName} reports this subscription is no longer active.` };
    case 'pending':
      return { tone: 'info', text: `Your purchase is pending approval in ${storeName}. Access starts once it completes.` };
    case 'other_account':
      return {
        tone: 'error',
        text: 'This purchase was made while signed in to a different FlacronAI account. Sign in to that account to use it.',
      };
    case 'owned_elsewhere':
      return {
        tone: 'error',
        text: `This ${storeName} subscription is already linked to a different FlacronAI account and can't be moved. Contact support if you need help.`,
      };
    case 'retry_later':
      return {
        tone: 'error',
        text: "We couldn't confirm your purchase yet. You won't be charged twice — we'll retry automatically, or tap Restore purchases.",
      };
    case 'failed':
      return { tone: 'error', text: "This purchase couldn't be verified. No access was granted. Contact support if you were charged." };
    default:
      return null;
  }
}
