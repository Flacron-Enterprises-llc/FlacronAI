import { PHOTO_LIMITS } from '../data/photoLimits';

// Phase 48 correction. Single shared client-side cache for GET
// /payment/public-plan-config, extracted as a pure/testable module (no
// React) so it can be unit-tested without rendering a component -- this
// repo's established convention for UI-adjacent pure logic. Every page that
// needs plan/pack data (Pricing.jsx, FAQs.jsx, ...) reads through this ONE
// store via the `usePublicPlanConfig` hook, so N simultaneously-mounted
// consumers share ONE in-flight fetch and ONE short-TTL cache instead of
// each firing its own request -- this is what prevents the "duplicate
// public-config fetch storm" the correction flagged.
//
// `PHOTO_LIMITS` (data/photoLimits.js) is used ONLY here, as the
// loading/network-failure fallback -- never rendered directly by a page as
// an authoritative value. It exists purely to mirror the backend's own
// built-in safe-fallback mapping (planConfig.js's FALLBACK_CONFIG) so a
// failed fetch degrades to the same accepted 25/100/250/unlimited numbers
// the server itself falls back to, never a fabricated or stale number.
export const FALLBACK_PLANS = Object.freeze({
  starter: { label: 'Starter', basePhotoLimit: PHOTO_LIMITS.starter, unlimited: false },
  professional: { label: 'Professional', basePhotoLimit: PHOTO_LIMITS.professional, unlimited: false },
  agency: { label: 'Agency', basePhotoLimit: PHOTO_LIMITS.agency, unlimited: false },
  enterprise: { label: 'Enterprise', basePhotoLimit: null, unlimited: true },
});

export const FALLBACK_STATE = Object.freeze({
  plans: FALLBACK_PLANS,
  addOns: Object.freeze({ enabled: false, reportSpecific: true, checkoutAvailable: false, packs: [] }),
  configSource: 'client_fallback',
});

const PLAN_IDS = ['starter', 'professional', 'agency', 'enterprise'];

// Rejects a response that doesn't have the shape every consumer needs --
// prevents a malformed/truncated response from ever being rendered as if it
// were a real, trustworthy entitlement (e.g. a plan silently missing ->
// treated as "unlimited"/absent rather than falling back safely).
export const validatePublicPlanConfigResponse = (data) => {
  if (!data || typeof data !== 'object' || data.success !== true) return false;
  if (!data.plans || typeof data.plans !== 'object') return false;
  for (const id of PLAN_IDS) {
    const plan = data.plans[id];
    if (!plan || typeof plan !== 'object') return false;
    if (typeof plan.unlimited !== 'boolean') return false;
    if (!plan.unlimited && !(Number.isInteger(plan.basePhotoLimit) && plan.basePhotoLimit >= 0)) return false;
  }
  if (!data.addOns || typeof data.addOns !== 'object' || !Array.isArray(data.addOns.packs)) return false;
  return true;
};

// Factory (not a singleton export) so tests can create an isolated store
// per test instead of sharing hidden module-level state across cases.
export const createPublicPlanConfigStore = ({ fetchFn, ttlMs = 60_000, now = () => Date.now() } = {}) => {
  let snapshot = { ...FALLBACK_STATE, loading: true, error: null };
  let fetchedAt = 0;
  let inFlight = null;
  const listeners = new Set();

  const setSnapshot = (next) => {
    snapshot = next;
    listeners.forEach((l) => l());
  };

  const isFresh = () => fetchedAt > 0 && now() - fetchedAt < ttlMs;

  // Idempotent: safe to call from every mounted consumer -- a fresh cache
  // hit or an already-in-flight fetch is reused rather than firing a new
  // request (the actual fetch-storm fix).
  const ensureLoaded = ({ force = false } = {}) => {
    if (!force && (isFresh() || inFlight)) return inFlight || Promise.resolve(snapshot);
    setSnapshot({ ...snapshot, loading: true, error: null });
    inFlight = (async () => {
      try {
        const res = await fetchFn();
        if (!validatePublicPlanConfigResponse(res?.data)) {
          throw new Error('Malformed public plan config response');
        }
        fetchedAt = now();
        setSnapshot({ plans: res.data.plans, addOns: res.data.addOns, configSource: res.data.configSource, loading: false, error: null });
      } catch (err) {
        // A failed/malformed fetch is never cached -- the next mount/reload
        // gets a genuine retry instead of being stuck on a bad response.
        fetchedAt = 0;
        setSnapshot({ ...FALLBACK_STATE, loading: false, error: err });
      } finally {
        inFlight = null;
      }
      return snapshot;
    })();
    return inFlight;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    ensureLoaded,
    reload: () => ensureLoaded({ force: true }),
  };
};
