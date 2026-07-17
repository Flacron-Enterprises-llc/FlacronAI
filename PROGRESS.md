# PROGRESS.md — Living Tracker

> Update this after EVERY micro-task. This is your memory. Newest changelog entry goes on top.
> Status values: `TODO` · `IN-PROGRESS` · `BLOCKED` · `QA` · `DONE`

---

## Current focus
- **Now working on:** — (Phase 0 complete, awaiting next prompt)
- **Next up:** Phase 1 (T-1.1 remove unverified claims is first)
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
| T-1.1 | Remove unverified claims | TODO | Golden Rule #1 |
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
- [ ] **Pricing copy conflict:** home preview says Professional = 20 reports/mo, Agency = 100; backend `tiers.js` says 50/200; README says 50/200. Which numbers are the intended offer? (Needed for T-1.8.)

---

## Remaining / Nice-to-have backlog (not scheduled yet)

- (add ideas here as they surface during work)
