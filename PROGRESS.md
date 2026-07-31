# PROGRESS.md — Living Tracker

> Update this after EVERY micro-task. This is your memory. Newest changelog entry goes on top.
> Status values: `TODO` · `IN-PROGRESS` · `BLOCKED` · `QA` · `DONE`

---

## Current focus
- **Now working on:** — Phase 6 backlog logged 2026-07-31 from a full client product walkthrough (42-item feedback doc + a reference sample-report PDF showing the target finished look). Triaged against actual code via audit before writing tasks — several client-reported issues are already fixed (API key masking, MFA core flow, no free status dropdown, zero-photo doesn't fabricate AI findings); real confirmed gaps are T-6.5 (adjuster approval only captures name/title, not license/state/firm — the polished sign-off in the reference PDF is fabricated by the sample-generator script only), T-6.11 (password min length is 6, not 8 as the client assumed), T-6.13 ("Quality Score" label), T-6.14 (no zero-photo disclaimer), T-6.16 (claim number is unlinked free text — real duplicate-claim risk), T-6.17 (report editor is raw Markdown, not rich/sectioned). Full backlog + status in TASKS.md Phase 6 / status board above. Not started implementing yet — next step is picking tasks one at a time per Golden Rule #7 (small P1 items T-6.4/T-6.5/T-6.11/T-6.13/T-6.14 are good first picks; T-6.16/T-6.17/T-6.29 are large and need their own scoping pass).
- **Previous batch:** T-3.10 security hardening batch DONE 2026-07-22: session revocation + auth rate limiting + audit trail (T-3.10d), new-device login alerts (T-3.10e), self-service account deletion (T-3.10f), opt-in TOTP MFA (T-3.10g), secret/env management audit. T-3.10 acceptance is now fully met except malware scanning and data-retention auto-deletion, both **deliberately deferred per client decision** (see changelog) — everything else (encryption in transit/rest, RBAC, upload validation, signed URLs, session mgmt, MFA, audit logs, account/document deletion, login alerts, rate limiting, secret management) is done and live-QA'd against the real Firebase project. All lint-clean (0 errors), backend tests 6/6, frontend build passes.
- **Previous batch (2026-07-21):** consent flow (T-1.16), Enterprise UI polish + approve UI (T-5.6a/T-2.7b), version history (T-2.13), templates (T-2.10), share link + e-sign (T-2.9/2.12), security hardening rest (T-3.10c). All Golden Rules resolved. **Ready for client final review.** Pending client deploy actions: Render env vars (AWS_*/SES_*, ANTHROPIC_*, FIREBASE_STORAGE_BUCKET) + AWS key rotation + **confirm `FIREBASE_API_KEY` is set in Render** (local backend `.env` is missing it — see 2026-07-22 audit note; without it, `/api/auth/login`, the new MFA login-challenge flow, and self-service account deletion's password re-check all fail with `CONFIG_ERROR`).
- **BIG client-directed tasks (2026-07-18, batch 2):**
  1. **AI provider swap** — ✅ DONE + LIVE-VERIFIED 2026-07-19 (T-2.5a): Claude primary, watsonx fallback, OpenAI removed. `ANTHROPIC_API_KEY` now in local `.env`; live test = health `true`, Opus 4.8 returned expected output. **Client must also add `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` to Render** for prod.
  2. **Migrate file storage to Firebase Storage** — ✅ DONE + LIVE-VERIFIED 2026-07-19 (T-3.10b): `config/storage.js` rewritten on Firebase Storage; generators buffer-based; photos+exports private, logos via token URL; public `/uploads` route removed. 8/8 live bucket round-trip checks passed. **Client must add `FIREBASE_STORAGE_BUCKET` to Render.**
  3. **Email: drop Brevo → AWS SES.** — ✅ DONE + LIVE-VERIFIED 2026-07-19: `emailService.js` rewritten on `@aws-sdk/client-ses`; all 6 emails branded inline HTML; real welcome email delivered to admin@ (MessageId returned). Domain verified, us-east-1, production mode. Brevo fully removed. **Client must add `AWS_*`/`SES_*` vars to Render** + rotate the shared secret key.
  4. **Official SVG logo** — client asked for one; needs a designer or a careful vectorization.
- **T-1.10 de-AI polish:** ✅ DONE 2026-07-19 — unified rainbow gradient icons to a cohesive brand treatment (Home features + About values), fixed white-label default color.
- **Client confirmations (2026-07-18):** Blog delete → already done (T-1.1b); Enterprise "Unlimited" stays → no change; testimonials stay hidden → matches T-1.9; performance numbers stay off → matches T-1.1b; pricing correct/match Stripe → done (T-1.8); canonical non-www → done (T-1.12/13).
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
| T-1.8 | Pricing display rebuild | DONE | 2026-07-18 — single source src/data/plans.js; Pricing/Home/Subscriptions consistent at $0/$39.99/$99.99/$499; annual = 20% off; Developers text fixed |
| T-1.9 | Testimonials/social proof (real only) | DONE | 2026-07-17 — section hidden until real entries added to src/data/testimonials.js; card supports full schema |
| T-1.10 | "De-AI" pass on all landing pages | DONE | 2026-07-19 — unified rainbow gradient icons → cohesive brand chips (Home features, About values); white-label default color → brand |
| T-1.11 | Mobile layout pass (marketing) | DONE | 2026-07-18 — audited all 8 marketing pages at 390px: zero horizontal overflow, layouts stack correctly; added swipe hint to pricing comparison table |
| T-1.12 | SEO: per-page meta + headings | DONE | 2026-07-17 — Seo component on all 13 public pages; unique titles/desc/canonical/OG; 1 h1 each; audit clean |
| T-1.13 | SEO: sitemap, robots, canonical | DONE | 2026-07-17 — robots.txt + sitemap.xml (10 public URLs); 404 now noindex + soft-404 canonical dropped |
| T-1.14 | SEO: structured data (JSON-LD) | DONE | 2026-07-18 — Organization (Home), SoftwareApplication+Offers (Pricing), FAQPage (FAQs); validated, prices from shared source |
| T-1.15 | SEO: performance + image optimization | DONE | 2026-07-18 — logo-mark 512px/137KB → 160px/21KB (every page); confirmed lazy+sized images, route code-splitting, font-display swap |
| T-1.16 | Opt-in / lead-capture forms | DONE | 2026-07-21 — consent checkbox (never pre-checked) + PP/ToS links on Contact + Pricing enterprise forms; server enforces + records consent (version, channels, timestamp, ip, UA) |

### Phase 2 — Core Reporting Platform
| Task | Title | Status | Notes |
|------|-------|--------|-------|
| T-2.x | See TASKS.md | TODO | |

### Phase 3 — Subscription & Operations
| Task | Title | Status | Notes |
|------|-------|--------|-------|
| T-3.10a | Security: lock down public uploads (pulled forward at client request) | DONE | 2026-07-18 — claim photos + exports no longer world-readable; only branding logos public; traversal-safe + tested |
| T-3.10 | Security hardening (rest: at-rest encryption, signed URLs, MFA, audit logs, malware scan, persistent storage…) | DONE (see 2026-07-22 batch) | Only malware scan + data retention remain, both deliberately deferred per client decision. Backup/recovery is a GCP console action, not code — flagged below. |
| T-3.x | See TASKS.md | TODO | |

### Phase 4 — Marketing & Growth Automation
| Task | Title | Status | Notes |
|------|-------|--------|-------|
| T-4.x | See TASKS.md | TODO | |

### Phase 5 — Enterprise & API
| Task | Title | Status | Notes |
|------|-------|--------|-------|
| T-5.x | See TASKS.md | TODO | |

### Phase 6 — 2026-07-31 Client Product Audit Follow-ups
| Task | Title | Status | Notes |
|------|-------|--------|-------|
| T-6.1 | Revoke exposed API key | BLOCKED (client action) | Masking/hashing already done; revoking the specific leaked key is an out-of-code account action |
| T-6.2 | Purge personal/sensitive demo data | TODO | Verify only — sample generator already uses fictional data |
| T-6.3 | Fix Stripe business identity | BLOCKED (client action) | Out-of-repo — Stripe Dashboard settings |
| T-6.4 | Harden report status transitions server-side | DONE | 2026-07-31 — found a real manual status dropdown in "My Reports" (missed by the initial audit) letting any user set draft/finalized/processing/failed/archived directly; removed it + backend accepted arbitrary status via PUT |
| T-6.5 | Strengthen adjuster approval fields | DONE | 2026-07-31 — /approve now requires full name, license #, license state, company/firm + explicit confirmation checkbox; rejects with 400 if any missing; both Dashboard.jsx and EnterpriseDashboard.jsx updated to match |
| T-6.6 | Re-verify billing/plan sync | TODO | Likely already fixed by T-3.2/T-3.4 — needs re-test against client's exact scenario |
| T-6.7 | Confirm draft/final export separation complete | TODO | Likely already done (T-2.7) — verify edit-after-approval invalidation |
| T-6.8 | Authorization/role audit pass | TODO | Folds into existing T-3.8 |
| T-6.9 | Progress modal reflects real backend stages | TODO | Backend already skips AI stage at 0 photos — verify frontend UI |
| T-6.10 | Audit logging coverage check | TODO | |
| T-6.11 | Password min length 6→12 | DONE | 2026-08-01 — found a 3rd spot beyond the two the audit caught (`users.js` PUT /change-password); all 3 backend validators + Auth.jsx + Settings.jsx copy/validation raised to 12 |
| T-6.12 | MFA recovery codes + password-gated disable | TODO | Confirmed gap |
| T-6.13 | Rename "Quality Score" → "Documentation Completeness" | DONE | 2026-08-01 — 7 display sites across Dashboard.jsx, EnterpriseDashboard.jsx, and the Home.jsx marketing preview relabeled with tooltips; qualityScore backend field name unchanged (data shape, out of scope) |
| T-6.14 | Zero-photo disclaimer text | TODO | Confirmed gap |
| T-6.15 | Unify CRM nav across Dashboard/EnterpriseDashboard/Navbar | TODO | Confirmed partial |
| T-6.16 | Link claim number to real CRM claim record | TODO | Confirmed gap — needs migration plan, large task |
| T-6.17 | Rich sectioned report editor (replace Markdown textarea) | TODO | Confirmed gap — large task, overlaps T-2.6 |
| T-6.18 | Calendar layout/event display fixes | TODO | Not yet audited — needs live look |
| T-6.19 | Confirmation dialogs for destructive actions | TODO | |
| T-6.20 | Field validation + address autocomplete | TODO | |
| T-6.21 | Standardize capitalization of statuses | TODO | Small — good next pick |
| T-6.22 | Icon tooltips + accessible labels | TODO | |
| T-6.23 | Loading/empty/error states audit | TODO | |
| T-6.24 | Mobile pass on authed report/CRM screens | TODO | T-1.11 only covered marketing pages |
| T-6.25 | Accessibility pass (contrast/focus/ARIA) | TODO | |
| T-6.26 | Expand public API documentation | TODO | |
| T-6.27 | API key scopes/permissions | TODO | Depends on T-3.8 |
| T-6.28 | Separate API-key auth docs from login JWT | TODO | |
| T-6.29 | CRM analytics + client/claim detail pages | TODO | Large — needs own scoping |
| T-6.30 | Pricing feature-matrix + Enterprise positioning | BLOCKED (client decision) | Needs client input on Enterprise pricing approach |
| T-6.31 | Export sanitization check | TODO | |
| T-6.32 | Homepage precision/trust content re-check | TODO | Likely mostly already done via T-1.4 — verify |

---

## Changelog (newest on top)

### [2026-08-01] — T-6.13 — Rename "Quality Score" → "Documentation Completeness"
- **Status:** DONE
- **What changed:** The client flagged that a "Quality 100/100" score risks implying the AI's findings are fully correct, which they aren't — it only measures required-field/section completeness. Relabeled every user-facing display of `qualityScore` from "Quality"/"Quality Score" to "Completeness"/"Documentation Completeness" (found 7 sites total — the audit only checked `Dashboard.jsx`; a full grep also caught `EnterpriseDashboard.jsx`'s reports-table headers ×2, its stat card, its review-view badge, and the `Home.jsx` marketing dashboard-preview mockup). Added an explanatory tooltip (native `title` attribute) at every site: "Measures how many required fields and sections are filled in — not the accuracy of the AI's findings." The underlying `qualityScore` field name/API shape is unchanged — renaming that would be a breaking API change and is out of scope for a display-label fix.
- **Files touched:** `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/EnterpriseDashboard.jsx`, `frontend/src/pages/Home.jsx`.
- **QA done:** Targeted ESLint 0 errors on all three files (pre-existing warnings only); frontend production build passed; grepped the whole frontend afterward for "Quality" — zero remaining user-facing occurrences.
- **Left / follow-ups:** None.
- **Golden-rule check:** Reinforces the spirit of Golden Rule #2 (no implied AI verdicts) — the label no longer suggests the AI's findings are verified/accurate.

### [2026-08-01] — T-6.11 — Raise password minimum length to 12
- **Status:** DONE
- **What changed:** The 2026-07-31 audit found register (`auth.js:65`) and reset (`auth.js:446`) both at `min: 6`. A closer pass while implementing found a third, separate password endpoint the audit missed: `users.js:200` (`PUT /api/users/change-password`), also `min: 6`. All three raised to `min: 12`. Frontend `Auth.jsx` signup validation + placeholder and `Settings.jsx` change-password validation, weak-password message, and helper copy (previously inconsistently enforcing 8, its own separate number) all raised to 12 for consistency across every password-entry surface in the app.
- **Files touched:** `backend/routes/auth.js`, `backend/routes/users.js`, `frontend/src/pages/Auth.jsx`, `frontend/src/pages/Settings.jsx`.
- **QA done:** Targeted ESLint 0 errors on all four files (pre-existing warnings only); backend tests 7/7 passed; frontend tests 2/2 passed; frontend production build passed.
- **Left / follow-ups:** None — Firebase's own client-side floor (6) is below our 12, but our own client + server checks now gate before it's reached in every path we control.
- **Golden-rule check:** none violated; pure hardening, no feature change.

### [2026-07-31] — T-6.5 — Strengthen the adjuster approval record
- **Status:** DONE
- **What changed:** Confirmed the real `/approve` endpoint only ever captured a typed name + optional title — the polished sign-off block in the client's reference sample PDF (license number, license state, firm, audit reference) is fabricated only by `make-sample-report.js` for the demo, not collected by the real approval flow. `POST /api/reports/:id/approve` now requires full name, license number, license state, and company/firm (all four, or the request is rejected with 400 `SIGNATURE_INCOMPLETE`), plus an explicit `confirmReview: true` flag mirroring the "I confirm I have reviewed…" attestation language (400 `CONFIRMATION_REQUIRED` if absent) — typing a name alone can no longer finalize a report. Also now persists `reviewedByUid`, `reviewedFromIp` (`req.ip`, matching the existing pattern in `auth.js`/`sales.js`), and `versionApproved` (derived from the `versions` subcollection size at approval time). Both `Dashboard.jsx` and `EnterpriseDashboard.jsx` approval cards updated with the four required fields + the confirmation checkbox (client-side mirrors the server validation with a toast, so users get immediate feedback instead of a raw 400); the finalized-state view now displays the full name/title/license/firm instead of just a name.
- **Files touched:** `backend/routes/reports.js`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/EnterpriseDashboard.jsx`.
- **QA done:** Targeted ESLint 0 errors on all three files (pre-existing warnings only, same counts as before); backend tests 7/7 passed; `reports.js` verified to load without syntax errors; frontend production build passed. Not live-tested against a real Firestore report (would need a seeded account) — logic and both call sites were traced end-to-end and both match the new stricter contract.
- **Left / follow-ups:** No automated test coverage exists for `/approve` (before or after this change) — worth adding when Phase 3's subscription/report test suite is extended.
- **Golden-rule check:** Strengthens Golden Rule #3 — approval now requires a real credentialed identity + explicit attestation, not just a typed name.

### [2026-07-31] — T-6.4 — Remove manual report-status manipulation
- **Status:** DONE
- **What changed:** The initial Phase-6 audit undercounted this one — a closer look at "My Reports" found a `StatusToggle` dropdown on every report row that let a user directly set `draft`/`finalized`/`processing`/`failed`/`archived` via a raw `PUT /api/reports/:id` call, completely bypassing the `/approve` human-review gate (Golden Rule #3) and the dedicated archive/delete flow. `processing`/`failed` were never actually produced by the generation pipeline either — purely cosmetic, confusing options. Removed the dropdown and replaced it with the existing read-only `StatusBadge`. Server-side, `status` is no longer in the PUT `/:id` editable-fields allowlist — it can only change via report generation (`draft`), `/approve` (`finalized`), or delete (`archived`), closing the API-level bypass regardless of what the frontend sends.
- **Files touched:** `backend/routes/reports.js`, `frontend/src/pages/Dashboard.jsx`.
- **QA done:** Targeted ESLint 0 errors on both files (pre-existing warnings only); backend tests 7/7 passed; frontend production build passed.
- **Left / follow-ups:** The "Delete" button on a report row calls `permanent=true` (hard delete) with no confirmation dialog — flagged for T-6.19 (confirmation dialogs), not fixed here to keep this change focused. The "shield" icon (ShieldCheck) used for "Review & edit" is the ambiguous icon the client flagged in item #31 — also deferred to its own task (T-6.22).
- **Golden-rule check:** Restores Golden Rule #3 (human review mandatory before finalize) — finalization is now only reachable through `/approve`.

### [2026-07-28] — T-3.2/T-3.4 — Reconcile paid plans and correctly change subscriptions
- **Status:** DONE
- **What changed:** Fixed paid Stripe invoices coexisting with a Starter entitlement by adding authenticated checkout-session confirmation and server-side recovery of the customer's newest active Stripe subscription when Firestore is stale. New purchases now include the Checkout Session ID in the success redirect, so the dashboard can reconcile immediately without relying only on webhook timing. Existing subscribers no longer create a second subscription when selecting another plan: upgrades and monthly/annual changes update the current Stripe subscription immediately with an invoiced prorated credit/charge; downgrades use a Stripe Subscription Schedule and begin after the already-paid period. Webhook reconciliation now derives the tier from the actual Stripe price, ignores late older checkout events, and cannot downgrade an account when a non-current duplicate subscription is deleted. Annual checkout redirects now compare the correct base tier.
- **Files touched:** `backend/config/tiers.js`, `backend/routes/payment.js`, `backend/test/tiers.test.js`, `frontend/src/services/api.js`, `frontend/src/pages/Auth.jsx`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Pricing.jsx`, `frontend/src/pages/Subscriptions.jsx`.
- **QA done:** Backend syntax check passed; backend tests 7/7 passed (including Stripe price-to-tier mapping); targeted backend/frontend ESLint passed with 0 errors (pre-existing warnings only); frontend tests 2/2 passed; production Vite build passed. Build retains the unrelated pre-existing duplicate `onClick` warning in `AdminDashboard.jsx`.
- **Left / follow-ups:** Historical accounts that already have multiple simultaneously active Stripe subscriptions should be reviewed once in Stripe before cancelling/refunding an older charge; this change prevents new duplicates and selects the newest active subscription for the entitlement. End-to-end Stripe test-mode QA still requires the local Stripe CLI/webhook forwarder or deployed webhook.
- **Golden-rule check:** Golden Rule #4 preserved: the backend reconciles the verified Stripe subscription/checkout and persists server-authoritative entitlements; the client never assigns its own tier.

### 2026-07-26 — Homepage static product screenshot icon replacement

- Corrected the remaining emoji reported in “The Actual Product, Not a Mockup”; these were baked into the static `product-generate-report.webp` asset rather than rendered by `Home.jsx`.
- Replaced only the four image regions with professional monochrome Droplets, Flame, Wind, and Hammer outline icons while preserving the original screenshot's text, logo, layout, dimensions, and all other pixels.
- Asset: `frontend/public/product-generate-report.webp` (2400×1500 WebP, visually inspected after final compositing).
- QA: final asset inspected at original resolution; frontend production build passed. Build still reports the unrelated pre-existing duplicate `onClick` warning in `AdminDashboard.jsx`.

### 2026-07-26 — Homepage dashboard visual icon cleanup

- Replaced the four loss-type emoji in the animated homepage dashboard preview with the same Lucide icons used by the real dashboard: Droplets, Flame, Wind, and Hammer.
- Preserved the preview's active orange and inactive gray states, with consistent sizing and accessible labels/tooltips.
- File: `frontend/src/pages/Home.jsx`.
- QA: targeted ESLint 0 errors (1 existing hook dependency warning); frontend production build passed. Build still reports the unrelated pre-existing duplicate `onClick` warning in `AdminDashboard.jsx`.

### 2026-07-26 — Dashboard mobile header/content spacing

- Added clear mobile separation between the fixed header and account/usage summary by converting the full-bleed strip into an inset, rounded card with top margin and balanced internal spacing.
- Added consistent mobile horizontal and vertical page padding across Generate Report, My Reports, and Usage & Billing; desktop spacing remains unchanged.
- File: `frontend/src/pages/Dashboard.jsx`.
- QA: targeted ESLint 0 errors (3 existing warnings); frontend production build passed. Automated browser preview was unavailable because the local browser-control runtime could not initialize its assets; build still reports the unrelated pre-existing duplicate `onClick` warning in `AdminDashboard.jsx`.

### 2026-07-26 — Settings password-reset email fix

- Fixed Settings → Security → “Send Reset Email”: it was bypassing the app's transactional-email service and calling Firebase's client-side default mail sender directly.
- Settings now uses the same `/api/auth/forgot-password` backend flow as the sign-in page, which generates the Firebase reset link and delivers the branded email through AWS SES.
- Added an in-progress state, duplicate-click protection, rate-limit feedback, and server-side failure logging while retaining account-enumeration-safe API responses.
- Files: `frontend/src/pages/Settings.jsx`, `backend/routes/auth.js`.
- QA: real local API request for the account returned `{"success":true,"message":"Password reset email sent"}`; backend tests 6/6 passed; targeted frontend/backend ESLint 0 errors (existing backend warnings only); frontend production build passed. The build still reports the unrelated pre-existing duplicate `onClick` warning in `AdminDashboard.jsx`.

### 2026-07-26 — API key usage counter persistence/display fix

- Fixed the API Keys settings card remaining at `0 calls` after successful `X-API-Key` requests.
- `trackApiUsage` now writes the usage event and atomically increments the API key's `usageCount`/`lastUsedAt` in one Firestore batch.
- Active-key responses derive the displayed count from the authoritative `apiUsage` collection, so calls recorded before this fix are included immediately.
- Settings now reads the backend's actual `lastUsedAt` property instead of the nonexistent `lastUsed` property.
- Files: `backend/middleware/auth.js`, `backend/services/apiKeyService.js`, `frontend/src/pages/Settings.jsx`.
- QA: backend ESLint 0 errors (existing warnings only); backend tests 6/6 passed; targeted Settings ESLint 0 errors (2 existing unused-import warnings); frontend production build passed. Build continues to report the pre-existing duplicate `onClick` warning in `AdminDashboard.jsx`.

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

### [2026-07-26] — CRM bootstrap — Block misleading zero summaries
- **Status:** DONE
- **What changed:** CRM summary cards were calculated from initially empty arrays before the first clients/appointments/claims requests completed, so refresh temporarily showed four zeros while the lower panels still displayed skeletons. Added an explicit initial CRM readiness gate: the site preloader remains visible until all three server datasets settle, then the dashboard renders once with authoritative values. A failed dataset request now shows a dedicated retry state instead of a zero-filled dashboard; retry returns to the blocking loader until data resolves. Subsequent in-page refreshes preserve existing data while updating.
- **Files touched:** `frontend/src/pages/CRM.jsx`.
- **QA done:** Targeted ESLint passes with 0 errors (5 baseline warnings), frontend tests 2/2, production Vite build passes.
- **Left / follow-ups:** None.
- **Golden-rule check:** confirmed none violated; CRM values no longer imply server-authoritative zeros before data loads.

### [2026-07-26] — CRM claims — Implement View action and persist all form fields
- **Status:** DONE
- **What changed:** The Claims eye icon previously had no handler or detail component. Added a responsive claim-detail slide-over with claim number, client, status, loss type/date, property, created/updated timestamps, description, and notes; it opens from the eye action and closes by its button or backdrop. Also fixed a backend persistence gap: New Claim submitted `propertyAddress` and `notes`, but `crmService.createClaim` discarded both. New claim documents now retain those fields in Firestore.
- **Files touched:** `frontend/src/pages/CRM.jsx`, `backend/services/crmService.js`.
- **QA done:** Backend lint 0 errors (baseline warnings), backend tests 6/6, targeted frontend lint 0 errors (5 baseline warnings), production frontend build passes.
- **Left / follow-ups:** Claims created before this fix cannot display property/notes that were never stored; new claims persist them correctly.
- **Golden-rule check:** confirmed none violated.

### [2026-07-26] — CRM client detail — Fix linked-reports crash and list keys
- **Status:** DONE
- **What changed:** Fixed `ClientSlideOver` treating the `{ success, reports }` API envelope as an array, which caused `reports.map is not a function`. Linked reports now extract and validate the actual array, reset correctly when switching clients, and fail safely to an empty list. CRM frontend also incorrectly assumed Mongo-style `_id` while the Firestore service returns `id`; introduced one stable ID resolver (`id` with legacy `_id` fallback) and applied it to client selects, list/table keys, appointment rows, claim rows, report rows, client lookup, and delete/detail actions. This removes the React missing-key warning and fixes actions that previously received undefined IDs.
- **Files touched:** `frontend/src/pages/CRM.jsx`.
- **QA done:** Confirmed no direct `_id` assumptions remain outside the compatibility resolver; targeted ESLint passes with 0 errors (5 pre-existing unused-import warnings); production Vite build passes.
- **Left / follow-ups:** None.
- **Golden-rule check:** confirmed none violated.

### [2026-07-26] — CRM mobile navigation — Move tabs into hamburger drawer
- **Status:** DONE
- **What changed:** Removed the duplicate horizontal CRM tab strip from the mobile page. Extended the shared Navbar with optional page-specific mobile menu items and injected Dashboard, Clients, Appointments, and Claims as a dedicated `CRM Menu` section inside the existing hamburger drawer. Each item uses its CRM icon, shows the active state, switches the CRM view, and closes the drawer immediately.
- **Files touched:** `frontend/src/components/Navbar.jsx`, `frontend/src/pages/CRM.jsx`.
- **QA done:** Targeted ESLint passes with 0 errors (6 pre-existing unused-import warnings); production Vite build passes.
- **Left / follow-ups:** None.
- **Golden-rule check:** confirmed none violated.

### [2026-07-26] — CRM appointments — Responsive calendar polish
- **Status:** DONE
- **What changed:** Reworked the CRM appointments view for mobile: added accessible horizontally scrollable CRM tab navigation (the desktop sidebar was previously hidden with no mobile replacement), stacked the page header and controls, made Month/Week/List share available width, converted the New Appointment action to a compact icon button on narrow screens, reduced card/calendar padding, and stacked week/list appointment rows. Month cells now use compact mobile dimensions and appointment dots on small screens. Replaced the oversized full-cell current-day highlight with a compact orange date badge on both desktop and mobile.
- **Files touched:** `frontend/src/pages/CRM.jsx`.
- **QA done:** Targeted ESLint passes with 0 errors (5 pre-existing unused-import warnings); production Vite build passes.
- **Left / follow-ups:** None.
- **Golden-rule check:** confirmed none violated.

### [2026-07-26] — Billing lifecycle — Correct scheduled-cancellation state
- **Status:** DONE
- **What changed:** Audited the Stripe cancellation lifecycle. Cancellation is intentionally scheduled for the period end, so paid entitlements remain active until then; the bug was that Stripe's underlying status remains `active` while `cancel_at_period_end` is true. The current-subscription API now exposes the effective status as `cancelling` (and preserves raw Stripe status separately), `customer.subscription.updated` persists `cancelling` instead of overwriting it with `active`, and final `customer.subscription.deleted` downgrades to Starter and clears the stale subscription ID. Settings and Subscriptions now show `Cancellation scheduled · Access ends <date>` and hide the Cancel button after scheduling. The cancellation response uses `current_period_end` as its reliable end date.
- **Files touched:** `backend/routes/payment.js`, `frontend/src/pages/Settings.jsx`, `frontend/src/pages/Subscriptions.jsx`.
- **QA done:** Backend lint 0 errors (baseline warnings), backend tests 6/6, targeted frontend lint 0 errors (3 baseline warnings), production frontend build passes.
- **Left / follow-ups:** Local Stripe CLI must forward `customer.subscription.updated` and `customer.subscription.deleted` events to `/api/payment/webhook` for end-to-end local lifecycle testing.
- **Golden-rule check:** confirmed none violated; paid access remains available only through the already-paid billing period, then the webhook enforces Starter entitlements server-side.

### [2026-07-26] — Auth bootstrap — Prevent temporary zero/default dashboard data
- **Status:** DONE
- **What changed:** Verified report persistence already writes every generated report to Firestore and updates the user's persisted monthly/total counters. Fixed the actual UI issue: protected pages could render after Firebase authentication while the backend Firestore profile was unavailable, exposing fallback `Welcome Back`/zero values until a later profile refresh. Profile loading is now a separate blocking state; initial profile retrieval retries up to three times, protected pages keep the site preloader visible until real account data arrives, and a persistent failure shows an explicit retry screen instead of fabricated defaults. Login/register/Google flows no longer launch redundant competing profile requests.
- **Files touched:** `frontend/src/context/AuthContext.jsx`, `frontend/src/components/ProtectedRoute.jsx`.
- **QA done:** Targeted ESLint passes with 0 errors; frontend Vitest passes 2/2; production Vite build passes.
- **Left / follow-ups:** None.
- **Golden-rule check:** confirmed none violated; UI now waits for server-authoritative account data.

### [2026-07-26] — Settings billing — Fix undefined plan status and usage
- **Status:** DONE
- **What changed:** Fixed the Settings billing response mapping. The Starter endpoint correctly returns `subscription: null`, but the UI previously replaced that null with the entire API response and then read its missing `status`, producing `Status: undefined`. Settings now preserves the null subscription and displays `Free plan · No recurring billing`. Billing also fetches the real `/users/usage` contract, so monthly usage shows the actual tier limit (Starter `0 / 5`, rather than the incorrect `0 / 0`) and supports Enterprise `Unlimited`.
- **Files touched:** `frontend/src/pages/Settings.jsx`.
- **QA done:** Targeted ESLint passes with 0 errors (2 pre-existing unused-import warnings); production Vite build passes.
- **Left / follow-ups:** None.
- **Golden-rule check:** confirmed none violated; displayed entitlements now match the server-side tier configuration.

### [2026-07-26] — Dashboard reports — Responsive status dropdown
- **Status:** DONE
- **What changed:** Moved the report-status menu into a `document.body` portal so table/card overflow can no longer clip it. The menu is anchored to its status button with viewport-aware positioning, flips above the button when there is insufficient room below, stays within horizontal viewport padding on narrow screens, and repositions during nested scrolling or window resize. Added outside-click closing and menu ARIA semantics.
- **Files touched:** `frontend/src/pages/Dashboard.jsx`.
- **QA done:** Targeted ESLint passes with 0 errors (3 pre-existing warnings); production Vite build passes; `git diff --check` passes.
- **Left / follow-ups:** None.
- **Golden-rule check:** confirmed none violated.

### [2026-07-26] — Report presentation — Proper Markdown rendering
- **Status:** DONE
- **What changed:** Replaced raw report-content text and the incomplete shared-report parser with a reusable, safely rendered GitHub-Flavored Markdown component. Report headings, bold/italic text, ordered and unordered lists, nested content, blockquotes, links, code blocks, horizontal rules, and tables now render with deliberate report styling. Raw HTML is not enabled. The dashboard's editable review textarea remains raw Markdown so reviewers can edit the source before approval.
- **Files touched:** `frontend/src/components/ReportMarkdown.jsx` (new), `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/SharedReport.jsx`, `frontend/package.json`, `frontend/package-lock.json`.
- **QA done:** Installed `react-markdown` + `remark-gfm`; targeted ESLint passes with 0 errors (3 pre-existing Dashboard warnings); production Vite build passes; `git diff --check` passes.
- **Left / follow-ups:** None.
- **Golden-rule check:** confirmed none violated; human review/edit gate remains intact.

### [2026-07-26] — Dashboard polish — Drawer sidebar and icon cleanup
- **Status:** DONE
- **What changed:** Rebuilt the dashboard navigation as a drawer-style sidebar. On desktop it stays pinned below the navbar at viewport height; when its content is taller than the viewport it scrolls independently with its scrollbar hidden. On mobile it opens from a floating navigation button, uses a backdrop, closes from its header/backdrop/after navigation, and does not shift the main content. Replaced dashboard template/warning/status emoji characters with consistent Lucide icons.
- **Files touched:** `frontend/src/pages/Dashboard.jsx`, `frontend/src/index.css`.
- **QA done:** Dashboard emoji scan returns no matches; targeted ESLint passes with 0 errors (3 pre-existing warnings); production Vite build passes.
- **Left / follow-ups:** Authenticated visual QA still requires signing into a local test account.
- **Golden-rule check:** confirmed none violated.

### [2026-07-26] — Auth reliability — Sign-up network failure handling
- **Status:** DONE
- **What changed:** Firebase sign-up now retries once after a short delay when the Firebase SDK reports `auth/network-request-failed`, covering transient DNS/connectivity failures like the browser screenshot. If Firebase still cannot be reached, the form now shows a clear internet/DNS message instead of exposing the raw Firebase exception.
- **Files touched:** `frontend/src/context/AuthContext.jsx`, `frontend/src/pages/Auth.jsx`.
- **QA done:** Confirmed DNS resolution and HTTPS connectivity to `identitytoolkit.googleapis.com`; a direct test request reached Firebase and received the expected HTTP rejection for intentionally invalid test credentials. Targeted ESLint passes with 0 errors (1 pre-existing warning); production Vite build passes.
- **Left / follow-ups:** The screenshot's `ERR_NAME_NOT_RESOLVED` originated in the browser/OS DNS path. The endpoint is currently resolving on this machine; if Chrome retains the failed lookup, reload/restart the browser once after restarting Vite.
- **Golden-rule check:** confirmed none violated.

### [2026-07-26] — UI polish — Site-wide video preloader
- **Status:** DONE
- **What changed:** Replaced the app-level logo/spinner loading screens with the client-provided `pre-loading.mp4` video. Added one reusable, full-viewport, autoplay/muted/looping inline video loader and wired it into lazy-route loading, auth redirect resolution, and protected-route auth resolution. Kept local action loaders (form submits, uploads, billing requests) unchanged because those communicate specific in-page progress.
- **Files touched:** `frontend/public/pre-loading.mp4`, `frontend/src/components/PageLoader.jsx`, `frontend/src/App.jsx`, `frontend/src/components/ProtectedRoute.jsx`.
- **QA done:** Frontend ESLint passes with 0 errors (32 pre-existing warnings); production Vite build passes and includes the public video asset. Loader includes an accessible status label while the decorative video is hidden from assistive technology.
- **Left / follow-ups:** None.
- **Golden-rule check:** confirmed none violated.

### [2026-07-22] — T-3.10 wrap-up — Secret/env management audit (report only)
- **Status:** DONE (audit, no code change)
- **What was checked:** (1) `.env` is gitignored at repo root + both packages; only `.env.example` (placeholders only, no real secrets) is tracked — confirmed via `git ls-files`. (2) Grepped all tracked source for hardcoded secret patterns (Stripe live/test keys, Firebase-API-key-shaped strings, PEM private keys) — zero matches outside `.env*`. (3) Grepped for `console.log` of tokens/passwords/secrets — only one hit (`watsonx.js`) and it logs a status message, not the token value. (4) CORS dev-bypass and the global error handler's stack-trace suppression (fixed T-3.12) are already prod-safe. (5) Custom JWTs use a single `JWT_SECRET` per environment (dev vs Render prod each have their own value) — correct separation; no rotation mechanism exists, but per-user `tokenVersion` (T-3.10d) already lets us revoke individual sessions without a full secret rotation.
- **Findings / open items (not fixed this session — flagged for the client):**
  - **Admin access is single-email, not role-based** (`requireAdmin` in `sales.js` matches `req.user.email === ADMIN_EMAIL`). There's no granular staff-role/least-privilege system — acceptable for a single-admin operation today, but would need real RBAC before adding a second admin/support user. Not built speculatively.
  - **Local backend `.env` is still missing `FIREBASE_API_KEY`** (flagged since T-3.3a) — confirmed still true. This blocks local testing of `/api/auth/login`, the new MFA login-challenge (`/mfa/login-verify`), and the new self-service account-deletion password re-check (all three return `CONFIG_ERROR` without it). **Client must confirm the real key is set in Render** — these code paths were live-QA'd this session using the (non-secret) Firebase Web API key from `frontend/.env` injected only into a throwaway local process, never written to disk.
  - **Backup/recovery** (Firestore PITR, Storage object versioning) is a GCP console/billing decision, not a code change — not actioned; flagged for the client to decide.
- **Golden-rule check:** none violated; advances Rule #6.

### [2026-07-22] — T-3.10g — Opt-in TOTP two-factor authentication
- **Status:** DONE (live-verified over real HTTP against the running backend + real Firebase project)
- **What changed:** Added MFA (client-authorized T-3.10 acceptance item) using `speakeasy` + `qrcode`. Two separate enforcement points were needed because this app has two login paths:
  - **Public REST login** (`/api/auth/login`, documented in `ApiDocs.jsx` for third-party JWT consumers): when `mfaEnabled`, the real Firebase idToken is deliberately discarded (never sent to the client) and a short-lived challenge token is returned instead, signed with a **separate secret** (`JWT_SECRET + '::mfa-challenge'`) so it's cryptographically impossible for it to be replayed as a real session token against `authenticateToken`. `POST /mfa/login-verify` exchanges a valid TOTP code for the real custom JWT.
  - **Web app** (Firebase client SDK, never touches `/login`): a new `ProtectedRoute` gate (`components/MfaGate.jsx`) blocks app access after a Firebase sign-in until `POST /mfa/verify` confirms the code, using the idToken the client already holds. `AuthContext` tracks `mfaVerified`, reset to `false` on every fresh login/register so MFA can never be silently skipped across sessions.
  - Enrollment: `POST /mfa/setup` (QR + manual secret) → `POST /mfa/verify-setup` (confirm code, turn on) → `POST /mfa/disable` (requires a valid code) → `GET /mfa/status`. A dedicated `mfaLimiter` (8 attempts/10min, keyed by uid) guards every code-verification endpoint against brute-forcing a 6-digit code.
  - Settings > Security gained a Two-Factor Authentication card (enable → QR/secret → confirm; or disable with a code).
- **Files touched:** backend/routes/auth.js, backend/package.json/package-lock.json (+speakeasy, +qrcode), frontend/src/components/MfaGate.jsx (new), frontend/src/components/ProtectedRoute.jsx, frontend/src/context/AuthContext.jsx, frontend/src/pages/Settings.jsx, frontend/src/services/api.js.
- **QA done:** 12/12 checks over real HTTP against the live local backend + real Firebase project (temp test user, cleaned up after): setup returns secret+QR; wrong enrollment code rejected, correct one enables MFA; `/login` returns `mfaRequired` with **no usable token leaked**; login-verify rejects wrong code, accepts correct code and returns a real token that then authenticates on a real protected route; the web-gate endpoint (`/mfa/verify`) accepts/rejects correctly; disable works; a subsequent login returns a normal token directly. Also unit-verified in-process that the challenge token is rejected by the real session secret (the critical isolation property). Lint 0 errors, backend tests 6/6, frontend lint 0 errors (baseline warnings only), `npm run build` passes.
- **Left / follow-ups:** No backup codes for a lost authenticator device (would need support-assisted recovery — flagged, not built speculatively). The web-app gate is a per-session client-side checkpoint on top of an already-valid Firebase idToken, not a token-level restriction — acceptable given the Firebase-SDK architecture, but a determined attacker who already stole a live idToken *and* bypassed the frontend could skip the gate; full enforcement would need Firebase's own native multi-factor auth (Blaze plan) or moving the web app off direct client-SDK login, both bigger architecture changes.
- **Golden-rule check:** none violated; satisfies the MFA line of Rule #6/T-3.10.

### [2026-07-22] — T-3.10f — Self-service account deletion
- **Status:** DONE (live-verified against real Firebase Auth/Firestore/Storage)
- **What changed:** Users had no way to delete their own account (only an admin-triggered delete existed). New `DELETE /api/users/account` (authenticateToken, `{password}`): re-verifies the current password via Firebase's REST sign-in (irreversible action deserves fresh proof of possession), refuses to proceed if the user still owns an enterprise team (`409 TEAM_OWNER_BLOCKED` — would orphan members), then deletes every report **and its versions subcollection** via `db.recursiveDelete()`, report templates, API keys, CRM records, all Storage objects under `users/{uid}/` (new `deletePrefix()` helper using the bucket's `deleteFiles({prefix})`), the Firestore user doc, and the Firebase Auth account. Records an `account_self_delete` audit entry. Settings > Security gained a Danger Zone (password + typed "DELETE" confirmation modal).
- **Files touched:** backend/routes/users.js, backend/config/storage.js (+`deletePrefix`), frontend/src/pages/Settings.jsx, frontend/src/services/api.js.
- **QA done:** live script against the real project (temp user + seeded report/version/template/API-key/storage-object): wrong password rejected, correct password accepted, then every seeded artifact confirmed gone afterward (report, versions subcollection, templates, API keys, storage object, Firestore user doc, Firebase Auth account) — 9/9 checks pass. Lint 0 errors, tests 6/6, frontend build OK.
- **Left / follow-ups:** Doesn't unwind CRM client records owned by *other* users referencing this one (none exist in the schema), and deliberately blocks rather than cascades team ownership — a team owner must remove members first.
- **Golden-rule check:** none violated; satisfies the account-deletion line of Rule #6/T-3.10.

### [2026-07-22] — T-3.10e — New-device login alerts
- **Status:** DONE (live-verified)
- **What changed:** The public REST login had no session-anomaly detection. Login now compares the request's IP/user-agent against the last-known values stored on the user doc; a mismatch — and only when there IS a prior login to compare against, so a brand-new account's first sign-in is never flagged — emails the account owner (new `sendNewDeviceLoginAlert`, reuses the existing SES `layout()` template system) and records a `suspicious_login_new_device` audit entry. `lastLogin {ip, userAgent, at}` is updated on every login.
- **Files touched:** backend/services/emailService.js, backend/routes/auth.js.
- **QA done:** live script against real Firestore (temp user): first-ever login not flagged; second login from the same IP/UA not flagged; a login from a different IP/UA correctly flagged; `lastLogin` persisted correctly at each step — 4/4 checks pass.
- **Left / follow-ups:** only covers the REST `/login` path — the web app's Google-popup sign-in bypasses the backend entirely (Firebase client SDK), so it isn't covered by this alert. Extending it would mean adding a "record login" call from `AuthContext.loginWithGoogle`; noted but not built (scope creep beyond what was asked).
- **Golden-rule check:** none violated; advances Rule #6.

### [2026-07-22] — T-3.10d — Session revocation, auth rate limiting, audit trail
- **Status:** DONE (live-verified against real Firebase Auth/Firestore)
- **What changed:**
  - **Session revocation:** Custom JWTs (7-day, used by the documented public REST API) were stateless and couldn't be revoked on logout, unlike Firebase ID tokens (which already had `revokeRefreshTokens`). Added a `tokenVersion` claim, checked against the user doc on every custom-JWT request (`middleware/auth.js`); logout and password-change (both `auth.js` and `users.js` variants) now bump it, immediately invalidating any outstanding custom JWT.
  - **Rate limiting:** New `authLimiter` (10/15min) on `/register`, `/login`, `/forgot-password`, `/send-verification` — the existing global 100/15min limiter was shared across the whole API and too loose to deter credential stuffing on its own.
  - **Audit trail:** New `auditLogs` Firestore collection + `services/auditLogService.js`. Wired into register, login (success + failure), logout, password-change, and admin tier-update/user-delete. New admin-only `GET /api/sales/admin/audit-logs` (cursor-paginated by timestamp, no full-collection scan) to view the trail.
- **Files touched:** backend/middleware/auth.js, backend/routes/auth.js, backend/routes/users.js, backend/routes/sales.js, backend/services/auditLogService.js (new).
- **QA done:** live scripts against the real Firebase project (temp users, cleaned up after): tokenVersion revocation — old token valid before logout, rejected after, new token valid — 3/3; audit log write+query+cleanup round-trip — 1/1; both green. Lint 0 errors, tests 6/6.
- **Left / follow-ups:** none for this sub-item.
- **Golden-rule check:** none violated; advances Rule #6.

### [2026-07-21] — T-3.10c — Security hardening (upload validation + usage tracking)
- **Status:** DONE
- **What changed:** (1) Magic-byte image validation (`utils/imageValidation.js`) — report generate / add-images / analyze-images reject files whose real bytes aren't jpeg/png/gif/webp/heic (defeats spoofed mimetype; `400 INVALID_IMAGE`). (2) Mounted `trackApiUsage` on `/api` so API-key usage is finally recorded (was never mounted → analytics always empty); no-op for token/browser requests.
- **Files touched:** backend/utils/imageValidation.js (new), backend/routes/reports.js, backend/server.js.
- **QA done:** signature sniffer unit test (real png/jpeg/webp pass; disguised text + short buffers rejected); lint 0 errors; backend tests 6/6.
- **Left / follow-ups:** MFA, malware-scan service, general security audit log deferred (larger). At-rest encryption already provided by GCP defaults.
- **Golden-rule check:** advances Rule #6.

### [2026-07-21] — T-2.9 / T-2.12 — Shareable report link + adjuster e-signature
- **Status:** DONE (end-to-end verified)
- **What changed:** **Share (T-2.9):** `POST/DELETE /reports/:id/share` create/revoke a public token (finalized only); public `GET /reports/shared/:token` returns presentation fields only (no `userId`/`imagePaths`); new public `/shared/:token` page renders the report read-only with print-to-PDF, `noindex`. **E-signature (T-2.12):** approve accepts `signature {name,title}` → stored `{name,title,signedAt}`; PDF + DOCX sign-off render the typed signature + an "Electronically signed by … on …" line. Dashboard: e-sign name field on approve + "Copy Share Link" when finalized.
- **Files touched:** backend/routes/reports.js, utils/properPdfGenerator.js, utils/documentGenerator.js, frontend services/api.js, pages/Dashboard.jsx, pages/SharedReport.jsx (new), App.jsx.
- **QA done:** draft-share rejected (400), approve stores signature, public fetch returns content+signature without leaking userId, revoke → 404. Lint 0 errors, tests 6/6, build OK.
- **Golden-rule check:** only finalized (human-approved) reports are shareable; no internal fields leaked.

### [2026-07-21] — T-2.10 — Report templates (save/reuse claim structures)
- **Status:** DONE (CRUD verified)
- **What changed:** `reportTemplates` collection (per-user); `GET/POST/DELETE /reports/templates` (defined before `/:id` to avoid path capture). Dashboard "My Templates" in wizard step 1 — save current claim details as a named template, load to auto-fill, delete.
- **Files touched:** backend/routes/reports.js, frontend services/api.js, pages/Dashboard.jsx.
- **QA done:** create/list/delete + ownership + no-name rejection verified; lint 0 errors, build OK.

### [2026-07-21] — T-2.13 — Report version history & audit trail
- **Status:** DONE (end-to-end verified)
- **What changed:** `recordVersion()` writes snapshots to `reports/{id}/versions` on generate/edit/approve (actor, timestamp, note, content snapshot); `GET /reports/:id/versions` (newest first). Dashboard "Version History" card lists entries with a Restore action.
- **Files touched:** backend/routes/reports.js, frontend services/api.js, pages/Dashboard.jsx.
- **QA done:** edit+approve record versions; GET returns them ordered with content; lint 0 errors, tests 6/6, build OK.

### [2026-07-21] — T-5.6a — Enterprise Dashboard UI polish (de-AI / brand)
- **Status:** DONE
- **What changed:** Removed the "AI dashboard" tells from EnterpriseDashboard: the four rainbow-gradient stat cards (orange/amber, blue/cyan, violet/purple, emerald/teal) now use the cohesive brand chip (`bg-brand-50` + `text-brand-600` icon) matching the T-1.10 site-wide treatment; monogram badges → solid `brand-600`; stale white-label default `#f97316` → brand `#FD4403`.
- **Files touched:** frontend/src/pages/EnterpriseDashboard.jsx, PROGRESS.md.
- **QA done:** lint 0 errors, `npm run build` OK. (Visual QA in-app pending — enterprise-tier login needed; deferred to client's final review.)
- **Left / follow-ups:** broader `orange-*` (#f97316) → brand-token migration across the enterprise dashboard is a larger cosmetic sweep, deferred (needs enterprise-login visual QA). Added review-gate UI already in T-2.7b.
- **Golden-rule check:** none violated; advances the "not AI-looking / branded" goal.

### [2026-07-21] — T-1.16 — Lead-capture consent flow (Golden Rule #5)
- **Status:** DONE (end-to-end verified)
- **What changed:** Client-required consent before submitting contact/lead info.
  - **New `components/ConsentCheckbox.jsx`** — reusable, **never pre-checked** (Rule #5): states the user agrees to be contacted by email (and SMS where a phone is given), that consent is **voluntary and withdrawable**, with links to the **Privacy Policy** and **Terms of Service**. Exports `CONSENT_VERSION` (`2026-07-21`) + `buildConsent(hasPhone)`.
  - **Wired into both live lead forms:** `Contact.jsx` (email-only) and `Pricing.jsx` enterprise "Contact Sales" modal (email+SMS, since it has a phone field). Submit button is disabled until the box is checked; handler also guards.
  - **Backend `POST /api/sales/contact`:** rejects submissions without consent (`400 CONSENT_REQUIRED`) and records a compliance object on the lead — `{ agreed, version, channels, consentedAt (server time), ip, userAgent }`.
  - Deleted the dead `components/ContactSalesModal.jsx` (unused; would have been a non-consented path).
- **Files touched:** frontend/src/components/ConsentCheckbox.jsx (new), frontend/src/pages/Contact.jsx, frontend/src/pages/Pricing.jsx, backend/routes/sales.js, deleted frontend/src/components/ContactSalesModal.jsx, PROGRESS.md, CLAUDE.md.
- **QA done:** Backend test (mounted router): no-consent → 400 CONSENT_REQUIRED ✓; with-consent → 201 + lead stored with agreed/version/channels(email+sms)/consentedAt ✓. Frontend lint 0 errors + `npm run build` OK.
- **Left / follow-ups:** Account signup (`Auth.jsx`) could also surface a Terms/Privacy acceptance line (separate from contact consent) if the client wants it. Marketing unsubscribe/withdrawal handling is a future item (no marketing sends exist yet — only transactional + admin-initiated).
- **Golden-rule check:** satisfies Rule #5 (explicit, unchecked, voluntary consent; transactional email stays separate; consent recorded for compliance).

### [2026-07-19] — T-3.12 — Security: stop leaking stack traces to clients
- **Status:** DONE
- **What changed:** `POST /api/reports/:id/export` error response returned `detail: err.stack` — an info-disclosure leak (Rule #6). Removed it; the response now mirrors the global handler (generic "Export failed" in production, `err.message` only in dev). Server-side `console.error` logging kept. Audited all routes: no other response-body stack/`detail` leaks; global error handler already prod-safe; CORS allow-all is dev-only (prod restricts to `allowedOrigins`).
- **Files touched:** backend/routes/reports.js, CLAUDE.md, PROGRESS.md.
- **QA done:** Lint 0 errors; backend tests 6/6.
- **Left / follow-ups:** Non-revocable 7-day custom JWTs on logout; malware/magic-byte upload validation; audit logs; MFA — deferred (larger). At-rest encryption is already provided by GCP defaults (Firestore + Firebase Storage encrypt at rest).
- **Golden-rule check:** advances Rule #6; none violated.

### [2026-07-19] — T-2.7b — Human-review gate UI on EnterpriseDashboard
- **Status:** DONE — mirrored the Dashboard review gate (editable content + Save + Approve & Finalize + status card) on the enterprise generate flow. Lint 0 errors, build OK. (Committed 3e434b6.)

### [2026-07-19] — T-2.7 — Human-review gate before finalize (Golden Rule #3)
- **Status:** DONE (end-to-end verified)
- **What changed:** AI output was written straight to `status:'completed'` and immediately exportable — no human review. Added a real review gate:
  - **Backend (`reports.js`):** new reports save as **`status:'draft'`** (+ `reviewedBy`/`reviewedAt` null). Export of an un-reviewed report is **force-watermarked** "DRAFT — PENDING ADJUSTER REVIEW" and filename suffixed `_DRAFT`; only a reviewed report exports clean (`isReviewed()` — treats legacy `completed` as reviewed so old reports still work). New **`POST /api/reports/:id/approve`** records reviewer + timestamp, sets `status:'finalized'`, and persists any final content edits. AI content title is now status-neutral (draft state is shown by the watermark/workflow, not baked into the text).
  - **Frontend (`Dashboard.jsx` + `api.js`):** the read-only preview is now an **editable content textarea** with **Save Changes** (PUT) and **Approve & Finalize** (POST /approve); a Review & Approval card shows draft/finalized state; report list gained draft/finalized status styles + a "Review" action to reopen any report into the editable pane.
- **Files touched:** backend/routes/reports.js, backend/services/aiService.js (status-neutral title), frontend/src/pages/Dashboard.jsx, frontend/src/services/api.js, CLAUDE.md, PROGRESS.md.
- **QA done:** End-to-end against the real API/Firestore/Storage (seeded draft, minted JWT, no Claude): draft export filename → `_DRAFT` ✓; approve → `status:finalized` + `reviewedBy` + `reviewedAt` ✓; finalized export → clean filename ✓. Frontend lint 0 errors + `npm run build` OK; backend lint 0 errors + tests 6/6.
- **Left / follow-ups:** ✅ EnterpriseDashboard approve UI added 2026-07-19 (same turn). `StatusToggle` can also manually set 'finalized' (a deliberate human action; doesn't record reviewer — acceptable override).
- **Golden-rule check:** satisfies Rule #3 (no AI output passes as a final report without human approval); complements the Rule #2 cautious language.

### [2026-07-19] — T-2.5 — De-verdict AI report language (Golden Rule #2)
- **Status:** DONE (live-verified)
- **What changed:** The report prompts made the AI issue definitive professional verdicts (most-probable cause, "whether this loss is covered", "Adjuster certification statement", "REAL calculated" final costs). Rewrote to a review-first stance:
  - **`buildReportPrompt`** (aiService.js): report retitled "DRAFT FOR ADJUSTER REVIEW" with a top disclaimer; added a CRITICAL LANGUAGE & SCOPE RULES block (cautious language; no final determination of cause/coverage/liability/fraud/policy/structural/mold/engineering/code/final cost — all reframed as "items for the licensed adjuster to evaluate"). Section 4 "Cause of Loss" → "Scope of Loss / Observations" (possible causes to confirm, coverage *considerations* with explicit "no determination made"). Section 7 → "PRELIMINARY ESTIMATED COSTS (FOR PLANNING & REVIEW ONLY)" with a non-binding note. Section 9 no longer asks for a certification; leaves the adjuster's own sign-off blank.
  - **Section-7 fallback prompt** (`ensureLossSummary`) relabelled + non-binding framing to match.
  - **Auto-certification removed from exports:** `properPdfGenerator.js` + `documentGenerator.js` "Adjuster Certification / I certify that the information… is accurate" → "Reviewing Adjuster Sign-Off" + AI-draft disclaimer (signature = the adjuster's own attestation; system no longer certifies).
- **Files touched:** backend/services/aiService.js, backend/utils/properPdfGenerator.js, backend/utils/documentGenerator.js, CLAUDE.md, PROGRESS.md.
- **QA done:** Live Claude generation (Opus 4.8) of a water-damage report — all 6 cautious markers present ("appear", "may", "subject to", "preliminary", "no coverage determination", "review"); all 7 hard-verdict phrases absent ("is covered under", "I certify that", "claim is approved/denied", …). Lint 0 errors; backend tests 6/6.
- **Left / follow-ups:** Rule #3 (human accept/reject/edit gate before finalize) is still open — reports still save `status:'completed'` and are immediately exportable; that's a separate frontend+backend workflow task.
- **Golden-rule check:** directly satisfies Rule #2. Advances Rule #3 posture (drafts now self-identify as pending review) but the enforcement gate remains TODO.

### [2026-07-19] — T-1.3b — Vector (SVG) logo mark
- **Status:** DONE
- **What changed:** Client asked for a vector logo. Vectorized the FA monogram from `logo-mark.png` by per-color potrace tracing (orange F + triangle, navy A) → `frontend/public/logo-mark.svg`; faithfulness confirmed by re-rasterizing and comparing to source. Switched all UI `<img>` logo refs (navbar, footer, auth ×2, home, enterprise dashboard, app loader) from `.png` → `.svg` for crisp any-size rendering (~13KB vs 21KB). Kept PNG for Organization JSON-LD `logo` (search engines prefer raster).
- **Files touched:** frontend/public/logo-mark.svg (new), App.jsx, components/Navbar.jsx, components/Footer.jsx, pages/Auth.jsx, pages/Home.jsx, pages/EnterpriseDashboard.jsx.
- **QA done:** SVG re-render matches original; `npm run build` succeeds; SVG copied to dist/.
- **Left / follow-ups:** Full "FLACRON AI" wordmark + taglines still only in PNG (the mark is what the UI uses); can vectorize the wordmark too if the client wants it.
- **Golden-rule check:** none violated.

### [2026-07-19] — T-3.10b — File storage migration local disk → Firebase Storage
- **Status:** DONE (live-verified against the real bucket)
- **What changed:** Killed the ephemeral local-disk uploads (Render loses them on every deploy + they were world-readable). Everything now lives in Firebase Storage bucket `flacronai-c8dab.firebasestorage.app`.
  - **`config/storage.js`** rewritten as a Storage abstraction: `uploadBuffer` (optional Firebase download-token for public branding), `downloadBuffer`, `deleteObject(s)`, `getSignedUrl`, `tokenUrl`, `objectExists` + path builders (`users/{uid}/reports|exports|logos|whitelabel/...`).
  - **`config/firebase.js`**: `storageBucket` on init + `getBucket()`.
  - **Generators made buffer-based (no disk):** `properPdfGenerator.generatePDF` resolves a Buffer, takes `logoBuffer`+`images` (Buffers) instead of paths; `documentGenerator.generateDOCX` returns a Buffer; `watermarkService.addWatermarkToPDF` is buffer-in/out; `aiService.analyzeImages` takes `{buffer,mimetype}`.
  - **`routes/reports.js`**: multer → memoryStorage; generate/add-images upload buffers to Storage (imagePaths = object paths) + analyze from in-memory buffers; export downloads photo+logo buffers, builds the doc buffer, uploads to `exports/`, returns the same `/download?file=` contract; download proxies bytes from Storage (auth+ownership preserved); permanent-delete removes Storage objects; analyze-images is memory-only.
  - **`routes/users.js` + `routes/whitelabel.js`**: logos resized in memory (sharp `.toBuffer()`) → Storage with token URL; old logo deleted on replace; white-label preview streams a generated buffer.
  - **`server.js`**: removed the public `/uploads` static route; **deleted** now-dead `middleware/uploadAccess.js` + its test.
- **Files touched:** backend/config/storage.js (rewrite), config/firebase.js, routes/reports.js, routes/users.js, routes/whitelabel.js, services/aiService.js, services/watermarkService.js (rewrite), utils/properPdfGenerator.js, utils/documentGenerator.js, server.js, .env.example (+FIREBASE_STORAGE_BUCKET), deleted middleware/uploadAccess.js + test/uploadAccess.test.js, CLAUDE.md §4 + security notes, PROGRESS.md.
- **QA done:** 8/8 live end-to-end checks against the real bucket (throwaway objects, then deleted): report image upload/download round-trip; logo token URL publicly readable (HTTP 200); generatePDF → valid `%PDF-` buffer with embedded logo+photo; watermark → valid PDF buffer; generateDOCX → `PK` zip buffer; export upload/download round-trip; deleteObjects confirms removal. Lint 0 errors; backend `node --test` 6/6 (was 13; −7 from the deleted uploadAccess test).
- **Left / follow-ups:** Client to add `FIREBASE_STORAGE_BUCKET=flacronai-c8dab.firebasestorage.app` to Render env. Consider Storage security rules (admin SDK bypasses them, but tighten for any future client-SDK access). Export catch still leaks `err.stack` (pre-existing, separate item). Finishes the durable-storage half of **T-3.10**.
- **Golden-rule check:** none violated. Rule #6 (security) advanced — claim photos no longer world-readable (private objects, authenticated download proxy); logos intentionally public via unguessable tokens.

### [2026-07-19] — T-2.6a — Email migration Brevo → AWS SES
- **Status:** DONE (live-verified)
- **What changed:** Replaced Brevo REST with **AWS SES** (`@aws-sdk/client-ses`). `emailService.js` fully rewritten:
  - Lazy `SESClient` (returns null → logs + skips when creds absent, so dev without AWS still boots).
  - Shared `layout()` builder → all 6 transactional emails are branded inline HTML (navy header + "Flacron**AI**" wordmark, brand-orange CTA button, transactional footer w/ Flacron Enterprises LLC). No external template store, no image assets (no broken-image risk). User-supplied values HTML-escaped (`esc()`).
  - All exported wrapper signatures unchanged → **zero route changes** (auth/users/teams/sales/payment untouched). Generic `sendEmail({to,subject,html,text})` preserved for admin/email route.
  - `SES_REPLY_TO` supported; sender = `SES_FROM_NAME <SES_FROM_EMAIL>`.
- **Files touched:** backend/services/emailService.js (rewrite), backend/.env.example (EMAIL_* → AWS_*/SES_*), backend/package.json (+@aws-sdk/client-ses), deleted backend/scripts/createBrevoTemplates.js + updateBrevoTemplates.js, CLAUDE.md §4 + env list + §6, PROGRESS.md.
- **QA done:** SES creds verified valid + **production mode** (50k/day quota, not sandbox); domain `flacronenterprises.com` verified in SES. **Real welcome email delivered** to admin@flacronenterprises.com (MessageId returned). Lint clean on emailService.js; backend `node --test` 13/13 pass.
- **Left / follow-ups:** Client to add `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL`, `SES_FROM_NAME`, `SES_REPLY_TO` to Render env. **Client must rotate the AWS secret key** (it was shared in plaintext chat) after confirming prod works. testEmails.js still valid (provider-agnostic).
- **Golden-rule check:** none violated. These are transactional emails only (Rule #5 — kept separate from marketing, no consent needed); no fabricated claims in copy.

### [2026-07-19] — T-2.5a (activation) — Claude API live-verified
- **Status:** DONE
- **What changed:** `ANTHROPIC_API_KEY` added to local `.env` (108-char `sk-ant-` key) + `ANTHROPIC_MODEL=claude-opus-4-8`. No code change — activation/verification of the T-2.5a swap.
- **QA done:** `checkHealth()` → `true`; `generateText()` round-trip returned expected output from Opus 4.8. Fallback chain (Claude → watsonx) intact.
- **Left / follow-ups:** Client to add the same two vars to **Render** for production.
- **Golden-rule check:** none violated (report-prompt verdict language is still separate Phase-2 T-2.5 work).

### [2026-07-19] — T-1.10 — De-AI polish (cohesive brand icons)
- **Status:** DONE
- **What changed:** The biggest "AI-template" tell was the rainbow of per-card gradient icons. Unified them to a cohesive brand treatment (soft brand-orange chip + brand icon, matching the T-1.7 security strip):
  - **Home features** (6 cards): removed the per-card `color` gradient field (orange/cyan, emerald/teal, pink/rose, violet/orange…) → single `bg-brand-50 border-brand-100` chip with `text-brand-600` icon; card hover + "Everything you need" badge moved off raw `orange-*` onto brand tokens.
  - **About values** (6 cards): removed the per-value rainbow `color` field (yellow/orange/green/pink/amber/red) → same cohesive brand chip.
  - **White-Label default config** (walkthrough finding): `primaryColor` `#f97316`→`#FD4403`, `secondaryColor`→brand navy `#002A64` so new portals start on-brand.
- **Files touched:** frontend/src/pages/Home.jsx, About.jsx, WhiteLabelPortal.jsx, PROGRESS.md.
- **QA done:** Home features screenshot verified cohesive (E:/claude-scratch/t110-qa/); 0 console errors; build passes; lint 0 errors (32 warnings, unchanged); Vitest 2/2.
- **Left / follow-ups:** deeper de-AI work (varied section rhythm, custom imagery beyond the one product screenshot, spacing audit) is larger and subjective — this pass targeted the concrete rainbow-gradient tell. Firebase Storage found NOT enabled on the project — storage migration blocked on the client (see needs list).
- **Golden-rule check:** n/a (visual only).

### [2026-07-19] — T-2.5a — AI provider swap: Claude primary, watsonx fallback, OpenAI removed
- **Status:** DONE (code) — **runtime-blocked on client `ANTHROPIC_API_KEY`.** Confirmed the client explicitly authorized this in batch 2 ("use Claude API as primary … watsonx as secondary/fallback … remove all deprecated OpenAI models"); dev double-checked the go-ahead before I started.
- **What changed:**
  - **`backend/config/anthropic.js` (new):** wraps `@anthropic-ai/sdk` (installed, ^0.112.3). `generateText()` (text) + `analyzeImages()` (vision) + `checkHealth()`. Model from `ANTHROPIC_MODEL` env, default `claude-opus-4-8` (configurable so the client can drop to Sonnet for cost). Handles `stop_reason:"refusal"` and empty content; **does not send `temperature`/`budget_tokens`** (rejected by Opus 4.8 / Sonnet 5).
  - **`aiService.js` reworked:** new `generateWithFallback()` = Claude → watsonx for all text paths (`generateReport`, `ensureLossSummary`, `generateSummary`, `generateScopeOfWork`, `enhanceContent`). `analyzeImages` now uses **Claude vision** (base64 image blocks; jpeg/png/gif/webp only, heic/heif skipped; still capped at 10); no vision fallback (watsonx/granite is text-only) → degrades to "unavailable" if Claude unconfigured. `checkAIHealth` now reports `{anthropic, watsonx, primary}`.
  - **Removed OpenAI entirely:** deleted `backend/config/openai.js`; all `getOpenAI()` / `gpt-4-turbo-preview` / `gpt-4-vision-preview` call sites gone (the retired model IDs were a live prod breakage). `reports.js` ai-status fallback JSON updated to `{anthropic, watsonx}`. `.env.example`: `OPENAI_API_KEY` → `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL`.
- **Files touched:** backend/config/anthropic.js (new), backend/services/aiService.js, backend/routes/reports.js, backend/.env.example, backend/config/openai.js (deleted), backend/package.json + lock (added @anthropic-ai/sdk), CLAUDE.md §4, PROGRESS.md.
- **QA done (what's possible without a key):** `@anthropic-ai/sdk` installs + resolves; `require('./services/aiService')` loads with all 7 exports intact (no syntax/resolution errors); grep confirms **zero OpenAI references remain in code**; backend lint 0 errors (40 warnings, down 1 from deleting openai.js); `npm test` 13/13. **NOT tested:** live Claude generation / vision — needs `ANTHROPIC_API_KEY`.
- **Left / follow-ups (client action needed):** (1) add `ANTHROPIC_API_KEY` to Render env (and locally to test) — until then everything falls back to watsonx; (2) confirm model/cost tier (default Opus 4.8 is premium; Sonnet is cheaper via `ANTHROPIC_MODEL`); (3) the `openai` npm package is now unused in `package.json` — can be uninstalled in a cleanup pass; (4) **Golden Rule #2 unchanged** — the report prompts still request coverage/cause/cost verdicts; softening that language + the auto-certification is still Phase-2 T-2.5.
- **Golden-rule check:** #2 not yet addressed (provider swap only; noted); image-analysis prompt was written with cautious language ("appears", "defer to adjuster") as a small step in the right direction.

### [2026-07-18] — Client batch-2 quick wins: admin email + Custom Domain "Coming Soon"
- **Status:** DONE (two focused commits)
- **Admin account (T-3.10 sub-item):** client confirmed the official admin is **admin@flacronenterprises.com** and asked to update all references. Fixed `backend/firestore.rules` `isAdmin()` (was hardcoded `admin@flacronai.com` → the rules-level admin grants pointed at the wrong, non-existent account — a real security gap). Also corrected `backend/.env.example` and `frontend/.env.example` to the right address. Backend code already reads `process.env.ADMIN_EMAIL` (prod Render env must be set to this — flagged for the client). **firestore.rules must be redeployed to Firebase to take effect** (deploy step, client/devops).
- **Custom Domain → "Coming Soon":** client said don't expose unimplemented functionality. Replaced the white-label portal's Custom Domain UI (CNAME instructions, "Your Domain" input, "Verify Domain" button, SSL status) with a clear "Coming Soon" card explaining subdomains work today. Removed the now-dead `handleVerifyDomain` handler, `verifyingDomain`/`domainStatus`/`cnamecopied` state, `cnamValue`, and unused `Shield`/`Copy` imports (client wants no dead code). Warnings back to baseline 32.
- **Files touched:** backend/firestore.rules, backend/.env.example, frontend/.env.example, frontend/src/pages/WhiteLabelPortal.jsx, PROGRESS.md.
- **QA done:** firestore.rules reviewed (single admin function, now correct); build passes; lint 0 errors / 32 warnings (baseline — dead code fully removed); Vitest 2/2. (Coming-Soon card is a static copy change; verified via build + code review rather than re-provisioning the test account.)
- **Left / follow-ups:** the backend white-label `verifyDomain` endpoint still exists but is now unused by the UI — remove when custom-domain is actually built. Redeploy firestore.rules for the admin fix to take effect in production.
- **Golden-rule check:** #4 upheld (no longer exposing the non-functional custom-domain feature); #6 advanced (admin rules now point at the real account).

### [2026-07-18] — T-1.15 — Performance + image optimization
- **Status:** DONE
- **What changed:** `logo-mark.png` was a **512×512 / 137 KB** PNG displayed at 24–48px in the navbar, footer, auth, loader, and hero mock — i.e. it shipped 137 KB for a tiny icon on **every page load**. Resized to **160×160 / 21 KB** (ample for retina at ≤48px); all references keep working (same filename), zero code change. ~85% smaller, on every route.
- **Also verified (already good):** product screenshot is WebP 76 KB with `loading="lazy"` + explicit width/height (no CLS); route-level code splitting already in place (each page its own chunk, e.g. Home 32 KB / Dashboard 54 KB gzip-9–15 KB); Google Fonts load with `&display=swap` (no invisible-text block); hero LCP is text, not an image.
- **Files touched:** frontend/public/logo-mark.png.
- **QA done:** navbar logo screenshot confirms crisp at 32px @2× after downsizing; `npm run build` passes; Vitest 2/2. Recorded bundle sizes (largest = vendor `index` chunk 483 KB / 139 KB gzip, mostly Firebase + React).
- **Left / follow-ups:** biggest remaining page-weight is the **483 KB vendor chunk** (Firebase SDK loaded app-wide via AuthContext) — could lazy-load Firebase or split `manualChunks`, but that's a larger/riskier change (deferred). `logo-light.png` (429 KB) + `logo-dark.png` (134 KB) are unused on-page source masters still shipped in `dist/` — move out of `public/` to trim deploy size. Couldn't run Lighthouse (would need a large install on this flaky network); optimizations are concrete + measured instead.
- **Golden-rule check:** n/a (asset optimization).

### [2026-07-18] — T-3.3a — Fix admin stats hang + O(n) reads (walkthrough finding)
- **Status:** DONE
- **Root cause:** `GET /api/sales/admin/stats` awaited a Stripe `charges.list` call with no timeout — if Stripe is slow/unreachable (as during the local walkthrough), the whole response never returns and the Admin Dashboard sits on loading skeletons forever. Separately, it read the entire `reports` and `salesLeads` collections into memory just to count them (O(n) billed reads, grows with the product).
- **What changed (`backend/routes/sales.js` admin/stats):** (1) Stripe call wrapped in `Promise.race` with a 4s timeout → on slow/absent Stripe it falls back to `stripeRevenue=null` instead of hanging. (2) `reports`/`salesLeads` totals + this-month counts now use Firestore `count()` aggregation queries (O(1) billed) instead of `.get()`-ing every doc. `users` still read in full (small; tier tally needs a missing-field → 'starter' default).
- **Files touched:** backend/routes/sales.js.
- **QA done:** created a temp admin test user, fetched a real Firebase ID token (via the frontend web API key), called the endpoint twice → **HTTP 200 in 6.6s cold / 2.6s warm** (previously hung), returning correct aggregated stats (tier counts, MRR, count()-based totals, Stripe bounded). Test user deleted + confirmed gone. Backend lint 0 errors. **Incidental finding:** `backend/.env` `FIREBASE_API_KEY` is a 7-char placeholder (real web key is 39 chars, only in frontend) — the backend's REST `/api/auth/login` password path would fail locally; prod may differ (Render env). Logged to backlog.
- **Left / follow-ups:** the admin `users` list + other `sales.js` endpoints (`admin/users`, leads) still use in-memory pagination over full collections (audit tech-debt) — convert to real Firestore pagination later; MRR is estimated from tier counts × list price (not actual Stripe subscription amounts).
- **Golden-rule check:** n/a (perf/reliability fix).

### [2026-07-18] — T-1.11 — Marketing mobile pass
- **Status:** DONE
- **What changed:** Audited all 8 marketing pages (Home, Pricing, About, Contact, FAQs, Developers, ApiDocs, Auth) at 390×844 (2× DPR, isMobile) with a programmatic horizontal-overflow detector + full-page screenshots. **Result: zero page-level horizontal scroll on any page** — the only wide elements (pricing comparison table `min-w-[640px]`, API code blocks) correctly scroll inside their own `overflow-x-auto` containers, and decorative blur-blobs are clipped by `overflow-hidden` parents. Hero, features, how-it-works, pricing cards, security strip, and footer all stack correctly single-column; H1 count stays 1 on Home.
  - **One enhancement:** added a `sm:hidden` "Swipe to compare plans →" hint above the pricing comparison table (it has more columns than fit on a phone, with no prior cue that it scrolls).
- **Files touched:** frontend/src/pages/Pricing.jsx, PROGRESS.md.
- **QA done:** overflow audit (all clean); visual review of Home (full + footer), Pricing, and each page's screenshot (E:/claude-scratch/mobile/); lint 0 errors; Vitest 2/2.
- **Left / follow-ups:** authed/app pages (dashboard, admin, CRM, white-label) not yet mobile-audited — they're app surfaces, lower marketing priority; revisit if the client wants mobile app UX too. De-AI visual polish is T-1.10.
- **Golden-rule check:** n/a (layout only).

### [2026-07-18] — T-1.14 — SEO structured data (JSON-LD)
- **Status:** DONE
- **What changed:**
  - **`Seo.jsx` gained a `jsonLd` prop** — injects a single managed `<script type="application/ld+json" data-seo-jsonld>` tag, replaced per page and **removed when a page passes no schema** (verified: /about has zero tags after visiting /pricing). Depends on the stringified schema so it doesn't thrash.
  - **New `frontend/src/data/structuredData.js`:** `ORGANIZATION_JSONLD` (name, url, logo, parentOrganization = Flacron Enterprises LLC, `sameAs` = the 6 real social profiles from the footer), `PRODUCT_JSONLD` (SoftwareApplication + AggregateOffer with a per-plan Offer — **prices pulled from `data/plans.js`** so structured data can't drift from the visible pricing), and `buildFaqJsonLd()` (FAQPage from a Q/A list).
  - **Wired:** Organization on Home, Product/Offers on Pricing, FAQPage on FAQs (built from the page's own `FAQS` array → 20 Q&A, always in sync).
- **Files touched:** frontend/src/components/Seo.jsx, frontend/src/data/structuredData.js (new), frontend/src/pages/{Home,Pricing,FAQs}.jsx.
- **QA done:** headless validation of all pages — Home=Organization ✓, Pricing=SoftwareApplication with offers Starter=$0/Professional=$39.99/Agency=$99.99/Enterprise=$499 ✓, FAQs=FAQPage 20 Q&A ✓, About=0 tags (cleanup works) ✓; each parses as valid JSON; build + lint (0 errors) + Vitest 2/2 pass.
- **Left / follow-ups:** could add BreadcrumbList later; when real review ratings exist, an aggregateRating could be added to the Product (only with real data). SPA caveat from T-1.12 still applies (client-side injection; fine for Google).
- **Golden-rule check:** #1 upheld — schemas contain only verifiable facts (real socials, real prices, real FAQ text); no ratings/counts invented.

### [2026-07-18] — T-0.2b — Authenticated app walkthrough (test account approved)
- **Status:** DONE (review/QA task — no app code changed)
- **Method (repeatable; scripts in E:/claude-scratch):** client approved creating a test account. To avoid production writes / AI cost / Brevo emails, ran the whole flow **locally**: `qa-account.js create` provisions a verified enterprise-tier user via the Firebase Admin SDK (no signup email); backend started locally with `ADMIN_EMAIL=qa-review@example.com` inline override (dotenv doesn't overwrite preset env) so the admin panel authorizes; frontend `.env` temporarily pointed at `localhost:3000` + `VITE_ADMIN_EMAIL` set (backed up first, **restored after**); `qa-walkthrough.js` logs in through the real UI (submit via Enter — there are TWO "Sign In" buttons, the mode-tab and the submit) and screenshots each page (waits for the auth spinner to clear — profile re-fetches on every full reload). **Teardown done + verified:** test user deleted from Auth + Firestore (`auth/user-not-found` confirmed), `frontend/.env` restored to prod (`onrender` URL, no admin email). Test account was `qa-review@example.com` (example.com = reserved test domain), Firestore doc flagged `_qaTestAccount` with a delete-guard.
- **Result:** all 8 gated pages load with the real auth flow, enterprise tier passing every `requireTier` gate, **0 console errors** on every page. Screenshots in E:/claude-scratch/qa-app/. Verified real, functional UI: **Dashboard** (5-step wizard, enterprise badge, unlimited limit), **Settings** (Profile/Security/API Keys/Notifications/Billing tabs, real profile data), **Subscriptions**, **CRM** (stat cards + activity/appointments), **White-Label Portal** (branding form + live preview + watermark), **Enterprise Dashboard** (polished overview, team, API keys), **Admin** (Overview/Customers/Leads tabs), **Admin Tier Update**.
- **Findings logged to backlog (below):** (1) White-Label "Custom Domain" section is a **non-functional feature** — UI has CNAME setup + "Verify Domain", but backend `whitelabel.js` only supports subdomains (Rule #4, and it's the same "custom domain" claim removed from marketing). (2) **Admin stats cards never populated** (skeletons persisted ~20s) — likely the O(n) whole-collection reads flagged in the T-0.1 audit (`sales.js` admin/stats), or slow token verify; needs investigation. (3) White-Label default **primary color still `#f97316`** (old orange), not brand `#FD4403` — token drift in the white-label config default.
- **Files touched:** PROGRESS.md only (walkthrough scripts live in scratch, not committed).
- **Golden-rule check:** none violated — test account created under explicit client authorization, run locally, fully torn down and verified; no customer data exposed externally (screenshots stayed in local scratch).

### [2026-07-18] — T-1.1b — Soften unverifiable claims + delete fabricated Blog (client directive)
- **Status:** DONE
- **Directive (2026-07-18):** "Remove or soften any claims that cannot be verified — report generation time, industry standards, accuracy %, certifications, customer statistics. Everything must be factual and verifiable."
- **What changed (served pages):**
  - **Generation-time claims removed:** Home features "…full CRU GROUP-standard reports in 60 seconds" → "drafts complete, consistently structured inspection reports in minutes — ready for your review"; how-it-works step 2 "Full report in ~60 seconds" → "assembles a structured draft report in minutes"; hero product-mock badge "Report ready in ~60 seconds" → "Draft ready / for your review"; Developers API step "typically takes 15–60 seconds" → "time depends on the number of photos submitted". Kept the softer, client-approved "in minutes" (vague/approximate, not a hard number).
  - **"CRU GROUP-standard" removed** from Home feature card and Footer tagline (unverifiable industry-standard claim). Footer now: "Draft professional reports in minutes — reviewed and approved by you."
  - **"Custom domain" → "custom subdomain"** in Home White-Label feature (backend supports subdomains only — Rule #4; matches the T-1.8 pricing fix).
  - **Deleted `Blog.jsx` + `BlogPost.jsx`** — unrouted dead pages that were the repo's biggest concentration of fabrication (invented "90-day study" with 82%/76%/91% accuracy figures, fake "70% time reduction" stats, CRU GROUP guideline claims, $299.99 stale price). Fully unreferenced (grep-confirmed), so deletion is user-invisible; recoverable from git history if a real blog is built later. Resolves the long-standing keep/delete open question in the direction the directive points.
- **Files touched:** frontend/src/pages/Home.jsx, frontend/src/components/Footer.jsx, frontend/src/pages/Developers.jsx; deleted frontend/src/pages/Blog.jsx, BlogPost.jsx.
- **QA done:** grep sweep of all served pages → no residual hard generation-time / CRU / carrier-compliant / accuracy-% claims (only "API keys revoked instantly" remains — a true UI behavior, not a marketing claim); Home features screenshot verifies softened copy; build passes (no broken Blog ref); lint 0 errors (warnings 36→32, Blog removed); Vitest 2/2.
- **Left / follow-ups:** if the client can supply REAL measured avg generation time, a factual speed claim can be reintroduced (still an open question). Dashboard/EnterpriseDashboard sample claim data uses definitive verdict language (Rule #2) — that's Phase 2 (aiService prompt + generator) scope, not marketing copy.
- **Golden-rule check:** #1 upheld and materially advanced (biggest fabrication source deleted; hard claims softened to verifiable statements).

### [2026-07-18] — T-1.8 — Pricing display + site-wide consistency
- **Status:** DONE
- **Client-confirmed prices (2026-07-18):** Starter $0 / Professional $39.99 / Agency $99.99 / Enterprise $499 monthly; annual billed yearly at 20% off.
- **What changed:**
  - **New single source of truth `frontend/src/data/plans.js`** — `PLAN_PRICING` (monthly + computed annual-per-month at 20% off) + `priceLabel()`. Directive was "no pricing inconsistencies anywhere," so prices now come from ONE place; changing Stripe pricing = editing this file only.
  - **Pricing.jsx (the main bug):** Agency $149.99 → **$99.99**, Enterprise $299.99 → **$499**; the wrong hardcoded annual figures (39.17 / 119.17 / 239.17) now derive from the source → **$31.99 / $79.99 / $399.20 per month** (Save $96 / $240 / $1,198 a year). The $31.99 annual now matches the FAQ's own example (previously contradicted it).
  - **Home.jsx pricing preview** + **Subscriptions.jsx** now read `PLAN_PRICING` (values unchanged, but no longer independently hardcoded).
  - **Consistency fixes:** Home Enterprise "Custom domain" → "Custom subdomain" (backend has subdomains only — Rule #4); Developers.jsx "$99/mo" → "$99.99/mo" and corrected which tiers include API access (Professional+); Subscriptions "Basic/Advanced AI" → "AI report generation" / "API access" (no fake tier split).
  - Admin pages (AdminTierUpdate, AdminDashboard) already showed correct $39.99/$99.99/$499 — left as-is (internal, consistent).
- **Files touched:** frontend/src/data/plans.js (new), frontend/src/pages/{Pricing,Home,Subscriptions,Developers}.jsx, PROGRESS.md.
- **QA done:** computed values printed from the source (31.99/79.99/399.20, savings 96/240/1198 ✓); Pricing page screenshotted monthly ($0/$39.99/$99.99/$499.00) AND annual (toggled: $31.99/$79.99/$399.20 + Save/year) — E:/claude-scratch/t18-qa/; Home preview screenshot confirms $0/$39.99/$99.99/$499 + "Custom subdomain"; 0 console errors; lint 0 errors; Vitest 2/2; build passes.
- **Left / follow-ups:** Blog.jsx still contains "$299.99" but it's dead/unrouted (pending keep-delete decision) — not "on the website", left flagged. "Unlimited" (Enterprise) is genuinely uncapped server-side (`tiers.js` -1), so shown as plain "Unlimited reports" with no invented fair-use policy — if the client wants a fair-use clause it needs to be added to ToS AND enforced first. Prices are hardcoded to match Stripe by hand; a future task could fetch live Stripe prices at build/runtime to guarantee parity automatically.
- **Golden-rule check:** #4 upheld (displayed prices/features match server + Stripe; removed the nonexistent custom-domain + AI-tier claims).

### [2026-07-18] — T-3.10a — Security: lock down public uploads (client-escalated, pulled forward)
- **Status:** DONE
- **Why now:** client flagged public claim-photo access as high priority ("secure all uploaded files immediately").
- **The hole:** `server.js` served the entire `uploads/` tree at `/uploads` with `express.static` and no auth. Claim/report photos (`uploads/{uid}/reports/{reportId}/…`) and generated exports (`…/exports/…`) — sensitive PII/claim evidence — were downloadable by anyone who knew or guessed the path (predictable: uid + reportId + timestamp-rand filename).
- **What changed:**
  - New `backend/middleware/uploadAccess.js` → `resolvePublicUpload(uploadDir, reqPath)`: **allows only branding assets** (`logos/`, `whitelabel/` — user logos shown in-app + white-label logos shown on the public `/enterprise/:subdomain` portal). Everything else (reports, exports) → denied (404, doesn't even confirm existence).
  - It **resolves** the path before deciding, so traversal smuggling like `/<uid>/logos/../reports/<id>/photo.jpg` (raw and `%2e%2e`-encoded) is blocked, as are paths escaping the uploads root and malformed percent-encodings.
  - `server.js` static mount now runs that guard first.
  - Reports images were never fetched by the browser (server-side only: AI analysis + PDF embedding), and exports already have the authenticated ownership-checked `GET /api/reports/:id/download`, so **no app functionality is lost** — logos still load (verified).
- **Files touched:** backend/server.js, backend/middleware/uploadAccess.js (new), backend/test/uploadAccess.test.js (new).
- **QA done:** live curl matrix against running backend — logos/whitelabel 200; reports/exports 404 with no body leak; raw + encoded traversal 404 + no leak; root-escape 404. Extracted the guard and pinned it with **7 unit tests** (`npm test` → 13/13 pass incl. tiers). Lint 0 errors. Test fixtures created under `uploads/` then removed (uploads/ is gitignored — nothing committed).
- **Left / follow-ups (rest of T-3.10, still open):** (1) **at-rest encryption / cloud storage** — files are still on Render's ephemeral local disk (lost every deploy; `imagePaths` go dangling) → should move to Firebase Storage/S3 with signed URLs; (2) if a future feature needs to SHOW claim photos in-browser, add an authenticated ownership-checked image endpoint (do NOT re-open public serving); (3) MFA, audit logs, malware scan, data-retention — later T-3.10 sub-items. Also update the Home trust strip with a storage card once (1) is done.
- **Golden-rule check:** #6 upheld and materially advanced (claim data no longer world-readable).

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
- [x] **Admin email** → **RESOLVED 2026-07-18.** Official admin = **admin@flacronenterprises.com**; fixed firestore.rules + both .env.examples. (Redeploy rules to Firebase for prod effect; ensure Render `ADMIN_EMAIL` is set to it.)
- [x] **AI provider direction** → **DECIDED 2026-07-18.** **Claude API = primary, IBM watsonx = fallback, remove ALL deprecated OpenAI models/code.** Big backend task queued (needs `ANTHROPIC_API_KEY`; use the `claude-api` skill for model IDs/SDK).
- [x] **File storage** → **DECIDED 2026-07-18.** Migrate all uploads to **Firebase Storage** (already on Firebase), off Render's local disk. Big backend task queued (reports/exports/logos + `imagePaths` + signed access).
- [x] **Email provider** → **CHANGED 2026-07-18.** Dropping **Brevo → AWS SES**. Needs AWS creds + coordination; update `emailService.js` + templates + branding. Blocked on AWS setup.
- [x] **Public `/uploads` exposure:** → **RESOLVED 2026-07-18 (T-3.10a).** Client escalated; claim photos + exports no longer publicly served (only branding logos). NOTE still open: files remain on Render's ephemeral disk (see the "uploads being lost" item) — durable cloud storage + at-rest encryption is the remaining part of T-3.10.
- [x] Blog pages (`Blog.jsx`, `BlogPost.jsx`) — **DELETED 2026-07-18 (T-1.1b).** Unrouted dead code full of fabricated studies/stats; removed per the "everything must be factual" directive. Recoverable from git if a real, factual blog is wanted later.
- [ ] **Real testimonials wanted (T-1.9 shipped hidden):** the home-page testimonials section now renders only from `frontend/src/data/testimonials.js` (empty). Please collect genuine customer feedback WITH written permission (name or initials, role, quote, date; carrier names only with authorization) and it can go live by filling that file.
- [x] **Test account for authed baselines:** → **APPROVED + DONE 2026-07-18 (T-0.2b).** Walkthrough complete; all authed pages render as real functional UI, 0 console errors. Test account created locally + fully torn down. Findings in the backlog below.
- [x] **Marketing-claim softening** → **DONE 2026-07-18 (T-1.1b).**
- [x] **Pricing conflict** → **DONE 2026-07-18 (T-1.8).**
- [x] **Pricing conflict:** → **RESOLVED 2026-07-18.** Client confirmed the correct monthly prices are **Starter $0 / Professional $39.99 / Agency $99.99 / Enterprise $499** (screenshot). Directive: **every page must match the prices configured in Stripe — no inconsistencies anywhere.** So the Pricing-page outliers ($149.99, $299.99) are the bug to fix (T-1.8, now unblocked). Report counts already aligned to `tiers.js` 5/50/200/unlimited in T-1.1.
- [x] **Marketing-claim softening:** → **DIRECTIVE 2026-07-18.** Client: "Remove or soften any claims that cannot be verified — report generation time, industry standards, accuracy %, certifications, customer statistics. Everything must be factual and verifiable." Applies to the **"~60 seconds"** claim, **"CRU GROUP-standard"** wording (Home hero/feature/footer), and any residual stats. (To do — T-1.1 follow-up pass.)
- [x] **Canonical domain:** → **2026-07-18.** Both www and non-www serve; keeping non-www (`https://flacronai.com`) as the single canonical (already set in Seo + sitemap). No change needed.
- [ ] Is there real usage data we ARE allowed to display (e.g. real avg generation time)? (Still open — needed before re-adding any timing claim.)
- [ ] **2026-07-31 — Revoke the exposed live API key** (T-6.1). Client's screenshot shows a full `flac_live_...` key. This must be revoked from Settings → API Keys (and a new one issued) by whoever holds that account — it's an account action, not something I can do from the repo.
- [ ] **2026-07-31 — Fix Stripe business identity** (T-6.3). Checkout currently shows a personal name as the merchant instead of "FlacronAI by Flacron Enterprises LLC." Needs updating in the Stripe Dashboard (business profile, statement descriptor, support email/logo/policy links) — out-of-repo.
- [ ] **2026-07-31 — Claim/report data-model change** (T-6.16): linking `claimNumber` to a real CRM claim record (vs. today's free-typed string) is a real schema change. Before starting: how should existing reports with only a text claim number be handled — leave as unlinked legacy records, or backfill-match to `crmClaims` by number?
- [ ] **2026-07-31 — Enterprise pricing positioning** (T-6.30): client flagged that Enterprise shows both a public "$499/month" price AND "Contact Sales," which is contradictory. Decide: keep a public anchor price with a "Start Enterprise" CTA, or go fully custom/sales-only. Needs a client decision, not a code guess.

---

## Remaining / Nice-to-have backlog (not scheduled yet)

- [x] **White-Label "Custom Domain" non-functional** → **RESOLVED 2026-07-18** — marked "Coming Soon" per client (removed CNAME/verify UI + dead code). Backend `verifyDomain` endpoint still exists unused; remove if/when custom domains are actually built.
- [x] **Admin dashboard stats never populate** — **FIXED 2026-07-18 (T-3.3a).** Root cause: an un-timeboxed Stripe `charges.list` call could hang the whole response indefinitely. Time-boxed it (4s) + switched reports/leads to Firestore count() aggregations. Verified 200 in ~2.6s with real stats.
- [x] **White-Label default primary color** → **FIXED 2026-07-19 (T-1.10)** — DEFAULT_CONFIG primaryColor `#f97316`→`#FD4403`, secondary → brand navy `#002A64`.
- **[from T-3.3a] backend `.env` `FIREBASE_API_KEY` is a 7-char placeholder** (real web key is 39 chars) — backend REST `/api/auth/login` password verification fails locally; confirm the prod Render env has the real key, or the login endpoint is dead there too.
- **`sales.js` admin/users + leads still read whole collections** (in-memory pagination) — convert to real Firestore cursor pagination.
- **Official SVG logo (client requested 2026-07-18):** current logo assets are raster (extracted from the client PNG). Best done by a designer; alternatively we can vectorize the FA mark to a clean SVG (approximate). Would sharpen the navbar/favicon at all sizes and shrink bytes further.
- **White-Label default primary color `#f97316` → brand `#FD4403`** (from walkthrough) — small config default fix, do alongside the next white-label backend task.
