import { describe, it, expect } from 'vitest';
import {
  deriveAddOnAvailability,
  derivePurchasablePacks,
  formatCents,
  deriveSanitizedPurchaseDisplay,
  deriveCapacityBreakdown,
  deriveCheckoutButtonLabel,
  shouldSyncAfterRedirect,
} from '../utils/photoAddOnDisplay';

// Phase 45 (Stripe Report-Specific Photo Add-Ons).

describe('deriveAddOnAvailability', () => {
  const report = { status: 'draft' };
  const photoCapacity = { unlimited: false };
  const catalogue = { enabled: true, packs: [] };

  it('is loading until every input has arrived', () => {
    expect(deriveAddOnAvailability({}).state).toBe('loading');
    expect(deriveAddOnAvailability({ report, photoCapacity }).state).toBe('loading');
  });

  it('is ineligible for a finalized report', () => {
    const r = deriveAddOnAvailability({ report: { status: 'finalized' }, photoCapacity, catalogue });
    expect(r.state).toBe('ineligible');
  });

  it('is ineligible for an archived report', () => {
    const r = deriveAddOnAvailability({ report: { status: 'archived' }, photoCapacity, catalogue });
    expect(r.state).toBe('ineligible');
  });

  it('is unlimited when the plan already grants unlimited capacity', () => {
    const r = deriveAddOnAvailability({ report, photoCapacity: { unlimited: true }, catalogue });
    expect(r.state).toBe('unlimited');
  });

  it('is not_configured when the catalogue is disabled', () => {
    const r = deriveAddOnAvailability({ report, photoCapacity, catalogue: { enabled: false, packs: [] } });
    expect(r.state).toBe('not_configured');
  });

  it('is available otherwise', () => {
    const r = deriveAddOnAvailability({ report, photoCapacity, catalogue });
    expect(r.state).toBe('available');
  });

  it('unlimited takes precedence over a disabled catalogue (never bothers the user with config errors they cannot act on)', () => {
    const r = deriveAddOnAvailability({ report, photoCapacity: { unlimited: true }, catalogue: { enabled: false, packs: [] } });
    expect(r.state).toBe('unlimited');
  });
});

describe('derivePurchasablePacks', () => {
  it('marks an unavailable pack as disabled but still lists it', () => {
    const catalogue = { enabled: true, packs: [{ id: 'photos_25', label: '+25 Photos', capacity: 25, amountCents: 499, currency: 'usd', active: true, available: false }] };
    const packs = derivePurchasablePacks(catalogue);
    expect(packs).toHaveLength(1);
    expect(packs[0].disabled).toBe(true);
    expect(packs[0].displayPrice).toBe('$4.99');
  });

  it('returns an empty list for a missing/malformed catalogue', () => {
    expect(derivePurchasablePacks(null)).toEqual([]);
    expect(derivePurchasablePacks({})).toEqual([]);
  });
});

describe('formatCents', () => {
  it('formats the four confirmed pack prices', () => {
    expect(formatCents(499)).toBe('$4.99');
    expect(formatCents(799)).toBe('$7.99');
    expect(formatCents(1299)).toBe('$12.99');
    expect(formatCents(2499)).toBe('$24.99');
  });

  it('never throws on bad input', () => {
    expect(formatCents(undefined)).toBe('');
    expect(formatCents(NaN)).toBe('');
  });
});

describe('deriveSanitizedPurchaseDisplay', () => {
  it('maps every server status to the documented display bucket', () => {
    const base = { id: 'p1', packId: 'photos_25', capacity: 25, amountCents: 499, currency: 'usd' };
    expect(deriveSanitizedPurchaseDisplay({ ...base, status: 'pending' }).bucket).toBe('pending_payment');
    expect(deriveSanitizedPurchaseDisplay({ ...base, status: 'session_created' }).bucket).toBe('pending_payment');
    expect(deriveSanitizedPurchaseDisplay({ ...base, status: 'fulfilled' }).bucket).toBe('fulfilled');
    expect(deriveSanitizedPurchaseDisplay({ ...base, status: 'expired' }).bucket).toBe('expired');
    expect(deriveSanitizedPurchaseDisplay({ ...base, status: 'failed' }).bucket).toBe('failed');
    expect(deriveSanitizedPurchaseDisplay({ ...base, status: 'refunded' }).bucket).toBe('refunded');
    expect(deriveSanitizedPurchaseDisplay({ ...base, status: 'disputed' }).bucket).toBe('disputed');
    expect(deriveSanitizedPurchaseDisplay({ ...base, status: 'dispute_lost' }).bucket).toBe('refunded');
  });

  it('never claims fulfillment before the server says so -- a pending purchase is never displayed as fulfilled', () => {
    const p = deriveSanitizedPurchaseDisplay({ id: 'p1', packId: 'photos_25', capacity: 25, amountCents: 499, currency: 'usd', status: 'session_created' });
    expect(p.bucket).not.toBe('fulfilled');
  });

  it('surfaces the manual-review flag for a partial refund separately from the bucket', () => {
    const p = deriveSanitizedPurchaseDisplay({ id: 'p1', packId: 'photos_25', capacity: 25, amountCents: 499, currency: 'usd', status: 'fulfilled', needsManualReview: true });
    expect(p.bucket).toBe('fulfilled');
    expect(p.needsManualReview).toBe(true);
  });

  it('returns null for a missing purchase', () => {
    expect(deriveSanitizedPurchaseDisplay(null)).toBeNull();
  });
});

describe('deriveCapacityBreakdown', () => {
  it('nulls out numeric fields for an unlimited plan (never a magic number)', () => {
    const b = deriveCapacityBreakdown({ unlimited: true, basePhotoLimit: null, addOnCapacity: 0, effectiveCapacity: null, used: 5, remaining: null });
    expect(b.basePhotoLimit).toBeNull();
    expect(b.effectiveCapacity).toBeNull();
    expect(b.remaining).toBeNull();
  });

  it('reflects base + add-on for a capped plan', () => {
    const b = deriveCapacityBreakdown({ unlimited: false, basePhotoLimit: 25, addOnCapacity: 50, effectiveCapacity: 75, used: 10, remaining: 65 });
    expect(b.effectiveCapacity).toBe(75);
    expect(b.addOnCapacity).toBe(50);
    expect(b.remaining).toBe(65);
  });

  it('returns null when capacity has not loaded yet', () => {
    expect(deriveCapacityBreakdown(null)).toBeNull();
  });
});

describe('deriveCheckoutButtonLabel', () => {
  it('labels every phase distinctly', () => {
    expect(deriveCheckoutButtonLabel('idle', '+25 Photos')).toBe('Buy +25 Photos');
    expect(deriveCheckoutButtonLabel('creating')).toBe('Starting checkout…');
    expect(deriveCheckoutButtonLabel('redirecting')).toBe('Redirecting to Stripe…');
    expect(deriveCheckoutButtonLabel('error')).toBe('Try again');
    expect(deriveCheckoutButtonLabel('network_retry')).toBe('Retry');
  });
});

describe('shouldSyncAfterRedirect', () => {
  it('only syncs when both a success status and an intentId are present', () => {
    expect(shouldSyncAfterRedirect(new URLSearchParams('photoPackCheckout=success&intentId=abc'))).toEqual({ shouldSync: true, intentId: 'abc' });
    expect(shouldSyncAfterRedirect(new URLSearchParams('photoPackCheckout=success'))).toEqual({ shouldSync: false, intentId: null });
    expect(shouldSyncAfterRedirect(new URLSearchParams('photoPackCheckout=cancelled&intentId=abc'))).toEqual({ shouldSync: false, intentId: null });
    expect(shouldSyncAfterRedirect(new URLSearchParams(''))).toEqual({ shouldSync: false, intentId: null });
  });

  it('never treats the query string alone as proof of payment -- callers must still call the server sync endpoint', () => {
    // This function only ever returns a boolean + an id to look up -- it has
    // no `fulfilled`/`paid` field for a caller to (mis)use as if it were one.
    const result = shouldSyncAfterRedirect(new URLSearchParams('photoPackCheckout=success&intentId=abc'));
    expect(Object.keys(result).sort()).toEqual(['intentId', 'shouldSync']);
  });
});
