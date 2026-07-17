# PROGRESS.md — Living Tracker

> Update this after EVERY micro-task. This is your memory. Newest changelog entry goes on top.
> Status values: `TODO` · `IN-PROGRESS` · `BLOCKED` · `QA` · `DONE`

---

## Current focus
- **Now working on:** — (T-1.13 done, awaiting next prompt)
- **Next up:** T-1.14 (JSON-LD structured data); T-1.8 still BLOCKED on price answer
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
| T-1.2 | Define brand tokens (color/type/spacing) | DONE | 2026-07-17 — tokens in tailwind.config.js from logo colors (#FD4403/#002A64) + Space Grotesk/Inter pairing |
| T-1.3 | Logo update + favicon set | DONE | 2026-07-17 — FA mark extracted from client PNG; favicons + apple-touch + og-image generated; Zap placeholder gone. Vector originals still wanted (see Open Questions) |
| T-1.4 | Hero section rebuild | DONE | 2026-07-17 — new H1/positioning/CTAs/trust line; "View Sample Report" CTA deferred to T-1.6 |
| T-1.5 | Bigger product screenshot / demo | DONE | 2026-07-17 — real dashboard-wizard screenshot (WebP 76KB, retina) in new showcase section |
| T-1.6 | Sample report preview + download | DONE | 2026-07-17 — cautious-language sample PDF; hero CTA swapped to "View Sample Report"; regenerable via backend/scripts/make-sample-report.js |
| T-1.7 | CTAs + trust bar | DONE | 2026-07-17 — broken /api-docs CTA fixed; all internal links verified; honest security strip added (no badges) |
| T-1.8 | Pricing display rebuild | BLOCKED | waiting on client: which prices are live in Stripe (see Open Questions) |
| T-1.9 | Testimonials/social proof (real only) | DONE | 2026-07-17 — section hidden until real entries added to src/data/testimonials.js; card supports full schema |
| T-1.10 | "De-AI" pass on all landing pages | TODO | |
| T-1.11 | Mobile layout pass (marketing) | TODO | |
| T-1.12 | SEO: per-page meta + headings | DONE | 2026-07-17 — Seo component on all 13 public pages; unique titles/desc/canonical/OG; 1 h1 each; audit clean |
| T-1.13 | SEO: sitemap, robots, canonical | DONE | 2026-07-17 — robots.txt + sitemap.xml (10 public URLs); 404 now noindex + soft-404 canonical dropped |
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

### [2026-07-17] — T-1.13 — SEO technical base (sitemap / robots / 404)
- **Status:** DONE
- **What changed:**
  - **`frontend/public/robots.txt` (new):** allows crawl of all public pages; `Disallow`s every gated app/admin route (`/dashboard`, `/subscriptions`, `/settings`, `/crm`, `/white-label`, `/admin`, `/admin-tier-update`, `/enterprise-dashboard`, `/enterprise/`, `/invite/`, `/auth`); points to the sitemap.
  - **`frontend/public/sitemap.xml` (new):** 10 indexable public URLs only (matches the `index,follow` set from T-1.12) with sensible priority/changefreq — Home 1.0, Pricing 0.9, Developers/ApiDocs 0.8, About/FAQs/Contact 0.6, legal 0.3. Excludes noindex/gated/dynamic routes.
  - **Soft-404 fix (the real SEO issue in a SPA):** Vercel rewrites all paths → `index.html` with HTTP 200, so unknown URLs render the 404 view but return 200 ("soft 404"), which Google may index. Mounted `<Seo … path={null} noindex />` on the catch-all route: 404s now emit `robots: noindex,nofollow`. Enhanced the Seo component with a `path={null}` mode that **also removes any canonical** left over from the previously-viewed page (so a 404 reached from /pricing doesn't inherit /pricing's canonical).
  - Static files verified to be copied into `dist/` by the Vite build; Vercel serves `public/` files ahead of the SPA rewrite, so `/robots.txt` and `/sitemap.xml` resolve in prod.
- **Files touched:** frontend/public/robots.txt (new), frontend/public/sitemap.xml (new), frontend/src/components/Seo.jsx (path=null handling), frontend/src/App.jsx (Seo on 404).
- **QA done:** dev server serves /robots.txt (text/plain 200) and /sitemap.xml (text/xml 200); sitemap parsed as valid XML with 10 `<url>` nodes; navigated /pricing → /(bad url) and confirmed 404 sets `noindex,nofollow` AND canonical was removed (was /pricing's); both files present in `dist/` after build; lint 0 errors; Vitest 2/2; build passes.
- **Left / follow-ups:** update `sitemap.xml` `lastmod` / add rows when new public pages ship (e.g. if Blog is revived); if a blog launches, consider a dynamic sitemap. Canonical domain assumed `https://flacronai.com` (confirm www vs non-www with client if it matters for canonicalization).
- **Golden-rule check:** none applicable (technical SEO only).

### [2026-07-17] — T-1.12 — SEO on-page (per page)
- **Status:** DONE
- **What changed:**
  - **`frontend/src/components/Seo.jsx` (new):** dependency-free per-page SEO component (no react-helmet — avoided a new npm dep on this flaky network). Sets: `document.title`, meta description, `robots` (index/follow or noindex for auth/app pages), canonical link (`https://flacronai.com` + path), full OG set (site_name/type/title/description/url/image → the T-1.3 `og-image.png`), Twitter card tags. Upserts tags so SPA navigation always overwrites the previous page's values.
  - **Mounted on all 13 public pages** with unique, honest titles + descriptions: Home, Pricing, About, Contact, FAQs, Developers, ApiDocs, Auth (noindex), the 3 legal pages, EnterpriseOnboarding (noindex), AcceptInvite (noindex).
  - **H1 fixes:** Auth had zero h1 → added an `sr-only` h1 (visible design unchanged). All other pages already had exactly one.
  - **Bonus Rule #1/#4 copy fixes found while editing FAQs** (missed by T-1.1's keyword grep): removed nonexistent "email notification when your report is ready"; replaced invented per-tier API rate limits (60/min + 2,000/day / 200/min) with the real ones (100 per 15 min global, 10/min AI); "proprietary AI models" → truthful IBM watsonx + OpenAI description; removed unsupported "custom domain with SSL" white-label claim (backend supports subdomains only); "carrier-compliant" → "consistently structured… ready for your review".
- **Files touched:** frontend/src/components/Seo.jsx (new), all 13 public page files (Seo mount), FAQs.jsx (copy), Auth.jsx (h1 + Seo placement fix — first insert landed in the verify-email branch only).
- **QA done:** automated audit over the 11 crawlable pages — unique title ✓, unique description ✓, correct canonical ✓, exactly one h1 ✓, zero imgs missing alt ✓, auth correctly `noindex` ✓ ("ALL SEO CHECKS PASS" after the /auth fix); lint 0 errors; Vitest 2/2; build passes.
- **Left / follow-ups:** SPA caveat — tags are set client-side; Google renders JS fine but other crawlers may not. If social-share previews matter per-page, consider prerendering or moving og tags server-side later. Sitemap/robots = T-1.13; JSON-LD = T-1.14.
- **Golden-rule check:** #1/#4 improved further (five more false claims removed); no new claims introduced.

### [2026-07-17] — T-1.9 — Testimonials (real only) — done out of order; T-1.8 blocked
- **Status:** DONE (T-1.8 skipped — BLOCKED on the price-conflict open question)
- **What changed:**
  - **`frontend/src/data/testimonials.js` (new):** single data source for testimonials, currently an **empty array**, with the schema documented in comments (name/initials, role, reportType, benefit verbatim, `verified` only when written approval is on file, date, optional rating) and an explicit Golden-Rule-#1 warning. No carrier names without written authorization.
  - **`Home.jsx`:** "What Customers Say" section renders **only when the array has entries** — with zero real testimonials today, the section is completely absent from the DOM (acceptance's "hide the section" path). Card layout supports every schema field: star rating (optional), quote, name, role · report type, green "Verified" label, date.
- **Files touched:** frontend/src/data/testimonials.js (new), frontend/src/pages/Home.jsx.
- **QA done:** empty array → section absent from DOM (verified programmatically); temp QA entry added locally → card renders all fields correctly (screenshot E:/claude-scratch/t19-qa/) → **temp entry reverted before commit** (grep-verified); 0 console errors; lint 0 errors; Vitest 2/2; build passes.
- **Left / follow-ups:** **client to collect real, written-approved customer feedback** — added to Open Questions. When entries land, consider showing the section on Pricing too.
- **Golden-rule check:** #1 ✓ — zero invented people; section invisible until real data exists.

### [2026-07-17] — T-1.7 — CTAs + trust/security strip
- **Status:** DONE
- **What changed:**
  - **CTA consistency + bug fixes:**
    - `Developers.jsx` — **both "View API Docs" CTAs navigated to `/api-docs`, which doesn't exist (404)**; fixed to the real route `/docs/api` (click-tested). Also removed a leftover "webhooks" promise in the hero copy (feature doesn't exist — missed in T-1.1).
    - `About.jsx` — "Get Started Free" was a plain `<a href="/auth">` (full page reload, landed on sign-IN); now a router `Link` to `/auth?mode=signup` like every other signup CTA.
    - `FAQs.jsx` — "Contact Support" plain anchor → router `Link`.
    - `Home.jsx` pricing-preview highlight button had raw `orange-500` + dark-on-orange text; now `bg-primary` tokens with white text (matches `btn-primary` everywhere else).
    - Signup CTAs now uniformly route to `/auth?mode=signup`; plan CTAs to `/pricing`; sales CTAs to `/contact`.
  - **New trust/security strip** on Home ("Security, Stated Plainly", before the CTA banner): four cards, each a verifiable fact — HTTPS in transit, Firebase Authentication (passwords never stored by FlacronAI), Stripe-hosted checkout (card data never touches our servers), server-side plan enforcement (noting it's covered by the T-0.3 automated tests). Subheading explicitly says "no badge wall". **Zero compliance badges** (Golden Rule #6). Deliberately says nothing about file/photo storage — that story isn't good yet (public /uploads, Phase 3).
- **Files touched:** frontend/src/pages/{Home,About,Developers,FAQs}.jsx, PROGRESS.md.
- **QA done:** automated link audit across 7 marketing pages — every internal href resolves to a real route ("ALL INTERNAL LINKS RESOLVE"); Developers CTA click-tested → lands on `/docs/api`; trust strip screenshot verified (E:/claude-scratch/t17-qa/); 0 console errors; lint 0 errors; Vitest 2/2; build passes.
- **Left / follow-ups:** trust strip could later gain a "how we store claim data" card once Phase 3 fixes storage; nav "Docs" dropdown wording could align with CTA labels in T-1.10.
- **Golden-rule check:** #6 ✓ (no badges, only true facts); #1 ✓ (removed the lingering webhooks claim); #4 ✓ (no non-functional feature promised).

### [2026-07-17] — T-1.6 — Sample report preview + download
- **Status:** DONE
- **What changed:**
  - **`frontend/public/sample-report.pdf`** (10 KB, 5 pages) — a branded sample inspection report (Wind/Hail, same fictional claim as the T-1.5 screenshot for consistency). Structure mirrors the real generator's 9 sections (`properPdfGenerator.js`), but the content **models the post-Phase-2 target language**: every observation is cautious ("appears consistent with…", "cannot be assessed from photos", "technician evaluation recommended"), costs are preliminary ranges labeled "not a settlement recommendation", **coverage analysis is explicitly declared out of scope** ("a determination made by the carrier… not by this report or by FlacronAI"), and the auto-"Adjuster Certification" of the real generator is replaced by a **"Review & Approval" block** (licensed-adjuster signature). Every page carries a navy header bar + diagonal SAMPLE watermark + "fictional data" disclaimers.
  - **Deliberately NOT generated via `aiService`/`properPdfGenerator`:** the live AI prompts still demand verdicts and the PDF generator hard-codes the certification page (both Phase-2 fixes) — running them would have produced a Golden-Rule-#2-violating sample. Instead: `backend/scripts/make-sample-report.js` (committed) builds the PDF with pdfkit mirroring the real layout; re-run it after content tweaks (`node scripts/make-sample-report.js` from `backend/`).
  - **Home.jsx:** hero secondary CTA is now **"View Sample Report"** (opens PDF in new tab — completes the T-1.4 deferral); showcase section gained a "Download the sample report (PDF)" link with the `download` attribute. No opt-in gate (client hasn't requested one — revisit with T-1.16).
- **Files touched:** frontend/public/sample-report.pdf (new), backend/scripts/make-sample-report.js (new), frontend/src/pages/Home.jsx.
- **QA done:** PDF serves 200 (10,394 bytes); full 5-page content reviewed — zero verdict language, coverage exclusion present (Golden Rule #2 QA item ✓); CTA attrs verified programmatically (`target="_blank"` preview + `download` link); 0 console errors; lint 0 errors; Vitest 2/2; build passes.
- **Left / follow-ups:** when Phase 2 fixes the real generator, regenerate the sample FROM the product for full authenticity; consider opt-in gating per client preference (T-1.16).
- **Golden-rule check:** #1 ✓ (labeled fictional/sample everywhere); #2 ✓ (the sample demonstrates the compliant language the product itself must adopt in Phase 2); #5 ✓ (no forced email capture).

### [2026-07-17] — T-1.5 — Product demo / bigger screenshot
- **Status:** DONE
- **What changed:**
  - **Captured the REAL product UI** (per acceptance: "not generic mockup"): the actual `/dashboard` Generate-Report wizard, step 1 filled via the built-in Wind/Hail demo template, rendered at 1440×900 @2x retina. **Method:** no test account exists yet (open question), so the capture used a temporary local-only auth stub in `AuthContext.jsx` (demo user "Jordan Avery", professional tier) with all `/api/*` requests aborted at the browser level — **the stub was fully reverted immediately after capture** (`git checkout`, verified zero `TEMP-SCREENSHOT-STUB` markers remain); nothing auth-related was committed. Sample-data claim fields are the product's own QUICK_DEMOS template content.
  - **Asset:** `frontend/public/product-generate-report.webp` — 2400×1500 WebP, **76 KB** (retina-sharp at up to ~1200 CSS px display width).
  - **New "product showcase" section** on Home (after stats bar, before Features): heading "The Actual Product, Not a Mockup", browser-chrome frame, brand-token glow. Image has descriptive `alt`, explicit `width`/`height` (no CLS), and `loading="lazy"` (below the fold) — QA checklist items all satisfied. Visible on mobile (the hero's animated mock is desktop-only, so mobile users now see a product visual for the first time).
  - Hero's animated DashboardMock kept — it demos the generating flow; the new section shows the real thing. T-1.10 may consolidate.
- **Files touched:** frontend/src/pages/Home.jsx, frontend/public/product-generate-report.webp (new).
- **QA done:** lazy/alt/naturalWidth verified programmatically; desktop + mobile section screenshots (E:/claude-scratch/t15-qa/); 0 console errors; lint 0 errors; Vitest 2/2; build passes.
- **Left / follow-ups:** re-capture the screenshot after future dashboard restyling (T-2.x review-gate UI will change the wizard); consider a short product video/animated capture later; mobile rendering of the screenshot is legible but small — revisit in T-1.11.
- **Golden-rule check:** #1 upheld — the screenshot is the genuine UI with the product's own demo data; stats in the sidebar (12/50 reports) are plausible demo values shown as demo, not marketing claims about usage.

### [2026-07-17] — T-1.4 — Hero rebuild
- **Status:** DONE
- **What changed (all in `frontend/src/pages/Home.jsx`):**
  - **H1** → "Generate Professional Insurance Inspection Reports in Minutes" (the TASKS.md default headline; gradient on "in Minutes"; sized down one step to fit the longer copy).
  - **Sub-line** now carries the AI-assist + human-review positioning and names the audience: "…assembles a structured draft report… you review, refine, and approve the final report. Built for independent adjusters, agencies, and TPA teams."
  - **CTAs:** primary → "Generate My First Report Free" (navigates to `/auth?mode=signup`, click-tested). Secondary stays "See How It Works" (→ `#how-it-works`) — **"View Sample Report" deliberately deferred to T-1.6**: there is no sample report to view yet, and a dead CTA would violate the "actually functional" rule. Badge copy "Powered by FlacronAI" (self-referential) → "AI-assisted reporting for insurance professionals".
  - **Trust line:** now "No credit card required · 5 reports free/month · You approve every report · PDF & DOCX export · Cancel anytime". Deliberately did NOT include TASKS.md's suggested "secure upload" chip — uploads are currently world-readable on the backend (known Golden-Rule-#6 issue), so that claim would be false today; add it only after T-3.x locks storage down.
  - **Empty space reduced:** hero no longer `min-h-screen` (was forcing a full viewport with dead space below the fold on tall screens); tightened paddings/gaps; removed the bouncing scroll-indicator chevron. Stats bar is now visible within the first viewport on 1440×900.
  - **Rule #2 sample copy fixed in the hero mock:** demo report lines no longer state definitive verdicts ("Supply line failure caused…" → "Conditions appear consistent with… plumber confirmation recommended"; structural line now recommends professional assessment; loss table titled "ESTIMATED LOSS SUMMARY (DRAFT)").
  - Hero badge migrated from raw `orange-*` to `brand-*` tokens while touched.
- **Files touched:** frontend/src/pages/Home.jsx.
- **QA done:** desktop (1440×900) + mobile (390×844) screenshots verified (E:/claude-scratch/t14-qa/); primary CTA click lands on `/auth?mode=signup`; H1 unique (all other headings h2/h3); 0 console errors; lint 0 errors; Vitest 2/2; build passes.
- **Left / follow-ups:** secondary CTA swaps to "View Sample Report" in T-1.6; product mock gets bigger/richer in T-1.5; "~60 seconds" chip in the mock still pending the open question on verified timing.
- **Golden-rule check:** #1 upheld (no new claims; removed "instantly"); #2 improved (mock copy now cautious); "secure upload" claim consciously withheld (#6).

### [2026-07-17] — T-1.3 — Logo + favicon
- **Status:** DONE
- **What changed:**
  - **Assets generated from the client's own logo PNG** (no redraw — cropped programmatically with sharp, white background converted to alpha): `frontend/public/logo-mark.png` (512² icon-only FA mark, transparent), `favicon-32.png` / `favicon-64.png`, `apple-touch-icon.png` (180², white bg per Apple convention), `og-image.png` (1200×630, full logo lockup on white, ready for T-1.12's og:image meta).
  - **Old placeholder logo (lucide `Zap` in an orange gradient box) fully removed from every brand position:** Navbar, Footer, both Auth-page logo blocks, EnterpriseDashboard sidebar brand, the Home hero's product mock, and the Suspense `PageLoader` (which now shows the mark above the spinner). Unused `Zap` imports cleaned (Footer, Auth). Remaining `Zap` usages are feature/menu icons, not logos.
  - **index.html**: dead `/favicon.svg` reference (404 since day one) replaced with real favicon-32/64 + apple-touch links.
- **Files touched:** frontend/public/{logo-mark,favicon-32,favicon-64,apple-touch-icon,og-image}.png (new), frontend/index.html, frontend/src/App.jsx, frontend/src/components/{Navbar,Footer}.jsx, frontend/src/pages/{Auth,EnterpriseDashboard,Home}.jsx.
- **QA done:** favicon-32/logo-mark served 200 on dev; navbar, auth page, and loading screen visually verified with new mark (screenshots in E:/claude-scratch/t13-qa/); lint 0 errors; Vitest 2/2; `npm run build` passes; 0 console errors.
- **Left / follow-ups:** emails — Brevo templates (IDs 10–15) are managed in the Brevo dashboard, not the repo; the client should update the logo there (inline-HTML fallbacks in `emailService.js` are text-only, nothing to change). Vector/SVG originals + no-tagline horizontal lockup still wanted from client for crisper rendering (open question updated). Social-preview og:image meta tags land in T-1.12.
- **Golden-rule check:** none violated (brand assets derive directly from the client's real logo).

### [2026-07-17] — T-1.2 — Brand design tokens
- **Status:** DONE
- **What changed:**
  - **`frontend/tailwind.config.js` is now the single design-token source.** Brand color scales sampled programmatically from the client's logo PNGs with sharp: `brand` (orange, 500 = `#FD4403`) and `navy` (800 = `#002A64`), full 50–950 scales. Semantic aliases: `primary` / `primary-hover` / `primary-soft` / `ink` (+ existing `bg`/`surface`/`border` kept). Radius tokens `rounded-btn` (0.75rem) / `rounded-card` (1rem); shadow tokens `shadow-btn` / `shadow-btn-hover` (brand-orange glow) / `shadow-card` (navy-tinted).
  - **Type pairing:** Space Grotesk for headings (`font-display`, applied to h1–h4 in `@layer base`) over Inter body — distinct from the default template look. Font loaded in `index.html` (weights 500–700 only).
  - **`src/index.css`** — shared component classes now consume tokens: `.btn-primary` → `bg-primary`/`shadow-btn`, `.card` → `bg-surface border-border rounded-card`, `.input` focus → `primary`, `.gradient-text` → `from-brand-400 to-brand-500` (was generic orange/amber). `:root` mirrors `--brand-orange`/`--brand-navy` for raw-CSS spots (scrollbar hover, checkbox accent). Body styles converted to `@apply` tokens.
  - **`index.html`** — `theme-color` `#0a0a0f` (dark-theme relic) → brand navy `#002A64`; Space Grotesk added to the Google Fonts link.
- **Files touched:** frontend/tailwind.config.js, frontend/src/index.css, frontend/index.html.
- **QA done (acceptance criteria verified):** `npm run build` passes; **token-flip test: set `primary` to green → CTA button rendered green after dev-server restart; reverted → brand orange back** (screenshots in E:/claude-scratch/t12-qa/); lint 0 errors (36 warnings, unchanged); Vitest 2/2; 0 console errors on home. Gotcha discovered: Tailwind JIT reads the config at startup — config edits need a dev-server restart, and killing `npm run dev` on Windows orphans the Vite child holding the port (killed 2 zombies; noted in CLAUDE.md + memory).
- **Left / follow-ups:** tokens exist but most page-level JSX still uses raw `orange-500`/`amber-*` Tailwind classes — migrate per-component as T-1.4/T-1.10 touch them (grep `orange-` to find stragglers). Headings site-wide now render in Space Grotesk automatically.
- **Golden-rule check:** none violated (visual tokens only; colors match the client's real logo).

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
- [x] Logo/brand assets: PNGs received 2026-07-17; T-1.3 shipped with derivatives extracted from them (icon-only mark, favicons, og-image). **Nice-to-have from client:** vector/SVG originals and an official horizontal no-tagline lockup — would render crisper at large sizes and replace the raster crops; also update the logo inside Brevo email templates (IDs 10–15, managed in the Brevo dashboard, not the repo).
- [x] Payment provider: **Stripe**. → **Resolved 2026-07-17**: Stripe **Checkout Sessions, `mode: 'subscription'`**; webhook wired + signature-verified + idempotent; events handled: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`, `customer.subscription.updated` (see CLAUDE.md §4).
- [ ] Is there real usage data we ARE allowed to display (e.g. real avg generation time)?
- [ ] **Admin email mismatch:** `firestore.rules` hardcodes `admin@flacronai.com`, but env/actual admin is `admin@flacronenterprises.com`. Which address is the real admin account? (Affects T-3.x fixes.)
- [ ] **Is production AI currently working?** Both OpenAI model IDs in code are retired (`gpt-4-vision-preview`, `gpt-4-turbo-preview`) — image analysis and the WatsonX-fallback path should be failing. Is WatsonX alone carrying prod today? Which models should we target when we fix this?
- [ ] **Are production uploads being lost?** Render has no persistent disk and files are stored locally — every deploy wipes uploads/exports. Should we plan a move to cloud storage (Firebase Storage / S3) as an early task, and is any user data already dangling?
- [ ] **Public `/uploads` exposure:** claim photos are world-readable at guessable URLs today (Golden Rule #6 risk in production NOW). OK to prioritize locking this down ahead of the normal Phase 3 order?
- [ ] Blog pages (`Blog.jsx`, `BlogPost.jsx`) are built but never routed — keep + fix content (currently has fabricated study data) or delete?
- [ ] **Real testimonials wanted (T-1.9 shipped hidden):** the home-page testimonials section now renders only from `frontend/src/data/testimonials.js` (empty). Please collect genuine customer feedback WITH written permission (name or initials, role, quote, date; carrier names only with authorization) and it can go live by filling that file.
- [ ] **Test account for authed baselines:** provide test login credentials (or approve creating a dedicated test account) so dashboard/subscriptions/settings/CRM/admin/enterprise pages can be baselined. Signup sends a real verification email via Brevo and writes to the live Firebase project, so I didn't create one unilaterally.
- [ ] **Pricing PRICE conflict (report counts now fixed):** report counts were aligned to the server-enforced `tiers.js` values (5/50/200/unlimited) in T-1.1. But **prices still disagree**: Agency is **$99.99/mo** on Home, FAQs, Subscriptions, AdminTierUpdate and in `tiers.js`, yet **$149.99/mo** on the Pricing page; Enterprise is **$499/mo** everywhere except the Pricing page's **$299.99/mo**. The real charge comes from the Stripe Price IDs in env (not visible in the repo). Which prices are live in Stripe? (Blocks final numbers for T-1.8; I did NOT touch any displayed price.)
- [ ] **"~60 seconds" generation-time claim:** Home features/how-it-works say a full report takes ~60s. Plausible but unmeasured — keep only if we can verify with real timings (could measure in T-2.x once AI models are fixed).
- [ ] **"CRU GROUP-standard" wording** (Home hero, feature card, footer tagline): is the report template actually built to a CRU Group standard, or is this aspirational? If unverifiable it should be reworded (Golden Rule #1).

---

## Remaining / Nice-to-have backlog (not scheduled yet)

- (add ideas here as they surface during work)
