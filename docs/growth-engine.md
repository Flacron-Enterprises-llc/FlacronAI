# FlacronAI ↔ Flacron Growth Engine

FlacronAI is connected **once** to the Flacron Growth Engine (FCGE). Everything else (email journeys, webinars, giveaways, offer codes, popups, support chat) is configured in the Growth Engine dashboard, not in this repo.

## Growth Engine side (configured 2026-10-22)

| Item | Value |
|---|---|
| App | **FlacronAI**, id `cmujjiqvv01jtjy1jqji20aru`, slug `flacronai` |
| Publishable key | `pk_live_2eced114…` (browser-safe; in `frontend/src/lib/growthEngine.js`) |
| Allowed domains | `flacronai.com`, `d3vae9bcin1ywn.amplifyapp.com`, `calm-ground-0fce9b20f.3.azurestaticapps.net`, `flacronai-web.2g1gauctre14.us-east.codeengine.appdomain.cloud` |
| Stripe | Shared Flacron account `acct_1HUAchKFLhrvSzkg`, `app_id=flacron-ai`, FlacronAI's own restricted key (encrypted in FCGE) |
| Stripe webhook → FCGE | `we_1UTQL6KFLhrvSzkgBNyPtoac` → `https://dleleyb9ufrgz.cloudfront.net/webhooks/stripe/cmujjiqvv01jtjy1jqji20aru`, 13 events, metadata `app_id=flacron-ai`; events without our app_id are rejected by FCGE |
| Support chat | Widget `wid_7x_SBw0OQvc4` "FlacronAI support", shown through the SDK, notifies `hello@flacronenterprises.com`, hidden on `/shared/*` and report previews |
| Email content | 76 templates and 26 lifecycle automations exist **as drafts**. Turning them on is an owner decision in the Growth Engine. |

## App side

- **SDK, consent-gated** (`frontend/src/lib/growthEngine.js`, `components/GrowthEngineTracker.jsx`). The `window.FCGE` queue is created at load and sends nothing. `fcge.min.js` (which also brings the chat widget and any popups) is injected only after the visitor allows **Analytics** in the cookie banner. The analytics description now names the Growth Engine and says usage is linked to the account once signed in. `COOKIE_POLICY_VERSION` was bumped to `2026-10-22`, so returning visitors are asked again. Kill switch: `VITE_FCGE_DISABLED=true`.
- **Identify:** after sign-in, with email, uid, name, company, plan (tier), job type from onboarding, team role and report count. `FCGE.reset()` runs on sign-out. Marketing consent is never sent: the app collects none (Golden Rule #5).
- **Events:**
  - `user_registered` (email and Google)
  - `email_verified`
  - `onboarding_completed`
  - `feature_used`: `report_generated`, `report_finalized`, `report_exported`, `report_shared`, `product_tour_completed`
  - `usage_limit_90` and `usage_limit_100`, once per month per session
  - `pricing_page_visited`
  - `upgrade_clicked`: any `data-fcge-upgrade` element
  - `checkout_started`
  - `demo_requested`: Contact → Enterprise Sales

  Payment and subscription events come from Stripe through the FCGE webhook, never from the browser.
- **Offer funnel** (`backend/utils/growthEngineFunnel.js`): a Growth Engine webinar or giveaway link can open any FlacronAI page with `?code=<OFFER>&fcge_ref=<ref>`. Both are kept for the session (they survive sign-up and sign-in) and sent with `create-checkout-session`.
  - The backend stamps `fcge_ref` (and the applied code) on the Checkout Session and subscription metadata.
  - It applies the code up front when it is a live Stripe promotion code tagged `app_id=flacron-ai`. FCGE mirrors its codes into Stripe when the app's "Offer codes in Stripe Checkout" setting is on.
  - Otherwise Stripe Checkout shows its own promotion-code field (`allow_promotion_codes`).

## Interactive app tour

- `frontend/src/tour/`:
  - `tourSteps.js` builds the steps (personalized by plan, team role, onboarding job type and platform admin).
  - `TourContext.jsx` handles auto-start and replay.
  - `ProductTour.jsx` is the spotlight and tooltip: Next / Back / Skip / Finish, keyboard, focus trap, reduced motion, and a sheet layout on mobile with the sidebar opened while the tour points into it.
- Starts by itself once, on the first dashboard visit after the onboarding wizard. "Replay app tour" is in the account menu (desktop and mobile) and in Settings → Help.
- Completion is stored on the user doc as `productTour` through `POST /api/users/product-tour` (`backend/utils/productTour.js`; own doc only). Skipping also counts as seen. Bump `TOUR_VERSION` to show a reworked tour to everyone once.
- QA 2026-10-22 (local stack against the real Firebase project, temporary users deleted afterwards): **38/38 browser checks passed.**
  - Desktop enterprise owner: 13 steps, auto-start, no restart after finishing, replay from the menu and from Settings, arrow keys and Esc.
  - Mobile 390 px reviewer: 7 steps, no Generate step, sidebar targets highlighted on screen, no horizontal overflow.
  - No page or console errors.

## Super Intelligence wording (2026-10-22)

User-facing "AI" is now "Super Intelligence" (web, backend messages, export disclaimers, mobile). Unchanged:
- the brand name FlacronAI, identifiers, routes and fields
- model and vendor references (Anthropic, IBM WatsonX)
- prompts sent to the model, comments and logs

**Owner/counsel decision pending:** the Subprocessors page and the Cookies Policy are legal documents and were not reworded. The Cookies Policy also doesn't list the Growth Engine yet (it lists Google/Firebase analytics as "anonymized"). It should get a Growth Engine row and a new "Last updated" date.
