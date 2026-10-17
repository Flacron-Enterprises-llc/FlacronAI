# FlacronAI — Centralized Stripe

FlacronAI follows the company-wide Stripe standard: **one Stripe account** (Flacron Enterprises LLC, `acct_1HUAchKFLhrvSzkg`), with every application separated by a permanent `app_id`. FlacronAI's id is **`flacron-ai`**.

The implementation mirrors EnergyVerse (`flacron-energy`) and BTOS (`being-tchitaka-os`).

| Rule | Where |
|---|---|
| `APP_ID=flacron-ai` (one place) | `backend/config/stripeApp.js` |
| Own restricted key (`rk_test_` / `rk_live_`) in `STRIPE_SECRET_KEY` | AWS Secrets Manager `flacronai/production/app`; synced to Azure Key Vault / IBM CE secret |
| Own Products/Prices: "FlacronAI - Professional/Agency/Enterprise" (monthly + annual) and "FlacronAI - Photo Pack +25/50/100/250", with `app_id` on Product **and** Price and stable lookup keys `flacron_ai_*` | `backend/scripts/stripe-sync-catalog.js` (idempotent; `--dry-run`, `--verify`) |
| `app_id` + `internal_user_id` metadata on Customer, Checkout Session, `subscription_data`, `payment_intent_data`, subscription updates, subscription schedules; invoice PaymentIntents stamped after payment | `backend/routes/payment.js` |
| A Price is sold only if it is active, tagged `flacron-ai` and in the key's mode | `assertPriceIsOurs` |
| Own webhook endpoint `https://api.flacronai.com/api/payment/webhook` (api_version `2023-10-16`, metadata `app_id=flacron-ai`) with its own secret | Stripe Dashboard → Webhooks |
| Webhook: signature verified → event id deduplicated → mode checked → `app_id` attributed from the object or a fresh read of its subscription/PaymentIntent/invoice. **Mismatch or missing = logged, recorded, not applied.** | `routes/payment.js` webhook |
| Ledger in Firestore with `application_id` on every row: `stripe_events`, `billing_customers`, `billing_subscriptions`, `billing_invoices`, `billing_payments`, `billing_refunds`. Same names and fields as EnergyVerse. Server-only. | `backend/services/billingLedger.js` |
| Revenue report (gross, refunds, net, payments ok/failed, active/cancelled subs, MRR/ARR, customers); per app or `all`; failed/pending payments never revenue; test rows excluded from live reports | `GET /api/payment/admin/revenue?application_id=flacron-ai|all&livemode=` (admin) |

## Verification
- Unit/route tests: `backend/test/stripe-centralization.test.js`. Covers metadata, foreign/inactive/wrong-mode price refused, forged signature, `app_mismatch`, `unattributed`, `mode_mismatch`, duplicates, failed payment, refund $100−$30=$70, separation 3/2/4/9, revenue $100/$100/$200.
- Real Stripe **test mode** E2E: `STRIPE_SECRET_KEY=sk_test_… node scripts/stripe-e2e-verify.js prices.env`. Runs real objects, signed webhooks via `stripe listen` and test clocks. **22/22 passed on 2026-10-17**:
  - checkout metadata, subscription creation, upgrade (prorated), scheduled downgrade
  - renewal, failed renewal (`past_due`, no access), partial refund, cancellation
  - foreign-app isolation, duplicate, forged signature
  - ledger gross/refunds/net equal to Stripe's own charges

## Legacy note
Before 2026-10-17, production used a test key from a different Stripe account ("Being Tchitaka"). Stripe ids stored on user docs from that account are treated as absent (`retrieveOrNull`), so checkout keeps working. 12 users hold paid tiers obtained through test-mode purchases; changing them is an owner decision.
