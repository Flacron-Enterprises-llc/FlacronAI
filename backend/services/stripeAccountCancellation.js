// Account deletion -> Stripe: cancel every recurring subscription the deleting
// account owns, BEFORE any irreversible data deletion, and confirm with Stripe.
//
// Ownership comes only from trusted server records: the Stripe customer id(s)
// stored on the user doc / deletion tombstone (written by our own checkout code)
// and the stored subscription id. A customer whose Stripe metadata names a
// DIFFERENT uid is refused, and a stored subscription that belongs to neither a
// trusted customer nor this uid is never touched.
//
// Side effects are limited to stopping future billing: subscriptions are
// cancelled immediately with `invoice_now: false` + `prorate: false` (no final
// invoice, no proration credit, no refund); not-yet-started subscription
// schedules are cancelled; open Checkout Sessions are expired so an abandoned
// checkout can't start a new subscription. Existing invoices (paid, open or
// past-due) are left exactly as they are -- nothing is voided, paid or refunded.
//
// Idempotent: already-cancelled / missing subscriptions count as done, and each
// cancel uses a deterministic idempotency key, so a retry after a timeout or a
// partial failure is safe. The final step re-lists the customer's subscriptions
// and throws unless none can bill again.

// Every status that can still produce a charge later.
const BILLABLE_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
]);
const DEFAULT_TIMEOUT_MS = 15000;

// Shared Stripe account (config/stripeApp.js): objects tagged with ANOTHER
// app's app_id are never touched; untagged legacy objects still count as ours.
const { classifyAppId } = require('../config/stripeApp');
const isOtherApp = (obj) => classifyAppId(obj) === 'mismatch';
// Owner uid stamped on our objects (`internal_user_id` per the standard, `uid` legacy).
const ownerUidOf = (obj) => obj?.metadata?.internal_user_id || obj?.metadata?.uid || null;

class StripeCancellationError extends Error {
  constructor(message, { uncertain = false, code = 'STRIPE_CANCELLATION_FAILED' } = {}) {
    super(message);
    this.code = code;
    // True when Stripe may have applied the change (timeout / network) -- a
    // retry resolves it, because every step re-reads Stripe's current state.
    this.uncertain = uncertain;
  }
}

let stripeClient = null;
const getStripe = () => {
  if (!stripeClient) {
    if (!process.env.STRIPE_SECRET_KEY)
      throw new StripeCancellationError('Stripe is not configured');
    stripeClient = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
};

const withTimeout = (promise, ms) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new StripeCancellationError('Stripe request timed out', { uncertain: true })),
        ms
      );
    }),
  ]).finally(() => clearTimeout(timer));
};

const isMissing = (err) => err?.code === 'resource_missing' || err?.statusCode === 404;
// Stripe network / 5xx / rate-limit errors: the request may or may not have applied.
const isUncertain = (err) =>
  err?.uncertain === true ||
  err?.type === 'StripeConnectionError' ||
  err?.type === 'StripeAPIError' ||
  err?.type === 'StripeRateLimitError' ||
  (typeof err?.statusCode === 'number' && err.statusCode >= 500);

async function listAll(call, ms) {
  const out = [];
  let startingAfter;
  for (let page = 0; page < 50; page++) {
    const res = await withTimeout(call(startingAfter), ms);
    out.push(...(res?.data || []));
    if (!res?.has_more || !res.data?.length) break;
    startingAfter = res.data[res.data.length - 1].id;
  }
  return out;
}

const listSubscriptions = (stripe, customer, ms) =>
  listAll(
    (starting_after) =>
      stripe.subscriptions.list({
        customer,
        status: 'all',
        limit: 100,
        ...(starting_after && { starting_after }),
      }),
    ms
  );

async function cancelOne(stripe, uid, sub, ms, result) {
  if (isOtherApp(sub)) {
    result.skippedNotOwned.push(sub.id);
    return;
  }
  if (!BILLABLE_STATUSES.has(sub.status)) {
    result.alreadyEnded.push(sub.id);
    return;
  }
  try {
    await withTimeout(
      stripe.subscriptions.cancel(
        sub.id,
        { invoice_now: false, prorate: false },
        { idempotencyKey: `account-delete-${uid}-${sub.id}` }
      ),
      ms
    );
    result.cancelled.push(sub.id);
  } catch (err) {
    if (isMissing(err)) {
      result.alreadyEnded.push(sub.id);
      return;
    }
    // "already canceled" and similar: confirm against Stripe's current state.
    const fresh = await withTimeout(stripe.subscriptions.retrieve(sub.id), ms).catch((e) =>
      isMissing(e) ? null : Promise.reject(e)
    );
    if (!fresh || !BILLABLE_STATUSES.has(fresh.status)) {
      result.alreadyEnded.push(sub.id);
      return;
    }
    throw err;
  }
}

/**
 * Cancels all recurring Stripe billing for `uid`. Resolves with a summary only
 * once Stripe confirms nothing owned by the account can bill again; otherwise
 * throws a StripeCancellationError (`uncertain` set when the outcome is unknown).
 */
async function cancelStripeBillingForDeletion(
  { uid, customerIds = [], subscriptionIds = [] },
  {
    stripe,
    timeoutMs = Number(process.env.STRIPE_ACCOUNT_DELETE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  } = {}
) {
  const customers = [...new Set(customerIds.filter((c) => typeof c === 'string' && c))];
  const storedSubs = [...new Set(subscriptionIds.filter((s) => typeof s === 'string' && s))];
  const result = {
    cancelled: [],
    alreadyEnded: [],
    cancelledSchedules: [],
    expiredSessions: [],
    skippedNotOwned: [],
  };
  if (!customers.length && !storedSubs.length) return result;

  try {
    const client = stripe || getStripe();
    const seen = new Set();

    for (const customer of customers) {
      let cust;
      try {
        cust = await withTimeout(client.customers.retrieve(customer), timeoutMs);
      } catch (err) {
        if (!isMissing(err)) throw err;
        cust = null;
      }
      if (cust && !cust.deleted && isOtherApp(cust)) {
        result.skippedNotOwned.push(customer);
        continue;
      }
      if (cust && !cust.deleted && ownerUidOf(cust) && ownerUidOf(cust) !== uid) {
        throw new StripeCancellationError('Stored Stripe customer belongs to a different account', {
          code: 'STRIPE_OWNERSHIP_MISMATCH',
        });
      }
      if (!cust || cust.deleted) continue; // a deleted customer has no live subscriptions

      // Abandoned/open checkouts first, so none can start a new subscription.
      const sessions = await listAll(
        (starting_after) =>
          client.checkout.sessions.list({
            customer,
            status: 'open',
            limit: 100,
            ...(starting_after && { starting_after }),
          }),
        timeoutMs
      );
      for (const s of sessions) {
        if (isOtherApp(s)) continue;
        try {
          await withTimeout(client.checkout.sessions.expire(s.id), timeoutMs);
          result.expiredSessions.push(s.id);
        } catch (err) {
          const fresh = await withTimeout(client.checkout.sessions.retrieve(s.id), timeoutMs);
          if (fresh?.status === 'open') throw err;
        }
      }

      // Schedules that have not started yet would create a subscription later.
      const schedules = await listAll(
        (starting_after) =>
          client.subscriptionSchedules.list({
            customer,
            limit: 100,
            ...(starting_after && { starting_after }),
          }),
        timeoutMs
      );
      for (const sch of schedules) {
        if (sch.status !== 'not_started' || isOtherApp(sch)) continue;
        try {
          await withTimeout(
            client.subscriptionSchedules.cancel(
              sch.id,
              {},
              { idempotencyKey: `account-delete-${uid}-${sch.id}` }
            ),
            timeoutMs
          );
          result.cancelledSchedules.push(sch.id);
        } catch (err) {
          const fresh = await withTimeout(client.subscriptionSchedules.retrieve(sch.id), timeoutMs);
          if (fresh?.status === 'not_started') throw err;
        }
      }

      for (const sub of await listSubscriptions(client, customer, timeoutMs)) {
        seen.add(sub.id);
        await cancelOne(client, uid, sub, timeoutMs, result);
      }
    }

    // A stored subscription id not covered by a trusted customer: cancel only if
    // Stripe confirms it is this account's.
    for (const id of storedSubs) {
      if (seen.has(id)) continue;
      let sub;
      try {
        sub = await withTimeout(client.subscriptions.retrieve(id), timeoutMs);
      } catch (err) {
        if (isMissing(err)) {
          result.alreadyEnded.push(id);
          continue;
        }
        throw err;
      }
      if (isOtherApp(sub) || (!customers.includes(sub.customer) && ownerUidOf(sub) !== uid)) {
        result.skippedNotOwned.push(id);
        continue;
      }
      seen.add(id);
      await cancelOne(client, uid, sub, timeoutMs, result);
    }

    // Confirmation: nothing owned by the account can bill again.
    for (const customer of customers) {
      if (result.skippedNotOwned.includes(customer)) continue;
      let subs;
      try {
        subs = await listSubscriptions(client, customer, timeoutMs);
      } catch (err) {
        if (isMissing(err)) continue;
        throw err;
      }
      if (subs.some((s) => BILLABLE_STATUSES.has(s.status) && !isOtherApp(s))) {
        throw new StripeCancellationError('A subscription is still active after cancellation', {
          uncertain: true,
        });
      }
    }
    return result;
  } catch (err) {
    if (err instanceof StripeCancellationError) throw err;
    throw new StripeCancellationError('Stripe cancellation failed', {
      uncertain: isUncertain(err),
    });
  }
}

// Used by the webhook backstop: a subscription that appears for an account
// already deleted (e.g. a checkout completed during deletion) is cancelled at
// once, with the same no-refund / no-proration settings.
async function cancelSubscriptionForDeletedAccount(uid, subscriptionId, { stripe } = {}) {
  const client = stripe || getStripe();
  try {
    await client.subscriptions.cancel(
      subscriptionId,
      { invoice_now: false, prorate: false },
      { idempotencyKey: `account-delete-${uid}-${subscriptionId}` }
    );
  } catch (err) {
    if (isMissing(err)) return;
    const fresh = await client.subscriptions.retrieve(subscriptionId);
    if (BILLABLE_STATUSES.has(fresh.status)) throw err;
  }
}

module.exports = {
  BILLABLE_STATUSES,
  StripeCancellationError,
  cancelStripeBillingForDeletion,
  cancelSubscriptionForDeletedAccount,
  _setStripeForTests: (s) => {
    stripeClient = s;
  },
};
