# FlacronAI Mobile — Phase Tracker

> **Read this file first, every session, before touching anything under `mobile/`.**
> This is the permanent source of truth for mobile development: phases, status, decisions,
> blockers, validation evidence. It is updated after every action and every phase — never
> mark a phase complete without recording the validation evidence for it.
>
> This file lives entirely inside the isolated `mobile/` directory. It does not replace or
> duplicate the repo-root `CLAUDE.md` / `PROGRESS.md` / `TASKS.md` system used by the web
> app — those govern `frontend/` and `backend/` and are unaffected by mobile work.

> **See also:** [`WEB_TO_MOBILE_REUSE_STRATEGY.md`](./WEB_TO_MOBILE_REUSE_STRATEGY.md) —
> the evidence-based reuse matrix and feature-parity map covering what every future phase
> should reuse from the existing web/backend system vs. build natively. **Every future
> phase must consult that document before implementation begins.** If a phase's plan
> conflicts with a classification or risk noted there, resolve the conflict in that
> document first, not by improvising in the phase.

> **See also:** [`AUTHENTICATION_ARCHITECTURE.md`](./AUTHENTICATION_ARCHITECTURE.md) — a
> focused, code-verified audit of the existing web/backend authentication system, a
> strategy comparison, and a specific recommendation for Phase 3, produced 2026-09-08.
> **This is a recommendation pending your approval, not a decision already made.** Read it
> in full before Phase 3 implementation begins.

---

## 0. How to use this file

1. Check **§1 Current Status** for the active phase.
2. Read [`WEB_TO_MOBILE_REUSE_STRATEGY.md`](./WEB_TO_MOBILE_REUSE_STRATEGY.md) for what the
   active phase should reuse vs. build natively, and for any client decision it flags as a
   dependency of that phase.
3. Read that phase's entry in **§3 Phase Plan** for objective/scope/validation.
4. Do the work for that phase only — do not start a later phase early.
5. Record what happened in **§4 Progress Log** (with validation evidence), update **§5
   Decisions Log** / **§6 Blockers Log** if applicable, then update **§1 Current Status**.
6. Stop and report. Do not silently roll into the next phase.

---

## 1. Current Status

> **HANDOVER — 2026-10-19 (mobile paused for web work).**
> - **Implemented (PR #30, branch `qa/android-qa-apk`, head `eda1d76`):** Phases 1–10 — Expo app foundation,
>   env config, full auth (email/Google/MFA), typed API layer, native dashboard + 5-step generate wizard,
>   report review/approve/finalize, authenticated export/share, push (backend + app, flag-gated), IAP
>   (`expo-iap`, store setup pending), account screens incl. deletion, store-readiness docs; Cloud Run
>   staging + Android QA APK pipeline (GitHub Actions → Firebase App Distribution).
> - **Verified:** cloud Android 34 + iOS simulator — sign-in → wizard → photo upload → AI draft → approve →
>   finalize → PDF export/share, account isolation, profile save (STORE_RELEASE_READINESS §10.1); real
>   Claude draft on staging (cautious wording; approval blocked without signature); staging push enabled.
> - **Status:** QA APK release `03hc2qep8422o` on App Distribution (`qa-testers`). Staging =
>   Cloud Run `flacronai-staging-api` (project `flacronai-staging-qa`). **PR #30 OPEN, NOT merged, GitHub
>   reports CONFLICTING** — merging deploys prod; do not merge without client approval.
> - **Main moved on (PRs #31–#36, 2026-10-17, other dev):** multicloud AWS/Azure/IBM pipelines + Stripe
>   centralization (`app_id=flacron-ai`, billing ledger, new live webhook). Rebasing/merging main into
>   PR #30 conflicts in `backend/routes/payment.js` and `backend/test/helpers/fakeFirestore.js`; also
>   touches `.env.example`, `server.js`, `package-lock.json` (auto-merge). Staging Stripe sandbox config
>   must be re-checked against the new `app_id` standard after integration.
> - **Remaining:** resolve conflicts with main; device QA of submitted deletion, push delivery, camera,
>   offline, tablets/a11y; Google sign-in (staging OAuth consent screen — console step); store purchases
>   (App Store Connect/Play products, sandbox testers); iOS creds/APNs in EAS; roll exposed Stripe sandbox
>   key; workspace-scoped Anthropic key for staging; store submission (needs approval).

- **2026-10-08 — Phase 10: IN PROGRESS (not complete).** Cloud devices (Android 34 emulator + iOS
  simulator) passed sign-in → upload → AI draft → review → approve → export/share + isolation on BOTH
  platforms after fixing a real upload defect (Expo SDK 57 `expo/fetch` rejects RN `{uri}` parts). Profile
  save feedback fix verified on Android. In-app deletion NOT device-tested (free CI minutes exhausted;
  reset 2026-11-01; $0 billed). Push, purchases, camera, tablet, accessibility still need real devices /
  store setup. Detail: §4 "Phase 10 session 5".

- **2026-10-07 (continuation) — Phase 10: still IN PROGRESS; NO device/emulator/simulator test has
  been run.** Done this pass: EAS Android dev build FINISHED (first native compile incl. expo-iap /
  push); EAS preview + production now carry the Firebase/Google client config (approved); web
  `/account-deletion` public page + Google/Apple re-auth in web Settings deletion (not deployed);
  rules-test flake root-caused (offline cache fallback) and fixed; a real duplicate-report /
  double-credit defect in `POST /reports/generate` found by a local API end-to-end run and fixed
  (36/36 after the fix). No Android phone is available, and a local emulator is not feasible on
  this PC (0.8 GB commit free, no hypervisor); cloud testing and a Stripe CLI login await the
  client (§10.34–35). Backend 1379 / 1372 / 0 fail / 7 skipped; rules 5/5 ×3; frontend 328 tests
  pass (incl. 11 new; one file needs a dummy Firebase env var in this worktree), `vite build` blocked
  by host memory; mobile unchanged since the previous entry. Detail: §4 "Phase 10 continuation".

- **2026-10-07 — Phase 10 (Store Preparation & Release Readiness): IN PROGRESS — local preparation
  done; NOT runtime-verified, NOT deployed, NOT submitted, completion criterion NOT met.** Node 24
  LTS (portable) + Expo patch alignment (doctor 21/21); recoverable account-deletion cleanup
  (server sweeper finishes deletions that failed after the user could no longer sign in; Storage
  failures no longer marked complete); notification icon, permission cleanup, submit profiles;
  store/privacy/reviewer drafts in `STORE_RELEASE_READINESS.md`; first native Android dev build on
  EAS. Backend 1378 / 1371 / 0 fail / 7 skipped; rules 5/5 (one unexplained flaky run); mobile tsc
  0, lint clean, jest 495/495, export android + ios ✔. No device, emulator, simulator or store
  console access in this environment. New decisions §10.29–32 (EAS store env vars are a build
  blocker). Full detail: §4 "2026-10-07 — Phase 10".

- **2026-10-07 — Account deletion now cancels Stripe subscriptions (§10.26 approved) + Phase 9
  (Testing & Hardening): static testing/hardening complete; runtime verification pending. NOT
  device-verified, NOT production ready.** Deletion cancels every billable Stripe subscription of
  the account (active/trialing/past_due/unpaid/incomplete/paused), expires open checkouts and
  not-yet-started schedules, and re-lists to confirm with Stripe BEFORE anything is deleted — no
  refund, no proration, no final invoice, existing invoices untouched. Failure/timeout → nothing
  deleted, account usable, retry-safe `STRIPE_CANCELLATION_FAILED`. A deletion lease + the tombstone
  stop checkout / plan change / photo packs / store verify / delayed webhooks from re-activating
  billing (mid-deletion webhooks are redelivered; post-deletion ones cancel the new subscription).
  Apple/Google warnings unchanged (never claimed cancelled). Phase 9 fixes: profile-response
  account-isolation race, stale report responses on id change (detail/comments/photos/versions),
  versions never reloading for a new report, 5 links missing accessibility roles/targets.
  Backend 1376 / 1369 pass / 0 fail / 7 skipped; rules 5/5; mobile tsc 0, lint clean, jest
  495/495 (48 suites), export android + ios ✔. Dependency patch alignment blocked (§6, Node 25
  npm crash). Full detail: §4 "2026-10-07 — Stripe cancellation at deletion + Phase 9". Phase 10
  not started.

- **2026-10-07 — Phase 8 (Remaining Account/Info Screens): implemented, static validation
  complete; Android/iOS runtime verification pending. NOT production ready.** Settings hub;
  Profile (validated, permitted fields only); Sign-in & security (provider-aware re-auth,
  password change for email accounts, TOTP two-factor enable/disable); Legal & support (existing
  web pages, support email, app version); in-app account deletion (Google/Apple accounts can now
  delete via recent re-auth; subscription warnings across Stripe/Apple/Google; retry-safe; local
  cleanup only after confirmation; deleted accounts can't be recreated; store purchases stay
  locked to the deleted owner). Backend 1363 / 1356 pass / 0 fail / 7 skipped; rules 5/5; mobile
  tsc 0, lint clean, jest 486/486, export android + ios ✔. Decisions: §10 items 23, 26, 27.
  Phase 9 not started.

- **2026-10-05 — Phase 6/7 gap closure done (code + static/emulator checks). Phases 6 and 7
  remain: implemented, static validation complete; external setup, deployment and Android/iOS
  runtime verification pending — NOT production ready, NOT runtime-verified.** Closed: push lease
  14 → 7 days (configurable), stale-binding push handling, outbox reconciliation, stable push
  eventId; one transactional entitlement writer (highest of Stripe / admin / team / store), admin
  overrides preserved, team removal no longer wipes paid plans, out-of-order Stripe events can't
  re-grant, in-app plan changes (iOS same group, Android replacement), production sandbox
  allowlist, Enterprise not sold in-app (matches web), Firestore users-doc allowlist with emulator
  tests (the ORIGINAL rules let users set their own tier — **not yet deployed**), production API
  origin confirmed (`https://api.flacronai.com`). Backend 1355 / 1348 pass / 0 fail / 7 skipped;
  rules emulator 5/5; mobile tsc 0, lint clean, jest 453/453, export android + ios ✔. Decisions
  needed: §10 items 5, 19–25. Full detail + setup checklist: §4 "Phase 6/7 gap closure".
  Phase 8 not started.

- **2026-10-05 — Phase 7 (Subscriptions & In-App Purchase): Implemented, static validation
  complete; store setup and runtime verification pending. NOT purchase-verified, NOT
  sandbox-verified, NOT production ready.** `expo-iap` (StoreKit 2 / Play Billing) behind a
  single adapter; backend verifies every purchase with Apple's App Store Server API / Google's
  Play Developer API, binds it to one FlacronAI account (account token + ownership rules),
  handles App Store Server Notifications V2 and Play RTDN with replay protection, and computes
  one entitlement across Stripe + store without overwriting web billing records. Backend
  1339 / 1332 pass / 0 fail / 7 skipped; mobile `tsc` 0, lint clean, jest 436/436, export
  android + ios ✔. No store products/credentials exist yet → the app shows in-app purchases as
  unavailable and grants nothing. Full detail: §4 "2026-10-05 — Phase 7". Nothing
  committed/pushed; no deploy, EAS build, store change or real purchase. Phases 8–10 not started.

- **2026-10-05 — Phase 6 (Push Notifications): Implemented (mobile + backend), hardened, static validation complete; push delivery disabled by default; Expo/FCM/APNs credentials, AWS (ECS) configuration and Android/iOS device verification pending. NOT delivery-verified, NOT runtime-verified, NOT production ready.** Latest pass (reliability &
  account-isolation hardening): server-enforced per-sign-in device bindings (revocation fence,
  stale-request fence, 14-day renewable lease, session/account eligibility re-checked before
  every send), a persistent offline-safe revocation queue on the device, a durable Firestore
  `pushOutbox` written in the same transaction as the notification and drained by a lease-based
  worker safe for multiple ECS tasks, persisted tickets/receipts/retries, and an authenticated
  `GET /notifications/push-status`. Backend `npm test` 1311 / 1304 pass / 0 fail / 7 skipped
  (32 push tests); mobile `tsc` 0, `expo lint` clean, `jest` 390/390 (37 suites), `expo
  export` android + ios ✔. Deployment is **AWS ECS** (launch type not visible in the repo) (not Render). Full detail: §4
  "Phase 6 — reliability & account-isolation hardening". Nothing committed/pushed; no deploy;
  no EAS build; no AWS change; no real push. Phase 5 remains static-only; Phases 7–10 not
  started.

- **2026-10-05 — Phase 5 gap-closure pass: the implementation gaps/defects found by the
  2026-10-05 read-only audit are fixed and statically validated; Android/iOS runtime
  validation is still NOT performed. Phase 5 status: implemented, static checks only — NOT
  runtime verified.** Done on a new local branch `fix/mobile-phase-5-gaps` (created from local
  `origin/main` @ `1e12d78`, whose `mobile/` is byte-identical to the Phase 5 commit
  `c65dfad`) in the existing clean `feature+mobile-phase-5-core-dashboard` worktree. The stale
  `feature/mobile-initial-phases` checkout and its uncommitted work were not touched. Nothing
  committed/pushed; no EAS build; `backend/`/`frontend/` untouched; no dependency changed.
  Fixed: per-account draft/cache isolation + sign-out cleanup; real upload outcomes (uploaded /
  duplicate / server-rejected / plan-limit / unsupported / too-large) with only genuine uploads
  counting toward Generate; HEIC handling; failed-report display + owner-only retry analysis;
  review-response UI; permission/state gating of Approve/Export/comments/photo review;
  resilient polling; focus-based list refresh; export timeouts + accurate storage messaging;
  start-new/discard draft; chip defaults = submitted values; navigation out of render;
  thumbnail error/retry + bounded concurrency + cache lifecycle; status filters; 403
  classification; report deep link preserved through sign-in. Validation: `tsc` 0 errors,
  `expo lint` clean, `jest` **290/290 (29 suites)**, `expo export` android + ios both succeed,
  `expo-doctor` 20/21 (patch-version drift only — §6). Full detail: §4 entry dated
  2026-10-05; next step: §12. Phase 6: implemented, static only — credentials + device checks pending (entry above). Phases
  7–10: not started.

- **Phase 5 — Core Dashboard Feature Parity: implemented, static validation complete;
  Android/iOS runtime validation NOT performed this session (environment had no ADB,
  emulator, physical device, or browser-automation tool available — honestly recorded
  as a blocker, not skipped silently).** Built on branch `feature/mobile-phase-5-core-dashboard`
  in an isolated worktree, from a fresh `origin/main` confirmed to include Phase 4 (PR #21)
  and the later MFA-hardening PR #22 — `backend/`/`frontend/` and the original
  `feature/mobile-initial-phases` working tree were never touched (confirmed via
  `git status --porcelain` scoped to each). Delivers, in priority order: dashboard summary +
  reports list (pagination, pull-to-refresh, offline state, status filter); a 5-step native
  generate-report wizard (claim → property/vehicle → loss details → photos → review) with
  per-photo immediate upload via the existing staging endpoints, resumable across an app
  relaunch (fields/step persisted to AsyncStorage, photos re-derived from the server's own
  staged list — never trusted from local cache), and duplicate-submission-proof; report
  detail (overview/photos/comments/versions tabs, photo review actions, approve-and-finalize
  attestation matching the backend's own signature requirements, review-response scaffold);
  export via the authenticated download endpoint + `expo-file-system`/`expo-sharing`
  (save-then-share, never an unauthenticated link); and a minimal profile/settings screen
  (server-verified usage/tier, profile edit, sign out). Every method call maps to a Phase 4
  resource-client method already confirmed against `backend/routes/*` — no new endpoint was
  invented, and no entitlement/approval/review rule was reimplemented client-side (the
  approve-eligibility check and the wizard's duplicate-submit guard both mirror, not
  replace, the server's own rejections). New dependencies: `expo-image-picker`,
  `expo-file-system`, `expo-sharing` — all installed via `expo install` (SDK-matched
  versions), all three genuinely required by this phase's scope (camera/library capture,
  local file writes for photo thumbnails and export downloads, native share sheet), nothing
  speculative added. `expo-image-picker`'s Android microphone permission (its plugin's
  default, needed only for video capture) was explicitly turned off
  (`microphonePermission: false` in `app.config.ts`) since this app only ever captures still
  photos — confirmed via `expo config --json` that no `RECORD_AUDIO` permission is declared.
  Navigation: `app/(app)/(tabs)/{dashboard,reports,settings}.tsx` (a `Tabs` group nested
  inside the existing `(app)` `Stack.Protected` guard, so Phase 3's auth gate covers every
  new screen automatically) plus stack-pushed `app/(app)/report/{new,[id]/index}.tsx` for the
  wizard and detail screen (kept under a singular `report/` segment, distinct from the
  plural `reports` tab route, specifically to avoid an Expo Router path collision between a
  tab screen and a sibling stack directory). The tab bar is text-only (no icon library is
  installed anywhere in this app, and Phase 5's scope explicitly excludes adding unrelated
  dependencies) — matches every other screen in the app. Phase 3's placeholder
  `app/(app)/home.tsx` was removed (`/home` → `/dashboard`; `app/index.tsx`'s authenticated
  redirect updated to match) since Phase 5's dashboard supersedes it.
  **Validation performed:** `tsc --noEmit` 0 errors; `expo lint` 0 errors/0 warnings; `npx
  jest` 200/200 passing (150 pre-existing unchanged + 50 new, across 8 new suites) covering
  the wizard reducer's field-edit recoverability and duplicate-submit guard (pure, no
  mocking needed), draft-resume persistence, photo-picker permission/cancellation/error
  handling, upload retry and partial-failure independence, approval eligibility (mirrors the
  backend's `REPORT_PROCESSING`/`REPORT_REGENERATING` rejections exactly) and duplicate-tap
  prevention, export/download/save/share (happy path, unavailable share capability, a
  cancelled/failed share not losing the already-downloaded file, and offline/expired-auth
  error mapping through the existing `ApiRequestError` categories), and reports-list
  pagination/offline/error-mapping; `expo-doctor` 20/21 (the one failure is the
  **pre-existing, already-documented** `expo` patch-version drift from Phase 1/4 — confirmed
  unchanged by this phase, since `expo` itself was never touched, only the three new
  packages above were added); `expo install --check` shows the same single pre-existing
  drift, nothing else; `expo config --json` resolves cleanly for both platforms; `npx expo
  export --platform android` and `--platform ios` both bundled successfully (1454 modules,
  no resolution/runtime-import errors) as a bundler-level smoke test given the absence of a
  device/emulator, then the temp export output was deleted. A real duplicate-submission race
  was found and fixed during test-writing (not merely tested around): two synchronous
  `submit()` calls fired back-to-back both read the same pre-dispatch React-state snapshot
  (the reducer's own no-op guard only protects the *state shape*, not the API call itself),
  so `useReportWizard.ts`'s `submit()` now also gates on a synchronous `useRef` lock checked
  and set before either the dispatch or the `reportsApi.generate()` call — this is a real
  fix to an actual double-report/double-credit risk, not a test-only workaround, verified by
  a test asserting `mockGenerate` is called exactly once.
  **Not performed / explicitly out of scope this session:** Android or iOS runtime
  execution (no ADB/emulator/physical device or browser-automation tool was available in
  this environment); a real-backend end-to-end round trip (create → upload → approve →
  export) against a disposable dev account (same reason — no device to run the app on, and
  this session was not authorized to attempt a browser/web-platform substitute without a
  visual-verification tool); CRM/teams/enterprise/white-label/admin/analytics screens; push
  notifications; billing/IAP; template authoring; richer settings (MFA/account-deletion/login
  history) deferred to Phase 8 per this phase's own stated scope. **Phase 5 is therefore
  implementation-complete but not cross-platform-QA-approved** — the create→upload→
  review→approve→export loop is wired end-to-end against the real typed API contract and
  passes its automated/mocked-contract tests, but has not been exercised on a real device
  against a real backend this session. Recommended next step: run this branch through Expo
  Go (or a dev client) on a real Android device against the local backend with a disposable
  test account, exactly as Phase 3/4's own sessions did, before Phase 5 is marked fully QA'd.
  **Mobile development is paused after Phase 5**: the client has since shared new
  requirements that need to be scoped before any further mobile work (Phase 6+) begins. The
  device-validation flow above (Expo Go/dev client on a real Android device against the
  local backend, disposable test account, full create → upload → review → approve →
  export/share loop, then the same for iOS) is the exact remaining gap to close **when
  mobile work resumes** — it is not a new task, just the one already described here.
- **Phase 4 — Backend/API Integration Layer: CLOSED (2026-09-16).** One shared, typed HTTP
  client (`services/api/client.ts`, extended in place from Phase 3) is now used by every
  resource client: the pre-existing `auth.ts` plus new/extended `reports.ts`, `users.ts`,
  `payment.ts`, `notifications.ts`. Adds bounded exponential-backoff-with-jitter retry
  (GET/confirmed-idempotent-mutation only, `Retry-After`-aware), offline detection
  (`@react-native-community/netinfo`, new dependency), timeout + cancellation, and a
  categorized `ApiRequestError`. Every method maps to a route confirmed directly in
  `backend/routes/*` — none invented. 150/150 tests pass (77 pre-existing + 73 new);
  `tsc`/lint/`expo-doctor`/`expo install --check`/`expo config` all pass (doctor's one
  finding is a pre-existing, already-documented, unrelated `expo` patch-version drift —
  unchanged by this phase). A real local backend was started and the unauthenticated
  portion of the error contract (`NO_AUTH`/`NO_TOKEN`/`INVALID_TOKEN`/`404 NOT_FOUND`) was
  confirmed to match exactly. **Updated 2026-09-16 (same day, follow-up session):** the
  authenticated round trip was also completed against the real disposable test account —
  a genuine Firebase ID token was obtained (real `signInWithPassword` REST call) and
  confirmed accepted by the real local backend's `authenticateToken` middleware (every
  authenticated route returned `503 PROFILE_LOOKUP_FAILED`, never `401`, distinguishing
  "token verified, Firestore layer unreachable" from "token rejected" — exactly the
  distinction this client's error classification depends on); an unauthenticated request
  still correctly returned `401 NO_TOKEN`. **Updated 2026-09-16 (second same-day
  follow-up session): the full authenticated DATA round trip is now also confirmed —
  successfully, via a local Firestore Emulator, not real cloud Firestore.** No Application
  Default Credentials or already-authorized dev Firebase Admin environment existed in this
  environment, so per instruction the Firestore Emulator was used as the documented safe
  fallback (a JDK was installed with the user's explicit approval — the emulator requires
  a JVM — then removed from PATH for this session's use only, nothing else changed
  system-wide). With the emulator backing Firestore (and the same genuine ID token as
  above for the auth boundary) plus a handful of disposable seeded records keyed to the
  test account's own uid, every required endpoint returned a genuine `200` with correctly
  shaped data matching this client's typed models: `GET /users/profile`
  (`tier:'starter'`), `GET /reports` (the seeded report present in `data[]`),
  `GET /reports/dashboard-summary`, `GET /notifications` (the seeded notification present,
  correct `unreadCount`), `GET /payment/current-subscription`
  (`{tier:'starter', subscription:null}`). **This is a successful authenticated
  local-emulator round trip, not a claim of real-cloud-Firestore validation** — real cloud
  Firestore was never touched. A live refresh-token exchange still returned
  `INVALID_REFRESH_TOKEN` (unchanged from the prior session, not investigated further, not
  a code defect). All emulator data, temporary credentials, scripts, and processes were
  deleted/stopped after use; no UI was built; nothing committed. Full detail: §3 Phase 4
  entry and §4 Progress Log entries dated
  2026-09-16. **Recommended next step: Phase 5, once approved — not started.**
- **Phase 3 — Authentication: CLOSED (2026-09-11).** Implementation, configuration,
  automated validation, and Android runtime validation are all complete — the full
  authentication matrix (signup, email verification, email/password login, session
  restoration, logout, forgot-password, Google Sign-In, MFA/TOTP) passed on a real physical
  Android device against a real local backend. One transient Firebase-side throttling
  issue was diagnosed and root-caused on a single test account (not an app defect — see
  `AUTHENTICATION_ARCHITECTURE.md` §18.2). **iOS/Apple runtime testing is explicitly
  deferred** — no iPhone/iOS device or simulator was available; this is not claimed as
  validated. Server-side MFA enforcement remains implemented-but-disabled by design (a
  separate, later, explicit activation decision — §12.9). Full detail:
  `AUTHENTICATION_ARCHITECTURE.md` §18. **Recommended next step: Phase 4, once approved —
  not started.**
- **Active phase (historical detail below, retained for record):** Phase 3 — Authentication.
- **Status (2026-09-08, same day, later session): implemented, partially complete.**
  The full auth architecture from
  [`AUTHENTICATION_ARCHITECTURE.md`](./AUTHENTICATION_ARCHITECTURE.md) §4 was built exactly
  as recommended — Firebase Client SDK identity, native Google/Apple credential exchange
  into Firebase, backend REST for profile/MFA/audit only, Expo Router `Stack.Protected`
  route guards. All static validation passes (`tsc`/`expo lint`/`expo-doctor`/
  `expo install --check`/`expo export` on both platforms — see §8) and 59 automated tests
  pass (now well over that after the 2026-09-08 follow-up fix below).
  **RESOLVED 2026-09-08 (same-day follow-up implementation, rollout-safety-corrected the
  same day)**: server-side MFA enforcement is implemented and tested, gated behind
  `MFA_ENFORCEMENT_ENABLED` (defaults disabled — NOT enabled in production); the
  already-issued-token revocation gap is closed for the explicit case (password change),
  deliberately not for ordinary logout (see §12.3 — an earlier version of this fix would
  have silently made ordinary Sign Out an all-devices kill, corrected same day) — see §12
  of `AUTHENTICATION_ARCHITECTURE.md` for the full implemented design, activation
  procedure (§12.9), and this file's §4 Progress Log for tests/validation. **Still not
  complete**: Google/Apple sign-in are
  implemented but functionally blocked on Firebase/Google/Apple console configuration
  this session has no access to; no physical-device Expo Go run was performed this
  session. Full detail:
  [`AUTHENTICATION_ARCHITECTURE.md`](./AUTHENTICATION_ARCHITECTURE.md) §11-§12.
- **Phase 2 — Configuration & Environment Preparation status (unchanged by Phase 3):
  complete, with an external configuration dependency.** Started and
  finished 2026-09-08 on branch `feature/mobile-initial-phases` (renamed from
  `docs/mobile-reuse-strategy` — the documentation audit's working changes were carried
  forward unchanged, not discarded). Environment selection is safely implemented and all
  validations pass (§8), but the **real production/preview backend API origin remains
  unconfirmed** — this is an external infrastructure dependency (whoever manages the AWS
  ECS service's public DNS/ALB or custom domain), not a defect in this phase's work. See
  §4 Progress Log entry dated 2026-09-08 "Phase 2 — Configuration & Environment
  Preparation" for full detail, and §10 item 1 for the exact unresolved dependency.
- **Same-day addendum (2026-09-08):** corrected a real gap — the development API-URL
  fallback had implied `localhost` works for every mobile dev target, which is false for
  the Android Emulator (`10.0.2.2`) and a physical device (LAN IP/tunnel). Also closed a
  related gap where a placeholder-shaped URL would have been silently accepted for
  preview/production. See §4 Progress Log entry "Phase 2 addendum" and §8 "Phase 2
  addendum validation." Does not change Phase 2's overall status above.
- **2026-09-08 — Phase 3 Authentication Architecture Audit completed (documentation
  only; Phase 3 remains not started).** Produced
  [`AUTHENTICATION_ARCHITECTURE.md`](./AUTHENTICATION_ARCHITECTURE.md): a fresh,
  code-verified audit of the existing auth system, finding that the web app's actual
  login/signup/logout/password-change flow bypasses the backend's REST `/auth/login`
  and `/auth/register` endpoints entirely (uses the Firebase Client SDK directly), which
  materially shapes the mobile strategy recommendation. **Recommendation: pending your
  approval, not decided** — see that document §4 and §9 for the exact open decisions
  (MFA parity for v1, email-verification/password-reset deep-link approach, the Firebase
  project's "one account per email" setting, whether "log out everywhere" is ever
  wanted). Phase 3 itself has **not** started; nothing was implemented, installed,
  configured, or created.
- **Phase 1 — Mobile Foundation status (unchanged, still complete):** EAS
  authentication/ownership verified, and a practical runtime test on a physical Android
  phone (via Expo Go, tunnel mode) passed — see §8. Remaining open items are explicitly
  non-blocking: the Node LTS switch (§6, a recommendation), and iOS/tablet **runtime**
  testing, which is pending/deferred only because no iOS device/simulator or tablet was
  available at the time — static iOS and tablet-support configuration are already
  validated (§8).
- **Documentation-only Web-to-Mobile Reuse Audit status (unchanged, still complete):**
  see the 2026-09-08 entries below and
  [`WEB_TO_MOBILE_REUSE_STRATEGY.md`](./WEB_TO_MOBILE_REUSE_STRATEGY.md).
- **2026-09-08 (continuation session) — Phase 3 re-validation pass, no regressions, no
  status change.** Re-ran the complete validation matrix (mobile `tsc`/lint/jest/doctor/
  dependency-check; full backend suite 538/538; full frontend suite 64/64; both lints;
  `git diff --check`; a secret/credential scan; a backend/frontend change-scope check;
  an EAS ownership re-check) — everything still passes exactly as the prior session
  documented, with one new, minor, unrelated finding (an `expo`/`expo-router` patch-version
  drift, not fixed, flagged separately) and no code/config/dependency change. Firebase
  console access, Google/Apple OAuth console access, and a physical device/emulator all
  remain unavailable in this environment, so the outstanding blockers from the prior
  session (§11.8/§11.7 of `AUTHENTICATION_ARCHITECTURE.md`) are unchanged. Full detail:
  `AUTHENTICATION_ARCHITECTURE.md` §13 (new). **Phase 3 status is unchanged: implemented,
  partially complete.**
- **Last updated:** 2026-09-08
- **EAS authentication/ownership verification — CONFIRMED:**
  - `npx eas-cli@latest login` completed via Expo's browser-based OAuth flow — no
    credentials were entered into, displayed by, or stored by this assistant or in any
    file in the repo. The resulting auth token is stored by `eas-cli` itself at
    `~/.expo/state.json` (the user's own home directory), entirely outside `mobile/` and
    outside the repository.
  - `npx eas-cli@latest whoami` → user `laibanoreen`
    (`laibanoreen7454@gmail.com`); accounts listed: `laibanoreen` (Role: Owner),
    `flacron-enterprises-llc` (Role: Admin).
  - `npx eas-cli@latest project:info` → `fullName: @flacron-enterprises-llc/flacronai`,
    `ID: c8227fa0-8a62-4e51-8ccc-c8feb58d0466`.
  - **All four required values match exactly:** user `laibanoreen` ✓, owner
    `flacron-enterprises-llc` ✓, slug `flacronai` ✓, project ID
    `c8227fa0-8a62-4e51-8ccc-c8feb58d0466` ✓. No new project was created; the existing
    project is correctly owned by the `flacron-enterprises-llc` organization, not the
    personal `laibanoreen` account.
- **Recommended next phase (not started):** Phase 3 — Authentication, but only once open
  questions §10.1 (API base URL), §10.2 (auth strategy), §10.3 (MFA parity) are answered.
  Do not begin until you explicitly approve.
- **2026-09-08 — Documentation-only Web-to-Mobile Reuse Audit completed** (no phase
  advanced by this; Phase 1 remains the last *implemented* phase, Phase 2 onward remain
  **not started**). Produced
  [`WEB_TO_MOBILE_REUSE_STRATEGY.md`](./WEB_TO_MOBILE_REUSE_STRATEGY.md) — read it before
  starting Phase 3 or any later phase. See §4 Progress Log entry dated 2026-09-08 for full
  detail, and §10 items 8-16 for new open questions it surfaced.

---

## 2. Project Overview

**App:** FlacronAI — AI-assisted insurance inspection report platform. The mobile app is a
native companion to the existing web app (`frontend/`, React 18 + Vite) and existing backend
(`backend/`, Node.js/Express + Firebase), reusing the same accounts, backend API, and
Firebase project. It is not a rewrite and not a separate product.

### Confirmed app identifiers (client-approved, do not change without client sign-off)

| Field | Value |
|---|---|
| App name | `FlacronAI` |
| Expo organization/owner | `flacron-enterprises-llc` |
| Expo project slug | `flacronai` |
| Expo EAS Project ID | `c8227fa0-8a62-4e51-8ccc-c8feb58d0466` |
| Expo username in use | `laibanoreen` |
| iOS Bundle ID | `com.flacronenterprises.flacronai` |
| Android Package Name | `com.flacronenterprises.flacronai` |
| URL scheme | `flacronai` |
| Initial version | `1.0.0` |
| Initial orientation | `portrait` |
| Tablet support | enabled (iOS `supportsTablet: true`; Android is a responsive-layout/testing concern, not a config flag — see Phase 4/8) |

Ownership: all Apple, Google, Firebase, and Expo/EAS project ownership, store records,
credentials, and signing assets must remain under **Flacron Enterprises LLC**. This
tracker's Git/security rules (§9) apply to every phase.

### Corrected infrastructure note (supersedes the earlier planning-report assumption)

The earlier planning report assumed a Render-hosted backend. That was **wrong** and is
corrected here based on direct repository inspection:

- `.github/workflows/deploy-backend.yml` builds the backend Docker image (`backend/Dockerfile`,
  `node:20-bookworm-slim`), pushes it to **Amazon ECR**, and deploys it via
  `aws ecs update-service` to cluster `flacronai-production-cluster`, service
  `flacronai-backend-service` — i.e. **AWS ECR/ECS**, deployed via GitHub Actions using an
  assumed AWS IAM role (OIDC), not Render.
- `backend/render.yaml` still exists in the repo but is **stale/legacy** — it is not what
  actually deploys the backend today. It has been left untouched (out of scope for mobile
  work; not a mobile concern to clean up).
- **The real production API base URL could not be verified from the repository.**
  `frontend/.env.example` only documents the local dev value
  (`http://localhost:3000/api`). `PROGRESS.md` records a real prior incident
  (2026-08-01/2026-08-12) where a fabricated `https://api.flacronai.com` domain was used
  across API docs and had to be removed as a Golden Rule #1 violation, and another entry
  referencing a since-superseded `onrender.com` host. **Do not invent or guess a production
  API URL for mobile.** The mobile `.env.example` (Phase 1) documents this as an explicit,
  unresolved placeholder pending confirmation from you or from whoever manages the AWS
  ECS/ALB DNS or custom domain in front of it.

### Architecture decisions made in Phase 1

| Decision | Choice | Why |
|---|---|---|
| Framework | Expo (managed workflow) + Expo Router | File-based routing matches the site's page inventory; built-in deep-linking needed later for email-verification/reset links; current stable default (SDK 57) already ships Router + TypeScript. |
| Language | TypeScript (strict) | Backend contract is non-trivial (nested tier objects, ~45 report endpoints, MFA challenge flow) — typed models catch drift a plain-JS client would silently swallow. |
| Location | Top-level `mobile/` in the same repo | No shared build tooling with `frontend`/`backend`; monorepo-by-convention, not by workspace tooling. |
| Dependency isolation | Own `package.json` + own lockfile under `mobile/`; **no root workspace manifest, no hoisting** | Guarantees `npm install`/build/test inside `mobile/` cannot resolve into or collide with `frontend/node_modules` or `backend/node_modules`. |
| Package manager | npm | Matches the convention already used by both `frontend/` and `backend/`. |
| Router root | `mobile/app/` (top-level, not `mobile/src/app/`) | Matches the explicitly approved structure; Expo Router supports either location with zero extra config — top-level `app/` was chosen for directness and to match the approved folder list. |
| Config format | `app.config.ts` (not `app.json`) | TypeScript project; allows inline comments explaining non-obvious choices (e.g. why the iOS icon uses the classic PNG path, not the new Icon Composer format) and typed `extra.eas` block. |
| Runtime version policy | `{"policy": "fingerprint"}` | Expo's current recommended default for EAS Update compatibility — ties runtime compatibility to the actual native fingerprint of config + dependencies instead of a manually-bumped number. **Unvalidated against a real native/EAS Update build** — flagged for re-confirmation the first time an actual EAS Update or native build is attempted (Phase 13). |
| iOS icon format | Classic universal `icon.png` (1024×1024), not the new Xcode "Icon Composer" (`.icon`) bundle format the default template scaffolds | No real Icon Composer source asset exists yet (it's a structured multi-layer format); fabricating one would not be genuine brand asset work. Deferred as an optional visual-polish item, not a blocker. |
| Brand asset source | Rasterized from `frontend/public/logo-mark.svg` (the real vector brand mark, navy `#002A64` + orange `#FD4403`) at 1024×1024, using the `sharp` package already present in `backend/node_modules` (read-only use of an existing dependency; nothing added to `backend/`) | Produces crisp, non-blurry icon/splash/adaptive-icon assets from the actual approved brand mark instead of upscaling the small 160×160 web PNG or inventing new artwork. |
| State management | Not decided yet | No app state exists yet in the foundation phase; `src/store/README.md` documents that this is an open decision for the Authentication/API-integration phase, not assumed to be Redux/Zustand/Context now. |

---

## 3. Phase Plan

Legend: **not started / in progress / done / blocked**

### Phase 0 — Read-Only Repository Audit
- **Status:** done
- Objective: ground every later decision in actual code, not assumption.
- Scope: web/backend architecture, auth, tiers, routes, deployment, CORS/rate-limits.
- Validation: planning report reviewed and approved by client, with corrections (this
  document's infrastructure note above).
- Completion evidence: approved planning report (prior conversation turn) + the
  infrastructure correction recorded above.

### Phase 1 — Mobile Foundation *(complete)*
- **Status:** done. EAS authentication and ownership verified (§1); all static validation
  passed (§8); a practical runtime test on a physical Android phone (Expo Go, tunnel mode)
  also passed (§8) — clean launch, correct branding/layout, no errors. iOS and tablet
  **runtime** testing are recorded as pending/deferred (no device/simulator available),
  while their static configuration is already validated. The Node LTS switch (§6) remains
  an open recommendation, not a blocker.
- Objective: a running, empty, isolated, branded Expo Router + TypeScript app inside
  `mobile/` that builds and type-checks, with zero effect on `frontend/`/`backend/`.
- Scope: scaffold via `create-expo-app` (current stable SDK), strip all demo
  screens/components/assets, replace with the approved minimal structure and real brand
  tokens/assets, configure confirmed identifiers, add `.env.example` + `eas.json` (no real
  secrets, no builds), add `README.md`.
- Expected files/modules: `mobile/app/*`, `mobile/src/*` (see §7 Folder Structure),
  `mobile/assets/images/*`, `mobile/app.config.ts`, `mobile/eas.json`,
  `mobile/package.json` + lockfile, `mobile/tsconfig.json`, `mobile/eslint.config.js`,
  `mobile/.gitignore`, `mobile/.env.example`, `mobile/README.md`, this file.
- Dependencies/access: none beyond public npm registry and the already-provided EAS
  Project ID/identifiers. No login, no credential creation.
- Validation: see §8 Validation Log for exact commands/results once run.
- Security considerations: no secrets committed; `.gitignore` covers `.env*`, credential/
  keystore/provisioning-profile/service-account file patterns; only `EXPO_PUBLIC_*` names
  documented, no values.
- Completion criteria: app builds, type-checks, and lints clean; `frontend`/`backend` diff
  is empty; no nested `.git`; validation commands in §8 all recorded with real output.
- Out of scope (must NOT happen in this phase): authentication, API integration, any
  dashboard feature, push notifications, subscriptions/IAP, any commit/push/PR/build/
  submission.

### Phase 2 — Configuration & Environment Preparation *(complete, external dependency noted)*
- **Status:** done, 2026-09-08. Environment selection is safely implemented (explicit
  `EXPO_PUBLIC_APP_ENV`, fail-fast validation, no silent production fallback — see §4/§8)
  and all validations pass. The real production/preview API base URL was actively
  investigated (see §4 "API routing audit") but could **not** be confirmed from the
  repository or from a safe public check — this is recorded as an external configuration
  dependency, not a defect: the mechanism itself correctly refuses to run with an unsafe
  default, per the completion criteria below.
- Objective: finalize the public/secret environment-variable boundary and build a
  fail-fast environment-selection mechanism, so that once the real API base URL is
  confirmed, wiring it in is a one-line config change, not a redesign.
- Scope actually completed: audited every available source of evidence for the real API
  origin (frontend API client normalization logic, `frontend/.env.example` var names,
  backend route mounting, AWS ECS deploy workflow, Vercel rewrite config, a direct safe
  read-only check against `https://flacronai.com`); designed and implemented
  `mobile/src/config/env.ts` (fail-fast `getAppEnv()`/`getApiBaseUrl()`, no API client,
  no auth, no Firebase config — pure config resolution); added per-profile
  `EXPO_PUBLIC_APP_ENV` to `mobile/eas.json`; updated `mobile/.env.example` with the
  confirmed-vs-unconfirmed distinction; updated `mobile/README.md` with the full
  environment strategy and troubleshooting.
- Expected files (actual): `mobile/src/config/env.ts` (new), `mobile/src/config/README.md`
  (new), `mobile/eas.json`, `mobile/.env.example`, `mobile/README.md`, this file. (Not
  `mobile/app.config.ts` — reviewed, no change needed: it stays identity/build-metadata
  only per its own Phase 1 design; environment-dependent behavior lives entirely in
  `src/config/env.ts`, which is app-runtime code, not build-config code.)
- Dependencies: confirmation of the real production/preview API base URL — still
  outstanding, owned by whoever manages the AWS ECS service's public DNS/ALB or a custom
  domain in front of it (see §10 item 1). Does **not** block Phase 3 (auth work can
  proceed against the confirmed local-dev origin `http://localhost:3000/api/v1`).
- Validation: see §8 "Phase 2 validation" for exact commands/results — `tsc`/lint/doctor/
  dependency-check all pass; `expo config --json` resolved identically (identifiers
  unchanged) under simulated development/preview/production env vars; 6 explicit
  fail-fast/safe-fallback scenarios run against `env.ts` in isolation, all behaving as
  designed (throws on missing/invalid `APP_ENV`, throws on missing/localhost
  `API_BASE_URL` in preview/production, safe local fallback in development only).
- Security: confirmed no non-`EXPO_PUBLIC_*` var is read anywhere in `mobile/`; confirmed
  real `.env`/`.env.local` remain git-ignored; scanned the full diff for secrets, tokens,
  stale Render URLs, and fabricated API domains — none found (see §8).
- Completion criteria: **met** — environment selection is safely implemented; public vs.
  private configuration boundaries are documented (§9, `.env.example`, `README.md`);
  verified API-origin findings are accurately recorded (§4); the unresolved production URL
  is handled with a hard fail-fast, not an unsafe default; all validations pass; no
  unrelated or `frontend`/`backend` files were changed (§8).
- Out of scope (correctly not done): no API client, no auth, no Firebase client config, no
  dashboard/billing/push work, no credential creation/rotation, no build/publish/submit.
- **Phase 2 addendum (2026-09-08, same day):** the original implementation above had a
  real gap — `getApiBaseUrl()`'s development fallback (`http://localhost:3000/api/v1`)
  was correct only for the iOS Simulator/Expo web, but nothing in the code or docs made
  that restriction explicit, so the docs read as if `localhost` worked for every mobile
  dev target. It does not: the Android Emulator needs `10.0.2.2`, and a physical phone
  needs the development machine's LAN IP or a tunnel. This was corrected — see the
  dedicated progress-log entry below and §8 "Phase 2 addendum validation" — without
  changing Phase 2's overall complete status.

### Phase 3 — Authentication
- **Status: CLOSED (2026-09-11).** Implementation, configuration, automated validation,
  and Android runtime validation all complete. Full Android device test matrix passed:
  signup, email verification, email/password login, session restoration, logout,
  forgot-password (one account's transient Firebase-side throttling diagnosed and
  root-caused, not an app defect — full reset flow passed on a second account), Google
  Sign-In, MFA/TOTP. **iOS/Apple runtime testing explicitly deferred** (no iOS
  device/simulator available) — not claimed as validated. See
  `AUTHENTICATION_ARCHITECTURE.md` §18 for full detail.
- **Status (historical, 2026-09-08, same day, later session): implemented, partially complete.** The
  2026-09-08 architecture audit's §4 recommendation
  ([`AUTHENTICATION_ARCHITECTURE.md`](./AUTHENTICATION_ARCHITECTURE.md)) was adopted and
  implemented exactly as written, after a final security re-verification against current
  code (that document's §11.1). Complete: the full auth architecture, all flows except the
  two noted below, route guards, session persistence/restoration, error handling, and 59
  passing automated tests — all statically validated (`tsc`/lint/doctor/`expo export` both
  platforms, see §8). **Not complete**: Google/Apple sign-in are implemented but
  functionally blocked pending Firebase/Google/Apple console configuration (no console
  access this session); a real server-side MFA enforcement gap was found and reported (not
  fixed — needs a `backend/` change, explicitly out of scope this phase); no
  physical-device/simulator Expo Go run was performed. Full detail, file list, and exact
  gaps: [`AUTHENTICATION_ARCHITECTURE.md`](./AUTHENTICATION_ARCHITECTURE.md) §11.
- Objective: sign up, log in, forgot password, email verification, logout, social login
  (Google +, on iOS, mandatory Apple Sign-In if Google ships), integrated with the
  **existing** Firebase project and backend contract.
- Scope, as actually implemented: Firebase Client SDK for identity (RN persistence via
  `getReactNativePersistence`/AsyncStorage) — not the backend's REST
  `/auth/login`+`/register`, deliberately unused per the audit's evidence; native
  Google/Apple credential exchange into Firebase (config-gated, not `signInWithPopup`);
  backend REST reused for profile/MFA/audit endpoints only
  (`/auth/verify`,`/forgot-password`,`/send-verification`,`/mfa/*`,`/logout`,
  `/users/profile`,`/users/consent/registration`); Expo Router `Stack.Protected` route
  guards driven by one pure `computeAuthStatus()` function.
- Expected files (actual): `mobile/src/features/auth/*`, `mobile/src/services/api/*`,
  `mobile/src/services/firebase/client.ts`, `mobile/src/config/firebaseConfig.ts`,
  `mobile/app/{login,signup,forgot-password,verify-email,mfa,account-unavailable}.tsx`,
  `mobile/app/(app)/*` — full list in `AUTHENTICATION_ARCHITECTURE.md` §11.4. **Not**
  `secure-storage.ts` — deliberately not built: the architecture doc's own recommendation
  (§6) was "expo-secure-store usage limited to whatever the app itself needs beyond
  Firebase's own session (ideally nothing)," and nothing beyond Firebase's own
  RN-persisted session turned out to be needed.
- Dependencies (still outstanding, blocking only Google/Apple sign-in and a production
  build, not the rest of Phase 3): Firebase console access (register iOS/Android "apps" on
  the existing project); Apple Developer account access for Sign in with Apple; Google
  OAuth client IDs for iOS/Android. See `AUTHENTICATION_ARCHITECTURE.md` §11.8 for the
  complete, itemized list.
- Validation: static validation complete and passing (§8 below); a real end-to-end auth
  matrix against a live dev backend + real Firebase project was **not** run this session
  (blocked on the Firebase console registration above) — see §11.7 there for exactly what
  was and wasn't validated, and the recommended next step.
- Security: session storage uses Firebase's own RN persistence (AsyncStorage-backed, the
  officially documented pattern — not `expo-secure-store`, see the "Expected files" note
  above); the 503 `AUTH_VERIFY_UNAVAILABLE`/`PROFILE_LOOKUP_FAILED` vs 401 codes are
  branched correctly in `src/services/api/client.ts` (transient → retry, never a forced
  logout); `tokenVersion`/`TOKEN_REVOKED` isn't exercised by a Firebase-ID-token client by
  design (§1/§4 of the architecture doc) but is still handled defensively. **A real MFA
  server-side enforcement gap was confirmed, not introduced — see
  `AUTHENTICATION_ARCHITECTURE.md` §11.1 item 1 and §11.9.**
- Completion criteria: a real account authenticates end-to-end on both platforms — **not
  yet met**, blocked on the Firebase console registration dependency above, not on any
  remaining code work.
- Out of scope, correctly not started: any dashboard data fetch beyond a logged-in
  confirmation call (the `(app)/home.tsx` placeholder screen only shows the already-fetched
  profile — no new API surface was added).

### Phase 4 — Backend/API Integration Layer
- **Status: CLOSED (2026-09-16).** Implementation, static validation (`tsc`/`expo lint`/
  `expo-doctor`/`expo install --check`/`expo config`), the full mocked contract test suite,
  and a real local-dev-backend round trip for the unauthenticated portion of the error
  contract are all complete. Full detail, endpoint matrix, and the exact
  credential-dependent validation limitation: §4 Progress Log entry dated 2026-09-16
  below. **No UI was built; Phase 5 was not started.**
- Objective: one typed API client used everywhere, matching the backend's real response
  envelope (`{success, error, code}`) and its transient-vs-fatal auth error contract.
- Scope, as actually implemented: `mobile/src/services/api/client.ts` (Phase 3's file,
  extended in place — the one shared client every resource client uses) against `/api/v1/*`
  exclusively; typed request/response models for `reports`/`users`/`payment`/
  `notifications`, scoped to exactly the endpoints Phase 5's planned scope needs (not
  every endpoint that exists in each route file — see each resource file's own header
  comment for the explicit deferred list); bounded exponential-backoff-with-jitter retry,
  `Retry-After`-aware, restricted to GET requests or mutations explicitly confirmed
  idempotent by reading the backend code; offline detection via
  `@react-native-community/netinfo` (new dependency, added via `expo install` so its
  version is SDK-matched) wrapped in `mobile/src/services/api/offline.ts`; timeout +
  `AbortSignal` cancellation, distinguished from each other and from a plain network
  failure; a categorized `ApiRequestError` (`ApiErrorCategory` in `types/api.ts`).
- Expected files (actual): `mobile/src/services/api/client.ts` (extended),
  `mobile/src/services/api/offline.ts` (new), `mobile/src/services/api/{reports,payment,
  notifications}.ts` (new), `mobile/src/services/api/users.ts` (extended: added `getUsage`,
  `updateNotificationPreferences`), `mobile/src/types/api.ts` (extended: `ApiErrorCategory`,
  richer `ApiRequestError`, `OffsetPage`/`QueryParams`), `mobile/src/features/auth/types.ts`
  (extended: `UserProfile`'s `phone`/`address`/`notifications`/`notificationsEnabled`,
  new `NotificationPreferences`), plus one test file per new/changed module (`client.test.ts`
  extended; `offline.test.ts`/`users.test.ts`/`payment.test.ts`/`notifications.test.ts`/
  `reports.test.ts` new), `mobile/jest.setup.js` (added the official netinfo Jest mock,
  same pattern as the existing AsyncStorage mock), `mobile/package.json`+lockfile (added
  `@react-native-community/netinfo`).
- Dependencies: Phase 3 token plumbing (reused unchanged — the MFA-assertion-header/403
  handling and the one-time 401 refresh-retry are exactly Phase 3's existing behavior, now
  shared by every resource client instead of only auth/users).
- Validation: **static** — `tsc --noEmit` 0 errors; `expo lint` 0 errors/0 warnings; `npx
  jest` 150/150 passing across 14 suites (77 pre-existing Phase 3 tests unchanged +
  73 new Phase 4 tests); `expo-doctor` 20/21 (the one failure is the **pre-existing**,
  already-documented-in this file `expo`/`expo-router` patch-version drift from the
  2026-09-08 entries above — confirmed unrelated: `package.json`'s tracked `expo` version
  did not change this phase, only `@react-native-community/netinfo` was added);
  `expo install --check` confirms the same single pre-existing drift, nothing else;
  `expo config --json` resolves cleanly with all identifiers unchanged. **Real local-dev
  backend** — started a real `backend/` instance locally (Firebase Admin initialized with
  syntactically-valid but entirely synthetic, locally-generated credentials — never a real
  service account, never copied from anywhere) and confirmed, by direct HTTP request, that
  every unauthenticated-path error code this client classifies (`NO_AUTH`, `NO_TOKEN`,
  `INVALID_TOKEN`, the 404 `NOT_FOUND` envelope with `request_id`) matches exactly what
  `backend/routes/*` actually returns. **Authenticated round trip completed 2026-09-16
  (same-day follow-up)**: signed in as the existing disposable test account via a real
  Firebase `signInWithPassword` REST call (using the account's own credentials, entered
  locally by the user into a gitignored temp file, and this project's public Web API key
  read once from `mobile/.env.local` — never displayed) and obtained a genuine ID token.
  Sent it as `Authorization: Bearer <token>` to the same local backend and confirmed every
  authenticated route (`GET /users/profile`, `GET /reports`, `GET /reports/
  dashboard-summary`, `GET /notifications`, `GET /payment/current-subscription`, a
  nonexistent report id, and an intentionally-empty-name template create) returned `503
  PROFILE_LOOKUP_FAILED` — **not** `401` — proving the real token itself was verified and
  accepted by `authenticateToken`; the 503 is the expected, correctly-classified
  consequence of this session's Firebase Admin credentials being synthetic (Firestore
  access itself requires the real service account, which this session was authorized to
  use for only the public API-key field, never the private key). An unauthenticated
  request still correctly returned `401 NO_TOKEN`. A live token-refresh exchange was also
  attempted against Google's real `securetoken.googleapis.com` endpoint; it returned
  `INVALID_REFRESH_TOKEN` (most likely this API key's own restriction scope — not
  investigated further, genuinely out of scope, and not a defect in this client, since the
  refresh mechanism itself belongs to the Firebase SDK, not `client.ts`).

  **Follow-up (2026-09-16, second same-day session): the remaining `200` data round trip
  was completed too — via a local Firestore Emulator, explicitly not real cloud
  Firestore.** No Application Default Credentials or already-authorized dev Firebase Admin
  environment was available (checked first, per instruction — no ADC file, no
  `GOOGLE_APPLICATION_CREDENTIALS`, no already-running approved backend). Per the
  documented safe fallback, a local JDK (the emulator's own JVM requirement) was installed
  with the user's explicit, one-time approval, then the Firestore Emulator
  was run locally (`firebase-tools`, `--only firestore`, an arbitrary/non-authenticated
  local project id — the emulator does not require real GCP credentials at all) and the
  same synthetic-Firebase-Admin backend from the session above was pointed at it via the
  Admin SDK's own supported `FIRESTORE_EMULATOR_HOST` environment variable (no backend
  source change). A handful of minimal, disposable records (one user profile doc, one
  report, one notification) were seeded directly into the emulator, keyed to the real test
  account's own uid (obtained from the same real `signInWithPassword` call as before —
  never logged). Every endpoint then returned a genuine `200`, correctly shaped: `GET
  /users/profile` (`tier:'starter'`, real `uid`), `GET /reports` (`total:1`, the seeded
  report present in `data[]`), `GET /reports/dashboard-summary`, `GET /notifications`
  (`total:1`, `unreadCount:1`, the seeded notification present), `GET
  /payment/current-subscription` (`{tier:'starter', subscription:null}`) — every field
  verified against this client's actual TypeScript response types by direct inspection of
  the real response bodies. **This is a successful authenticated local-emulator round
  trip — real cloud Firestore was never touched, and this is not claimed as cloud
  validation.** A live refresh-token exchange still returned `INVALID_REFRESH_TOKEN`
  (unchanged, not investigated further, not a code defect). An attempt to also exercise
  the actual TypeScript resource-client methods (not just raw HTTP) through a temporary
  Jest harness hit an unrelated Expo-internal issue (`expo/src/winter/fetch`'s fetch
  polyfill returns a malformed `Response` — `status: undefined` — when Jest makes a real
  network call under `jest-expo`'s environment; confirmed via a bare diagnostic fetch, not
  a bug in `client.ts`) — not pursued further given the raw-HTTP shape confirmation above
  plus the existing 150 mocked tests already prove `client.ts`'s own JSON-decoding logic
  against these exact same response shapes. All seeded emulator data, the synthetic
  `backend/.env`, the temporary Jest test file, the temporary validation scripts, and the
  user's `.env.test.local` were deleted; the emulator and backend processes were stopped
  (confirmed via `netstat` — no listener remained on ports 3000/8080/9150, including two
  orphaned child processes from an earlier retry that `kill`ing only the parent hadn't
  reached, found and terminated by exact command-line match, not a blanket process kill).
- Security: every method maps to a route confirmed to exist in `backend/routes/*` by
  direct code reading (four parallel read-only audits of `reports.js`/`users.js`+
  `middleware/auth.js`/`payment.js`/`notifications.js`) — no invented endpoint. `payment.ts`
  deliberately excludes checkout-session creation/confirmation (real-Stripe-charge routes)
  per this phase's own "no real payments" boundary — deferred to Phase 7 (IAP). No token/
  body/header is ever logged (asserted by a dedicated test, and by construction in the
  authenticated-validation script — only HTTP status codes and backend `code` fields were
  ever printed, never a token/password/full response body). `.env`/credentials were never
  copied from the real checkout; every synthetic/temporary `.env`/test-credential file used
  for validation (both the earlier unauthenticated-only pass and this authenticated pass)
  was deleted immediately after use and was never committed (already `.gitignore`d
  regardless, confirmed via `git status --porcelain` before and after). No new Firebase
  account was created and no Firebase resource was modified — only the existing disposable
  test account's own sign-in was exercised.
- Completion criteria: **fully met** — one shared client (`client.ts`) is used by all four
  Phase 4 resource modules (plus the pre-existing `auth.ts`); every Phase-5-scope method
  maps to a confirmed `/api/v1/*` route; retry/auth/offline rules are implemented and
  tested; `tsc`/`jest`/lint/doctor/config checks pass (doctor's one finding is pre-existing
  and unrelated, see above); a genuine authenticated round trip passed against a real
  Firebase ID token, with the data layer verified against a local Firestore Emulator
  (explicitly not real cloud Firestore — see the 2026-09-16 follow-up entry above).
- Out of scope (correctly not done): any UI, screen, hook, navigation, or caching-library
  work (Phase 5); push/device-token registration (absent from the backend entirely — Phase
  6); Apple/Google IAP purchase flows and Stripe checkout-session creation (Phase 7);
  report sharing, archive/restore/duplicate/delete, photo reorder/annotations/regenerate,
  the analyze-without-saving preview, add-photos-to-existing-report, and the Estimate/
  Invoice/Coverage-Letter/Mold-supplement sub-document routes (all confirmed to exist in
  `reports.js` but outside Phase 5's stated scope — add typed wrappers only when a phase
  actually needs the screen that calls them); account deletion/login-history/organization/
  API-keys/logo-upload/onboarding-step endpoints in `users.js` (confirmed to exist, out of
  Phase 5's settings/profile + dashboard/report/tier scope).

### Phase 5 — Core Dashboard Feature Parity
- **Status (2026-10-05): implemented, static checks only — NOT runtime verified.** The
  2026-10-05 audit found the 2026-09-16 implementation incomplete (no review-response UI,
  failed reports unhandled, server-rejected photos counted as uploaded, drafts not
  account-scoped, among others); those were fixed in the 2026-10-05 gap-closure pass (§4).
  Still pending: every Android/iOS runtime check (§12). The original 2026-09-16
  implementation summary remains in §1.
- Objective: the major flows from `Dashboard.jsx`, native-appropriate, not copied JSX.
- Scope, priority order: reports list + dashboard summary; the generate wizard (claim
  info → property → loss details → camera/photo-library capture and upload → review);
  report detail (photos, comments, versions); approve/review-response; export/download
  (save-to-device or share-sheet, since `GET /:id/download` proxies bytes rather than
  redirecting to a public URL); settings/profile. CRM/teams/white-label screens only if
  explicitly confirmed in scope for mobile v1.
- Expected files (actual): `mobile/app/(app)/(tabs)/{dashboard,reports,settings}.tsx` +
  `_layout.tsx` (nested inside the existing `(app)` `Stack.Protected` guard, not a top-level
  `(tabs)` group — see §1 for why), `mobile/app/(app)/report/{new,[id]/index}.tsx`,
  `mobile/src/features/reports/*` (hooks, components, `wizard/*`, `detail/*`, screens),
  `mobile/src/features/photos/*` (capture hook, authenticated-image hook, file helpers),
  `mobile/src/features/settings/*`. `mobile/app/(app)/home.tsx` removed (superseded).
- Dependencies: `expo-image-picker`, `expo-file-system`, `expo-sharing` (added this phase,
  SDK-matched via `expo install`; `expo-camera` was not needed — `expo-image-picker`'s own
  camera launch covers still-photo capture without a second package), Phase 4 client (reused
  unchanged, no second HTTP client).
- Validation: static validation (tsc/lint/jest/doctor/config/export) complete and passing —
  see §1 for exact results. Full wizard run against a real dev account producing a report
  visible on web too is **not yet performed** (no device/emulator available this session).
- Security: photo uploads and exports go through the same authenticated endpoints as web;
  no client-side reimplementation of entitlement/approval rules (server remains
  authoritative — see §1).
- Completion criteria: create → review → approve → export runs entirely from the phone —
  **implemented and unit/contract-tested, not yet confirmed on a real device.**
- Out of scope: CRM/enterprise/white-label admin features (correctly not built).
- **Mobile development is paused after this phase** pending scoping of new requirements the
  client has since shared; Phase 6+ has not started. The one remaining item for Phase 5
  itself is the real-device flow (Android physical device, then iOS): create → upload →
  review → approve → export/share, against a local backend with a disposable test account.

### Phase 6 — Push Notifications
- **Status:** **Implemented (mobile + backend), hardened, static validation complete; push delivery disabled by default; Expo/FCM/APNs credentials, AWS (ECS) configuration and Android/iOS device verification pending. NOT delivery-verified, NOT runtime-verified, NOT production ready.** Mobile side, backend integration and hardening: §4 entries
  dated 2026-10-05. Completion criterion ("at least one real notification type delivers
  end-to-end") is **not yet met** — needs credentials, AWS configuration and a device run.
- Objective: real push for account/report activity, layered on the existing in-app feed
  (`backend/routes/notifications.js` / `backend/utils/notificationService.js`), which today
  is in-app-only — **no device-token storage or push-sending exists in the backend at all**
  (confirmed by repository search).
- Scope: **additive-only** backend change — a device-token field/subcollection on the user
  doc, a small registration endpoint, and a call from the existing `notifyUser()` call
  sites to also fan out via Expo's push service.
- Expected files: mobile — `mobile/src/services/push.ts`; backend (new, small,
  requires separate explicit approval before touching `backend/` at all) —
  `backend/routes/notifications.js` addition, one new call in `notificationService.js`.
- Dependencies: Apple Push Notification key setup (Apple Developer account); explicit
  approval before any `backend/` change.
- Validation: a real notification reaches a physical/simulated device.
- Security: registration endpoint authenticated; tokens scoped per-user; stale-token
  cleanup on send failure.
- Completion criteria: at least one real notification type delivers end-to-end.
- Out of scope: rich/interactive notifications, new notification categories.

### Phase 7 — Subscriptions & In-App Purchase / Billing
- **Status (2026-10-05): Implemented, static validation complete; store setup and runtime
  verification pending.** NOT purchase-verified, NOT sandbox-verified, NOT production ready.
  No store product, credential or notification URL exists yet, so every store path currently
  reports "unavailable" and grants nothing. Full detail: §4 entry "2026-10-05 — Phase 7".
  The completion criterion below ("a real sandbox purchase round-trips to a real
  entitlement") is **not yet met**.
- (Original plan, kept for reference:) **highest-risk phase, flagged explicitly**
- Objective: mobile subscription purchase flows compliant with Apple/Google policy, kept
  in sync with the existing Stripe-driven tier system (`backend/config/tiers.js`,
  `backend/routes/payment.js`).
- Scope: Apple IAP + Google Play Billing for in-app purchase; **no Stripe Checkout inside
  the mobile app** for anything store policy classifies as a digital subscription; new
  backend receipt-validation endpoint(s) mapping a purchase to the same tier enum
  (`getBaseTier`, `TIER_ORDER`) Stripe already uses, so entitlement stays a single source
  of truth regardless of purchase channel.
- Expected files: mobile — `mobile/src/features/billing/*`; backend (new, requires
  separate explicit approval) — Apple Server Notifications v2 / Google RTDN webhook
  handling alongside the existing Stripe webhook.
- Dependencies: App Store Connect + Play Console subscription products configured
  (client-owned); Apple shared secret / Google service account for server-side receipt
  verification.
- Validation: sandbox purchase on both platforms produces the correct tier in Firestore.
- Security: server-side receipt verification only; idempotent webhook handling (mirroring
  the existing `processedWebhooks` Stripe pattern).
- Completion criteria: a real sandbox purchase round-trips to a real entitlement.
- Out of scope: mobile cancelling/downgrading a Stripe-originated subscription (explicit
  policy decision needed first, see §10).

### Phase 8 — Remaining Account/Info Screens
- **Status (2026-10-07): Implemented, static validation complete — NOT runtime-verified on
  Android/iOS, NOT production ready.** Full detail: §4 "2026-10-07 — Phase 8". Decisions
  pending: §10 items 23 (EULA), 26 (Stripe subscription at account deletion), 27 (web delete
  copy parity).
- (Original plan, kept for reference:)
- Objective: Privacy Policy, Terms, Contact/Support, About, profile & account settings
  (MFA, account deletion, if kept at parity with web).
- Scope: mostly read-only content screens sourced from the same legal copy the web app
  uses, plus a settings screen wired to existing `users.js`/`auth.js` endpoints.
- Expected files: `mobile/app/(tabs)/settings/*`, `mobile/src/features/legal/*`.
- Validation: content matches the live web legal pages.
- Security: account-deletion flow (if included) requires the same password re-check the
  web endpoint already enforces.
- Completion criteria: parity with web's info/legal/settings surface.
- Out of scope: authoring new legal copy.

### Phase 9 — Testing & Hardening
- **Status:** static testing/hardening complete; runtime verification pending (2026-10-07). The
  device/OS matrix, poor-network upload runs, per-platform share sheets, screen-reader passes and
  crash/error-reporting choice (§10) still need real Android/iOS devices — see §4 entry.
- Objective: systematic verification before anything nears a store queue.
- Scope: device/OS matrix (recent iOS + Android, phone + tablet), full auth matrix, upload
  reliability on poor networks, export/share-sheet behavior per platform, accessibility
  pass, crash/error reporting.
- Validation: full checklist executed with results logged in this file.
- Completion criteria: no known-blocking defect remains.
- Out of scope: performance work beyond what store review requires.

### Phase 10 — Store Preparation & Release Readiness
- **Status (2026-10-07): IN PROGRESS — local preparation done, completion criterion NOT met.**
  Done: release config (notification icon, permission cleanup, submit profiles), dependency
  alignment on Node 24 LTS, recoverable account-deletion cleanup, store/privacy/reviewer drafts
  (`STORE_RELEASE_READINESS.md`), native Android dev build on EAS. Not done: any device/simulator
  run, store consoles, credentials, screenshots, deployment, internal-track/TestFlight build.
  See §4 "2026-10-07 — Phase 10".
- Objective: submission-ready builds.
- Scope: finalize app icon/splash (including revisiting the Icon Composer format if
  desired), store listings, screenshots, privacy nutrition label / Data Safety form
  (derived from what Phases 3–7 actually collect, not boilerplate), permission-usage
  strings, `eas.json` submit profiles, EAS build profiles for store-ready formats.
- Dependencies: App Store Connect + Play Console access.
- Validation: an internal/TestFlight build installs and runs on a real device.
- Completion criteria: build accepted into internal testing track on both stores.
- Out of scope: **actual public submission for review** — requires your explicit approval,
  separate from "ready to submit."

---

## 4. Progress Log

### 2026-09-05 — Phase 0 confirmed complete; Phase 1 (Mobile Foundation) completed
- Planning report delivered and approved with clarifications (branch strategy, backend
  infra correction, documentation-first ordering).
- Safety audit performed before any change: working tree clean, no uncommitted changes,
  `mobile/` did not exist, `feature/mobile-app-foundation` did not exist locally or
  remotely.
- `main` fast-forwarded from `origin/main` (111 commits); branch
  `feature/mobile-app-foundation` created from the updated `main`.
- This file created, then updated throughout the phase.
- EAS CLI identity check attempted non-interactively (`npx eas-cli@latest whoami`) —
  returned "Not logged in"; recorded as a blocker (§6), no login attempted.
- Scaffolded a current-stable Expo Router + TypeScript app (`create-expo-app`, SDK 57)
  into an out-of-repo scratch directory for inspection, then assembled the final
  `mobile/` tree by hand from it plus original content — never scaffolded directly on top
  of a non-empty target directory.
- Generated real brand assets (app icon, Android adaptive-icon foreground, splash icon,
  in-app brand mark) by rasterizing the actual vector logo
  (`frontend/public/logo-mark.svg`) via the `sharp` package already present in
  `backend/node_modules` — read-only use of an existing dependency, nothing added or
  changed in `backend/`. Reused the existing approved `favicon-64.png` for web output.
- Wrote theme tokens (`src/theme/*`) ported from `frontend/tailwind.config.js` and
  `frontend/src/index.css` real values (brand orange `#FD4403`, brand navy `#002A64`,
  Space Grotesk/Inter pairing, light + dark palettes).
- Wrote `src/components/{BrandMark,ScreenContainer,ThemedText}.tsx`, a minimal branded
  `app/index.tsx`, `app/_layout.tsx` (font loading + splash retention + safe area), and
  `app/+not-found.tsx`.
- Wrote convention-documentation `README.md` files for `src/{features,services,hooks,
  store,utils}` (all currently empty of code by design — no feature/API/state exists yet).
- Wrote `app.config.ts` with all confirmed identifiers, `eas.json` (build profiles only,
  no submit config), `.env.example` (names only), extended `.gitignore` with credential/
  keystore/service-account patterns, and `README.md`.
- Ran the full validation suite — see §8 for exact commands/results. All passed; one real
  lint error (unescaped apostrophe in `+not-found.tsx`) was found and fixed as part of
  this phase (in scope — caused by this foundation's own new file).
- Confirmed via `git status --porcelain frontend backend` that neither directory changed,
  confirmed no nested `.git` under `mobile/`, and confirmed via `git add --dry-run mobile`
  that the 31 files that would be tracked contain no secrets, credentials, `node_modules`,
  or build output.
- **Nothing committed or pushed** — left local per instructions, awaiting your review.

### 2026-09-05 — Remaining foundation verification (Node LTS, EAS auth, audit review, re-validation)
- Checked for an existing Node version manager (`nvm`, `fnm`, `volta`, `n`) — none
  installed; Node is a single standalone system install (`v25.2.1`, non-LTS). Since
  switching requires installing a version manager and/or a new Node build (a system-wide
  action outside this task and not safely reversible per-project), this was **not**
  performed — documented as a blocker (§6) with exact commands for you to run.
- Re-ran `npx eas-cli@latest whoami` and `npx eas-cli@latest project:info` — both
  confirmed still unauthenticated (`Not logged in` / "An Expo user account is required to
  proceed"). Isolated this to be purely an auth gate, not a config issue, by separately
  confirming `npx expo config --json` still resolves every identifier correctly with no
  login required. No login attempted, no credential touched.
- Performed a truly clean dependency install (`rm -rf node_modules && npm ci`, using the
  existing lockfile exactly) — 822 packages, 0 errors.
- Analyzed all 14 `npm audit` advisories in full (traced every dependency path with
  `npm ls`, checked parents' declared semver ranges, ran `npm audit fix --dry-run`) —
  found exactly 2 real root-cause transitive packages (`decode-uri-component@0.2.2`,
  `uuid@7.0.3`), both pinned by their immediate parents to ranges that exclude every
  patched release, both from Expo's own current SDK 57 dependency tree, no non-breaking
  fix available. Documented in full (§12a). **No dependency change was made** — no
  override, no upgrade, no `--force`.
- Re-ran the complete validation suite (`expo install --check`, `expo-doctor`,
  `tsc --noEmit`, `expo lint`, resolved-config check, nested-`.git` check, dry-run
  tracked-file review, `frontend`/`backend` diff, final `git status`) — all passed
  identically to the first pass (see §8 "Re-validation").
- Updated this file and `README.md` with all of the above.
- Phase 1 is **still not marked fully complete** — the Node LTS switch and EAS
  authentication/ownership verification remain outstanding, both requiring your action
  (see §6). Nothing was committed, pushed, or built.

### 2026-09-05 — EAS authentication and ownership verification completed; Phase 1 marked complete
- Ran `npx eas-cli@latest login` inside `mobile/`. This triggered Expo's browser-based
  OAuth flow (not a terminal credential prompt) — a login URL was relayed to the user, who
  completed authentication (including any 2FA) entirely in their own browser. No
  credential was seen, displayed, requested in chat, or stored by this assistant at any
  point; the resulting session token is stored by `eas-cli` at the user's own
  `~/.expo/state.json`, outside the repository entirely.
- Ran `npx eas-cli@latest whoami` and `npx eas-cli@latest project:info` — confirmed an
  exact match on all four required values: user `laibanoreen`, owner
  `flacron-enterprises-llc`, slug `flacronai`, project ID
  `c8227fa0-8a62-4e51-8ccc-c8feb58d0466`. No new project was created; no project was
  relinked; no signing credential was created or rotated.
- Re-confirmed after login: `git add --dry-run mobile` still lists exactly the same 31
  files (nothing new leaked into the repo from the login flow); `frontend`/`backend`
  remain untouched; no secret-shaped filename appears among tracked candidates.
- Updated §1, §3 (Phase 1), §6 (Blockers Log), and §8 (Validation Log) to record this.
- **Phase 1 — Mobile Foundation is now marked complete.** The Node LTS switch remains an
  open recommendation (§6) but is not a completion blocker. Nothing was committed, pushed,
  built, published, or submitted this session.

### 2026-09-05 — Practical runtime device test (physical Android phone via Expo Go)
- Started `npx expo start` (default LAN mode) — Metro started cleanly and bundled once
  successfully (29756ms, 1453 modules), but the phone could not connect.
- Root-caused directly, not guessed: confirmed via `curl` that `localhost:8081` worked
  while the same machine's own LAN IP did not; confirmed via `Get-NetConnectionProfile`
  that the Wi-Fi adapter is on the Windows **"Public"** network category; confirmed via
  `Get-NetFirewallRule -DisplayName "*node*"` that no allow-rule exists for Node.js. This
  is a Windows Firewall/network-classification restriction, not an app defect. No
  firewall change was made (system-wide, out of scope).
- Switched to `npx expo start --tunnel` per the approved fallback plan. This required
  adding `@expo/ngrok` as a `mobile`-scoped devDependency (the CLI's own install prompt
  can't run non-interactively) — a config/tooling change, not an app-code change. Verified
  the tunnel was genuinely live (direct external request to the assigned tunnel host
  returned `HTTP 200`) before generating a QR code for it.
- User scanned the QR code on a physical Android phone via Expo Go. App launched
  successfully; screenshot confirmed correct FlacronAI branding, logo, spacing, portrait
  layout, no overflow/cutoff, correct initial route, no red error screen.
- User then used Expo Go's dev-menu "Reload," which returned to the manual URL-entry
  screen; re-entering the tunnel URL reconnected successfully. Metro's log showed a second
  clean bundle (86ms, 1 module) and zero errors for the entire transition — classified as
  Expo Go/tunnel WebSocket behavior, not an application defect, per direct log evidence
  (not assumption).
- Investigated (but did not use) simulating the terminal's `r` reload keypress: traced
  Expo CLI's internal implementation (`devServerManager.broadcastMessage('reload')` over
  an internal, trust-gated WebSocket control channel) and determined faking it externally
  would be unreliable/unverifiable, so relied on the already-successful, log-confirmed
  reload/reconnect cycle instead of pursuing that.
- Re-ran `tsc --noEmit`, `expo lint`, `expo-doctor`, and `expo config --json` after the
  `@expo/ngrok` devDependency addition — all still passed. `npm audit` now shows 15
  moderate advisories (was 14); the one new entry is from `@expo/ngrok`'s own dependency
  tree, same "dev-tooling only, no non-breaking fix" category as the existing findings.
- iOS and tablet **runtime** testing recorded as pending/deferred — no device/simulator
  available this session. Static iOS and tablet-support configuration remain validated.
- Updated §1, §3 (Phase 1), and §8 (new "Practical Runtime Device Test" subsection) with
  full detail.
- **No application source code was changed** — logs showed no reproducible code-level
  issue at any point in this test.

### 2026-09-08 — Documentation-only Web-to-Mobile Reuse Audit

- **Status:** documentation only. **No implementation, dependency, config, API, frontend,
  backend, or infrastructure change was made.** Phase 2 and all later phases remain **not
  started** — this audit is explicitly not Phase 2 work.
- Safety check before starting: working tree was clean on `feature/mobile-app-foundation`
  (nothing uncommitted). Fetched `origin`, confirmed the mobile-foundation PR (#18,
  `feature/mobile-app-foundation` → `main`) was already merged into `origin/main`, local
  `main` was 2 commits behind and fast-forwarded cleanly, confirmed the completed `mobile/`
  tree exists on `main` post-merge, then created `docs/mobile-reuse-strategy` from the
  updated `main` (this branch did not exist locally or remotely before).
- Read this entire file plus `mobile/README.md` before writing anything new.
- Ran four parallel read-only code audits (backend auth/middleware/tiers/firestore.rules;
  reports/export/AI pipeline/storage; CRM/teams/whitelabel/admin/analytics; frontend brand
  tokens/legal pages/browser-API usage) to ground every claim in this session's new
  document in actual, cited code — not in this file's prior (2026-09-05) snapshot, which
  predates several backend features (e.g., comments/replies, version history, and the
  richer template-builder in `reports.js` were not previously documented here at all).
- Created [`WEB_TO_MOBILE_REUSE_STRATEGY.md`](./WEB_TO_MOBILE_REUSE_STRATEGY.md): a
  file/line-cited reuse matrix (§2), a "web-only, do not copy" list (§3), a native-only
  build list (§4), a business-logic-duplication-prevention section (§5), and a
  feature-parity map with explicit client-decision flags (§6).
- Added a short cross-reference from this file's header/§0 to the new document (above) and
  a short link from `mobile/README.md` (no matrix duplicated there).
- Verified no fabrication: every endpoint/module cited in the new document was confirmed to
  exist at the stated file/line during this session; anything not found (e.g., no
  `requireAdmin` in `middleware/auth.js`, no backend push/device-token code, no dedicated
  account-deletion route in `auth.js` — it's in `users.js:703` instead) is stated as such,
  not silently omitted or guessed.
- Confirmed `frontend/` and `backend/` are untouched (`git status --porcelain frontend
  backend` empty) and only Markdown files under `mobile/` changed — see the final report
  for exact `git diff --check` / `git status` results.
- **Nothing committed, pushed, or merged.** Left on `docs/mobile-reuse-strategy` for
  review, per instruction.

### 2026-09-08 — Phase 2 — Configuration & Environment Preparation

- **Pre-work safety check:** verified `git status --porcelain` showed only the three
  expected documentation files from the prior audit (`mobile/WEB_TO_MOBILE_REUSE_
  STRATEGY.md` untracked, `mobile/MOBILE_DEVELOPMENT_PHASES.md` and `mobile/README.md`
  modified) — no unexpected file, matching the previous session's final report exactly.
  Nothing was stashed, discarded, reset, or overwritten.
- **Branch rename:** checked `git branch --list feature/mobile-initial-phases` and
  `git branch -r --list origin/feature/mobile-initial-phases` — neither existed. Ran
  `git branch -m docs/mobile-reuse-strategy feature/mobile-initial-phases` (a pure local
  rename, not a new branch/checkout) — the three documentation changes were carried over
  untouched, confirmed via `git status --porcelain` immediately after the rename.
- **API routing audit (read-only, no backend/AWS/DNS change):**
  - `frontend/src/services/api.js:4-14` — confirms the web client normalizes `VITE_API_URL`
    (a bare origin, an `/api` base, or an already-versioned `/api/vN` base) to always end
    in `/api/v1`. This is a *client-side normalization helper*, not evidence of a
    same-origin reverse proxy — the resolved `API_BASE_URL` is still an absolute URL to
    wherever `VITE_API_URL` points, set outside the repo (Vercel dashboard).
  - `frontend/.env.example:1` — only documents `VITE_API_URL=http://localhost:3000/api`
    (local dev). No production value is present in any committed file.
  - `frontend/vercel.json` — a single SPA catch-all rewrite (`"/(.*)" → "/index.html"`)
    plus security headers. **No `/api` rewrite/proxy rule exists** — confirms Vercel does
    not forward any path to a backend; the frontend must call an absolute cross-origin URL.
  - `.github/workflows/deploy-backend.yml` — confirms AWS ECR/ECS deployment (cluster
    `flacronai-production-cluster`, service `flacronai-backend-service`, via
    `aws ecs update-service`). **No ALB ARN, target group, DNS name, or custom domain
    appears anywhere in this workflow or elsewhere in the repository.** No ECS task
    definition JSON is committed either.
  - Repo-wide search for `elb.amazonaws.com`, `execute-api`, `.amazonaws.com`,
    `api.flacronai.*`, `backend.flacronai.*`, `flacronai-backend.*` — the only matches are
    this file, `WEB_TO_MOBILE_REUSE_STRATEGY.md`, and `PROGRESS.md`'s own historical
    record of the fabricated-domain incident (2026-08-01/08-12) — i.e., no real domain is
    committed anywhere in the repository, confirmed exhaustively, not just spot-checked.
  - `backend/Dockerfile:6,19,21` — `ENV PORT=3000`, `EXPOSE 3000`, `CMD ["node",
    "server.js"]` — confirms the local-dev origin `http://localhost:3000` (already used in
    both `frontend/.env.example` and `mobile/.env.example`) is accurate and current.
  - **Safe, read-only, unauthenticated public check performed:** `curl` (single small GET,
    no auth headers, no data sent) against `https://flacronai.com/api/v1`,
    `https://flacronai.com/api/`, and `https://flacronai.com/health` — **all three
    returned HTTP 200 with `Content-Type: text/html` and the SPA's `index.html` body**
    (favicon links, etc.), not backend JSON. This directly confirms, by observation rather
    than assumption, that `flacronai.com` is Vercel's static frontend answering every path
    via its catch-all rewrite — **it is not a reverse-proxied backend route**, consistent
    with the vercel.json finding above. No further public endpoints were guessed or probed
    beyond these three, and no authenticated request was attempted.
  - **Conclusion (matches and strengthens the existing open question, not a contradiction):**
    local development origin is confirmed (`http://localhost:3000/api/v1`); production and
    preview origins remain genuinely unconfirmed and are **not** invented — no
    `api.flacronai.com`, no stale `onrender.com` host (already superseded per the existing
    infrastructure note in §2), no guessed ALB hostname. `WEB_TO_MOBILE_REUSE_STRATEGY.md`
    §2.2 already carried this conclusion in general terms; this session's `.env.example`
    and `env.ts` now carry the specific, dated evidence.
- **Environment strategy designed and implemented:**
  - `mobile/src/config/env.ts` (new) — `getAppEnv()`/`getApiBaseUrl()`, reading only
    `EXPO_PUBLIC_APP_ENV`/`EXPO_PUBLIC_API_BASE_URL`. Throws a clear, actionable error if
    `APP_ENV` is unset/invalid. `API_BASE_URL`: falls back to the confirmed local-dev
    value only when `APP_ENV === 'development'`; for `preview`/`production` it throws on
    missing, empty, or localhost-pointing values — there is no default that could silently
    point a real build at the wrong origin. Deliberately contains no API client, no auth,
    no Firebase config (all out of scope for this phase) — pure, side-effect-free config
    resolution, safe to import from anywhere.
  - `mobile/src/config/README.md` (new) — convention doc matching the existing
    `src/{services,utils}/README.md` style.
  - `mobile/eas.json` — added `env: { EXPO_PUBLIC_APP_ENV: "..." }` to each of the three
    existing build profiles (development/preview/production). Deliberately did **not**
    add `EXPO_PUBLIC_API_BASE_URL` here — no real preview/production value exists to put;
    it must be supplied later via `eas env:create` by whoever confirms the real origin,
    not hardcoded now.
  - `mobile/.env.example` — restructured to lead with `EXPO_PUBLIC_APP_ENV` (now
    documented as required, with its three valid values matching the `eas.json` profiles
    exactly) and to spell out, for `EXPO_PUBLIC_API_BASE_URL`, exactly what's confirmed
    (local dev) vs. not (production/preview), including the `flacronai.com` finding above.
  - `mobile/README.md` — added an "Environment strategy" section: supported environment
    names, how selection works (`.env.local` for local dev vs. EAS environment variables
    per build profile for preview/production), commands, an explicit
    `EXPO_PUBLIC_*`-is-publicly-visible warning, the confirmed-vs-placeholder API-origin
    summary, and troubleshooting for the exact error messages `env.ts` throws.
  - `mobile/MOBILE_DEVELOPMENT_PHASES.md` §7 (Folder Structure) — added `config/` as a new
    `src/` subfolder (env/config resolution — distinct from `services/`, which is reserved
    for the future API client/auth/push per its own existing README).
- **Validation — see §8 "Phase 2 validation" for full command/result table.** Summary:
  `tsc --noEmit` 0 errors, `expo lint` 0 errors/warnings, `expo-doctor` 21/21,
  `expo install --check` up to date, `expo config --json` resolved identically (all
  confirmed identifiers unchanged — name/slug/owner/version/scheme/orientation/iOS bundle
  ID/tablet support/Android package/EAS project ID) under simulated development, preview,
  and production `EXPO_PUBLIC_*` values. Six explicit fail-fast/safe-fallback scenarios
  were run against a standalone-transpiled copy of `env.ts` in an isolated Node process
  (in the session scratch directory, not the repo) — all six behaved exactly as designed.
- **Security checks:** `git check-ignore -v` re-confirmed `mobile/.env`,
  `mobile/.env.local`, `mobile/node_modules`, `mobile/.expo` are still correctly ignored.
  Grepped the full diff plus both new files for secret/token/key patterns, `onrender.com`,
  and `api.flacronai.com` — the only two `api.flacronai.com` occurrences are this file's
  own historical-incident references (both pre-existing, unchanged by this phase); no
  secret-shaped string, no stale Render URL, no fabricated domain found anywhere in the
  actual changes.
- **`git diff --check`** — clean, no whitespace errors. Manually checked both new files
  for trailing whitespace — none found.
- **Confirmed `frontend/` and `backend/` remain untouched** (`git status --porcelain
  frontend backend` empty) — every changed/new file is under `mobile/`.
- **Files changed this phase:** `mobile/.env.example`, `mobile/eas.json`,
  `mobile/MOBILE_DEVELOPMENT_PHASES.md`, `mobile/README.md` (modified);
  `mobile/src/config/env.ts`, `mobile/src/config/README.md`,
  `mobile/WEB_TO_MOBILE_REUSE_STRATEGY.md` (new — the last of these was created in the
  prior documentation-audit session and carried forward unchanged by the branch rename).
- **Nothing committed, pushed, built, or submitted.** Left on `feature/mobile-initial-
  phases` for review, per instruction.

### 2026-09-08 — Phase 2 addendum: corrected the "localhost is universal" assumption

- **Root cause:** `mobile/src/config/env.ts`'s development-mode default
  (`http://localhost:3000/api/v1`, added earlier the same day) is correct only for
  targets that share the development machine's own network namespace — the iOS Simulator
  and Expo web. It does not reach the backend from the Android Emulator (whose virtual
  network maps the host machine to `10.0.2.2`, not `localhost`) or from a physical phone
  (a separate device on the network, needing the development machine's current LAN IP or
  a tunnel). Neither the code nor the docs previously said this explicitly, so a
  developer following them on the Android Emulator or a real device would have gotten a
  silent connection failure with no explanation of why.
- **Pre-work safety check:** confirmed the branch is `feature/mobile-initial-phases`, and
  that `git status`/`git diff --stat` showed exactly the reuse-strategy + Phase 2 files
  from the prior sessions — nothing unexpected, nothing stashed/discarded/reset.
- **Correction applied to `mobile/src/config/env.ts`** (function signatures unchanged —
  still just `getAppEnv()`/`getApiBaseUrl()` — so nothing that will consume this module
  later needs to change):
  - Development no longer treats "any URL the developer supplies" as automatically
    correct. `getApiBaseUrl()` now parses the URL and, for plain HTTP, requires the host
    to be a **recognized local/private development target** — `localhost`, `127.0.0.1`,
    `::1`, the Android Emulator/Genymotion aliases (`10.0.2.2`/`10.0.3.2`, both covered by
    the `10.0.0.0/8` pattern), or an RFC1918 private LAN address (`10.x.x.x`,
    `172.16-31.x.x`, `192.168.x.x`). HTTP to any other host (a public domain) now throws —
    it would otherwise send API traffic in the clear to a public host. HTTPS in
    development remains unrestricted (a developer may still point dev at a shared HTTPS
    staging backend).
  - The missing-value fallback still returns `http://localhost:3000/api/v1`, but is now
    documented (in the function's own JSDoc, in `mobile/README.md`, and in
    `.env.example`) as explicitly scoped to the iOS Simulator/Expo web — not a claim that
    it works everywhere. The module still cannot auto-detect which target is running
    (that would require importing `react-native`'s `Platform`, breaking the
    plain-Node-testable design recorded in `src/config/README.md`), so the fix is
    correct documentation plus correct validation of whatever value the developer does
    supply, not automatic target detection.
  - Preview/production validation was also strengthened while fixing this: added an
    explicit HTTPS-only check (previously implicit/absent), rejection of
    emulator/private-LAN hosts (previously only `localhost`/`127.0.0.1` were rejected),
    and rejection of placeholder-shaped values (RFC 2606 `.invalid`/`.example`/`.test`
    TLDs checked against the parsed hostname — not the whole URL string, which would
    never match a TLD suffix once a path like `/api/v1` follows it — plus free-form
    markers like `REPLACE_WITH_`/`YOUR_.../CHANGEME`/`TODO` checked against the full raw
    string). This closes a real gap: before this addendum, a placeholder like
    `https://REPLACE_WITH_PRODUCTION_API_ORIGIN.invalid/api/v1` would have been silently
    *accepted* as a valid production URL (it's syntactically valid HTTPS, non-localhost)
    — now it is explicitly rejected.
  - **Self-caught bug during implementation:** the first version of the placeholder check
    anchored the RFC 2606 TLD patterns (`/\.example$/i` etc.) against the *whole raw URL
    string*, which never matches once a path follows the host (e.g.
    `https://host.example/api/v1` does not end in `.example`). Fixed by checking the TLD
    patterns against the already-parsed `URL`'s `.hostname` instead, and keeping only the
    free-form substring markers against the raw string. Verified with the test matrix
    below.
- **`mobile/src/config/README.md`** — updated to state the dependency-free/no-RN-import
  design constraint explicitly (why target auto-detection isn't attempted here), and to
  flag the narrow scope of the `localhost` fallback for future readers extending this
  module.
- **`mobile/.env.example`** — restructured the `EXPO_PUBLIC_API_BASE_URL` comment block
  into an explicit per-target table (iOS Simulator, Android Emulator, physical phone,
  Expo web) before the separate preview/production explanation, and added an explicit
  instruction never to hardcode a real LAN IP in a committed file.
- **`mobile/README.md`** — added a new "Running on different targets" subsection with the
  same per-target table plus exact commands to find a real LAN IP locally (`ipconfig` /
  `ifconfig` — the commands are documented, no actual IP is printed or committed
  anywhere); expanded the fail-fast error-message table to cover every new validation
  branch; added an illustrative (obviously fake, `.example`-TLD) `eas env:create` example
  for future preview/production configuration, explicitly noting `env.ts` would reject
  that exact placeholder shape.
- **`mobile/WEB_TO_MOBILE_REUSE_STRATEGY.md`** — reviewed for any "localhost is
  universal" or similar API-guidance inaccuracy; found none (it does not mention
  `localhost` at all, only that the production API origin is unconfirmed, which remains
  accurate) — **no change made**, per the addendum's own instruction to touch it only if
  inaccurate.
- **Validation — see §8 "Phase 2 addendum validation" for the full matrix.** Summary: all
  13 required scenarios behave as designed — development accepts `localhost`,
  `10.0.2.2`, and a private LAN IP over HTTP, and rejects HTTP to a public host; missing
  development URL still safely falls back to the labeled `localhost` default;
  preview/production reject `localhost`, `10.0.2.2`, a private LAN IP, two different
  placeholder shapes (TLD-based and substring-based), and HTTP; preview/production both
  *accept* `https://example.com/api/v1` — a syntactically valid, generic HTTPS origin —
  without that acceptance implying it is the real FlacronAI API (it is a validation-only
  example, never referenced as a real value anywhere in the codebase). `tsc --noEmit` and
  `expo lint` both re-confirmed 0 errors/warnings after the change; `expo config --json`
  re-confirmed all Expo owner/project identifiers unchanged.
- **Security:** confirmed no console logging of any environment value was added (none of
  the new validation branches log anything — they only throw); re-ran the secret/
  credential/stale-domain scan across the full diff — no matches beyond the same two
  pre-existing historical-incident mentions of `api.flacronai.com`.
- **Confirmed `frontend/` and `backend/` remain untouched** and no unrelated `mobile/`
  file changed — the diff is limited to `mobile/src/config/env.ts`,
  `mobile/src/config/README.md`, `mobile/.env.example`, `mobile/README.md`, and this file.
  `mobile/eas.json` and `mobile/app.config.ts` were **not** touched by this addendum (no
  change was needed to either for this correction).
- **Phase status unchanged by this addendum:** Phase 1 remains complete; Phase 2 remains
  **complete, with the same external configuration dependency** (the production API
  origin) — this addendum corrected a documentation/validation gap within Phase 2's own
  scope, it did not change Phase 2's completion verdict or introduce a new dependency;
  Phase 3 remains **not started**.
- **Nothing committed, pushed, built, or submitted.**

### 2026-09-08 — Phase 3 Authentication Architecture Audit (documentation only)

- **Status: documentation and analysis only.** No package installed, no screen built, no
  backend/frontend code changed, no Firebase app registered, no OAuth credential
  created. Phase 3 remains **not started**.
- **Pre-work safety check:** confirmed branch `feature/mobile-initial-phases`; confirmed
  `git status`/`git diff --stat` showed exactly the reuse-strategy + Phase 2 (+ addendum)
  files from prior sessions, nothing unexpected; confirmed nothing staged/committed/
  pushed; confirmed `frontend`/`backend` had no unrelated changes. Nothing was stashed,
  discarded, reset, or overwritten.
- Read this entire file, `WEB_TO_MOBILE_REUSE_STRATEGY.md`, `README.md`, and the mobile
  environment configuration docs (`.env.example`, `src/config/env.ts`,
  `src/config/README.md`) before starting the code audit.
- Ran two parallel, fresh, read-only code-audit agents (backend auth routes/middleware/
  tiers/firestore.rules; frontend auth context/UI/deep-link behavior) — deliberately not
  relying on this file's prior, higher-level auth summaries, since the task required
  inspecting *current code*, not documentation.
- **Key finding, independently re-verified by direct `grep` (not just agent output):**
  `frontend/src/services/api.js:98-111` defines `authAPI.register`/`authAPI.login`/
  `authAPI.logout`/`authAPI.changePassword`, but a repo-wide grep for `authAPI\.` call
  sites in `frontend/src` shows **none of these four are ever called anywhere** — the
  web app's actual signup/login/logout/password-change flow goes directly through the
  Firebase Client SDK (`createUserWithEmailAndPassword`, `signInWithEmailAndPassword`,
  `signOut`, `updatePassword`), confirmed at `AuthContext.jsx:157,174,180` and
  `Settings.jsx:14,383`. Only `authAPI.verify`, `.forgotPassword`, `.sendVerification`,
  `.mfaStatus`, `.mfaSetup`, `.mfaVerifySetup`, `.mfaDisable`, `.mfaVerify` are actually
  used. This directly shapes the recommendation in `AUTHENTICATION_ARCHITECTURE.md` §4.
- Spot-verified (by direct file read, not just agent citation) the three most
  load-bearing citations in the new document: `backend/routes/auth.js:148` (custom-JWT
  minting on register), `:500-506` (web-only `continueUrl` for email verification),
  `backend/routes/users.js:702-704` (account-deletion endpoint), and
  `backend/server.js:20-40` (CORS `!origin` allowance) — all confirmed to match exactly.
- Created [`AUTHENTICATION_ARCHITECTURE.md`](./AUTHENTICATION_ARCHITECTURE.md): verified
  current architecture (§1-2), strategy comparison (§3), one primary recommendation with
  a precisely-defined hybrid (§4 — Firebase Client SDK for identity + native
  Google/Apple credential exchange into Firebase + backend REST as the sole entitlement/
  data source of truth, deliberately avoiding the backend's unexercised
  `/auth/login`+`mfaRequired`+`/auth/mfa/login-verify` path), 15 complete flow
  definitions (§5), security/storage design with a threat table (§6), native
  provider/deep-link requirements (§7), a development testing strategy consistent with
  the confirmed Android-emulator/physical-device/firewall/unresolved-production-URL
  facts from Phases 1-2 (§8), 5 unresolved decisions requiring client input (§9), and
  Phase 3 implementation boundaries (§10).
- **The recommendation in that document is pending your approval — it is not adopted by
  writing it down.** Phase 3 does not start from this recommendation automatically.
- Added a cross-reference from this file's header to the new document (above) and a
  short link from `mobile/README.md` (no content duplicated there).
- Verified no fabrication and no secret/credential exposure: every endpoint/file cited
  was confirmed to exist; error codes and response shapes were read directly from the
  route handlers, not inferred; no API key, password, token, or `.env` value appears
  anywhere in the new document — only variable/field names.
- Confirmed `frontend/` and `backend/` remain untouched (`git status --porcelain
  frontend backend` empty) and no dependency was installed (`git diff mobile/package.json
  mobile/package-lock.json` empty) — see the final report for exact validation results.
- **Nothing committed, pushed, built, or submitted.** Left on
  `feature/mobile-initial-phases` for review.

### 2026-09-08 — Phase 3 — Authentication implementation (same day, later session)

- **Status: implementation, not documentation-only.** Real packages installed, real
  screens/services built. **Pre-work safety check:** confirmed branch
  `feature/mobile-initial-phases`; confirmed the working tree matched exactly the state
  left at the end of the Phase 2 addendum + architecture-audit sessions (the four
  documentation files plus `mobile/src/config/`), nothing unexpected, nothing stashed or
  discarded.
- Read this entire file, `AUTHENTICATION_ARCHITECTURE.md`,
  `WEB_TO_MOBILE_REUSE_STRATEGY.md`, and `README.md` before starting, per instruction.
- **Final security re-verification against current code** (not re-trusting the earlier
  same-day audit blindly) — full detail and evidence in
  [`AUTHENTICATION_ARCHITECTURE.md`](./AUTHENTICATION_ARCHITECTURE.md) §11.1: re-confirmed
  by direct file reads (not memory) that MFA is enforced only client-side
  (`backend/middleware/auth.js`'s `authenticateToken` never checks `mfaEnabled`), that
  backend logout only blocks *future* Firebase token refreshes, confirmed the exact
  supported RN Firebase persistence mechanism empirically (not just from docs — traced
  `firebase/auth`'s real re-export chain into `@firebase/auth`'s `"react-native"` export
  condition), re-confirmed no account-linking code exists, and **corrected** the original
  audit's claim that Sign in with Apple needs a development build (it doesn't — Expo's own
  docs confirm Expo Go testability on iOS; only Google Sign-In genuinely needs one, traced
  to its `TurboModuleRegistry.getEnforcing()` call).
- **Real gap found and fixed during implementation, not anticipated by the audit:**
  `firebase`/`@firebase/auth`'s own npm packages have a TypeScript-only resolution gap —
  `getReactNativePersistence` genuinely exists and works at runtime (verified via a clean
  `expo export` on both platforms) but isn't visible to `tsc` through the normal
  `firebase/auth` import path, because that package's `exports` map orders an
  unconditional `"types"` key ahead of its `"react-native"` condition's own nested types.
  Fixed with a minimal ambient type augmentation
  (`mobile/src/types/firebase-rn.d.ts`) copying the exact real signature — not invented —
  plus importing the two RN-specific symbols directly from `@firebase/auth` (added as an
  explicit dependency) in `mobile/src/services/firebase/client.ts`. Both files' own header
  comments document the full reasoning for a future reader.
- **Real backend contract detail found during implementation, not in the original audit:**
  the actual web sign-up flow (`frontend/src/pages/Auth.jsx`'s
  `persistSignupProfileDetails`) does more than create a Firebase user — it also calls
  `GET /users/profile` (auto-creates the Firestore doc) → `PUT /users/profile` (name/
  company) → `POST /users/consent/registration` (the Golden Rule #5 Terms/Privacy consent
  record, same `REGISTRATION_POLICY_VERSION` value kept in sync) → `POST
  /auth/send-verification`, all non-blocking. Mobile's sign-up screen mirrors this exact
  sequence rather than a simplified version of it.
- Installed real dependencies (`mobile/package.json`/lockfile — not merely documented):
  `firebase@12.18.0`, `@firebase/auth@1.13.5` (explicit, for the fix above),
  `@react-native-async-storage/async-storage`, `@react-native-google-signin/google-signin`,
  `expo-apple-authentication`, plus dev-only `jest`/`jest-expo`/`@types/jest`/
  `@testing-library/react-native` for the new test suite — versions resolved via
  `expo install` where applicable, pinned to Expo SDK 57-expected versions
  (`expo-doctor` 21/21 confirms this).
- Built the full `mobile/src/features/auth/*` module (context/provider, screens,
  components, services, utils, types) plus `mobile/src/services/{api,firebase}/*` and
  `mobile/src/config/firebaseConfig.ts`, and wired Expo Router `Stack.Protected` guards in
  `app/_layout.tsx` off one pure `computeAuthStatus()` decision function
  (`src/features/auth/context/authStatus.ts`) — chosen specifically so the route-guard
  logic is unit-testable without mounting React or touching Firebase. Full file list:
  `AUTHENTICATION_ARCHITECTURE.md` §11.4.
- Google Sign-In and Sign in with Apple were implemented and config-gated (never call the
  native module / never attempt without real configuration), matching the task's explicit
  "mark the provider as blocked—not complete" instruction rather than half-implementing
  something that would silently fail. Safe, credential-free additions (`ios.usesAppleSignIn`
  + the `expo-apple-authentication` config plugin) were made to `app.config.ts`; the
  Google Sign-In config plugin was deliberately NOT added (it needs a real OAuth client ID
  or `GoogleService-Info.plist` neither of which exists yet — adding it now would silently
  misconfigure every build).
- Added a real automated test suite (none existed in `mobile/` before this phase): 6 suites,
  59 tests, `jest-expo` + `@testing-library/react-native`, covering validation, error-code
  mapping, the auth-status state machine (pure-function + full-component-render forms),
  and social-provider configuration gating. Hit and resolved two real Jest/Expo-specific
  problems along the way (documented in `jest.config.js`'s and `jest.setup.js`'s own header
  comments so a future reader doesn't have to rediscover them): `firebase`/`@firebase/*`
  ship raw ES modules that `jest-expo`'s default `transformIgnorePatterns` doesn't
  anticipate, and `@react-native-async-storage/async-storage` needs its official Jest mock
  registered or merely importing the Firebase RN persistence chain throws under Jest's
  Node environment (no real native module present).
- **Validation — see §8 "Phase 3 validation" below for the full command/result table.**
  Summary: `tsc`/`expo lint`/`expo-doctor`/`expo install --check` all clean; `npx jest`
  clean (59/59, re-run 3× to rule out flakiness); `npx expo export` clean for **both** iOS
  and Android (the strongest available proxy for "the real app boots," given no physical
  device/simulator was available to this session) — 1236+ modules bundled with zero errors,
  proving the lazily-guarded Google Sign-In import path and the Firebase RN-persistence
  chain both genuinely resolve in the real Metro/Hermes pipeline, not just under mocks.
- **Security checks:** secret/credential pattern scan across the full diff and every new
  file (API keys, PEM headers, Stripe-style keys, AWS access-key shapes, inline
  password/secret assignments) — no matches. `git check-ignore -v` re-confirmed `.env`/
  `.env.local`/`node_modules`/`.expo` still correctly ignored. Confirmed no
  `google-services.json`/`GoogleService-Info.plist`/`*serviceAccount*` file was created.
  `git diff --check` clean (only benign LF→CRLF notices).
- **Confirmed `frontend/` and `backend/` remain untouched** (`git status --porcelain
  frontend backend` empty, checked repeatedly through the session including at the end).
- **Two genuine, reported (not silently worked around) gaps**, both requiring action this
  session could not take: (1) MFA is enforced client-side only — closing it needs a
  `backend/` change, explicitly out of scope for this phase per instruction (**RESOLVED
  2026-09-08, same-day follow-up — see AUTHENTICATION_ARCHITECTURE.md §12**); (2) Google/Apple
  sign-in are code-complete but functionally blocked on Firebase/Google/Apple console
  access this session doesn't have (**still open**). Full detail:
  `AUTHENTICATION_ARCHITECTURE.md` §11.8/§11.9.
- **Nothing committed, pushed, built, published, or submitted; no other phase started.**
  Left on `feature/mobile-initial-phases` for review, per instruction.

### 2026-09-08 — Follow-up audit: MFA design correction + physical-device tunnel correction (documentation only)

Two errors in the same-day audit above were caught before any implementation and
corrected here, documentation-only, nothing in `backend/`/`frontend/`/`mobile/`
implementation touched:

1. **The originally suggested MFA fix (a persistent Firebase custom claim) was rejected.**
   Custom claims live on the user record, not a single login, so it would have let one
   TOTP entry cover all future sessions/devices — a bypass, not a fix. Replaced with a
   short-lived backend-signed MFA session assertion bound to the Firebase uid + the ID
   token's `auth_time`, revoked via the existing `tokenVersion` field, confirmed to add
   zero extra Firestore reads (re-grepped `backend/middleware/auth.js`: the Firebase-token
   path already loads the user doc). Full design in
   `AUTHENTICATION_ARCHITECTURE.md` §12 — **awaiting approval, not implemented.**
2. **Corrected a wrong claim that `npx expo start --tunnel` exposes the local backend to a
   physical device.** It only tunnels Metro's JS-bundle traffic; `EXPO_PUBLIC_API_BASE_URL`
   requests are a separate connection tunnel mode never touches. `README.md` and
   `AUTHENTICATION_ARCHITECTURE.md` §8 corrected to state the real requirement: same-Wi-Fi
   LAN IP with a `Private` network profile + firewall allow-rule for port 3000, or a
   separate backend-specific tunnel — not Metro tunnel mode alone.

`git diff --check` re-run clean; `git status --porcelain frontend backend` empty.

### 2026-09-08 — MFA server-side enforcement + logout/session revocation implemented (same day, approved)

*Left as-written for an honest record of what this pass actually built. **Two things below
were corrected in the very next same-day pass** (see the entry after this one): (1)
`/auth/logout` bumping `tokenValidAfter` was reverted — that specific line, below, describing
"logout immediately invalidate already-issued Firebase ID tokens" is no longer accurate;
only an explicit password change does that now. (2) Web's `logout()` calling the backend
`POST /auth/logout` was reverted too, once (1) made that call unnecessary and the risk of
adding a new network call to web's live sign-out flow outweighed its benefit. The MFA
assertion mechanism itself (the bulk of this entry) is unaffected and remains accurate,
except that enforcement now additionally requires `MFA_ENFORCEMENT_ENABLED=true` (see the
next entry) — while unset/false, unaffected by this pass's changes either.*

Implemented the corrected design from the entry above, per direct task instruction, scoped
strictly to MFA enforcement and logout/session revocation (no other authentication
enhancement, no Phase 4 work):

- **Backend**: `backend/utils/mfaAssertion.js` (new) issues/verifies a short-lived,
  purpose-typed, backend-signed `X-MFA-Token` assertion (12h TTL, bound to uid + Firebase
  `auth_time` + `tokenVersion`, no new secret — derived from the existing `JWT_SECRET`).
  `backend/middleware/auth.js`'s `authenticateToken` now requires it for any `mfaEnabled`
  account on the genuine-Firebase-ID-token path, except a minimal, explicit bootstrap
  exemption list, adding zero extra Firestore reads. Separately, `tokenValidAfter` (bumped
  by `/auth/logout` and `/users/change-password`, both in `backend/routes/`) now makes
  logout immediately invalidate already-issued Firebase ID tokens too, not just future
  refreshes — reusing the same already-loaded user document.
- **Web**: `frontend/src/services/mfaAssertion.js` (new, dependency-free for testability) —
  `sessionStorage`-backed assertion storage + the `MFA_REQUIRED` event `api.js` now raises
  on a `403 MFA_REQUIRED`. `AuthContext.jsx`/`MfaGate.jsx`/`Settings.jsx` wired to
  store/attach/clear it at every required lifecycle point (login, logout, MFA
  verify/setup/disable, password change). Web's `logout()` now also calls the backend
  `POST /auth/logout` (previously only mobile did — the one behavior change made to close
  that asymmetry, per §12.3).
- **Mobile**: `mobile/src/services/mfaAssertionStorage.ts` (new) — `expo-secure-store`
  (added as a genuinely new dependency, `npx expo install expo-secure-store`, config
  plugin declared). `mobile/src/services/api/client.ts`/`api/auth.ts` and
  `AuthProvider.tsx`/`MfaScreen.tsx` wired the same way as web.
- **Full design, corrected `auth_time` claim, TTL/revocation/storage detail, exemption
  list, and compatibility notes**: `AUTHENTICATION_ARCHITECTURE.md` §12 (rewritten from
  "recommended" to "implemented").
- **Tests — all new, all passing, full existing suites also re-run clean (no
  regression)**: backend 26 new (`test/mfa-assertion.test.js`,
  `mfa-enforcement.test.js`, `mfa-verify-route.test.js`; full suite 499/499), frontend 7
  new (`__tests__/mfaAssertion.test.js`; full suite 48/48), mobile 21 new
  (`mfaAssertionStorage.test.ts`, `api/client.test.ts`, 3 cases added to
  `AuthProvider.test.tsx`; full suite 72/72). One test proves a live `/mfa/verify`
  response's assertion is genuinely required by a separately-mounted protected route
  (`403` without it, `200` with it) — a real server-side bypass-resistance proof.
- **Static validation**: backend `npm run lint` (0 errors), backend `npm run
  format:check` (only files already non-compliant before this session remain so — no
  new drift; the 4 newly-created backend files are prettier-clean), frontend `npm run
  lint` (0 errors, only pre-existing unrelated warnings), frontend `npm run build`
  (clean), mobile `npx tsc --noEmit` (0 errors), mobile `npx expo lint` (0
  errors/warnings). `npx expo-doctor` shows one **pre-existing, unrelated** finding
  (`expo`/`expo-router` patch versions slightly behind latest) that already existed
  before this session — confirmed via `git diff package.json`, their version ranges were
  never touched by this fix; not remediated here (would be an unrelated dependency
  change outside this fix's scope).
- **Honest residual gap recorded, not hidden**: Settings.jsx's password-change UI calls
  Firebase's client-side `updatePassword()` directly, not the now-fixed backend
  change-password endpoints — that specific flow does not yet reach the new revocation
  fix (pre-existing gap, unchanged, out of this fix's scope; see §12.3).
- `git diff --check` clean; `git status --porcelain` shows only the files listed in
  §12.6 plus this session's earlier documentation-only changes — nothing in
  `frontend`/`backend` beyond the auth files this fix required, no secrets in the diff
  (checked). **Nothing committed, pushed, built for production, or submitted.**

### 2026-09-08 — Rollout-safety correction: enforcement flag added, logout scope narrowed (same day, approved)

A separation report (requested before this pass) identified two real risks in the entry
above, both corrected in place this same session before anything was deployed:

1. **Backend/frontend deploys are not atomic, and the MFA-assertion check as first
   implemented was unconditional.** If `backend/` had deployed to production ahead of
   `frontend/`, every already-live account with MFA enabled would have gotten `403` on
   every protected route immediately — the live web frontend at that point would never
   send `X-MFA-Token`. **Fixed**: added `MFA_ENFORCEMENT_ENABLED`
   (`backend/utils/mfaAssertion.js`'s `isMfaEnforcementEnabled()`, documented in
   `.env.example`), a plain (non-secret) flag defaulting safely disabled. Assertion
   issuance and both clients' store/attach/clear support run unconditionally — only the
   *rejection* is gated. Verified by test at both the middleware level and a real
   end-to-end route level: with the flag unset, an MFA-enabled account reaches a real
   protected route with zero assertion at all; with it set to `'true'`, the same route
   genuinely requires one. **Enforcement remains OFF in every environment** — turning it
   on in production is an explicit, separate, later step (activation procedure and
   verification checklist: `AUTHENTICATION_ARCHITECTURE.md` §12.9).
2. **The logout-revocation fix, as first implemented, made `/auth/logout` bump
   `tokenValidAfter`** — silently turning ordinary Sign Out into an immediate all-devices
   session kill for both web and mobile, since both call that endpoint. **Fixed**: reverted
   that specific change. `/auth/logout` now does exactly what it did before this whole
   MFA fix (`revokeRefreshTokens` + `tokenVersion` bump — future-refresh-blocking, not an
   immediate kill), documented explicitly above the route so a future caller reads the
   exact semantics first. `tokenValidAfter` now bumps **only** on an explicit
   security event — `POST /auth/change-password` and `PUT /users/change-password` — which
   is the correct, industry-standard scope for "revoke everywhere" (a password change),
   not something ordinary sign-out should do silently. Web's `logout()` — which this
   session had added a new backend call to, specifically to reach the (now-reverted)
   logout revocation — was reverted alongside it, restoring web's original, unmodified,
   local-only sign-out behavior exactly. Mobile's pre-existing call to the backend logout
   endpoint (Phase 3, unchanged) needed no code change, since its target route's behavior
   is now provably back to what it always was.
3. Also fixed as part of the same pass: `X-MFA-Token` was missing from the backend's CORS
   `allowedHeaders` allowlist — a browser preflight would have rejected any cross-origin
   request carrying the header, independent of the enforcement flag, the moment any client
   started attaching it at all. Extracted to `backend/config/corsOptions.js` so it's
   directly unit-tested (`test/cors-options.test.js`) without spinning up the full server.
   Also tightened the bootstrap exemption list from path-only to exact method+path
   matching, and added an explicit, tested same-second precision guarantee for the
   `tokenValidAfter` comparison (a legitimate login landing in the same whole second as a
   revocation event is not falsely rejected).
- **Full design, corrected**: `AUTHENTICATION_ARCHITECTURE.md` §12 (rewritten throughout —
  §12.2 flag + CORS, §12.3 corrected logout/password-change scope, §12.4 exact
  method+path exemption table, §12.9 new: activation procedure + verification checklist).
- **Tests — 55 new/changed this pass, full existing suites re-run clean**: backend +20
  net (`mfa-enforcement.test.js` grew 14→32 tests; `mfa-verify-route.test.js` +2;
  `cors-options.test.js` new, 3; `logout-revocation-scope.test.js` new, 3 — full suite
  **514/514**), frontend +6 new (`authLogoutScope.test.js`, 2;
  `apiMfaHeader.test.js`, 4 — full suite **54/54**), mobile unchanged (no mobile code
  needed to change; full suite re-verified **72/72**, no regression).
- **Static validation**: backend `npm run lint` 0 errors, backend prettier — only the
  same 4 files already non-compliant before this fix remain so (server.js joins that list
  only because it was already non-compliant pre-session, confirmed via `git show HEAD`;
  its own 2-line diff is prettier-clean in isolation), every newly-created file
  prettier-clean; frontend `npm run lint` 0 errors (pre-existing unrelated warnings only),
  frontend `npm run build` clean; mobile `npx tsc --noEmit` 0 errors, `npx expo lint` 0
  errors/warnings.
- `git diff --check` clean (only benign LF→CRLF notices); secret scan across the full
  `backend`/`frontend` diff — no matches; confirmed `backend/.env` (the real, git-ignored
  local config) was not touched, only `.env.example`. **Nothing committed, pushed, built,
  deployed, or submitted; production enforcement was not enabled.**

### 2026-09-08 — Final focused correction before Phase 3 device/provider setup (same day, approved)

Three targeted corrections, per direct task instruction, before moving on to Google/Apple
console configuration and physical-device testing:

1. **Mobile's ordinary logout no longer calls the backend.** Re-verification found
   `AuthProvider.tsx`'s `logout()` still called `authApi.logout()` (a pre-existing Phase 3
   behavior previously left alone as "already safe" once `/auth/logout`'s own scope had
   been narrowed to future-refresh-blocking only). Removed — ordinary Sign Out is now
   local-only on **both** platforms (clears the Firebase session + the stored MFA
   assertion, nothing else), matching web exactly. `/auth/logout` remains available and
   correctly scoped as an explicit all-sessions/future-refresh operation for a future
   trigger, if one is ever built — no new UI was added. `AuthProvider.test.tsx`'s
   logout-cleanup tests rewritten to assert the backend mock is never called (previously
   asserted the opposite).
2. **Web Settings password-change now reaches server-side revocation.** Confirmed
   Settings.jsx's `handlePasswordChange` still called Firebase's client-side
   `reauthenticateWithCredential()`/`updatePassword()` directly, never touching the
   backend — meaning changing a password from Settings never triggered the `tokenVersion`/
   `tokenValidAfter` revocation this whole fix built. Fixed with the smallest compatible
   addition: after the existing (unchanged) client-side flow succeeds, `handlePasswordChange`
   now also calls the already-existing, already-verified `usersAPI.changePassword()` (`PUT
   /users/change-password`) purely for its revocation side effect — best-effort, its
   failure never surfaces as a password-change error. Firebase's recent-login protection
   (`reauthenticateWithCredential()` immediately before `updatePassword()`) is completely
   unchanged; no UI change. New regression test:
   `frontend/src/__tests__/settingsPasswordChangeScope.test.js` (3 tests).
3. **`tokenValidAfter`'s same-second residual window documented explicitly, not
   overclaimed.** The strict `<` comparison already correctly avoided falsely rejecting a
   legitimate same-second login (verified by a prior-pass test); this pass added explicit
   documentation (`AUTHENTICATION_ARCHITECTURE.md` §12.3) stating plainly that a token
   minted in the exact same second as a revocation event is NOT rejected — a real, bounded,
   sub-one-second window, not "perfect instant revocation." No code change was needed here,
   only accurate documentation of already-correct, already-tested behavior.
- **Tests**: mobile `AuthProvider.test.tsx` — 2 tests rewritten (same count), full mobile
  suite **72/72 passing**. Frontend — 3 new tests, full suite **57/57 passing**. Backend —
  unchanged this pass (no backend code touched), full suite **514/514 passing**.
- **Static validation**: mobile `npx tsc --noEmit` 0 errors, `npx expo lint` 0
  errors/warnings; frontend `npm run lint` 0 errors (pre-existing unrelated warnings only),
  `npm run build` clean.
- `git diff --check` clean; secret scan across the full `backend`/`frontend`/`mobile` diff
  — no matches; CORS allowlist re-verified unchanged/correct (`cors-options.test.js` still
  passing, not touched this pass since no CORS-relevant code changed).
- **Nothing committed, pushed, built, deployed, or submitted; enforcement remains
  disabled.** Phase 3 remains partially complete (Google/Apple console configuration and
  physical-device testing still the only remaining blockers); Phase 4 not started.

### 2026-09-08 — Web password-change sequencing corrected (final focused fix, same day, approved)

The previous pass's addition to `Settings.jsx` had a real bug, caught before it went any
further: it called the backend's `PUT /users/change-password` ADDITIVELY, after the
client-side Firebase `updatePassword()` had already run — mutating the password **twice**
per user action, and swallowing the backend call's failure so the UI could show
"Password changed successfully" even if the server-side revocation genuinely failed.

- **Verified the actual backend contract first, not assumed**: read `backend/routes/
  users.js`'s `PUT /users/change-password` directly — confirmed it takes only
  `newPassword` (no `currentPassword` field, no server-side re-verification of the current
  password) and performs the real mutation itself via the Admin SDK. This confirmed
  Firebase's client-side `reauthenticateWithCredential()` is the only genuine
  current-password check anywhere in the flow, which is exactly what the corrected
  sequence below depends on.
- **Corrected sequence, implemented**: (1) `reauthenticateWithCredential()` unchanged,
  still first; (2) `await usersAPI.changePassword(newPassword)` — now the single authority
  for the actual mutation; (3) the client-side `updatePassword()` call **removed
  entirely** — the password is mutated exactly once, server-side; (4) the backend call's
  rejection is caught in its own block, shows a real `toast.error`, and `return`s
  immediately — no path to a false success; (5) form/MFA-assertion clearing and the
  success toast are only reachable after the backend call actually resolves. No UI
  redesign.
- **Tests — the strongest practical integration-level proof available was added, not just
  a mocked "function was called" check**: `backend/test/password-change-contract.test.js`
  (new, 7 tests) — a real Express app mounting the real `PUT /users/change-password`
  route, only Firebase Admin faked — proves the no-current-password-check contract
  directly (a deliberately wrong `currentPassword` field is silently ignored), that a
  successful call mutates the password at exactly one Admin SDK call site, that success
  bumps both `tokenVersion` and `tokenValidAfter`, that a failed mutation bumps neither and
  never reports success, that a weak password is rejected pre-mutation, and that the
  plaintext password is never echoed back. `frontend/src/__tests__/
  settingsPasswordChangeScope.test.js` rewritten (7 tests, source-level — no jsdom/RTL in
  this project): ordering, single mutation call site, zero client-side `updatePassword()`
  call sites, dedicated error handling with an early return, state-clearing only after
  backend confirmation, existing validation guards intact, no secret/password logging
  anywhere in the function.
- **Full design + test evidence**: `AUTHENTICATION_ARCHITECTURE.md` §12.3, rewritten.
- **Full suites re-run**: backend **521/521** (+7 this pass), frontend **61/61** (+4 net —
  the rewritten file still has 7 tests but with different assertions than before), mobile
  **72/72** (unchanged — no mobile files touched this pass except this documentation).
- **Static validation**: backend `npm run lint` 0 errors, prettier-clean on the new test
  file; frontend `npm run lint` 0 errors (14 pre-existing unrelated warnings only, one
  transient new warning from this pass's own test file was found and fixed before
  finishing), `npm run build` clean.
- `git diff --check` clean; secret scan across the full `backend`/`frontend`/`mobile` diff
  — no matches (the test fixture password `Str0ng!Passw0rd#2026`, already used elsewhere
  in this test suite, is not a real secret). Confirmed via `git status --porcelain mobile/`
  that no mobile source file changed this pass, only this documentation.
- **Nothing committed, pushed, built, deployed, or submitted; enforcement remains
  disabled.** Phase 3 remains partially complete; Phase 4 not started.

### 2026-09-08 — Server-side recent-authentication requirement for password changes (final focused fix, same day, approved)

The previous pass closed the duplicate-mutation/false-success bugs but left one real gap:
the backend never checked that a reauthentication had actually just happened — it purely
trusted the already-authenticated session. A stolen-but-still-valid Firebase ID token (from
an old, otherwise-idle session, up to its ~1h natural lifetime) could call `PUT
/users/change-password` directly and succeed with zero proof of recency, since that route
never re-verifies the current password itself.

- **New `requireRecentAuth` middleware** (`backend/middleware/auth.js`): requires the
  verified Firebase ID token's own `auth_time` claim (never anything client-supplied) to be
  within **5 minutes** (`RECENT_AUTH_WINDOW_SECONDS`), with a **30-second**
  (`RECENT_AUTH_CLOCK_SKEW_SECONDS`) tolerance for ordinary clock drift in both directions.
  Missing, non-numeric, future-beyond-tolerance, or stale-beyond-window `auth_time` all
  reject identically: **`403 RECENT_LOGIN_REQUIRED`**. Reads only `req.mfaContext.authTime`
  — already decoded by `authenticateToken` for its own MFA-assertion check — so this is
  zero additional Firestore reads or token re-verification.
- **Custom-JWT fallback is rejected outright, not weakened for it.** That token type carries
  no `auth_time` claim at all, so `req.mfaContext` is never set for it, and
  `requireRecentAuth` treats an absent `mfaContext` the same as a missing claim. Inspected
  before deciding this: web and mobile both always send a Firebase ID token once signed in
  (the custom JWT is only register's brief bootstrap fallback), so this has no real-world
  compatibility cost — a caller that genuinely only holds a custom JWT already has a secure
  path (sign in through Firebase) rather than this middleware trusting an unverifiable claim.
- **Applied to both password-mutating routes on the identical contract**: `PUT
  /users/change-password` (what web actually calls) and `POST /auth/change-password` (not
  called by any client today, but a live route on the same no-current-password-check
  contract — leaving it unprotected would be a real bypass of the exact gap being closed).
- **Frontend sequence, updated** (`frontend/src/pages/Settings.jsx`): after
  `reauthenticateWithCredential()` succeeds, the client now calls `currentUser.
  getIdToken(true)` to force-refresh the cached ID token so its `auth_time` actually
  reflects the reauthentication that just happened, before calling the backend.
  `RECENT_LOGIN_REQUIRED` now gets its own dedicated, safe, actionable message (distinct
  from the generic backend-error toast) and still gates the success path the same way every
  other backend failure does. On **confirmed** success, the flow now also signs the user out
  locally and redirects to `/login` — the backend call that just succeeded already bumped
  `tokenValidAfter`, so the ID token cached in this tab would fail `TOKEN_REVOKED` on its
  very next request anyway; requiring a fresh login also proves the new password actually
  works end-to-end. No UI redesign.
- **Tests**: `backend/test/require-recent-auth.test.js` (new, 12 unit tests against the
  middleware directly) covering recent/boundary/stale/future/missing/malformed/forged-claim
  cases. `backend/test/password-change-contract.test.js` (+5 new, 12 total) proving the
  middleware is actually wired into the real route end-to-end: recent succeeds; stale,
  future, and missing `auth_time` are all rejected before the mutation and before any
  revocation field is touched; a forged body field cannot override a stale real `auth_time`.
  `frontend/src/__tests__/settingsPasswordChangeScope.test.js` (+3 new, 10 total):
  force-refresh ordering, dedicated `RECENT_LOGIN_REQUIRED` handling, and the sign-out +
  redirect happening only on the confirmed-success path. One incidental fix: `backend/test/
  logout-revocation-scope.test.js` used a fixed long-past `auth_time` unrelated to what it
  actually tests — now that both change-password routes it exercises sit behind
  `requireRecentAuth`, that fixed value would have 403'd for an unrelated reason, so it was
  switched to a freshly-computed timestamp.
- **Full design + test evidence**: `AUTHENTICATION_ARCHITECTURE.md` §12.3 (new "Server-side
  recent-authentication requirement" block), §12.6, §12.7.
- **Full suites re-run**: backend **538/538** (+17 this pass), frontend **64/64** (+3 this
  pass), mobile **72/72** (unchanged — no mobile source files touched this pass, only this
  documentation).
- **Static validation**: backend `npm run lint` 0 errors, 64 warnings (all pre-existing,
  none in any file touched this pass); frontend `npm run lint` 0 errors, 14 pre-existing
  unrelated warnings only; frontend `npm run build` clean.
- `git diff --check` clean (only benign pre-existing LF→CRLF notices); secret scan across
  the full `backend`/`frontend`/`mobile` diff — no matches. Confirmed via `git status
  --porcelain mobile/` that no mobile source file changed this pass, only this
  documentation.
- **Nothing committed, pushed, built, deployed, or submitted; enforcement remains
  disabled.** Phase 3 remains partially complete; Phase 4 not started.

### 2026-09-08 (continuation session) — Phase 3 re-validation pass, no regressions

- **Scope**: re-read the current auth state, verify nothing regressed since the last
  session, and complete any remaining *safe* (no console login, no credentials, no device)
  work for Phase 3. No application code was written this session.
- **Pre-work safety check**: `git status --porcelain` matched the exact modified/untracked
  file list left by the prior session — confirmed before touching anything. Nothing
  stashed, reset, committed, or discarded.
- **Full validation matrix re-run** — mobile `npx tsc --noEmit` (0 errors), `npx expo lint`
  (0 errors/warnings), `npx jest` (8 suites, **72/72** passing), `npx expo-doctor`
  (**20/21** — one new, unrelated finding, see below), `npx expo install --check`; backend
  full suite (`npm test`, **538/538** passing, including all 65 tests across the
  MFA/logout/password-change/CORS test files) and `npm run lint` (0 errors, pre-existing
  warnings only); frontend full suite (`npx vitest run`, **64/64** passing, including all
  23 auth/MFA tests) and `npm run lint` (0 errors, pre-existing warnings only); `git diff
  --check` (clean, benign LF/CRLF notices only); a secret/credential scan across the full
  diff and every untracked file (no real matches — one self-referential false positive in
  `AUTHENTICATION_ARCHITECTURE.md`'s own table describing the scan patterns); a
  backend/frontend change-scope check (every modified file matches the documented
  MFA/logout/password-change work, nothing unrelated); and a re-check of EAS/Expo
  ownership (`whoami`/`project:info`, unchanged: `laibanoreen` /
  `flacron-enterprises-llc` / `flacronai` / `c8227fa0-8a62-4e51-8ccc-c8feb58d0466`).
- **New finding (minor, unrelated to auth, not fixed)**: `expo`/`expo-router` are each one
  patch version behind what SDK 57 now expects — an upstream release published since the
  prior session, not a regression from any change here. Left unfixed deliberately: a
  dependency/lockfile bump is outside this session's authorized "authentication only"
  scope. Flagged for a separate decision.
- **Firebase project cross-check (read-only)**: confirmed the Firebase project in use is
  `flacronai-c8dab` (from `backend/.env.example`'s already-public, non-blank
  `FIREBASE_STORAGE_BUCKET` value — not a secret, already in `CLAUDE.md`).
  `mobile/.env.local` still does not exist, so the app still correctly shows
  `ConfigRequiredScreen`. No Firebase CLI is installed/authenticated in this environment,
  so no further console-level check was possible here.
- **Device/emulator availability checked, not assumed**: no `adb`, no Android `emulator`
  binary, no `ANDROID_HOME`/`ANDROID_SDK_ROOT`, no physical device — this is a headless CLI
  environment. Physical-device/emulator Expo Go validation remains **not performed**, same
  reason as the original implementation session: no device available, not skipped.
- **Full detail**: `AUTHENTICATION_ARCHITECTURE.md` §13 (new).
- **Nothing committed, pushed, built, or configured.** No `.env.local`, credential, or
  dependency change was made. **Phase 3 status is unchanged: implemented, partially
  complete.** All outstanding blockers are unchanged and require either Firebase/Google/
  Apple console access or a physical device/emulator, neither available this session.

### 2026-09-16 — Phase 4 (Backend/API Integration Layer) implemented and closed

- **Workspace safety**: the working branch (`feature/mobile-initial-phases`) had mixed
  uncommitted/untracked changes from unrelated already-merged web/auth/MFA/QA work and was
  3 commits behind `origin/main` (which already includes PR #19 mobile-foundation and PR
  #20 QA fixes). Per instruction, did not touch that tree at all — created an isolated git
  worktree from the freshly-fetched `origin/main` (`f1af577`) on a new branch
  `feature/mobile-phase-4-api-integration`, and did all Phase 4 work there exclusively.
- **Endpoint audit (read-only, four parallel sub-agents)**: read `backend/routes/reports.js`
  (5888 lines) in full, `backend/routes/users.js`, `backend/routes/payment.js`,
  `backend/routes/notifications.js`, and `backend/middleware/{auth,rateLimiters}.js`,
  producing a verified method/path/auth/request/response/failure-code/retry-safety matrix
  for every endpoint Phase 5's stated scope (reports list+dashboard summary, the generate
  wizard incl. photo staging, report detail incl. photos/comments/versions,
  approve/review-response, export/download, templates, profile/tier, subscription
  read+cancel, in-app notifications) needs. Confirmed several things that shaped the
  design: `GET /reports`/`GET /notifications` are offset-paginated, not cursor-based;
  `POST /reports/photos/stage` is content-hash-deduped (safe to mark `idempotent`);
  `POST /reports/generate` is NOT (a fresh report id every call, `draftId` reuse is
  rejected with `409 DUPLICATE_GENERATE_REQUEST`, never silently deduped); notification
  preferences have no dedicated endpoint (they live on the user profile doc); payment's
  only genuinely mobile-v1-safe mutation is `cancel-subscription` (cancel-at-period-end
  only, confirmed idempotent) — checkout-session creation/confirmation are real-Stripe-
  charge routes, correctly deferred to Phase 7 (IAP).
- **Shared client (`services/api/client.ts`)**: extended Phase 3's file in place — same
  exported `apiRequest`/`subscribeToMfaRequired` (the existing MFA-header-attachment/403-
  handling logic and the one-time 401-refresh-retry are byte-for-byte the same behavior,
  now exercised by every resource client, not just auth/users). Added: `buildQueryString`
  + defensive `/api/v1`-doubling-proof URL joining; `apiRequestBinary` (a `responseType:
  'binary'` mode returning `{data: ArrayBuffer, contentType, contentDisposition}` for
  photo/export/document downloads, which never respond with JSON); timeout (default 20s,
  overridable) + caller `AbortSignal` cancellation via a combined internal
  `AbortController`, with timeout and cancellation classified into distinct error
  categories; an offline short-circuit (`offline.ts`) that skips the network call
  entirely when connectivity is known absent; a bounded (3 extra attempts) exponential-
  backoff-with-jitter retry loop, honoring a numeric-seconds or HTTP-date `Retry-After`
  header (capped at 15s), restricted to GET requests or a mutation the calling resource-
  client method explicitly marks `idempotent: true` — and only for a `retryable` category
  (`offline`/`timeout`/`rate_limited`/`transient_server`), never for
  `validation`/`conflict`/`permission`/`not_found`/`auth_fatal`/`mfa_required`/`cancelled`;
  a `classify(status, code)` function mapping every backend error code this app calls into
  one of these categories (verified against `middleware/auth.js` + each route's own
  try/catch, not guessed).
- **`offline.ts`**: added `@react-native-community/netinfo` via `npx expo install` (not a
  manual version pin) so it's SDK-57-matched (`12.0.1` resolved); wrapped in a module that
  degrades to `null` ("unknown") rather than throwing if the native module is unavailable.
  Added the package's own official Jest mock to `jest.setup.js` (same pattern as the
  existing AsyncStorage mock) — without it, merely importing the module under Jest crashes
  with a native-event-emitter `TypeError`, confirmed by reproducing it first.
  `offline.test.ts` overrides that global mock per-test for deterministic connectivity-state
  assertions.
- **Resource clients**: `reports.ts` (new — dashboard summary; `list`/`get`/`update`;
  `generate` + the photo-staging trio for the wizard; `analysis-status`/`retry`; photo
  gallery + `reviewPhoto`; comments incl. resolve/reopen; versions; `approve`;
  `submitReviewResponse`; `exportReport` + `downloadExport`/`downloadDocument`; templates
  CRUD — with an explicit "deliberately not covered" list in its own header comment for
  every confirmed-real-but-out-of-Phase-5-scope route); `users.ts` (extended: added
  `getUsage` — the tier/entitlement source of truth for server-verified feature gating,
  Golden Rule #4 — and `updateNotificationPreferences`); `payment.ts` (new, read-only +
  one safe cancel mutation, as scoped above); `notifications.ts` (new: `list` with
  page/limit clamped to the backend's own 50-item cap, `markAsRead`/`markAllAsRead`
  (idempotent per the audit), and preference get/update as thin `users.ts` wrappers).
  `UserProfile`/`NotificationPreferences` types (`features/auth/types.ts`) extended
  additively (new optional fields only — nothing Phase 3 already used was changed).
- **Multipart/binary handling**: `RNFile` (`{uri, name, type}`, RN's own multipart file-part
  convention) + a small `appendFile` helper feed `generate`/`stagePhoto`'s `FormData`
  bodies; binary downloads go through `apiRequestBinary`, never attempting `JSON.parse` on
  success.
- **Tests**: extended `client.test.ts` (kept all 6 original Phase 3 tests unchanged, passing
  unmodified) with new suites for query serialization/URL normalization, offline
  short-circuit, timeout-vs-cancellation classification, retry/backoff eligibility
  (idempotent-vs-not, bounded-attempts, `Retry-After`-honored), the full error-category
  matrix, no-sensitive-logging, and `apiRequestBinary`. Added `offline.test.ts`,
  `users.test.ts`, `payment.test.ts`, `notifications.test.ts`, `reports.test.ts` (mapping-
  layer tests: each method asserted to call the shared client with the exact expected
  path/method/body/params/idempotent-flag, using a mocked `./client` — the transport
  contract itself is `client.test.ts`'s job, not re-tested per resource). One real bug was
  found and fixed during test-writing, not left in: a fetch mock simulating an
  already-aborted `AbortSignal` needs to reject synchronously (a real fetch implementation
  does; an `addEventListener('abort', ...)`-only mock never fires for a signal aborted
  before the listener was attached) — without that fix, the cancellation test hung until
  Jest's timeout; the underlying `client.ts` behavior was already correct, only the test
  mock was unrealistic.
- **Static validation** (all re-run after every source change, final state recorded here):
  `npx tsc --noEmit` — 0 errors. `npx jest` — **150/150** passing, 14 suites (0 regressions
  in the 9 pre-existing Phase 3 suites). `npx expo lint` — 0 errors, 0 warnings (fixed two
  self-introduced warnings during the pass: an `import/no-duplicates` in `client.test.ts`
  and an `@typescript-eslint/array-type` in `reports.ts`; also reordered `jest.mock(...)`
  calls after their imports in every new test file to match Phase 3's existing convention
  and clear `import/first`). `npx expo-doctor` — 20/21; the one failure
  (`expo@57.0.22` vs. the SDK's expected `~57.0.23`) is the **exact same finding already
  recorded** in this file's 2026-09-08 re-validation entry above, predating this phase —
  confirmed via `git diff --stat -- package.json` that this phase's own diff only adds the
  `@react-native-community/netinfo` line, never touches the tracked `expo` version.
  `npx expo install --check` — confirms the same single pre-existing drift, nothing else
  outdated. `npx expo config --json` (with `EXPO_PUBLIC_APP_ENV=development`) — resolves
  cleanly, all confirmed identifiers unchanged.
- **Real local-dev-backend validation**: `npm ci`/`node_modules` for both `mobile/` and
  `backend/` didn't exist in the fresh worktree; a plain `npm ci`/`npm install` inside it
  repeatedly failed with a Windows path-handling error (`ENOENT ... mkdir '\\?'`) while
  extracting deeply-nested React-Native-ecosystem package trees — traced to the worktree's
  longer absolute path (nested under `.claude/worktrees/...`), a known class of Windows
  long-path npm/tar issue, not a code defect. Worked around it safely by `robocopy`-ing the
  already-installed `node_modules` from the main checkout (a plain, non-destructive file
  copy — nothing in the main checkout was modified or removed) into the worktree, then
  installing only the one genuinely new package (`netinfo`) via `expo install`, which
  succeeded normally (small enough package tree to avoid the path-length issue). Then
  started a real `backend/server.js` locally against a **synthetic, locally-generated**
  `.env` (a throwaway RSA keypair generated on the spot for `FIREBASE_PRIVATE_KEY`'s shape,
  a fake project id/client email/etc.) — enough for Firebase Admin SDK's constructor-time
  shape validation to pass and the server to boot and route requests, without ever
  containing or needing a real credential; confirmed this ran with `git status --porcelain`
  showing no `.env` (already `.gitignore`d) before deleting the file at the end. Sent direct
  unauthenticated HTTP requests and confirmed the exact envelope this client's `classify()`
  expects: `GET /` (200, `{name, apiVersion:'v1', basePath:'/api/v1', ...}`),
  `GET /api/v1/reports/dashboard-summary` (401 `{success:false, error:'Authentication
  required', code:'NO_AUTH'}` — `reports.js` uses `authenticateAny`), `GET /api/v1/users/
  profile`/`GET /api/v1/payment/current-subscription`/`GET /api/v1/notifications` (401
  `{code:'NO_TOKEN'}` — these use `authenticateToken` directly), a bogus `Authorization:
  Bearer` value (401 `{code:'INVALID_TOKEN'}`), and an unknown route (404
  `{code:'NOT_FOUND', request_id}`) — all match this client's `AUTH_FATAL_CODES`/
  classification exactly. Stopped the server afterward. **Explicit limitation, recorded
  honestly rather than invented**: no real Firebase test account/ID token existed in this
  environment, so a genuinely *authenticated* round trip (e.g. a real `GET /users/profile`
  200 response, a real photo-stage upload) was **not** performed — every authenticated
  method's route/request/response shape is instead verified directly against the backend
  source (cited file/line in the endpoint audit above) and exercised by the mocked
  contract tests in `reports.test.ts`/`users.test.ts`/`payment.test.ts`/
  `notifications.test.ts`. This is a real, disclosed gap, not a claimed success.
- **Security/privacy**: grepped the full diff for secret-shaped strings (API keys, private
  keys, tokens) — none found (the synthetic `.env` used above was deleted, never staged,
  and was already covered by `backend/.gitignore`'s `.env` entry, confirmed via `git status
  --porcelain` before and after). No token/body/header is logged anywhere in the new code
  (asserted by a dedicated `client.test.ts` test that spies on `console.log`/`warn`/`error`
  during a full request lifecycle with a stored MFA token and a password in the body).
- **Git status**: nothing committed, pushed, or merged — all changes left in the working
  tree of the `feature/mobile-phase-4-api-integration` worktree/branch, created from
  current `origin/main`, for review. No backend/frontend file was modified (only read).
- **Phase 4 is now marked CLOSED.** Phase 5 was explicitly not started — no screen, hook,
  navigation, or UI code was added.

### 2026-09-16 (same-day follow-up) — Phase 4 authenticated real-backend round trip completed

- **Scope**: close the one disclosed limitation from the entry above — a live,
  Firebase-authenticated round trip against the local dev backend — without starting
  Phase 5 or touching any code.
- **Workspace safety**: re-verified the `feature/mobile-phase-4-api-integration` worktree
  and its diff were unchanged from the prior session before doing anything.
- **Credential handling (the actual sequence, for the record)**: no test credentials were
  available via environment variables or any committed reference (correctly — none should
  be). Asked the user once for the shortest safe local step: create a gitignored
  `mobile/.env.test.local` and enter the existing disposable test account's email/password
  directly (opened in Notepad by this session so the values were typed locally, never
  passed through chat). Separately confirmed `backend/.env`'s `FIREBASE_API_KEY` was empty
  (a pre-existing, already-documented gap) before the user re-authorized reading
  `EXPO_PUBLIC_FIREBASE_API_KEY` instead from the real `mobile/.env.local` (a public Web
  API key, not a secret) — read as a single grepped field, nothing else from that file.
- **Validation harness**: a small, temporary bash+curl+node script, written to this
  session's scratchpad directory (outside the repository, deleted after use per
  instruction) — never `set -x`, never echoed a password/token/full auth response; only
  HTTP status codes and backend `code` fields were printed. It: (1) started a local
  `backend/server.js` using a freshly regenerated synthetic `.env` (a throwaway
  locally-generated RSA key, exactly like the prior session's unauthenticated-only pass)
  with one deliberate change — `FIREBASE_PROJECT_ID` set to the real, already-public
  project id `flacronai-c8dab` (already documented non-secret in this file/`CLAUDE.md`),
  so the backend's real Firebase Admin SDK would validate a real ID token's signature
  against the real project; (2) called Firebase's real `identitytoolkit.googleapis.com
  signInWithPassword` REST endpoint with the test account's credentials + the real API key
  to obtain a genuine ID token; (3) sent that token to several real local endpoints; (4)
  attempted a live refresh-token exchange against `securetoken.googleapis.com`; (5) killed
  the server and unset every sensitive shell variable.
- **Results** (method — endpoint — result — pass/fail; no sensitive values recorded):
  | Check | Endpoint | HTTP result | Verdict |
  |---|---|---|---|
  | Real Firebase sign-in | `identitytoolkit.googleapis.com:signInWithPassword` | success (`idToken` present) | **PASS** — genuine token obtained |
  | Firebase token attachment + acceptance | `GET /api/v1/users/profile` | `503 PROFILE_LOOKUP_FAILED` | **PASS** — proves the real token was verified/accepted (not `401`); 503 is the correct, expected consequence of this session's synthetic (non-Firestore-capable) Admin credentials |
  | Reports list client | `GET /api/v1/reports?limit=5` | `503 PROFILE_LOOKUP_FAILED` | **PASS** (same reasoning) |
  | Dashboard summary | `GET /api/v1/reports/dashboard-summary` | `503 PROFILE_LOOKUP_FAILED` | **PASS** (same reasoning) |
  | Notifications list client | `GET /api/v1/notifications` | `503 PROFILE_LOOKUP_FAILED` | **PASS** (same reasoning) |
  | Payment/subscription read client | `GET /api/v1/payment/current-subscription` | `503 PROFILE_LOOKUP_FAILED` | **PASS** (same reasoning) |
  | Not-found response shape | `GET /api/v1/reports/does-not-exist-xyz` | `503 PROFILE_LOOKUP_FAILED` | **INCONCLUSIVE** — middleware's Firestore dependency fires before the route's own 404 logic can run; genuine `404 NOT_FOUND` shape remains verified via source + mocked tests only |
  | Validation response shape | `POST /api/v1/reports/templates` `{name:""}` | `503 PROFILE_LOOKUP_FAILED` | **INCONCLUSIVE**, same reason as above; `VALIDATION_ERROR` shape remains verified via source + mocked tests only |
  | `/api/v1` routing | all of the above | all hit `localhost:3000/api/v1/...` | **PASS** |
  | No-auth request | `GET /api/v1/users/profile` (no header) | `401 NO_TOKEN` | **PASS** — correctly distinct from the real-token 503s above |
  | Forced token refresh | `securetoken.googleapis.com` refresh-token exchange | `INVALID_REFRESH_TOKEN` | **NOT ACHIEVED** — most likely this API key's own restriction scope; not investigated further (would need Google Cloud Console access, out of scope); the retry mechanism itself remains verified by `client.test.ts`'s existing mocked forced-refresh tests |
  | Offline/network recovery | — | — | **NOT RE-EXERCISED LIVE** — toggling real network state was judged an unnecessary machine disruption for a condition already covered deterministically by `offline.test.ts`/`client.test.ts`'s mocked offline suite |
- **Mutation safety**: the only non-GET call made was the validation check above
  (`POST /reports/templates` with an empty `name`), which the backend rejects before any
  Firestore write is attempted (confirmed by reading the route's own code in the earlier
  session's endpoint audit) — no resource was created. No payment, checkout, subscription
  change, account change, deletion, archive, approval, or report-generation call was made,
  live or otherwise; all remain covered by backend-source verification + the mocked
  contract tests only, exactly as scoped.
- **Cleanup performed**: killed the local backend (confirmed via `netstat` — no listener
  remained on port 3000, only closed `TIME_WAIT` sockets); deleted the synthetic
  `backend/.env`, the user's `mobile/.env.test.local`, the backend startup log, and the
  temporary scratchpad validation script; confirmed via `git status --porcelain` that none
  of these ever appeared as tracked/untracked repo changes. Re-ran `tsc --noEmit` (0
  errors), `npx jest` (150/150, unchanged), and `npx expo lint` (0 errors/warnings) —
  confirmed nothing in the mobile source changed during this session (only
  `.env`/temp-credential files outside version control were touched).
- **Phase 4 is now fully complete**, including the authenticated read-only validation.
  The two remaining gaps (a live `200` Firestore-backed response, and a live
  token-refresh exchange) are real, disclosed, non-blocking limitations of this session's
  narrowly-scoped credential access — not defects in the implementation, and both remain
  covered by the mocked contract test suite. Nothing was committed, pushed, or merged.
  Phase 5 was not started.

### 2026-09-16 (second same-day follow-up) — full authenticated data round trip via local Firestore Emulator

- **Scope**: close the one remaining gap from the entry above — a genuine `200` data
  response from every required endpoint — without starting Phase 5 or touching backend/
  frontend source.
- **Access check performed first, per instruction**: no Application Default Credentials
  existed (`gcloud` CLI absent; no `~/.../gcloud/application_default_credentials.json`; no
  `GOOGLE_APPLICATION_CREDENTIALS` env var) and no already-running approved dev backend
  was listening on port 3000 — confirmed by direct inspection, nothing assumed. Per
  instruction, fell back to the local Firestore Emulator.
- **Genuine environment gap found and resolved with explicit approval**: the Firestore
  Emulator requires a JVM; none was installed anywhere on the machine (checked for a
  `java` binary and the standard installer locations — none found). Asked the user
  once; they approved installing a JDK via the OS's standard package manager. The first
  install attempt hung — traced to a real cause, not assumed: a UAC consent dialog was
  waiting for the user's on-screen approval, which no automated session can click through.
  The user approved it and the install completed. Used only by adding its `bin/` to `PATH`
  for this session's own shell invocations — no system-wide PATH change, no other software
  installed, and no detail of the local installation is recorded in this repository.
- **Credential handling**: the user re-entered the same disposable test account's
  email/password into a gitignored `mobile/.env.test.local` via Notepad (same pattern as
  the prior session) three times over the course of this session, because early script
  failures (a stray `EBUSY`-locked emulator jar; a module-resolution bug in the seed
  script) triggered the script's own cleanup trap, which — at first — unconditionally
  deleted that file on every exit, success or failure. Fixed by moving that specific
  deletion out of the automatic trap and into a single deliberate final step, run only
  once the full sequence had actually succeeded — avoiding further unnecessary
  re-prompts. The same previously-approved `EXPO_PUBLIC_FIREBASE_API_KEY` field (only)
  was read again from `mobile/.env.local`.
- **Emulator + backend wiring**: ran `firebase-tools@15.30.1 emulators:start --only
  firestore --project flacronai-c8dab` (an arbitrary local project id — the emulator
  performs no real GCP authentication) from a scratchpad-only `firebase.json` +
  deny-all `firestore.rules` (irrelevant to Admin SDK access, which always bypasses
  security rules, but the emulator requires the file to exist). Pointed the same
  synthetic-Firebase-Admin-credentialed local backend from the prior session at it via
  the Admin SDK's own supported `FIRESTORE_EMULATOR_HOST=localhost:8080` environment
  variable — **no backend source or config file was modified**, only an environment
  variable at process-launch time.
- **Seeding**: a small, temporary Node script (kept outside the repo, briefly copied into
  `backend/` only so `require('firebase-admin')` could resolve via `backend/node_modules`,
  then deleted immediately after each run) wrote exactly three disposable documents keyed
  to the real test account's own `uid` obtained from the real sign-in response (never
  logged): one `users/{uid}` profile doc (`tier: 'starter'`), one `reports/{id}` doc
  (status `finalized`, synthetic claim data, clearly named
  `phase4-emulator-validation-report`), one `notifications/{id}` doc (linked to that
  report). The script refuses to run at all unless `FIRESTORE_EMULATOR_HOST` is set, as a
  hard guard against ever touching real Firestore.
- **Results** (HTTP status + response-shape confirmation only; no uid/email/token ever
  printed):

  | Check | Endpoint | Result | Verdict |
  |---|---|---|---|
  | Profile | `GET /api/v1/users/profile` | `200`, `{success:true, user:{tier:'starter', uid:<string>}}` | **PASS** |
  | Reports list | `GET /api/v1/reports?limit=5` | `200`, `{success:true, total:1, data:[{id:'phase4-emulator-validation-report',...}]}` | **PASS** — seeded report present |
  | Dashboard summary | `GET /api/v1/reports/dashboard-summary` | `200`, `{success:true, summary:{...}}` | **PASS** |
  | Notifications list | `GET /api/v1/notifications` | `200`, `{success:true, total:1, unreadCount:1, notifications:[{...}]}` | **PASS** — seeded notification present |
  | Payment subscription | `GET /api/v1/payment/current-subscription` | `200`, `{success:true, tier:'starter', subscription:null}` | **PASS** |
  | Live token refresh | `securetoken.googleapis.com` | `INVALID_REFRESH_TOKEN` | **NOT ACHIEVED** — unchanged from the prior session, not investigated further (likely an API-key restriction; the mechanism belongs to the Firebase SDK, not this client) |
  | Typed-client decode via a live Jest harness | temporary `__live_validation__.test.ts` | `expo/src/winter/fetch` returned a malformed `Response` (`status: undefined`) under `jest-expo`'s real-network fetch path | **INCONCLUSIVE, not a `client.ts` defect** — confirmed via a bare diagnostic fetch outside any of this app's own code; not pursued further given the raw-HTTP shape confirmation above already matches every relevant TypeScript response type field-for-field, combined with the existing 150 mocked tests already proving `client.ts`'s own decode logic against these exact shapes |
- **Mutation safety**: zero mutations were performed against the real backend/local
  backend beyond the deliberate emulator-only seed writes described above (which never
  touch real Firestore). No payment, checkout, subscription change, account change,
  deletion, archive, approval, or report-generation call was made.
- **Cleanup**: stopped the backend and the emulator; found and terminated (by exact
  command-line match, never a blanket kill-by-name) two orphaned child processes from an
  earlier failed retry that the parent-level `kill` had not reached (an npx wrapper and
  the underlying `java.exe` holding the cached emulator jar locked — confirmed via `wmic`
  command-line inspection before terminating, not guessed); confirmed via `netstat` that
  no listener remained on ports 3000/8080/9150. Deleted: the seeded emulator data (the
  emulator holds data only in memory — stopping it without an explicit export discards it
  entirely, so no separate delete step was needed for the documents themselves), the
  synthetic `backend/.env`, the temporary seed script, the temporary Jest test file, the
  user's `mobile/.env.test.local`, the backend log, and the entire scratchpad working
  directory used for this validation. Confirmed via `git status --porcelain` that none of
  this ever touched version control.
- **Re-validation**: `tsc --noEmit` (0 errors), `npx jest` (150/150, unchanged — the
  temporary live-validation test file left no trace), `npx expo lint` (0 errors/warnings),
  a diff-scoped secret scan (only prose mentioning method names like `signInWithPassword`
  matched — no actual credential/token value), and `git status --porcelain backend
  frontend` (empty — neither touched).
- **Phase 4's authenticated validation is now complete, including the real data round
  trip** — via a local Firestore Emulator, explicitly not real cloud Firestore (see §1 and
  §3 for the exact wording of this distinction). The only remaining, honestly-disclosed
  gaps are the live token-refresh exchange and the Jest-harness fetch quirk, both
  independently understood, both non-blocking, both unrelated to this client's own
  implementation. Nothing was committed, pushed, or merged. Phase 5 was not started.

### 2026-09-16 — Phase 5 (Core Dashboard Feature Parity) implemented
- Started from `origin/main` at `ccf405e` (confirmed to include PR #21 Phase 4 and PR #22
  MFA hardening), in a new isolated worktree/branch
  `feature/mobile-phase-5-core-dashboard` — the pre-existing `feature/mobile-initial-phases`
  working tree and its other 52 uncommitted entries were never touched or cleaned.
- Full implementation summary, file list, dependency list, and exact validation results are
  recorded in §1 Current Status (kept there rather than duplicated here, per this file's own
  "read §1 first" convention) and in §3's Phase 5 entry.
- Headline results: `tsc`/`expo lint` both 0 errors (lint 0 warnings too, after fixing a
  handful of the newer `react-hooks/set-state-in-effect` and `react-hooks/refs` violations
  this phase's own new hooks introduced — direct `setState`/ref-write calls at the top level
  of an effect body had to be nested inside the effect's async closure instead); `npx jest`
  200/200 (150 pre-existing + 50 new); `expo-doctor`/`expo install --check` show only the
  pre-existing, unrelated `expo` patch-version drift already documented since Phase 1;
  `expo config --json` and `expo export` (both platforms) all succeed.
- A real bug — not a test artifact — was found and fixed while writing the duplicate-submit
  test: two synchronous `submit()` calls read the same pre-dispatch state snapshot, so the
  reducer's own no-op guard alone could not stop `reportsApi.generate()` from firing twice.
  Fixed with a synchronous `useRef` lock in `useReportWizard.ts`.
- **Not performed this session, honestly recorded rather than skipped silently:** any
  Android/iOS runtime execution or a real-backend end-to-end round trip — this environment
  had no ADB, Android emulator, physical device, or browser-automation tool available.
  Phase 5 is implementation-complete and statically/contract-test validated, but **not
  cross-platform-QA-approved** until it is run once on a real device against a real/dev
  backend with a disposable account, matching how Phase 3 and Phase 4's own sessions closed
  out their remaining validation gaps.
- Nothing was committed, pushed, or merged; `backend/`/`frontend/` diffs remain empty
  (confirmed via `git status --porcelain`).

### 2026-10-05 — Phase 5 gap-closure pass (audit findings fixed; static validation only)
- **Working copy**: new local branch `fix/mobile-phase-5-gaps` from local `origin/main`
  (`1e12d78`; `mobile/` identical to `c65dfad`) in the clean
  `feature+mobile-phase-5-core-dashboard` worktree (`node_modules` reused — `package.json`/
  lockfile unchanged). Backend contracts were read from that same tree (current `main`).
- **Findings fixed** (each re-confirmed against the code before changing it):
  1. *Account isolation*: the wizard draft used one global AsyncStorage key and survived
     logout; photo/export caches were never cleared. Now drafts are keyed by uid
     (`userScopedKey`); explicit Sign Out wipes all user-scoped keys, both file caches, and any
     pending deep link; a sign-in by a different uid than last time wipes the previous
     account's data first; the legacy unscoped key is always removed
     (`services/localData/*`, `AuthProvider.tsx`, `wizardStorage.ts`).
  2. *Upload results*: a `201` carrying `photo.status: 'failed'` was shown as uploaded. Now
     mapped from the actual response (`wizard/uploadOutcome.ts`): uploaded / duplicate /
     server-rejected (server's `error`, not retryable, staged record deleted on Remove) /
     plan-limit (`MAX_PHOTOS`, server message, capacity re-read) / network (retryable). Only
     `uploaded` counts toward Generate, which also waits for in-flight uploads. Plan capacity
     from the existing `GET /reports/photos/capacity` drives the picker limit and counter;
     photos beyond a known limit are refused on-device.
  3. *Failed reports*: `failed` + `pipelineError` are displayed; owner-only "Retry analysis"
     via the existing `POST /:id/analysis/retry` (`ALREADY_PROCESSING` → refresh), also offered
     for `needs_attention` photos; generate-time `capacityRejected`/failed photos are reported
     on the overview.
  4. *Gating* (`reportActions.ts`, mirroring backend checks): Approve — owner/`review`, not
     processing/regenerating/failed/archived/already reviewed/no content; Export — owner
     only, not processing/failed/archived; comments — `comment` or higher; photo review —
     owner/`review`. Disabled actions show the reason.
  5. *Review-response*: new `ReviewResponseSheet` + `useReviewResponse` on the existing
     `POST /:id/review-response` contract (request changes / reject, optional notes up to
     1000 chars), offered only to the named reviewer of a `pending` request; review-request
     status/notes are shown to everyone with access.
  6. *Polling*: at most one timer; transient errors keep the report on screen and retry with
     backoff (5s→30s); stops on a non-recoverable error or after 10 minutes (Refresh resumes)
     and when the report is no longer processing.
  7. *List refresh*: `reportsEvents.ts` — generate/approve/review-response/retry/processing
     finished signal a change; Dashboard and Reports refresh on focus only when changed or
     when data is older than 2 minutes.
  8. *Export*: 120s timeout for export and download (was the 20s default); server filename
     sanitized; messaging states the file is in temporary app storage only until the next
     export or sign-out and must be saved via the share sheet.
  9. *Remaining*: visible "Start a new report instead" for resumed drafts and a three-way exit
     prompt (keep editing / save & leave / discard — discard also deletes staged photos);
     optional chips no longer pre-highlight unsent defaults (deselectable) and Report type is
     visible; `router.replace` moved into an effect; HEIC — iOS picker asked for the compatible
     (JPEG) representation, and anything still HEIC/unsupported or over 10 MB is refused
     on-device with an actionable message and never counted; thumbnails have error +
     tap-to-retry, a 4-at-a-time fetch limit, and per-screen cache scopes deleted on
     unmount/submit/discard; comment and photo-review errors are banners that keep content;
     status filters match real backend values (incl. `failed`/`completed`/`approved`);
     unknown-code 403 → `permission` (401 stays `auth_fatal`; `FEATURE_NOT_IN_PLAN` and
     `RECENT_LOGIN_REQUIRED` added); a `report/<id>` deep link opened while signed out is held in
     memory and honored after sign-in; Settings no longer shows "Starter" for an unknown tier;
     an offline first load shows an offline state instead of "No reports found"; the stale
     `(app)/_layout.tsx` comment is updated.
- **Deliberately not changed**: comment reply UI (the hook already supports `parentId`; not
  required by this pass); `isApprovalEligible` kept for its existing test, superseded on
  screen by `reportActions`.
- **Backend dependency**: none required. Noted only: `GET /users/usage` reads the static tier
  table while generation enforces PlanConfig, so the Settings report limit can differ if an
  admin edits PlanConfig (backend-side, unchanged).
- **Files** — new: `src/services/localData/{fileCache,userDataLifecycle}.ts`,
  `src/features/navigation/pendingDeepLink.ts`,
  `src/features/photos/components/AuthenticatedThumb.tsx`,
  `src/features/reports/{reportActions,reportsEvents}.ts`,
  `src/features/reports/wizard/uploadOutcome.ts`,
  `src/features/reports/hooks/useReviewResponse.ts`,
  `src/features/reports/detail/ReviewResponseSheet.tsx`, plus tests. Modified:
  `app/{_layout,index}.tsx`, `app/(app)/_layout.tsx`, `services/api/{client,reports}.ts`,
  `types/api.ts`, `AuthProvider.tsx`, photo hooks/utils, wizard types/reducer/storage/hook/
  steps/chips/tile, report screens, detail tabs and hooks, `StatusBadge.tsx`,
  `SettingsScreen.tsx`, and their tests.
- **Validation**: §8 "Phase 5 gap-closure validation". **No runtime/device verification was
  performed and none is claimed.**

---

### 2026-10-05 — Phase 6 — Push Notifications (mobile side; static validation only)

**Where:** `fix/mobile-phase-5-gaps` in the `feature+mobile-phase-5-core-dashboard` worktree, on
top of the uncommitted Phase 5 gap fixes (all preserved). `backend/`, `frontend/`, remote EAS
settings and external services untouched. Nothing committed/pushed/built; no device run.

**Provider:** Expo push service (`expo-notifications` → `getExpoPushTokenAsync({ projectId })`).
Open question §10 #6 was never answered; Expo push is what this file's Phase 6 plan already
specified, so it is used as a documented assumption (§5). All provider calls live in
`src/features/push/pushProvider.ts` — replacing that one file is the switch to direct FCM/APNs.

**Backend contracts confirmed (read-only):** `backend/routes/notifications.js` (GET `/`,
POST `/:id/read`, POST `/mark-all-read`) and `backend/utils/notificationService.js`
(`NOTIFICATION_TYPES`; `notifyUser()` writes Firestore in-app docs only). **No device-token
route, storage or push sending exists** (repo-wide search for expo push / FCM / APNs / device
token: zero hits). Registration is therefore not called anywhere — `backendPushRegistrar` is
`null` and the UI reports "Notifications are allowed on this device, but FlacronAI doesn't send
push notifications yet." No endpoint was invented.

**Implemented (mobile):**
- Permissions: explanation shown before the OS prompt; the prompt only follows an explicit tap
  (dashboard primer "Turn on" or Settings); the primer appears once (device-level
  `flac_push_primer_dismissed_v1`, no personal data) and only while the OS state is
  undetermined; granted / denied-but-askable / permanently denied (→ "Open device settings") /
  undetermined / iOS provisional handled; permission re-read when the app returns to the
  foreground.
- Environment handling: web, simulators/emulators, Expo Go → "Not available here"; no EAS
  projectId or a native config error (e.g. missing FCM config) → "Not configured"; offline →
  retryable "setup pending"; other token failure → retryable "setup failed"; registration
  failure → retryable; backend absent → honest "allowed, not sent yet". Provider error text is
  reduced to a category (no ids reach the UI); nothing logs tokens.
- Platform setup: `expo-notifications` config plugin (`color #FD4403`, `defaultChannel
  report-activity`, iOS `aps-environment` = production for the `preview`/`production` EAS
  profiles, development otherwise); Android channel `report-activity` created before any prompt
  (importance DEFAULT, lock-screen PRIVATE). Identifiers unchanged
  (`com.flacronenterprises.flacronai` on both platforms; owner `flacron-enterprises-llc`).
- Token lifecycle: token fetched only when authenticated + granted; bounded retry (3 with
  backoff, never for config errors); OS token rotation re-reads it; kept in memory only.
  Registration manager: per uid; the same uid+token at most once per run; concurrent calls share
  one attempt; bounded retry for transient API errors only; a generation counter cancels an
  in-flight registration on sign-out/account switch so it can't land on the wrong account; a
  rotated token unregisters the old one; a pre-sign-out task (`features/auth/signOutTasks.ts`,
  run by `AuthProvider.logout` before Firebase sign-out, 4 s cap, errors swallowed) removes the
  token while the session can still authenticate. UI state carries its owner uid so another
  account never sees the previous account's status.
- Notification handling: foreground → banner + list, no sound/badge; report-type pushes call
  `notifyReportsChanged()` (lists refresh on focus, no auto-navigation). Taps (running,
  background, cold launch via `getLastNotificationResponseAsync` + clear) → payload validated
  (`pushPayload.ts`) → `notificationRouting.ts`: signed in → `router.push('/report/[id]')`; not
  signed in → `rememberPendingReport` (the existing deep-link mechanism), honoured by
  `app/index.tsx` after sign-in/MFA and cleared on Sign Out; malformed/unknown payloads ignored;
  each notification id acted on once. Unavailable/forbidden reports use the existing report
  screen states (the server decides access). Listeners attached once per mount, removed on
  unmount.
- Payload contract (PROPOSED — the backend must adopt it): `data: { type, reportId? }` with
  `type` ∈ `NOTIFICATION_TYPES`. Report types (analysis_completed/failed, report_completed,
  review_requested/declined, report_approved, report_shared, export_completed) need a valid
  report id (`reportId`, or the feed `link` `/reports/{id}/preview` as fallback);
  `team_invitation`/`subscription_issue` open the dashboard (no team/billing screen yet).
- Not built (out of Phase 6 scope): inbox, background processing, rich/interactive
  notifications, per-category preference toggles (the existing profile `notifications` prefs
  are email/in-app categories, not push).

**Files:** new `src/features/push/{pushProvider,pushPayload,notificationRouting,pushRegistration,
pushStatus}.ts`, `PushNotificationsProvider.tsx`, `components/{NotificationSettingsCard,
NotificationPrimerCard}.tsx`, `src/features/auth/signOutTasks.ts`, plus tests (`pushProvider`,
`pushPayload`, `notificationRouting`, `pushRegistration`, `pushStatus`,
`PushNotificationsProvider`, `signOutTasks`). Modified: `app/_layout.tsx` (provider inside the
root navigator), `app.config.ts` (plugin), `AuthProvider.tsx` (runs sign-out tasks first),
`navigation/pendingDeepLink.ts` (exports `isValidReportId`), `SettingsScreen.tsx`
(Notifications section), `DashboardScreen.tsx` (primer), `package.json`/`package-lock.json`.

**Dependencies:** `expo-notifications ~57.0.21`, `expo-device ~57.0.2` (the SDK-57 versions
`expo install` resolved; installed with npm against `D:/.npm-cache` because `E:/.npm-cache`
does not exist on this machine). No other package changed. `npm audit --omit=dev`: no finding
involves either new package (§12a still applies to the existing tree).

**Static checks run (results):** `npx tsc --noEmit` 0 errors · `npx expo lint` 0 problems ·
`npx jest` 386/386, 36 suites (93 new push/sign-out tests) · `npx expo export --platform
android` and `--platform ios` both bundle · `npx expo config --type introspect`:
`aps-environment` production under `EXPO_PUBLIC_APP_ENV=production`, development locally;
Android manifest `default_notification_channel_id=report-activity` + color · `npx expo-doctor`
20/21, the only failure being the pre-existing patch drift (expo, expo-image-picker,
expo-linking, expo-router, expo-sharing). Mocked tests prove mobile logic only — **not** that a
notification can be delivered.

**External blockers (also in §6):** (1) backend device-token register/unregister endpoint +
storage; (2) backend fan-out from `notifyUser()` to Expo push with stale-token cleanup and the
payload contract above (generic, claim-free copy); (3) Android FCM: `google-services.json` in
the build (`android.googleServicesFile`) + an FCM V1 service-account key uploaded to EAS —
without it `getExpoPushTokenAsync` fails on Android and the app shows "Not configured"; (4) iOS:
APNs key on the Apple Developer account + EAS credentials, Push Notifications capability on the
App ID; (5) Android monochrome notification icon asset (cosmetic, Phase 10); (6) client
confirmation of the provider choice (§10 #6).

**Deferred device checklist (after all phases; dev build; physical devices):**
1. Android 13+: primer appears once on the dashboard; "Not now" hides it for good; Settings
   shows "Off" + explanation; "Turn on" shows the OS prompt once; allow → status advances; deny
   twice → "Blocked" + "Open device settings" opens FlacronAI's settings; enabling there and
   returning updates the status without a restart.
2. Android < 13: permission granted by default; status correct.
3. iOS: one prompt only; denial → "Blocked" + settings link; provisional treated as allowed.
4. With FCM/APNs configured: token obtained (status isn't "Not configured"); airplane mode on
   first fetch → "setup pending" → "Try again" recovers.
5. Simulator/emulator and Expo Go show "Not available here"; sign-in and reports unaffected.
6. Once the backend exists: token registered for the signed-in account; Sign Out → token
   removed; a second account on the same device → only that account receives pushes.
7. Test push (Expo push tool) with `{type:'report_completed', reportId}` in each state:
   foreground (banner, no navigation, lists refresh), background tap, killed-app tap → opens the
   report; signed-out tap → login → lands on the report; MFA account → MFA → report; a report
   the account can't access → existing not-found/denied state; malformed payload → app opens,
   no navigation; the same notification handled twice → navigates once.
8. Android channel "Report activity" exists; lock screen hides content (PRIVATE);
   notification color/icon acceptable.
9. Token rotation (reinstall / clear data) re-registers.

### 2026-10-05 — Phase 6 — backend integration (Expo Push Service; static validation only)

> **Partly superseded** by "2026-10-05 — Phase 6 — reliability & account-isolation hardening"
> below: the in-memory `setImmediate`/timer delivery, the token-owner-scoped sign-out removal and
> the three "remaining lifecycle limitations" listed in this entry are replaced/resolved there.

**Authorization:** backend changes strictly required for mobile push were authorized for this
task. `frontend/`, web routes/contracts, email and in-app notification behavior are unchanged.
Same worktree/branch (`fix/mobile-phase-5-gaps`); all Phase 5/6 work preserved.

**API contract (backend/routes/notifications.js, mounted under `/api` and `/api/v1`):**
- `POST /notifications/devices` body `{ token, platform }` → `200 { success, registered: true,
  deliveryEnabled }`. `token` must match `Expo(nent)PushToken[...]` (≤200 chars); `platform`
  ∈ `ios|android`; otherwise `400 INVALID_PUSH_DEVICE`. Never echoes the token.
- `POST /notifications/devices/unregister` body `{ token }` → `200 { success: true }` whether or
  not anything was removed (removal only if the caller currently owns the token — no ownership
  leak).
- Auth: `authenticateToken` (Firebase ID token or custom JWT; the existing MFA-assertion
  enforcement applies); account = `req.user.uid` only — a `uid`/`userId` in the body is ignored.
  Rate limit: new per-user `pushDeviceLimiter` (20/min, `PUSH_DEVICE_RATE_LIMITED`). Body size:
  the app-wide JSON limit plus the token-length bound. POST (not DELETE-with-body) for removal so
  proxies never strip the body.

**Storage & lifecycle (backend/utils/pushDeviceStore.js):** collection `pushDevices`, doc id =
sha256(token), fields `{ uid, token, platform, provider:'expo', registrationId, createdAt,
updatedAt }`. Server-only (no Firestore client rule matches → default deny). Register is a
transaction: same owner → refresh `updatedAt` + new `registrationId` (createdAt kept); different
owner → ownership moves atomically (old account can no longer receive, remove or alter it).
Multiple devices per account; cap 10 per account (least recently registered evicted).
Cleanup policy: removed on sign-out (mobile unregister), on account self-deletion
(`routes/users.js` now includes `pushDevices` in its per-user wipe), when Expo confirms
`DeviceNotRegistered`, and by the cap. No time-based sweep yet (tokens refresh `updatedAt` on
every app launch; a stale sweep is an optional future ops job).

**Delivery (backend/services/pushService.js):**
- Hook: `notifyUser()` now returns whether a notification was actually created (false on a
  dedupe hit or swallowed failure) and, only then, calls `enqueuePushForNotification`. Existing
  callers ignore the return value; the in-app record, unread counter and email paths are
  unchanged.
- `PUSH_NOTIFICATIONS_ENABLED` must be exactly `true`; otherwise enqueue returns immediately
  (no Firestore read, no network). Default/`.env.example`: `false`.
- Out of the critical path: scheduled with `setImmediate` (same in-process async approach as the
  photo pipeline; no job queue exists). Limit: a send or receipt check pending at process
  restart is lost — the in-app feed stays the record.
- Events: every `NOTIFICATION_TYPES` value (analysis_completed/failed, report_completed,
  review_requested/declined, report_approved, report_shared, export_completed,
  team_invitation, subscription_issue). Generic copy only (no claim numbers, names, report
  content). Message: `{ to, title, body, data: { type, reportId? }, sound:'default',
  priority:'default', channelId:'report-activity' }` — matches the mobile validator; report types
  without a valid report id are not sent.
- Recipients: only `pushDevices` where `uid == recipient`, de-duplicated by token.
- Expo: batches of 100 to `/--/api/v2/push/send`; 10 s timeout per request; up to 3 attempts
  for network/timeout/429/5xx only (1 s, 2 s backoff); other HTTP errors not retried; optional
  `EXPO_ACCESS_TOKEN` bearer header.
- Tickets: `DeviceNotRegistered` → remove; any other error (InvalidCredentials,
  MessageRateExceeded, MessageTooBig, unknown) or a failed request → token kept. OK tickets →
  receipt check after `PUSH_RECEIPT_CHECK_DELAY_MS` (default 15 min, timer `unref`'d), batches of
  1000 to `/getReceipts`, same retry bounds; only `DeviceNotRegistered` removes.
- Stale-result protection: removal is a transaction that deletes only if the doc still has the
  same `uid` AND `registrationId` captured at send time — a token re-registered or moved since
  is never deleted.
- Logging: status codes / Expo error codes only; never tokens, access token or payloads.

**Mobile adapter:** new `mobile/src/services/api/pushDevices.ts`; `backendPushRegistrar` now
calls it (no client auto-retry — the manager owns bounded retry; unregister timeout 3 s).
New state `registered-delivery-off` (server flag off) → "Allowed … FlacronAI isn't sending push
notifications right now"; `registered` copy says the device is *registered* and points to device
settings if nothing arrives (registration ≠ delivery). Sign-out: removes the registered token
and any in-flight one, waiting for the in-flight request first, all within the existing time
cap. **Remaining lifecycle limitations:** (1) if the in-flight registration outlasts the sign-out
cap (≈4 s), the server may keep that association until the device registers again (the next
account's registration moves it) or Expo reports it invalid; (2) an account switch without an
explicit Sign Out (expired session) can't call unregister — the next account's registration
moves the token server-side, so pushes never go to both accounts, but until then the previous
account still owns it; (3) missing FCM/APNs credentials surface on the device as "Not configured"
(token fetch fails) or server-side as `InvalidCredentials` tickets — the latter is only logged,
not shown in the app.

**Files (backend):** new `utils/pushDeviceStore.js`, `services/pushService.js`,
`test/push-devices.test.js`, `test/push-service.test.js`; modified `routes/notifications.js`,
`utils/notificationService.js`, `middleware/rateLimiters.js`, `routes/users.js` (deletion
wipe), `.env.example`, `test/helpers/fakeFirestore.js` (additive: equality `where`, `delete`,
`create`, `tx.delete`). No new dependency (uses Node's global `fetch`). **Mobile:** new
`src/services/api/pushDevices.ts`; modified `features/push/pushRegistration.ts`,
`pushStatus.ts` and their tests + `PushNotificationsProvider.test.tsx`.

**Checks run:** backend `npm test` → 1307 tests, 1300 pass, 0 fail, 7 skipped (includes all
existing notification/report/auth/MFA/logout regression suites); new push suites 28/28;
`eslint` on all touched backend files → 0 problems; `prettier` applied to the new files only.
Mobile `tsc --noEmit` 0 errors; `expo lint` clean; `jest --maxWorkers=2` 390/390 (36 suites) — a
default-parallel run once lost two workers to a machine out-of-memory error (no assertion
failures), the 2-worker rerun was clean; `expo export` android ✔ ios ✔. Provider/network were
always local stubs — nothing contacted Expo.

**Still pending (external):** Expo account access token (optional) + `PUSH_NOTIFICATIONS_ENABLED=true`
in the AWS ECS task definition (not changed — deployment is AWS ECS, not Render); Android FCM (`google-services.json` +
`android.googleServicesFile`, FCM V1 key uploaded to EAS); iOS APNs key + Push Notifications
capability via EAS credentials; Android monochrome notification icon (Phase 10).

**Deferred device checklist additions** (on top of the 9 steps in "Phase 6 — Push
Notifications"): with the flag ON and credentials in place — sign in → Settings shows "On";
`pushDevices` has one doc for the account; trigger a real event (generate a report → report
ready) → push arrives with generic text, tap opens the report; sign out → the doc is gone; sign
in as account B on the same device → doc owner is B, A's events no longer reach the device;
uninstall the app → after an event, the receipt pass removes the token (DeviceNotRegistered);
flag OFF → Settings shows "Allowed … isn't sending right now" and no Expo request is made.

### 2026-10-05 — Phase 6 — reliability & account-isolation hardening (static validation only)

**Scope/authorization:** backend changes needed for this hardening were authorized; `frontend/`
untouched; notification/email/report behavior preserved; same worktree/branch; no AWS change.

**What inspection confirmed (causes):** (1) mobile Sign Out is local-only (`AuthProvider.logout`
never calls the backend), so the server only learned of a sign-out through the app's own
unregister call — capped at ~4 s and impossible offline; (2) a registration request already in
flight could land after that unregister and re-create the binding; (3) a session that ended
without Sign Out (expiry, web Sign Out → `revokeRefreshTokens`, password change, account switch)
left the binding deliverable; (4) sends and receipt checks lived in memory (`setImmediate` /
`setTimeout`), lost on restart; (5) the app learned `deliveryEnabled` only at registration time.

**Fixes — server-enforced device bindings (`backend/utils/pushDeviceStore.js`):**
- The app creates a random UUID `bindingId` per sign-in on the device and sends it with every
  registration; the server stores only its sha256 plus the verified session timing from the
  auth middleware (new `req.sessionContext`: `authTime`/`issuedAt`/`kind`/`tokenVersion`, set
  for Firebase ID tokens and the custom-JWT fallback; nothing else in the middleware changed).
- **Revocation fence:** `POST /api/notifications/devices/revoke {bindingId}` (no auth — the
  random id is proof of possession; per-IP rate limit `pushRevokeLimiter`, 30/min) writes a
  tombstone (`pushBindingRevocations/{sha256}`, 30-day TTL) and deletes every registration still
  carrying that binding. Registration reads the tombstone inside its own transaction, so a
  request that was in flight at Sign Out is rejected (`409 PUSH_BINDING_REVOKED`) whichever order
  the two reach the server. Idempotent; the response never reveals a match; a revoke can't touch
  a newer binding of the same token. Client request cancellation is never relied on.
- **Stale-request fence:** a registration whose ID token was issued (`iat`) before the session
  currently holding that token began (`sessionAuthTime`) is rejected (`409
  PUSH_REGISTRATION_STALE`) — a late request from an older session/account can't take a device
  back from a newer one (same account or different account).
- **Lease:** each registration sets `leaseExpiresAt = now + 14 days`; the app renews at least
  daily on launch/foreground. Expired leases are never delivered to and are swept 7 days later.
- **Eligibility before every send** (`bindingIneligibilityReason`): owner matches; lease valid;
  account doc exists; not team-suspended; `users.tokenValidAfter` (password change) not newer
  than the session; Firebase Auth record not disabled and `tokensValidAfterTime` (web Sign Out,
  password change, console revocation) not newer than the session; custom-JWT bindings also
  require the current `tokenVersion`. Plus the event's existing notification preference
  (`notificationPrefs` keys; `notificationsEnabled === false` treated as off).
- Multiple devices per account kept (cap 10); `users.js` account deletion wipes `pushDevices`.

**Fixes — device side (`mobile/src/features/push`):**
- `pushRevocationQueue.ts`: ending a binding first persists its id (SecureStore; ids only — no
  token, no uid; ≤10 entries; dropped after 15 days), then tries the revoke within
  `SIGN_OUT_REVOKE_CAP_MS` = 1.5 s. Leftovers are retried at launch and on connectivity regain.
  Sign Out stays responsive offline.
- The binding ends on **any** change of the signed-in identity (Sign Out, session expiry,
  account switch) — not on transient auth states (profile refresh, MFA gate).
- Late registration results after a binding ended are never recorded locally; a server
  `PUSH_BINDING_REVOKED` answer is a quiet cancel (never retried).

**Fixes — durable delivery (`backend/services/pushService.js`):**
- **Handoff:** while enabled, `notifyUser` writes the notification and its `pushOutbox/{notificationId}`
  job in ONE transaction (dedupe hits create neither). If that transaction fails, the
  notification is still written the original way, without push. Disabled → exactly the original
  write, no job.
- **Job doc:** `{ notificationId, uid, type, reportId, state, createdAt, nextRunAt, attempts,
  receiptAttempts, receiptDueAt, deliveries: { <deviceDocId>: { status, registrationId,
  platform, ticketId?, reason? } }, leaseId, leaseOwner, leaseExpiresAt, lastError, expireAt }` —
  no tokens, no payload text.
- **Worker:** started by `server.js` only when enabled, in every instance; polls every 15 s
  (`PUSH_WORKER_INTERVAL_MS`) for `nextRunAt <= now`, claims each job in a transaction with a
  2-min lease + random lease id, and commits results only if it still holds the lease (fencing).
  A crashed/restarted task's job is re-claimed after lease expiry. Concurrency-safe across ECS
  tasks. Only single-field Firestore indexes are needed (auto-created).
- **Retries/terminal states:** send attempts persisted, backoff 30 s → 10 min, max 5 → `failed`;
  `MessageRateExceeded` retries only that device; jobs whose event is older than
  `PUSH_MAX_EVENT_AGE_MS` (default 1 h) before any send → `expired` (so enabling push later, or
  a long outage, never sends an old backlog). Receipts: checked `PUSH_RECEIPT_CHECK_DELAY_MS`
  (15 min) after the first ticket, up to 4 times, then unresolved tickets → `unconfirmed`, job
  `done`. Terminal jobs get `expireAt = +7 days` and are swept by the worker; the sweep also
  removes expired tombstones and long-expired leases.
- **Invalid-token cleanup:** only `DeviceNotRegistered` (ticket or receipt) deletes, and only if
  the device doc still has the same `uid` + `registrationId` captured at send time.
- **Sanitized diagnostics:** `InvalidCredentials` records only `{platform: lastCredentialErrorAt}`
  in `pushDiagnostics/credentials`.
- **Delivery semantics (documented, unavoidable):** at-least-once per device. If Expo accepts a
  send but the worker dies or loses its lease before recording tickets, the retry can deliver the
  same notification twice (Expo has no idempotency key). Bounded by the 5-attempt cap.

**Fixes — honest app status:** `POST /devices` and new authenticated `GET
/api/notifications/push-status?platform=` return only `{ deliveryEnabled, providerStatus:
'unverified'|'credential-error' }` (credential error = Expo reported `InvalidCredentials` for
that platform in the last 24 h). The app refreshes it on foreground (≤ every 10 min) and shows
separate states: permission granted, registered ("On" — never "will arrive"), delivery off
("isn't sending right now"), configuration problem ("Temporarily unavailable"), token-fetch
"Not configured".

**Remaining bounded limitations (with safeguards):**
1. **Offline Sign Out that never reconnects:** the server can't learn of it until the device is
   back online (the queued revocation is then sent). Worst case the binding stays deliverable
   until its lease expires — **≤14 days after the app's last registration/renewal** *(reduced to
   7 days default, configurable — see "Phase 6/7 gap closure")* — unless
   ended sooner by: another account signing in on that device (stale fence moves the token),
   web Sign Out / password change / account disable or deletion (eligibility check), or Expo
   `DeviceNotRegistered` (uninstall). Payloads are always generic (no claim numbers, names or
   report content), so a push in that window reveals only an event type.
2. **Firebase session expiry without revocation:** Firebase refresh tokens don't expire on
   their own, so "expiry" means revocation/disable/deletion — all covered by the eligibility
   check at send time.
3. **At-least-once duplicates** as described above.
4. **Credential problems** are visible to the app only after Expo reports them (first failed
   send/receipt), and only as a generic state.

**Files:** backend new/rewritten `utils/pushDeviceStore.js`, `services/pushService.js`,
`test/push-devices.test.js` (17), `test/push-service.test.js` (15); modified
`routes/notifications.js`, `utils/notificationService.js`, `middleware/auth.js`
(`req.sessionContext` only), `middleware/rateLimiters.js`, `server.js` (worker start),
`.env.example`, `test/helpers/fakeFirestore.js` (additive numeric `<=` filter). Mobile: new
`features/push/pushRevocationQueue.ts` (+ test), rewritten `pushRegistration.ts`,
`services/api/pushDevices.ts` (`register` with bindingId, `revoke`, `status`); modified
`PushNotificationsProvider.tsx`, `pushStatus.ts`; tests updated. No new dependency
(`expo-crypto`/`expo-secure-store` were already installed).

**Checks run (actual):** backend `npm test` → 1311 tests, 1304 pass, 0 fail, 7 skipped (all
existing notification/report/auth/MFA/logout suites included); push suites 32/32; eslint on all
touched backend files → 0 errors (one pre-existing `no-unused-vars` warning in `auth.js`).
Mobile `tsc --noEmit` 0 errors; `expo lint` 0 problems; `jest --maxWorkers=2` 390/390, 37 suites;
`expo export` android ✔ ios ✔. Expo, Firebase Auth and connectivity were always stubs.

**AWS configuration still needed later (not done):** inferred from
`.github/workflows/deploy-backend.yml` + `backend/Dockerfile`: the backend is a Docker image in
ECR deployed to ECS (cluster `flacronai-production-cluster`, service
`flacronai-backend-service`), launched as `node server.js`. Environment variables are therefore
set on the ECS **task definition** (plain env or Secrets Manager/SSM `secrets`) — the exact
mechanism in use is **not visible in the repo** and must be confirmed in the AWS console. To
enable later: add `PUSH_NOTIFICATIONS_ENABLED=true` (and optionally `EXPO_ACCESS_TOKEN` as a
secret, plus the optional tuning vars), register a new task-definition revision, redeploy the
service. The worker then runs inside every task (no separate service/scheduler needed); a
rolling deploy or task restart is safe — in-flight jobs are re-claimed after their 2-min lease.
Outbound HTTPS to `exp.host` must be allowed from the tasks' subnets (NAT/egress). Disable =
set the flag to `false` and redeploy; queued jobs then wait, and anything older than 1 h is
expired rather than sent when re-enabled. (`backend/render.yaml` is a stale artifact; not
modified.)

**Deferred device checks (added to the earlier lists):** sign in → register → Sign Out online →
`pushDevices` doc gone and tombstone present; airplane mode → Sign Out → reconnect → binding
revoked within one connectivity event; Sign Out while a registration is in flight (slow network)
→ no binding remains; account A then B on one device → only B receives; web Sign Out for the
account → its mobile binding stops receiving; flag on → real event → push arrives once (generic
text) → tap opens the report; kill the ECS task mid-send (staging) → job completes after lease
expiry; Settings shows "Temporarily unavailable" after a forced credential error.

### 2026-10-05 — Phase 7 — Subscriptions & In-App Purchase (static validation only)

**Status: Implemented, static validation complete; store setup and runtime verification
pending.** Same worktree/branch as Phase 6 (`fix/mobile-phase-5-gaps`); all Phase 5/6
uncommitted work preserved. Nothing committed/pushed/merged; no PR, deploy, EAS build, store
change or real purchase.

**Library choice.** `expo-iap` 5.8.2 (Expo module, OpenIAP spec; StoreKit 2 + Google Play
Billing; free, MIT; config plugin; dev-build workflow — never Expo Go). Chosen over
`react-native-iap` (same maintainer, Nitro-based, less Expo-native) and RevenueCat (paid
third-party service — not allowed without approval). Backend: Apple's official
`@apple/app-store-server-library` 3.1.0 (App Store Server API + JWS chain verification) and
`google-auth-library` 9.15.1 (already a transitive dep of firebase-admin; now explicit) for the
Play Developer API and Pub/Sub OIDC verification. Docs checked 2026-10-05: Android "Fight
fraud and abuse" (server `subscriptionsv2.get`, 3-day acknowledgement, `obfuscatedAccountId`
match, `linkedPurchaseToken` revocation, purchase token as primary key), Apple App Store
Server API status values 1–5.

**Architecture.**
- *Single entitlement value.* `users/{uid}.tier` stays the one value every existing plan-limit
  and paid-feature check reads. New `backend/utils/entitlements.js` computes it as the higher
  of: `stripeTier` (written only by Stripe paths) or `storeBaseTier` (tier captured at the first
  store purchase), and the active `storeEntitlement` (written only after store verification).
  Accounts with no store purchase resolve to exactly `tier || 'starter'` — unchanged.
- *Stripe preserved.* `payment.js` `persistSubscription` + `customer.subscription.deleted` now
  write `stripeTier` and compute `tier` through `stripeTierUpdate()` — identical result when no
  store entitlement exists; an active App Store/Play subscription is no longer wiped by a
  Stripe event. No Stripe field is ever written by store code; no store field by Stripe code.
- *Read-time expiry.* `middleware/auth.js` sets `req.user.tier` via `resolveEffectiveTier`, so a
  lapsed store subscription stops granting immediately even if the store notification is late,
  and a background recompute corrects the stored `tier`.
- *Store records.* `storeSubscriptions/{sha256(key)}` (key = Apple originalTransactionId /
  hashed Google purchase token — raw tokens are not stored) with `ownerUid`, verified state,
  expiry, auto-renew, environment. `processedStoreNotifications/{apple_uuid|google_messageId}`
  for replay protection (written only after successful processing → store redelivers on 5xx).
- *Account binding.* Each account gets a random UUID `billingAccountToken`
  (`POST /billing/store/account-token`), passed to the store as Apple `appAccountToken` /
  Google `obfuscatedAccountId`. Server rules (one transaction): a purchase carrying a token
  binds only to that token's account (`ACCOUNT_MISMATCH` otherwise); an owned purchase is never
  transferred (`PURCHASE_OWNED_BY_OTHER_ACCOUNT`); a token-less purchase (e.g. App Store offer
  code) binds to the first verifying account; a deleted owner releases it. Google
  `linkedPurchaseToken` retires the previous purchase (`replaced`) and cannot be re-claimed.
- *Verification.* Apple: `getTransactionInfo` (production, then sandbox if accepted) →
  `getAllSubscriptionStatuses` → JWS verified (`SignedDataVerifier`, online checks, bundle ID,
  environment, app Apple ID); product must be mapped; family-shared transactions rejected.
  Google: `subscriptionsv2.get` for the configured package; product + base plan must be mapped;
  server-side acknowledge after the durable write. Client product must equal the verified
  product (`PRODUCT_MISMATCH`). Sandbox/test purchases gated by `STORE_BILLING_ACCEPT_SANDBOX`.
- *State mapping.* Entitled: `active` (incl. cancelled = auto-renew off, until expiry) and
  `grace_period`. Not entitled: `billing_retry`, `on_hold`, `paused`, `pending`, `expired`,
  `revoked`, `replaced`. 1-hour expiry leeway for renewal-notification lag.
- *Notifications.* `POST /billing/store/notifications/apple` (signedPayload verified; state
  re-read from the API, never trusted from the payload) and `POST
  /billing/store/notifications/google` (Pub/Sub push; Google-signed OIDC token for the
  configured audience + service-account email; purchase re-fetched from the Play API; wrong
  package ignored). Purchases completed while the app was killed bind via the account token.
- *Fail-safe.* Missing credentials/products → catalog `available:false` /
  `STORE_NOT_CONFIGURED` / notifications 503; never a grant. Errors never echo store text,
  tokens or JWS.
- *Rules hardening.* `firestore.rules`: client SDKs can no longer write `tier`, `stripeTier`,
  `storeBaseTier`, `storeEntitlement`, `billingAccountToken` or Stripe fields on their own user
  doc (create allows `tier: 'starter'` only). This also closes a **pre-existing** hole where a
  signed-in user could set their own `tier` via the client SDK. No client writes the user doc
  (verified). **Rules are not deployed** (needs `firebase deploy --only firestore:rules`).

**Mobile.** `src/services/api/billing.ts` (contract); `src/features/billing/storeAdapter.ts` —
the only file importing `expo-iap` (lazy `require`, so Expo Go/web/tests never crash; normalized
products/purchases/errors; Android picks the configured base plan's own offer, not an intro
offer); `planCatalog.ts` (server catalog × store products; unmatched or period-mismatched
products are never purchasable; availability states); `purchaseProcessor.ts` (server verify →
finish only on `finish:true`; pending/failed/transient leave the transaction unfinished;
per-session generation + in-flight dedupe; other-account purchases not submitted);
`BillingProvider.tsx` (mounted in `app/(app)/_layout.tsx` so listeners exist only while signed
in; one listener pair per session, removed + store disconnected on sign-out/account switch;
state tagged by uid so another account's state is never shown; silent start-up reconciliation
of unfinished purchases; purchase/restore/manage; foreground status refresh);
`screens/SubscriptionScreen.tsx` + route `app/(app)/subscription.tsx` + a "Subscription"
button in Settings. UI states: loading, offline, error, unsupported build, store not
configured, no products, product unavailable, web-subscriber (text only, no purchase/external
purchase link), store-subscriber (renewal / cancelled-until / grace / on-hold / expired /
revoked line from verified data, store "Manage subscription" deep link, or cross-platform
instructions), pending, cancelled, verifying. Auto-renew disclosure + Terms/Privacy links
(existing `flacronai.com/terms-of-service`, `/privacy-policy`). `app.config.ts`: `expo-iap`
plugin.

**Backend contracts (new, `/api` and `/api/v1`):** `GET /billing/status`, `GET
/billing/store/catalog?platform=ios|android`, `POST /billing/store/account-token`, `POST
/billing/store/verify` `{platform, productId, transactionId|purchaseToken, source}` →
`{tier, store, entitled, subscription, finish, …}`, `POST /billing/store/notifications/apple`,
`POST /billing/store/notifications/google`. Rate limit `storeBillingLimiter` 30/min/uid.

**Product mapping (env, none set — never guessed):** `APPLE_IAP_PRODUCT_<KEY>` =
App Store product ID; `GOOGLE_PLAY_PRODUCT_<KEY>` = `<productId>:<basePlanId>`; KEY ∈
PROFESSIONAL, PROFESSIONAL_ANNUAL, AGENCY, AGENCY_ANNUAL, ENTERPRISE, ENTERPRISE_ANNUAL
(same tier keys as `getStripePriceId`). Unset/malformed/duplicate → not purchasable.

**Still required (external, client-owned):**
- App Store Connect: Paid Apps agreement; one subscription group with products per tier/period;
  Family Sharing **off**; In-App Purchase API key (.p8, Key ID, Issuer ID); app Apple ID; App
  Store Server Notifications **V2** URL (production + sandbox) →
  `https://<ECS API origin>/api/v1/billing/store/notifications/apple`; sandbox testers; EULA
  choice (currently links our Terms of Service).
- Play Console: subscriptions with monthly/annual base plans; service account with Play Console
  financial/orders permission; Pub/Sub topic + **authenticated push** subscription →
  `/api/v1/billing/store/notifications/google`; RTDN topic set in Play Console; license testers.
- AWS ECS task: `APPLE_IAP_*`, `APPLE_ROOT_CA_CERT_PATHS` (Apple Root CA G3 file in the image
  or a mounted path), `GOOGLE_PLAY_*`, `STORE_BILLING_ACCEPT_SANDBOX` — via Secrets Manager;
  public HTTPS origin still unconfirmed (§10.1).
- Deploy the updated `firestore.rules`. New EAS **development build** (native module added).

**Deferred runtime/sandbox verification (both platforms):** sandbox purchase → correct tier in
Firestore; cancel in store → "Cancelled — access until …" and access until expiry; renewal
(sandbox accelerated) → `expiresAt` advances via notification; expiry → tier drops; refund/revoke
(Apple REFUND / Play voided) → access removed; grace period / billing retry / account hold;
Ask to Buy / Play pending → pending UI then grant; kill app mid-purchase → recovered on next
launch or via notification; restore on a second device; restore signed in as another FlacronAI
account → explanation, no transfer; account switch during a purchase; web Stripe subscriber
sees "managed on the web" and no buy buttons; Android acknowledgement happens server-side
(no 3-day refund); notification signature rejection with a forged payload; Manage deep links
open the right store pages; localized prices in a non-USD storefront.

**Unresolved decisions:** see §10 items 5 and 15 (updated) and 19–23.

### 2026-10-05 — Phase 6/7 gap closure (before Phase 8; static + emulator validation only)

Same worktree/branch (`fix/mobile-phase-5-gaps`), all Phase 5–7 work preserved. Nothing
committed/pushed/merged; no PR, deploy, rules deploy, EAS build, live AWS/store/Expo change,
real push or real purchase. Phase 8 not started.

**Phase 6 — reliability & privacy**
- *Offline-logout window reduced 14 → 7 days.* Lease is now `PUSH_BINDING_LEASE_HOURS`
  (default 168 h, clamped 24–336 h); the app renews every 12 h on launch/foreground (was 24 h).
  **Remaining bounded window (E):** a device that signs out *offline* and never reconnects can
  still be sent generic pushes until its lease expires — at most 7 days (default) after its last
  renewal — unless ended sooner by another sign-in on the device, web Sign Out / password change /
  account disable or deletion, or uninstall. The server cannot learn of an offline sign-out until
  the device talks to it; this is not instantaneous revocation. Tradeoff: a signed-in user who
  doesn't open the app for longer than the lease stops getting pushes until they next open it
  (in-app feed and email unaffected). Lowering to 72 h/24 h shrinks the window further at that
  cost — a business setting, not a code change.
- *Stale pushes recognised on the device.* Every push now carries `bindingTag` (non-reversible,
  derived from the stored binding hash — never the revocation secret). The app persists the tags
  of bindings it **ended** (≤20, 30 days, AsyncStorage, tags only). A push for an ended binding
  gets no foreground banner, never navigates, is never remembered for the next sign-in, and
  immediately retries the queued server revocation. Bindings superseded by a relaunch are not
  "ended", so legitimate cold-launch taps still work. **Limitation (E):** background / killed-app
  banners are drawn by the OS before app code runs and cannot be suppressed by the app.
- *Revocation persistence (unchanged, re-verified):* SecureStore queue, retried at launch, on
  connectivity regain and now on any stale push; server tombstone + stale-request fence keep
  late/old operations from touching a newer binding or account.
- *Outbox gap closed.* If the combined notification+outbox transaction fails, the notification is
  saved under the **same id** with `pushPending: true` (so an ambiguous commit can't create a
  second copy); the worker's reconcile pass (every tick, 25 at a time) creates the job with
  `create()` (idempotent) using the notification's own `createdAt`, then clears the flag; events
  older than `PUSH_MAX_EVENT_AGE_MS` are cleared, never sent late. In-app notifications are still
  written when push infrastructure fails; push disabled → exactly the original write.
- *Stable event id.* Every push carries `eventId` (= notification id, identical on every retry).
  The app de-duplicates foreground banners, list refreshes and tap navigation by it.
  **Limitation (E):** after an ambiguous provider acknowledgement the worker may resend (Expo has
  no idempotency key); if the OS already showed a background banner, a second banner can appear —
  client handling only guarantees the app *acts* once.
- Unchanged and re-tested: durable send/receipt recovery, lease-based worker fencing, binding
  eligibility before every send, disabled-delivery behaviour, `DeviceNotRegistered`-only cleanup.

**Phase 7 — entitlement consistency (all `tier` writers now go through one transactional writer)**
- Writers found: Stripe (`payment.js`), admin (`sales.js` `PUT /admin/update-tier`), team
  accept/remove (`teams.js`), store (`storeSubscriptions.js`); readers: `middleware/auth.js`
  (`req.user.tier`) + ~22 direct reads of the stored `tier`.
- **Policy (implemented):** effective tier = the **highest** of independent sources —
  `stripeTier`, `adminTier`, team membership (→ enterprise), `storeEntitlement`, and a one-time
  `legacyTier` snapshot for pre-existing accounts. No source can reduce another's grant.
  `utils/entitlements.js` `applyEntitlementSources()` reads the user doc (+ store records) and
  writes source fields + `tier` in **one Firestore transaction**; `middleware/auth.js` computes
  the same value per request and corrects drift in the background.
- **Admin override preserved:** stored as `adminTier`; Stripe/store/team events never erase it.
  Admin "starter" clears the grant but cannot remove a plan the user pays for (response now
  includes `effectiveTier`). Legacy admin-updated accounts are carried over (as `adminTier` when
  no Stripe subscription is active, else as `legacyTier`).
- **Team removal** recomputes from the member's own sources instead of forcing `starter`
  (previously wiped a member's own paid plan); accepting a team still yields enterprise.
- **Stripe ordering:** `customer.subscription.updated` now re-reads the subscription from Stripe
  (a late "active" event can no longer re-grant an ended subscription); an event for an older
  subscription never replaces the current one; ending a subscription clears only the Stripe
  source and only for the current subscription id.
- **Store:** recompute reads every subscription the user holds (`storeSubscriptionIds`) inside the
  same transaction — concurrent verify/restore/notification/Stripe writes can't apply stale
  results; refund/revocation of one store subscription keeps another valid one.
- **Upgrade/downgrade (supported mechanism, explicit):** iOS — in-app switch to a plan in the
  **same subscription group** (StoreKit/App Store applies it: upgrade now, downgrade at renewal;
  never a second subscription; plans in another group are not offered), plus App Store
  subscription management; a pending downgrade shows "Changes to X on <date>". Android — in-app
  switch via Google Play **replacement** using the current purchase token (higher tier:
  `charge-prorated-price`; otherwise `with-time-proration`); `linkedPurchaseToken` retires the old
  purchase. Team members are told their plan is included (no purchase).
- **Sandbox isolation:** production default accepts sandbox/test purchases **only** for accounts in
  `STORE_SANDBOX_TESTER_EMAILS` (empty → none); others are refused (app) or recorded with no
  access (notifications). `STORE_BILLING_ACCEPT_SANDBOX=true|false` overrides.
- **Enterprise not sold in-app** — follows the documented web decision (Enterprise is "Contact
  Sales", `Pricing.jsx`); ENTERPRISE store mappings are ignored even if set.

**Firestore rules** — users doc is now a strict allowlist: owners may change only
`displayName, firstName, lastName, phone, company, address, photoURL, updatedAt`; self-create
only those + `uid/email/createdAt` and `tier: 'starter'`. All entitlement, team, billing and
security fields are server-only. Billing/device/outbox/notification collections have no client
rules (deny). Emulator tests (`npm run test:rules`, demo project, local emulator only) pass 5/5
against the new rules and **fail 2/5 against the original rules** — i.e. the original rules let a
user set their own `tier`. **This is a local fix only: the deployed rules are unchanged and are
presumed still vulnerable until `firebase deploy --only firestore:rules` is run** (the same suite
can audit any rules file via `RULES_FILE=`).

**Public API origin (resolved):** `PROGRESS.md` (2026-08-12) recorded production traffic to
`api.flacronai.com`; a read-only `GET https://api.flacronai.com/health` returned
`{"status":"healthy","environment":"production"}`. Mobile production profile now sets
`EXPO_PUBLIC_API_BASE_URL=https://api.flacronai.com/api/v1` (`eas.json`, public value). Preview
left unset (decision). The new `/billing` routes return 404 there — nothing deployed.

**Status classification**

| | Item |
|---|---|
| **A. Code complete, statically checked** | Phase 6: lease reduction, stale-binding tags, outbox reconciliation, eventId dedupe. Phase 7: unified entitlement writer + policy, admin/team/Stripe/store consistency, out-of-order/concurrency guards, plan changes (iOS group / Android replacement), sandbox allowlist, Enterprise exclusion, rules allowlist + emulator tests, production API origin in `eas.json`. |
| **B. Business decision pending** | Admin-override precedence confirmation; sandbox tester list / production policy; Terms vs Apple standard EULA; duplicate Stripe/store web guard; lease length (7 d default); whether preview builds use the production API; Android replacement modes (proration) and iOS group setup. |
| **C. External setup / deployment pending** | See consolidated checklist below. |
| **D. Android/iOS runtime verification pending** | Both platforms, after C: push delivery + tap + stale-binding behaviour; sandbox purchase, restore, plan change, cancel/expire/refund/grace/hold, notifications. |
| **E. Inherent limitations (mitigated)** | Offline-logout ≤ lease window; OS-drawn background banners can't be suppressed; at-least-once push duplicates after ambiguous provider ack; store/notification lag (1 h expiry leeway, read-time recompute). |

**Consolidated Phase 6/7 setup checklist (C)**
1. *Expo / FCM / APNs* — Expo project `@flacron-enterprises-llc/flacronai`: upload FCM v1
   service-account key (Android) and APNs key (iOS) via EAS credentials; optional
   `EXPO_ACCESS_TOKEN` (enhanced push security) as an ECS secret.
2. *Apple (App Store Connect)* — Paid Apps agreement; **one** subscription group containing
   Professional/Agency monthly + annual; Family Sharing off; In-App Purchase API key (.p8, Key ID,
   Issuer ID); app Apple ID; Server Notifications **V2** URL (production + sandbox) →
   `https://api.flacronai.com/api/v1/billing/store/notifications/apple`; sandbox testers + App
   Review demo account; Terms/EULA + privacy links in metadata.
3. *Google (Play Console / Cloud)* — subscriptions with `monthly`/`annual` base plans; service
   account with Play Console financial/orders access; Pub/Sub topic + **authenticated push**
   subscription (OIDC, audience = `GOOGLE_PLAY_RTDN_AUDIENCE`) →
   `https://api.flacronai.com/api/v1/billing/store/notifications/google`; RTDN topic set in Play
   Console; license testers.
4. *AWS ECS* (cluster `flacronai-production-cluster`, service `flacronai-backend-service`) — new
   task-definition revision with: `PUSH_NOTIFICATIONS_ENABLED`, optional `PUSH_BINDING_LEASE_HOURS`;
   `APPLE_IAP_BUNDLE_ID`, `APPLE_IAP_APP_APPLE_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_ID`,
   `APPLE_IAP_PRIVATE_KEY` (secret), `APPLE_ROOT_CA_CERT_PATHS` (Apple Root CA G3 file baked into
   the image or mounted), `APPLE_IAP_PRODUCT_*`; `GOOGLE_PLAY_PACKAGE_NAME`,
   `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (secret), `GOOGLE_PLAY_PRODUCT_*`, `GOOGLE_PLAY_RTDN_AUDIENCE`,
   `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL`; `STORE_SANDBOX_TESTER_EMAILS` /
   `STORE_BILLING_ACCEPT_SANDBOX` — secrets via Secrets Manager/SSM. Worker: runs inside every
   task (no separate service); egress to `exp.host`, `api.storekit.itunes.apple.com`,
   `api.storekit-sandbox.itunes.apple.com`, `androidpublisher.googleapis.com`,
   `oauth2.googleapis.com`/`www.googleapis.com` (OIDC certs). Then deploy the backend image.
5. *Firestore* — `firebase deploy --only firestore:rules` (rules in `backend/firestore.rules`);
   single-field indexes only (auto). Optionally audit the live rules first with
   `RULES_FILE=<exported rules> npm run test:rules`.
6. *New development builds* (both platforms) — required: native modules `expo-iap` and
   `expo-notifications` were added; then preview/production builds (preview needs an
   `EXPO_PUBLIC_API_BASE_URL`).

### 2026-10-07 — Phase 8 — Remaining Account/Info Screens (static validation only)

Same worktree/branch (`fix/mobile-phase-5-gaps`), all Phase 5–7 work preserved. Nothing
committed/pushed/merged; no PR, deploy, rules deploy, EAS build, live change, real deletion,
purchase or push. Phase 9 not started.

**Scope (from §3 Phase 8 + reuse strategy §2.8):** profile & account settings, MFA, account
deletion (web parity), Privacy/Terms + other legal pages, contact/support, about. Legal copy is
not re-authored — the app opens the same live pages the web serves.

**Mobile (new):**
- `features/settings/screens/SettingsScreen.tsx` → hub: plan summary (server `/users/usage`),
  Account (Profile, Subscription — Phase 7 screen reused, Sign-in & security), Notifications
  (Phase 6 card reused), Legal & support, Sign out, Delete account.
- `account/screens/ProfileScreen.tsx` + `profileValidation.ts`: displayName (required), first/last
  name, company, phone, address; limits mirror the server; only changed, permitted fields are
  sent; email read-only; inline errors, saved/failed feedback, edits kept on failure.
- `account/reauth.ts` + `components/ReauthPanel.tsx`: re-authenticates the CURRENT Firebase
  user — password, Google sheet or Apple sheet (iOS) — then forces a fresh ID token (server checks
  `auth_time`). A credential for another account is rejected by Firebase (`auth/user-mismatch`).
  Apple-only accounts on Android get an honest "use an Apple device or the website" state.
  `googleSignIn.ts`/`appleSignIn.ts` refactored to expose the credential step (sign-in unchanged).
- `account/screens/SecurityScreen.tsx`: sign-in methods; password change only for email accounts
  (policy validation, confirm, re-auth, `PUT /users/change-password`; the server ends all sessions,
  so the app signs out with a clear message); Google/Apple: "password managed by …"; two-factor:
  status, setup (QR + manual key + "open authenticator", 6-digit verify, one-time recovery codes,
  fresh MFA assertion stored), disable with authenticator/recovery code.
- `legal/links.ts` + `legal/screens/LegalSupportScreen.tsx`: Privacy, Terms, Acceptable Use,
  Refund, Cookies, Security, About, FAQs, Contact form (routes verified in `frontend/src/App.jsx`),
  `support@flacronenterprises.com` (published on the web Contact/Privacy/Terms pages), app version
  + platform + non-production environment. Failed opens show the URL/address instead. Phase 7's
  disclosure links now come from the same module. EULA remains decision §10.23.
- `account/deletion.ts` + `screens/DeleteAccountScreen.tsx`: what is deleted vs. retained;
  subscription check from `/billing/status` (Stripe, App Store, Google Play; unknown status is
  treated as a warning, never "nothing to cancel"); "Manage subscription" for a same-device store
  subscription; acknowledgement checkbox when anything may keep billing; typed DELETE; provider
  re-auth; deletion; ONLY after the server confirms: `logout()` → push binding revocation, Firebase
  sign-out, MFA assertion cleared, pending report link cleared, drafts/photos/exports wiped. Final
  alert says which subscriptions are still active — never "cancelled". Retry/incomplete/offline →
  user stays signed in with a "safe to retry" message.
- Routes: `app/(app)/account/{profile,security,legal,delete}.tsx`. Shared `AccountScaffold`
  (keyboard-aware scroll, 640pt max-width column for tablets, back button), `SettingsRow` (≥52pt
  rows, labels/hints). API: `usersApi.changePassword/deleteAccount`, `authApi.mfaSetup/
  mfaVerifySetup/mfaDisable`; `ACCOUNT_DELETED` classified auth-fatal.

**Backend (authorized, web behaviour preserved):**
- `DELETE /users/account`: web password path unchanged; NEW path = recent sign-in (same 5-min
  `auth_time` rule as password change) + `confirmation: "DELETE"` — the only way Google/Apple
  accounts could ever delete. Team-owner block unchanged and checked before any change. Writes a
  `deletedAccounts/{uid}` tombstone first; locks the user's `storeSubscriptions` to the deleted owner
  (`ownerDeleted`, account token cleared); also deletes previously missed data (notifications,
  pushOutbox, reportDrafts, apiUsage, webhookEndpoints); tolerates an already-deleted Auth user;
  partial failure → `DELETE_ACCOUNT_INCOMPLETE` (retry-safe, no internals). Response reports
  `subscriptionsStillBilling {stripe, store}`. Retained (documented): audit logs, Stripe/store
  purchase + webhook records, sales leads, tombstone.
- No recreation of a deleted account: `authenticateToken` refuses a token whose user doc is
  missing AND tombstoned (`401 ACCOUNT_DELETED`; extra read only on that rare path); `GET
  /users/profile` never auto-creates over a tombstone; `PUT /users/profile` refuses; the
  notification unread counter now uses `update()` (a delayed report/billing notification can no
  longer create a stub user doc). Stripe/store paths already only update existing docs.
- Purchase ownership: a store purchase whose owner was deleted is no longer releasable — any other
  account gets `409 PURCHASE_LINKED_TO_DELETED_ACCOUNT` (Phase 7 test updated accordingly).
- `PUT /users/profile`: added upper bounds (phone 40, company 200, address 500).
- Firestore rules unchanged in substance; `deletedAccounts` is server-only (default deny) and is
  now covered by the emulator suite.

**Policy kept, not invented** *(SUPERSEDED 2026-10-07 — §10.26 approved: deletion now cancels
Stripe subscriptions; see the 2026-10-07 Stripe/Phase 9 entry)*: deleting an account does NOT cancel any subscription (unchanged web
behaviour). The app warns and links to store management; Stripe remains web-managed. Whether
deletion should block or cancel an active Stripe subscription is decision §10.26.

**Checks (actual):** backend `node --test --test-concurrency=1` 1363 / 1356 pass / 0 fail / 7
skipped (new `account-deletion.test.js` 8; store-billing ownership test updated); `eslint .` 0
errors (62 pre-existing warnings); `npm run test:rules` 5/5. Mobile `tsc --noEmit` 0; `expo lint`
clean; `jest --maxWorkers=1` 486/486 (47 suites; new: reauth, profileValidation, legal links,
deletion, DeleteAccountScreen); `expo export --max-workers 1` android ✔ (1579 modules) ios ✔ (1453).

**Deferred Android/iOS checks:** profile edit/save/offline; password change → signed out → new
password works; Google and Apple re-auth sheets (incl. cancel, wrong account); TOTP setup with a
real authenticator, recovery-code disable; each legal link + mailto (with/without a mail app);
deletion for email, Google and Apple accounts on both platforms (test accounts only), with an
active sandbox store subscription (warning + Manage), team-owner block, airplane-mode retry,
post-deletion: signed out, no drafts/cached files, push stops, the old account can't sign back in;
tablet layout, large text, VoiceOver/TalkBack.


### 2026-10-07 — Stripe cancellation at deletion + Phase 9 Testing & Hardening (static only)

Same worktree/branch (`fix/mobile-phase-5-gaps`); all Phase 5–8 work preserved. Nothing
committed/pushed/merged; no PR, deploy, rules deploy, EAS build, live config change, real Stripe
cancellation, real account deletion, purchase or push. Phase 10 not started.

**Task A — account deletion cancels Stripe subscriptions (approved behaviour, §10.26):**
- `backend/services/stripeAccountCancellation.js` (new): ownership only from our records — the
  user doc's `stripeCustomerId`/`stripeSubscriptionId`, or the tombstone's saved ids on a retry. A
  customer whose Stripe metadata names another uid → refused (`STRIPE_OWNERSHIP_MISMATCH`); a stored
  subscription belonging to neither a trusted customer nor this uid → never touched. Per customer:
  expire open Checkout Sessions, cancel `not_started` subscription schedules, cancel every
  subscription in `active|trialing|past_due|unpaid|incomplete|paused` with `invoice_now:false,
  prorate:false` and idempotency key `account-delete-<uid>-<sub>`; already-cancelled / missing =
  done (re-checked against Stripe). Then re-lists and fails unless nothing can bill. Paginated;
  every call has a timeout (15 s, `STRIPE_ACCOUNT_DELETE_TIMEOUT_MS`); timeout / network / 5xx →
  `uncertain`. No refund, credit-note, invoice or charge API is called anywhere.
- `DELETE /users/account` order: identity re-check → team-owner block → **deletion lease**
  (`users.accountDeletionLock`, 5 min, `utils/accountDeletionLock.js`; concurrent attempt → `409
  DELETE_IN_PROGRESS`) → **Stripe cancel + confirm** → tombstone (now also stores Stripe customer /
  subscription ids + cancellation result, for retries and the webhook backstop) → existing data
  deletion. Stripe not confirmed → `502 STRIPE_CANCELLATION_FAILED {retryable, outcomeUncertain}`,
  NOTHING deleted, lease released, account fully usable. Any later failure also releases the lease.
  Success response: `subscriptionsStillBilling.stripe:false`, `stripeSubscriptionsCancelled: n`.
- Re-activation guards (`routes/payment.js`, `routes/billing.js`): create-checkout-session,
  confirm-checkout, photo-pack-checkout, store account-token and store verify → `409
  ACCOUNT_DELETION_IN_PROGRESS` while leased or tombstoned (store verify also `finish:false`).
  `persistSubscription` refuses (inside its transaction) for a leased/tombstoned account. Webhooks
  (`checkout.session.completed`, `customer.subscription.updated`): mid-deletion → 500 without
  marking processed, so Stripe redelivers after the deletion settles; after deletion → the new
  subscription is cancelled (no refund/proration) and nothing is granted or recreated.
- Retained for audit: Stripe's own customer/invoice history (customer not deleted),
  `processedWebhooks`, store purchase records, audit logs (`account_self_delete_stripe_failed` added),
  tombstone with Stripe ids. Deleted accounts still can't be recreated (Phase 8 guards unchanged).
- **Outstanding-invoice limitation (documented, not changed):** open / past-due invoices are left
  exactly as they are (not voided, paid or refunded). Whether Stripe keeps retrying collection of an
  invoice whose subscription was cancelled depends on the Stripe account's Billing settings — ops
  should review (§10.28). A retry after the profile doc is already gone is still blocked by the
  Phase 8 `ACCOUNT_DELETED` auth guard (pre-existing; Stripe is always finished before that point).
- Messaging: mobile `deletion.ts` / `DeleteAccountScreen` — Stripe warning now says deletion
  cancels it immediately, plan ends, past payments not refunded; acknowledgement text adapts
  (Stripe / store / both); final alert claims Stripe cancellation only when the server reports
  `stripeSubscriptionsCancelled > 0`; `STRIPE_CANCELLATION_FAILED` / `DELETE_IN_PROGRESS` → "not
  deleted, safe to retry". App Store / Google Play copy + Manage link unchanged (never "cancelled").
  Web `Settings.jsx`: one sentence in the delete modal + the two new error codes surfaced (rest of
  web unchanged; Google/Apple web deletion still password-only, §10.27).
- Tests (mocked Stripe only): `account-deletion.test.js` +7 (multi-subscription incl. trialing/
  past_due/unpaid/ended + open checkout + pending schedule + other customer untouched; failure →
  nothing deleted + retry; timeout → uncertain + idempotent retry; still-active-after-cancel not
  confirmed; ownership mismatch / foreign stored subscription; lease held vs expired; tombstone-id
  retry); new `account-deletion-billing-guards.test.js` 6 (checkout/confirm/photo-pack blocked,
  normal checkout unchanged, mid-deletion webhook redelivered, post-deletion completed/updated
  webhooks cancel, released lease grants normally); mobile deletion + screen tests updated/added.

**Phase 9 — static testing & hardening (no devices):**
- Account isolation: `AuthProvider` — a profile response that started under an earlier Firebase
  session (sign-out / account switch) could overwrite the new account's profile (and stay if the new
  fetch failed). Fixed with an auth-generation guard; regression test fails without the fix.
- Interrupted navigation / deep links: `useReportDetail`, `useReportComments`, `useReportPhotos`,
  `useReportVersions` applied late responses for a previous report id when the route id changed on
  the same screen (deep link / notification tap); `useReportVersions` never reloaded for a new id.
  Fixed via `hooks/useActiveId.ts`; regression tests (detail one verified failing without the fix).
- Accessibility: 5 text links/buttons without a role (login "Forgot password?" / "Sign up", sign-up
  "Sign in", forgot-password "Back", wizard "Use today's date") → roles, label, hitSlop.
- Reviewed, no defect found: route guards + pending deep-link capture (validated ids, in-memory,
  cleared on sign-out), report-id URL encoding, polling/timer cleanup (detail, auth retry,
  verify-email cooldown, sign-out tasks), Firestore users-doc allowlist (emulator suite now also
  asserts `accountDeletionLock` is client-immutable).
- Dependencies: `expo install --check` → 7 patch-level drifts in SDK 57 (expo 57.0.22→~57.0.27,
  expo-constants, expo-image-picker, expo-linking, expo-notifications, expo-router, expo-sharing).
  `expo install --fix` failed (npm child process crashed, 0xC0000409, Node v25.2.1 — no LTS Node on
  this machine); `package.json` restored, nothing changed (§6). expo-doctor's other failures were
  the same npm crash + network; schema check needs network.
- **Still pending (device/runtime):** device/OS matrix (phone + tablet, recent iOS + Android),
  full auth matrix on devices, poor-network/airplane-mode uploads, export/share sheets per platform,
  TalkBack/VoiceOver + large text, crash/error reporting (no SDK chosen — decision), sandbox
  purchases, real push, credentials, deployment (incl. rules deploy), store setup, and a Stripe
  **test-mode** deletion run against a real Stripe sandbox.

**Checks (actual):** backend `node --test --test-concurrency=1` 1376 / 1369 pass / 0 fail / 7
skipped; `eslint .` 0 errors (62 pre-existing warnings); rules emulator 5/5. Mobile `tsc --noEmit`
0; `expo lint` clean; `jest --maxWorkers=1` 495/495 (48 suites); `expo export --max-workers 1`
android ✔ ios ✔. Web: `Settings.jsx` eslint clean (run with the main checkout's frontend tooling —
this worktree has no `frontend/node_modules`). Mocked tests and bundle exports are NOT device
verification.


### 2026-10-07 — Phase 10 — Store Preparation & Release Readiness (local preparation; NOT complete)

Same worktree/branch (`fix/mobile-phase-5-gaps`); all Phase 5–9 work preserved, still uncommitted.
Nothing committed/pushed/merged; no PR, production deploy, rules deploy, store-console change,
EAS environment/credential change, submission, push, purchase or account deletion.

**Environment / access found:** Windows 10, 8 GB RAM (~0.5 GB free — the cause of every npm/jest
crash), no Android SDK/ADB/emulator, no physical device connection, no macOS (no iOS simulator or
local iOS build). EAS: signed in as `laibanoreen` (Admin of `flacron-enterprises-llc`). GitHub CLI
signed in. **Not available:** Firebase CLI login, AWS CLI/credentials, Google Cloud, App Store
Connect, Play Console, Apple Developer. Stripe CLI installed (not used — no test-mode run without a
backend reachable by a device). The worktree has no `backend/.env` (intentionally not created).

**1. Build blockers:** Node 24.21.0 LTS portable (see §6 resolution); 7 Expo patch drifts fixed;
`expo-doctor` 21/21; `expo install --check` clean.

**2. Recoverable account deletion (code gap closed):**
- Gap 1: once `users/{uid}` was deleted, a later failure (Auth `deleteUser`, final tombstone update)
  could never be retried — every request from that account gets `401 ACCOUNT_DELETED`. The old test
  named "a retry finishes safely" never actually retried; it now proves the user retry is refused
  AND that the server finishes the deletion.
- Gap 2: `deletePrefix` swallowed Storage errors, so a failed photo/export wipe was still marked
  `completed: true`. Now `strict` for deletion → the deletion stays incomplete instead.
- `backend/services/accountDeletionCleanup.js` (new): `purgeAccountData()` = the former steps 3–6,
  idempotent (also skips already-locked store purchases), used by `DELETE /users/account`; plus a
  sweeper started in `server.js` that finishes tombstones still `completed:false` after 10 min
  (longer than the 5-min deletion lease so it never races a user retry), with a transactional
  per-tombstone lease (safe on every ECS task), max 20 attempts, and only an error **code** stored
  (`lastSweepError`). A tombstone exists only after Stripe cancellation was confirmed, so the
  sweeper never calls Stripe; the Stripe-before-deletion order and all Phase 9 guards are unchanged.
  Env (optional): `ACCOUNT_DELETION_SWEEP_ENABLED/_STALE_MS/_INTERVAL_MS` (in `.env.example`).
- Tests: retry test extended; new "storage failure keeps deletion incomplete" and "sweeper: error
  code only, attempt cap, skips completed". Outstanding invoices re-inspected — §10.28 unchanged.

**3. Release configuration:** Android notification icon (96×96 white FA silhouette from
`brand-mark.png`, wired in `expo-notifications`); `SYSTEM_ALERT_WINDOW` blocked; unused generic
Face ID string removed (`expo-secure-store` `faceIDPermission:false`); verified via resolved config
that `RECORD_AUDIO` is removed and legacy storage is capped at SDK 32; `eas.json` `submit.production`
(Android internal track as draft, iOS default). App icon validated 1024² opaque.
**Release blocker found:** EAS `preview`/`production` environments have no Firebase/Google config
(§10.29).

**4. Store materials:** `mobile/STORE_RELEASE_READINESS.md` — listing drafts from published web copy
(no stats/claims), URLs, permission table, App Privacy / Data safety table derived from code,
reviewer instructions draft, checklist, exact deployment/submission steps. **Screenshots NOT
produced** (no device; never mocked).

**5. Runtime verification:** none possible on a device. One private Android **development** build
was queued on EAS with `--non-interactive` (existing keystore reused; no credential created) as the
first native compile including `expo-iap` / `expo-notifications` — result in §8. A dev build is not
a store build and was not installed anywhere.

**Not done (precise):** every item in the Phase 5–9 "deferred device checks" lists; push delivery;
sandbox purchase/restore; Stripe test-mode deletion; tablet/accessibility/poor-network runs;
screenshots; store consoles; credentials (APNs, FCM V1, App Store API key, Play service account);
backend + rules deployment; internal-track/TestFlight build. Phase 10 completion criterion ("build
accepted into internal testing on both stores") is **not met**.


### 2026-10-07 — Phase 10 continuation (blockers, web deletion, local end-to-end; NOT device-verified)

Same worktree/branch, everything still uncommitted. No push/merge/PR, no production deploy, no rules
deploy, no store change, no real purchase/push/customer action.

**Build:** EAS Android development build `5df37167-d7c2-48f5-b785-606b86e374d1` FINISHED (artifact on
EAS) — the first native compile including `expo-iap`, `expo-notifications`, the notification icon and
the permission changes. Not installed on anything (no device).

**Access found:** EAS ✔ (Admin). Firebase CLI not logged in; no gcloud/AWS CLI; no Apple/Google
console access in this environment; Stripe CLI installed but **not logged in** (no test key);
ADB installed portably (`D:\tools\platform-tools`) — no device attached. No Android phone/cable
(client). iOS: no Mac → no simulator/local iOS build; an Apple Developer account alone gives no
runnable device.

**Configuration (approved):** the 8 existing `EXPO_PUBLIC_FIREBASE_*`/`EXPO_PUBLIC_GOOGLE_*` EAS
variables were attached to `preview` + `production` with `eas env:update` (values never read,
copied or printed). Single Firebase project `flacronai-c8dab` for all environments.
`EXPO_PUBLIC_API_BASE_URL`: production fixed in `eas.json`; preview has no staging backend (§10.34).

**Web (limited, authorized):** `frontend/src/utils/accountDeletion.js` (shared deletion method
detection, Google/Apple popup re-auth → forced fresh ID token → `{confirmation:'DELETE'}`; password
accounts keep the unchanged server-verified path; error mapping incl. `ACCOUNT_DELETED` →
signed-out, popup cancelled/blocked, wrong account, unsupported provider; shared deleted/kept lists
+ subscription warning); `Settings.jsx` modal uses it (provider-aware, kept-data link, store
subscription still-active notice); `api.js` `deleteAccount` accepts a body (string still = password);
public `pages/AccountDeletion.jsx` at `/account-deletion` (information only — no form, no lookup, no
API call; support address and "Privacy Request" route reused from the Privacy Policy), routed in
`App.jsx`, added to `sitemap.xml`. Tests: `src/__tests__/accountDeletion.test.js` (11).
**Policy discrepancy found (not changed):** Privacy Policy §5 says closed accounts are retained 90
days "to allow for recovery requests"; the implemented deletion is immediate with no recovery. The
new page states actual behaviour and links §5 for periods (§10.33).

**Rules-test flake — root cause + fix:** the failing assertion was the collection query
`getDocs(storeSubscriptions)`. Reproduced deterministically: with the client offline,
`getDocs` resolves from the local cache (0 docs, `fromCache=true`), so `assertFails` reported
"succeeded" — exactly the flake (host memory pressure stalled the emulator connection).
`getDocsFromServer` fails with `unavailable` instead. Spec now uses `getDocFromServer` /
`getDocsFromServer` everywhere; 3 consecutive runs 5/5.

**Local end-to-end (real, but NOT a device test):** this worktree's backend on the Firebase
Auth/Firestore/Storage emulators (`demo-` project, explicit `FIREBASE_EMULATOR` mode), AI keys only
from the main `.env` (approved), Stripe/SES/push/store disabled; disposable emulator users; a script
calling the mobile app's exact API contract. Run 1: 29/33 — 2 wrong expectations (Starter can't
export DOCX = correct plan gating; failed/duplicate photo rows are kept on the report by design),
1 expectation refined (a deleted Auth user's token gets `401 INVALID_TOKEN`, not `ACCOUNT_DELETED`
— still refused, profile not recreated), and **1 real defect**: re-submitting the same `draftId`
created a **second, photo-less report** (another report credit) because `POST /generate` deleted the
claimed draft right after claiming it. Fix: the claimed draft is kept (photo list cleared and
`reportId` recorded after the report is written), the claim is released if the request fails before
the report exists (retry keeps its photos), and staging into a used draft is refused (`409
DRAFT_ALREADY_USED`, also inside the transaction). Run 2: **36/36** — profile create/update/limits,
capacity, staging valid/duplicate/invalid-bytes/11 MB, resume, cross-account isolation (staged
photos, report, download), generate → real AI draft in ~80 s with cautious language, duplicate
generate 409, used-draft 409, thumbnail, comment, DRAFT-watermarked export, approve → finalized,
versions, clean PDF export + `%PDF` download, DOCX plan gate, deletion (confirmation required,
deleted, refused afterwards, data/Auth user gone, other account intact), and the **sweeper finishing a
seeded part-failed deletion**. Stripe test-mode deletion script prepared
(`stripe-deletion-e2e.js`, scratchpad) — blocked on a Stripe CLI login.

**Device/emulator:** none run. Local emulator assessed NOT feasible: CPU virtualization enabled in
firmware but no hypervisor active (needs Windows Hypervisor Platform or the AEHD driver — admin +
reboot, can affect other VMs); 7.7 GB RAM with ~0.8 GB physical and 0.8 GB commit free; an AVD needs
≥2 GB plus Metro/backend. Cloud options + recommendation in §10.35.

**Not run (still required):** every on-device check — login/Google/Apple/MFA/re-auth UI, camera/
library/permission denial, offline/reconnect, push delivery/taps, sandbox purchase/restore, Stripe
test-mode deletion, accessibility/tablet/performance, real-app screenshots; iOS anything.


### 2026-10-07 — Phase 10 session 3 (website-derived decisions; runtime work blocked by host memory)

**Host blocker:** Windows commit charge exhausted (18.9 of 19.2 GB committed while all processes
together hold ~8.4 GB private) — the Firestore/Storage emulator JVMs, the Stripe CLI (Node) and
`vite build` all die with out-of-memory. Not fixable from here; needs a Windows restart. Stripe CLI
login is stored in the OS credential store (not `config.toml`), so the launcher must obtain the test
key through the CLI after the restart.

**Website as source of truth (done, see `STORE_RELEASE_READINESS.md` §1a):** prices (Professional
$39.99/mo, Agency $99.99/mo, annual −20% = $383.88 / $959.88 per year), Enterprise "Talk to Sales"
(not in-app), no free trial, refunds non-refundable with discretionary exceptions, **"we do not pursue
collection of the unpaid amount"** (Refund Policy §5), admin `adminTier` source, photo packs web-only.
App shows store-localized prices only; no external purchase links/CTAs (checked).

**Deletion/privacy mismatch (resolved as "unsupported statement"):** no requirement for recovery; the
client explicitly deferred automated retention/expiry on 2026-07-22. Privacy §5 (90-day recovery,
3-year report expiry, 90-day photo purge), Security page (90-day audit logs) and the Refund Policy's
visible "[CLIENT TO CONFIRM]" trial placeholder do not match the product. Exact corrections drafted in
`mobile/POLICY_CORRECTIONS_PROPOSED.md` — **not applied (legal change needs approval)**. The
`/account-deletion` page now states "Deleted accounts cannot be recovered" and links §5 only for
billing-record retention.

**EULA:** Terms lack app-store provisions → recommend Apple standard EULA + Terms/Privacy links.
**Reviewer account:** Starter account + `STORE_SANDBOX_TESTER_EMAILS` (no admin grant/bypass),
created on production after deployment. **Listing:** Business/Productivity, 4+/Everyone draft.

**Pending after restart:** Stripe test-mode deletion run (incl. outstanding-invoice inspection),
Expo plan/credit check for cloud testing, `vite build`, frontend tests for the edited page.


### 2026-10-07/08 — Phase 10 session 4 (policy applied, real Stripe sandbox, report deletion, cloud tests)

**Legal text (client-approved with adjustments, applied locally — NOT deployed):** Privacy §5 (client's
exact deletion paragraph; report/photo wording matched to verified behaviour; new "Records retained after
account deletion"; no backup claim), Security page audit-log sentence, Refund Policy app-store paragraph
and §6 "no free trial" (placeholder removed). Unresolved release values (not invented): backup retention,
audit-log retention period, contact-form retention period. Regression tests in
`frontend/src/__tests__/accountDeletion.test.js`. Page "Last updated" dates left for the client.

**Report deletion verified against the wording → 2 real defects fixed (`routes/reports.js`):** a single
permanent delete used `ref.delete()`, orphaning the `versions/` + `comments/` subcollections (full report
content); neither single nor bulk delete removed supporting documents. Now `recursiveDelete` + removal of
every Storage folder the report uses (its own folder and the wizard draft folder its photos live in).
Exports are per-user, not linked to reports → removed with the account (stated in the policy). Real-stack
E2E 42/42 (versions/comments/files gone after permanent delete; exports remain until account deletion;
nothing left after account deletion).

**Stripe — real sandbox run (disposable, unclaimed sandbox `flacron-e2e-disposable` CLI profile; the
client's Flacron sandbox login is untouched):** 19/19 — active + incomplete subscriptions stopped,
not-started schedule cancelled, open checkout expired, no refund / credit note / proration / new invoice,
customer history kept, late `customer.subscription.updated` for the deleted uid cancelled by the webhook
backstop (real `stripe listen` delivery) without recreating the account; ownership-mismatch → `502
STRIPE_CANCELLATION_FAILED`, NOTHING deleted, subscription untouched; retry after fix succeeds. Audit fix:
`stripeCancellation.confirmedAt` now records the confirmation time (was the request start). Outstanding
invoice: the incomplete subscription's open first invoice became **void** when Stripe expired it (Stripe's
own behaviour); a past-due *renewal* invoice could not be produced — test clocks are not available to an
unclaimed sandbox key (§10.28 stays open for that case). Incident: the sandbox key's `rkcs_test_` prefix
escaped the output redaction once (test-mode, throwaway sandbox, expires 2026-10-14, do not claim);
redaction widened to any `*_test_`/`*_live_` key.

**Web build:** `vite build` ✔ (13.8 s) once host memory was freed; frontend 34 files / 330 tests ✔.

**Cloud device testing (client-approved, $0 cap):** Expo org = Free plan, no payment method, 30 builds/
month. EAS Workflows `maestro` jobs require a paid plan → used **custom EAS Builds** instead
(`mobile/.eas/build/e2e-maestro*.yml`: build → emulator/simulator → Maestro → artifacts), counted as
normal free builds. Test backend: this worktree's backend on local Firebase Auth/Firestore/Storage
emulators (client chose fully-local auth) + Stripe disposable sandbox + approved AI key, exposed only via
two temporary Cloudflare quick tunnels (random URLs baked into the `e2e` build profile; removed after).
App change: dev-build-only Auth-emulator hook (`src/config/authEmulator.ts`, ignored by preview/
production; unit-tested). EAS confirmed the e2e profile's demo Firebase values override the EAS
environment's real ones. Packaging fix: repo-root `.easignore` (EAS ignored `.eas/build/` via the
root `build/` rule) — verified archive contains no env/secret/credential files or node_modules.

**Cloud device runs — ACTUAL results (EAS free tier, $0; Android 34 emulator on a Workflows custom job
`linux-medium-nested-virtualization` reusing the e2e APK — custom *builds* cannot boot an emulator
("requires nested virtualization"); iOS 26.5 iPhone 17 simulator inside custom EAS builds — iOS
simulator build compiles + installs with no Apple credentials):**
- PASSED on Android: sign-in through the emulator-backed backend; dashboard; wizard steps 1–3 (claim,
  property, loss details incl. "Use today's date"); library photo picked; **account isolation** (second
  account sees "No reports yet" / "No reports found", not the first account's report); profile edit +
  save reached the server (`PUT /users/profile` 200).
- PASSED on iOS: install/launch; sign-in (after dismissing iOS's own "Save Password?" sheet); dashboard;
  wizard steps 1–3; library photo picked from the multi-select PHPicker; isolation check "No reports yet".
- **Defect found + fixed:** Profile's "Profile saved." / error notice rendered at the top of the form,
  scrolled out of view when the user taps Save at the bottom → moved next to the button
  (`ProfileScreen.tsx`). Not yet re-verified on a device (tunnel loss, below).
- **Open, NOT resolved:** the photo upload (`POST /reports/photos/stage`) failed on BOTH platforms with
  "Unable to reach the server" and never reached the backend (Express logs every request incl. aborted
  ones; cloudflared logged no origin errors), while JSON GET/POST/PUT requests over the same tunnel
  succeeded. The same endpoint passes the real local API E2E (42/42). Most likely the Cloudflare quick
  tunnel/edge path for multipart uploads, but not proven — the reproduction (`curl` multipart through a
  fresh tunnel) and the device logcat capture (dev-env-only `[api] network error` log added to
  `client.ts`, tested) could not run because Cloudflare's quick-tunnel service evicted both tunnels
  (~10:43 UTC, "Tunnel not found") and then refused new ones for >6 min. Everything after the upload
  (generate, review/approve, export/share, in-app deletion) is therefore NOT device-verified.
- Flow fixes (test-only): return key instead of `hideKeyboard` (on iOS it tapped "Sign in"); label vs
  input index for duplicated a11y labels; picker selectors from real screenshots; absolute artifact
  paths; `yes | sdkmanager` SIGPIPE.
- Usage: ~25 of 60 free CI minutes; 6 Android + 5 iOS free builds this month; $0 billed.
- **Cleanup done (verified):** tunnels, backend, emulators (no export → all disposable emulator
  accounts/data destroyed), webhook forwarder stopped; tunnel URLs removed from `eas.json` (e2e profile
  kept with demo values only); temporary workflow deleted; emulator passwords in `.maestro/` replaced by
  `${E2E_PASSWORD_*}` placeholders; `.whsec`, test-user file and the disposable Stripe CLI profile
  deleted. The unclaimed Stripe sandbox expires 2026-10-14 (do not claim).
- Checks after fixes: mobile `tsc` 0, `expo lint` clean, jest 498/498 (49 suites); backend 1379 / 1372 /
  0 fail / 7 skipped; frontend 330/330 + `vite build` ✔.


### 2026-10-08 — Phase 10 session 5 (upload root cause, launch-time test config, device results)

**Photo-upload failure — ROOT CAUSE FOUND + FIXED (app defect):** not Cloudflare (a Node multipart upload
through a fresh tunnel returned 201). Expo SDK 57 replaces the global `fetch` with `expo/fetch`
(`expo/src/winter/runtime.native.ts`), whose multipart encoder rejects React Native `{uri,name,type}`
parts ("Unsupported FormDataPart implementation") before sending; the client reported it as "Unable to
reach the server". Fix: `reportsApi` `toUploadPart()` sends `{name, type, bytes()}` read via
expo-file-system (`services/api/reports.ts`) — covers photo staging, generate images and documents.
Regression test runs Expo's REAL encoder (`uploadPart.test.ts`: new part encodes with filename/MIME/
bytes; the old RN part throws). Dev-env-only network-error logging kept in `client.ts` (tested).

**Launch-time test endpoints (test build only):** quick tunnels lived 104 / 40 min — shorter than a free
EAS build — so the `e2e` build now reads API + Auth-emulator origins from
`flacronai://e2e-config?api=…&auth=…` before Firebase/API init (`config/e2eRuntimeConfig.ts`,
`e2eOverride.ts`, gate in `app/_layout.tsx`, `app/+native-intent.tsx` rewrite). Doubly gated:
`EXPO_PUBLIC_APP_ENV=development` AND `EXPO_PUBLIC_E2E_RUNTIME_CONFIG=1` (set only by the `e2e` profile);
preview/production never read the link. Unit-tested (gate, parser, rewrite).

**ACTUAL cloud-device results (Android 34 emulator via Workflows nested-virtualization custom job; iOS
simulator via macOS custom job; local emulator-backed backend; disposable emulator users):**

| Flow | Android | iOS |
|---|---|---|
| Sign-in via launch link + Auth emulator | ✔ | ✔ (iOS "Open in FlacronAI?" + "Save Password?" handled) |
| Dashboard, wizard steps 1–4, library photo | ✔ | ✔ |
| **Photo upload** `POST /reports/photos/stage` 201 | ✔ | ✔ |
| **Generate** `POST /reports/generate` 201 → real AI draft (≈16–17k chars) → "Draft — needs review" | ✔ | ✔ |
| Approve sheet: incomplete details correctly blocked ("…are required") | ✔ | ✔ |
| **Approve & finalize** `POST /approve` 200 | ✔ | ✔ |
| **Export** `POST /export` 200 → authenticated PDF download 200 → share sheet | ✔ | ✔ |
| Account isolation (second account: "No reports yet" / "No reports found") | ✔ | ✔ |
| Profile edit + save `PUT /users/profile` 200 with **"Profile saved." visible next to the button** | ✔ (fix verified) | not reached |
| Delete-account screen: subscription check ("No active paid subscription was found"), DELETE typed, password | ✔ reached + filled | not reached |
| **In-app deletion submitted + signed out** | **NOT TESTED** | **NOT TESTED** |

The final deletion step was never executed: the last flow-2 runs were refused with "Free plan CI/CD 60
minute limit reached" (Expo blocked them — $0 billed; minutes reset 2026-11-01). Deletion itself is
verified at API level (real backend E2E 42/42 + real Stripe-sandbox run 19/19), not on a device.
Remaining device-run failures were all test-flow issues (keyboard covering sheet fields, iOS tab
labels, iOS password autofill, mangled em dash after a PowerShell rewrite, cosmetic Photos tab after the
share sheet) — fixed in `.maestro/`. One iOS run showed a blank screen after sign-in; the next iOS run's
failure screenshot showed "Invalid email or password" with an empty password field (autofill, fixed by
tapping the secure field directly); not reproduced afterwards.

**Not device-tested (need real devices/store setup):** push delivery/taps, store sandbox purchase/
restore, camera capture, permission denial, poor network, tablet layouts, VoiceOver/TalkBack.

**Backups / audit-log retention:** no backup configuration and no audit-log expiry exist in the repo;
whether Firestore PITR/scheduled backups or Storage versioning are enabled is a Google Cloud setting —
not verifiable without Firebase/GCP access (`firebase login`). Retention periods remain a business
decision; the Privacy Policy states none for these (by approval).

**Cleanup (verified):** tunnels/backend/emulators stopped (no export ⇒ all disposable emulator accounts
and data destroyed), temporary workflows deleted, flow passwords/link restored to `${…}` placeholders, test
user file deleted, disposable Stripe profile already removed; repo-root `.easignore` and the custom-build
configs removed and `mobile/.gitignore` restored byte-identical (the final approach does not need them).
Reusable templates + how-to: `mobile/e2e/`. Usage: 13 of 30 free builds, 60/60 free CI minutes, $0.

**Final checks:** mobile `tsc` 0, `expo lint` 0 warnings, jest 503/503 (51 suites), `expo export`
android ✔ (1584 modules) ios ✔ (1458); backend 1379 / 1372 / 0 fail / 7 skipped (no backend change this
session); frontend unchanged since 330/330 + `vite build` ✔.

### 2026-10-09 — Phase 10 session 6 (QA APK: staging backend prepared, awaiting approval)

**Access verified (read-only):** AWS SSO profile `flacron-qa` → account <staging AWS account>, role
DeveloperAccess (PowerUserAccess + others; no IAM role creation, `iam:PassRole` unconfirmed). Stripe CLI
→ "Flacron Enterprises LLC · sandbox", `livemode: false`. Access notes + restrictions saved to the
assistant's local memory (outside the repo; no credentials).
**Backend decision:** production `api.flacronai.com` lacks this branch (`/billing/*`,
`/notifications/*` → 404), so it is NOT used. Isolated staging scripted in `backend/deploy/staging/`
(README, `deploy-staging.sh`, `teardown-staging.sh`, `container.js`, `buildspec.yml`): ECS Express Mode,
own cluster/ECR/log group/secret, secrets only via Secrets Manager key refs, working-tree bundle checked for
`.env`/`node_modules` (dry run: 262 files, clean). **Nothing provisioned.**
**Findings:** (1) EAS `preview` env's `EXPO_PUBLIC_FIREBASE_*` are shared with production → the `qa` APK
needs staging Firebase values first; API URL has no silent fallback (startup throws). (2) Production task
definition carries secrets as plaintext env vars → recommend Secrets Manager (not changed). (3) The
existing Express gateway ALB is in VPC `vpc-0ede5cff24c3bf077` (used by another app); production runs in
the default VPC — sharing vs. new gateway ALB is an owner decision.
**Free-plan usage:** 13/30 builds, CI minutes exhausted until 2026-11-01, $0 billed. No push/merge/PR/deploy.
**Continuation (budget ≈ $41/mo approved):** design switched to **App Runner** (isolated HTTPS on
`*.awsapprunner.com`, ≈ $15/mo; an isolated ECS Express service would need its own ALB ≈ $51/mo).
Firebase CLI (the developer Google account) created project `flacronai-staging-qa` + Android app (3 SHAs copied
from the production app's registered certs) + Web app; Firestore deploy failed: billing disabled. IAM role
creation not permitted for DeveloperAccess. Added `boot.js` (secret JSON → env, smoke-tested),
`set-staging-secret.js` (hidden input, refuses live Stripe keys / non-staging service accounts),
`iam/*.json` (3 roles + scoped PassRole), `ACCESS_REQUEST.md`; deploy/teardown rewritten for App Runner;
`qa` profile → staging Firebase web config. Nothing provisioned in AWS yet.
**2026-10-10 update:** App Runner rejected after compatibility check (idle CPU throttling breaks post-response
generation + deletion sweeper; closed to new customers 2026-04-30). Redesigned as one EC2 t4g.small (Docker +
Caddy HTTPS, EIP, SSM, no SSH) — scripts: deploy/remote-deploy/pause/teardown/budget; IAM: one instance role +
scoped PassRole + cost-tag activation + optional least-privilege deployer policy, all inlined in
`backend/deploy/staging/ACCESS_REQUEST.md` (admin-ready). AWS ≈ $19/mo, AI ≈ $12–28/mo (Opus 4.8, 40 reports).
Owner invite for the client owner Google account not possible via Firebase CLI (no IAM command; no gcloud) → console step.
AWS `aws login` session expired (needs interactive re-login). Nothing provisioned; $0 spent.
**2026-10-10 feasibility audit (read-only):** App Runner closure confirmed (aws.amazon.com/apprunner: no new
customers from 2026-04-30; existing customers may still create services) — dropped for idle CPU throttling. EC2
design verified on paper: arm64 base-image index + caddy:2.10 + sharp arm64 prebuilt (lockfile); no local Docker build
(Docker absent). Found existing app risk: full-res photos (q92, no downscale) sent to Claude in 10-photo batches can
exceed request/image size limits — needs a separately approved fix. AI ≈ $0.40–0.47 per 10-photo report on Opus 4.8
(estimate, unmeasured). Added read-only `verify-staging-prereqs.sh`; ACCESS_REQUEST.md re-rendered with verified rates
(running ≈ $19 / stopped ≈ $5.70 / removed $0.40 AWS). Live AWS checks pending `aws login`.
**2026-10-11:** found restart gap (report stuck `processing`; Retry refuses ALREADY_PROCESSING) → proposed
patches (stale-processing recovery, vision downscale) in `backend/deploy/staging/proposed-patches/`, tested by temporary
apply: 35/35 related tests, 9.5 MB 4032×3024 photo → 2.3 MB 2576×1932; originals restored byte-identical; NOT applied.
Deploy fixes: SSM params via JSON file, first-boot wait, LF-only bundle/remote script (core.autocrlf=true here would
have shipped CRLF scripts). linux-arm64 `npm ci` resolution OK (404 pkgs, sharp arm64 prebuilt); real Docker build
impossible locally (no Docker/WSL distro). qa export scan clean; mobile tsc 0, lint 0, jest 503/503. Firestore
`(default)` nam5 exists (created 2026-10-09 by earlier attempt; no PITR). DNS: Hostinger, no CAA, name free.
**2026-10-11 (approved cost; provisioning started):** AWS verified (identity, role trust ec2-only, SSM core +
staging-scope attached, instance profile, scoped PassRole via dry-run RunInstances). Fixed Git-Bash path rewriting
(MSYS_NO_PATHCONV) + local-path conversion (cygpath) in staging scripts. Budget `flacronai-staging-qa` created
(ACTUAL $25/$50/$100 → rodrigue@); account is a linked member of org payer <org payer account> → cost-tag activation must
be confirmed there. **Applied** both fixes: pipeline lease (heartbeat 60 s, stale 10 min, transactional retry
claim, status-poll self-heal) and vision sizing (≤5 MB base64/image, ≤20 MB base64/batch, originals untouched);
new tests 12/12, backend 1391 (1384 pass/0 fail/7 skip). EAS precedence enforced: `build-guards/qaProfileGuard.js`
run from app.config.ts when FLACRON_BUILD_PROFILE=qa (fails `expo config` on any non-staging value — proven) +
`build-guards/verifyQaApk.js` artifact verifier; mobile tsc 0 / lint 0 / jest 509/509. Firestore rules deployed
to staging. **EC2 provisioned:** <staging EC2 instance> t4g.small arm64, EIP <staging EIP>, SSM Online; real arm64
image build 45 s / ~0.6 GB, sharp arm64 OK, awslogs OK, role reads staging secret only. Stripe sandbox webhook
we_1UPLFoKFLhrvSzkgTH4oAhOY → secret piped into Secrets Manager (an earlier attempt's orphan webhook deleted).
Secret still missing Firebase SA fields, STRIPE_SECRET_KEY, ANTHROPIC_API_KEY. App NOT deployed yet.


## 5. Decisions Log

- **2026-10-05 — Phase 6 push provider = Expo Push Service (CONFIRMED by the backend
  integration task instruction).** One token type/API for both platforms, works with the
  existing EAS project and the plain-`firebase` JS architecture. Provider code is isolated in
  `mobile/src/features/push/pushProvider.ts` and `backend/services/pushService.js`.
- **2026-09-05 — Backend infra correction:** documented as AWS ECR/ECS via GitHub Actions,
  not Render, based on `.github/workflows/deploy-backend.yml` and `backend/Dockerfile`.
  `backend/render.yaml` exists but is stale/legacy; left untouched (not a mobile concern).
- **2026-09-05 — Router root location:** `mobile/app/` (top-level), not `mobile/src/app/`
  (which is what the current default Expo template scaffolds by convention) — chosen to
  match the explicitly approved folder structure and for directness.
- **2026-09-05 — iOS icon format:** classic universal `icon.png`, not the new Xcode Icon
  Composer bundle the default template ships — no real multi-layer source asset exists;
  revisit in Phase 10 if desired as a polish item.
- **2026-09-05 — Brand asset generation:** rasterized from the existing vector
  `frontend/public/logo-mark.svg` via the `sharp` package already installed under
  `backend/node_modules` (read-only use, nothing added/changed in `backend/`), rather than
  upscaling the small 160×160 `logo-mark.png` or creating new artwork.
- **2026-09-05 — Runtime version policy:** `fingerprint` (current Expo-recommended
  default) — flagged as unvalidated until a real native/EAS Update build is attempted.
- **2026-09-08 — Reuse-strategy audit, cross-phase architecture facts confirmed by direct
  code inspection** (full detail and citations in
  [`WEB_TO_MOBILE_REUSE_STRATEGY.md`](./WEB_TO_MOBILE_REUSE_STRATEGY.md)):
  - The backend mounts identical routers under **both** `/api` (legacy) and `/api/v1`
    (`backend/server.js:169,189-194`) — Phase 4's "target `/api/v1` exclusively" scope is
    confirmed still accurate and available today, not aspirational.
  - Report review/approval/export/download already exist in full (`backend/routes/
    reports.js`), including comments/replies, version history, and two separate template
    systems — none of this was previously itemized in this file; Phase 5 scope should
    treat these as real reuse targets, not net-new backend work.
  - Push notifications have **zero** backend implementation today (no device-token
    storage, no FCM/APNs/Expo-push call sites) — Phase 6 is confirmed to require a genuine
    backend addition, not a client-only integration.
  - Entitlement enforcement (`requireTier`, `isReviewed()`, `canGenerate()`) is fully
    server-side today; mobile must consume it through the API exactly like web does, never
    re-derive an entitlement decision client-side (see reuse-strategy doc §5).
  - Brand tokens already ported into `mobile/src/theme/*` were re-verified against
    `frontend/tailwind.config.js`/`index.css` and found to match exactly — no drift found.
- **2026-09-08 — Environment validation lives in `src/config/env.ts` (app runtime code),
  not in `app.config.ts` (build config code).** `app.config.ts` was deliberately left
  unchanged: its own Phase 1 header comment scopes it to identity/build metadata only, and
  keeping environment-dependent logic out of it means `npx expo config --json` continues
  to resolve identifiers identically regardless of `EXPO_PUBLIC_*` values (verified in §8)
  — the app's confirmed identity never depends on which environment it's built for.
  Fail-fast validation is instead exercised the moment app code actually needs the API
  origin (Phase 4 onward), and was verified this phase by transpiling `env.ts` in
  isolation and running it under plain Node — see §8.
- **2026-09-08 — No `EXPO_PUBLIC_API_BASE_URL` value added to `eas.json` for preview/
  production.** Considered and rejected adding a placeholder string (even an obviously
  fake `.invalid` one) directly into the committed `eas.json`, since a future reader could
  mistake a committed value for a confirmed one. Instead, `eas.json` sets only
  `EXPO_PUBLIC_APP_ENV` per profile (a safe, non-secret, already-known value), and the API
  origin is documented as something to be supplied later via `eas env:create` once a real
  value is confirmed — never invented now.
- **2026-09-08 — `flacronai.com` directly confirmed NOT to be a reverse-proxied backend.**
  Three safe, unauthenticated `curl` GETs (`/api/v1`, `/api/`, `/health`) all returned the
  SPA's `text/html`, not backend JSON — see §4 Progress Log for full detail. This
  strengthens (does not contradict) the existing §2 infrastructure note and
  `WEB_TO_MOBILE_REUSE_STRATEGY.md` §2.2, which already flagged the production API origin
  as unconfirmed from static code inspection alone; this phase adds a live, empirical
  confirmation on top of that.
- **2026-09-08 (addendum) — Device/target detection stays out of `env.ts`; per-target
  values are documented, not auto-selected.** Considered importing `react-native`'s
  `Platform`/`expo-constants`'s `Constants.isDevice` to auto-pick a default per target
  (iOS Simulator vs. Android Emulator vs. physical device) and rejected it: it would
  require `env.ts` to depend on React Native, breaking its current property of being a
  plain, dependency-free module directly runnable/testable under Node (the same property
  that made this addendum's validation matrix possible to run in isolation — see §8). The
  simpler, equally correct fix is validating whatever URL is supplied and documenting the
  exact value per target in `mobile/README.md`, which also keeps the module usable for
  the same isolated-testing approach in future phases.
- **2026-09-08 (addendum) — Placeholder detection checks the parsed hostname for TLD
  patterns, not the raw URL string.** The first implementation anchored RFC 2606 TLD
  patterns (`.invalid`/`.example`/`.test`) to the end of the whole raw URL string, which
  can never match once a path like `/api/v1` follows the host — a real bug caught before
  it shipped, by testing `https://REPLACE_WITH_PRODUCTION_API_ORIGIN.invalid/api/v1`
  end-to-end rather than only unit-testing the regex in isolation. Fixed by parsing the
  URL first and checking TLD patterns against `parsed.hostname` specifically; free-form
  substring markers (`REPLACE_WITH`, `YOUR_...`, etc.) stay checked against the raw
  string since they can appear anywhere, not just as a TLD.
- **2026-09-08 — Recommended mobile auth strategy: mirror web's actual Firebase-SDK
  pattern, not the backend's unexercised REST `/auth/login`/`/auth/register` surface.**
  Full rationale and evidence in
  [`AUTHENTICATION_ARCHITECTURE.md`](./AUTHENTICATION_ARCHITECTURE.md) §1/§3/§4. In
  short: a repo-wide grep confirmed the web app's UI never calls those two endpoints (nor
  `/auth/logout`/`/auth/change-password`) — it authenticates directly via the Firebase
  Client SDK and only touches the backend for profile/MFA/audit concerns. Building
  mobile primarily on the unexercised REST path would mean debugging code with no
  production track record; mirroring the proven pattern is lower-risk and still fully
  satisfies "same accounts and data on web and mobile," since both clients end up
  presenting the same kind of Firebase ID token to the same backend verification path.
  **This is a recommendation pending approval, not a decision** — see phase tracker §10
  item 2 and the document's own §9.

---

## 6. Blockers Log

- **2026-10-05 — RESOLVED (same day) — Phase 6 backend push support.** Implemented under
  explicit authorization: device-token endpoints, `pushDevices` storage, Expo fan-out from
  `notifyUser()`, receipt processing — disabled by default (§4 "Phase 6 — backend
  integration").
- **2026-10-05 — OPEN — Phase 6 provider credentials (external setup).** Android: Firebase
  `google-services.json` for `com.flacronenterprises.flacronai` referenced via
  `android.googleServicesFile` + an FCM V1 service-account key uploaded to EAS. iOS: APNs key
  (Apple Developer account, Flacron Enterprises LLC) + the Push Notifications capability on the
  App ID, managed via EAS credentials. Not created/uploaded in this task. Also a 96×96
  monochrome Android notification icon (Phase 10).
- **2026-10-05 — OPEN — Phase 6 device verification deferred** until all phases are
  implemented (checklist in §4 "2026-10-05 — Phase 6").

- **2026-10-05 — OPEN — Phase 5 runtime verification (Android, then iOS) not performed.**
  Prerequisites: (a) a **new Android development build** — the only one
  (`6c609bb0-9d54-4134-ad4d-68ec9ba7c3df`) expired 2026-09-24 and predates the native modules
  Phases 4–5 added (netinfo, image-picker, file-system, sharing); running `eas build` needs
  explicit approval; (b) a physical Android device on the same LAN, or an emulator; (c) a
  `mobile/.env.local` in the working copy (this worktree has none → `ConfigRequiredScreen`);
  (d) the local backend reachable over LAN (firewall setup as in the Phase 3 entry); (e) the
  disposable test account, plus a second account and a reviewer grant to exercise
  isolation and review-response. iOS additionally needs a Mac + simulator, or an iPhone with
  Apple signing. Expo Go might run the email/password flows (the Google import is lazily
  guarded) — unconfirmed.
- **2026-10-05 — OPEN, non-blocking — `expo-doctor` 20/21: patch-version drift only.**
  `expo` 57.0.22→~57.0.26, `expo-constants` 57.0.18→~57.0.20, `expo-image-picker`
  57.0.18→~57.0.20, `expo-linking` 57.0.10→~57.0.11, `expo-router` 57.0.21→~57.0.24,
  `expo-sharing` 57.0.20→~57.0.22. These are newer SDK-57 patch releases published upstream
  (same SDK); no incompatibility was found (tsc, jest and both bundles pass), so this is not
  a confirmed necessary fix and was not applied (it would be a six-package lockfile bump).
  Recommended: run `npx expo install --fix` as its own approved step just before the new
  dev build, so the build includes them.

- **2026-09-08 — RESOLVED: Auth strategy recommendation approval.** Was: implementation
  blocked pending explicit sign-off on `AUTHENTICATION_ARCHITECTURE.md` §4's hybrid
  strategy. Resolved this same day, later session: the strategy was explicitly approved
  and implemented as written (see the Progress Log entry above and
  `AUTHENTICATION_ARCHITECTURE.md` §11.2). The deep-link/MFA-parity items from that
  document's §9 were resolved by direct task instruction rather than left open: use the
  existing web/hosted verification and password-reset behavior as-is (documented as a
  limitation, not worked around) instead of inventing a deep-link flow; implement the MFA
  challenge screen since the backend already supports it via the proven `/auth/mfa/verify`
  gate. "One account per email" (Firebase console setting) and "log out everywhere" remain
  genuinely open — see the two new blockers below.

- **2026-09-08 — OPEN, blocks Google/Apple sign-in from being functionally usable (does
  NOT block the rest of Phase 3, which is implemented) — Firebase/Google/Apple console and
  portal configuration.** Google Sign-In and Sign in with Apple are fully implemented and
  safely configuration-gated (never attempt a call without real config — verified by
  automated test) but cannot complete a real sign-in without: (1) this app's iOS/Android
  "app" registered against the existing `flacronai` Firebase project; (2) a Google OAuth
  client ID from Google Cloud/Firebase console; (3) the "Sign In with Apple" capability
  enabled on the App ID in the Apple Developer portal, plus the Apple provider configured
  in the Firebase console. None of this requires a code change once supplied — see
  `AUTHENTICATION_ARCHITECTURE.md` §11.8 for the exact, itemized list. **What's needed:**
  whoever has Firebase/Google Cloud/Apple Developer console access for this project.
  **PARTIALLY RESOLVED 2026-09-09 (Android, manually verified by client):** Android app
  "FlacronAI Mobile" confirmed already registered on the correct existing project
  `flacronai-c8dab`, package `com.flacronenterprises.flacronai` (matches `app.config.ts`
  exactly), with a SHA-1 fingerprint already attached and `google-services.json` available.
  Not downloaded/placed/committed this session. Read-only check (`eas build:list`) confirms
  zero EAS builds have ever run, so the attached SHA-1 is not an EAS-managed credential —
  its origin is unknown to this session. See `AUTHENTICATION_ARCHITECTURE.md` §11.8/§11.8a
  for the full cross-check and remaining Android steps, and §11.8b for the next iOS
  registration steps (not started).
  **FURTHER RESOLVED 2026-09-09 (same day, client's own manual console checks — Firebase
  CLI login was not used):** Email/Password provider confirmed enabled; Google provider
  confirmed enabled with an existing Web OAuth client ID (value not recorded here);
  account-linking confirmed set to "Link accounts that use the same email"; Apple
  "Sign In with Apple" capability on App ID `com.flacronenterprises.flacronai` was found
  **disabled** and the client manually enabled + saved it under the Flacron Enterprises LLC
  Apple team — no Services ID/key/credential created. No new resource of any kind created;
  Firebase ownership/members/roles unchanged. See
  `AUTHENTICATION_ARCHITECTURE.md` §11.8c for full detail.
  **FURTHER RESOLVED 2026-09-09 (same day, three more manual console checks):** iOS
  Firebase app confirmed **not** to exist yet; Google Cloud OAuth clients confirmed as
  Web + Android only (no iOS client yet); Apple Services ID confirmed **not** to exist yet;
  Firebase's Apple provider confirmed disabled/unconfigured. All three are creation-type
  gaps requiring explicit approval before any action — see
  `AUTHENTICATION_ARCHITECTURE.md` §11.8c for full detail and the pending-approval list.
  **APPROVED AND COMPLETED 2026-09-09 (same day) — iOS Firebase app registered** by the
  client: nickname `FlacronAI Mobile (iOS)`, bundle ID
  `com.flacronenterprises.flacronai`, in the existing `flacronai-c8dab` project.
  `GoogleService-Info.plist` downloaded to the client's own Downloads folder, outside the
  repo — not placed/committed. Existing Android/Web apps unchanged. See
  `AUTHENTICATION_ARCHITECTURE.md` §11.8d. Next: confirm iOS OAuth client auto-creation,
  populate `.env.local`, then begin the approved-to-start Apple Services ID setup (key
  creation and Firebase Apple provider enablement remain separately gated).
  **iOS OAuth client confirmed auto-created** (Web+Android+iOS all present in Google Cloud
  Credentials, no duplicate). **`mobile/.env.local` populated 2026-09-09** from the
  downloaded `GoogleService-Info.plist` (kept outside the repo — not required by the
  current JS-SDK architecture, confirmed against `app.config.ts`): bundle ID and project ID
  both verified matching; 6 required Firebase values written; nothing printed in full at
  any point (redacted/masked only). `.env.local` confirmed git-ignored and untracked;
  `.env.example` confirmed still placeholder-only. See
  `AUTHENTICATION_ARCHITECTURE.md` §11.8e. Next: Apple Services ID setup (approved to
  start only).
  **APPROVED AND COMPLETED 2026-09-09 (same day) — Apple Services ID created:**
  `com.flacronenterprises.flacronai.auth` ("FlacronAI Web Authentication") under the
  Flacron Enterprises LLC team (Team ID `YULB83U95Z`), verified available beforehand,
  review screen confirmed before registering, presence confirmed after. No private key,
  no other resource touched. See `AUTHENTICATION_ARCHITECTURE.md` §11.8f. Next: configure
  Sign in with Apple on this Services ID (Domains/Return URL, still no key, still no
  Firebase Apple provider change).
  **RESOLVED 2026-09-09 (same day) — Firebase Apple provider enabled**, Services ID/OAuth
  code flow correctly left blank after inspecting `appleSignIn.ts` and confirming the
  implementation is native-identity-token-exchange only (Services ID stays created but
  unused, reserved for a possible future web/Android Apple flow). No private key created.
  **Same-day code fix — Apple Sign-In anti-replay nonce**: that inspection surfaced a real
  gap, `rawNonce: undefined` (no nonce ever generated/sent). Fixed: `expo-crypto` added
  (`~57.0.2`), a fresh random nonce is now generated per attempt, its SHA-256 hash sent to
  Apple, the raw value sent to Firebase — matching Firebase's documented native-iOS pattern.
  5 new tests added (`appleSignIn.test.ts`), all passing; full suite 77/77; `tsc`/lint clean;
  `expo-doctor` 20/21 (1 pre-existing, unrelated `expo`/`expo-router` version-drift finding,
  untouched). See `AUTHENTICATION_ARCHITECTURE.md` §14 for full detail. `frontend`/`backend`
  confirmed untouched. Nothing committed, pushed, built; MFA enforcement untouched; Phase 4
  not started.
  **SAME DAY — Google Sign-In config-plugin wiring:** inspected `googleSignIn.ts`,
  `.env.example`, `app.config.ts`, and the installed google-signin package's own plugin
  source; confirmed Android does **not** need `google-services.json` for the chosen
  "without Firebase" plugin variant (client correctly not asked to download it). Added the
  plugin to `app.config.ts` with `iosUrlScheme` (from the plist's `REVERSED_CLIENT_ID`, a
  public identifier); populated `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in `.env.local` from the
  plist's `CLIENT_ID`. `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` still blank — not derivable
  locally, needs the client to supply it from Firebase Console. A mid-session encoding
  near-miss (a script corrupted `app.config.ts`'s existing em-dash characters) was caught
  and fully corrected before proceeding — see `AUTHENTICATION_ARCHITECTURE.md` §15 for full
  detail. `tsc`/jest(77/77)/lint/`expo config --json` all clean; `expo-doctor` 20/21 (same
  pre-existing unrelated finding). **Google Sign-In: not yet build-ready** — blocked only on
  the Web Client ID, plus the already-known EAS development-build + SHA-1-origin
  dependencies for actually testing it.
  **SAME DAY — Web OAuth client ID supplied from `google-services.json`:** client
  downloaded the existing Android `google-services.json` to Downloads (kept outside the
  repo, never copied in); parsed locally — project ID and package name both confirmed
  matching; the single `client_type: 3` (Web) OAuth client extracted into
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `.env.local`. Both required Google env values are
  now populated. Re-validated: `tsc`/lint/`expo config --json` clean, jest 77/77 unchanged,
  `expo-doctor` 20/21 (same pre-existing unrelated finding), git-ignore/untracked/
  frontend-backend checks all still clean. **Google Sign-In is now code/config
  build-ready; the only remaining Android blocker is the already-known EAS
  development-build + SHA dependency** (existing SHA-1's origin unknown, no EAS Android
  build/credential exists yet — §11.8 item 6/§15 unchanged). No credential generated, no
  build triggered.
  **2026-09-09/10 — EAS environment variables created + Expo/expo-router patch update
  applied (both approved actions).** 8 EAS "development"-environment variables created
  (Sensitive visibility) covering the 6 Firebase values + 2 Google client IDs — confirmed
  zero pre-existing/conflicting variables first; `EXPO_PUBLIC_APP_ENV`/
  `EXPO_PUBLIC_API_BASE_URL` deliberately excluded. `npx expo install expo expo-router`
  hit a transient network `ECONNRESET` on first attempt (already-known flaky-network
  condition), succeeded cleanly on retry: `expo@57.0.21`, `expo-router@57.0.20`.
  **`expo-doctor` now 21/21 — the patch-drift finding from earlier sessions is fully
  resolved.** Full validation (dependency check/doctor/`tsc`/lint/jest 77/77/resolved-config/
  EAS-var-list/git-ignore/secret-scan/`frontend`+`backend` untouched) all clean — see
  `AUTHENTICATION_ARCHITECTURE.md` §16 for the complete table and exact diff. No build
  triggered, no credential created, no fingerprint added, no tunnel started, nothing
  committed/pushed; MFA enforcement untouched; Phase 4 not started.
  **2026-09-10 — First Android EAS development build completed (client-approved).** Build
  `6c609bb0-9d54-4134-ad4d-68ec9ba7c3df`: FINISHED, INTERNAL distribution, `development`
  profile, owner `flacron-enterprises-llc` — confirmed via `eas build:view --json`, not
  assumed. New EAS-managed keystore generated (none existed before). First attempt failed
  pre-flight on a missing `expo-dev-client` dependency (installed, re-validated, retried
  successfully). Artifact expires 2026-09-24 — **14 days from creation, not 30**. Metro
  started in tunnel mode. Retrieving the keystore's SHA-1/SHA-256 via `eas credentials`
  requires a real terminal — confirmed this session's shell cannot provide one (hard TTY
  limitation, not a menu-choice problem) — handed to the client to run themselves. See
  `AUTHENTICATION_ARCHITECTURE.md` §17 for full detail. No second build triggered, no
  credential rotated, no Firebase fingerprint added yet, no commit/push/deploy, Phase 4
  not started.
  **2026-09-10 — SHA-1/SHA-256 obtained via direct APK certificate inspection (client-
  directed alternative to `eas credentials`).** No `keytool`/`apksigner` installed locally;
  this build has no v1/JAR signing (`META-INF/*.RSA` absent) so a small from-scratch parser
  read the APK Signing Block (v2) directly and extracted the X.509 cert, then `openssl
  x509 -fingerprint` produced: SHA-1 `F0:AB:78:0B:36:AA:57:15:2C:38:AB:A4:9C:97:07:C5:56:3A:16:C9`,
  SHA-256 `87:97:4B:B7:F2:48:21:3E:D6:9F:75:02:48:A8:9A:17:58:F3:42:C4:3E:42:6C:C8:D3:37:E3:53:3F:92:A0:B3`.
  Package/build association verified via the build record (`appIdentifier` +
  matching-timestamp cross-check), not the certificate itself. APK, extracted cert, and
  parser script all deleted from the local scratch folder after use — none ever entered
  the repo. See `AUTHENTICATION_ARCHITECTURE.md` §17 for the full method.

- **2026-09-10/11 — Direct LAN connection set up after public tunnels proved unreliable,
  full Android authentication matrix tested and passed, Phase 3 CLOSED.** Public tunnel
  services (`localtunnel`, ngrok, Cloudflare quick tunnels) were tried extensively and
  proved too unstable for a multi-step test (connections dying every 1-2 minutes, even
  with a self-healing watchdog script — which itself eventually hit a Windows/Git-Bash
  `fork: Resource temporarily unavailable` limit from the repeated restarts). Switched to a
  direct LAN connection instead: the client changed their home Wi-Fi network's profile from
  Public to Private, then added two narrowly-scoped firewall rules in an elevated PowerShell
  session (`FlacronAI-Dev-Backend-3000`, `FlacronAI-Dev-Metro-8081` — Direction=In,
  Profile=Private, RemoteIP=LocalSubnet, TCP, verified via `netsh advfirewall firewall show
  rule`). Backend (`app.listen(PORT)`, no host binding — already listens on all interfaces,
  no code change needed) and Metro (`--lan` mode) both verified reachable via the LAN IP.
  **Full Android runtime authentication matrix then passed**: signup, email verification,
  email/password login, session restoration, logout, forgot-password (with one account's
  transient Firebase-side throttling diagnosed and root-caused — not an app defect, see
  below), Google Sign-In, and MFA/TOTP (challenge appeared before Welcome screen, wrong
  code rejected, valid code accepted, login completed).
  **Forgot-password anomaly diagnosed (read-only, no code changed, no repeated live
  resends triggered):** one account failed every attempt at
  `admin.auth().generatePasswordResetLink()` (`INTERNAL ASSERT FAILED: Unable to create the
  email action link`, thrown *before* the app's SES send step) while other accounts
  succeeded in the same window; the Firebase user record was confirmed normally
  provisioned (verified, enabled, `password` provider); reproducing the identical call once
  in isolation succeeded immediately after — concluded as transient Firebase-side
  throttling from rapid repeated testing, not account-specific delivery/filtering and not
  an application defect.
  **Session closure:** Metro and backend stopped (ports confirmed free); the two firewall
  rules removed by the client in an elevated PowerShell session and confirmed gone by this
  session (`netsh advfirewall firewall show rule name="..."` → "No rules match the
  specified criteria" for both); `mobile/.env.local`'s API base URL restored to the
  confirmed local-dev default; final validation all clean (`tsc`/jest 77-77/lint/resolved-config)
  except a new, time-based `expo-doctor` patch-drift (12 packages, appeared naturally
  overnight, not caused by this session, out of scope for this closure). See
  `AUTHENTICATION_ARCHITECTURE.md` §18 for full detail. **Phase 3 is now CLOSED** for
  implementation, configuration, automated validation, and Android runtime validation.
  iOS/Apple runtime testing remains explicitly deferred (no iOS device/simulator
  available) — not claimed as validated. Nothing committed, pushed, built, deployed; MFA
  enforcement untouched (still disabled); Phase 4 not started.

- **2026-09-08 — RESOLVED (code): MFA is now enforced server-side, gated OFF in
  production.** Was: `authenticateToken` — the gate on every protected route — never
  checked `mfaEnabled` or any MFA-completion signal, so a valid Firebase ID token alone was
  sufficient regardless of whether the account's MFA challenge was ever completed
  (confirmed by direct code verification, true for web today too, not introduced by
  mobile). **Fixed this session, approved and implemented same day, rollout-safety-corrected
  the same day**: `authenticateToken` now requires a short-lived, backend-signed
  `X-MFA-Token` assertion for any `mfaEnabled` account, on every protected route except an
  explicit, minimal, exact-method+path bootstrap-exemption list — but only once
  `MFA_ENFORCEMENT_ENABLED=true` is set (defaults disabled; the very first version of this
  fix had no such flag, which a separation review correctly flagged as unsafe to deploy
  ahead of the frontend and had corrected same day). See `AUTHENTICATION_ARCHITECTURE.md`
  §12 for the full design, corrected `auth_time` claim, tests, and files touched, and §12.9
  for the exact activation procedure. Code is no longer a blocker; **enabling it in
  production is a distinct, later, explicit decision, not yet made.**

- **2026-09-08 — OPEN, external dependency (not a Phase 2 blocker) — Real production/
  preview backend API origin unresolved.** Exhaustively searched: `frontend/`'s API
  client and env files, `backend/server.js` route mounting, the AWS ECS GitHub Actions
  deploy workflow, `frontend/vercel.json`, and a repo-wide grep for any AWS/ALB/API-domain
  hint — none exists. Independently confirmed via a safe, unauthenticated public check
  that `https://flacronai.com` is not a reverse-proxied backend (see §4). **What's
  needed:** whoever manages the AWS ECS service's networking (an Application Load
  Balancer DNS name, or a custom domain pointed at one) needs to supply the real HTTPS
  origin. This does **not** block Phase 2 (the fail-fast environment mechanism is
  complete and correctly refuses to use an unsafe default) or Phase 3 (auth work can
  proceed against the confirmed local-dev origin) — it blocks only a real preview/
  production **build** from successfully resolving `EXPO_PUBLIC_API_BASE_URL`, which is
  the intended, safe behavior until a real value is supplied.

- **2026-09-05 — RESOLVED: EAS CLI authentication/ownership.** Was: not authenticated,
  blocking required ownership verification. Resolved this session via `npx eas-cli@latest
  login` (browser-based OAuth — no credentials touched by this assistant; the user
  completed login directly in their own browser). `whoami`/`project:info` now confirm
  user `laibanoreen`, owner `flacron-enterprises-llc`, slug `flacronai`, project ID
  `c8227fa0-8a62-4e51-8ccc-c8feb58d0466` — an exact match on all four required values, no
  mismatch, no new project created. See §1 for full detail. No longer a blocker.

- **Open recommendation (not a blocker) — No Node version manager installed; not on a
  supported LTS.** Checked for
  `nvm`, `fnm`, `volta`, and `n` — none are installed. Node is a single standalone system
  install at `C:\Program Files\nodejs\node.exe`, currently `v25.2.1` (a non-LTS "current"
  release). Since there is no version manager to safely scope a Node switch to this
  project alone, and installing one (or replacing the global Node) is a system-wide change
  outside this task's scope, **no installation was attempted** — per instruction, this is
  reported rather than acted on. **What you need to do** (pick one):
  - **Recommended — install `nvm-windows`** (lets you keep multiple Node versions and
    switch per-project/per-shell):
    1. Download and run the installer from
       `https://github.com/coreybutler/nvm-windows/releases` (`nvm-setup.exe`). It will
       detect and offer to migrate your existing Node install.
    2. Open a **new** terminal (PATH changes require a fresh shell), then:
       ```
       nvm install 22
       nvm use 22
       node -v   # should print v22.x.x
       ```
    3. Re-run this session's Task 1 dependency install once on Node 22 if you want that
       re-confirmed on the new version (it was already validated cleanly on Node 25 in
       this session — see §8).
  - **Alternative — `fnm`** (lighter-weight, does not touch the existing standalone
    install the way `nvm-windows` setup does):
    ```
    winget install Schniz.fnm
    ```
    then follow fnm's shell-init instructions for PowerShell (`fnm env --use-on-cd | Out-String | Invoke-Expression` added to your profile), open a new terminal, then:
    ```
    fnm install 22
    fnm use 22
    node -v   # should print v22.x.x
    ```
  - Either way, once on Node 22 LTS, `cd mobile && npm ci` should be re-run once and the
    result (package count, 0/nonzero errors) added to §8 by whoever runs it.

- **2026-09-16 — OPEN, blocks Phase 5's remaining runtime/end-to-end validation only (does
  NOT block Phase 5's implementation, which is complete) — no Android/iOS device, emulator,
  or browser-automation tool available in this environment.** Checked for `adb`, an
  `emulator` binary, and `$ANDROID_HOME`/`$ANDROID_SDK_ROOT` — none present; no physical
  device was connected; no browser-automation tool (for a web-platform substitute smoke
  test) was available to this session either. Phase 3 and Phase 4's own remaining runtime
  gaps were each closed by a follow-up session with either a real physical Android phone
  (Phase 3, via Expo Go/tunnel) or a locally-run backend/emulator (Phase 4). Phase 5 needs
  the same: run this branch via Expo Go (or a dev client) on a real Android device against a
  local backend, using the existing disposable test account, and exercise the full
  create → upload → review → approve → export loop. **What you need to do:** either connect
  a physical Android device (USB or the same Wi-Fi network as this machine, via Expo Go) or
  make an Android emulator available (Android Studio + an AVD, or a cloud device), then ask
  for this phase's runtime validation to be completed.

---

- **2026-10-07 — Expo SDK patch alignment blocked (Phase 9).** `expo install --check` reports 7
  patch-level drifts (expo ~57.0.27, expo-constants ~57.0.21, expo-image-picker ~57.0.20,
  expo-linking ~57.0.12, expo-notifications ~57.0.22, expo-router ~57.0.25, expo-sharing ~57.0.22).
  `expo install --fix` crashes inside npm (exit 0xC0000409) on Node v25.2.1; no LTS Node is
  installed here. Unblock: install Node 22/24 LTS, run `npx expo install --fix` in `mobile/`, then
  re-run tsc / jest / exports. Not a runtime blocker for static checks.
  **RESOLVED 2026-10-07 (Phase 10):** portable Node **v24.21.0 LTS** (SHA-256 verified) unpacked to
  `D:\tools\node-v24.21.0-win-x64` and used per-command via `PATH` only — the system Node 25 and
  other projects are untouched. `expo install --fix` still crashed (its spawned npm, exit 134,
  under host memory pressure — ~0.5 GB free of 8 GB), so the 7 SDK-expected versions were installed
  with one direct low-concurrency `npm install`. `expo install --check` → up to date;
  `expo-doctor` 21/21. The earlier doctor failures were subprocess crashes / network, not
  dependency problems. Use `export PATH="/d/tools/node-v24.21.0-win-x64:$PATH"` before mobile work.

## 7. Folder Structure

See the final report for the full rationale. Summary (updated Phase 5, 2026-09-16):

```
mobile/
  app/                    Expo Router routes only (thin — no business logic)
    login.tsx, signup.tsx, forgot-password.tsx, verify-email.tsx, mfa.tsx,
    account-unavailable.tsx    Auth screens (each just renders a features/auth/screens/*)
    (app)/                     Protected group (Stack.Protected-gated, see app/_layout.tsx)
      _layout.tsx              Bare Stack — hosts (tabs) plus the stack-pushed report/* below
      (tabs)/                  Phase 5 — Tabs navigator nested INSIDE (app), not top-level
                               (see §1: avoids an index-route path collision with app/index.tsx)
        _layout.tsx, dashboard.tsx, reports.tsx, settings.tsx
      report/                  Phase 5 — stack-pushed over the tabs, singular (not plural
                               "reports") specifically to avoid a route-path collision with
                               the (tabs)/reports.tsx list screen
        new.tsx                Generate-report wizard entry
        [id]/index.tsx         Report detail entry
      home.tsx removed Phase 5 — superseded by (tabs)/dashboard.tsx
  assets/images/          Brand-derived app icon, splash, adaptive-icon, favicon
  src/
    components/           Shared, reusable, presentational UI primitives
    config/                Environment/config resolution (env.ts, firebaseConfig.ts) — not
                           an API client, no side effects, fails fast on bad config
    features/
      auth/                Phase 3 — context (AuthProvider, authStatus), screens,
                           components, services (googleSignIn, appleSignIn), utils
                           (validation, errorMessages), types.ts, constants.ts
      reports/             Phase 5 — hooks/ (dashboard/list/detail/comments/versions/
                           photos/approval/export), components/ (ReportCard, StatusBadge,
                           StateMessage, SegmentedControl, ConfirmCheckbox), detail/
                           (Overview/Photos/Comments/Versions tabs, ApprovalSheet,
                           ExportSheet), wizard/ (pure reducer + types + storage +
                           useReportWizard + steps/ + components/), screens/ (Dashboard,
                           ReportsList, ReportDetail, GenerateWizard)
      photos/              Phase 5 — hooks/ (useImageCapture, useAuthenticatedPhoto),
                           utils/ (fileHelpers — PickedAsset → RNFile)
      settings/            Phase 5 — hooks/useProfile.ts, screens/SettingsScreen.tsx
    services/
      api/                 client.ts (auth header attach, retry contract), auth.ts,
                           users.ts, reports.ts, payment.ts, notifications.ts (Phase 4;
                           Phase 5 consumes these unchanged — no second HTTP client)
      firebase/             client.ts — Firebase app/auth initialization, RN persistence
    hooks/                 Shared custom hooks — still empty (no cross-feature hook yet;
                           Phase 5's hooks are feature-local, see features/*/hooks above)
    store/                 App-wide state — still not needed; AuthProvider (React Context)
                           covers session state, per the Phase 3 decision recorded in §5
    theme/                 Design tokens ported from frontend/tailwind.config.js
    types/                 Shared TypeScript types (api.ts, firebase-rn.d.ts, theme.ts)
    utils/                 Small stateless helpers shared across features
  jest.config.js, jest.setup.js   Added Phase 3 — see their own header comments
  app.config.ts, eas.json, package.json, tsconfig.json, eslint.config.js, .gitignore,
  .env.example, README.md, MOBILE_DEVELOPMENT_PHASES.md (this file),
  WEB_TO_MOBILE_REUSE_STRATEGY.md, AUTHENTICATION_ARCHITECTURE.md
```

---

## 8. Validation Log

All run 2026-09-05, from `mobile/`, on `feature/mobile-app-foundation`.

| Command | Result |
|---|---|
| `node -v` / `npm -v` | `v25.2.1` / `11.11.1` (see README "Prerequisites" — Node 25 is a non-LTS "current" release; an LTS 20.x/22.x is recommended for ongoing work, but nothing in this phase's validation actually failed because of it) |
| `npm install` | Clean install, 587 packages, 0 errors (14 moderate npm-audit advisories on transitive deps — pre-existing upstream, not introduced by any first-party code here; not investigated further in a foundation-only phase) |
| `npx expo install @expo-google-fonts/inter @expo-google-fonts/space-grotesk` | Added 2 packages at Expo-resolved compatible versions (`^0.4.2` / `^0.4.1`) |
| `npx expo install --check` | `Dependencies are up to date` |
| `npx expo-doctor` | `21/21 checks passed. No issues detected!` |
| `npx tsc --noEmit` | 0 errors |
| `npx expo lint` (first run) | Scaffolded `eslint.config.js` (`eslint-config-expo/flat`, current convention) automatically; found 1 real error: `react/no-unescaped-entities` in `app/+not-found.tsx` |
| `npx expo lint` (after fix) | 0 errors, 0 warnings |
| `npx expo config --json` (resolved config check) | Confirmed exact match on `name`, `slug`, `owner`, `version`, `scheme`, `orientation`, `ios.bundleIdentifier`, `ios.supportsTablet`, `android.package`, `android.adaptiveIcon`, `extra.eas.projectId` — see §2 table |
| `find mobile -name ".git"` | No nested `.git` found |
| `git status --porcelain frontend backend` | Empty — no changes to either directory |
| `git add --dry-run mobile` | 31 files would be tracked; manually reviewed — no secrets, credentials, `node_modules`, `.expo`, or build output among them |
| `git check-ignore -v mobile/node_modules mobile/.expo mobile/.env` | All three correctly matched by `.gitignore` |
| `git status` (final) | `mobile/` untracked (nothing staged, nothing committed) — see §11 |

### Re-validation — 2026-09-05 (this session, still on Node v25.2.1 / npm 11.11.1 pending the LTS switch above)

| Command | Result |
|---|---|
| `rm -rf node_modules && npm ci` | Clean install from the existing lockfile exactly, 822 packages, 0 errors |
| `npx expo install --check` | `Dependencies are up to date` |
| `npx expo-doctor` | `21/21 checks passed. No issues detected!` |
| `npx tsc --noEmit` | 0 errors |
| `npx expo lint` | 0 errors, 0 warnings |
| `npx expo config --json` (resolved config) | Exact match again on `name`, `slug`, `owner`, `version`, `scheme`, `orientation`, `ios.bundleIdentifier`, `ios.supportsTablet`, `android.package`, `extra.eas.projectId` |
| `find mobile -name ".git"` | No nested `.git` |
| `git add --dry-run mobile` | 31 files would be tracked; re-reviewed — no secrets/credentials/keystores/`node_modules`/`.expo` among them |
| `git status --porcelain frontend backend` | Empty — both untouched |
| `git status` (repo root) | Only `mobile/` untracked; nothing staged, nothing committed |

### EAS Authentication & Ownership Verification — 2026-09-05 (this session)

| Command | Result |
|---|---|
| `npx eas-cli@latest login` | Browser-based OAuth flow (prints a `https://expo.dev/login?...` URL, listens on a local `localhost` callback port) — completed by the user directly in their own browser. No credential was entered into, displayed by, or stored by this assistant or in any repo file. Output: `Logged in`. |
| `npx eas-cli@latest whoami` | `laibanoreen` (`laibanoreen7454@gmail.com`); accounts: `laibanoreen` (Owner), `flacron-enterprises-llc` (Admin) |
| `npx eas-cli@latest project:info` | `fullName: @flacron-enterprises-llc/flacronai`, `ID: c8227fa0-8a62-4e51-8ccc-c8feb58d0466` |
| Required-value match | user `laibanoreen` ✓ · owner `flacron-enterprises-llc` ✓ · slug `flacronai` ✓ · project ID `c8227fa0-8a62-4e51-8ccc-c8feb58d0466` ✓ — exact match, no mismatch, no new project created |
| `find "$HOME/.expo"` | Confirmed the auth token eas-cli stores (`state.json`) lives in the user's home directory, entirely outside `mobile/` and outside the repository |
| `git add --dry-run mobile` (re-run after login) | Still exactly 31 files, same list as before login — nothing new appeared in the repo as a result of the login flow |
| `git status` / `git status --porcelain frontend backend` (re-run after login) | Unchanged: only `mobile/` untracked as a whole; `frontend`/`backend` empty diff |

### Practical Runtime Device Test — 2026-09-05 (physical Android phone, Expo Go)

**Result: passed.** The foundation app was launched on a real physical Android phone via
Expo Go — the first actual on-device runtime validation of this phase, beyond static
checks (TypeScript/lint/doctor/config).

- **LAN mode blocked (network/firewall, not a code issue):** `npx expo start` (default LAN
  mode) started cleanly and Metro itself was healthy, but the phone could not connect.
  Root-caused directly on this machine, not guessed: `curl` to `localhost:8081` succeeded
  while `curl` to the same machine's own LAN IP (`192.168.1.7:8081`) was refused;
  `Get-NetConnectionProfile` showed the Wi-Fi adapter classified as a Windows **"Public"**
  network category, and `Get-NetFirewallRule -DisplayName "*node*"` returned no rule at
  all — i.e. Windows Firewall's default Public-profile policy was blocking inbound
  connections to Node.js, with no allow-rule to override it. No firewall change was made
  (out of scope / a system-wide change); tunnel mode was used instead, per the approved
  fallback plan.
- **Tunnel mode — used successfully as the safe fallback:** `npx expo start --tunnel`
  (required adding `@expo/ngrok` as a `mobile`-scoped devDependency the first time, since
  it wasn't already installed and the CLI's install prompt can't run non-interactively —
  see the dependency note below). Verified the tunnel was genuinely live before involving
  the phone: queried Metro's manifest locally to read the real assigned tunnel host
  (`wuevcrs-laibanoreen-8081.exp.direct`), then confirmed it independently with a direct
  external request to that host (`HTTP 200`, `packager-status:running`) before generating
  a QR code for it.
- **Device:** physical Android phone, real Wi-Fi network, Expo Go client, connected over
  the tunnel.
- **Visual/layout result (screenshot-confirmed):** FlacronAI branding, logo (the real
  vector-derived brand mark), title, and tagline all rendered correctly; text, logo,
  spacing, and the "Foundation build" badge all fit the screen; no horizontal overflow, no
  cutoff, no overlap; portrait orientation correct; the initial route (`app/index.tsx`)
  loaded correctly as the first screen shown.
- **No red error screen, no runtime exception, no Metro error, no bundling warning** was
  observed for the app's own code at any point in this test.
- **Metro recorded two successful Android bundles** for this test, both clean:
  ```
  Android Bundled 1441ms node_modules\expo-router\entry.js (1429 modules)
  Android Bundled 86ms node_modules\expo-router\entry.js (1 module)
  ```
  (An earlier LAN-mode attempt, before the firewall issue was diagnosed, also bundled
  cleanly once at 29756ms/1453 modules — that server was later stopped once tunnel mode
  replaced it.)
- **Reload behavior — classified as development-tool/tunnel behavior, not an app
  defect:** using Expo Go's dev-menu "Reload" while connected over the tunnel returned the
  client to its manual URL-entry screen rather than reconnecting silently; re-entering the
  same tunnel URL reconnected successfully (the second bundle line above). Metro logged no
  error, warning, or failed request for this transition — nothing in the app's own code
  path failed. This matches a known characteristic of Expo Go's persistent WebSocket
  connection to Metro being carried over an ngrok tunnel (less stable than a LAN
  connection) rather than anything specific to this project. **No source code was
  changed** — the logs showed no reproducible code-level issue to fix, per instruction.
- **iOS runtime testing: pending/deferred.** No physical iOS device, macOS host, or
  authorized iOS simulator/testing environment was available in this session. This is
  recorded as genuinely untested at runtime, not assumed to pass. **Static iOS
  configuration remains validated** (from the earlier validation pass): `ios.bundleIdentifier:
  com.flacronenterprises.flacronai`, `ios.supportsTablet: true`, resolved correctly via
  `npx expo config --json`.
- **Tablet runtime testing: pending/deferred.** No physical tablet or tablet
  emulator/simulator was available in this session. **Tablet-support configuration
  remains validated**: `ios.supportsTablet: true` confirmed in resolved config; Android has
  no restrictive screen-size/orientation lock applied (by design — see `app.config.ts`
  comment), which is the correct foundation-level configuration state for tablet support,
  independent of runtime device testing.
- **Dependency note (config/tooling change made during this test):** `@expo/ngrok` was
  added as a `devDependency` in `mobile/package.json` (and its lockfile) — required
  purely to make `expo start --tunnel` function in this non-interactive environment; it
  is a CLI-time tunnel tool, not an app runtime dependency, and does not affect the app
  bundle. Re-ran the full validation suite after this change (see below) — all still
  passed.

#### Re-validation after the `@expo/ngrok` devDependency addition

| Command | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx expo lint` | 0 errors, 0 warnings |
| `npx expo-doctor` | 21/21 checks passed |
| `npx expo config --json` | Unchanged — exact match on all identifiers |
| `npm audit` | 15 moderate advisories (was 14) — the one new entry comes from `@expo/ngrok`'s own dependency tree (an old transitive `uuid`), same category as the existing findings in §12a (dev-tooling only, not shipped in the app, no non-breaking fix available). Not investigated further beyond that classification — consistent with §12a's existing "document and defer" handling. |

---

### Phase 2 validation — 2026-09-08, from `mobile/`, on `feature/mobile-initial-phases`

**Note (added by the same-day Phase 2 addendum below): row 5 in this table reflects
pre-addendum behavior and is now stale.** At the time this table was recorded,
`getApiBaseUrl()` accepted any non-localhost HTTPS URL for preview/production, including
an obvious placeholder like the `.invalid`-TLD one used below — that placeholder-shaped
value would now be correctly **rejected**. See "Phase 2 addendum validation" further down
for the corrected behavior and the full re-run test matrix. This row is kept as an
accurate historical record of what was tested at the time, not edited in place.

| Command | Result |
|---|---|
| `node -v` / `npm -v` | `v25.2.1` / `11.11.1` (unchanged from Phase 1; Node LTS switch remains an open recommendation, not a blocker) |
| `npx tsc --noEmit` | 0 errors |
| `npx expo lint` | 0 errors, 0 warnings |
| `npx expo-doctor` | 21/21 checks passed |
| `npx expo install --check` | Dependencies are up to date |
| `EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1 npx expo config --json` | Resolved identity confirmed unchanged: `name=FlacronAI`, `slug=flacronai`, `owner=flacron-enterprises-llc`, `version=1.0.0`, `scheme=flacronai`, `orientation=portrait`, `ios.bundleIdentifier=com.flacronenterprises.flacronai`, `ios.supportsTablet=true`, `android.package=com.flacronenterprises.flacronai`, `extra.eas.projectId=c8227fa0-8a62-4e51-8ccc-c8feb58d0466` |
| `EXPO_PUBLIC_APP_ENV=preview EXPO_PUBLIC_API_BASE_URL=https://REPLACE_WITH_PREVIEW_API_ORIGIN.invalid/api/v1 npx expo config --json` | Same identity, identical to development — confirms `app.config.ts` is environment-independent by design (a `.invalid` TLD placeholder was used deliberately — RFC 2606 reserved, guaranteed non-resolvable, unambiguously a placeholder, never a real-looking fabricated domain) |
| `EXPO_PUBLIC_APP_ENV=production EXPO_PUBLIC_API_BASE_URL=https://REPLACE_WITH_PRODUCTION_API_ORIGIN.invalid/api/v1 npx expo config --json` | Same identity again, identical to development/preview |
| **`env.ts` fail-fast validation (6 scenarios, run against a standalone-transpiled copy in an isolated Node process in the session scratch directory — not the repo, no test framework added):** | |
| 1. No env vars set at all → `getAppEnv()` | **Threw**: "Missing EXPO_PUBLIC_APP_ENV..." |
| 2. `APP_ENV=staging` (invalid value) → `getAppEnv()` | **Threw**: "Invalid EXPO_PUBLIC_APP_ENV \"staging\"..." |
| 3. `APP_ENV=production`, no `API_BASE_URL` → `getApiBaseUrl()` | **Threw**: "Missing EXPO_PUBLIC_API_BASE_URL for the \"production\" environment..." — no silent fallback |
| 4. `APP_ENV=production`, `API_BASE_URL=http://localhost:3000/api/v1` → `getApiBaseUrl()` | **Threw**: "...set to a localhost address... Refusing to use a local address for a preview/production build" |
| 5. `APP_ENV=production`, `API_BASE_URL=https://REPLACE_WITH_PRODUCTION_API_ORIGIN.invalid/api/v1` → `getApiBaseUrl()` | **Succeeded**, returned the value unchanged — proves the mechanism isn't broken, only correctly gated on missing/unsafe input |
| 6. `APP_ENV=development`, no `API_BASE_URL` → `getApiBaseUrl()` | **Succeeded**, returned `http://localhost:3000/api/v1` (the confirmed local-dev default) — the one intentional, safe fallback |
| `git check-ignore -v mobile/.env mobile/.env.local mobile/node_modules mobile/.expo` | All four correctly matched by `.gitignore` |
| Secret/token/stale-domain/fabricated-domain scan of the full diff + new files | No matches (checked for AWS access-key patterns, PEM headers, Stripe live/test keys, inline password/secret assignments, `onrender.com`); the only two `api.flacronai.com` occurrences found are pre-existing historical-incident references, unchanged by this phase |
| `git diff --check` | Clean, no whitespace errors |
| `git status --porcelain frontend backend` | Empty — both untouched |
| `git status` (repo root) | 4 files modified (`mobile/.env.example`, `mobile/eas.json`, `mobile/MOBILE_DEVELOPMENT_PHASES.md`, `mobile/README.md`), 2 new (`mobile/src/config/`, already-carried-forward `mobile/WEB_TO_MOBILE_REUSE_STRATEGY.md`) — nothing staged, nothing committed |

### Phase 2 addendum validation — 2026-09-08, from `mobile/`, on `feature/mobile-initial-phases`

| Command | Result |
|---|---|
| `npx tsc --noEmit` (after the `env.ts` correction) | 0 errors |
| `npx expo lint` (after the `env.ts` correction) | 0 errors, 0 warnings |
| `npx expo config --json` (re-run, identifiers) | Unchanged — `name`, `slug`, `owner`, `version`, `scheme`, `ios.bundleIdentifier`, `android.package`, `extra.eas.projectId` all identical to the Phase 2 table above; `app.config.ts` was not touched by this addendum |
| **13 scenarios run against a freshly re-transpiled copy of the corrected `env.ts` in an isolated Node process (session scratch directory, not the repo):** | |
| **Development — per-target acceptance** | |
| 1. No override → `getApiBaseUrl()` | **Succeeded**, returned `http://localhost:3000/api/v1` — the documented iOS Simulator/Expo web default |
| 2. Explicit `http://localhost:3000/api/v1` | **Succeeded**, returned unchanged |
| 3. Explicit `http://10.0.2.2:3000/api/v1` (Android Emulator) | **Succeeded**, returned unchanged — HTTP correctly allowed for this recognized target |
| 4. Explicit `http://192.168.1.42:3000/api/v1` (physical-phone-style private LAN IP) | **Succeeded**, returned unchanged — HTTP correctly allowed for a private LAN address |
| 5. Explicit `http://example.com/api/v1` (HTTP to a public host) | **Threw**: "...uses plain HTTP for a non-local host (\"example.com\")..." — correctly rejected |
| **Preview/production — strict rejection** | |
| 6. `production`, `https://localhost:3000/api/v1` | **Threw**: "...points at a localhost, emulator, or private LAN address..." |
| 7. `production`, `https://10.0.2.2/api/v1` | **Threw**: same — emulator alias correctly caught (new in this addendum; previously only bare `localhost`/`127.0.0.1` were rejected) |
| 8. `production`, `https://192.168.1.42/api/v1` | **Threw**: same — private LAN address correctly caught (new in this addendum) |
| 9. `production`, `https://REPLACE_WITH_PRODUCTION_API_ORIGIN.invalid/api/v1` | **Threw**: "...looks like a placeholder value..." — corrected behavior; this exact value was recorded as **accepted** in the pre-addendum table above, which is exactly the gap this addendum closes |
| 10. `production`, `https://your-domain.com/api/v1` (substring-based placeholder) | **Threw**: same placeholder message — confirms the free-form marker check works independently of the TLD check |
| 11. `production`, `http://real-public-host.com/api/v1` (HTTP, otherwise plausible) | **Threw**: "...must use HTTPS for the \"production\" environment..." — new explicit HTTPS check |
| 12. `production`, no value | **Threw**: "Missing EXPO_PUBLIC_API_BASE_URL for the \"production\" environment..." — unchanged from Phase 2 |
| **Acceptance — syntactically valid, generic HTTPS origin** | |
| 13. `production` and `preview`, `https://example.com/api/v1` | **Both succeeded**, returned the value unchanged — proves validation isn't over-broad: a real-shaped external HTTPS host is accepted without the code claiming or implying it is the actual FlacronAI API anywhere |
| `git check-ignore -v mobile/.env mobile/.env.local mobile/node_modules mobile/.expo` | All four still correctly matched by `.gitignore` |
| Secret/token/stale-domain scan of the full current diff + new files | No matches; confirmed no `console.*` call was added anywhere in `env.ts` (no environment value is ever logged, only thrown in `Error` messages) |
| `git diff --check` | Clean, no whitespace errors |
| `git status --porcelain frontend backend` | Empty — both untouched |
| `git status` (repo root) | Same 4 modified + 2 new paths as the Phase 2 table above (this addendum edited files already in that set — `mobile/src/config/env.ts`, `mobile/src/config/README.md`, `mobile/.env.example`, `mobile/README.md`, this file — no new path was added) |

### Phase 3 validation — 2026-09-08, from `mobile/`, on `feature/mobile-initial-phases`

Full narrative detail and per-requirement test-coverage breakdown:
[`AUTHENTICATION_ARCHITECTURE.md`](./AUTHENTICATION_ARCHITECTURE.md) §11.7. Summary table:

| Command | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx expo lint` | 0 errors, 0 warnings |
| `npx expo-doctor` | 21/21 checks passed |
| `npx expo install --check` | Dependencies up to date |
| `npx expo config --json` (development env) | Identity unchanged — `name`/`slug`/`owner`/`version`/`scheme`/`ios.bundleIdentifier`/`android.package`/`extra.eas.projectId` all match §2's confirmed table; `ios.usesAppleSignIn: true` newly present, as intended |
| `npx jest` | 6 suites / 59 tests, all passing — re-run 3× to rule out flakiness (stable each time) |
| `npx expo export --platform ios` | Clean, 1236 modules, 0 errors |
| `npx expo export --platform android` | Clean, 0 errors |
| Secret/credential scan (API-key/PEM/Stripe-style/AWS-key shapes, inline password/secret assignments) across the full diff + every new file | No matches |
| `git check-ignore -v mobile/.env mobile/.env.local mobile/node_modules mobile/.expo` | All four correctly matched by `.gitignore` |
| `find` for `google-services.json` / `GoogleService-Info.plist` / `*serviceAccount*` | None found — none created |
| `git diff --check` | Clean (only benign LF→CRLF notices) |
| `git status --porcelain frontend backend` | Empty — both untouched, checked repeatedly through the session |

**Not run this session (documented, not silently skipped):** an actual on-device/simulator
Expo Go walkthrough (blocked on the Firebase console registration dependency in §6, and on
not having a physical device/simulator attached to this session — unlike Phase 1's
physical-Android-phone test, which required the user's own device). `npx expo export` on
both platforms is the strongest available proxy performed instead — it compiles the real
production Metro/Hermes module graph (not a mocked test environment), so it does directly
verify the lazily-guarded Google Sign-In import path and the real Firebase RN-persistence
chain both resolve correctly in the actual bundler pipeline.

### Phase 4 validation — 2026-09-16, from a `feature/mobile-phase-4-api-integration` worktree

Full narrative detail: §4 Progress Log entry dated 2026-09-16. Summary table:

| Command | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx expo lint` | 0 errors, 0 warnings |
| `npx jest` | 150/150 passing, 14 suites (77 pre-existing Phase 3 tests unmodified and passing + 73 new) |
| `npx expo-doctor` | 20/21 — the one failure (`expo@57.0.22` vs. expected `~57.0.23`) is the pre-existing drift already recorded in the 2026-09-08 re-validation entry above; confirmed this phase's diff never touches the tracked `expo` version |
| `npx expo install --check` | Confirms the same single pre-existing drift, nothing else outdated |
| `npx expo config --json` (development env) | Resolves cleanly, all confirmed identifiers unchanged |
| Real local `backend/` instance (synthetic, locally-generated `.env` — never a real credential) + direct unauthenticated HTTP requests | `GET /` → 200 envelope as documented; `GET /api/v1/reports/dashboard-summary` → 401 `NO_AUTH`; `GET /api/v1/users/profile`, `/api/v1/payment/current-subscription`, `/api/v1/notifications` → 401 `NO_TOKEN`; bogus Bearer token → 401 `INVALID_TOKEN`; unknown route → 404 `NOT_FOUND` + `request_id` — all match this client's error classification exactly |
| Secret/credential scan across the full diff | No matches; synthetic `.env` deleted after use, was already `.gitignore`d, never staged |
| `git status --porcelain` (backend, frontend) | Empty — neither touched, only read |

**Completed same-day follow-up (2026-09-16):** the authenticated round trip above. Summary
(see §4 Progress Log's "authenticated real-backend round trip completed" entry for the
full table): signed in as the real disposable test account (genuine Firebase
`signInWithPassword`), sent the real ID token to `GET /users/profile`,
`GET /reports?limit=5`, `GET /reports/dashboard-summary`, `GET /notifications`,
`GET /payment/current-subscription` — all returned `503 PROFILE_LOOKUP_FAILED`, proving
real-token acceptance (never `401`) while correctly reflecting this session's
Firestore-incapable synthetic Admin credentials; an unauthenticated request still
correctly returned `401 NO_TOKEN`. **Not achieved, disclosed as a real limitation**: a
live `200` Firestore-backed response body and a live refresh-token exchange (Google
returned `INVALID_REFRESH_TOKEN`, likely an API-key restriction, not investigated
further) — both remain covered by mocked contract tests instead. No mutation beyond one
safe, pre-write-rejected validation check (`POST /reports/templates` with an empty name)
was performed; no payment/checkout/subscription/account/deletion/archive/approval/
generation call was made. All temporary credentials/scripts were deleted immediately
after use (confirmed via `git status --porcelain` — never tracked).

**Completed second same-day follow-up (2026-09-16): full authenticated data round trip via
local Firestore Emulator (not real cloud Firestore).** Full detail: §4 Progress Log's
"full authenticated data round trip via local Firestore Emulator" entry. Summary: no ADC/
approved dev backend was available (checked directly); installed a JDK (user-approved,
one-time) to run the Firestore Emulator as the documented fallback; pointed the same
synthetic-Admin-credentialed backend at it via `FIRESTORE_EMULATOR_HOST` (no backend
source change); seeded 3 disposable documents keyed to the real test account's uid. Every
required endpoint then returned a genuine `200` matching this client's typed models:
profile, reports list (seeded report present), dashboard summary, notifications list
(seeded notification present), payment subscription. A live refresh-token exchange still
failed (`INVALID_REFRESH_TOKEN`, unchanged, not a code defect); a temporary Jest-based
typed-client harness hit an unrelated Expo-internal fetch-polyfill issue, not pursued
further given the raw-HTTP shape match plus existing mocked-test coverage. All emulator
data (memory-only, discarded on stop), the synthetic `.env`, temporary scripts, the
temporary Jest test file, and the user's `.env.test.local` were deleted; backend +
emulator processes stopped, including two orphaned children from an earlier retry
(terminated by exact command-line match, not a blanket kill); confirmed via `netstat` that
ports 3000/8080/9150 are clear and via `git status --porcelain` that nothing leaked into
version control.

### Phase 5 validation — 2026-09-16, from a `feature/mobile-phase-5-core-dashboard` worktree
- `npx tsc --noEmit` → 0 errors.
- `npx expo lint` → 0 errors, 0 warnings (a handful of `react-hooks/set-state-in-effect` and
  `react-hooks/refs` violations from this phase's own new hooks were found and fixed —
  direct `setState`/ref-write calls at the top level of an effect body moved inside the
  effect's async closure instead).
- `npx jest` → 200/200 passing across 22 suites (150 pre-existing unchanged + 50 new across
  8 new suites: `wizardReducer`, `wizardStorage`, `useReportWizard`, `useImageCapture`,
  `fileHelpers`, `useReportsList`, `useReportApproval`, `useReportExport`).
- `npx expo-doctor` → 20/21 (the one failure is the pre-existing `expo` patch-version drift
  documented since Phase 1/4, confirmed unrelated — this phase never touched `expo`'s own
  version).
- `npx expo install --check` → same single pre-existing drift, nothing else.
- `npx expo config --json` → resolves cleanly; confirmed no `android.permissions` array is
  emitted (i.e. no `RECORD_AUDIO`) after setting `microphonePermission: false` in the
  `expo-image-picker` plugin config, since this app only ever captures still photos.
- `npx expo export --platform android` and `--platform ios` → both bundled successfully
  (1454 modules, no resolution/runtime-import errors); the temp export output was deleted
  immediately after.
- `git status --porcelain` scoped to `backend`/`frontend` → empty (neither touched); scoped
  to `mobile` → only the files this phase's own summary (§1) lists.
- **Not run this session:** any Android/iOS device or emulator command (`adb`, `emulator`,
  a dev-client/Expo Go install) — none was available; see the Blockers Log (§6) entry dated
  2026-09-16 for the exact tooling checked and what's needed to complete this validation.

### Phase 5 gap-closure validation — 2026-10-05, `fix/mobile-phase-5-gaps` worktree
- `npx tsc --noEmit` → 0 errors (baseline before changes: 0).
- `npx expo lint` → exit 0, no problems reported.
- `npx jest` → **290/290 passing, 29 suites** (baseline 200/200, 22 suites). New suites:
  `reportActions`, `reportsEvents`, `useReportDetail` (polling recovery / single timer / stop /
  retry analysis), `useReviewResponse`, `userDataLifecycle` (account isolation, sign-out wipe),
  `pendingDeepLink`, `useAuthenticatedPhoto` (fetch concurrency). Extended: wizard
  reducer/storage/hook (upload outcomes, capacity, HEIC, isolation, discard), `fileHelpers`,
  `client` (403/401 classification), `reports` (timeouts, capacity call), `useReportExport`.
- `EXPO_PUBLIC_APP_ENV=development npx expo export --platform android` and `--platform ios` →
  both exported successfully (output written to the session scratchpad, then deleted).
- `npx expo-doctor` → 20/21 (patch drift only, §6); `npx expo install --check` → same six.
- Secret/credential pattern scan over the mobile diff + new files → no matches;
  `git diff --check` → clean (LF/CRLF notices only); `git status` → changes confined to
  `mobile/`; no `dist/` or build output left behind.
- **Not run**: any Android/iOS device, emulator, simulator, dev client or Expo Go session, and
  no real-backend round trip. These are static/bundler checks, not runtime verification.

---

### Phase 10 continuation validation — 2026-10-07
- Backend `node --test --test-concurrency=1` 1379 / 1372 / 0 fail / 7 skipped (+1 claimed-draft test);
  `eslint .` 0 errors (62 pre-existing warnings); rules emulator 5/5 on 3 consecutive runs.
- Frontend (worktree, using the main checkout's `node_modules` via a temporary ignored junction):
  `vitest run` 33/34 files, 324 tests pass; the 34th file `apiMfaHeader` passes 4/4 when a dummy `VITE_FIREBASE_API_KEY` is
  set (the worktree has no `frontend/.env`; the suite fails to import Firebase without one —
  environmental, not a regression); new `accountDeletion.test.js` 11/11; eslint on touched files
  clean. **`vite build` NOT completed** — native out-of-memory on this host (3 attempts).
- Local API end-to-end (emulators, real AI, no Stripe): 36/36 (run 1: 29/33 → defect fixed).
- EAS Android development build `5df37167…` FINISHED.
- NOT performed: any device/emulator/simulator run, iOS build, Stripe test-mode run, push, purchase,
  deploy, rules deploy, store-console change.

### Phase 10 validation — 2026-10-07, same worktree, Node v24.21.0 LTS
- Mobile: `expo install --check` up to date; `expo-doctor` 21/21; `tsc --noEmit` 0; `expo lint`
  clean; `jest --maxWorkers=1` 495/495 (48 suites — 491 in the full run, where the OS killed one
  worker; that suite `useReportsList` re-run alone 4/4); `expo export --max-workers 1` android ✔
  (1580 modules) ios ✔ (1454); resolved production config re-checked (permissions, notification icon).
- Backend: `node --test --test-concurrency=1` 1378 / 1371 pass / 0 fail / 7 skipped; `eslint .` 0
  errors (62 pre-existing warnings, none in touched files); rules emulator: run 1 4/5 (one
  deny-by-default path unexpectedly allowed, under memory pressure — not reproduced, unexplained),
  runs 2 and 3 5/5.
- EAS Android development build `5df37167-d7c2-48f5-b785-606b86e374d1`: BUILD_RESULT_PENDING
- NOT performed: any device/emulator/simulator run, iOS build, store build, push, purchase, Stripe
  test-mode deletion, deploy, rules deploy, console/EAS-env/credential change.

### Stripe-at-deletion + Phase 9 validation — 2026-10-07, same worktree
- Backend serial `node --test`: 1376 / 1369 pass / 0 fail / 7 skipped; `eslint .` 0 errors (62
  pre-existing warnings); rules emulator 5/5.
- Mobile `tsc` 0; `expo lint` clean; `jest --maxWorkers=1` 495/495 (48 suites); `expo export
  --max-workers 1` android ✔ ios ✔. `expo install --check`: 7 patch drifts (fix blocked, §6).
- NOT performed: any device/simulator run, real Stripe cancellation, real account deletion,
  purchase, push, EAS build, deploy, rules deploy, console change.

### Phase 8 validation — 2026-10-07, same worktree
- Backend serial `node --test`: 1363 / 1356 pass / 0 fail / 7 skipped; `eslint .` 0 errors (62
  pre-existing warnings); rules emulator 5/5.
- Mobile `tsc` 0; `expo lint` clean; `jest --maxWorkers=1` 486/486 (47 suites); `expo export
  --max-workers 1` android ✔ ios ✔.
- NOT performed: any device/simulator run, real account deletion, purchase, push, EAS build,
  deploy, rules deploy, console change.

### Phase 6/7 gap-closure validation — 2026-10-05, same worktree
- Backend `node --test --test-concurrency=1`: 1355 / 1348 pass / 0 fail / 7 skipped (new/extended:
  `push-reliability.test.js` 6, `store-billing.test.js` 29, `store-billing-stripe-compat.test.js`
  9; push/notification suites updated for the eventId/bindingTag payload). `eslint .` 0 errors
  (62 pre-existing warnings).
- Rules: `npm run test:rules` (Firestore emulator, demo project) 5/5 on the new rules; the same
  suite against `git show HEAD:backend/firestore.rules` fails 2/5 (self-tier escalation allowed).
- Mobile `tsc --noEmit` 0; `expo lint` clean; `jest --maxWorkers=1` 453/453 (42 suites);
  `expo export --max-workers 1` android ✔ (1564 modules) ios ✔ (1438 modules).
- One read-only `GET https://api.flacronai.com/health` (+ one unauthenticated GET confirming
  `/api/v1/billing/status` is not deployed — 404). No other network call to production.
- NOT performed: device/simulator run, real push, sandbox/real purchase, EAS build, deploy, rules
  deploy, any console change.

### Phase 7 static validation — 2026-10-05, same worktree
- Backend `node --test --test-concurrency=1` (full suite): 1339 / 1332 pass / 0 fail / 7
  skipped (Phase 6 baseline + 28 new: `store-billing.test.js` 25, `store-billing-stripe-compat
  .test.js` 3). A parallel `npm test` run hit host out-of-memory crashes (not assertions); the
  serial run is the result of record. `eslint .` 0 errors (62 pre-existing warnings).
- Mobile `tsc --noEmit` 0; `expo lint` clean; `jest --maxWorkers=1` 436/436 (41 suites; 46 new
  in `src/features/billing`); `expo export --max-workers 1` android ✔ (1563 modules) ios ✔
  (1437 modules) — default-worker exports crashed in Hermes from host memory exhaustion, not
  code; `expo config --type introspect` lists the `expo-iap` plugin; `expo install --check`:
  `expo-iap` compatible, only the pre-existing patch drift (expo, expo-router, expo-linking,
  expo-image-picker, expo-sharing). `git diff --check` clean; secret scan clean.
- Store APIs, native billing and Pub/Sub are mocked in every test. Mocked tests do **not**
  prove billing works on a device.
- NOT performed: device/simulator run, sandbox/real purchase, EAS build, deploy, rules deploy,
  any App Store Connect / Play Console / AWS change.

### Phase 6 hardening validation — 2026-10-05, same worktree
- Backend `npm test` 1311 / 1304 pass / 0 fail / 7 skipped; push suites 32/32; eslint 0 errors.
- Mobile `tsc` 0; `expo lint` clean; `jest --maxWorkers=2` 390/390 (37 suites); `expo export`
  android ✔ ios ✔.
- NOT performed: device run, real push send, EAS build, deploy, any AWS/Expo config change.

### Phase 6 backend-integration validation — 2026-10-05, same worktree
- Backend `npm test` 1307 / 1300 pass / 0 fail / 7 skipped; push suites 28/28; eslint clean.
- Mobile `tsc` 0; `expo lint` clean; `jest --maxWorkers=2` 390/390; `expo export` android ✔ ios ✔.
- NOT performed: device run, real push send, EAS build, deploy, any AWS/Expo config change.

### Phase 6 static validation — 2026-10-05, `fix/mobile-phase-5-gaps` worktree
- `tsc --noEmit` 0 errors; `expo lint` clean; `jest` 386/386 (36 suites); `expo export`
  android ✔ ios ✔; `expo config --type introspect` — notification plugin applied (channel,
  color, `aps-environment` per profile); `expo-doctor` 20/21 (pre-existing patch drift).
- NOT performed: any device/emulator/simulator run, any real push send, any EAS build.

## 9. Environment Variables & Secrets Policy

- Only `EXPO_PUBLIC_*`-prefixed variables may be read by client code, and only for values
  safe to ship inside a public app binary (API base URL, environment name, public
  analytics/feature-flag keys if ever added).
- `mobile/.env.example` documents **names only**, never real values.
- Never place inside `mobile/`: Firebase **admin** credentials, backend secrets/API
  private keys, Apple credentials, Google credentials, signing certificates, provisioning
  profiles, keystores, service-account JSON files, or real `.env` files. (Firebase **client**
  config for a mobile "app" — e.g. an iOS/Android `GoogleService-Info.plist` /
  `google-services.json` — is not a *secret* the way an admin key is, but it is still a
  credential-like file and is git-ignored per policy below until Phase 3, when it will be
  supplied via each developer's local EAS/Firebase console access, never committed as a
  placeholder with fabricated content.)
- Real secret values live only in approved local `.env` files (git-ignored) or EAS secret
  storage — never in the repository, never in this documentation file.
- `mobile/.gitignore` explicitly excludes: `.env`, `.env.local`, `.env.*.local`,
  `google-services.json`, `GoogleService-Info.plist`, `*.keystore`, `*.jks`, `*.p8`,
  `*.p12`, `*.key`, `*.mobileprovision`, `*serviceAccount*.json`, plus standard build
  output (`.expo/`, `dist/`, `/ios`, `/android` generated-native-project output,
  `node_modules/`).
- **Enforced in code as of Phase 2:** `mobile/src/config/env.ts` only ever reads
  `EXPO_PUBLIC_APP_ENV`/`EXPO_PUBLIC_API_BASE_URL` and throws a clear error rather than
  silently defaulting a preview/production build to production infrastructure or to a
  local address. This is the first piece of app code to exist in `mobile/src/` beyond
  Phase 1's branded placeholder screen — see §7.

---

## 10. Pending Questions / Approvals Needed

1. **Real production API base URL** — could not be verified from the repository (see
   infrastructure note in §2), and as of 2026-09-08 is additionally confirmed NOT to be
   `https://flacronai.com` (direct, safe, unauthenticated check: `/api/v1`, `/api/`, and
   `/health` all return the SPA's HTML, not backend JSON — see §4 Phase 2 entry). No ALB
   DNS name, custom domain, or ECS task definition is committed anywhere in the
   repository. **What's needed:** the real HTTPS origin from whoever manages the AWS ECS
   service's networking. Needed before a real preview/production mobile build can resolve
   `EXPO_PUBLIC_API_BASE_URL` (`mobile/src/config/env.ts` intentionally throws until this
   is supplied) — does **not** block Phase 3, which can use the confirmed local-dev origin
   `http://localhost:3000/api/v1`.
   *(RESOLVED 2026-10-05: production API origin is `https://api.flacronai.com` — health check
   reports `environment: production`; set for the production EAS profile. Still open: what
   `preview` builds should use — production, or a staging API if one exists.)*
2. **RESOLVED 2026-09-08 — Auth client strategy: Firebase JS SDK with RN persistence,
   NOT the backend's REST `/api/v1/auth/register`+`/login` endpoints.** Approved and
   implemented exactly per `AUTHENTICATION_ARCHITECTURE.md` §4's recommendation — see that
   document's §11.2 and this file's §4 Progress Log entry dated 2026-09-08 for
   implementation detail.
3. **RESOLVED 2026-09-08 — MFA parity for v1: shipped**, via the proven `POST
   /auth/mfa/verify` gate (not the untested `/auth/mfa/login-verify` path), per direct
   task instruction. **RESOLVED 2026-09-08 (same-day follow-up implementation,
   rollout-safety-corrected the same day) — the server-side MFA-enforcement gap flagged
   above is now closed, gated behind `MFA_ENFORCEMENT_ENABLED` (default disabled; NOT
   enabled in production — see AUTHENTICATION_ARCHITECTURE.md §12.9 for the activation
   procedure).** A short-lived, backend-signed MFA session assertion (`X-MFA-Token`),
   bound to the Firebase uid + the ID token's `auth_time` + the user document's
   `tokenVersion`, is now required by `authenticateToken` for any `mfaEnabled` account on
   every protected route except an explicit, minimal, exact-method+path
   bootstrap-exemption list — once the flag is enabled; while disabled, no request is ever
   rejected. Both web and mobile clients store, attach, and clear it correctly regardless
   of the flag. An earlier same-day persistent-custom-claim idea was rejected first (it
   would have carried MFA-verified status across future logins/devices, i.e.
   would not have enforced anything) — see `AUTHENTICATION_ARCHITECTURE.md` §12 for the
   full implemented design, the corrected `auth_time` claim (binds to a sign-in
   event/session family, not a physical device), tests, and files touched. A separate,
   related gap — logout not invalidating an already-issued Firebase ID token — is also
   closed in the same fix (§12.3). Approved and implemented this session; **nothing
   committed/pushed**.
4. **Dashboard scope for v1** — confirm whether CRM/teams/white-label/enterprise admin
   screens are in scope for mobile at all. Needed before Phase 5.
5. **IAP-vs-Stripe entitlement policy** — what a Stripe-subscribed web user sees/can do on
   mobile, and vice versa. Needed before Phase 7. *(PARTIALLY RESOLVED 2026-10-05 by Phase 7's
   conservative default, pending your confirmation: one account, one effective tier = the
   higher of Stripe and store; an active web subscriber cannot buy in-app (sees "managed on
   the web", text only, no external purchase link); an active store subscriber cannot buy a
   second store plan. **Still open:** the web app does not yet block or warn a store
   subscriber from also buying via Stripe (web behavior left unchanged per instruction) —
   decide whether it should.)*
6. **Push provider** — confirm Expo's push service (one API for both platforms via EAS) is
   acceptable vs. wanting direct FCM/APNs integration. Needed before Phase 6. *(RESOLVED 2026-10-05: Expo Push
   Service confirmed by the backend-integration task instruction — §5.)*
7. **RESOLVED 2026-09-08, per direct task instruction — Email-verification/password-reset
   deep-link behavior: use the existing web/Firebase-hosted behavior as-is, documented as
   a limitation, not worked around.** Both `VerifyEmailScreen` and `ForgotPasswordScreen`
   open the existing web/Firebase-hosted link in the device's browser and instruct the
   user to return to the app afterward; neither invents an unverified `actionCodeSettings`/
   custom-scheme deep-link flow. This remains genuinely unbuilt (still greenfield if ever
   wanted) — the decision made was to explicitly not build it yet, not that it was solved.
8. **CRM in mobile v1** — `crm.js`/`CRM.jsx` exist and work today (Agency+ tier); confirm
   whether mobile v1 includes CRM at all. See reuse-strategy doc §6.
9. **Teams / org administration in mobile v1** — `teams.js` exists (Enterprise tier);
   confirm scope. See reuse-strategy doc §6.
10. **Enterprise portal in mobile v1** — confirm scope, given `EnterpriseDashboard.jsx` is
    the largest, most complex web page (1,619 lines). See reuse-strategy doc §6.
11. **White-label in mobile v1** — `whitelabel.js` exists (Enterprise tier); likely
    web-only but not confirmed. See reuse-strategy doc §6.
12. **Audit logs in mobile v1** — `sales.js` admin/audit-logs exists; likely admin-only/
    web-only but not confirmed. See reuse-strategy doc §6.
13. **Analytics depth in mobile v1** — full `Analytics.jsx` parity vs. a lighter mobile
    summary; `analytics.js` backend exists either way. See reuse-strategy doc §6.
14. **Template creation/editing in mobile v1** — a richer template-builder exists
    server-side (`templateService`, used in `reports.js`); confirm whether authoring ships
    on mobile at all, vs. apply-only. See reuse-strategy doc §2.4/§6.
15. **Mobile subscription management** — what a mobile user can do to their own
    subscription (view is safe today via `GET /payment/current-subscription`; cancel/
    change needs a policy decision alongside item 5 above). See reuse-strategy doc §6.
    *(2026-10-05, Phase 7: store subscriptions are managed through the store's own
    subscription settings (deep link). Upgrading/downgrading between store plans inside the
    app is NOT offered in v1 — confirm if wanted (needs Play replacement-mode handling).
    Cancelling a Stripe subscription from mobile is still not exposed in the UI.)*
16. **Comments/replies and version history parity** — both exist server-side
    (`reports.js`) but are not yet confirmed as mobile v1 scope vs. deferred. See
    reuse-strategy doc §2.4/§6.
17. **Still OPEN — Firebase project "one account per email address" setting** —
    determines the exact UX needed when a Google/Apple sign-in collides with an existing
    email/password account. Still unverifiable without Firebase console access; mobile's
    Google/Apple sign-in code relies on Firebase's default collision behavior (matching
    web) rather than building custom linking logic pending this. See
    [`AUTHENTICATION_ARCHITECTURE.md`](./AUTHENTICATION_ARCHITECTURE.md) §2.4/§9/§11.1
    item 4. Not a Phase 3 code blocker (both providers are already configuration-gated/
    blocked pending console access regardless — see §6 Blockers Log) but worth resolving
    before Google/Apple sign-in's UX is considered finished.
18. **PARTIALLY RESOLVED 2026-09-08, scope corrected same day.** Ordinary logout still
    cannot (and, per the rollout-safety correction, deliberately should not silently)
    invalidate an already-issued, still-valid Firebase ID token on another device — only
    future token refreshes are blocked, same as before this whole fix. What IS now fixed:
    an **explicit** security event — a password change — bumps a `tokenValidAfter`
    timestamp on the user document, checked against each token's `iat`, reusing data
    `authenticateToken` already loads (no new Firestore read), and does invalidate every
    other session immediately. A true "log out everywhere" *button/feature* (a
    user-initiated action distinct from both ordinary logout and password change) is still
    not built — if ever wanted, it should reuse this same `tokenValidAfter` primitive from
    a new, explicit trigger, not extend ordinary logout's scope. See
    [`AUTHENTICATION_ARCHITECTURE.md`](./AUTHENTICATION_ARCHITECTURE.md) §12.3 for the full
    fix. **RESOLVED 2026-09-08 (final correction pass) — the caveat that used to be here is
    closed**: Settings.jsx's password-change UI no longer calls Firebase's client-side
    `updatePassword()` at all; the backend `PUT /users/change-password` is now the single
    authority for the mutation and always reaches this revocation on success. **Further
    hardened 2026-09-08 (same day, final pass): the backend now also independently verifies,
    server-side, that this happened recently** (`requireRecentAuth`, 5-minute window off the
    verified token's own `auth_time`, `403 RECENT_LOGIN_REQUIRED` on failure) — previously
    the backend trusted the authenticated session alone with no recency check at all. See
    §12.3's "Server-side recent-authentication requirement" block.
19. **Sandbox in production — recommendation: keep the implemented default.** Production accepts
    Apple sandbox / Play test purchases only for accounts in `STORE_SANDBOX_TESTER_EMAILS` (put the
    App Review demo account + named testers there); everyone else is refused. *Needs:* the tester
    list, and confirmation not to set `STORE_BILLING_ACCEPT_SANDBOX=true` in production.
20. **Plans sold in-app — RESOLVED by documented decision:** Enterprise is sales-led on the web
    (Contact Sales), so it is not sold in-app (enforced). Professional + Agency, monthly + annual,
    are sellable once configured. *Needs:* store prices (set in the consoles — your call; store
    commission 15–30% vs. web price parity).
21. **Admin override precedence — recommendation: keep the implemented "highest source wins".**
    Admin grants survive billing events; an admin cannot downgrade a paying subscriber below their
    paid plan (Golden Rule #4). If you need admins to *force* a lower tier (e.g. abuse), that needs
    a separate explicit "suspend/limit" control — confirm.
22. **Account deletion with an active store subscription:** the store keeps billing until the user
    cancels in the store; the Phase 8 deletion flow must say so.
23. **Terms / EULA — recommendation:** keep the in-app link to the existing Terms of Service *and*
    either (a) attach those Terms as the custom EULA in App Store Connect, or (b) choose Apple's
    standard EULA and add its link alongside. Legal choice — needs your decision.
24. **Duplicate Stripe/store subscriptions — recommended web guard (NOT implemented; needs your
    approval because it changes the web purchase flow):** `POST /payment/create-checkout-session`
    should refuse (409 `STORE_SUBSCRIPTION_ACTIVE`, "Manage your subscription in the App Store /
    Google Play") when the account has an active store entitlement, and the web Pricing page
    should show that message. Mobile already blocks the reverse case.
25. **Push lease length:** 7 days default (offline-logout window vs. pushes pausing for users who
    don't open the app for a week). Confirm, or choose 72 h / 24 h.
26. **RESOLVED 2026-10-07 — option (c), cancel immediately at deletion** (no refund/proration;
    implemented + statically tested, see §4). Original note: **Stripe subscription at account deletion (Phase 8) — decision needed.** Today (web and
    mobile, unchanged): deleting the account does NOT cancel an active Stripe subscription; it keeps
    billing until cancelled on the web, and the app warns and requires acknowledgement. Options:
    (a) keep warn-only; (b) block deletion while a renewing Stripe subscription exists; (c) cancel
    it automatically during deletion (immediately or at period end; refund policy applies).
    Recommendation: (c) cancel at deletion — a deleted user can no longer reach web Settings to
    cancel. Apple/Google subscriptions can never be cancelled by us — the user must do it in the store.
27. **Web delete-account copy parity — recommended, not changed (web behaviour preserved):** the
    web modal doesn't mention subscriptions or retained records, and Google/Apple web accounts still
    can't delete (password-only UI) although the endpoint now supports recent-sign-in deletion.

28. **Outstanding Stripe invoices at account deletion (2026-10-07).** Deletion cancels the
    subscriptions but leaves open / past-due invoices untouched (no void, no refund). Confirm in the
    Stripe dashboard whether collection retries continue for invoices of a cancelled subscription,
    and whether they should be voided — a billing-policy decision, not changed in code.
    *(Re-inspected 2026-10-07, Phase 10: unchanged and still correct to leave — cancellation uses
    `invoice_now:false, prorate:false`, no invoice/refund/credit-note API is called anywhere. Still
    needs: a Stripe-dashboard check of "Manage failed payments" + a void-or-collect policy.)*
29. **RESOLVED 2026-10-07 (approved, done) — see §4 "Phase 10 continuation".** Original:
    **EAS preview/production environment variables (Phase 10, BLOCKER for any store build).** Only
    the `development` EAS environment has `EXPO_PUBLIC_FIREBASE_*` / `EXPO_PUBLIC_GOOGLE_*`. Approve
    creating them in `preview` + `production` (public client identifiers; confirm the production
    Firebase project's iOS/Android app registrations to copy from), and decide which API `preview`
    builds use (item 1).
30. **IMPLEMENTED 2026-10-07, pending deployment** — option (a) + (b): `/account-deletion` public page
    and Google/Apple re-auth in web Settings. Original: **Google Play account-deletion web link (Phase 10).** Play requires a web URL to request deletion.
    Web Settings can delete only password accounts (item 27). Options: (a) add recent-sign-in deletion
    to web Settings (endpoint already supports it); (b) a public "request deletion" support page.
31. **Store reviewer account (Phase 10).** A dedicated production demo account (MFA off, sample report,
    plan that allows generation) whose email goes into `STORE_SANDBOX_TESTER_EMAILS`. Who creates it,
    and with which plan?
32. **Listing choices (Phase 10):** category, keywords, age-rating answers, feature graphic design,
    export-compliance answer (app uses only standard HTTPS/OS crypto — `ITSAppUsesNonExemptEncryption`
    not set in code pending confirmation), and whether `expo-updates` (OTA) is wanted.
33. **Privacy Policy vs. actual deletion (Phase 10, legal).** Policy §5: "Account data is retained for
    90 days after account closure to allow for recovery requests, then deleted from primary systems
    within 180 days. Backups may retain data for an additional 90 days." Implemented behaviour:
    immediate deletion from Firestore/Storage/Auth, no recovery; billing records, audit logs, sales
    leads and a tombstone kept. Either update the policy text or change behaviour — store privacy
    answers must match whichever is true.
34. **Staging backend for preview builds / private client testing.** No non-production backend exists.
    Options: (a) a small staging ECS service + staging Firebase project (paid; cleanest); (b) preview
    builds against production once this branch is deployed (testers then use real production data —
    disposable accounts only); (c) development builds against a local backend (works, but needs this
    PC running and a device). Recommendation: (a) before external testers. **2026-10-09:** (a) chosen by
    owner; scripts prepared in `backend/deploy/staging/` — awaiting approval of cost + missing access
    (staging Firebase project, CodeBuild IAM role/PassRole, staging secret values, network choice).
35. **Device testing route (no phone; local emulator not feasible).** Options: (1) **EAS Workflows
    Maestro tests** on Expo's cloud Android emulator — reuses the existing Expo account/build, scripted
    flows; needs a reachable backend (staging, or a temporary HTTPS tunnel to the local emulator-backed
    backend) and may consume paid EAS build credits; (2) BrowserStack/LambdaTest App Automate — real
    Android + iOS devices, local tunnel, paid subscription, build + test data uploaded to a third party;
    (3) Firebase Test Lab — Robo crawl only for unscripted flows, needs gcloud access; (4) a cheap
    physical Android phone + USB cable (most complete; push/camera/purchase testable). Recommendation:
    (4) for real verification, or (1) for scripted coverage now. iOS in all cases needs either a Mac
    (simulator) or a TestFlight build on a real iPhone.
