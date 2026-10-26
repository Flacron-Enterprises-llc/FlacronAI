/**
 * Phase 7 — Subscription screen: current plan (from the server), store plans with the
 * store's own localized prices, purchase / restore / manage, and the store-required
 * auto-renewal disclosures + legal links.
 *
 * Policy notes (see MOBILE_DEVELOPMENT_PHASES.md Phase 7):
 * - Web (Stripe) subscribers see their plan and are told it's managed on the web — no
 *   purchase buttons (prevents duplicate subscriptions) and no link to an external purchase
 *   flow (App Store 3.1.1 / Google Play payments policy). Text only.
 * - Store subscribers manage/cancel through the store's own subscription settings.
 */
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { StateMessage } from '@/features/reports/components/StateMessage';
import type { StoreEntitlement } from '@/services/api/billing';
import { useBilling } from '../BillingProvider';
import { LEGAL_LINKS } from '../legalLinks';
import { formatBillingPeriod, type PlanOffer } from '../planCatalog';

const TIER_LABELS: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  agency: 'Agency',
  enterprise: 'Enterprise',
};

const formatDate = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

const storeLabel = (platform: StoreEntitlement['platform']) => (platform === 'ios' ? 'the App Store' : 'Google Play');

/** Renewal/expiry line — only from verified server data, never inferred. */
export function storeStatusLine(store: StoreEntitlement): string {
  const date = formatDate(store.expiresAt);
  switch (store.state) {
    case 'active':
      if (!date) return 'Active';
      if (store.autoRenew && store.renewsToTier) {
        const next = `${TIER_LABELS[store.renewsToTier] ?? store.renewsToTier}${store.renewsToPeriod === 'annual' ? ' (annual)' : ''}`;
        return `Changes to ${next} on ${date}`;
      }
      return store.autoRenew ? `Renews on ${date}` : `Cancelled — access until ${date}`;
    case 'grace_period':
      return `Payment issue — update your payment method in ${storeLabel(store.platform)}${date ? ` before ${date}` : ''} to keep access.`;
    case 'billing_retry':
    case 'on_hold':
      return `Payment issue — access is paused until your payment method is updated in ${storeLabel(store.platform)}.`;
    case 'paused':
      return 'Paused in Google Play.';
    case 'pending':
      return 'Purchase pending approval.';
    case 'revoked':
      return 'Refunded or revoked — no longer active.';
    case 'expired':
      return date ? `Expired on ${date}` : 'Expired';
    default:
      return 'Status unavailable';
  }
}

function Notice() {
  const theme = useTheme();
  const { state, dismissNotice } = useBilling();
  if (!state.notice) return null;
  const color =
    state.notice.tone === 'success' ? theme.colors.success : state.notice.tone === 'error' ? theme.colors.error : theme.colors.ink;
  return (
    <Pressable onPress={dismissNotice} accessibilityRole="alert" accessibilityHint="Dismiss" style={styles.notice}>
      <ThemedText variant="body" style={{ color }}>
        {state.notice.text}
      </ThemedText>
    </Pressable>
  );
}

function PlanCard({ offer, change = false }: { offer: PlanOffer; change?: boolean }) {
  const theme = useTheme();
  const { purchase, changePlan, state } = useBilling();
  const busy = state.purchasingProductId === offer.productId;
  const anyBusy = !!state.purchasingProductId || state.verifying || state.restoring;
  return (
    <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card }]}>
      <ThemedText variant="subtitle">
        {offer.planName} · {offer.period === 'annual' ? 'Annual' : 'Monthly'}
      </ThemedText>
      <ThemedText variant="caption" color="muted" style={styles.spaced}>
        {offer.reportsPerMonth === -1 ? 'Unlimited reports' : `${offer.reportsPerMonth} reports per month`}
      </ThemedText>
      {offer.purchasable && offer.store ? (
        <>
          <ThemedText variant="body" style={styles.price}>
            {offer.store.displayPrice} {formatBillingPeriod(offer)}, auto-renewing
          </ThemedText>
          <PrimaryButton
            label={busy ? 'Opening store…' : change ? `Switch to ${offer.planName}` : `Subscribe to ${offer.planName}`}
            onPress={() => (change ? changePlan(offer) : purchase(offer))}
            loading={busy}
            disabled={anyBusy}
          />
        </>
      ) : (
        <ThemedText variant="caption" color="muted" style={styles.spaced}>
          Not currently available for purchase in the app.
        </ThemedText>
      )}
    </View>
  );
}

function CurrentPlan() {
  const theme = useTheme();
  const { state, manage, platform } = useBilling();
  const status = state.status;
  if (!status) return null;
  const store = status.store;
  return (
    <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card }]}>
      <ThemedText variant="caption" color="muted">
        Current plan
      </ThemedText>
      <ThemedText variant="subtitle" style={styles.spacedSmall}>
        {TIER_LABELS[status.tier] ?? 'Plan unavailable'}
      </ThemedText>

      {status.team.active && (
        <ThemedText variant="caption" color="muted" style={styles.spaced}>
          {"Included with your team's FlacronAI plan — nothing to purchase here."}
        </ThemedText>
      )}
      {status.admin.active && !status.stripe.active && !store && !status.team.active && (
        <ThemedText variant="caption" color="muted" style={styles.spaced}>
          Plan granted by FlacronAI. Contact support with any questions.
        </ThemedText>
      )}
      {status.stripe.active && (
        <ThemedText variant="caption" color="muted" style={styles.spaced}>
          Billed through your FlacronAI web account. To change or cancel it, sign in to FlacronAI in a web browser.
        </ThemedText>
      )}

      {store && (
        <>
          <ThemedText variant="caption" color="muted" style={styles.spaced}>
            {`${TIER_LABELS[store.tier] ?? store.tier} via ${storeLabel(store.platform)}${store.isTest ? ' (test purchase)' : ''}`}
          </ThemedText>
          <ThemedText variant="body" style={styles.spacedSmall}>
            {storeStatusLine(store)}
          </ThemedText>
          {store.platform === platform ? (
            <View style={styles.spaced}>
              <PrimaryButton variant="secondary" label="Manage subscription" onPress={manage} />
            </View>
          ) : (
            <ThemedText variant="caption" color="muted" style={styles.spaced}>
              {store.platform === 'ios'
                ? 'Manage this subscription in Settings › Apple ID › Subscriptions on your Apple device.'
                : 'Manage this subscription in Google Play › Payments & subscriptions on your Android device.'}
            </ThemedText>
          )}
        </>
      )}
    </View>
  );
}

function Disclosures() {
  const { platform } = useBilling();
  const account = platform === 'ios' ? 'Apple Account' : 'Google Play account';
  const where = platform === 'ios' ? 'your App Store account settings' : 'Google Play › Payments & subscriptions';
  return (
    <View style={styles.disclosures}>
      <ThemedText variant="caption" color="muted">
        {`Payment is charged to your ${account} when you confirm the purchase. Subscriptions renew automatically at the price and period shown unless cancelled at least 24 hours before the end of the current period; your account is charged for renewal within 24 hours before the period ends. Manage or cancel any time in ${where}. Deleting the app does not cancel a subscription.`}
      </ThemedText>
      <View style={styles.links}>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(LEGAL_LINKS.terms).catch(() => {})}>
          <ThemedText variant="caption" style={styles.link}>
            Terms of Service
          </ThemedText>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(LEGAL_LINKS.privacy).catch(() => {})}>
          <ThemedText variant="caption" style={styles.link}>
            Privacy Policy
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const UNAVAILABLE_COPY: Partial<Record<ReturnType<typeof useBilling>['availability'], { title: string; description: string }>> = {
  unsupported: {
    title: 'In-app purchases unavailable',
    description: "Subscriptions can't be purchased in this version of the app or on this device.",
  },
  store_unconfigured: {
    title: 'Subscriptions coming soon',
    description: "In-app subscriptions aren't available yet. Your current plan and features are unaffected.",
  },
  blocked_team: {
    title: 'Covered by your team',
    description: 'Your access comes from your team plan, so there is nothing to buy in the app.',
  },
  no_products: {
    title: 'No plans available',
    description: "No subscription plans are available from the store right now. Please try again later.",
  },
};

export function SubscriptionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, availability, restore, reload, supported, changeOffers, platform } = useBilling();

  let body: ReactNode;
  if (availability === 'loading') {
    body = <StateMessage title="Loading subscription…" />;
  } else if (availability === 'offline') {
    body = <StateMessage title="You're offline" description="Connect to the internet to view or change your subscription." onRetry={reload} />;
  } else if (availability === 'error') {
    body = <StateMessage title="Couldn't load your subscription" description="Please try again." onRetry={reload} />;
  } else {
    const copy = UNAVAILABLE_COPY[availability];
    body = (
      <>
        <CurrentPlan />
        {availability === 'ready' && (
          <>
            <ThemedText variant="subtitle" style={styles.sectionTitle}>
              Plans
            </ThemedText>
            {state.offers.map((offer) => (
              <PlanCard key={offer.key} offer={offer} />
            ))}
            <Disclosures />
          </>
        )}
        {availability === 'change_plan' && (
          <>
            <ThemedText variant="subtitle" style={styles.sectionTitle}>
              Change plan
            </ThemedText>
            <ThemedText variant="caption" color="muted" style={styles.changeNote}>
              {platform === 'ios'
                ? 'The App Store applies the change: upgrades start now with a prorated charge; downgrades start at your next renewal. You keep one subscription.'
                : 'Google Play replaces your current subscription: upgrades start now and charge the prorated difference; other changes start now with your unused time credited. You keep one subscription.'}
            </ThemedText>
            {changeOffers.map((offer) => (
              <PlanCard key={offer.key} offer={offer} change />
            ))}
            <Disclosures />
          </>
        )}
        {copy && <StateMessage title={copy.title} description={copy.description} />}
        {supported && state.connected && (
          <View style={styles.restore}>
            <PrimaryButton variant="secondary" label="Restore purchases" onPress={restore} loading={state.restoring} disabled={state.verifying} />
          </View>
        )}
        {state.verifying && (
          <ThemedText variant="caption" color="muted" style={styles.spaced}>
            Confirming your purchase with the store…
          </ThemedText>
        )}
      </>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
          <ThemedText variant="body" style={{ color: theme.colors.primary }}>
            ‹ Back
          </ThemedText>
        </Pressable>
        <ThemedText variant="heading" style={styles.heading}>
          Subscription
        </ThemedText>
        <Notice />
        {body}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  back: { paddingVertical: 8, alignSelf: 'flex-start' },
  heading: { marginBottom: 16 },
  sectionTitle: { marginBottom: 12 },
  card: { borderWidth: StyleSheet.hairlineWidth * 2, padding: 14, marginBottom: 16 },
  spaced: { marginTop: 10 },
  spacedSmall: { marginTop: 4 },
  price: { marginTop: 10, marginBottom: 12 },
  notice: { marginBottom: 16 },
  disclosures: { marginTop: 4, marginBottom: 8 },
  links: { flexDirection: 'row', gap: 20, marginTop: 10 },
  link: { textDecorationLine: 'underline' },
  restore: { marginTop: 8, marginBottom: 32 },
  changeNote: { marginBottom: 12 },
});
