# TASKS.md — Micro-Task Backlog

Each task = one small, shippable change. Format:
- **Goal** — what to achieve
- **Covers** — which requirement section(s)
- **Acceptance** — done when all true
- **QA** — must actually test these
- **Dep** — depends on

> Do tasks in order within a phase. Never batch multiple tasks into one change.

---

# PHASE 0 — Audit & Setup

### T-0.1 — Full project audit
- **Goal:** Understand the existing project and fill CLAUDE.md §4 (Tech Stack), §5 (Project Map).
- **Acceptance:**
  - Tech stack, run commands, DB, auth, payments, AI provider, storage all identified and written into CLAUDE.md.
  - Project map filled (where each area lives).
  - A "Known issues / tech debt" list written into CLAUDE.md §5.
  - No code changed in this task — audit only.
- **QA:** Re-open CLAUDE.md; a new engineer could get productive from it alone.

### T-0.2 — Run locally + baseline
- **Goal:** Get dev server running; capture baseline screenshots of every page (desktop + mobile).
- **Acceptance:** App runs; screenshots saved to `/docs/baseline/`; broken things noted in PROGRESS.md.
- **QA:** Each main route loads without fatal error.
- **Dep:** T-0.1

### T-0.3 — Tooling scaffold
- **Goal:** Ensure linter, formatter, and a test runner exist (add if missing, minimal config).
- **Acceptance:** `lint`, `format`, `test` commands documented in CLAUDE.md §4.
- **QA:** Each command runs successfully.
- **Dep:** T-0.1

---

# PHASE 1 — Website, Brand, SEO, Conversion
*(Requirement sections 1, 2, 3, 11, 14, 15, 16, 25, 26 + brand/logo/SEO extras)*

### T-1.1 — Remove unverified claims
- **Goal:** Strip fabricated stats/testimonials/badges site-wide.
- **Covers:** §3, §25.
- **Acceptance:** No "50,000+ reports", "98% accuracy", "10× faster", "thousands of professionals", fake logos, fake certs anywhere. Replaced with verifiable facts (templates count, export formats, max photos/report, integrations) OR removed.
- **QA:** grep the codebase for the numbers/phrases; visually scan every page; none remain.
- **Golden Rule #1.**

### T-1.2 — Brand design tokens
- **Goal:** Define a single design-token source (colors, typography scale, spacing scale, radius, shadows).
- **Covers:** design "not AI-looking" goal.
- **Acceptance:** One tokens file; a distinct palette (not default template blue/gradient); a real type pairing; tokens consumed by components, not hard-coded hex scattered around.
- **QA:** Change a token → reflects across UI. No stray hard-coded colors in touched components.
- **Dep:** T-0.1

### T-1.3 — Logo + favicon
- **Goal:** Replace logo everywhere; generate favicon/app-icon set.
- **Acceptance:** New logo in header/footer/emails/loading; favicon + apple-touch + og-image present; old logo fully removed.
- **QA:** Check header, footer, browser tab, mobile home-screen icon, social share preview.
- **Dep:** T-1.2; **needs assets from client (see Open Questions).**

### T-1.4 — Hero rebuild
- **Goal:** New hero per §2.
- **Covers:** §1, §2.
- **Acceptance:** Specific headline ("Generate Professional Insurance Inspection Reports in Minutes" or client-approved variant); sub-line explaining the human-review + AI-assist positioning; states who it's for; primary CTA "Generate My First Report Free", secondary "View Sample Report"; trust line (no credit card, human review, PDF/DOCX, secure upload, cancel anytime); reduced empty space.
- **QA:** Renders desktop+mobile; CTAs navigate correctly; no layout gaps; H1 present & unique.
- **Dep:** T-1.2

### T-1.5 — Product demo / bigger screenshot
- **Goal:** Large, clear product visual showing upload→generate workflow.
- **Covers:** §2.
- **Acceptance:** Screenshot/animation is prominent and legible; shows real UI (not generic mockup); optimized image (see T-1.15).
- **QA:** Sharp on retina + mobile; lazy-loaded below fold; has alt text.
- **Dep:** T-1.4

### T-1.6 — Sample report preview + download
- **Goal:** Let visitors view/download a real sample report.
- **Covers:** §2, §14.
- **Acceptance:** "View Sample Report" opens a real, cautious-language sample; downloadable (gated behind opt-in only if client wants — coordinate with T-1.16).
- **QA:** Preview renders; download works; sample contains only cautious AI language (Golden Rule #2).

### T-1.7 — CTAs + trust/security strip
- **Goal:** Consistent CTAs + a trust section (real security facts only).
- **Covers:** §2, §22.
- **Acceptance:** CTAs consistent site-wide; trust strip lists only true features; NO compliance badges yet (Golden Rule #6).
- **QA:** Every CTA leads to the right place; no fake badge.

### T-1.8 — Pricing display
- **Goal:** Rebuild pricing section per §11.
- **Covers:** §11.
- **Acceptance:** Starter(Free)/Professional($39.99)/Agency($99.99)/Enterprise(Custom) with correct feature lists; enterprise = "custom / contact"; a note on whether "unlimited" has reasonable-use policy; no feature listed that isn't functional (Golden Rule #4).
- **QA:** Prices/features match doc; CTAs to signup/contact work; JSON-LD Offer added (T-1.14).

### T-1.9 — Testimonials (real only)
- **Goal:** Larger, readable testimonial cards — real approved feedback only.
- **Covers:** §25.
- **Acceptance:** If no real testimonials exist yet, hide the section or show a neutral placeholder — do NOT fabricate. Cards support name/initials, role, report type, benefit, verified label, date, rating.
- **QA:** No invented people; no carrier logos without authorization.
- **Golden Rule #1.**

### T-1.10 — "De-AI" pass
- **Goal:** Make each landing page feel intentional and human-designed.
- **Acceptance:** Remove generic gradients/emoji-as-icons/lorem; consistent spacing rhythm using tokens; real copy; custom or purposeful imagery; varied, intentional sections (not repetitive card grids).
- **QA:** Side-by-side vs baseline screenshots; reads as a real product site.
- **Dep:** T-1.2

### T-1.11 — Marketing mobile pass
- **Goal:** Landing pages fully responsive.
- **Covers:** §26 (marketing portion).
- **Acceptance:** No horizontal scroll; readable tap targets; hero/pricing/testimonials stack cleanly.
- **QA:** Test at 360px, 390px, 768px widths.

### T-1.12 — SEO on-page (per page)
- **Goal:** Unique title + meta description + single H1 + semantic headings + canonical per page.
- **Acceptance:** Every public page has all of the above; alt text on images.
- **QA:** View source on each page; validate uniqueness; one H1 each.

### T-1.13 — SEO technical base
- **Goal:** sitemap.xml, robots.txt, canonical strategy, 404 handling.
- **Acceptance:** Valid sitemap listing public URLs; robots allows crawl of public, blocks app/admin; canonicals correct.
- **QA:** Fetch /sitemap.xml and /robots.txt; validate.

### T-1.14 — SEO structured data
- **Goal:** JSON-LD for Organization, Product/Offer (pricing), FAQ if present.
- **Acceptance:** Valid schema.org JSON-LD injected.
- **QA:** Passes a schema validator; no errors.

### T-1.15 — SEO performance + images
- **Goal:** Good Core Web Vitals; optimized images.
- **Acceptance:** Images sized/compressed/next-gen format + lazy-load; no render-blocking regressions; good LCP on hero.
- **QA:** Lighthouse on homepage; note before/after in PROGRESS.md.

### T-1.16 — Opt-in lead capture
- **Goal:** Permission-based lead forms at approved locations.
- **Covers:** §14, §15, §16.
- **Acceptance:** Forms collect only needed fields per lead magnet; marketing consent checkbox **not pre-checked**; records consent metadata (type, timestamp, form location/version, source page); non-intrusive; separate email/SMS consent.
- **QA:** Submit form → lead stored + consent recorded; checkbox defaults unchecked (Golden Rule #5).
- **Dep:** may need backend (coordinate with Phase 4).

---

# PHASE 2 — Core Reporting Platform
*(Requirement sections 4, 5, 6, 7, 27, 28, 29)*

### T-2.1 — Claim/Inspection creation form (Step 1)
- **Covers:** §4 Step 1.
- **Acceptance:** Collects all Step-1 fields (claim #, policy #, insured, address, dates, loss type, adjuster, carrier, inspection company, contacts, report type, property type, weather, notes); validation; saves as draft.
- **QA:** Create a claim; reload; data persists; required-field validation works.

### T-2.2 — Inspection areas (Step 2)
- **Covers:** §4 Step 2.
- **Acceptance:** Add/organize findings by predefined areas + custom areas.
- **QA:** Add several areas incl. a custom one; reorder; persists.

### T-2.3 — Evidence upload (Step 3)
- **Covers:** §4 Step 3, §22 (upload validation).
- **Acceptance:** Multi-file (photos/video/PDF/docs); file-type + size validation; malware/scan hook or safe handling; captions; area tagging; reorder; remove.
- **QA:** Upload valid + invalid files; invalid rejected; caption/tag/reorder/remove all work.

### T-2.4 — Photo annotation
- **Covers:** §4 Step 3, §6.
- **Acceptance:** Arrows/circles/highlight/measurements/timestamps on photos; annotations saved.
- **QA:** Annotate, save, reload — annotations persist.

### T-2.5 — AI-assisted analysis (Step 4)
- **Covers:** §4 Step 4, §6.
- **Acceptance:** AI drafts observations/summaries/sections using **cautious language only**; never outputs prohibited final verdicts; output is a *suggestion*, not auto-inserted.
- **QA:** Trigger analysis; verify wording is cautious; verify no coverage/liability/fraud/etc. conclusions (Golden Rule #2).

### T-2.6 — AI suggestion review UI
- **Covers:** §6.
- **Acceptance:** Each suggestion shows related photo, suggested damage type, confidence, explanation, "human verification recommended", timestamp, approver. Actions: accept/reject/edit/mark-uncertain/re-analyze/add professional conclusion. Nothing enters final report until accepted.
- **QA:** Reject a suggestion → not in report; accept → appears with approver logged (Golden Rule #3).

### T-2.7 — Human-review gate (Step 5)
- **Covers:** §4 Step 5.
- **Acceptance:** Pre-finalize review screen of all sections; required confirmation checkbox with the exact statement; cannot finalize without it.
- **QA:** Try to finalize without confirming → blocked; with confirm → allowed.

### T-2.8 — Missing-documentation checker (Step 5 support)
- **Covers:** §7.
- **Acceptance:** Readiness checklist flags missing/low-quality/conflicting items before export.
- **QA:** Create a report with gaps → correct flags shown.

### T-2.9 — Export & share (Step 6)
- **Covers:** §4 Step 6.
- **Acceptance:** PDF + DOCX export; web report; secure share link; full preview before export; branding respects plan (see Phase 3 white-label).
- **QA:** Export both formats; open share link in incognito; preview matches export.
- **Expanded 2026-08-19 by PHASES.md Phase 19 (Sharing Permissions, Expiry, Comments & Review Requests):** the original single-token, view-only, non-expiring share link is kept, untouched, for backward compatibility (`POST/DELETE /:id/share`, `GET /shared/:token` still serve it exactly as before). A full permission/expiry layer now exists alongside it: a new `reportShares` collection backs `POST/GET /:id/shares` + `DELETE /:id/shares/:shareId` (View/Comment/Review permission levels, optional 24h/7d/30d expiry, server-enforced on every fetch), a separate "Invite User" mechanism (`POST/DELETE /:id/share/invite[/:uid]`) grants a named existing FlacronAI account per-report access independent of team membership, and a supervisor review-request workflow (`POST /:id/request-review`, `POST /:id/review-response`, plus `GET /reports/assigned-to-me`) lets an owner assign an in-organization reviewer who can comment/edit/approve one specific report without ever seeing the rest of the organization's report pool. Section-anchored comments (add/reply/resolve/reopen) live in a new `reports/{id}/comments` subcollection, anchored by a content-based section-title slug (not position) so they survive reordering. See `PROGRESS.md`'s Phase 19 entry and `PHASES.md` Phase 19 for full implementation/testing detail and the 3 scope decisions confirmed before implementation (existing-accounts-only invite; Comment/Review shares may target a draft with an explicit DRAFT banner; an anonymous Review-permission link gets elevated comment-management only, never approve/reject).

### T-2.10 — Report templates
- **Covers:** §5.
- **Acceptance:** Multiple templates (property, roof, water, fire/smoke, wind/hail, storm, theft/vandalism, auto, commercial, GL, personal-property inventory, restoration progress, supplement, reinspection, final completion, custom enterprise) — each with own required fields/sections/disclaimers. (Ship incrementally: one template per sub-task if large.)
- **QA:** Each template renders its own structure + disclaimer.
- **Superseded/expanded 2026-08-18 by PHASES.md Phase 13 (Real Template Builder):** the original shallow implementation (flat per-user field-defaults, `backend/routes/reports.js`'s `/reports/templates` endpoints, `reportTemplates` Firestore collection) is kept, untouched, for backward compatibility. A real structural template system now exists alongside it: `backend/services/templateService.js` + `backend/routes/templates.js` (new `templates` Firestore collection) — name/description/report sections/required fields/default wording/photo layout/org branding, with My/Organization/Flacron scopes, real Create/Edit/Duplicate/Archive/Restore/Delete, and 6 seeded Flacron example templates (Residential Property, Water Loss, Roof, Wind/Hail, Fire, Commercial Property) covering most of this task's originally-listed loss types. The remaining named examples (storm, theft/vandalism, auto, commercial-GL, personal-property inventory, restoration progress, supplement, reinspection, final completion) are not yet seeded — anyone can create them as ordinary templates today; seeding more Flacron-provided examples is a small follow-up, not a new feature. See PROGRESS.md's Phase 13 entry and PHASES.md Phase 13 for full detail.

### T-2.11 — Voice-to-report
- **Covers:** §27.
- **Acceptance:** Record voice note → transcribe → associate to room/photo → convert to professional language → keep original transcript → editable → requires human approval.
- **QA:** Record, transcribe, edit, approve; original transcript preserved.

### T-2.12 — E-signatures & approval
- **Covers:** §28.
- **Acceptance:** Inspector/adjuster/supervisor/client signature capture; date signed; report version; audit trail; clearly distinguishes a basic drawn signature from a regulated e-sign workflow.
- **QA:** Sign, verify audit trail entry, verify labeling.

### T-2.13 — Version history & audit log
- **Covers:** §29.
- **Acceptance:** Track who created/edited/what/when, AI vs human content, rejected suggestions, exports, shares, approvals, signatures, deleted evidence, restores. Compare + restore where permitted.
- **QA:** Edit → history entry; restore a version; permission-gated.

---

# PHASE 3 — Subscription & Operations
*(Requirement sections 8, 9, 10, 12, 13, 20, 22, 23, 24)*

### T-3.1 — Entitlement engine (core)
- **Covers:** §10.
- **Acceptance:** Server-side source of truth for plan → features/limits (report limit, photo-analysis, storage, seats, export formats, white-label, API, CRM, custom templates, branding, support level). Every gated action checks it server-side.
- **QA:** As free user, attempt paid action → blocked server-side (not just hidden). As paid → allowed (Golden Rule #4).

### T-3.2 — Subscription lifecycle
- **Covers:** §10.
- **Acceptance:** Handle active/expired/trial/payment-failure/upgrade/downgrade/cancel/refund states correctly; **Stripe** webhooks reconcile state (subscribe to and handle the relevant events; verify webhook signatures).
- **QA:** Simulate each state (test mode) → entitlements update correctly.

### T-3.3 — Usage tracking
- **Covers:** §10, §12.
- **Acceptance:** Count reports generated, photos analyzed, storage, seats used; enforce limits; warn near limit.
- **QA:** Generate up to limit → blocked at limit; usage numbers accurate.

### T-3.4 — Usage & billing page
- **Covers:** §12.
- **Acceptance:** Shows plan/status/renewal, reports used/remaining, photos analyzed, storage, seats, integrations, billing history, downloadable invoices, upgrade/downgrade/cancel, payment method, failed-payment alerts.
- **QA:** All numbers match backend; invoice downloads; upgrade/cancel flows work.

### T-3.5 — Subscription automated tests
- **Covers:** §13.
- **Acceptance:** Tests for new sub, trial activation/expiry, payment success/fail, renewal, cancel, upgrade (immediate), downgrade (scheduled), refund, expired card, duplicate payment, webhook failure, report-limit enforcement, seat enforcement, API-access enforcement, white-label access, restoration after payment recovery.
- **QA:** Test suite runs green; covers each listed case.
- **Dep:** T-3.1..T-3.3

### T-3.6 — User dashboard
- **Covers:** §8.
- **Acceptance:** Shows totals (all/draft/awaiting-review/completed/shared), monthly usage, plan, storage, AI usage, team activity, recent reports, follow-ups; quick actions; report cards with all listed fields.
- **QA:** Numbers match; quick actions work; cards show correct status.

### T-3.7 — Report statuses & workflow
- **Covers:** §9.
- **Acceptance:** Status enum (New→…→Archived); transitions enforced; enterprise admins can build approval workflows (e.g. Inspector→Senior Reviewer→Claims Manager→Final Export).
- **QA:** Move a report through statuses; invalid transitions blocked; a custom workflow enforced.

### T-3.8 — Roles & permissions
- **Covers:** §23.
- **Acceptance:** Roles (owner/admin/claims-manager/senior-reviewer/adjuster/inspector/contractor/editor/read-only/billing/API) with granular permissions (create/edit/AI/approve/finalize/export/share/delete/billing/team/integrations/templates/analytics/API).
- **QA:** Each role can do only its permitted actions; enforced server-side.

### T-3.9 — Transactional notifications
- **Covers:** §20.
- **Acceptance:** Send for account/report/AI/review/approval/share/export/team/subscription/payment/usage/storage events; kept separate from marketing; users manage non-essential product notifications separately.
- **QA:** Trigger each event → correct notification; unsubscribing marketing does NOT stop transactional (Golden Rule #5).
- **Expanded 2026-08-19 by PHASES.md Phase 20 (Notifications Center & Global Search):** every transactional email above now has a persistent, in-app counterpart in a new top-level `notifications` collection — analysis completed/failed, report generated (= "ready for review", the same instant in this codebase's state machine), review requested/declined, report approved, report access granted, export completed, team invitation (existing-account recipients only), and subscription issue — each reusing Phase 18's existing preference toggle where one exists (export/team-invite are deliberately ungated, matching precedent rather than fabricating new toggle keys). A bell/feed UI (`GET/POST /api/notifications*`, `NotificationBell.jsx`) exposes unread count, mark-one/mark-all-read, and bounded pagination. A companion, previously-unscoped feature — global CMD/CTRL+K search (`GET /api/search`, `GlobalSearch.jsx`) across claim number/insured/address/photo/team-member — was built in the same phase per PHASES.md Phase 20 (Item 45, not previously in this backlog), permission-scoped exactly to Phase 19's own report-access model (never an organization's full pool). See `PROGRESS.md`'s Phase 20 entry and `PHASES.md` Phase 20 for full implementation/testing detail.

### T-3.10 — Security hardening
- **Covers:** §22.
- **Acceptance:** Encryption in transit + at rest; RBAC; upload validation; malware scan; signed URLs; session mgmt; MFA option; audit logs; backup/recovery; data-retention settings; account + document deletion; login alerts; suspicious-activity detection; API rate limiting; secret management; env separation; least privilege.
- **QA:** Signed URLs expire; RBAC blocks cross-tenant access; MFA enroll/login works. (Ship incrementally per sub-item.)

### T-3.11 — White-label settings
- **Covers:** §24.
- **Acceptance:** Agency/enterprise configure logo/name/colors/header/footer/contact/disclaimer/domain/email-sender/email-templates/client-portal/custom-templates. FlacronAI branding removed ONLY on plans with white-label entitlement.
- **QA:** Branded report on white-label plan has no FlacronAI mark; non-white-label plan still shows it (ties to T-3.1).

---

# PHASE 4 — Marketing & Growth Automation
*(Requirement sections 14, 16, 17, 18, 19, 21 CRM, 31)*

### T-4.1 — Consent & privacy backend
- **Covers:** §16.
- **Acceptance:** Store consent type/date/form-location/version/language/contact/source/campaign/IP-where-legal/withdrawal; unsubscribe; SMS STOP; preference center; email verification/double opt-in option; suppression list; do-not-contact; cookie consent; privacy link; separate email/SMS/push consent.
- **QA:** Opt in → recorded; unsubscribe → suppressed; STOP → SMS stopped.
- **Golden Rule #5.**

### T-4.2 — Lead storage & segmentation
- **Covers:** §17, §18.
- **Acceptance:** Validate → record consent → store securely → tag by interest (all listed tags).
- **QA:** Submit varied forms → correct tags applied.
- **Dep:** T-4.1

### T-4.3 — Lead-magnet delivery
- **Covers:** §17.
- **Acceptance:** Deliver promised sample report / checklist / guide + welcome email; place into correct automation.
- **QA:** Each magnet delivers the right asset.

### T-4.4 — Automation campaigns
- **Covers:** §19.
- **Acceptance:** Flows for welcome, sample delivery, checklist, product education, abandoned states (report started/photos-not-generated/generated-not-reviewed/completed-not-exported/checkout), trial activation/ending, free-to-paid, failed payment, renewal, cancellation, re-engagement, agency demo, enterprise follow-up, API interest, white-label interest. **No promo without valid consent.**
- **QA:** Trigger a flow with consent → sends; without consent → does NOT send (Golden Rule #5).
- **Dep:** T-4.1, T-4.2

### T-4.5 — CRM integrations
- **Covers:** §21.
- **Acceptance:** Prepared integrations (HubSpot/Salesforce/Zoho/Dynamics/Guidewire/Applied Epic/Dropbox/Drive/OneDrive/SharePoint/Zapier/Make/Slack/Teams/email/storage). Ship incrementally, one connector per sub-task. Feature only shown if entitlement + actually working.
- **QA:** Each connector: connect → push a test record → verify in target.

### T-4.6 — Event tracking
- **Covers:** §31.
- **Acceptance:** Track all listed events (page view, CTA, pricing view, opt-in shown/submitted, account created, inspection started, photo uploaded, voice note, AI started/completed, suggestion accepted/rejected, report generated/edited/approved/exported/shared, checkout started, payment completed, upgrade, cancel, integration connected, API key created, demo requested, contact-sales submitted).
- **QA:** Perform each action → event fires with correct props.

---

# PHASE 5 — Enterprise & API
*(Requirement sections 10 enterprise, 11 enterprise, 21 API, 22, 30)*

### T-5.1 — REST API core
- **Covers:** §21.
- **Acceptance:** Endpoints: create report, upload evidence, get report status, download report, add claim info, manage users, get usage. Auth + authorization + rate limits + plan checks + logging on every call.
- **QA:** Each endpoint: authorized call works, unauthorized blocked, over-limit rate-limited, over-plan blocked.

### T-5.2 — Webhooks
- **Covers:** §21.
- **Acceptance:** Emit webhook events; signed; ret/retry on failure; logged.
- **QA:** Subscribe → receive signed event; simulate failure → retry.

### T-5.3 — SSO
- **Covers:** §11 enterprise.
- **Acceptance:** SSO login for enterprise (SAML/OIDC as appropriate).
- **QA:** SSO login round-trip works; entitlement-gated to enterprise.

### T-5.4 — Custom templates & domains
- **Covers:** §11, §24.
- **Acceptance:** Enterprise custom report templates + custom domain support.
- **QA:** Custom template renders; custom domain resolves + SSL.

### T-5.5 — Enterprise security controls + data retention
- **Covers:** §11, §22.
- **Acceptance:** Advanced permissions, audit logs, data-retention configuration, private-deployment notes, SLA reporting scaffold.
- **QA:** Retention policy deletes on schedule (test window); audit log complete.

### T-5.6 — Admin dashboard
- **Covers:** §30.
- **Acceptance:** Manage users/orgs/plans/subscriptions/payments/usage/reports/templates/AI-requests/storage/leads/consent/campaigns/testimonials/integrations/API-keys/support/refunds/feature-flags/security-events/failed-jobs/system-notifications. Analytics: visitor→lead, lead→registration, registration→report, completion rate, export rate, free→paid, trial conversion, avg generation time, AI cost/report, storage cost/account, active users, cancellations, failed payments, template usage, enterprise leads, API usage.
- **QA:** Each admin section loads real data; analytics numbers reconcile with source.
- **Dep:** most of Phases 2–4.

### T-5.7 — Enterprise pricing model
- **Covers:** §11.
- **Acceptance:** Replace fixed $499 with usage/user/storage/integration/support/customization-based custom pricing + "contact sales"; clarify reasonable-use policy on "unlimited".
- **QA:** Pricing page + sales flow reflect this.

---

## Notes on sequencing
- Phase 0 must finish before anything.
- Phase 1 is safe to do early (mostly front-end, high client-visible value).
- T-3.1 (entitlements) should land before T-3.11 / T-4 / T-5 features that depend on plan checks.
- Big tasks (T-2.10 templates, T-3.10 security, T-4.5 CRM) ship as one sub-task at a time.

---

# PHASE 6 — 2026-07-31 Client Product Audit Follow-ups

Source: client walkthrough of the live product (screenshots of API keys, My Reports, CRM, calendar, billing, approval flow) + a reference "what a finished sample report should look like" PDF. Original doc had 42 numbered items grouped into the client's own three priority tiers — kept below. A code audit (2026-07-31) checked each against current `flacron/improvements` state; status shown where verified. **Ship one sub-task at a time per Golden Rule #7 — this section is a backlog, not a batch to do in one commit.**

## P1 — Security & launch blockers

### T-6.1 — Revoke + rotate the exposed live API key
- **Client item:** #1 (partial — masking already shipped).
- **Status:** Key masking/hashing/last-used already **DONE** (Settings.jsx key list never re-displays the raw key; `apiKeyService.js` stores SHA-256 hash only). What's outstanding is an **out-of-code action**: the specific key shown in the client's screenshot must be revoked from Settings → API Keys by whoever holds that account, and a fresh key issued. Not a code task.
- **Follow-up (real code gap):** add an "Environment: Live/Test" label and a delete-confirmation dialog to the key list (ties into T-6.19 confirmation dialogs).

### T-6.2 — Purge personal/sensitive data from anything client-facing
- **Client item:** #2.
- **Goal:** Any demo data, screenshots, or seeded accounts used for sales/marketing/investor demos use fictional data only (e.g. `demo@flacronai.com`, "Sarah Mitchell", "ABC Claims Services") — never real customer PII, real names, real emails, real card numbers.
- **Acceptance:** Confirm `backend/scripts/make-sample-report.js` sample data is fictional (it is — matches the reference PDF). Audit any other seed/demo scripts for real data. No code change expected unless a seed script is found using real data.
- **QA:** grep repo for real emails/phone numbers/addresses outside test fixtures.

### T-6.3 — Fix Stripe business identity
- **Client item:** #16.
- **Status:** OUT-OF-CODE — Stripe Dashboard settings (business name, statement descriptor, support email/logo/policy links). Not a repo change. Flag for client to update directly in Stripe.

### T-6.4 — Harden report status against manual/unauthorized transitions
- **Client item:** #3.
- **Status:** PARTIAL. No free status-picker exists in the "My Reports" UI (the `<select>` at `Dashboard.jsx:1507` is a *view filter*, not a per-report editor) — client's screenshot concern doesn't reproduce as described. But `backend/routes/reports.js` PATCH allows `status` in its editable-fields allowlist (line ~330) with no server-side transition validation, so a crafted API call could still set an arbitrary status.
- **Goal:** Server-side status state machine: PATCH must reject any client-supplied transition that isn't `draft→draft` (edits) or explicitly allowed; `processing`/`failed`/`finalized` are system-only, settable only by the generation pipeline / `/approve` endpoint.
- **QA:** Attempt a PATCH setting `status: 'finalized'` directly (bypassing `/approve`) → rejected.

### T-6.5 — Strengthen the licensed-adjuster approval record
- **Client item:** #4, #42.
- **Status:** GAP CONFIRMED. Real `/approve` endpoint (`reports.js` ~L348-381) only stores `reviewedBy` (email/uid), `reviewedAt`, and an optional typed `signature.name`/`signature.title`. The polished approval block in the reference PDF (license #, license state, firm, audit reference) is fabricated only inside `make-sample-report.js` for demo purposes — it is **not** collected by the real flow.
- **Goal:** Approval form/API captures: full name, license number, license state, company/firm, explicit "I confirm I have reviewed..." checkbox (required, not just typing a name), and persists IP + user account ID + report version approved alongside the existing `reviewedAt`/audit entry. Export's signature page renders these real fields instead of being blank/minimal.
- **QA:** Approve a report without the checkbox checked → blocked. Approve with full fields → exported PDF signature page shows them; Firestore record has all fields.
- **Golden Rule #3.**

### T-6.6 — Re-verify billing/plan synchronization end to end
- **Status:** LIKELY ALREADY ADDRESSED by T-3.2/T-3.4 (2026-07-28 changelog — checkout-session confirmation, duplicate-subscription prevention, webhook-derives-tier-from-price). **Action:** re-test the specific scenario the client saw (Agency plan shown, Professional invoice in history) against current code before assuming it's stale; if reproducible, it's a bug in the reconciliation logic, not a new feature.
- **Client item:** #15.

### T-6.7 — Confirm draft/final export separation is complete
- **Client item:** #40.
- **Status:** LIKELY ALREADY DONE per T-2.7 (2026-07-19 changelog: un-reviewed exports force-watermarked "DRAFT — PENDING ADJUSTER REVIEW" + `_DRAFT` filename; `/approve` produces clean export). **Action:** re-verify against current export code that an edit-after-approval correctly reopens/invalidates the prior approval (client's "any later edit should create a new draft version and invalidate the previous approval" requirement) rather than silently leaving stale approval metadata on a changed report.

### T-6.8 — Authorization/role-permission audit pass
- **Client item:** #8 (general, from priority list).
- **Goal:** Confirm every report/claim/export/admin endpoint checks tenant ownership + role, not just authentication. Cross-reference against T-3.8 (roles & permissions — currently TODO in Phase 3). This is the natural place to fold the client's ask in, not a new task.

### T-6.9 — Report generation progress must reflect real backend events
- **Client item:** #11.
- **Goal:** The generation-progress modal must not show "Analyzing damage photos with AI" (or any stage) that didn't actually run — e.g. skip that stage entirely when 0 photos were uploaded. Audit (2026-07-31) confirms `aiService.analyzeImages` is only invoked when `req.files.length > 0` and returns a safe "no images" result rather than fabricating findings — but the frontend progress UI should be checked separately for simulated/timer-based stages vs real SSE/poll-driven ones.
- **QA:** Generate a report with 0 photos → progress modal never shows a photo-analysis stage.

### T-6.10 — Confirm audit logging coverage
- **Status:** Partial audit-log infra already exists (T-3.10d audit trail collection, `recordVersion` on approve). **Action:** verify report approve/finalize/export/share/delete and admin actions all write to the `auditLogs` collection, not just security events.

## P2 — Core product workflow

### T-6.11 — Password policy strengthening
- **Client item:** #22.
- **Status:** GAP CONFIRMED — currently `min: 6` on both register (`auth.js:65`) and password reset (`auth.js:446`), weaker than the client's already-modest "8 characters" assumption.
- **Goal:** Raise minimum to 12; keep existing rate-limiting; no other new requirements unless requested (avoid over-engineering per project conventions).
- **QA:** Register/reset with an 11-char password → rejected with clear message; 12-char accepted.

### T-6.12 — MFA recovery codes + password-gated disable
- **Client item:** #23.
- **Status:** GAP CONFIRMED — TOTP enroll/verify/disable all work (`auth.js`, `speakeasy`), but no recovery-code generation/regeneration exists, and `/mfa/disable` currently requires a valid TOTP code rather than the account password.
- **Goal:** Generate one-time recovery codes at enrollment (shown once, hashed at rest); allow disable via password re-entry as an alternative to a TOTP code (matches client ask + is friendlier when the authenticator is lost).
- **QA:** Enroll → recovery codes shown once; log in with a recovery code (consumes it); disable MFA via password.

### T-6.13 — Rename "Quality Score" + explain what it measures
- **Client item:** #5.
- **Status:** GAP CONFIRMED — `Dashboard.jsx:294,1322` literally labels it "Quality Score X/100".
- **Goal:** Rename to "Documentation Completeness" (matches the reference PDF's own "DOCUMENTATION COMPLETENESS 97%" framing already used in the sample generator — reuse that language for consistency). Add a tooltip: measures required-field/section completeness, not AI accuracy or correctness of findings.
- **QA:** Label + tooltip visible; no other page still says "Quality Score".

### T-6.14 — Zero-photo disclaimer text
- **Client item:** #10.
- **Status:** PARTIAL — no fabricated AI findings occur (confirmed), but no explicit disclaimer sentence is shown when photo count is 0.
- **Goal:** When a report has 0 photos, show/insert: "No photographs were provided. Damage observations in this draft are based exclusively on user-entered information and must be independently verified."
- **QA:** Generate with 0 photos → disclaimer appears in preview + export.

### T-6.15 — Unify CRM into one navigation shell
- **Client item:** #6, P2-#2.
- **Status:** PARTIAL — base `Dashboard.jsx` already links to `/crm` in its sidebar; `EnterpriseDashboard.jsx` and the marketing `Navbar.jsx` do not.
- **Goal:** Add the CRM entry consistently wherever a logged-in Agency/Enterprise user's primary nav appears, so it reads as one product, not a bolt-on. (Full "single unified sidebar with Overview/Reports/Claims/Clients/Appointments/Templates/Team/API" IA redesign is a larger follow-on — scope that separately if wanted after this lands.)

### T-6.16 — Link claim number to a real CRM claim record (prevent duplicates)
- **Client item:** #8 (dup claims), #29, P2-#1/#8.
- **Status:** DONE (2026-08-02) — all 4 phases shipped. Full plan: `C:\Users\umera\.claude\plans\happy-foraging-catmull.md` (also summarized across PROGRESS.md's 2026-08-01/02 changelog entries).
- **Goal:** Report generation either selects an existing CRM claim (auto-populates claim #, insured, address, loss date/type) or creates a new claim inline — never a bare unlinked string. Agency/Enterprise only (CRM is tier-gated); Starter/Professional unaffected.
- **Phases:** A (backend: `claimId` on reports, server-derives claim fields, `getClaimReports`, CRM `ClaimSlideOver` linked-reports UI) — DONE. B (Dashboard.jsx claim-picker) — DONE, live-browser verified. C (EnterpriseDashboard.jsx claim-picker, shared `ClaimLinkSection` component extracted) — DONE, live-browser verified. D (idempotent manually-run backfill script, `backend/scripts/backfill-claim-links.js`) — DONE, dry-run verified against real data + a synthetic correctness test.

### T-6.17 — Replace raw Markdown report editor with a sectioned rich editor
- **Client item:** #9, P2-#4.
- **Status:** DONE (2026-08-16, PHASES.md Phase 9) — `SectionedReportEditor.jsx` is now a full TipTap rich-text editor with section-based editing (add/delete/rename/reorder), per-section Regenerate (instructions + comparison + explicit approval), and 7 additional AI writing-assistance functions, all Accept/Reject (Apply/Discard). Subsumes this task and the overlapping T-2.6 "AI suggestion review UI" — see `PHASES.md` Phase 9 for full implementation/testing detail.
- **Goal (original, now met):** Section-based editing (Executive Summary, Claim Info, Damage Assessment, etc.) with per-section "regenerate" and accept/reject of AI suggestions.

### T-6.18 — Calendar layout + event display fixes
- **Client item:** #12, P2-#7.
- **Goal:** Verify current CRM appointments calendar (`CRM.jsx`) against the specific complaints: missing weekday columns, truncated event titles, an event rendering as spanning two days when it's single-day. Needs a live look at the current calendar component before scoping a fix — not yet audited.

### T-6.19 — Confirmation dialogs for destructive/high-stakes actions
- **Client item:** #32, P3-#2.
- **Goal:** Add confirm-before for: delete report/client/claim, bulk delete, restore version, finalize report, cancel subscription, revoke API key, delete account. Most of these already exist for account deletion (T-3.10f); audit the rest and add where missing.
- **Status update (2026-08-18):** the "finalize report" confirm-before is now **DONE** via `PHASES.md` Phase 10 (T-7.10) — a Cancel/Approve `ConfirmDialog` sits in front of `POST /:id/approve` in both `Dashboard.jsx` and `EnterpriseDashboard.jsx`. Delete report/bulk delete/revoke API key/delete account already had confirms per this task's own note above. Restore version and cancel subscription were not audited this session — still open.

### T-6.20 — Field validation + address autocomplete
- **Client item:** #14, P2-#9.
- **Goal:** Phone/email format validation, unique-claim-number check (ties to T-6.16), max lengths, and address autocomplete (Google Places or equivalent) on claim/property forms.

## P3 — Professional polish

### T-6.21 — Standardize status/label capitalization across the UI
- **Client item:** #30, P3-#1. Small, mechanical — good first task to pick up.

### T-6.22 — Icon tooltips + accessible labels
- **Client item:** #31, P3-#2. Add `title`/`aria-label` to icon-only buttons (shield/eye/trash/download/restore); clarify what the "shield" action actually does.

### T-6.23 — Loading / empty / error states audit
- **Client item:** #33, P3-#5. Sweep major screens (Reports, Appointments, Billing, CRM) for missing states; standardize copy per client's examples.

### T-6.24 — Mobile responsiveness pass on report editor/approval + calendar
- **Client item:** #34, P3-#3. Phase 1's mobile pass (T-1.11) only covered marketing pages — this extends it to the authenticated report/CRM screens the client screenshotted narrow.

### T-6.25 — Accessibility pass (contrast, focus, keyboard, ARIA)
- **Client item:** #35, P3-#4. Check the pale-orange status-badge contrast the client flagged specifically, plus modal focus-trapping/Escape-to-close.

### T-6.26 — Expand public API documentation
- **Client item:** #19, P3-#6. Base URL, versioning, auth, request/response examples, errors, pagination, rate limits, webhooks, OpenAPI spec.

### T-6.27 — API key scopes/permissions
- **Client item:** #21. Selectable scopes per key (`reports:read`, `reports:generate`, etc.) instead of full access by default. Depends on T-3.8 roles work landing first.

### T-6.28 — Separate customer-facing API auth from internal login JWT
- **Client item:** #20. Confirm `/api/auth/login`/`register` JWTs aren't documented/marketed as the external integration auth method — API keys already are the documented path; verify docs don't blur this.

### T-6.29 — CRM analytics expansion + client/claim detail pages
- **Client item:** #26, #27, #28, P3-#9. Larger CRM feature work — claims-by-status, overdue appointments, turnaround time, full client profile page, full claim detail page. Scope as its own multi-task project, likely several sub-tasks.

### T-6.30 — Pricing/plan feature-matrix consistency + Enterprise positioning
- **Client item:** #17, #18, P3-#8. Confirm CRM/API-access-by-tier claims on the Pricing page match `tiers.js` reality; decide (with client) whether Enterprise stays "Contact Sales" only or gets a public anchor price — this is a business decision, present options rather than picking one.

### T-6.31 — Export sanitization + branding-preservation check
- **Client item:** #41. Confirm HTML export has no executable script/internal URLs/hidden data; confirm PDF/DOCX preserve branding/signatures/watermarks reliably.

### T-6.32 — Homepage precision + audience clarity + trust content
- **Client item:** #36, #37, #38, #39. Status: T-1.4 hero rebuild already emphasizes AI-assisted/draft/human-review framing — re-check current copy against the client's suggested safer headline variant before assuming more work is needed; verify no unsupported response-time promises remain on Contact page.

### T-6.33 — Fix missing Firestore composite index for `enterpriseTeams` (GET /api/teams/members 500s)
- **Found:** 2026-08-02, during T-6.16 Phase C live-browser QA — not a client-reported item, an incidental discovery.
- **Status:** GAP CONFIRMED — `backend/routes/teams.js` `GET /members` queries `.where('ownerId','==',uid).orderBy('invitedAt','desc')` on `enterpriseTeams`. This equality-filter + different-field-orderBy combo requires a Firestore composite index. Reproduced live: a fresh Enterprise-tier account with zero team members gets a 500 from this endpoint every time (confirmed via console errors + backend logs in a real local run against the production Firestore project).
- **Goal:** Create the composite index (Firestore emits the exact creation link in the error/log when the query fails — check Render logs or reproduce locally to get it) and deploy it. Likely affects every real Enterprise customer's Team tab today, not just test accounts.
- **QA:** Load `/enterprise-dashboard` as an Enterprise user → Team tab loads without a 500, member list (even if empty) renders normally.

---
**Sequencing note:** P1 items are the only ones recommended as near-term picks (T-6.4, T-6.5, T-6.11, T-6.13, T-6.14 are small and self-contained — good next commits). T-6.16/T-6.17/T-6.29 are large and need their own scoping/planning session before implementation, per Golden Rule #7. T-6.3/T-6.6(business-decision part)/T-6.30 need client input, not just code.

---

# PHASE 7 — Spec-Compliance Roadmap (see `PHASES.md`)

Source: a 2026-08-14 audit of the codebase against an external 50+33-item product requirements checklist (`FlacronAI_Spec_Checklist.xlsx`, kept outside the repo per the client). Full dependency-ordered 23-phase roadmap lives in `PHASES.md` at the repo root — that file is the source of truth for scope/acceptance/testing per phase; this section just tracks each phase as a single task line here for continuity with the rest of this backlog. **One phase implemented at a time, only when explicitly requested — do not batch.**

### T-7.1 — Phase 1: Critical Fix — Full Photo-Set AI Analysis Coverage
- **Goal:** `backend/services/aiService.js`'s `analyzeImages()` analyzed only the first 10 of up to 100 uploaded photos (`images.slice(0, 10)`), contradicting the marketed/enforced "up to 100 photos per report" capability.
- **Status:** **DONE** — 2026-08-14, **re-confirmed via re-audit 2026-08-16**. Rewrote `analyzeImages()` to batch all valid photos (10/batch, concurrency 3, 90s per-batch timeout) and aggregate results via a new pure `aggregateBatchResults()` function, with accurate `imagesFailed`/`imagesSkipped` reporting instead of silent drops. Added `timeout` passthrough in `backend/config/anthropic.js`. New test file `backend/test/image-analysis-batching.test.js` (15 tests covering 5/10/15/50/100 photos, partial-batch failure, all-batch failure, unsupported-format skipping, empty input, severity escalation, and unconfigured-API graceful degradation). **2026-08-16 re-audit found and fixed two real bugs left over from the original pass:** (1) the frontend's global 120s axios timeout applied to the 100-photo `reportsAPI.generate` call, risking exactly the timeout failure this task's own acceptance criteria warns about — gave that call its own 300s override in `frontend/src/services/api.js`; (2) a previously root-caused-but-unfixed defect where every generated report was missing Section 9 (Conclusion) due to `generateReport()`'s `maxTokens: 4096` budget running out — fixed via a bump to 8192 plus a new `ensureConclusion()` completeness safety net (mirrors the existing Section-7 `ensureLossSummary()` pattern), live-verified against the real Anthropic API.
- **Acceptance:** All uploaded photos (up to the caller's cap) are now actually sent to Claude vision; `totalImagesAnalyzed` reflects the true count; a single failed batch doesn't block the rest; ≤10-photo reports behave the same as before.
- **QA:** `npm test` (backend) 72/72 passing (0 regressions, re-run after the 2026-08-16 fixes). `npm run lint` 0 errors/38 warnings backend, 0 errors/15 warnings frontend (unchanged baselines). `npm run build` (frontend) succeeds. One real Anthropic API call made 2026-08-16 to verify the Section 9 fix (all 9 sections present). A full paid live-scale test with 50-100 real photos was explicitly declined by the client (cost/time tradeoff) — remains the one open, explicitly-flagged residual risk.
- **Covers:** `PHASES.md` Phase 1.
- **Dep:** none.

### T-7.2 — Phase 2: Brand Token & Design System Reconciliation
- **Goal:** Resolve the conflict between the external spec's brand colors (`#FF5A1F`/`#171C2B`) and `CLAUDE.md`'s documented current tokens (`#FD4403`/`#002A64`), then centralize/complete the design-token system.
- **Status:** **DONE** — 2026-08-15, **re-confirmed via re-audit 2026-08-16**. Client confirmed `#FD4403`/`#002A64` is authoritative (evidence: sampled from client's own logo files; reconfirmed 2026-08-13 via a client-driven pixel-match session against their own reference PDF). Resolving this surfaced a much bigger real bug: 417 occurrences of literal Tailwind default `orange-*` classes (a generic muted orange) across 28 files were bypassing the brand tokens entirely — replaced sitewide with `brand-*`. Also fixed 2 raw hex color drifts (`Home.jsx`, `EnterpriseOnboarding.jsx`), normalized a `yellow-*`/`amber-*` inconsistency (25 occurrences), added missing semantic tokens (`muted`/`success`/`warning`/`error`/`info`) to `tailwind.config.js`, and added `focus-visible` states to all shared button classes. **2026-08-16 re-audit** specifically checked for regression from Phases 3-5 (which touched many of the same files afterward): re-ran the original greps (still 0 orange-*/yellow-* classes, still 0 stale hex) plus a broader any-hex sweep that found only 3 pre-existing, out-of-scope hits (none real bugs — see `PHASES.md`/`CONTEXT.md`). Zero drift found; no code changes needed. **2026-08-16 follow-up (client-requested before closing the phase):** cleaned up the one deliberately-deferred minor item — `Pricing.jsx`'s `COLOR_MAP` keys `blue`/`purple` (mapping to `brand-*`/`amber-*` classes respectively) renamed to `brand`/`amber`, with the now-fully-redundant duplicate `purple` entry (byte-identical values to the existing `amber` key) removed. Pure rename, zero class-value changes.
- **Acceptance:** True brand orange renders everywhere it should; no literal Tailwind `orange-*`/`yellow-*` classes remain in `frontend/src`; no stale `#f97316`/`#8b5cf6` hex remains; focus-visible ring present on all buttons.
- **QA:** `npm run lint`/`build`/`test` (frontend) all green (re-run 2026-08-16, identical to original sign-off). Live-verified in a real browser (Playwright, real dev servers, throwaway Firebase test account) across Home/Pricing/Dashboard/Settings at desktop+mobile — zero console errors, zero failed HTTP requests, correct brand-color rendering confirmed via screenshots and computed styles. Re-verified live again 2026-08-16 with a fresh throwaway account (Admin-SDK-created, pre-verified) — same result, plus a full-DOM computed-style sweep on the live Dashboard confirming zero generic-orange elements anywhere on the page. **After the `COLOR_MAP` rename:** lint/test/build re-run unchanged; a focused Playwright check captured computed `background-color` on all 4 Pricing plan cards' icon badges + CTA buttons at desktop+mobile — 16/16 checks passed, byte-identical to pre-rename output, zero console errors.
- **Covers:** `PHASES.md` Phase 2.
- **Dep:** none (open question resolved within this task).

### T-7.3 — Phase 3: Auth Pages — Dedicated Routes & Field Completeness
- **Goal:** Add dedicated `/login`/`/signup` routes (kept unified under `/auth` before), split signup's name field into First/Last Name, relabel email to Work Email, add optional Company, change CTA to "Create Free Account", persist the new fields to Firestore.
- **Status:** **DONE** — 2026-08-15, **re-confirmed via re-audit 2026-08-16 (1 real bug found and fixed)**. Routes added with a permanent `/auth` legacy redirect preserving query params/router state; `Auth.jsx` made route-driven with back/forward support; all hardcoded `/auth` links updated sitewide; `firstName`/`lastName`/`company` now persist for both email/password and Google signup. **Also fixed, at the client's direct request alongside this task:** the recurring "Account data unavailable" bug — `middleware/auth.js`'s `verifyIdToken()` transient failures were never classified as retryable (only a downstream Firestore-lookup failure was, per the 2026-08-12 fix) — now one immediate retry, then a 503 instead of a dead-end 401. **Also fixed, found during verification:** a genuine race condition in `GET /profile`'s auto-create (non-merge `.set()`) — rewritten transactionally. **2026-08-16 re-audit** (triggered by the client's live-tested routing bug reports) found and fixed a real regression: `switchMode()`'s `navigate(path, {replace:true})` replaced the browser history entry on every Login↔Signup tab switch, so pressing Back skipped past both routes to whatever page preceded the auth flow — removed `replace:true` so Back/Forward now correctly toggle between modes. **Also surfaced a critical cross-cutting finding, not fixable in code:** `git log` shows none of Phase 1-5's work has ever been committed — see `CONTEXT.md`'s top-of-file callout. This very likely explains the client's original bug reports if they tested anywhere other than this local working tree.
- **Acceptance:** `/login`/`/signup` work directly and via `/auth` redirect (with param/state preservation); signup collects and persists all new fields; existing users/flows unaffected.
- **QA:** Backend 64/64 tests (9 new, `auth-transient-error.test.js`) → **72/72 after re-audit** (grew via later phases, 0 regressions), frontend 4/4, both lint-clean, both build. Full live-browser verification (real dev servers + real Firebase project, throwaway account deleted after) — signup/login, direct nav/refresh/bookmarks, validation, Firestore field persistence, protected-route redirects, mobile, Google button — all passed with zero console/HTTP errors. **Re-verified 2026-08-16** with an expanded checklist (back/forward mode-toggling, login-then-return-to-original-destination, already-authenticated bounce-away, tier gating, Google consent-gate popup-blocking) — all passed after the `switchMode` fix; 3 fresh throwaway accounts created and deleted.
- **Covers:** `PHASES.md` Phase 3.
- **Dep:** none.
- **Expanded 2026-08-19 by PHASES.md Phase 21 (Onboarding Flow):** `Auth.jsx`'s post-login/signup destination (`handlePostAuth`, still `/dashboard`) is now transparently intercepted for a brand-new account by a single new gate in `ProtectedRoute.jsx` (`userProfile.onboardingCompleted === false` → redirect to `/onboarding`), so no signup-path-specific redirect logic was needed here at all — Google and email/password signup land in the exact same gate since it reads one server-persisted profile field regardless of provider. 4 new fields (`onboardingCompleted`/`onboardingStep`/`onboardingUserType`/`onboardingMonthlyVolume`) are seeded only at the exact moment `GET /profile`'s existing auto-create transaction first creates a brand-new user doc — an existing account's doc already exists and is never touched, so "existing users must not be incorrectly forced through onboarding" holds with zero backfill. The new 5-step wizard (`frontend/src/pages/Onboarding.jsx`, `POST /api/users/onboarding/step`+`/complete` in `backend/routes/users.js`) is documented in full under `PHASES.md` Phase 21 and `PROGRESS.md`'s Phase 21 entry.

### T-7.4 — Phase 4: Dashboard Home View
- **Goal:** `/dashboard` opened straight into the Generate Report wizard with no greeting, metrics overview, or FLACRON ENGINE usage panel. Build the missing home/overview screen.
- **Status:** **DONE** — 2026-08-15, **re-confirmed via re-audit 2026-08-16 (0 bugs found)**. `Dashboard.jsx`'s default `activeView` changed from `'generate'` to a new `'home'` view: time-based greeting with first name, 4 metric cards (Reports This Month from the existing profile field; Photos Analyzed/Awaiting Review/Completed Reports from a new `GET /api/reports/dashboard-summary` endpoint), a 5-row Recent Reports table with the full spec'd columns, a Flacron Engine Usage panel, and a primary Generate Report CTA. Storage usage is explicitly rendered as "Not yet available" rather than fabricated — no byte-level tracking exists anywhere in this codebase (Golden Rule #1).
- **Bug found and fixed during live verification:** the endpoint's Firestore `.aggregate({sum('imageCount')})` call threw `FAILED_PRECONDITION` (missing composite index — this repo has no `firestore.indexes.json`) against the real project. Replaced with a `.select('imageCount')` projection scoped to the user's own reports, summed in Node.
- **2026-08-16 re-audit** (triggered specifically by the client's live-tested report of a missing greeting): re-verified every piece of Phase 4 — the greeting, metrics, Recent Reports (including its correct, pre-existing archived-hiding behavior), and usage panel — all present and working exactly as documented. **Zero bugs found, zero code changes needed.** Incidentally hit and resolved a real environment issue (backend OOM crash from this session's own accumulated orphaned dev-server/browser processes) — a test-hygiene fix, not a product bug.
- **Acceptance:** Metrics reflect real Firestore data (verified against seeded records); table matches spec columns; page loads without a wizard flash-then-redirect; loading/empty/error states all handled.
- **QA:** Backend 64/64 tests → **72/72 after re-audit** (0 regressions), frontend 4/4, both lint-clean (0 errors), both build. Live-browser verification (Playwright, real dev servers, real Firebase project) with a seeded populated account (5 reports, mixed statuses) and a genuinely empty new-user account, at desktop + mobile, with refresh-persistence checks — all metrics matched seeded values exactly, empty state and error/retry state both confirmed working. Both test accounts deleted afterward. **Re-verified 2026-08-16** with a fresh pair of throwaway accounts — populated/desktop 13/14, populated/mobile 15/15, empty/desktop 4/4 with zero console errors.
- **Covers:** `PHASES.md` Phase 4.
- **Dep:** none.

### T-7.5 — Phase 5: Generate Report Wizard Completion
- **Goal:** The 5-step wizard was missing Policy Number, Insurance Company, Insured First/Last split, real Claim Type, Property Type (Step 1); an Inspection Information section entirely (Step 2); a Documentation upload step entirely (Step 4); and an explicit "Save Draft" control.
- **Status:** **DONE** — 2026-08-15. Client confirmed keeping the existing 5-step flow (no restructuring to the spec's literal 7 stages) and folding the missing content into the existing steps. All fields added, validated (character limits, enum allowlists, date/time formats — all optional, backward compatible), and persisted onto the report document. Documents (PDF/DOC/DOCX/TXT) upload atomically with the report (same pattern as photos), magic-byte validated (new `backend/utils/documentValidation.js`), stored privately in Firebase Storage under `users/{uid}/reports/{reportId}/documents/`, retrievable via a new `GET /:id/documents/download`. Explicit "Save Draft" button added alongside the pre-existing silent autosave. New fields deliberately NOT added to the AI-prompt input (`reportData`) — no AI-prompt change this phase, per the phase's own risk note.
- **Bug found and fixed during live verification:** the First/Last Name → Insured Name (and address-parts → Property Address) auto-compose convenience logic froze after the first sub-field was typed (an "only sync while empty" check blocked further updates the moment the first keystroke made the target non-empty). Fixed by comparing against the previous composed value instead, so the sync keeps applying across multiple fields until the user manually diverges it.
- **Acceptance:** All new fields present, validated, and persisted; a seeded pre-Phase-5 "old-shape" report (all new fields entirely absent) opened in the report list and detail modal with zero crashes.
- **QA:** Backend 72/72 tests (8 new, `document-validation.test.js`), frontend 4/4, both packages lint-clean, both build. Full live-browser verification (real dev servers, real Firebase project, real Anthropic API call) — every new field confirmed persisted by reading the generated report's Firestore document directly; document upload/remove/download, Save Draft, mid-wizard refresh persistence, required-field validation, invalid-document-type rejection, and desktop+mobile layouts all confirmed working. Test account, its reports, and its Storage objects deleted afterward.
- **Significant pre-existing finding (NOT fixed, out of scope):** `backend/server.js` applies the AI-specific `aiLimiter` (10 req/60s) to the entire `/reports` router, not just generation endpoints — a real production reliability risk under ordinary usage, not just test load. Flagged for a future dedicated fix. See changelog + `PHASES.md` Phase 5 for full detail.
- **Covers:** `PHASES.md` Phase 5.
- **Dep:** none.

### T-7.6 — Phase 6: Photo Upload & Per-Photo UX Hardening
- **Goal:** The photo-upload step had no per-photo data model (only a flat `imagePaths` array), no server-generated thumbnails, no EXIF-orientation normalization, no duplicate-upload guard, no list-view toggle, no per-photo remove/rotate/preview, no bulk actions, and one corrupt/invalid photo rejected the *entire* upload request.
- **Status:** **DONE** — 2026-08-16. New per-photo record (`photos` array: id/fileName/size/mimeType/status/objectPath/thumbnailPath/error/uploadedAt) on the report doc, kept in lockstep with the still-derived `imagePaths`/`imageCount` for full backward compatibility. New `backend/utils/photoBatchProcessor.js` isolates one corrupt/duplicate photo's failure to its own record (used by both `POST /generate` and `POST /:id/images`) instead of rejecting the whole batch — the multer `fileFilter` for the `images` field was also relaxed (previously an unlisted-but-real mimetype 500'd the entire request at the multer layer before any route code ran). New `backend/utils/thumbnailService.js` (using the already-installed `sharp`) generates real server-side thumbnails and normalizes EXIF orientation on the full stored image (fixes sideways photos in PDF/DOCX exports, which don't read EXIF). SHA-256 duplicate detection runs both client-side (instant wizard feedback) and server-side (authoritative). `Dashboard.jsx`'s Step 4 was rewritten: grid/list toggle, per-photo status/size/remove/rotate (real pixel rotation via canvas re-encode, not just a CSS transform)/click-to-preview, Select All/Remove Selected/Retry Failed Uploads bulk actions, and the exact spec'd message `"Maximum of 100 photos reached. Remove a photo to upload another."`. New read-only `ReportPhotoGallery` component (backed by new `GET /:id/photos` + `GET /:id/photos/:photoId/image` routes, private-object authenticated proxy pattern matching the existing document-download route) inside `ReportDetailModal`, with backward-compatible synthesis of a legacy photo list for reports that predate this phase (`imagePaths`-only, no `photos` field at all). Deliberately stayed synchronous — no pre-generate upload endpoint, no job queue — per explicit instruction not to build Phase 7's async pipeline this session.
- **Acceptance:** A mixed batch (valid + corrupt + duplicate) isolates each outcome independently instead of failing the whole request; thumbnails render from server-generated images; list/grid toggle and bulk actions work; pre-Phase-6 reports (`imagePaths`-only) open without crashing.
- **QA:** Backend 82/82 tests (10 new, `photo-batch-processor.test.js`, dependency-injected — no real network), `npm run lint` 0 errors/40 warnings (baseline+2, same accepted pattern as prior phases). Frontend 0 lint errors/15 warnings (unchanged), 4/4 tests, build succeeds. Live-verified against the real Anthropic API + real Firebase project (throwaway QA account, deleted afterward): full Playwright wizard walkthrough (18/18 checks, zero console/network errors); a direct, unmocked HTTP call to `POST /generate` bypassing all client-side filtering confirmed the backend's own per-photo isolation end-to-end (corrupt→failed, duplicate→duplicate, 2 valid→uploaded, with real Storage images+thumbnails created); gallery endpoints verified over HTTP for both a new-shape and a genuinely-seeded legacy-shape report; mobile viewport (390×844) confirmed; exact 100-photo-limit message confirmed at 100/100; real Storage cleanup confirmed via the actual `DELETE /:id?permanent=true` endpoint. The pre-existing, already-documented Phase-5 `aiLimiter`-on-the-whole-router rate limit was re-tripped by this session's own rapid testing (not a Phase 6 regression — confirmed via direct HTTP calls outside the rate-limit-heavy browser path).
- **Covers:** `PHASES.md` Phase 6.
- **Dep:** Phase 5 (soft — same wizard area).
- **⚠️ Superseded scope note (2026-08-16):** a subsequent full-specification audit (see T-7.6a's own gap-report reference) found this task's own DONE status was accurate against its *original* task list above, but the full spec required more — see T-7.6a for the addendum that closes most of that gap.

### T-7.6a — Phase 6 addendum: full-specification photo-upload gaps
- **Goal:** A 2026-08-16 full-spec audit (comparing the complete 50-section specification against `PHASES.md`, not just the summary spreadsheet the roadmap was originally built from) found Phase 6's shipped code, while meeting its own original task list, had real gaps against the full spec — two of them genuine defects, not just missing features: (1) the "display" (EXIF-normalized) copy of each photo was silently uploaded as the *only* stored full-size image, discarding the untouched original entirely, contradicting the spec's explicit "original must not be permanently altered" requirement; (2) duplicate detection only ever checked within one upload batch, never against photos already attached to the report. Also missing: mobile Take Photo/Choose From Library capture UI, real per-image upload-progress feedback, an honest ready/failed/duplicate count breakdown, and unverified real HEIC support; plus a re-confirmed pre-existing `aiLimiter`-scoping issue now also affecting Phase 6's own new gallery endpoints.
- **Status:** **MOSTLY DONE** — 2026-08-16 (same-day follow-up), per explicit client instruction after approving the gap report and deciding: (a) real 3-tier photo storage (original/display/thumbnail, original never overwritten), (b) build real bookmarkable routes eventually (see T-7.7/Phase 30 — a separate, plan-only task). **Fixed:** 3-tier storage (new `reportOriginalObject()` path builder in `config/storage.js`; `photoBatchProcessor.js` uploads the untouched original first, then the normalized display copy at the same `objectPath` role/name as before so no existing reader breaks, then the thumbnail; `GET /:id/photos/:photoId/image` gained `variant=original`; deletion cleanup extended). Cross-existing-report duplicate detection (new `contentHash` field per photo record; `processPhotoBatch()` gained an `existingHashes` parameter seeded from the report's already-attached photos, wired into `POST /:id/images`). Mobile Take Photo (`capture="environment"` input) / Choose From Library buttons + a continuous-capture hint. Real per-image upload progress (`reportsAPI.generate(formData, onUploadProgress)` threading a genuine axios byte-progress callback into the wizard's "Uploading photo N of M — X%" readout). An explicit "N ready · N failed · N duplicate" count breakdown. `aiLimiter` rescoped off the entire `/reports` router (removed from `server.js`'s router-level mount) onto just `POST /generate`/`analyze-images`/`:id/images`/`:id/sections/suggest` (via the already-existing-but-previously-unused `backend/middleware/rateLimiters.js`). **Verified, not fixed:** real HEIC support — directly tested this exact installed `sharp`/libvips/libheif build and confirmed it can encode/decode real AV1-coded HEIF but explicitly cannot encode HEVC-coded HEIF (`Unsupported compression`, the codec real iPhones use) — strong, current-runtime evidence real `.heic` won't decode either; a literal real HEVC `.heic` file wasn't obtainable in this sandboxed session to confirm decode directly (no camera, no licensed encoder, no internet-fetch capability) — flagged for a client decision (supply a real file, or approve adding a conversion library). **Deliberately not touched:** low-quality-image warning and photo ordering/grouping/annotations (correctly assigned to new Phase 24, not Phase-6-compatible upload-mechanics concerns); true per-file network-level upload concurrency (confirmed Phase 7 territory, requires photos to upload individually before Generate).
- **Acceptance:** Original photo bytes are recoverable unmodified after upload; a duplicate of a photo already on the report is rejected, not just duplicates within one batch; mobile users can explicitly choose camera vs. library; upload progress reflects real bytes sent; the photo count breakdown is unambiguous; ordinary reads under `/reports/*` no longer share the AI-generation rate-limit bucket.
- **QA:** Backend 85/85 tests (13 in `photo-batch-processor.test.js`, up from 10 — 3 new covering 3-tier storage byte-differences and cross-existing-report dedup), `npm run lint` 0 errors/40 warnings (unchanged). Frontend 0 lint errors/15 warnings, 4/4 tests, build succeeds. Live-verified against the real Firebase project (throwaway QA account, fully deleted afterward) with a genuine ~5.7MB real photo (not a tiny synthetic fixture): `originalPath` byte-for-byte identical to the source file (5,685,172 bytes exactly), a separately-sized re-encoded `objectPath` display copy (5,767,932 bytes) at a distinct Storage path; a direct HTTP call to `POST /:id/images` re-uploading an already-attached photo under a different filename correctly flagged `duplicate` against the existing photo, while a genuinely new photo in the same call still uploaded normally; 30 rapid direct HTTP reads (`GET /reports` ×15, `GET /dashboard-summary` ×15) all returned 200/304 with zero 429s, and a control test confirmed `POST /generate` itself still correctly 429s after 10 rapid calls (protection not weakened, only rescoped); real multi-tick upload-progress readings observed live in a browser using the same large photo; mobile viewport (390×844) confirmed both capture buttons visible with zero horizontal overflow.
- **Covers:** `PHASES.md` Phase 6's post-completion addendum.
- **Dep:** T-7.6.

### T-7.7 — Phase 30: Routing Migration — Real, Bookmarkable URLs
- **Goal:** Replace `Dashboard.jsx`'s internal `activeView` state-switching with real React Router routes matching the spec's URL structure, migrated incrementally so no current navigation or saved link breaks.
- **Status:** **PLANNED, NOT IMPLEMENTED** — 2026-08-16. Client decided on real routes (resolving what the 2026-08-16 gap audit flagged as the single biggest cross-cutting open question). A 5-stage incremental migration plan was added to `PHASES.md` as new Phase 30: (1) introduce a shared `DashboardLayout` + nested-routing scaffold with zero visible behavior change, (2) migrate view-by-view lowest-risk-first (reports → billing/subscriptions reconciliation → home → the wizard last, given its complex step state), (3) preserve the existing Stripe-checkout query-param confirmation flow exactly, (4) handle redirects for anything bookmarkable today (just `/dashboard` itself), (5) decide how filter/search/pagination state gets encoded in the URL. This is a plan only, per the client's own framing ("add this migration explicitly to the roadmap") — no code was changed for it this session.
- **Acceptance:** (for when implemented) Direct navigation/refresh/back-forward all work on every migrated route; the Stripe checkout-redirect flow is unaffected; no existing test regresses.
- **Covers:** `PHASES.md` Phase 30.
- **Dep:** None technical — coordinate timing with whichever of Phases 9/10/12/13/14/15/16/17/22 gets prioritized next, since those depend on it.

### T-7.9 — Phase 10: Report Review Checklist & Approval Modal
- **Goal:** No pre-approval checklist existed (Claim Data/Inspection Data/Photos N-of-N/Documentation/Draft Sections completeness), no warnings for missing claim number/inspection date/excluded-unreviewed photos, and clicking "Approve & Finalize" fired the backend call immediately with no confirmation step.
- **Status:** **DONE** — 2026-08-18. New `frontend/src/components/ReportReviewChecklist.jsx` computes all 5 checklist rows and 3 conditional warnings entirely from data already persisted (Phase 5's claim/inspection fields, Phase 6/8's per-photo `analysisStatus`/`review`, Phase 5's `documents`, the existing `content`) — no fabricated counts, no new backend endpoint. `ReportPhotoGallery` gained an optional `onPhotosChange` callback so the checklist stays live-synced with Phase 8's interactive photo review without an extra fetch; `EnterpriseDashboard.jsx` (no interactive gallery of its own) lets the checklist self-fetch instead. The existing shared `ConfirmDialog` (not a new component) now gates the existing, unmodified `POST /:id/approve` call behind an explicit Cancel/Approve step in both `Dashboard.jsx` and `EnterpriseDashboard.jsx`. **Real bug found and fixed:** the new `onPhotosChange` wiring initially called a parent setState from inside a different component's `setPhotos` updater function, triggering a genuine React "setState during render" warning — fixed by computing the next array from the closure directly instead of nesting setters. **Pre-existing, unrelated gap flagged (not fixed):** `EnterpriseDashboard.jsx`'s generate flow still assumes Phase 7's pre-pipeline synchronous model — the new checklist handles this gracefully (honest empty state, no crash) but the dashboard itself would benefit from the same async polling `Dashboard.jsx` already has.
- **Acceptance:** Warnings appear correctly for incomplete reports; approval requires an explicit modal confirmation; approving still records the same signature/audit data as before (no regression) — all confirmed live.
- **QA:** Backend unchanged (135/135 tests, 0 lint errors/43 warnings — no backend code touched). Frontend unchanged (15/15 tests, 0 lint errors/15 warnings, build succeeds). Live-verified against the real Anthropic API + real Firebase project with 3 throwaway QA accounts (2 agency-tier with different completeness profiles, 1 enterprise-tier, all deleted afterward): a complete report's checklist went from "0 of 2 reviewed" + warning to "2 of 2 reviewed" + zero warnings live after approving both photos, no reload; an incomplete report simultaneously showed all 3 warning types at once; the modal's Cancel (stays draft) and Approve (finalizes, signature persists, survives refresh) paths both confirmed on desktop and on a real 390×844 mobile viewport (zero horizontal overflow); an EnterpriseDashboard spot check confirmed no crash/fabrication on a still-processing report. Zero console errors/unexpected failed requests aside from self-inflicted local rate-limiter trips from rapid repeated test runs (each confirmed as a testing artifact via backend restart + clean re-run).
- **Covers:** `PHASES.md` Phase 10. Also closes the "finalize report" item of T-6.19 (confirmation dialogs for high-stakes actions).
- **Dep:** Phase 5 (claim/inspection fields to check), Phase 8 (per-photo review status to check "N/N reviewed").

### T-7.11 — Phase 11: Report Preview, Export Options & Document Layout Completion
- **Goal:** No dedicated report-preview page existed (PDF preview was only an inline `<iframe>` inside the generate/editor view), export was a single button per format with no options, the PDF generator had no confidentiality-statement text, claim # was header-only (not footer), and the photo appendix was a hardcoded 2-column image-only grid with no per-photo number/caption/area/observation.
- **Status:** **DONE** — 2026-08-18. New real `/reports/:id/preview` route (`ReportPreviewPage.jsx`, added to `App.jsx`) built ahead of Phase 30 (same precedent as T-7.7's plan not blocking Phases 9/10) — fetches its report independently by ID so a direct URL/refresh both work; Desktop (`ReportMarkdown`)/PDF (lazy iframe) toggle; Edit/Approve/Export controls gated on report status, Edit deep-linking to `/dashboard?openReport=<id>` (new narrow query-param handler in `Dashboard.jsx`, not a routing migration). New shared `ExportOptionsModal.jsx` (format picker + 5 checkboxes, all default ON for backward compatibility, + 1/2/4-per-page photo layout picker) used by both the preview page and `Dashboard.jsx`. `POST /:id/export` now validates/authorizes every option server-side and threads them through a new `buildAppendixPhotoList()` helper built from Phase 8's real reviewer-approved photo data (never fabricated). All 3 export generators (`properPdfGenerator.js`/`documentGenerator.js`/`generateHTML`) gained a togglable cover page, togglable company branding (cover mark + header logo/text only), an always-on confidentiality-statement + claim-number footer line, a togglable page-number field, and a real 1/2/4-per-page appendix layout (photo number/caption/area/observation per cell) replacing the old fixed 2-column grid. **Real bug found and fixed (Golden Rule #4):** `tier.exportFormats` was defined in `backend/config/tiers.js` but never actually checked in `POST /:id/export` — a starter-tier account could get a clean DOCX/HTML export by calling the API directly. Fixed with a `403 EXPORT_FORMAT_NOT_ALLOWED` check. **Second bug found and fixed:** unchecking "Include company branding" hid the footer brand-attribution line in DOCX/HTML but not PDF — standardized all three generators on the PDF's original (footer attribution never hidden by this option).
- **Acceptance:** Each checkbox measurably changes the exported file; confidentiality statement + claim # appear in every export's footer; 1/2/4-per-page photo layouts render correctly with real per-photo data; the preview page loads directly by URL and survives a refresh; export format entitlements are enforced server-side — all confirmed live.
- **QA:** Backend 135/135 tests (unchanged — existing export tests already exercise the new backward-compatible defaults), 0 lint errors/43 warnings. Frontend 15/15 tests, 0 lint errors/15 warnings, build succeeds. A direct unit smoke test confirmed default options reproduce the pre-Phase-11 page counts exactly and every option/layout combination renders without throwing. Live-verified against the real Anthropic API + real Firebase project with 2 throwaway QA accounts (professional and starter tier, both deleted afterward): real PDF/DOCX/HTML downloads through the export modal with non-default option combinations, with real text/XML extracted from the downloaded files (via `pdfjs-dist`/`pizzip`) confirming every checkbox's effect and cautious report language throughout; the Approve modal on the preview page finalized a report with refresh-persistence confirmed; the Edit deep-link reopened the same report in `Dashboard.jsx`; a cross-user authorization check returned a clean not-found with zero data leaked; the entitlement fix was confirmed live via a real captured bearer token (403 for docx/html, 200 for pdf, as starter tier); mobile (390×844) confirmed zero horizontal overflow. Zero console errors/unexpected failed requests aside from self-inflicted local rate-limiter trips from rapid repeated test runs (each confirmed as a testing artifact via backend restart + clean re-run).
- **Covers:** `PHASES.md` Phase 11 (including its 2026-08-16 amendment adding the Report Preview page).
- **Dep:** Phase 8 (per-photo area/observation data for the appendix layout).

### T-7.12 — Phase 12: My Reports & Claims Management Completion
- **Goal:** My Reports had no type/creator/date/org filters despite the phase's own claim that some already existed server-side (they didn't — only `lossType`/`status`/`startDate`/`endDate`/`search` did), no Duplicate action anywhere, and Archive existed server-side but was unreachable from the UI (Delete always hard-deleted). Claims list had no search/date filters and no Edit/Archive/Delete actions despite the backend endpoints (`PUT`/`DELETE /claims/:id`) already existing, unused. The claim workspace had no tabs and no Photos view.
- **Status:** **DONE** — 2026-08-18. My Reports gained a real Filters panel (Claim #/Loss Type/Report Type/Creator/Created-date range/Organization — 4 of these are new `GET /reports` query params) and a "More actions" row menu (`RowActionsMenu`) with Duplicate/Download/Share/Archive-or-Restore/Delete; a new `POST /:id/duplicate` copies the full Phase 5 field set into a clean no-photos/no-content draft; a new `POST /:id/restore` (with a new `preArchiveStatus` field) reverses Archive back to a report's exact prior status rather than always resetting to draft. Claims gained real search/date filters and Edit/Archive/Restore/Delete actions, all wired onto the CRM backend's existing, previously-unused update/delete endpoints (Archive/Restore reuses `PUT /claims/:id` with a new `archived` boolean — no new route). `CRMClaimProfile.jsx` became a real tabbed workspace (Overview/Reports/Photos), with a new Photos tab aggregating real photos across the claim's linked reports (Report/Category/Review-status filters). **Real bug found and fixed:** duplicating a report set the editor's content to the literal JavaScript `null`, which rendered as the literal text "null" in the editor — fixed with a `|| ''` fallback at the one call site missing the codebase's usual null guard. **Claims tier-gating open question deliberately left unresolved** (it was referenced as "added as an Open Question below" in Phase 12's own amendment but never actually enumerated — a documentation gap) — per explicit client instruction to stop and ask rather than guess, Claims remains exactly as Agency+-gated as before; now logged as Open Question #15.
- **Acceptance:** All listed filters and actions function and are backed by real data; Duplicate produces a correct new draft; Archive and Delete are clearly distinct actions; Claims search/filters/actions work; the claim workspace has real tabs and an accurate Photos view — all confirmed live.
- **QA:** Backend 135/135 tests (unchanged), 0 lint errors/44 warnings (+1 over the 43 baseline, a new accepted-pattern `catch(err)`). Frontend 15/15 tests, 0 lint errors/15 warnings, build succeeds. Live-verified against the real Anthropic API + real Firebase project with 2 throwaway Agency-tier accounts + a seeded CRM client/claim (all deleted afterward, along with a real end-to-end generated report and its Storage objects): My Reports filters 13/13; My Reports actions 15/15 in a final clean run (Duplicate/Archive/Restore/Delete/Download/Share); Claims tab 10/10; claim workspace 7/7 (including a real Photos tab showing 2 genuinely AI-analyzed photos from an end-to-end wizard-generated report); cross-user authorization 5/5 (clean not-found, zero data leaked); mobile 390×844 5/5 (zero horizontal overflow). Self-inflicted local rate-limiter trips from rapid repeated test runs were each resolved via a backend restart and confirmed not regressions.
- **Covers:** `PHASES.md` Phase 12.
- **Dep:** Phase 5 (full field set for Duplicate to copy).

### T-7.14 — Phase 14: Team Roles Expansion & Member Profiles
- **Goal:** Only 4 roles existed (owner/admin/editor/viewer), team management only ever actually worked for the literal account owner regardless of the target role's UI label, there was no Suspend action, and no member-profile page with reports/photos/activity stats.
- **Status:** **DONE** — 2026-08-18. Before implementation, a least-privilege 7-role (+ legacy `editor` alias) permissions matrix was proposed and explicitly client-approved, along with 4 named decisions and a full anti-lockout/anti-escalation rule set (no self-role-change/self-suspend/self-remove; only Owner assigns Admin; Admin can't touch Owner/other Admins; Manager can only manage Adjuster/Inspector/Reviewer/Viewer/legacy-Editor; ownership transfer explicitly out of scope, not simulated). New `backend/utils/orgRoles.js` is the single shared source of truth for the matrix + hierarchy, consumed by a rewritten `teams.js`, new `requireTeamCapability` gates on 8 routes in `reports.js` (generate/approve/export/edit-content), and `templateService.js` (Phase 13's org-template permission moved to an explicit Owner/Admin/Manager allow-list). **3 real, pre-existing bugs found and fixed:** team management previously only worked for the literal owner's own uid regardless of role; a role change never actually propagated to the target member's own live permission checks; removing a member left their own account permanently enterprise-tier forever. Suspension ships with all 4 requested safeguards (status flip, `tokenVersion` bump, a zero-extra-read live per-request `teamMembershipStatus` check in `middleware/auth.js`, and a real `revokeRefreshTokens()` call); reactivation restores access safely with no re-invalidation needed. New `frontend/src/pages/TeamMemberProfile.jsx` (`/team/members/:memberId`, `me` supported) shows real stats + hierarchy-gated admin actions; `EnterpriseDashboard.jsx`'s Team tab is now role-aware instead of silently broken for any non-owner login. **A real, flagged architectural limitation surfaced by the combination of Inspector's `canApprove: false` and the pre-existing single-owner report model:** an Inspector-generated report can never be approved by anyone today — left unfixed, explicitly Phase 19 territory (cross-member report access).
- **Acceptance:** All 7 roles assignable and enforced server-side (not just UI-hidden); suspended members lose access immediately while staying visible to admins; member profile shows accurate, real activity stats — all confirmed live at the API level.
- **QA:** Backend `npm test` → 159/159 passing (unchanged), 0 lint errors/44 warnings (unchanged baseline). Frontend 15/15 tests, 0 lint errors/15 warnings (unchanged baseline — 2 warnings introduced mid-session by this phase's own code were found and fixed before the final count), build succeeds. **Live-verified against the real Firebase project — no browser automation tool available this session (same gap as Phases 7/13):** two throwaway Node scripts drove 10 real accounts (an org with Admin/2 Managers/Adjuster/Inspector/Reviewer/Viewer/2nd-Admin, a manufactured pre-Phase-14-shaped legacy Editor, a separate 2nd organization, 1 outsider) through **87/87 checks** across two passes (a self-inflicted local rate-limiter window split the run — this session couldn't restart the dev server to clear it, unlike prior phases, so the run was split and re-run after waiting the window out twice instead). Confirmed: every role's capability flags match the matrix exactly; the full anti-escalation suite (Admin-vs-Admin, Manager-vs-Manager/Admin, self-action guards, invalid-role-assignment); a live "no re-login needed" permission-refresh proof; suspension immediacy through 3 independent mechanisms (stale-tokenVersion rejection, fresh-tokenVersion-but-still-suspended rejection, real `tokensValidAfterTime` advancement); removal genuinely reverting to solo starter-tier; cross-organization isolation (clean 404s, empty rosters); report-action gating for Inspector/Reviewer/Adjuster through a real generate→approve→export lifecycle; the legacy Editor's self-healing suspend path; and real audit-log-backed activity stats. All 10 accounts/reports/1 template/1 exported Storage object deleted afterward, confirmed via a repeat cleanup pass (0 records) and a clean `git status`.
- **Covers:** `PHASES.md` Phase 14.
- **Dep:** None blocking (per `PHASES.md`).

### T-7.15 — Phase 15: General Analytics Page
- **Goal:** No general `/analytics` page existed anywhere — the only usage aggregation was CRM's own claims/clients-scoped analytics and the minimal 3-number Phase-4 dashboard-summary; there was no way for any account (solo or organization) to see reports-over-time, photo-volume trends, per-type/status breakdowns, completion-time, or (for a team) a per-member usage comparison.
- **Status:** **DONE** — 2026-08-18. New shared `backend/services/analyticsService.js` (pure, dependency-free aggregation functions + a thin Firestore-fetching orchestrator, unit-tested the same way `crmService`'s `buildDashboardAnalytics` already is) backs a new `GET /api/analytics` (`backend/routes/analytics.js`, mounted under both `/api` and `/api/v1`). Server-side scope decision, using Phase 14's role model exactly: an enterprise-tier caller with `canViewAllProfiles` (Owner/Admin/Manager) gets organization-wide analytics (aggregated across the whole team roster via a Firestore `userId in [...]` query chunked at 30, plus a per-member "Reports Per User"/team-comparison breakdown); every other caller — restricted team roles, and the large majority of accounts (every solo starter/professional/agency user) — is scoped to their own uid only, with the `tier === 'enterprise'` check short-circuiting the extra roster read entirely for the common case (deliberate, documented performance decision). Delivers every spec'd metric: Reports Generated, Photos Analyzed, Average Report Completion Time (createdAt→reviewedAt for finalized reports, matching `reports.js`'s own `isReviewed()` legacy-status folding), Reports Per User, Reports By Type, Reports By Status, Monthly Usage (fixed rolling 12 months, independent of the page's own range filter), Reports/Photos Over Time (gap-free, timezone-aware daily/weekly/monthly buckets sized to the selected range's width), and Team Usage/team-comparison (reusing the org-wide time series + Reports Per User, not a redundant 5th dataset). Date-range filtering: 7/30/90/365-day presets, All Time, and a custom picker; the frontend sends real local-midnight-to-local-midnight UTC ISO instants plus a `tzOffset` minutes value, and the backend shifts timestamps by that offset before reading calendar boundaries — genuinely timezone-accurate, not just UTC-labeled. **Deliberately did NOT refactor `crmService.js`/the Phase-4 `dashboard-summary` endpoint to share code with the new service** — both are already shipped and tested, and `crmService.js`'s turnaround-hours definition subtly excludes legacy `completed` status while the new one includes it (matching `isReviewed()`); forcing a merge would have silently changed already-shipped behavior, so the new module only mirrors the same pattern, documented as a deliberate choice in its own header comment. **A real bug caught by its own unit test before shipping:** the timezone-shift helper's sign was inverted, which would have bucketed reports into the wrong local day for any non-UTC caller — fixed. New standalone `frontend/src/pages/Analytics.jsx` (`/analytics`, ahead of Phase 30, same precedent as `Templates.jsx`) with range chips + custom date pickers, 3 stat cards, 2 breakdown bar-charts, a 12-month usage chart, 2 scrollable time-series charts, and a conditional Team Comparison section — all in the existing plain-Tailwind-bars style `CRM.jsx` already uses (no new chart-library dependency; `chart.js`/`react-chartjs-2` remain the pre-existing unused dead deps). New "Analytics" sidebar nav entry added to both `Dashboard.jsx` and `EnterpriseDashboard.jsx`, available to every tier (this is the general page, not enterprise-only).
- **Acceptance:** Every listed metric is computed from real Firestore data (no hardcoded/fabricated numbers); charts render gap-free time-series data; organization vs. personal scoping and Phase 14 role permissions are enforced server-side, not just UI-hidden — all confirmed live at the API level.
- **QA:** Backend `npm test` → 171/171 passing (12 new, `analytics-service.test.js`), 0 lint errors/44 warnings (unchanged baseline). Frontend 15/15 tests, 0 lint errors/14 warnings, build succeeds (new `Analytics` chunk, 10.57kB). **Live-verified against the real Firebase project — no browser automation tool available this session (same gap as Phases 7/13/14):** a throwaway Node script (run outside `backend/`) seeded 7 real accounts (an organization with an Admin/Adjuster/Viewer member, a fully separate 2nd organization, a solo professional account, a zero-report starter account) and 9 real reports with hand-chosen dates/statuses/types, driving **55/55 checks** against the live HTTP API under both `/api` and `/api/v1`: every headline number matched hand-calculated expectations across 30d/90d/all-time/custom ranges (including legacy-status folding and exact date-boundary isolation); organization scope triggered correctly only for the privileged Owner role with an accurate zero-filled per-member breakdown; the restricted Adjuster role, the solo account, and the enterprise-tier-but-restricted Viewer role all correctly took the personal-scope path; cross-organization isolation was proven in both directions (neither organization's data ever leaked into the other's totals); unauthenticated/garbage-token requests got clean 401s; and a live suspension proved the exact same Phase 14 defense-in-depth mechanics (fresh-token 403 TEAM_ACCESS_SUSPENDED, stale-token 401 TOKEN_REVOKED) against this new route. All 7 accounts/9 reports/3 membership docs deleted afterward, re-verified with a zero-residue query pass.
- **Covers:** `PHASES.md` Phase 15.
- **Dep:** None blocking (per `PHASES.md`); benefits from Phase 13/14's organization/role model, both already in place.

### T-7.16 — Phase 16: Integrations Page & Webhook Management UI
- **Goal:** No `/integrations` page existed anywhere — the webhook backend (register/list/rotate/delete, HMAC-signed deliveries) was fully built but had zero frontend, and there was no page distinguishing real integrations (Webhooks, API) from planned-but-not-built ones (Guidewire, Duck Creek, Salesforce, HubSpot, Dropbox, Google Drive, OneDrive).
- **Status:** **DONE** — 2026-08-18. New standalone `frontend/src/pages/Integrations.jsx` at `/integrations` with real Webhooks/API cards, exactly the 7 named Coming Soon integrations (genuinely non-interactive, `aria-disabled`), and a full register/list/rotate/delete webhook UI wired to the existing backend — one-time secret reveal matching `Settings.jsx`'s `KeyModal` pattern, non-danger/danger `ConfirmDialog`s for rotate/delete, and tier gating that reacts to the real backend's `403 API_ACCESS_DENIED` rather than duplicating a client-side tier-name list. **A real, serious SSRF gap was found and fixed** while verifying the "preserve existing SSRF protection" requirement: the original inline `isSafeWebhookUrl` only blocked the literal string `127.0.0.1` (not the rest of `127.0.0.0/8`), had a dead IPv6-loopback check (compared against `'::1'` when Node's URL parser returns `'[::1]'` with brackets), and had zero DNS-rebinding protection. Fixed in new `backend/utils/webhookUrlSafety.js` — full private/reserved IPv4+IPv6 range coverage plus a real DNS lookup checking every address a hostname currently resolves to, failing closed on error. **A second bug was found in the fix's own first version, caught only by live testing against the real running server:** making the validator async (needed for DNS) and wiring it unchanged into express-validator's `.custom()` silently broke ALL validation — that library determines pass/fail by whether the returned promise *rejects*, not by its resolved value, so a validator resolving to `false` was (surprisingly) treated as valid. A direct `POST /api/webhooks` confirmed every previously-blocked URL was returning `201` after the "fix" shipped. Fixed with a throwing adapter (`assertSafeWebhookUrl`) wired into the route instead, with a dedicated regression test locking in the exact express-validator wiring shape. **A pre-existing, unrelated inconsistency found and flagged, not fixed:** `Settings.jsx`'s API Keys tab and `ApiDocs.jsx` both gate on "Agency or Enterprise," while the real backend (`requireApiAccess`) has allowed Professional tier all along. **A pre-existing, sitewide UX defect found and flagged, not fixed:** the cookie-consent banner has no backdrop and its DOM footprint blocks real clicks on content underneath it, including the login page's own submit button on a narrow mobile viewport.
- **Acceptance:** Registering, listing, rotating, and deleting a webhook all work through the UI; no "Coming Soon" card implies functionality that doesn't exist; the secret is shown once and masked thereafter — all confirmed live in a real browser.
- **QA:** Backend `npm test` → 189/189 passing (18 new, `webhook-url-safety.test.js`), 0 lint errors/44 warnings (unchanged baseline). Frontend 15/15 tests, 0 lint errors/14 warnings, build succeeds. **This session had real browser automation for the first time (Playwright + the system's installed Chrome) — every prior phase's live testing was API-level only.** 49/49 full-browser UI checks (3 real accounts logging in through the actual login form: Professional/starter/a second independent Professional) covering direct navigation+refresh, non-interactive Coming Soon cards, the full register→reveal→copy→rotate→delete lifecycle surviving hard refreshes, the exact `127.0.0.2` SSRF regression rejected end-to-end through the live UI, a real webhook event triggered by a genuine Approve & Finalize click, cross-account isolation in both directions, an unauthenticated redirect, and a mobile pass. Separately, 29/29 direct delivery-mechanics checks (a real `webhookEndpoints` doc seeded via the trusted Admin SDK pointed at a script-controlled local receiver, then real events triggered via the actual approve API) captured and verified the real delivered payload/headers/signature, proved a rotated secret's new signature validates while the old one no longer does, and confirmed the exact retry/backoff schedule (3 attempts on eventual success, 4 attempts stopping at `maxAttempts` on permanent failure, timed to the real backoff policy). **78/78 total live checks passed.** All throwaway accounts/reports/webhook data fully deleted afterward, confirmed via a zero-residue query pass.
- **Covers:** `PHASES.md` Phase 16.
- **Dep:** None (backend was already complete per `PHASES.md`'s own scope note).

### T-7.17 — Phase 17: Organization Admin & Audit Log Viewer
- **Goal:** Audit logging was comprehensive server-side (~41 `recordAuditLog()` call sites) but had zero UI anywhere; no org-level metrics/departments page existed; `Security.jsx` claimed a "Login History" view under Settings → Security that didn't actually exist.
- **Status:** **DONE** — 2026-08-19. New `/organization` page (`frontend/src/pages/OrganizationAdmin.jsx`, enterprise + Owner/Admin/Manager-only via `canViewAllProfiles`) with 6 tabs — Members/Templates/Usage are real org-scoped summaries linking out to the already-built `EnterpriseDashboard`/`Templates.jsx`/`Analytics.jsx` (avoiding a second divergent enterprise-admin surface, per this phase's own risk note), while Teams (role breakdown), Security (MFA adoption/suspended-count/legacy-role-count), and Audit Logs are genuinely new. A standalone `/audit-logs` route shares one `AuditLogViewer.jsx` component with the embedded tab. Backend: `backend/services/organizationService.js` (pure, unit-tested aggregation) + `backend/routes/organization.js` (`GET /metrics`, `/security-summary`, `/audit-logs`, filterable by date/action/actor/target type, paginated, defaulting to the last 90 days), plus a recursive `redactMeta()` that strips any secret/token/credential-shaped audit-log meta key before it ever leaves the server. **A real Golden Rule #1 gap was found and fixed while implementing the Login History view honestly:** the real Firebase-client-SDK login flow never called any backend route, so `login_success` was previously recorded only for MFA-enabled accounts — fixed by reviving the dead `POST /api/auth/verify` endpoint and wiring `AuthContext.jsx`'s `login()`/`loginWithGoogle()` to call it post-sign-in (guarded so MFA accounts, whose real success comes from `/mfa/verify`, are never double-counted). A new `GET /api/users/login-history` backs `Security.jsx`'s claim for every account regardless of tier/role, scoped strictly to the caller's own uid. **Two more real bugs found only via live-browser testing:** a first-render null-dereference crash in the Usage/Security tabs (the lazy-fetch effect hadn't run yet on first paint) fixed by guarding the loading branch on `loading || !data`; and a stale-response race condition in `AuditLogViewer.jsx` on rapid filter changes, fixed with a monotonic request-id guard.
- **Acceptance:** Every logged action type is visible and filterable; org metrics reflect real aggregated data; Phase 14 role permissions and organization isolation are enforced server-side; audit metadata never leaks secrets/tokens — all confirmed live.
- **QA:** Backend `npm test` → 200/200 passing (11 new, `organization-service.test.js`), 0 lint errors/44 warnings (unchanged baseline). Frontend 15/15 tests, 0 lint errors/14 warnings, build succeeds. **Full real-browser (Playwright) verification: 49/49 checks passing in one complete 8-phase run** — Owner/Admin/Manager (every tab, filters, pagination, row-expand with no secret leak, a real live report-approval appearing in the audit trail within seconds), a restricted Adjuster (denied with the correct message, own Login History still works), a suspended member (blocked from a working dashboard), a fully separate second organization (zero cross-org leakage), a non-enterprise account (tier-upgrade prompt), unauthenticated access (redirected to `/login`), and a 390×844 mobile viewport (zero horizontal overflow, zero console errors). Two test-script bugs (a fixed wait sampling mid-loading-skeleton; an unscoped text selector matching a hidden filter-dropdown `<option>` instead of the real table row) and a genuine OOM crash in the test harness itself (unclosed Playwright browser contexts accumulating across 8 phases) were found and fixed along the way — confirmed as test-only issues, not product bugs, by cross-checking directly against Firestore/the live API. All QA data (10 Firebase Auth accounts across 2 organizations, their Firestore docs, the seeded report/template/webhook, and 65 accumulated audit-log entries) deleted afterward with a verified zero-residue re-check.
- **Covers:** `PHASES.md` Phase 17.
- **Dep:** None blocking (per `PHASES.md`); reuses Phase 13/14's organization/role model and Phase 15's `analyticsService.js` directly.

### T-7.23 — Phase 23: Public Marketing Pages & Copy Consistency
- **Goal:** Build the missing `/features`, `/photo-analysis`, and `/solutions` (+ per-vertical) public pages, complete Home.jsx's gaps (9 feature cards, 6 How It Works steps, a Photo Analysis/"Analyze the Entire Inspection" section, a "Try It Free" CTA), standardize engine naming to **FLACRON ENGINE** everywhere (frontend, backend prompts, and PDF/DOCX/export text), fix Pricing.jsx's Enterprise CTA, verify Security.jsx's claims, and sweep for banned marketing terminology.
- **Status:** **DONE** — 2026-08-19. New `frontend/src/pages/Features.jsx` (`/features`, hero + the real `product-generate-report.webp` screenshot + 11 feature deep-dive cards covering every already-shipped capability + CTA), `PhotoAnalysis.jsx` (`/photo-analysis`, workflow steps + an illustrative batch/progress panel, explicitly labeled a UI mock rather than a screenshot + a Golden-Rule-#2 limitations callout), and `Solutions.jsx` + `SolutionDetail.jsx` (`/solutions` index + a single templated `/solutions/:slug` page driven by a new `frontend/src/data/solutions.js`, covering all 7 spec'd personas: Independent Adjusters, Adjusting Firms, Insurance Carriers, TPAs, Inspection Companies, Restoration Companies, Contractors) — routed in `App.jsx`, linked from `Navbar.jsx` (Features now points at the real page instead of the home-page anchor; a new Solutions link added; both nav arrays share one active-state check generalized from the existing `/crm` pattern), and added to `sitemap.xml`. Home.jsx: `features` array expanded 6→9 (added Report Templates, Team Roles & Permissions, Usage Analytics — all real, shipped capabilities, no fabrication); `steps` array expanded 3→6 to match the real pipeline (claim/property details → photo upload → FLACRON ENGINE drafting → per-photo review → editor → approve/export); a new "Analyze the Entire Inspection" section added below the product screenshot (an honest photo-grid/counter/progress-bar illustration, same visual language as the existing hero `DashboardMock`, not presented as a screenshot); a "Try It Free" primary CTA added alongside the existing sample-report download link. Sitewide engine-naming standardized to **FLACRON ENGINE** (resolving the 3-variant inconsistency — "Flacron Engine" / "FlacronAI Engine" / "FLACRON ENGINE" — flagged in `PHASES.md`): mechanical `sed` replacement across 12 frontend files (About/CookiesPolicy/EnterpriseDashboard/FAQs/Footer/Dashboard/SharedReport/ReportPreviewPage/PrivacyPolicy/PhotoReview/TermsOfService/Home) plus targeted edits to the 3 backend files that bake the name into generated documents/prompts (`aiService.js`'s report prompt + Prepared-By line, `documentGenerator.js`'s DOCX cover table + sign-off paragraph, `properPdfGenerator.js`'s PDF cover table + footer + sign-off paragraph) — confirmed zero remaining `Flacron Engine`/`FlacronAI Engine` occurrences repo-wide via grep. Pricing.jsx: Enterprise CTA button text changed from "Contact Sales" to "Talk to Sales" (same `ContactSalesModal` behavior, text-only fix per the task's exact wording); tier feature copy already matched `tiers.js` entitlements (5/50/200/unlimited reports, export formats, CRM/API/white-label gating) — no other changes needed. Security.jsx: fixed a real copy-accuracy bug in the AI Data Handling section — "Uploaded photographs (up to 10 images...)" incorrectly implied a 10-photo total cap when the actual behavior (since Phase 1) is up to 100 photos per report processed in batches of up to 10 per vision-API call; reworded to state both numbers accurately. Banned-terminology sweep (task 8): grepped `frontend/src` and `backend/` for "Suggested Target"/"Recommended Settlement"/"Suggested Damage Amount"/"Suggested Coverage Decision"/"Suggested Liability Decision"/"Settlement Amount"/"Suggested Settlement" (case-insensitive) — **zero matches**, confirmed already clean. `/api` marketing page decision (task 9): **left untouched and flagged as blocked**, per explicit client instruction received this session that APIs should not be shown publicly and replacement documentation will be supplied separately — `ApiDocs.jsx`/`Developers.jsx`/the `Docs` nav link/the `/docs/api` and `/developers` routes were not modified, removed, or hidden, since doing so would have acted on an assumption the client explicitly said not to make. The Enterprise-pricing-model open question (public `$499/mo` price shown alongside a Talk-to-Sales CTA — `PHASES.md` Open Question #11) remains **explicitly unresolved**, unchanged this session, since it's a client pricing-strategy decision, not a copy-accuracy bug.
- **Acceptance:** All new pages exist, render, and are linked from navigation; all are mobile-responsive (built on the same `card`/`btn-primary`/grid-breakpoint patterns already used sitewide, no new CSS system); each has a unique title/meta description/canonical via the existing `Seo.jsx` pattern; no copy describes a capability that doesn't exist server-side (every feature/persona claim traces to an already-shipped, already-verified capability from `CONTEXT.md`'s "Already Implemented" list — none fabricated).
- **QA:** Backend `npm test` → **243/243 passing** (0 regressions from the engine-naming text edits to `aiService.js`/`documentGenerator.js`/`properPdfGenerator.js`), `npm run lint` → 0 errors/59 warnings (unchanged baseline). Frontend `npm test` → **17/17 passing**, `npm run lint` → 0 errors/14 warnings (unchanged baseline — the new pages introduced zero new lint warnings), `npm run build` → succeeds, each new page code-split into its own small chunk (Features 9.48kB, PhotoAnalysis 6.52kB, Solutions 4.55kB, SolutionDetail 3.23kB gzipped-smaller). A dev-server smoke test (both servers already running locally) confirmed `/`, `/features`, `/photo-analysis`, `/solutions`, `/solutions/independent-adjusters`, an invalid `/solutions/nonexistent-slug` (correctly redirects to `/solutions` via the `SolutionDetail` component's `<Navigate>` guard), and `/pricing` all serve 200, and the backend `/health` endpoint stayed healthy throughout. **No real-browser (Playwright/chromium-cli) automation was available this session** — same documented gap as Phases 7/13/14/15/19/20 before Phase 16/17/21/22 happened to have it — so the "full real-browser verification... console errors... failed requests... Lighthouse/SEO check" requested for this phase was **not performed as a genuine rendered-browser pass**; verification here is lint+build+unit-tests+manual code review+a raw-HTTP smoke test, not a substitute for one, and this limitation is being reported honestly rather than fabricated. Recommend a follow-up session with Playwright available to do the full click-through/mobile/accessibility/Lighthouse pass this phase's own testing steps call for.
- **Known limitation, disclosed rather than hidden:** the task asked for "genuine product screenshots" on `/features`; the repo has exactly one real product screenshot asset (`product-generate-report.webp`, already used on Home.jsx). It's reused once on `/features`; the other 11 feature sections use icon-based cards (the same visual language as Home.jsx's existing feature grid) rather than fabricated additional screenshots, since capturing new real screenshots would require live browser automation against seeded (and carefully sanitized) accounts, which wasn't available this session. Flagged as a candidate follow-up once Playwright is available.
- **Covers:** `PHASES.md` Phase 23.
- **Dep:** None blocking (per `PHASES.md`); reused Phase 2's brand tokens and Phase 1/6/7/8's real photo-analysis capabilities for copy accuracy.

### T-7.24 — Phase 24: Photo Quality Warnings, Ordering, Grouping & Annotations
- **Goal:** Add a never-rejecting photo-quality warning (resolution + blur), persisted drag-to-reorder respected by review/export, a human-editable room/area tag with a Photo Library filter/group view, and a non-destructive canvas annotation tool (arrows/rectangles/circles/freehand/pixel-only measurements) that never touches the underlying original/display/thumbnail image bytes.
- **Status:** **DONE** — 2026-08-19. The phase's Open Question (heuristic approach) was resolved per explicit client instruction this session: a deterministic server-side resolution+blur check via `sharp` (already a dependency), not an AI-vision-based one — thresholds (800×600, Laplacian-variance blur score <50) empirically calibrated and documented in `backend/utils/photoQuality.js`. Library decisions: `react-konva`@18.2.16 + `konva`@9.3.22 for annotations (the only React-18-compatible, React-idiomatic option; `fabric.js` considered and passed over), `exif-reader`@2.0.3 for EXIF capture-time parsing — the only two new dependencies. Backend: `photoBatchProcessor.js` stamps every upload with `position`/`qualityWarning`/`qualityReasons`/`qualityMetrics`/`capturedAt` (EXIF from the ORIGINAL bytes only, trustworthiness-checked against clock-reset defaults and implausible future dates); `photoJobService.js` gained `reorderPhotos` (exact-permutation validation) and `updatePhotoAnnotations` (bounded shape-list replace with `expectedUpdatedAt` optimistic-concurrency protection — deliberately the one new mutation that DOES get a stale-check, since a lost annotation edit is real data loss unlike a lost reorder/area-tag) plus a `set_area` branch reusing the existing review route; two new endpoints (`PATCH /:id/photos/reorder`, `PUT /:id/photos/:photoId/annotations`) on the same dual-path authorization + legacy-id guard as the sibling review route; `GET /:id/photos` and the export-appendix builder both now sort by `position`. Frontend: a dependency-free `useDragReorder` hook (Pointer Events, not HTML5 Drag-and-Drop, specifically so mouse and touch share one code path) in the wizard and the post-generation gallery; `PhotoAnalysisPanel` gained room/area + Annotate controls (working even before AI analysis completes); a new `PhotoAnnotator.jsx` with normalized (0..1) shape coordinates, measurement labels always phrased as "~N px (image pixels, not a physical measurement)," and a capture-time badge honestly distinguishing real EXIF from the upload-time fallback; Photo Library gained an area filter + "Group by Area" view.
- **Acceptance:** A deliberately blurry/low-resolution photo shows a warning without being rejected — confirmed on real uploaded synthetic photos, cross-checked against Claude's own independent vision-analysis prose noting the same images "may be out of focus." Drag-reordering persists across generation/refresh — confirmed via a real mouse-dragged wizard reorder landing at exactly `position:0` in the final Firestore record. Grouping by area correctly filters the Photo Library — confirmed against real tagged data (taxonomy + custom values). An annotation (5 real shapes of every type) saves, reloads correctly, and does not alter the underlying image file — confirmed via SHA-256 byte-for-byte comparison of the original/display/thumbnail images before and after annotating.
- **QA:** Backend `npm test` → **279/279 passing** (21 new: `photo-quality.test.js`, `photo-capture-time.test.js`, `photo-annotations-validation.test.js`, plus new/extended cases in `photo-batch-processor.test.js`), `npm run lint` → 0 errors/61 warnings (unchanged baseline). Frontend `npm test` → **27/27 passing** (10 new, `photoAnnotations.test.js`), `npm run lint` → 0 errors/14 warnings (unchanged baseline), `npm run build` → succeeds (Konva code-splits into its own lazy chunk, loaded only when Dashboard or Photo Library is actually visited). **Full real-browser verification against the real Firebase/Anthropic-backed local dev stack** using Playwright (no dedicated browser tool was available this session — installed globally via npm and driven directly through Node scripts against this machine's real cached Chromium): wizard upload/client-side low-res flagging/mouse-dragged reorder; server-side quality detection exactly matching expectations on all 4 real uploaded photos; area tagging via both API and real UI; persisted reorder via API and UI with exact-permutation/legacy-id rejection; a full annotation lifecycle including a real mouse-drawn shape through the actual UI, a 409 stale-update rejection, an undo/delete-shrink, and 400s on oversized/malformed payloads; byte-identical image verification; Photo Library area filter/grouping; full cross-account authorization isolation (404s + an empty cross-account library + a bare 401); and a real mobile viewport (iPhone 13) pass with genuine CDP touch taps, zero console errors/failed requests throughout. One test-script-only bug (a QA script's raw DOM removal of the cookie-consent banner desyncing it from React and crashing the app) was found and fixed before it produced a false failure; the same pre-existing, already-documented cookie-banner-blocks-clicks defect from Phase 16 was reproduced again on mobile login and worked around in the script, not fixed (out of scope). All QA accounts/report/Storage objects/throwaway scripts were deleted afterward; a temporary local-only rate-limit increase (needed only because repeated browser-test runs exhausted the real 100-req/15-min limiter) was reverted before finishing.
- **Known limitation, disclosed rather than hidden:** shape resize handles after creation were not built (move/delete/redraw only — a deliberate scoping choice, not an oversight). Genuine on-device multi-touch drag-gesture simulation has a real tooling gap (Playwright has no high-level touch-drag primitive) — real taps were verified via CDP, and the drag gesture itself was verified at mobile viewport size via mouse, exercising the identical Pointer-Events-based handler code with no separate touch-only branch to miss.
- **Covers:** `PHASES.md` Phase 24.
- **Dep:** Soft dependency on Phase 6 (per-photo record model) and Phase 8 (taxonomy for area tagging), both already shipped.

### T-7.10, T-7.13, T-7.18 through T-7.22, T-7.25 through T-7.29 — remaining `PHASES.md` phases
- Not started, **except Phases 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, and 24, which are also DONE** (2026-08-16 through 2026-08-19, sessions 12-29) but were never all individually broken out into their own `T-7.N` lines here (Phase 10 is T-7.9, Phase 11 is T-7.11, Phase 12 is T-7.12, Phase 14 is T-7.14, Phase 15 is T-7.15, Phase 16 is T-7.16, Phase 17 is T-7.17, Phase 23 is T-7.23, Phase 24 is T-7.24 above; Phases 7-9, 13, and 18-22 remain undocumented as separate task lines) — see `PHASES.md`'s own per-phase sections and `PROGRESS.md`'s changelog for their full implementation/testing detail; this is a pre-existing documentation gap in this file, not a signal those phases are unstarted. Everything else (25 through 29, plus Phase 30) is genuinely not started. See `PHASES.md` for full detail (objective/scope/tasks/files/dependencies/acceptance/testing/risks) per phase. Each will get its own task line here (`T-7.N`) with a DONE/status update when implemented, mirroring T-7.1–T-7.12/T-7.14–T-7.17/T-7.23/T-7.24 above — do not pre-populate detail here to avoid drift from `PHASES.md`'s authoritative content.
