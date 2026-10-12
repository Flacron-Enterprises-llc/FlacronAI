# FlacronAI Mobile — Store Release Readiness (Phase 10)

> Prepared 2026-10-07. **Drafts only — nothing here has been submitted, published, or entered
> into App Store Connect / Play Console.** Everything is derived from the code in this branch
> and from copy already published on flacronai.com. Items marked **DECISION** or **ACCESS**
> are blocked on the client; they are not guesses.
> Status tracking lives in `MOBILE_DEVELOPMENT_PHASES.md` (§1, §3 Phase 10, §10).

---

## 1. Identity & build configuration (current state)

| Item | Value | Source |
|---|---|---|
| App name | FlacronAI | `app.config.ts` |
| iOS bundle ID / Android package | `com.flacronenterprises.flacronai` (both) | client-confirmed, §2 |
| EAS project | `@flacron-enterprises-llc/flacronai` (`c8227fa0-…`) | owner: Flacron Enterprises LLC |
| Marketing version | `1.0.0` | `app.config.ts` |
| Build numbers | EAS remote (`appVersionSource: remote`), `autoIncrement` on `production` | `eas.json` |
| Runtime version | `fingerprint` policy | `app.config.ts` |
| Store build profile | `production` → AAB (Android) / App Store IPA (iOS), API `https://api.flacronai.com/api/v1` | `eas.json` |
| Submit profile | `production`: Android `internal` track, `draft` release; iOS default (TestFlight upload) | `eas.json` (added Phase 10) |
| Android signing | EAS-managed keystore already exists (used by the 2026-09-10 and 2026-10-07 dev builds) | EAS credentials |
| iOS signing | **ACCESS** — no Apple Developer / App Store Connect access in this environment yet | — |
| Tablet | `ios.supportsTablet: true`; Android: no restrictions | `app.config.ts` |

**EAS environments — RESOLVED 2026-10-07 (client-approved):** the 8 `EXPO_PUBLIC_FIREBASE_*` /
`EXPO_PUBLIC_GOOGLE_*` variables now belong to `development`, `preview` and `production` (the existing
variables were attached to the extra environments with `eas env:update`; no value was copied or
printed). There is only one Firebase project, `flacronai-c8dab` (also the live web app's), so every
build environment uses its existing iOS/Web OAuth client IDs. Still per-environment:
`EXPO_PUBLIC_API_BASE_URL` — `production` = `https://api.flacronai.com/api/v1` (in `eas.json`);
`preview` has none, and **no staging backend exists**, so a preview build can only target production
(which does not yet include the mobile APIs) until a staging service is approved (tracker §10.1/§10.34).
Google Sign-In on Play-distributed builds additionally needs the **Play App Signing SHA-1** added to the
Firebase Android app (console, after the first Play upload).

`eas.json` channels are set but `expo-updates` is not installed — harmless (EAS warns); install
it only if over-the-air updates are wanted (**DECISION**, not required for v1).

## 1a. Business rules inherited from the website (source of truth, verified 2026-10-07)

| Rule | Website evidence | Mobile/store mapping |
|---|---|---|
| Plans & prices | `frontend/src/data/plans.js` (Pricing page): Starter free; Professional **$39.99/mo**; Agency **$99.99/mo**; annual = 20% off → **$31.99/mo = $383.88/yr** and **$79.99/mo = $959.88/yr**; report limits 5/50/200/unlimited (`backend/config/tiers.js`) | 4 auto-renewing subscriptions in one App Store subscription group / Play products with monthly + annual base plans, mapped via `APPLE_IAP_PRODUCT_{PROFESSIONAL,PROFESSIONAL_ANNUAL,AGENCY,AGENCY_ANNUAL}` and `GOOGLE_PLAY_PRODUCT_*` (`product:basePlan`). The app shows only the store's localized `displayPrice` (no hardcoded prices). |
| Enterprise | Pricing CTA "Talk to Sales" (Contact Sales modal) | Not sold in-app (already enforced, §10.20). |
| Free trial | None in code or Pricing page; Refund Policy §6 still shows a "[CLIENT TO CONFIRM]" placeholder | No introductory offers in the stores. Placeholder fix proposed in `POLICY_CORRECTIONS_PROPOSED.md`. |
| Refunds | Refund Policy §4: subscription fees non-refundable except listed discretionary cases | Store purchases: refunds by Apple/Google (store rules apply); proposed policy sentence in `POLICY_CORRECTIONS_PROPOSED.md` §3. Account deletion issues no refund (matches §4). |
| Failed payments / debts | Refund Policy §5: "we do not pursue collection of the unpaid amount" | Basis for the outstanding-invoice behaviour after deletion (see tracker §10.28 update). |
| Admin entitlements | `routes/sales.js` admin tier → own `adminTier` source; highest source wins (§10.21) | Unchanged; store purchases never overwrite Stripe/admin records. |
| Photo add-on packs | Web-only Stripe purchase (prices still placeholders per `planConfig.js`) | Not sold or linked in the app (Apple 3.1.1); server capacity message says only "upgrade your plan". |
| Retention / deletion | Privacy Policy §5 promises a 90-day recovery window + automatic expiries that do not exist | Corrections drafted for approval: `POLICY_CORRECTIONS_PROPOSED.md`. Store privacy answers must follow the corrected text. |
| EULA | Terms of Service have no app-store provisions (no Apple third-party-beneficiary / store-billing clauses) | Recommendation: Apple **standard EULA** + in-app links to Terms & Privacy (decision §10.23). |

**Store price points (decision needed):** Google Play accepts the exact web prices. Apple uses fixed
price points: $39.99 and $99.99 exist; check in App Store Connect whether $383.88 / $959.88 are
available — if not, choose the nearest point (e.g. $379.99/$384.99 and $949.99/$959.99). Store fees
(15–30%) are not passed on unless you decide otherwise.

**Listing classification (draft — company to confirm):** primary category **Business**, secondary
**Productivity**; age rating **4+ / Everyone** (no objectionable content, no public user-generated
content, no gambling, no unrestricted web browsing — legal pages open in the system browser);
keywords: inspection report, insurance claim, adjuster, damage photos, property inspection, claim
report, field inspection, PDF report. Data-collection answers: §6 below (after the policy correction).

## 2. Assets

| Asset | Status |
|---|---|
| App icon `assets/images/icon.png` | 1024×1024, opaque (App Store requires no alpha) ✔ |
| Android adaptive icon foreground | 1024×1024 transparent on `#FFFFFF` ✔ |
| Splash `splash-icon.png` | 1024×1024 transparent, 220 pt wide on white ✔ |
| Android notification small icon | **New:** `notification-icon.png`, 96×96 white FA silhouette on transparent, tinted `#FD4403` ✔ (wired via `expo-notifications` plugin, confirmed in resolved manifest) |
| Play feature graphic (1024×500) | Not produced — needs a brand-approved layout (**DECISION**: reuse `frontend/public/og-image.png` style?) |
| Store screenshots | **Not captured.** Must come from the real app on a device/emulator with safe demo data; no device was available. Never mock these. Required sizes: iPhone 6.9"/6.5", iPad 13" (tablet supported), Android phone + 7"/10" tablet. |

## 3. Store listing drafts (based on published flacronai.com copy)

**Subtitle (iOS, ≤30):** `Draft inspection reports`
**Short description (Play, ≤80):** `Turn inspection photos and notes into draft reports for professional review.`

**Full description:**

> FlacronAI turns inspection documentation into professional draft reports.
>
> Enter claim details, field notes and damage photos — taken with your camera or picked from
> your library — and FlacronAI organizes them into a structured draft report. A qualified
> professional reviews, edits and approves every report before it is finalized; nothing
> AI-generated is treated as a final determination.
>
> • Guided 5-step report creation: claim, property or vehicle, loss details, photos, review
> • Photo uploads straight from the field, with clear status for each photo
> • Review, comment on and approve reports, with version history
> • Export finalized reports as PDF or DOCX and share them from your device
> • Notifications when a report is ready or needs your attention
> • Secure sign-in with email, Google or Apple, plus optional two-factor authentication
> • Manage your profile, security and subscription in the app; delete your account at any time
>
> Use the same FlacronAI account on the web at flacronai.com.

Rules applied (Golden Rule #1/#2): no statistics, accuracy %, testimonials, partner names or
compliance badges; AI described as drafting for human review only. Keywords / category
(suggest *Business* or *Productivity*) / age rating questionnaire: **DECISION** (client).

## 4. URLs & contacts

| Purpose | URL |
|---|---|
| Privacy policy | https://flacronai.com/privacy-policy |
| Terms of service | https://flacronai.com/terms-of-service |
| Support / marketing | https://flacronai.com/contact · support@flacronenterprises.com |
| Account deletion (Play "web link" requirement) | **https://flacronai.com/account-deletion** — public information page (implemented 2026-10-07; **live only after the frontend is deployed**). Explains in-app + web deletion, deleted vs. kept data, subscriptions, and the existing support route for people who can't sign in. Web Settings deletion now supports Google/Apple accounts (provider re-sign-in). |
| EULA | **DECISION** §10.23 (Apple standard EULA vs. Terms as custom EULA) |

(Paths match `mobile/src/features/legal/links.ts`, which mirrors `frontend/src/App.jsx` routes.)

## 5. Permissions (resolved `expo config --type introspect`, production profile)

| Platform | Permission | Why | Prompt text |
|---|---|---|---|
| iOS | Camera | photograph damage into a report | "FlacronAI needs access to your camera so you can photograph damage directly into a report." |
| iOS | Photo library | attach existing inspection photos | "FlacronAI needs access to your photos so you can attach inspection photos to a report." |
| iOS | Notifications | report/account activity (asked in-app, not at launch) | system prompt |
| iOS | Local network (`NSLocalNetworkUsageDescription`) | added by `expo-dev-client` for dev builds | Expo default — expected in store builds; acceptable |
| iOS | Face ID | **removed in Phase 10** (`faceIDPermission: false`; never used) | — |
| Android | INTERNET, VIBRATE | networking / notifications | — |
| Android | READ/WRITE_EXTERNAL_STORAGE | `maxSdkVersion 32` only (legacy picker on Android ≤12) | — |
| Android | CAMERA, POST_NOTIFICATIONS, BILLING | merged from `expo-image-picker`, `expo-notifications`, `expo-iap` library manifests | runtime |
| Android | RECORD_AUDIO | **removed** (`tools:node="remove"`; stills only) | — |
| Android | SYSTEM_ALERT_WINDOW | **removed in Phase 10** (`blockedPermissions`) | — |

No location, contacts, microphone, Bluetooth, health or advertising-ID access is requested. No
analytics, advertising or crash-reporting SDK is installed (crash reporting is an open
**DECISION**, §10).

## 6. Privacy disclosures (Apple App Privacy / Google Data safety) — derived from code

Collected and **linked to the user's account**, used for **app functionality** (and account
security where noted). None is used for tracking or advertising; none is sold.

| Data type (Apple / Google category) | What exactly | Where in code |
|---|---|---|
| Contact info — name, email, phone, physical address | Account email; profile display/first/last name, company, phone, address | auth, `profileValidation.ts`, `PUT /users/profile` |
| User content — photos | Inspection photos uploaded to a report | wizard Photos step → Firebase Storage (private) |
| User content — other | Report content: claim numbers, **insured person's name, email, property address**, loss details, comments | wizard, report detail |
| Identifiers — user ID | Firebase uid | everywhere |
| Identifiers — device ID | Expo push token + per-sign-in binding id (only if notifications allowed) | `pushRegistration.ts`, `pushDevices` |
| Purchases | Store transaction / subscription state for in-app subscriptions | `routes/billing.js`, `storeSubscriptions` |
| Other / security | IP address + user agent in security audit logs and new-device sign-in alerts | `auditLogService.js`, `emailService.js` |

Notes for the forms:
- **Third-party data:** report content includes information about insured third parties —
  state this in the privacy policy review (**DECISION**/legal).
- **Processors:** Google Firebase (Auth, Firestore, Storage), AWS (API hosting, SES email),
  Anthropic Claude and IBM watsonx (AI drafting from report content and photos), Expo push
  service (notification delivery), Stripe (web billing only), Apple / Google (store billing).
  Play's "shared" definition excludes service providers acting on our behalf — confirm.
- **Encrypted in transit:** yes (HTTPS only; `env.ts` rejects non-HTTPS for preview/production).
- **Deletion:** in-app (Settings → Delete account) — deletes profile, reports, photos, exports,
  drafts, notifications, push devices; Stripe subscriptions cancelled; retained: audit logs,
  billing/purchase records, tombstone (documented in `routes/users.js`).
- **Optional vs required:** profile phone/company/address optional; email required; photos and
  report content required for the core feature; push token optional.
- Before submitting, re-check the live privacy policy covers every row above (Golden Rule #1:
  no compliance claims beyond what is true).

## 7. Reviewer access (draft instructions — account not yet created)

> Sign in with the demo account below (email + password). Two-factor authentication is off for
> this account. Tap **New report** to create a report: enter any claim details, add a photo
> (camera or library), and generate the draft. Open the report to review, approve, and export
> it as PDF. Subscriptions: in-app purchases are processed in the sandbox for this account.
> Settings → Delete account shows the deletion flow (please do not complete it on this account).

**Reviewer account plan (uses existing infrastructure only — no bypass):** create a normal
**Starter** account on production through the regular sign-up (email/password, MFA off), verify its
email, generate one sample report with synthetic data (demo claim, demo photos), and add its email to
`STORE_SANDBOX_TESTER_EMAILS` on ECS so Apple/Google **sandbox** purchases are accepted for that one
account. Starter's 5 reports/month cover the review; purchases upgrade it in sandbox only. No admin
grant (it would hide the purchase flow), no shared password in the repo — the credentials go only into
the App Store Connect / Play Console "sign-in required" fields. Needs: production deployment first,
then whoever creates the account (a production write — awaiting authorization).

## 8. Readiness checklist

| # | Item | Status |
|---|---|---|
| 1 | Code/static checks (tsc, lint, jest, backend tests, rules emulator, expo-doctor) | ✔ 2026-10-07 |
| 2 | Native Android compile (EAS dev build `5df37167…`) | ✔ FINISHED 2026-10-07 (APK not installed anywhere — no device) |
| 2b | Backend API end-to-end on local emulators (real routes, real AI, mobile's exact contract) | ✔ 36/36 (not a device test) |
| 3 | Android/iOS runtime matrix | **Partial (cloud emulator/simulator, 2026-10-08):** sign-in, wizard, photo upload, AI draft, review, approve, export → PDF → share, account isolation ✔ on Android 34 emulator AND iOS simulator; profile-save feedback ✔ Android. NOT device-tested: in-app deletion completion (CI minutes exhausted until 2026-11-01; API-level verified), push, store purchases, camera, permission denial, poor network, tablet, VoiceOver/TalkBack |
| 4 | EAS preview/production env vars (Firebase/Google public config) | ✔ done 2026-10-07 |
| 5 | Backend with mobile APIs deployed (ECS) + new env vars | ✖ authorization needed (§9) |
| 6 | Firestore rules deployed | ✖ authorization needed (§9) |
| 7 | APNs key + FCM V1 credentials in EAS; `EXPO_ACCESS_TOKEN`, `PUSH_NOTIFICATIONS_ENABLED` on ECS | ✖ Apple/Firebase console access |
| 8 | App Store Connect app record, subscription group + products, ASN V2 URL, API key | ✖ ACCESS + prices DECISION |
| 9 | Play Console app, subscriptions, service account, RTDN Pub/Sub topic + push subscription | ✖ ACCESS + prices DECISION |
| 10 | Screenshots, feature graphic | ✖ needs device + design decision |
| 11 | Privacy forms, EULA, age rating, category | drafts here; ✖ client DECISION |
| 12 | Internal track / TestFlight build installed on a real device (Phase 10 completion criterion) | ✖ |

## 9. Production deployment + submission steps awaiting authorization (do NOT run without approval)

1. **Backend (AWS ECS):** deploy this branch's backend (new: `/api/v1/billing/*`, push routes,
   account-deletion changes + cleanup sweeper). Set on the task definition (secrets via the
   existing secret store, never the repo): `EXPO_ACCESS_TOKEN`, `PUSH_NOTIFICATIONS_ENABLED`,
   `APPLE_IAP_*`, `APPLE_ROOT_CA_CERT_PATHS`, `GOOGLE_PLAY_*`, `STORE_SANDBOX_TESTER_EMAILS`
   (leave `STORE_BILLING_ACCEPT_SANDBOX` unset in production), optional
   `ACCOUNT_DELETION_SWEEP_*` / `STRIPE_ACCOUNT_DELETE_TIMEOUT_MS`, and **`TRUST_PROXY_HOPS`** = the
   number of proxies in front of the task (1 for an ALB only; confirm whether CloudFront or another
   layer sits in front) — without it every per-IP rate limit sees the load balancer's IP. Verify `GET /health`, then
   `GET /api/v1/billing/status` returns 401 (deployed) not 404.
1b. **Frontend (AWS Amplify):** deploy this branch's frontend so `/account-deletion` (store deletion
   link) and the Google/Apple-capable delete flow in Settings go live; then open the URL logged out and
   confirm it renders. Deploy the backend first or together — the web Google/Apple path uses the
   recent-sign-in deletion that only this branch's backend accepts.
2. **Firestore rules:** `firebase deploy --only firestore:rules --project <prod>` from
   `backend/` (closes the self-tier-escalation hole the old rules allow; emulator suite 5/5).
3. **Store webhooks:** App Store Server Notifications V2 →
   `https://api.flacronai.com/api/v1/billing/store/notifications/apple` (production + sandbox);
   Play RTDN Pub/Sub push subscription →
   `https://api.flacronai.com/api/v1/billing/store/notifications/google` with OIDC audience =
   `GOOGLE_PLAY_RTDN_AUDIENCE`.
4. **EAS:** add Firebase/Google public vars to `preview` + `production`; upload APNs key + FCM V1
   service account (`eas credentials`).
5. **Builds:** `eas build -p all --profile production`, then
   `eas submit -p android --profile production` (internal track, draft) and
   `eas submit -p ios --profile production` (TestFlight). Install from the internal track /
   TestFlight on real devices and run the §8 row 3 matrix.
6. **Public release / review submission:** separate explicit approval — not part of Phase 10.

## 10. Device QA evidence + private Android QA APK

### 10.1 Verified on cloud devices (2026-10-08) — real screenshots
Android 34 emulator (EAS Workflows, nested virtualization) and iOS simulator (iPhone 17, macOS job), app
built from this branch, against an **emulator-backed local test backend** (no production data). Full
results: tracker §4 "Phase 10 session 5". Screenshots: `docs/qa-screenshots/`.

| Flow | Android | iOS | Evidence |
|---|---|---|---|
| Sign-in → dashboard | ✔ | ✔ | `01-login`, `02-dashboard` |
| Report wizard (claim, property, loss, library photo) | ✔ | ✔ | `03`–`06` |
| Photo upload (multipart fix) → AI generation → draft review | ✔ | ✔ | `05-wizard-photo-uploaded`, `07-report-processing`, `08-report-draft` |
| Approve sheet (incomplete details blocked) → finalize | ✔ | ✔ | `09-approval-sheet`, `10-report-finalized` |
| Export → authenticated PDF download → share sheet | ✔ | ✔ | `11-export-sheet`, `12-share-sheet` |
| Account isolation (second account sees no reports) | ✔ | ✔ | `20-isolation-empty-list` |
| Settings, profile save + visible "Profile saved." | ✔ | — | `21-settings`, `22-profile-saved` |
| Delete-account screen (subscription check, DELETE, password) | ✔ reached | — | `23-delete-account` |

API-level only (not on a device): deletion submit + sign-out, Stripe cancellation at deletion (real
sandbox 19/19), deletion recovery sweeper (42/42 local E2E).

### 10.2 Still pending (device and/or setup)
- **Submitted account deletion** on a device (free CI minutes exhausted until 2026-11-01).
- **Push** (needs FCM V1 / APNs credentials in EAS + `EXPO_ACCESS_TOKEN`, `PUSH_NOTIFICATIONS_ENABLED` on the backend).
- **Store purchases / restore / plan changes** (needs App Store Connect + Play Console products, sandbox testers).
- **Camera capture**, permission denial, poor network / offline retry (real device).
- **Tablets** (iPad / Android tablet layouts) and **accessibility** (VoiceOver, TalkBack, large text).
- Google / Apple sign-in on the QA build (Google needs the build's SHA-1 in Firebase; Apple needs an iOS device).

### 10.3 Private Android QA APK — GitHub Actions + Firebase App Distribution (2026-10-12)
**Pipeline:** `.github/workflows/android-qa-apk.yml` runs on GitHub-hosted runners (free for this public
repo) only from branch `qa/android-qa-apk`, in the branch-locked `qa-android` environment. It loads the
`qa` profile env from `eas.json`, runs the QA config guards, `expo prebuild` + `gradlew assembleRelease`
(Hermes JS bundle embedded — no Metro, laptop or tunnel), signs with the existing EAS-managed company
keystore (GitHub environment secrets; cert SHA-256 `87974bb7…92a0b3`), then verifies the signature,
the embedded staging config and the absence of server secrets/test credentials, and uploads to Firebase
App Distribution (group `qa-testers`) using keyless Workload Identity Federation. The APK is **not**
attached as a workflow artifact because the repository is public. No EAS build credits are used.

**Staging backend:** Cloud Run `flacronai-staging-api` (project `flacronai-staging-qa`, `us-central1`),
`https://flacronai-staging-api-93799061110.us-central1.run.app/api/v1` — Google-managed HTTPS, min 0 /
max 1 instance, CPU always allocated (background AI pipelines). Scripts + limits:
`backend/deploy/staging-gcp/README.md`. The EC2 staging host and its resources were **deleted** on 2026-10-12.

**Verified on staging, API level with disposable accounts (2026-10-12; automated scripts — NOT device tests):**
- Register → verify (staging helper) → login; 401 without token; per-account isolation (other account: 404 on read/export, not in list, staged photos invisible).
- Photo staging upload; background report pipeline runs on Cloud Run.
- **Restart recovery:** a run left `processing` with a stale lease (simulated killed instance) is surfaced as retryable by the next status read; two concurrent Retries → one runs, the other `409 ALREADY_PROCESSING` (no duplicate processing).
- **Stripe sandbox** (company sandbox, livemode=false): checkout session created with the FlacronAI Professional price; webhook with a wrong signature → 400; valid signed `checkout.session.completed` → tier `professional`, replay is idempotent; real Stripe-delivered events → 200 at Cloud Run.
- **Account deletion** cancels the disposable subscription in Stripe (`canceled`) and removes reports, Firestore user doc and Storage objects; old token rejected.
- **Deletion cleanup recovery:** a deletion that stopped after the Stripe step (stale tombstone) is finished by the sweeper (reports + Storage removed, login 401).

**Blocked / not yet verified:**
- **AI draft generation → review/approval of real content → final PDF**: the stored Anthropic key is a user-scoped key (`sk-ant-usr-…`) that requires an `anthropic-workspace-id`; a workspace-scoped API key is needed (kept out of staging until then).
- Stripe sandbox secret key was exposed in a local terminal and needs rotating (shared company sandbox — coordinate with the other Flacron products).
- True instance kill during a long AI run (needs the AI key); everything on a physical device; push (FCM/APNs + Expo token); store purchases; Google sign-in (off in the QA build); camera, tablets, accessibility; annual/Enterprise billing (not configured on staging).

**Install (testers):** accept the Firebase App Distribution email invite on the Android phone → follow
the link (sign in with the invited Google account) → download FlacronAI → allow "Install unknown apps"
when prompted → install. Uninstall any older FlacronAI dev/EAS build first if Android reports a
signature conflict (same package, different signer).

**QA checklist (each tester, own disposable account):**
1. Sign up with your own email → on the "verify your email" screen, message the QA coordinator, who runs
   `backend/deploy/staging-gcp/verify-tester.sh <email>` (staging sends **no emails**) → tap the
   refresh/continue button → dashboard. Sign out/in. (Forgot-password emails are not sent on staging — skip.)
2. Optional: enable two-factor in Settings → Sign-in & security; sign in again with the code.
3. New report: claim + property + loss details; add photos from camera AND library; try a non-image/oversized file.
4. Generate → wait for "Draft — needs review" → read draft → comment → History tab.
5. Approve & finalize (try once with a field empty — must be blocked) → Export PDF → share/save.
6. Turn on airplane mode mid-upload → reconnect → retry; kill the app mid-wizard → reopen (draft resumes).
7. Settings → Profile edit → "Profile saved." shown; Legal & support links open.
8. Second tester account must not see the first account's reports.
9. Delete account (disposable account only) → signed out → cannot sign in again.
10. AI draft, approval with content, PDF export and Stripe are expected to fail until the staging AI and
    Stripe sandbox keys are added — record what you see, but don't file them as app bugs.
11. Note device model / Android version for every issue; screenshot + time.
