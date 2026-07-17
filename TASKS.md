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
