import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ThemedText } from '@/components/ThemedText';
import { Badge, Card, ProgressBar, SectionHeader, TierBadge } from '@/components/ui';
import { useApiResource } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { openExternal } from '@/features/legal/links';
import { StateMessage } from '@/features/reports/components/StateMessage';
import { paymentApi, type Invoice } from '@/services/api/payment';
import { usersApi } from '@/services/api/users';
import { useTheme } from '@/theme';

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

const INVOICE_TONE: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  paid: 'success',
  open: 'warning',
  uncollectible: 'error',
  void: 'neutral',
};

/**
 * Web Dashboard `billing` view: plan usage meter (70/90% colouring, 80% warning) and billing history. Plan changes go
 * through Subscription (store purchase), never Stripe Checkout inside the app (Phase 7 decision). Invoice PDFs are
 * Stripe-hosted links opened in the browser, the same link the web table uses.
 */
export function UsageBillingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const usage = useApiResource(() => usersApi.getUsage().then((r) => r.usage));
  const invoices = useApiResource(() => paymentApi.getInvoices().then((r) => r.invoices));

  const u = usage.data;
  const unlimited = u?.reportsLimit === -1;
  const percent = u && !unlimited && u.reportsLimit > 0 ? Math.min(100, Math.round((u.reportsThisMonth / u.reportsLimit) * 100)) : 0;
  const barColor = unlimited
    ? theme.colors.success
    : percent >= 90
      ? theme.colors.error
      : percent >= 70
        ? theme.colors.warning
        : theme.colors.primary;

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={usage.refreshing || invoices.refreshing}
            onRefresh={() => {
              usage.refresh();
              invoices.refresh();
            }}
            tintColor={theme.colors.primary}
          />
        }
      >
        <View style={styles.column}>
          <ScreenHeader title="Usage & Billing" subtitle="Your plan usage and billing history" />

          <Card style={styles.block}>
            {usage.loading && !u ? (
              <StateMessage title="Loading…" />
            ) : usage.error && !u ? (
              <StateMessage title="Could not load plan usage" description={usage.error} onRetry={usage.retry} />
            ) : u ? (
              <>
                <View style={styles.planRow}>
                  <View style={styles.flex}>
                    <ThemedText variant="caption" color="muted">
                      Current plan
                    </ThemedText>
                    <ThemedText variant="title">{u.tierName}</ThemedText>
                  </View>
                  <TierBadge tier={u.tier} />
                </View>
                <View style={styles.usageHead}>
                  <ThemedText variant="body">
                    {u.reportsThisMonth} of {unlimited ? 'unlimited' : u.reportsLimit} reports this month
                  </ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {unlimited ? 'Unlimited' : `${percent}%`}
                  </ThemedText>
                </View>
                <ProgressBar percent={unlimited ? 100 : percent} color={barColor} accessibilityLabel="Monthly reports used" />
                {!unlimited && percent >= 80 ? (
                  <ThemedText variant="caption" style={[styles.warn, { color: u.reportsRemaining === 0 ? theme.colors.error : theme.colors.warning }]}>
                    {u.reportsRemaining === 0
                      ? 'Monthly limit reached. Upgrade your plan to generate more reports.'
                      : `${u.reportsRemaining} report${u.reportsRemaining === 1 ? '' : 's'} remaining this month.`}
                  </ThemedText>
                ) : null}
                <ThemedText variant="caption" color="muted" style={styles.warn}>
                  {u.reportsTotal} report{u.reportsTotal === 1 ? '' : 's'} generated in total
                  {u.features.watermark ? ' · Exports carry a watermark on this plan' : ''}
                </ThemedText>
                <View style={styles.cta}>
                  <PrimaryButton icon="star" label="Change plan" variant="secondary" onPress={() => router.push('/subscription')} />
                </View>
              </>
            ) : null}
          </Card>

          <SectionHeader title="Billing History" />
          {invoices.loading && !invoices.data ? (
            <Card>
              <StateMessage title="Loading…" />
            </Card>
          ) : invoices.error && !invoices.data ? (
            <Card>
              <StateMessage title="Could not load invoices" description={invoices.error} onRetry={invoices.retry} />
            </Card>
          ) : (invoices.data ?? []).length === 0 ? (
            <Card>
              <StateMessage
                title="No invoices yet"
                description="Invoices for website (card) subscriptions appear here. App Store and Google Play receipts are in your store account."
              />
            </Card>
          ) : (
            <Card padded={false}>
              {(invoices.data ?? []).map((inv: Invoice, i) => (
                <View key={inv.id} style={[styles.invoice, i > 0 && { borderTopWidth: 1, borderTopColor: theme.colors.border }]}>
                  <View style={styles.flex}>
                    <ThemedText variant="body" style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
                      {money(inv.amount, inv.currency)}
                    </ThemedText>
                    <ThemedText variant="caption" color="muted" numberOfLines={1}>
                      {new Date(inv.date).toLocaleDateString()}
                      {inv.description ? ` · ${inv.description}` : ''}
                    </ThemedText>
                  </View>
                  <Badge label={inv.status.charAt(0).toUpperCase() + inv.status.slice(1)} tone={INVOICE_TONE[inv.status] ?? 'neutral'} />
                  {inv.pdf ? (
                    <ThemedText
                      variant="body"
                      color="primary"
                      accessibilityRole="link"
                      accessibilityLabel={`Download invoice from ${new Date(inv.date).toLocaleDateString()}`}
                      onPress={() => openExternal(inv.pdf as string)}
                      style={styles.pdf}
                    >
                      PDF
                    </ThemedText>
                  ) : null}
                </View>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingBottom: 24 },
  block: { marginBottom: 24 },
  planRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  flex: { flex: 1, minWidth: 0 },
  usageHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 },
  warn: { marginTop: 8 },
  cta: { marginTop: 16 },
  invoice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  pdf: { paddingVertical: 10, paddingLeft: 6, fontFamily: 'Inter_600SemiBold' },
});
