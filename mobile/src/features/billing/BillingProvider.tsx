/**
 * Phase 7 — subscriptions & in-app purchase. Mounted inside the authenticated `(app)` layout,
 * so it exists only while a user is signed in: Sign Out / account switch unmounts it, which
 * removes the store listeners, ends the store connection and invalidates the session — a
 * late store event or verification result can never land in another account's UI.
 *
 * Owns: the server billing status (`/billing/status` — the single entitlement authority),
 * the server plan catalog merged with the store's localized products, store purchase /
 * error listeners (attached once per session), reconciliation of unfinished/interrupted
 * transactions on start, and the purchase / restore / manage actions.
 *
 * Billing never blocks the rest of the app: every failure becomes an honest state on the
 * subscription screen.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Linking } from 'react-native';

import { useAuth } from '@/features/auth/context/AuthProvider';
import { billingApi, type BillingStatus, type StoreCatalog } from '@/services/api/billing';
import { isOffline } from '@/services/api/offline';
import { ApiRequestError } from '@/types/api';
import {
  buildPlanOffers,
  changeOptions,
  replacementModeFor,
  resolveAvailability,
  type BillingAvailability,
  type PlanOffer,
} from './planCatalog';
import { createPurchaseProcessor, createSessionStore, outcomeMessage, type ProcessOutcome } from './purchaseProcessor';
import { expoIapAdapter, toStoreError, type PlanReplacement, type StoreAdapter, type StoreError } from './storeAdapter';

export interface BillingNotice {
  tone: 'success' | 'info' | 'error';
  text: string;
}

interface BillingState {
  /** The account this state was loaded for — state for any other uid is never shown. */
  uid: string | null;
  loading: boolean;
  error: boolean;
  offline: boolean;
  connected: boolean;
  status: BillingStatus | null;
  catalog: StoreCatalog | null;
  offers: PlanOffer[];
  purchasingProductId: string | null;
  verifying: boolean;
  restoring: boolean;
  notice: BillingNotice | null;
}

const INITIAL: BillingState = {
  uid: null,
  loading: true,
  error: false,
  offline: false,
  connected: false,
  status: null,
  catalog: null,
  offers: [],
  purchasingProductId: null,
  verifying: false,
  restoring: false,
  notice: null,
};

export interface BillingContextValue {
  state: BillingState;
  availability: BillingAvailability;
  supported: boolean;
  platform: StoreAdapter['platform'];
  storeName: string;
  purchase: (offer: PlanOffer) => Promise<void>;
  /** Switch an active same-store subscription to `offer` (see planCatalog.changeOptions). */
  changePlan: (offer: PlanOffer) => Promise<void>;
  /** Plans the current store subscriber can switch to from this device. */
  changeOffers: PlanOffer[];
  restore: () => Promise<void>;
  manage: () => Promise<void>;
  reload: () => void;
  dismissNotice: () => void;
}

const BillingContext = createContext<BillingContextValue | null>(null);

export function useBilling(): BillingContextValue {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error('useBilling must be used inside BillingProvider');
  return ctx;
}

const isOfflineError = (err: unknown) =>
  err instanceof ApiRequestError && (err.category === 'offline' || err.category === 'timeout');

export function storeErrorNotice(error: StoreError, storeName: string): BillingNotice | null {
  switch (error.kind) {
    case 'cancelled':
      return { tone: 'info', text: "Purchase cancelled. You haven't been charged." };
    case 'pending':
      return { tone: 'info', text: `Your purchase is waiting for approval in ${storeName}. Access starts once it's approved.` };
    case 'already_owned':
      return { tone: 'info', text: 'You already have this subscription. Tap Restore purchases to link it to this account.' };
    case 'network':
      return { tone: 'error', text: `Couldn't reach ${storeName}. Check your connection and try again.` };
    case 'unavailable':
    case 'product_unavailable':
      return { tone: 'error', text: `This plan isn't available from ${storeName} right now.` };
    default:
      return { tone: 'error', text: "The purchase couldn't be completed. If you were charged, tap Restore purchases." };
  }
}

const MANAGE_FALLBACK_URL = {
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
} as const;

const pickStatus = (s: BillingStatus): BillingStatus => ({
  success: true,
  tier: s.tier,
  stripe: s.stripe,
  store: s.store,
  team: s.team ?? { active: false },
  admin: s.admin ?? { active: false, tier: null },
  canPurchaseInApp: s.canPurchaseInApp,
  purchaseBlockedReason: s.purchaseBlockedReason,
});

export function BillingProvider({
  children,
  adapter = expoIapAdapter,
  api = billingApi,
}: PropsWithChildren<{ adapter?: StoreAdapter; api?: typeof billingApi }>) {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? null;
  const [state, setState] = useState<BillingState>(INITIAL);
  const patch = useCallback((next: Partial<BillingState>) => setState((prev) => ({ ...prev, ...next })), []);
  // Until this account's own load completes, show a fresh loading state (never another account's).
  const visible = state.uid === uid ? state : INITIAL;

  const [sessions] = useState(createSessionStore);
  const generationRef = useRef(0);
  const [supported] = useState(() => {
    try {
      return adapter.isSupported();
    } catch {
      return false;
    }
  });
  const storeName = adapter.platform === 'ios' ? 'the App Store' : 'Google Play';

  const [processor] = useState(() =>
    createPurchaseProcessor({
      verify: (req) => api.verify(req),
      finish: (p) => adapter.finish(p),
      getSession: sessions.get,
    })
  );

  const isCurrent = useCallback((gen: number) => sessions.get()?.generation === gen, [sessions]);

  const refreshStatus = useCallback(
    async (gen: number) => {
      try {
        const status = await api.getStatus();
        if (isCurrent(gen)) patch({ status: pickStatus(status), offline: false });
      } catch (err) {
        if (isCurrent(gen) && isOfflineError(err)) patch({ offline: true });
      }
    },
    [api, isCurrent, patch]
  );

  const applyOutcome = useCallback(
    (gen: number, outcome: ProcessOutcome, { silent = false } = {}) => {
      if (!isCurrent(gen) || outcome.kind === 'duplicate' || outcome.kind === 'stale') return;
      if (outcome.kind === 'verified') patch({ status: pickStatus(outcome.result) });
      if (!silent) patch({ notice: outcomeMessage(outcome, storeName) });
    },
    [isCurrent, patch, storeName]
  );

  const load = useCallback(
    async (gen: number) => {
      const [statusRes, catalogRes] = await Promise.allSettled([
        api.getStatus(),
        supported ? api.getCatalog(adapter.platform) : Promise.resolve(null),
      ]);
      const connected = supported ? await adapter.connect() : false;
      const catalog = catalogRes.status === 'fulfilled' ? catalogRes.value : null;

      let offers: PlanOffer[] = [];
      if (connected && catalog && catalog.available) {
        const basePlans = Object.fromEntries(catalog.products.map((p) => [p.productId, p.basePlanId]));
        try {
          const products = await adapter.fetchSubscriptions([...new Set(catalog.products.map((p) => p.productId))], basePlans);
          offers = buildPlanOffers(catalog.products, products);
        } catch {
          offers = buildPlanOffers(catalog.products, []);
        }
      }
      if (connected) {
        try {
          const { accountToken } = await api.getAccountToken();
          const s = sessions.get();
          if (s && s.generation === gen) s.accountToken = accountToken.toLowerCase();
        } catch {
          // fetched again on purchase
        }
      }
      if (!isCurrent(gen)) return;
      const offline = [statusRes, catalogRes].some((r) => r.status === 'rejected' && isOfflineError(r.reason));
      const loadedUid = sessions.get()?.uid ?? null;
      setState((prev) => ({
        ...(prev.uid === loadedUid ? prev : INITIAL),
        uid: loadedUid,
        loading: false,
        status: statusRes.status === 'fulfilled' ? pickStatus(statusRes.value) : null,
        catalog,
        offers,
        connected,
        offline,
        error: statusRes.status === 'rejected' && !offline,
      }));

      // Recover purchases that finished in the store but were never confirmed by our server
      // (app killed mid-purchase, network loss, verification outage). Silent: the store /
      // server state is the source of truth and the status above refreshes from it.
      if (connected) {
        try {
          const pending = await adapter.getAvailablePurchases();
          for (const p of pending) {
            if (!isCurrent(gen)) return;
            applyOutcome(gen, await processor.process(p, 'restore'), { silent: true });
          }
        } catch {
          // reconciliation retries on next start; nothing granted locally either way
        }
      }
    },
    [adapter, api, applyOutcome, isCurrent, processor, sessions, supported]
  );

  // One session per signed-in uid: listeners + connection + initial load.
  useEffect(() => {
    if (!uid) return undefined;
    generationRef.current += 1;
    const gen = generationRef.current;
    sessions.set({ uid, generation: gen, accountToken: null });

    const offUpdate = supported
      ? adapter.onPurchaseUpdated((purchase) => {
          if (!isCurrent(gen)) return;
          patch({ verifying: true });
          processor
            .process(purchase, 'purchase')
            .then((outcome) => {
              applyOutcome(gen, outcome);
              if (isCurrent(gen)) patch({ verifying: false, purchasingProductId: null });
            })
            .catch(() => {
              if (isCurrent(gen)) patch({ verifying: false, purchasingProductId: null });
            });
        })
      : () => {};
    const offError = supported
      ? adapter.onPurchaseError((error) => {
          if (!isCurrent(gen)) return;
          patch({ purchasingProductId: null, notice: storeErrorNotice(error, storeName) });
        })
      : () => {};

    load(gen).catch(() => {
      if (isCurrent(gen)) setState({ ...INITIAL, uid, loading: false, error: true });
    });

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && isCurrent(gen)) refreshStatus(gen);
    });

    return () => {
      sessions.end(gen);
      offUpdate();
      offError();
      appStateSub.remove();
      if (supported) adapter.disconnect().catch(() => {});
    };
  }, [uid, adapter, supported, sessions, isCurrent, patch, processor, applyOutcome, load, refreshStatus, storeName]);

  const changeOffers = useMemo(
    () => (visible.status ? changeOptions(visible.offers, visible.status, adapter.platform) : []),
    [visible.offers, visible.status, adapter.platform]
  );

  const startPurchase = useCallback(
    async (offer: PlanOffer, kind: 'new' | 'change') => {
      const session = sessions.get();
      const status = visible.status;
      if (!session || !status || !offer.purchasable || !offer.store) return;
      if (kind === 'new' && !status.canPurchaseInApp) return;
      if (kind === 'change' && !changeOffers.includes(offer)) return;
      if (visible.purchasingProductId || visible.verifying || visible.restoring) return;
      const gen = session.generation;
      patch({ purchasingProductId: offer.productId, notice: null });
      try {
        if ((await isOffline()) === true) {
          if (isCurrent(gen)) patch({ purchasingProductId: null, notice: { tone: 'error', text: "You're offline. Connect to the internet to subscribe." } });
          return;
        }
        let token = session.accountToken;
        if (!token) {
          token = (await api.getAccountToken()).accountToken.toLowerCase();
          if (!isCurrent(gen)) return;
          session.accountToken = token;
        }
        let replace: PlanReplacement | undefined;
        if (kind === 'change' && adapter.platform === 'android' && status.store) {
          // Play needs the current purchase token to REPLACE the subscription (never add a second).
          const owned = (await adapter.getAvailablePurchases()).find(
            (p) => p.productId === status.store!.productId && !!p.purchaseToken
          );
          if (!isCurrent(gen)) return;
          if (!owned) {
            patch({
              purchasingProductId: null,
              notice: {
                tone: 'error',
                text: "Couldn't find your current Google Play subscription on this device. Tap Restore purchases, or change plans in Google Play.",
              },
            });
            return;
          }
          replace = { oldProductId: owned.productId, oldPurchaseToken: owned.purchaseToken!, mode: replacementModeFor(status.store.tier, offer) };
        }
        // iOS: a product in the same subscription group is an App Store upgrade/downgrade.
        await adapter.requestSubscription({ product: offer.store, accountToken: token, replace });
      } catch (err) {
        if (!isCurrent(gen)) return;
        const notice =
          err instanceof ApiRequestError
            ? { tone: 'error' as const, text: "Couldn't start the purchase. Check your connection and try again." }
            : storeErrorNotice(toStoreError(err), storeName);
        patch({ purchasingProductId: null, notice });
        return;
      }
      if (isCurrent(gen)) patch({ purchasingProductId: null });
    },
    [adapter, api, changeOffers, isCurrent, patch, sessions, visible.purchasingProductId, visible.restoring, visible.status, visible.verifying, storeName]
  );
  const purchase = useCallback((offer: PlanOffer) => startPurchase(offer, 'new'), [startPurchase]);
  const changePlan = useCallback((offer: PlanOffer) => startPurchase(offer, 'change'), [startPurchase]);

  const restore = useCallback(async () => {
    const session = sessions.get();
    if (!session || !supported || visible.restoring) return;
    const gen = session.generation;
    patch({ restoring: true, notice: null });
    let purchases;
    try {
      purchases = await adapter.restore();
    } catch {
      if (isCurrent(gen)) patch({ restoring: false, notice: { tone: 'error', text: `Couldn't reach ${storeName}. Try again.` } });
      return;
    }
    const outcomes: ProcessOutcome[] = [];
    for (const p of purchases) {
      if (!isCurrent(gen)) return;
      outcomes.push(await processor.process(p, 'restore'));
    }
    if (!isCurrent(gen)) return;
    await refreshStatus(gen);
    if (!isCurrent(gen)) return;

    const verified = outcomes.filter((o): o is Extract<ProcessOutcome, { kind: 'verified' }> => o.kind === 'verified');
    const first = (kind: ProcessOutcome['kind']) => outcomes.find((o) => o.kind === kind);
    let notice: BillingNotice | null;
    if (verified.some((o) => o.result.entitled)) notice = { tone: 'success', text: 'Your subscription has been restored to this account.' };
    else if (first('owned_elsewhere')) notice = outcomeMessage(first('owned_elsewhere')!, storeName);
    else if (first('other_account')) notice = outcomeMessage(first('other_account')!, storeName);
    else if (first('retry_later')) notice = outcomeMessage(first('retry_later')!, storeName);
    else if (first('pending')) notice = outcomeMessage(first('pending')!, storeName);
    else if (verified.length) notice = { tone: 'info', text: 'No active subscription was found — your previous subscription has ended.' };
    else notice = { tone: 'info', text: `No subscriptions were found for this ${storeName} account.` };
    patch({ restoring: false, notice });
  }, [adapter, isCurrent, patch, processor, refreshStatus, sessions, visible.restoring, storeName, supported]);

  const manage = useCallback(async () => {
    try {
      await adapter.openManageSubscriptions(visible.status?.store?.productId ?? null);
    } catch {
      await Linking.openURL(MANAGE_FALLBACK_URL[adapter.platform]).catch(() => {});
    }
  }, [adapter, visible.status]);

  const reload = useCallback(() => {
    const session = sessions.get();
    if (!session) return;
    patch({ loading: true, error: false, notice: null });
    load(session.generation).catch(() => {
      if (isCurrent(session.generation)) setState({ ...INITIAL, uid: session.uid, loading: false, error: true });
    });
  }, [isCurrent, load, patch, sessions]);

  const dismissNotice = useCallback(() => patch({ notice: null }), [patch]);

  const availability = resolveAvailability({
    platform: adapter.platform,
    loading: visible.loading,
    offline: visible.offline,
    error: visible.error,
    supported,
    connected: visible.connected,
    status: visible.status,
    catalog: visible.catalog,
    offers: visible.offers,
  });

  const value = useMemo<BillingContextValue>(
    () => ({
      state: visible,
      availability,
      supported,
      platform: adapter.platform,
      storeName,
      purchase,
      changePlan,
      changeOffers,
      restore,
      manage,
      reload,
      dismissNotice,
    }),
    [visible, availability, changePlan, changeOffers, supported, adapter.platform, storeName, purchase, restore, manage, reload, dismissNotice]
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}
