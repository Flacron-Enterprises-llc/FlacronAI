import { act, render, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';

import { ApiRequestError } from '@/types/api';
import type { BillingStatus, StoreCatalog, VerifyResult } from '@/services/api/billing';
import { BillingProvider, useBilling, type BillingContextValue } from './BillingProvider';
import type { StoreAdapter, StoreError, StorePurchase } from './storeAdapter';

// The native store boundary is a fake StoreAdapter and the backend is a fake billing API:
// these tests cover the provider's wiring (listeners, verification ordering, account
// isolation, UI states) — NOT real StoreKit / Play Billing behaviour or a real purchase.
const mockAuth = { firebaseUser: { uid: 'userA' } as { uid: string } | null };
jest.mock('@/features/auth/context/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/services/api/offline', () => ({ isOffline: () => Promise.resolve(false) }));

const TOKEN_A = '11111111-1111-4111-8111-111111111111';

const statusFixture = (o: Partial<BillingStatus> = {}): BillingStatus => ({
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
const catalogFixture = (o: Partial<StoreCatalog> = {}): StoreCatalog => ({
  success: true,
  platform: 'ios',
  available: true,
  reason: null,
  products: [
    { tierKey: 'professional', tier: 'professional', period: 'monthly', productId: 'test.pro', basePlanId: null, planName: 'Professional', reportsPerMonth: 50, exportFormats: ['pdf'] },
  ],
  ...o,
});
const purchaseFixture = (o: Partial<StorePurchase> = {}): StorePurchase => ({
  platform: 'ios',
  productId: 'test.pro',
  transactionId: '1000',
  purchaseToken: null,
  state: 'purchased',
  accountToken: TOKEN_A,
  native: {},
  ...o,
});

function makeAdapter(o: Partial<StoreAdapter> = {}) {
  const updated: ((p: StorePurchase) => void)[] = [];
  const errored: ((e: StoreError) => void)[] = [];
  const adapter: StoreAdapter = {
    platform: 'ios',
    isSupported: () => true,
    connect: jest.fn(() => Promise.resolve(true)),
    disconnect: jest.fn(() => Promise.resolve()),
    fetchSubscriptions: jest.fn(() =>
      Promise.resolve([{ productId: 'test.pro', title: 'Pro', displayPrice: '$39.99', period: { unit: 'month' as const, count: 1 }, basePlanId: null, offerToken: null, groupId: 'grp1' }])
    ),
    requestSubscription: jest.fn(() => Promise.resolve()),
    finish: jest.fn(() => Promise.resolve()),
    getAvailablePurchases: jest.fn(() => Promise.resolve([])),
    restore: jest.fn(() => Promise.resolve([])),
    onPurchaseUpdated: jest.fn((fn) => {
      updated.push(fn);
      return () => updated.splice(updated.indexOf(fn), 1);
    }),
    onPurchaseError: jest.fn((fn) => {
      errored.push(fn);
      return () => errored.splice(errored.indexOf(fn), 1);
    }),
    openManageSubscriptions: jest.fn(() => Promise.resolve()),
    ...o,
  };
  return { adapter, updated, errored };
}

function makeApi(o: { status?: BillingStatus; catalog?: StoreCatalog } = {}) {
  return {
    getStatus: jest.fn(() => Promise.resolve(o.status ?? statusFixture())),
    getCatalog: jest.fn(() => Promise.resolve(o.catalog ?? catalogFixture())),
    getAccountToken: jest.fn(() => Promise.resolve({ success: true as const, accountToken: TOKEN_A })),
    verify: jest.fn(
      (): Promise<VerifyResult> =>
        Promise.resolve({
          ...statusFixture({ tier: 'professional', canPurchaseInApp: false, purchaseBlockedReason: 'STORE_SUBSCRIPTION_ACTIVE' }),
          verified: true,
          entitled: true,
          subscription: null,
          finish: true,
        })
    ),
  };
}

const probe: { current: BillingContextValue | null } = { current: null };
function Probe() {
  const value = useBilling();
  useEffect(() => {
    probe.current = value;
  });
  return null;
}

function mount(adapter: StoreAdapter, api: ReturnType<typeof makeApi>) {
  return render(
    <BillingProvider adapter={adapter} api={api as never}>
      <Probe />
    </BillingProvider>
  );
}

beforeEach(() => {
  probe.current = null;
  mockAuth.firebaseUser = { uid: 'userA' };
});

it('loads server status + store prices; nothing granted locally', async () => {
  const { adapter } = makeAdapter();
  const api = makeApi();
  await mount(adapter, api);
  await waitFor(() => expect(probe.current?.availability).toBe('ready'));
  expect(probe.current?.state.offers[0]).toMatchObject({ purchasable: true, store: { displayPrice: '$39.99' } });
  expect(probe.current?.state.status?.tier).toBe('starter');
  expect(api.verify).not.toHaveBeenCalled();
});

it('purchase: store sheet with the account token, then server verification, then finish', async () => {
  const { adapter, updated } = makeAdapter();
  const api = makeApi();
  await mount(adapter, api);
  await waitFor(() => expect(probe.current?.availability).toBe('ready'));

  await act(async () => {
    await probe.current!.purchase(probe.current!.state.offers[0]);
  });
  expect(adapter.requestSubscription).toHaveBeenCalledWith(expect.objectContaining({ accountToken: TOKEN_A }));
  expect(probe.current?.state.status?.tier).toBe('starter'); // no client-side grant

  await act(async () => {
    updated[0](purchaseFixture());
  });
  await waitFor(() => expect(probe.current?.state.status?.tier).toBe('professional'));
  expect(api.verify).toHaveBeenCalledWith(expect.objectContaining({ transactionId: '1000', source: 'purchase' }));
  expect(adapter.finish).toHaveBeenCalledTimes(1);
  expect(probe.current?.state.notice?.tone).toBe('success');
});

it('cancellation and store errors show honest messages and grant nothing', async () => {
  const { adapter, errored } = makeAdapter();
  const api = makeApi();
  await mount(adapter, api);
  await waitFor(() => expect(probe.current?.availability).toBe('ready'));
  await act(async () => {
    errored[0]({ kind: 'cancelled', productId: 'test.pro' });
  });
  expect(probe.current?.state.notice?.text).toMatch(/cancelled/i);
  await act(async () => {
    errored[0]({ kind: 'pending', productId: 'test.pro' });
  });
  expect(probe.current?.state.notice?.text).toMatch(/approval/i);
  expect(api.verify).not.toHaveBeenCalled();
  expect(adapter.finish).not.toHaveBeenCalled();
});

it('web (Stripe) subscribers cannot start an in-app purchase', async () => {
  const { adapter } = makeAdapter();
  const api = makeApi({
    status: statusFixture({ tier: 'agency', stripe: { active: true, status: 'active', tier: 'agency' }, canPurchaseInApp: false, purchaseBlockedReason: 'WEB_SUBSCRIPTION_ACTIVE' }),
  });
  await mount(adapter, api);
  await waitFor(() => expect(probe.current?.availability).toBe('blocked_web'));
  await act(async () => {
    await probe.current!.purchase({ ...probe.current!.state.offers[0] });
  });
  expect(adapter.requestSubscription).not.toHaveBeenCalled();
});

it('unconfigured store / unsupported build: honest unavailable state, no store calls', async () => {
  const unconfigured = makeAdapter();
  await mount(unconfigured.adapter, makeApi({ catalog: catalogFixture({ available: false, reason: 'STORE_NOT_CONFIGURED', products: [] }) }));
  await waitFor(() => expect(probe.current?.availability).toBe('store_unconfigured'));
  expect(unconfigured.adapter.fetchSubscriptions).not.toHaveBeenCalled();

  const unsupported = makeAdapter({ isSupported: () => false });
  const api = makeApi();
  await mount(unsupported.adapter, api);
  await waitFor(() => expect(probe.current?.availability).toBe('unsupported'));
  expect(unsupported.adapter.connect).not.toHaveBeenCalled();
  expect(api.getCatalog).not.toHaveBeenCalled();
});

it('offline status load shows the offline state', async () => {
  const { adapter } = makeAdapter();
  const api = makeApi();
  const offline = new ApiRequestError('offline', { category: 'offline', retryable: true, isNetworkError: true });
  api.getStatus.mockRejectedValueOnce(offline);
  api.getCatalog.mockRejectedValueOnce(offline);
  await mount(adapter, api);
  await waitFor(() => expect(probe.current?.availability).toBe('offline'));
});

it('start-up reconciliation recovers an interrupted purchase silently', async () => {
  const { adapter } = makeAdapter({ getAvailablePurchases: jest.fn(() => Promise.resolve([purchaseFixture({ transactionId: '7000' })])) });
  const api = makeApi();
  await mount(adapter, api);
  await waitFor(() => expect(api.verify).toHaveBeenCalledWith(expect.objectContaining({ transactionId: '7000', source: 'restore' })));
  await waitFor(() => expect(probe.current?.state.status?.tier).toBe('professional'));
  expect(adapter.finish).toHaveBeenCalledTimes(1);
});

it('restore: a purchase owned by another account is explained, not transferred', async () => {
  const { adapter } = makeAdapter({ restore: jest.fn(() => Promise.resolve([purchaseFixture({ accountToken: null })])) });
  const api = makeApi();
  await mount(adapter, api);
  await waitFor(() => expect(probe.current?.availability).toBe('ready'));
  api.verify.mockRejectedValueOnce(new ApiRequestError('owned', { status: 409, code: 'PURCHASE_OWNED_BY_OTHER_ACCOUNT', category: 'conflict' }));
  await act(async () => {
    await probe.current!.restore();
  });
  expect(probe.current?.state.notice?.text).toMatch(/already linked to a different FlacronAI account/);
  expect(adapter.finish).not.toHaveBeenCalled();
  expect(probe.current?.state.status?.tier).toBe('starter');
});

it('restore with nothing to restore says so', async () => {
  const { adapter } = makeAdapter();
  await mount(adapter, makeApi());
  await waitFor(() => expect(probe.current?.availability).toBe('ready'));
  await act(async () => {
    await probe.current!.restore();
  });
  expect(probe.current?.state.notice?.text).toMatch(/No subscriptions were found/);
});

it('sign-out / account switch: listeners removed, store disconnected, late results ignored', async () => {
  const { adapter, updated } = makeAdapter();
  const api = makeApi();
  let releaseVerify!: () => void;
  api.verify.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        releaseVerify = () =>
          resolve({ ...statusFixture({ tier: 'professional' }), verified: true, entitled: true, subscription: null, finish: true });
      })
  );
  const view = await mount(adapter, api);
  await waitFor(() => expect(probe.current?.availability).toBe('ready'));
  const listener = updated[0];
  await act(async () => {
    listener(purchaseFixture());
  });
  await waitFor(() => expect(api.verify).toHaveBeenCalled());

  // Account switch to userB while A's verification is in flight.
  mockAuth.firebaseUser = { uid: 'userB' };
  await view.rerender(
    <BillingProvider adapter={adapter} api={api as never}>
      <Probe />
    </BillingProvider>
  );
  expect(adapter.disconnect).toHaveBeenCalled();
  await act(async () => {
    releaseVerify();
  });
  await waitFor(() => expect(probe.current?.state.loading).toBe(false));
  // B's session never shows A's result.
  expect(probe.current?.state.status?.tier).toBe('starter');
  expect(probe.current?.state.notice).toBeNull();
  // A's listener was removed; only B's is attached.
  expect(updated).toHaveLength(1);
  expect(updated[0]).not.toBe(listener);

  await view.unmount();
  expect(updated).toHaveLength(0);
});

describe('plan changes (active store subscriber)', () => {
  const twoPlanCatalog = catalogFixture({
    products: [
      { tierKey: 'professional', tier: 'professional', period: 'monthly', productId: 'test.pro', basePlanId: null, planName: 'Professional', reportsPerMonth: 50, exportFormats: ['pdf'] },
      { tierKey: 'agency', tier: 'agency', period: 'monthly', productId: 'test.agency', basePlanId: null, planName: 'Agency', reportsPerMonth: 200, exportFormats: ['pdf'] },
    ],
  });
  const product = (productId: string, groupId: string | null) => ({
    productId,
    title: productId,
    displayPrice: '$1',
    period: { unit: 'month' as const, count: 1 },
    basePlanId: null,
    offerToken: 'tok-offer',
    groupId,
  });
  const subscriber = (platform: 'ios' | 'android') =>
    statusFixture({
      tier: 'professional',
      canPurchaseInApp: false,
      purchaseBlockedReason: 'STORE_SUBSCRIPTION_ACTIVE',
      store: { platform, productId: 'test.pro', tier: 'professional', period: 'monthly', state: 'active', expiresAt: null, autoRenew: true, isTest: false, renewsToTier: null, renewsToPeriod: null, active: true },
    });

  it('iOS: switching within the subscription group is a plain StoreKit purchase (App Store applies it)', async () => {
    const { adapter } = makeAdapter({ fetchSubscriptions: jest.fn(() => Promise.resolve([product('test.pro', 'g1'), product('test.agency', 'g1')])) });
    await mount(adapter, makeApi({ status: subscriber('ios'), catalog: twoPlanCatalog }));
    await waitFor(() => expect(probe.current?.availability).toBe('change_plan'));
    expect(probe.current!.changeOffers.map((o) => o.productId)).toEqual(['test.agency']);
    await act(async () => {
      await probe.current!.changePlan(probe.current!.changeOffers[0]);
    });
    expect(adapter.requestSubscription).toHaveBeenCalledWith(expect.objectContaining({ replace: undefined }));
    // A normal "new purchase" is still refused for an existing subscriber.
    await act(async () => {
      await probe.current!.purchase(probe.current!.changeOffers[0]);
    });
    expect(adapter.requestSubscription).toHaveBeenCalledTimes(1);
  });

  it('iOS: a plan in a different subscription group is never offered (would be a second subscription)', async () => {
    const { adapter } = makeAdapter({ fetchSubscriptions: jest.fn(() => Promise.resolve([product('test.pro', 'g1'), product('test.agency', 'g2')])) });
    await mount(adapter, makeApi({ status: subscriber('ios'), catalog: twoPlanCatalog }));
    await waitFor(() => expect(probe.current?.availability).toBe('blocked_store'));
    expect(probe.current!.changeOffers).toEqual([]);
  });

  it('Android: replaces the current Play subscription using its purchase token and the upgrade mode', async () => {
    const owned = { platform: 'android' as const, productId: 'test.pro', transactionId: null, purchaseToken: 'old-token', state: 'purchased' as const, accountToken: TOKEN_A, native: {} };
    const { adapter } = makeAdapter({
      platform: 'android',
      fetchSubscriptions: jest.fn(() => Promise.resolve([product('test.pro', null), product('test.agency', null)])),
      getAvailablePurchases: jest.fn(() => Promise.resolve([owned])),
    });
    const api = makeApi({ status: subscriber('android'), catalog: twoPlanCatalog });
    // Start-up reconciliation re-verifies the owned purchase; the server reports the same subscriber.
    api.verify.mockResolvedValue({ ...subscriber('android'), verified: true, entitled: true, subscription: null, finish: true });
    await mount(adapter, api);
    await waitFor(() => expect(probe.current?.availability).toBe('change_plan'));
    await act(async () => {
      await probe.current!.changePlan(probe.current!.changeOffers[0]);
    });
    expect(adapter.requestSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ replace: { oldProductId: 'test.pro', oldPurchaseToken: 'old-token', mode: 'charge-prorated-price' } })
    );
  });

  it('Android: without the current purchase on the device, no replacement is attempted', async () => {
    const { adapter } = makeAdapter({
      platform: 'android',
      fetchSubscriptions: jest.fn(() => Promise.resolve([product('test.pro', null), product('test.agency', null)])),
    });
    await mount(adapter, makeApi({ status: subscriber('android'), catalog: twoPlanCatalog }));
    await waitFor(() => expect(probe.current?.availability).toBe('change_plan'));
    await act(async () => {
      await probe.current!.changePlan(probe.current!.changeOffers[0]);
    });
    expect(adapter.requestSubscription).not.toHaveBeenCalled();
    expect(probe.current?.state.notice?.text).toMatch(/Restore purchases/);
  });
});
