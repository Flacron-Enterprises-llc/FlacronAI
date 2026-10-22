import { describe, it, expect, beforeEach } from 'vitest';
import {
  GROWTH_ENGINE,
  installGrowthEngineQueue,
  trackGrowthEvent,
  trackFeatureUsed,
  identifyGrowthUser,
  signOutGrowthUser,
  reportUsageThreshold,
  captureOfferHandoff,
  getOfferHandoff,
} from '../lib/growthEngine.js';
import { COOKIE_CONSENT_KEY, COOKIE_POLICY_VERSION } from '../utils/cookieConsent.js';

function memoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

const grantAnalytics = (granted) =>
  globalThis.localStorage.setItem(
    COOKIE_CONSENT_KEY,
    JSON.stringify({ categories: { essential: true, analytics: granted, preferences: false }, version: COOKIE_POLICY_VERSION }),
  );

const queued = () => globalThis.window.FCGE.q.map(([method, args]) => [method, ...Array.from(args)]);

beforeEach(() => {
  globalThis.localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  globalThis.window = { sessionStorage, location: { search: '' } };
  signOutGrowthUser();
  delete globalThis.window.FCGE;
  installGrowthEngineQueue();
});

describe('Growth Engine queue', () => {
  it('installs the install-snippet queue with this app’s config and sends nothing', () => {
    expect(globalThis.window.FCGE).toMatchObject({ appId: GROWTH_ENGINE.appId, key: GROWTH_ENGINE.key, endpoint: GROWTH_ENGINE.endpoint, q: [] });
    expect(GROWTH_ENGINE.key).toMatch(/^pk_live_/);
  });

  it('drops events without analytics consent and queues them with it', () => {
    trackGrowthEvent('pricing_page_visited');
    grantAnalytics(false);
    trackGrowthEvent('pricing_page_visited');
    expect(queued()).toEqual([]);
    grantAnalytics(true);
    trackFeatureUsed('report_generated');
    expect(queued()).toEqual([['track', 'feature_used', { feature: 'report_generated' }]]);
  });

  it('dedupes identical identify calls and identifies again after sign-out', () => {
    grantAnalytics(true);
    const who = { id: 'u1', email: 'a@b.co', name: 'Dana Lee', plan: 'professional' };
    identifyGrowthUser(who);
    identifyGrowthUser(who);
    expect(queued().filter(([m]) => m === 'identify')).toHaveLength(1);
    signOutGrowthUser();
    identifyGrowthUser(who);
    expect(queued().map(([m]) => m)).toEqual(['identify', 'reset', 'identify']);
    expect(queued()[0][1]).toEqual({ email: 'a@b.co', externalUserId: 'u1', name: 'Dana Lee', plan: 'professional' });
  });

  it('reports the 90% and 100% report allowance once each', () => {
    grantAnalytics(true);
    reportUsageThreshold('reports', 4, 5);
    reportUsageThreshold('reports', 5, 5);
    reportUsageThreshold('reports', 5, 5);
    reportUsageThreshold('reports', 10, -1);
    expect(queued().map(([, event]) => event)).toEqual(['usage_limit_90', 'usage_limit_100']);
  });
});

describe('offer hand-off', () => {
  it('keeps a valid code and fcge_ref for the session', () => {
    captureOfferHandoff('?code=pilot50&fcge_ref=wbn_abc.123-XYZ&utm_source=webinar');
    expect(getOfferHandoff()).toEqual({ promoCode: 'PILOT50', fcgeRef: 'wbn_abc.123-XYZ' });
    // A later page without the params doesn't erase it.
    captureOfferHandoff('?plan=professional');
    expect(getOfferHandoff()).toEqual({ promoCode: 'PILOT50', fcgeRef: 'wbn_abc.123-XYZ' });
  });

  it('ignores malformed values', () => {
    captureOfferHandoff('?code=<script>&fcge_ref=short');
    expect(getOfferHandoff()).toEqual({});
  });
});
