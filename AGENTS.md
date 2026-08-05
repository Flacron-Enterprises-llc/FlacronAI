# AGENTS.md — FlacronAI Project Master Context

> **Read this file FIRST in every session, before touching any code.**
> This is the single source of truth. If anything here conflicts with an old memory, this file wins.
> Keep this file and `PROGRESS.md` updated as you work. Never let them go stale.

---

## 0. How to use this documentation system

There are 4 files. Read them in this order at the start of a session:

1. **AGENTS.md** (this file) — rules, conventions, golden constraints, project map.
2. **PROGRESS.md** — what is done, what is in progress, what remains. Update after EVERY task.
3. **TASKS.md** — the full micro-task backlog with acceptance criteria + QA checklist per task.
4. **PROMPTS.md** — copy-paste-ready task prompts (the human will hand you one at a time).

**You do not need to re-read the whole codebase each time.** Read this file + the "Project Map" + "Tech Stack" sections below (which YOU fill in during the audit). Only open the specific files a task touches.

---

## 1. What the project is

**FlacronAI** = a web platform that generates professional **insurance inspection reports** using AI.
Core loop: user uploads inspection photos + claim details → AI organizes findings, identifies *visible* damage, drafts report sections → **human reviews** → export to PDF/DOCX/share.

It also has: marketing website (hero, pricing, testimonials), user dashboard, subscriptions/billing, team roles, CRM integrations, and an admin panel.

### The client's top-level goals for this upgrade
- Improve the website (hero, readability, CTAs, less empty space, bigger product screenshot).
- **Design must NOT look "AI-generated" / templated.** Real, intentional, branded design.
- Update the **logo** and brand identity.
- **Proper SEO on every page** — technical + on-page + content.
- Everything must be **actually functional and QA-verified**, not just visually present.
- Remove all **unverified/fabricated claims** (see Golden Rule #1).
- Build a **reliable subscription/entitlement system** (customers get exactly what they paid for).
- Add lead-capture + consent-based marketing automation.

---

## 2. GOLDEN RULES (never break these)

These override convenience. If a task seems to require breaking one, STOP and flag it in PROGRESS.md.

1. **No fabricated claims anywhere.** Do not display statistics, testimonials, customer names, carrier partnerships, accuracy %, certifications, or compliance badges unless there is documented, real data. Replace with verifiable facts (avg generation time, # of templates, export formats, max photos/report, integrations, measured uptime).
2. **AI never gives final professional verdicts.** AI output must use cautious language ("Visible conditions appear consistent with…", "The image may show…", "A qualified professional should confirm…"). AI must NOT decide: coverage, liability, cause of loss, fraud, policy interpretation, structural safety, mold, engineering conclusions, code compliance, final repair costs, or approval/denial.
3. **Human review is mandatory before finalize.** Never silently insert AI findings into a final report. Every AI observation is accept/reject/edit-able and shows confidence + explanation + who approved it.
4. **Entitlements must be enforced server-side.** Never show a feature as "included" unless it is fully functional. Paid users must not get free-plan restrictions; free users must not access paid features. Never trust the client for plan checks.
5. **Consent is required for marketing.** Marketing checkboxes are never pre-checked. Transactional emails stay separate from marketing. Honor unsubscribe / STOP / consent withdrawal immediately.
6. **Security first for claim data.** Encryption in transit + at rest, RBAC, signed URLs, file-upload validation. No compliance badge until the real technical/legal work is done.
7. **Micro-changes only.** One small, self-contained change per task. Build → verify → QA → log → next. No giant multi-feature commits.
8. **Git safety.** All work happens on the dedicated branch `flacron/improvements`. NEVER push to or merge into main/master/default branch. No force-push. No PRs unless the client asks. One task = one focused commit with the task ID in the message (e.g. `T-1.1: remove unverified stats from hero`). Push only to `flacron/improvements`. If unsure which branch you're on or where a push targets, STOP and ask.

---

## 3. Working method (per task)

For EVERY micro-task, follow this loop:

1. **Read** the task from TASKS.md (goal + acceptance criteria + QA checklist).
2. **Plan** — state which files you will touch and why (keep it minimal).
3. **Implement** the smallest working change.
4. **Self-QA** — run the QA checklist. Actually test it (run the app / call the endpoint / click the flow). Do not mark done on "looks right."
5. **Log** — update PROGRESS.md: what changed, files touched, QA result, anything left.
6. **Stop** and report back. Do not silently roll into the next task.

If something is ambiguous or a Golden Rule is at risk → do NOT guess. Write the question in PROGRESS.md under "Open Questions" and ask.

---

## 4. Tech Stack  — audited 2026-07-17 (T-0.1)

- **Framework (frontend):** React 18.2 + Vite 5, Tailwind CSS 3.4, react-router-dom 6.21 (SPA, all pages lazy-loaded from `frontend/src/App.jsx`). Framer Motion for animation (27 files), lucide-react + react-icons, react-hot-toast. All `.jsx` — **no TypeScript**.
- **Framework (backend / API):** Node.js 18+ / Express 4 (`backend/server.js`, routes mounted at `server.js:111-118`). helmet, cors, morgan, express-rate-limit, express-validator.
- **Language(s):** JavaScript only (frontend JSX + backend CommonJS).
- **Database + ORM:** Firebase **Firestore** via `firebase-admin` (no ORM). Collections: `users`, `reports`, `apiKeys`, `apiUsage`, `processedWebhooks`, `crmClients`, `crmAppointments`, `crmClaims`, `salesLeads`, `enterpriseClients`, `enterpriseTeams`. Rules in `backend/firestore.rules`.
- **Auth:** Firebase Auth (email/password + Google popup) on the client (`frontend/src/config/firebase.js`, `frontend/src/context/AuthContext.jsx`). Backend `backend/middleware/auth.js` accepts a Firebase ID token **or** a custom JWT fallback (`JWT_SECRET`) — register mints a custom JWT while login returns a Firebase idToken (inconsistent). API keys (`X-API-Key`, SHA-256 hashed, `apiKeys` collection) for Agency+ via `authenticateApiKey`/`authenticateAny`. Tier gating: `requireTier` middleware server-side.
- **Payments/subscriptions:** **Stripe Checkout Sessions in `mode: 'subscription'`** (`backend/routes/payment.js:35-44`). Full lifecycle wired: create customer, checkout, retrieve/cancel-at-period-end, invoices. **Webhook exists** at `POST /api/payment/webhook` (`payment.js:54`), **signature verified** (`constructEvent`, raw body preserved at `server.js:64`), idempotent via `processedWebhooks`. Events handled: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`, `customer.subscription.updated`. Entitlements ARE server-side: tier lives in the Firestore user doc, set only by webhook/admin; report limits via `canGenerate()` (`backend/routes/reports.js:72`) + `backend/config/tiers.js`. No client-side Stripe.js (installed but never imported — checkout is a server-redirect).
- **AI provider + image analysis (reworked 2026-07-19, T-2.5a):** **Codex (Anthropic) is PRIMARY**, IBM **WatsonX** (`ibm/granite-3-8b-instruct`) is the text-only fallback. **OpenAI fully removed.** `backend/config/anthropic.js` wraps `@anthropic-ai/sdk`; model via `ANTHROPIC_MODEL` env (default `Codex-opus-4-8`). Text = `generateWithFallback()` (Codex → watsonx) in `aiService.js`. Image analysis = **Codex vision** (base64 blocks, jpeg/png/gif/webp only — heic/heif skipped, capped at 10 images); watsonx has no vision so image analysis degrades gracefully to "unavailable" if Codex isn't configured. **Needs `ANTHROPIC_API_KEY` in prod (Render) to run** — until set, everything falls back to watsonx. ⚠️ Report prompts still demand definitive verdicts (Golden Rule #2) — provider swap did NOT change prompt language; that's still Phase-2 (T-2.5) work.
- **File storage:** **Local disk only** — `backend/uploads/{uid}/...` (`backend/config/storage.js`). No S3/Firebase Storage, no signed URLs. ⚠️ `/uploads` is served publicly without auth (`server.js:84`) and Render has no persistent disk → files are world-readable AND lost on every deploy.
- **Email/SMS provider:** Email = **Brevo REST API** (`backend/services/emailService.js`, template IDs 10-15 + inline-HTML fallback): welcome, password reset, payment failed, team invite, sales lead, email verification. **No SMS provider.** (SMTP `EMAIL_*` vars in `.env.example` are dead — Nodemailer isn't even a dependency.)
- **Hosting / deploy:** Backend → **Render** (`backend/render.yaml`: single node web service, oregon, starter plan, `healthCheckPath: /health`, secrets via dashboard). Frontend → **Vercel** (`frontend/vercel.json`: SPA rewrite + security headers). Live site: flacronai.com.
- **Package manager + run commands:** npm, separate installs per folder. (This machine: use `--cache "E:/.npm-cache"` — C: drive is nearly full; network is flaky, retry ECONNRESET failures with `--prefer-offline`.)
  - Backend: `cd backend && npm install && npm run dev` (nodemon, port 3000) · prod `npm start` · `npm run lint` · `npm run format` / `format:check` · `npm test` (node --test, tests in `backend/test/`)
  - Frontend: `cd frontend && npm install && npm run dev` (Vite, port 5173; proxies `/api`→3000) · `npm run build` · `npm run preview` · `npm run lint` · `npm run format` / `format:check` · `npm test` (Vitest, tests in `src/__tests__/`)
- **Existing test setup (added T-0.3):** ESLint 10 flat config (backend) / ESLint 9 + react + react-hooks plugins (frontend — plugin doesn't support ESLint 10 yet); shared `.prettierrc` at repo root; backend tests via node's built-in runner, frontend via Vitest 3 (v4 needs rolldown native bindings + Vite 6 — don't upgrade until Vite is upgraded). Lint passes with **0 errors, ~78 warnings** across both packages (pre-existing issues downgraded to warnings in the configs — clean up task-by-task, then ratchet severities back to error). A repo-wide `prettier --write` is deliberately deferred (would be a huge noisy diff); new/touched files should be prettier-clean.
- **Env vars needed (names only):**
  - Backend (used in code): `PORT`, `NODE_ENV`, `FRONTEND_URL`, `BACKEND_URL`, `ADMIN_EMAIL`, `JWT_SECRET`, `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_CLIENT_ID`, `FIREBASE_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `WATSONX_API_KEY`, `WATSONX_URL`, `WATSONX_MODEL`, `WATSONX_PROJECT_ID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PROFESSIONAL`, `STRIPE_PRICE_PROFESSIONAL_ANNUAL`, `STRIPE_PRICE_AGENCY`, `STRIPE_PRICE_AGENCY_ANNUAL`, `STRIPE_PRICE_ENTERPRISE`, `STRIPE_PRICE_ENTERPRISE_ANNUAL`, `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`.
    - Dead in `.env.example` (unused in code): `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`. Missing from `.env.example` but used: `BACKEND_URL`, `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`. (README documents different Stripe var names than the code uses — code wins.)
  - Frontend (used in code): `VITE_API_URL`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_ADMIN_EMAIL`. (`VITE_STRIPE_PUBLISHABLE_KEY` is declared but never read.)

## 5. Project Map — audited 2026-07-17 (T-0.1)

> A short map so you don't re-scan everything each session. Routing: `frontend/src/App.jsx` (all routes, lazy-loaded).

- **Marketing / landing pages:** `frontend/src/pages/` — `Home.jsx` (697-line single-file landing: hero L389, stats bar L458, features L479, how-it-works L518, pricing preview L562, testimonials L622, CTA L660), `Pricing.jsx`, `About.jsx`, `Contact.jsx`, `FAQs.jsx`, `Developers.jsx`, `ApiDocs.jsx`, legal (`PrivacyPolicy.jsx`, `TermsOfService.jsx`, `CookiesPolicy.jsx`). `Blog.jsx` + `BlogPost.jsx` exist but are **dead — never routed**.
- **Report creation flow:** entirely inside `frontend/src/pages/Dashboard.jsx` (1,445 lines — largest file; view-switching via `activeView` state, not routes). 5-step wizard (`step` state, L344/L777+): claim info → property → loss details → photos → review. Upload → `reportsAPI.generate` (multipart) → backend `POST /api/reports/generate` (`backend/routes/reports.js:120`).
- **AI analysis code:** `backend/services/aiService.js` (report prompt `buildReportPrompt` L6-114, image analysis `analyzeImages` L253-278, quality heuristic `checkQuality` L329), `backend/config/watsonx.js`. Export generators: `backend/utils/properPdfGenerator.js`, `backend/utils/documentGenerator.js`.
- **Dashboard:** `frontend/src/pages/Dashboard.jsx` (reports list, generate wizard, billing view, post-Stripe polling L280-317). Enterprise variant: `EnterpriseDashboard.jsx` (1,071 lines).
- **Billing / subscription code:** backend `backend/routes/payment.js` (checkout, webhook, subscription, invoices) + `backend/config/tiers.js` (plan limits). Frontend `Subscriptions.jsx`, `Settings.jsx`, billing view in `Dashboard.jsx` L543+, checkout in `Pricing.jsx` L236.
- **Admin panel:** `frontend/src/pages/AdminDashboard.jsx` (717 lines) + `AdminTierUpdate.jsx`; backend admin routes in `backend/routes/sales.js` (`requireAdmin` = email match vs `ADMIN_EMAIL`, `sales.js:63`). White-label/enterprise: `WhiteLabelPortal.jsx`, `EnterpriseOnboarding.jsx`, `AcceptInvite.jsx`; backend `backend/routes/whitelabel.js`, `backend/routes/teams.js`. CRM: `frontend/src/pages/CRM.jsx` + `backend/routes/crm.js` + `backend/services/crmService.js`.
- **Shared UI components:** `frontend/src/components/` — used: `Navbar.jsx`, `Footer.jsx`, `ProtectedRoute.jsx`, `ErrorBoundary.jsx`, `TierBadge.jsx`. **Unused/dead:** `EmptyState.jsx`, `Modal.jsx`, `SkeletonLoader.jsx`, `ContactSalesModal.jsx` (Pricing.jsx reimplements its own local copy at L113).
- **API routes:** mounted in `backend/server.js:111-118` → `backend/routes/` (`auth.js`, `users.js`, `reports.js`, `payment.js`, `crm.js`, `teams.js`, `whitelabel.js`, `sales.js`). Frontend client: `frontend/src/services/api.js` (single axios instance, Firebase-token interceptor, grouped exports `authAPI`/`reportsAPI`/`usersAPI`/`paymentAPI`/`crmAPI`/`whiteLabelAPI`/`teamsAPI`/`salesAPI`).

### Known problem areas / tech debt (from T-0.1 audit)

**GOLDEN RULE VIOLATIONS (fix in Phase 1/2):**
- **Rule #1 — fabricated claims (site-wide):**
  - `Home.jsx:462-465` — fake stats: "10x Faster Reports", "50,000+ Reports Generated", "98% AI Accuracy" (animated counters). `Home.jsx:369-372` + L643-646 — 3 fabricated testimonials with invented names/companies (Marcus Johnson/Nationwide, Sarah Chen/Hartford TPA, David Rodriguez) + fake 5-star ratings. `Home.jsx:630` "Trusted by Insurance Professionals"; `Home.jsx:674` "Join thousands of insurance professionals".
  - `About.jsx:14` "trained on thousands of real claims"; `:19` **fake SOC 2 claim**; `:29` fake SLA guarantee; `:40-42` **fabricated team members** (Alex Morgan CEO, etc.); `:47-49` fake stats (50,000+ reports, 1,200+ customers, 99.9% uptime); `:91-97` invented origin story with fake metrics.
  - `Developers.jsx:87` fake SOC 2; `:150-152` fake API stats ("<2s", "99.9% Uptime SLA").
  - `FAQs.jsx:86` fake SOC 2 Type II claim (also claims MongoDB Atlas — not even in the stack); `PrivacyPolicy.jsx:82` fake SOC 2/ISO 27001 (also MongoDB Atlas).
  - `Blog.jsx:40-41,158,169,261,268-288` — fabricated study data/statistics (dead page, but delete or fix).
  - `Footer.jsx:101` "Microsoft" powered-by badge (stack is WatsonX+OpenAI); `:155` hardcoded "All systems operational" status dot.
- **Rule #2 — AI gives definitive verdicts:** `backend/services/aiService.js:53-61` prompt demands "most probable cause" + **"Coverage analysis: whether this loss is covered"**; `:84-91` + `:129-142` demand real calculated dollar amounts ("Do NOT use placeholder values"); `:104-108` "Coverage determination notes" + AI-authored "Adjuster certification statement"; `:256,263` declares severity incl. "Total Loss"; `:258,275` structural/mold verdicts from photos. Zero cautious language anywhere. Also auto-inserted certification text: `properPdfGenerator.js:389-397`, `documentGenerator.js:192-194` ("I certify that the information… is accurate"). Sample copy with verdicts: `Home.jsx:16,18`, `Dashboard.jsx:84`.
- **Rule #3 — no human-review gate:** `backend/routes/reports.js:120-156` writes AI output straight to the report with `status: 'completed'`, immediately exportable. Frontend preview is read-only (`Dashboard.jsx:1050-1162`, `EnterpriseDashboard.jsx:618-673`) — no accept/reject/edit step exists.
- **Rule #5:** no violation found (no marketing-consent checkboxes exist at all yet — signup has none, contact forms have none).

**Security:**
- `/uploads` served publicly, no auth (`server.js:84`) — claim photos world-readable at predictable paths. No signed URLs (Rule #6).
- Render has **no persistent disk** — all uploads/exports lost on every deploy/restart; Firestore `imagePaths` go dangling.
- `firestore.rules:15` hardcodes admin as `admin@flacronai.com` but the real admin is `admin@flacronenterprises.com` — rules-level admin grants point at the wrong account.
- `reports.js:355` returns `err.stack` to clients. `server.js:32` CORS allows all origins in development mode. Custom JWTs (7-day) can't be revoked on logout (`auth.js:128`). `.env.example:6` ships placeholder `JWT_SECRET`.
- `/admin` and `/admin-tier-update` frontend routes gated only client-side (`AdminDashboard.jsx:390-396` email check via `VITE_ADMIN_EMAIL`); real protection depends on backend `requireAdmin` — verify each admin endpoint has it.
- Upload mimetype checks trust the client-supplied type (multer allowlists only).

**Broken / dead / stale:**
- Deprecated OpenAI models will fail: `gpt-4-vision-preview` (`aiService.js:246`), `gpt-4-turbo-preview` (`aiService.js:154,191,306,320,366`).
- `trackApiUsage` middleware never mounted → `apiUsage` never written → API-usage analytics endpoints (`users.js:240,250`) always return empty.
- Unused heavy deps (installed, zero imports): `three` + `@react-three/*`, `chart.js` + `react-chartjs-2`, `date-fns`, `@stripe/stripe-js` + `@stripe/react-stripe-js`. Backend: `crypto` npm placeholder package in `package.json:33` (should be removed; code uses the built-in).
- Dead pages/components: `Blog.jsx`, `BlogPost.jsx`, `EmptyState.jsx`, `Modal.jsx`, `SkeletonLoader.jsx`, `ContactSalesModal.jsx`. Dead imports: `optionalAuth` in `users.js:8`, `whitelabel.js:9`.
- `frontend/public/` doesn't exist: **no robots.txt, no sitemap.xml, and `/favicon.svg` referenced by index.html 404s**. No per-page meta (no react-helmet; `document.title` never set) — every page shares one static title/description.

**Content bugs (found in T-0.2 baseline):**
- Home pricing preview (`Home.jsx` pricing section) understates actual plans: shows Professional "20 reports/month" and Agency "100 reports/month", but `backend/config/tiers.js` grants 50 and 200. Rule #4-adjacent (displayed features must match reality) → fix in T-1.8.
- Marketing sections use framer-motion `whileInView` — content is invisible (opacity 0) until scrolled into view; contributes to the "empty space" complaint and stats counters read "0x/0+/0%" until triggered.

**Fragility / scaling:**
- In-memory pagination over full collections: `reports.js:171`, `sales.js:77,159,200`, `crmService.js:8,137` — O(n) reads per request.
- 24h download-link "expiry" advertised (`reports.js:349`) but never enforced.
- API base falls back to `http://localhost:3000/api` if `VITE_API_URL` unset (`services/api.js:5`).
- Post-checkout tier confirmation polls for the webhook up to 20s (`Dashboard.jsx:280-317`) — race surfaced to user.
- `reportsAPI.getDownloadUrl` returns an unauthenticated URL that can't work without a token; `GET /api/reports/ai-status` is public and shares the 10/min AI rate-limit bucket.

## 6. Design & Brand direction — FILL/REFINE DURING Phase 1

- "Not AI-looking" means: intentional layout, real content, consistent spacing system, a distinct brand palette + type pairing, custom illustrations/screenshots over generic stock, no default template gradients/emoji-icons. See TASKS.md T-1.x.
- Brand tokens (defined T-1.2): **single source of truth = `frontend/tailwind.config.js`** (scales `brand` = logo orange `#FD4403`, `navy` = logo navy `#002A64` — both sampled from the client's logo PNGs; semantic aliases `primary`/`primary-hover`/`primary-soft`/`ink`/`bg`/`surface`/`border`; radii `rounded-btn`/`rounded-card`; shadows `shadow-btn`/`shadow-card`). Type pairing: **Space Grotesk** (`font-display`, applied to h1–h4 globally) + **Inter** body (`font-sans`), loaded in `index.html`. Raw-CSS consumers use `--brand-orange`/`--brand-navy` vars in `src/index.css :root` (keep in sync with config). Shared component classes (`btn-primary`, `card`, `input`, `gradient-text`, …) consume tokens — new components must use tokens, not raw hex. NOTE: Tailwind config changes need a dev-server restart (JIT reads config at startup).
- Logo files location (T-1.3): `frontend/public/` — client originals `logo-light.png` / `logo-dark.png`; derived assets `logo-mark.png` (icon-only FA mark, transparent, use this in UI via `<img src="/logo-mark.png">`), `favicon-32.png` / `favicon-64.png`, `apple-touch-icon.png`, `og-image.png` (1200×630 for social meta). The old inline `Zap` placeholder logo is gone. Brevo email-template logos are managed in the Brevo dashboard (not repo). SVG originals still wanted from client.

## 7. SEO baseline (applies to every page — checklist)

Every user-facing page must have: unique `<title>` + meta description, one `<h1>`, semantic headings, canonical URL, Open Graph + Twitter tags, descriptive `alt` on images, sensible URL slug, and be in the sitemap. Site-wide: `sitemap.xml`, `robots.txt`, structured data (JSON-LD) where relevant (Organization, Product/Offer for pricing, FAQ), fast LCP, mobile-friendly. Details in TASKS.md Phase 1 SEO tasks.

---

## 8. Definition of Done (site-wide)

A task is "done" only when: acceptance criteria met, QA checklist passed **and actually tested**, no console/server errors introduced, responsive on mobile, no Golden Rule violated, and PROGRESS.md updated.
