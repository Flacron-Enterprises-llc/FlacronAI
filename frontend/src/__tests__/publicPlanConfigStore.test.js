import { describe, it, expect, vi } from 'vitest';
import { createPublicPlanConfigStore, validatePublicPlanConfigResponse, FALLBACK_STATE } from '../utils/publicPlanConfigStore';

const VALID_RESPONSE = {
  success: true,
  configSource: 'firestore',
  plans: {
    starter: { label: 'Starter', basePhotoLimit: 25, unlimited: false },
    professional: { label: 'Professional', basePhotoLimit: 100, unlimited: false },
    agency: { label: 'Agency', basePhotoLimit: 250, unlimited: false },
    enterprise: { label: 'Enterprise', basePhotoLimit: null, unlimited: true },
  },
  addOns: { enabled: true, reportSpecific: true, checkoutAvailable: false, packs: [] },
};

describe('validatePublicPlanConfigResponse', () => {
  it('accepts a well-formed response', () => {
    expect(validatePublicPlanConfigResponse(VALID_RESPONSE)).toBe(true);
  });

  it('rejects a missing/malformed plans object -- never a false entitlement claim', () => {
    expect(validatePublicPlanConfigResponse({ success: true, addOns: VALID_RESPONSE.addOns })).toBe(false);
    expect(validatePublicPlanConfigResponse({ success: true, plans: 'nope', addOns: VALID_RESPONSE.addOns })).toBe(false);
  });

  it('rejects a plan missing the unlimited boolean', () => {
    const bad = { ...VALID_RESPONSE, plans: { ...VALID_RESPONSE.plans, starter: { label: 'Starter', basePhotoLimit: 25 } } };
    expect(validatePublicPlanConfigResponse(bad)).toBe(false);
  });

  it('rejects a non-unlimited plan with a negative/non-integer basePhotoLimit', () => {
    const bad1 = { ...VALID_RESPONSE, plans: { ...VALID_RESPONSE.plans, starter: { label: 'Starter', basePhotoLimit: -1, unlimited: false } } };
    expect(validatePublicPlanConfigResponse(bad1)).toBe(false);
    const bad2 = { ...VALID_RESPONSE, plans: { ...VALID_RESPONSE.plans, starter: { label: 'Starter', basePhotoLimit: 25.5, unlimited: false } } };
    expect(validatePublicPlanConfigResponse(bad2)).toBe(false);
  });

  it('rejects a response missing the addOns.packs array', () => {
    expect(validatePublicPlanConfigResponse({ ...VALID_RESPONSE, addOns: { enabled: true } })).toBe(false);
  });

  it('rejects success:false, null, and non-object input', () => {
    expect(validatePublicPlanConfigResponse({ success: false })).toBe(false);
    expect(validatePublicPlanConfigResponse(null)).toBe(false);
    expect(validatePublicPlanConfigResponse('nope')).toBe(false);
  });
});

describe('createPublicPlanConfigStore', () => {
  it('starts in a safe fallback+loading state before any fetch resolves', () => {
    const store = createPublicPlanConfigStore({ fetchFn: () => new Promise(() => {}) });
    const snap = store.getSnapshot();
    expect(snap.loading).toBe(true);
    expect(snap.plans.starter.basePhotoLimit).toBe(25);
    expect(snap.configSource).toBe('client_fallback');
  });

  it('a valid server response propagates to the snapshot every subscriber reads', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: VALID_RESPONSE });
    const store = createPublicPlanConfigStore({ fetchFn });
    await store.ensureLoaded();
    const snap = store.getSnapshot();
    expect(snap.loading).toBe(false);
    expect(snap.configSource).toBe('firestore');
    expect(snap.plans.agency.basePhotoLimit).toBe(250);
    expect(snap.plans.enterprise.unlimited).toBe(true);
  });

  it('network/config failure falls back to the built-in mapping, never a fabricated or stale value', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    const store = createPublicPlanConfigStore({ fetchFn });
    await store.ensureLoaded();
    const snap = store.getSnapshot();
    expect(snap.loading).toBe(false);
    expect(snap.error).toBeInstanceOf(Error);
    expect(snap.plans).toEqual(FALLBACK_STATE.plans);
    expect(snap.configSource).toBe('client_fallback');
  });

  it('a malformed (invalid-shape) response is treated as a failure, never rendered as a true entitlement', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: { success: true, plans: {} } });
    const store = createPublicPlanConfigStore({ fetchFn });
    await store.ensureLoaded();
    const snap = store.getSnapshot();
    expect(snap.configSource).toBe('client_fallback');
    expect(snap.error).toBeInstanceOf(Error);
  });

  it('concurrent ensureLoaded() calls from multiple "mounted consumers" share ONE in-flight fetch -- no duplicate fetch storm', async () => {
    let resolveFetch;
    const fetchFn = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));
    const store = createPublicPlanConfigStore({ fetchFn });
    const p1 = store.ensureLoaded();
    const p2 = store.ensureLoaded();
    const p3 = store.ensureLoaded();
    resolveFetch({ data: VALID_RESPONSE });
    await Promise.all([p1, p2, p3]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('a fresh cache (within ttlMs) is reused without re-fetching -- no surface keeps re-hitting the network', async () => {
    let now = 1000;
    const fetchFn = vi.fn().mockResolvedValue({ data: VALID_RESPONSE });
    const store = createPublicPlanConfigStore({ fetchFn, ttlMs: 60_000, now: () => now });
    await store.ensureLoaded();
    now += 30_000;
    await store.ensureLoaded();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('an expired cache (past ttlMs) genuinely re-fetches -- a real server config change eventually propagates', async () => {
    let now = 1000;
    const fetchFn = vi.fn().mockResolvedValue({ data: VALID_RESPONSE });
    const store = createPublicPlanConfigStore({ fetchFn, ttlMs: 60_000, now: () => now });
    await store.ensureLoaded();
    now += 61_000;
    await store.ensureLoaded();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('reload() always forces a genuine re-fetch, bypassing the TTL cache -- no surface is stuck on a stale value after an admin publish', async () => {
    let now = 1000;
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ data: VALID_RESPONSE })
      .mockResolvedValueOnce({ data: { ...VALID_RESPONSE, plans: { ...VALID_RESPONSE.plans, starter: { label: 'Starter', basePhotoLimit: 30, unlimited: false } } } });
    const store = createPublicPlanConfigStore({ fetchFn, ttlMs: 60_000, now: () => now });
    await store.ensureLoaded();
    expect(store.getSnapshot().plans.starter.basePhotoLimit).toBe(25);
    await store.reload();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().plans.starter.basePhotoLimit).toBe(30);
  });

  it('subscribers are notified on every snapshot change', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: VALID_RESPONSE });
    const store = createPublicPlanConfigStore({ fetchFn });
    const listener = vi.fn();
    store.subscribe(listener);
    await store.ensureLoaded();
    expect(listener).toHaveBeenCalled();
  });

  it('a failed fetch is never cached -- the very next call retries instead of being stuck', async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ data: VALID_RESPONSE });
    const store = createPublicPlanConfigStore({ fetchFn, ttlMs: 60_000 });
    await store.ensureLoaded();
    expect(store.getSnapshot().configSource).toBe('client_fallback');
    await store.ensureLoaded();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().configSource).toBe('firestore');
  });
});
