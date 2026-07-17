# PROGRESS.md — Living Tracker

> Update this after EVERY micro-task. This is your memory. Newest changelog entry goes on top.
> Status values: `TODO` · `IN-PROGRESS` · `BLOCKED` · `QA` · `DONE`

---

## Current focus
- **Now working on:** — (T-1.1 done, awaiting next prompt)
- **Next up:** T-1.2 (brand design tokens)
- **Branch:** all work on `flacron/improvements` (Golden Rule #8) — never push to main.

---

## Status board

### Phase 0 — Audit & Setup
| Task | Title | Status | Notes |
|------|-------|--------|-------|
| T-0.1 | Full project audit + fill CLAUDE.md | DONE | 2026-07-17 — CLAUDE.md §4/§5/§6 filled; see changelog |
| T-0.2 | Get app running locally + baseline screenshots | DONE | 2026-07-17 — 26 screenshots in docs/baseline/; public routes only (need creds for authed pages) |
| T-0.3 | Add lint/format/test scaffolding if missing | DONE | 2026-07-17 — ESLint+Prettier+tests both packages; all commands green |

### Phase 1 — Website & Conversion + Brand + SEO
| Task | Title | Status | Notes |
|------|-------|--------|-------|
| T-1.1 | Remove unverified claims | DONE | 2026-07-17 — all fake stats/testimonials/certs stripped from live pages; Blog.jsx (dead page) pending open question |
| T-1.2 | Define brand tokens (color/type/spacing) | TODO | |
| T-1.3 | Logo update + favicon set | TODO | client HAS final logo files — collect them |
| T-1.4 | Hero section rebuild | TODO | |
| T-1.5 | Bigger product screenshot / demo | TODO | |
| T-1.6 | Sample report preview + download | TODO | |
| T-1.7 | CTAs + trust bar | TODO | |
| T-1.8 | Pricing display rebuild | TODO | |
| T-1.9 | Testimonials/social proof (real only) | TODO | |
| T-1.10 | "De-AI" pass on all landing pages | TODO | |
| T-1.11 | Mobile layout pass (marketing) | TODO | |
| T-1.12 | SEO: per-page meta + headings | TODO | |
| T-1.13 | SEO: sitemap, robots, canonical | TODO | |
| T-1.14 | SEO: structured data (JSON-LD) | TODO | |
| T-1.15 | SEO: performance + image optimization | TODO | |
| T-1.16 | Opt-in / lead-capture forms | TODO | consent-based |

### Phase 2 — Core Reporting Platform
| Task | Title | Status | Notes |
|------|-------|--------|-------|
| T-2.x | See TASKS.md | TODO | |

### Phase 3 — Subscription & Operations
| Task | Title | Status | Notes |
|------|-------|--------|-------|
| T-3.x | See TASKS.md | TODO | |

### Phase 4 — Marketing & Growth Automation
| Task | Title | Status | Notes |
|------|-------|--------|-------|
| T-4.x | See TASKS.md | TODO | |

### Phase 5 — Enterprise & API
| Task | Title | Status | Notes |
|------|-------|--------|-------|
| T-5.x | See TASKS.md | TODO | |

---

## Changelog (newest on top)

<!--
Template for each entry — copy this block:

### [DATE] — T-X.Y — <title>
- **Status:** DONE / BLOCKED / QA
- **What changed:** short summary
- **Files touched:** path/one, path/two
- **QA done:** what you actually tested + result
- **Left / follow-ups:** anything not finished
- **Golden-rule check:** confirmed none violated
-->

### [2026-07-17] — T-1.1 — Remove unverified claims (Golden Rule #1)
- **Status:** DONE
- **What changed (all on live, routed pages):**
  - **Home.jsx** — stats bar's fake counters (10x faster / 50,000+ reports / 98% AI accuracy) replaced with verifiable product facts (100 photos per report — multer cap; 9 report sections — AI prompt; 3 export formats — tiers.js; 4 subscription tiers). Deleted the entire fabricated-testimonials section (3 invented people + fake 5-star ratings + "Trusted by Insurance Professionals" heading). CTA "Join thousands of insurance professionals" → honest review-first copy. Hero trust line "1 report free/month" → "5 reports free/month" and pricing-preview counts 1/20/100 → 5/50/200 (matches server-enforced `tiers.js`).
  - **About.jsx** — deleted fabricated TEAM (Alex Morgan/Sarah Chen/Marcus Davis) and STATS (50,000+/1,200+/99.9%/Founded 2023); replaced the invented Brooklyn origin story (fake people, fake 3.8h metric, fake launch date) with an honest "Why FlacronAI Exists" section; removed SOC 2 claim, SLA-guarantee claim, "trained on thousands of real claims"; H1 "Built by Adjusters, For Adjusters" (unverifiable) → "Give Adjusters Their Time Back"; "four steps" → five (matches the actual wizard).
  - **Developers.jsx** — removed SOC 2 claim; fake stats (20+ endpoints, <2s response, 99.9% uptime SLA) → verifiable facts (2 auth methods, 3 export formats, 100 photos, JSON); **Webhooks feature card removed** (advertised `report.completed` events that don't exist — Rule #4) → replaced with real Multi-Format Export card; rate-limit copy now states the real limits (100 req/15min global, 10 req/min AI); removed "per-key usage tracking" (broken — trackApiUsage never mounted).
  - **FAQs.jsx** — security answer rewritten (was: MongoDB Atlas [not in stack] + SOC 2 Type II); removed Enterprise "custom AI training" (doesn't exist).
  - **PrivacyPolicy.jsx** — removed SOC 2/ISO 27001 badges + MongoDB Atlas + "certificate pinning" + AES-256/TLS-1.3 specifics; now states only what's true (Firestore encrypted at rest by GCP, HTTPS in transit); dropped unverifiable employee-access-logging claim.
  - **Pricing.jsx** — removed "Custom AI training" rows (fake feature) and the fake "AI Model: Standard vs Advanced" tier differentiation (all tiers use the same models); "Basic/Advanced AI report generation" → "AI report generation"; fixed inverted watermark row ("FlacronAI watermark ✗" implied starter had none — now "Watermark-free reports ✗").
  - **Footer.jsx** — removed fake "Microsoft" powered-by badge and the hardcoded "All systems operational" status dot.
  - **NOT touched:** displayed prices (conflicting $149.99/$299.99 vs $99.99/$499 — see Open Questions; Stripe env is the source of truth); Blog.jsx/BlogPost.jsx (dead, unrouted — pending keep/delete answer); sample claim data in Dashboard/EnterpriseDashboard (Rule #2 wording — Phase 2 scope).
- **Files touched:** frontend/src/pages/{Home,About,Developers,FAQs,PrivacyPolicy,Pricing}.jsx, frontend/src/components/Footer.jsx.
- **QA done:** grep for all banned numbers/phrases (50,000 / 98% / 10x / thousands / SOC 2 / ISO 27001 / MongoDB / Microsoft / testimonial names / 99.9 / "systems operational" / "custom AI training" / "Advanced AI") → clean outside dead Blog.jsx; ESLint 0 errors (warning count went down 37→36); Vitest 2/2 pass; app run locally, all routes screenshotted desktop+mobile with 0 console errors (QA shots in E:/claude-scratch/t11-qa/, baseline in docs/baseline/ left untouched as the "before" record); visually verified Home, About, Pricing.
- **Left / follow-ups:** prices + "~60 seconds" + "CRU GROUP-standard" open questions (above); testimonials section removal leaves no social proof — T-1.9 will add real trust signals; Developers.jsx export card still uses the Webhook icon (cosmetic, T-1.10).
- **Golden-rule check:** #1 is the task itself; #4 improved (fake features removed, displayed limits now match server enforcement); no rules broken.

### [2026-07-17] — T-0.3 — Tooling scaffold (lint / format / test)
- **Status:** DONE
- **What changed:** Added minimal lint/format/test tooling to both packages, no application code touched.
  - **ESLint**: flat configs (`backend/eslint.config.js` ESLint 10; `frontend/eslint.config.js` ESLint 9 + eslint-plugin-react + react-hooks — the react plugin doesn't support ESLint 10 yet). Pre-existing issue classes downgraded to warnings (`no-unused-vars`, `no-empty`, `preserve-caught-error`, `exhaustive-deps`, and frontend uses classic hooks rules instead of the v7 compiler preset) so `lint` exits 0 today; ratchet back to errors as code is cleaned per-task.
  - **Prettier**: shared `.prettierrc` + `.prettierignore` at repo root; `format`/`format:check` scripts in both packages. Repo-wide `--write` deliberately NOT run (would touch ~57 files — huge noisy diff vs baseline).
  - **Tests**: backend `npm test` = node built-in runner; first real suite `backend/test/tiers.test.js` (6 tests — entitlement logic: plan limits 5/50/200/unlimited, `canGenerate` blocking at limit, tier fallback/ordering). Frontend `npm test` = Vitest 3 (`vitest run`); first suite `src/__tests__/config.test.js` (2 tests — dev port + API proxy). Vitest 4 was tried and reverted: needs rolldown native bindings (broken by npm optional-deps bug) and pairs with Vite 6, not our Vite 5.
- **Files touched:** backend/package.json, backend/eslint.config.js (new), backend/test/tiers.test.js (new), frontend/package.json, frontend/eslint.config.js (new), frontend/src/__tests__/config.test.js (new), .prettierrc (new), .prettierignore (new), CLAUDE.md §4, PROGRESS.md, both package-lock.json. Also swept into this commit (not created by me): `frontend/public/logo-light.png` + `logo-dark.png` — client logo assets that appeared in the working tree; kept, they're the T-1.3 inputs.
- **QA done (all commands actually run):** backend — `npm test` 6/6 pass, `npm run lint` exit 0 (41 warnings, 0 errors), prettier write verified on new files. Frontend — `npm test` 2/2 pass, `npm run lint` exit 0 (37 warnings, 0 errors), `format:check` runs (reports 36 pre-existing unformatted files, as expected).
- **Left / follow-ups:** warning count (~78) to be burned down task-by-task; repo-wide format pass deferred (decide whether to do it as a standalone commit); npm on this machine needs `--cache E:/.npm-cache` + retries (flaky network, full C: drive).
- **Golden-rule check:** none violated (tooling only; test suite actually *protects* Rule #4 — it pins server-side plan limits).

### [2026-07-17] — T-0.2 — Run locally + baseline screenshots
- **Status:** DONE
- **What changed:** Both dev servers run locally (backend Express on :3000 via `npm run dev`, healthy `/health`; frontend Vite on :5173). Captured **26 baseline screenshots** — 13 routes × desktop (1440px) + mobile (390px) — to `docs/baseline/` (all public routes, 404 page, and `/dashboard` which correctly redirects to `/auth`). Per-route console-error/network-failure log saved to `docs/baseline/baseline-results.json`. Also: `backend/package-lock.json` regenerated by `npm install` — the committed lockfile was stale (contained `nodemailer` + `puppeteer`, which are not in package.json).
- **Files touched:** docs/baseline/* (new), backend/package-lock.json (lockfile sync), CLAUDE.md (§5 content-bugs note), PROGRESS.md. No application code changed.
- **QA done:** Every route loaded without fatal error; **zero console errors and zero failed requests** across all 26 captures. `/dashboard` redirect verified. Visually inspected home desktop + mobile and pricing — pages render correctly after scroll (see findings).
- **Left / follow-ups / broken things found:**
  - **Pricing content bug:** home pricing preview shows Professional "20 reports/month" / Agency "100 reports/month" but `backend/config/tiers.js` grants 50/200 → fix in T-1.8.
  - **whileInView issue:** marketing sections are opacity-0 until scrolled (framer-motion `whileInView`) — contributes to "empty space" complaint; stats counters read "0x/0+/0%" before triggering. Address in T-1.4/T-1.10.
  - **Authed pages not baselined** (dashboard, subscriptions, settings, CRM, admin, enterprise) — need test credentials or approval to create a test account (see Open Questions).
  - Environment notes: local backend `.env` runs `NODE_ENV=production`; dev machine's C: drive is nearly full (npm cache cleaned, ~2 GB freed, npm cache for this project now at `E:/.npm-cache`); baseline script kept at `E:/claude-scratch/baseline.js` for re-runs.
- **Golden-rule check:** none violated (no app code changed; screenshots document existing violations for Phase 1).

### [2026-07-17] — T-0.1 — Full project audit
- **Status:** DONE
- **What changed:** Documentation only — no application code touched. Scanned the full repo (backend routes/services/middleware/config, all frontend pages/components, deploy configs). Filled CLAUDE.md §4 (Tech Stack: React 18 + Vite + Tailwind SPA on Vercel; Express 4 + Firestore on Render; Firebase Auth + custom-JWT fallback; **Stripe Checkout Sessions `mode: 'subscription'` with a signature-verified, idempotent webhook** handling checkout.session.completed / subscription.deleted / invoice.payment_failed / subscription.updated; WatsonX primary + OpenAI fallback with GPT-4-Vision image analysis via base64; local-disk file storage; Brevo email, no SMS; npm, **no lint/test tooling**), §5 (Project Map + full Known-issues list), §6 (logo: none exists — inline Zap icon, favicon 404s).
- **Files touched:** CLAUDE.md, PROGRESS.md (docs only).
- **QA done:** Re-read CLAUDE.md §4/§5 against agent findings; env-var names cross-checked between `.env.example`, README, and actual `process.env` usage (they disagree — code-truth recorded, discrepancies noted). All Golden-Rule violations recorded with file:line.
- **Left / follow-ups:** Key findings for upcoming tasks:
  - **Golden Rule #1 violations everywhere** (Home, About, Developers, FAQs, PrivacyPolicy, Footer, dead Blog): fake stats (50,000+ reports, 98% accuracy, 10x faster, 1,200+ customers, 99.9% uptime), 3 invented testimonials, invented team members, fake SOC 2 / ISO 27001 claims, "Microsoft" powered-by badge → T-1.1.
  - **Golden Rule #2 violated by design**: AI prompt (`backend/services/aiService.js`) demands coverage determinations, cause-of-loss, real dollar amounts, and an AI-authored adjuster certification → Phase 2 (T-2.5).
  - **Golden Rule #3 violated**: AI output saved as `status: 'completed'` with no accept/reject/edit gate → Phase 2 (T-2.6/2.7).
  - **Security**: `/uploads` publicly served without auth (claim photos!); Render has no persistent disk (uploads lost on deploy); firestore.rules admin email points at wrong account → Phase 3 (T-3.10), but the public-uploads issue may deserve earlier attention.
  - **Broken**: deprecated OpenAI model IDs (`gpt-4-vision-preview`, `gpt-4-turbo-preview`) — fallback + image analysis will fail; API-usage tracking never mounted (analytics always empty).
- **Golden-rule check:** none violated by this task (audit only; violations found were documented, not shipped).

---

## Open Questions (ask the human — don't guess)

- [x] Tech stack unknown until audit. → **Resolved 2026-07-17**: see CLAUDE.md §4.
- [x] Logo/brand assets: **partially received 2026-07-17** — `frontend/public/logo-light.png` + `logo-dark.png` appeared in the working tree (client's "FA" mark, orange #F1531F-ish + navy, with taglines; committed in 5c5435a). Still needed for T-1.3: **SVG or transparent-background versions, an icon-only mark (for favicon/app icons), and a version without the tagline** — the dark PNG has a baked-in busy background that can't go in a header.
- [x] Payment provider: **Stripe**. → **Resolved 2026-07-17**: Stripe **Checkout Sessions, `mode: 'subscription'`**; webhook wired + signature-verified + idempotent; events handled: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`, `customer.subscription.updated` (see CLAUDE.md §4).
- [ ] Is there real usage data we ARE allowed to display (e.g. real avg generation time)?
- [ ] **Admin email mismatch:** `firestore.rules` hardcodes `admin@flacronai.com`, but env/actual admin is `admin@flacronenterprises.com`. Which address is the real admin account? (Affects T-3.x fixes.)
- [ ] **Is production AI currently working?** Both OpenAI model IDs in code are retired (`gpt-4-vision-preview`, `gpt-4-turbo-preview`) — image analysis and the WatsonX-fallback path should be failing. Is WatsonX alone carrying prod today? Which models should we target when we fix this?
- [ ] **Are production uploads being lost?** Render has no persistent disk and files are stored locally — every deploy wipes uploads/exports. Should we plan a move to cloud storage (Firebase Storage / S3) as an early task, and is any user data already dangling?
- [ ] **Public `/uploads` exposure:** claim photos are world-readable at guessable URLs today (Golden Rule #6 risk in production NOW). OK to prioritize locking this down ahead of the normal Phase 3 order?
- [ ] Blog pages (`Blog.jsx`, `BlogPost.jsx`) are built but never routed — keep + fix content (currently has fabricated study data) or delete?
- [ ] **Test account for authed baselines:** provide test login credentials (or approve creating a dedicated test account) so dashboard/subscriptions/settings/CRM/admin/enterprise pages can be baselined. Signup sends a real verification email via Brevo and writes to the live Firebase project, so I didn't create one unilaterally.
- [ ] **Pricing PRICE conflict (report counts now fixed):** report counts were aligned to the server-enforced `tiers.js` values (5/50/200/unlimited) in T-1.1. But **prices still disagree**: Agency is **$99.99/mo** on Home, FAQs, Subscriptions, AdminTierUpdate and in `tiers.js`, yet **$149.99/mo** on the Pricing page; Enterprise is **$499/mo** everywhere except the Pricing page's **$299.99/mo**. The real charge comes from the Stripe Price IDs in env (not visible in the repo). Which prices are live in Stripe? (Blocks final numbers for T-1.8; I did NOT touch any displayed price.)
- [ ] **"~60 seconds" generation-time claim:** Home features/how-it-works say a full report takes ~60s. Plausible but unmeasured — keep only if we can verify with real timings (could measure in T-2.x once AI models are fixed).
- [ ] **"CRU GROUP-standard" wording** (Home hero, feature card, footer tagline): is the report template actually built to a CRU Group standard, or is this aspirational? If unverifiable it should be reworded (Golden Rule #1).

---

## Remaining / Nice-to-have backlog (not scheduled yet)

- (add ideas here as they surface during work)
