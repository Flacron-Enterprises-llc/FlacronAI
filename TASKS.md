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

### T-2.10 — Report templates
- **Covers:** §5.
- **Acceptance:** Multiple templates (property, roof, water, fire/smoke, wind/hail, storm, theft/vandalism, auto, commercial, GL, personal-property inventory, restoration progress, supplement, reinspection, final completion, custom enterprise) — each with own required fields/sections/disclaimers. (Ship incrementally: one template per sub-task if large.)
- **QA:** Each template renders its own structure + disclaimer.

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
- **Status:** GAP CONFIRMED — `Dashboard.jsx` report edit view is a plain `<textarea>` over the full markdown content plus separate raw textareas per field.
- **Goal:** Section-based editing (Executive Summary, Claim Info, Damage Assessment, etc.) with per-section "regenerate" and accept/reject of AI suggestions (this overlaps existing Phase-2 backlog item T-2.6 "AI suggestion review UI" — do them together, don't duplicate). Large task; scope as its own multi-step plan before implementing.

### T-6.18 — Calendar layout + event display fixes
- **Client item:** #12, P2-#7.
- **Goal:** Verify current CRM appointments calendar (`CRM.jsx`) against the specific complaints: missing weekday columns, truncated event titles, an event rendering as spanning two days when it's single-day. Needs a live look at the current calendar component before scoping a fix — not yet audited.

### T-6.19 — Confirmation dialogs for destructive/high-stakes actions
- **Client item:** #32, P3-#2.
- **Goal:** Add confirm-before for: delete report/client/claim, bulk delete, restore version, finalize report, cancel subscription, revoke API key, delete account. Most of these already exist for account deletion (T-3.10f); audit the rest and add where missing.

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
