// Phase 45 (Stripe Report-Specific Photo Add-Ons).
//
// Pure derivation of the report-specific "Add Photo Pack" panel's UI state
// from the server's sanitized responses -- kept dependency-free and outside
// ReportPreviewPage.jsx so it's unit-testable without rendering the (very
// large) page component, matching this codebase's existing convention for
// pure logic extracted from big page components (canonicalEstimateEditor.js,
// photoCapacityDisplay.js).
//
// Nothing here ever claims a purchase is active/fulfilled on its own say-so
// -- every status shown is read verbatim from the server's sanitized
// `purchases[]`/photo-capacity response; the panel never trusts a
// query-string success value or its own local "I just redirected back"
// state as proof of payment.

// Whether the whole "buy more photos" surface should even be offered for
// this report right now, and why not when it shouldn't.
export const deriveAddOnAvailability = ({ report, photoCapacity, catalogue } = {}) => {
  if (!report || !photoCapacity || !catalogue) return { state: 'loading' };
  if (report.status === 'finalized') return { state: 'ineligible', reason: 'This report is finalized and no longer accepts photo capacity purchases.' };
  if (report.status === 'archived') return { state: 'ineligible', reason: 'This report is archived.' };
  if (photoCapacity.unlimited) return { state: 'unlimited' };
  if (!catalogue.enabled) return { state: 'not_configured', reason: 'Photo capacity add-ons are not currently available.' };
  return { state: 'available' };
};

// Sanitized packs the user may actually buy right now (active + priced for
// the current Stripe mode) -- a pack the catalogue lists but marks
// `available: false` (e.g. its Price ID isn't configured yet) is shown as
// disabled rather than hidden, so pricing is never a surprise once it does
// go live.
export const derivePurchasablePacks = (catalogue) => {
  if (!catalogue || !Array.isArray(catalogue.packs)) return [];
  return catalogue.packs.map((pack) => ({
    ...pack,
    displayPrice: formatCents(pack.amountCents, pack.currency),
    disabled: !pack.available,
  }));
};

export const formatCents = (amountCents, currency = 'usd') => {
  if (!Number.isFinite(amountCents)) return '';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amountCents / 100);
  } catch {
    return `$${(amountCents / 100).toFixed(2)}`;
  }
};

// Maps one sanitized purchase record's server `status` to a stable display
// bucket -- the vocabulary the panel actually renders. `needsManualReview`
// (set on a partial refund) is surfaced as its own flag rather than folded
// into `bucket`, since the underlying entitlement may still be active while
// under review.
export const PURCHASE_STATUS_BUCKETS = Object.freeze({
  pending: 'pending_payment',
  session_created: 'pending_payment',
  fulfilled: 'fulfilled',
  expired: 'expired',
  failed: 'failed',
  refunded: 'refunded',
  disputed: 'disputed',
  dispute_lost: 'refunded',
});

export const deriveSanitizedPurchaseDisplay = (purchase) => {
  if (!purchase) return null;
  return {
    id: purchase.id,
    packId: purchase.packId,
    capacity: purchase.capacity,
    displayPrice: formatCents(purchase.amountCents, purchase.currency),
    bucket: PURCHASE_STATUS_BUCKETS[purchase.status] || 'pending_payment',
    needsManualReview: !!purchase.needsManualReview,
    createdAt: purchase.createdAt,
    fulfilledAt: purchase.fulfilledAt,
  };
};

// Capacity breakdown the panel's header shows -- always derived from the
// server's own photo-capacity response, never recomputed client-side.
export const deriveCapacityBreakdown = (photoCapacity) => {
  if (!photoCapacity) return null;
  const { unlimited, basePhotoLimit, addOnCapacity, effectiveCapacity, used, remaining } = photoCapacity;
  return {
    unlimited,
    basePhotoLimit: unlimited ? null : basePhotoLimit,
    addOnCapacity: addOnCapacity || 0,
    effectiveCapacity: unlimited ? null : effectiveCapacity,
    used,
    remaining: unlimited ? null : remaining,
  };
};

// Local, ephemeral checkout-button state machine (not server data) -- the
// panel's own click -> creating -> redirecting -> (browser navigates away)
// sequence, plus the network-retry state for a failed session-creation call.
// 'idle' | 'creating' | 'redirecting' | 'error' | 'network_retry'
export const CHECKOUT_PHASES = Object.freeze(['idle', 'creating', 'redirecting', 'error', 'network_retry']);

export const deriveCheckoutButtonLabel = (phase, packLabel) => {
  switch (phase) {
    case 'creating':
      return 'Starting checkout…';
    case 'redirecting':
      return 'Redirecting to Stripe…';
    case 'error':
      return 'Try again';
    case 'network_retry':
      return 'Retry';
    default:
      return `Buy ${packLabel || 'pack'}`;
  }
};

// After a redirect back from Stripe, the query string (`photoPackCheckout=
// success|cancelled`, `session_id`) is NEVER trusted as proof of payment --
// it only decides whether to kick off the sync-then-poll sequence at all.
// The actual displayed status always comes from the server (sync response /
// subsequent capacity refresh).
export const shouldSyncAfterRedirect = (searchParams) => {
  const status = searchParams instanceof URLSearchParams ? searchParams.get('photoPackCheckout') : null;
  const intentId = searchParams instanceof URLSearchParams ? searchParams.get('intentId') : null;
  return status === 'success' && !!intentId ? { shouldSync: true, intentId } : { shouldSync: false, intentId: null };
};
