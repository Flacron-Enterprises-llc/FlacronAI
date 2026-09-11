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
- **Status:** not started
- Objective: one typed API client used everywhere, matching the backend's real response
  envelope (`{success, error, code}`) and its transient-vs-fatal auth error contract.
- Scope: base client against `/api/v1/*` exclusively (the versioned prefix — confirmed
  live in `backend/server.js`, mounted alongside the legacy `/api` alias); typed
  request/response models per resource; retry/backoff; offline-state handling.
- Expected files: `mobile/src/services/api/*` (reports, users, payment, notifications).
- Dependencies: Phase 3 token plumbing.
- Validation: each typed client method round-trips against a real dev backend.
- Security: every call maps to a route confirmed to exist in `backend/routes/*` — no
  invented endpoints.
- Completion criteria: client library covers every endpoint Phase 5 needs.
- Out of scope: UI.

### Phase 5 — Core Dashboard Feature Parity
- **Status:** not started
- Objective: the major flows from `Dashboard.jsx`, native-appropriate, not copied JSX.
- Scope, priority order: reports list + dashboard summary; the generate wizard (claim
  info → property → loss details → camera/photo-library capture and upload → review);
  report detail (photos, comments, versions); approve/review-response; export/download
  (save-to-device or share-sheet, since `GET /:id/download` proxies bytes rather than
  redirecting to a public URL); settings/profile. CRM/teams/white-label screens only if
  explicitly confirmed in scope for mobile v1.
- Expected files: `mobile/app/(tabs)/*`, `mobile/src/features/reports/*`,
  `mobile/src/features/photos/*`.
- Dependencies: `expo-image-picker`/`expo-camera`, `expo-file-system`/`expo-sharing`,
  Phase 4 client.
- Validation: full wizard run against a real dev account produces a report visible on web
  too (shared backend, single source of truth).
- Security: photo uploads go through the same authenticated endpoints as web.
- Completion criteria: create → review → approve → export runs entirely from the phone.
- Out of scope: CRM/enterprise/white-label admin features unless explicitly requested.

### Phase 6 — Push Notifications
- **Status:** not started
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
- **Status:** not started — **highest-risk phase, flagged explicitly**
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
- **Status:** not started
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
- **Status:** not started
- Objective: systematic verification before anything nears a store queue.
- Scope: device/OS matrix (recent iOS + Android, phone + tablet), full auth matrix, upload
  reliability on poor networks, export/share-sheet behavior per platform, accessibility
  pass, crash/error reporting.
- Validation: full checklist executed with results logged in this file.
- Completion criteria: no known-blocking defect remains.
- Out of scope: performance work beyond what store review requires.

### Phase 10 — Store Preparation & Release Readiness
- **Status:** not started
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

---

## 5. Decisions Log

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

---

## 7. Folder Structure

See the final report for the full rationale. Summary (updated Phase 3, 2026-09-08):

```
mobile/
  app/                    Expo Router routes only (thin — no business logic)
    login.tsx, signup.tsx, forgot-password.tsx, verify-email.tsx, mfa.tsx,
    account-unavailable.tsx    Auth screens (each just renders a features/auth/screens/*)
    (app)/                     Protected group — _layout.tsx + home.tsx (placeholder)
  assets/images/          Brand-derived app icon, splash, adaptive-icon, favicon
  src/
    components/           Shared, reusable, presentational UI primitives
    config/                Environment/config resolution (env.ts, firebaseConfig.ts) — not
                           an API client, no side effects, fails fast on bad config
    features/
      auth/                Phase 3 — context (AuthProvider, authStatus), screens,
                           components, services (googleSignIn, appleSignIn), utils
                           (validation, errorMessages), types.ts, constants.ts
    services/
      api/                 client.ts (auth header attach, retry contract), auth.ts,
                           users.ts — scoped to Phase 3's needs; Phase 4 extends this
      firebase/             client.ts — Firebase app/auth initialization, RN persistence
    hooks/                 Shared custom hooks — still empty (no cross-feature hook yet)
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

---

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
   mobile, and vice versa. Needed before Phase 7.
6. **Push provider** — confirm Expo's push service (one API for both platforms via EAS) is
   acceptable vs. wanting direct FCM/APNs integration. Needed before Phase 6.
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

---

## 11. Git / Branch / Commit / Push / PR Rules (permanent — copied here so this file is
self-contained for anyone picking up mobile work later)

1. Never expose or commit passwords, API secrets, Firebase admin credentials,
   service-account JSON files, Apple credentials, Google credentials, signing
   certificates, provisioning profiles, keystores, tokens, or real `.env` files.
2. A mobile app is a public client and must never contain private backend secrets.
3. Only explicitly safe client configuration may use `EXPO_PUBLIC_*` variables.
4. Real environment values live only in approved local/EAS secret storage.
5. Never modify unrelated web frontend or backend files.
6. Reuse the existing backend only through verified APIs and shared authentication flows;
   never invent endpoints.
7. Inspect and confirm existing behavior before changing any backend code.
8. All work stays local unless explicitly requested otherwise.
9. Commit only when explicitly asked.
10. Push only when explicitly asked.
11. Create a pull request only when explicitly asked.
12. Never merge, force-push, publish an update, submit an app, or trigger a production
    build without explicit approval.
13. Before every future commit, verify no secret, credential, `.env` file, build output,
    or unrelated change is included.
14. Each implementation phase is validated and documented before moving to the next.
15. Company-level projects, store records, credentials, and signing assets remain owned by
    Flacron Enterprises LLC.

### Branch strategy in effect

- `feature/mobile-app-foundation` — Phase 1 branch, created from an up-to-date `main`;
  merged into `main` via PR #18 (confirmed 2026-09-08 — `origin/main` contains it).
- `docs/mobile-reuse-strategy` → renamed (2026-09-08, `git branch -m`, a pure local
  rename, no new branch created and no history lost) to `feature/mobile-initial-phases` —
  created from the post-merge `main` for the documentation audit, and now also carrying
  Phase 2 (and, per its name, intended to carry the next initial mobile phases). Not
  pushed as of Phase 2 completion.
- No separate long-lived `mobile/main` branch.
- Previous QA branches/PRs are not touched or referenced by mobile work.

---

## 12a. npm Audit Findings (analyzed 2026-09-05, none applied — documented and deferred)

`npm audit` reports **14 moderate-severity advisories, 0 high/critical**. Full dependency
paths were traced with `npm ls <pkg>`; only **two** packages are actually vulnerable —
every other flagged entry is an ancestor package npm audit reports because it sits
somewhere in the path down to one of these two:

| Root-cause package | Resolved version | Pulled in by | Advisory |
|---|---|---|---|
| `decode-uri-component` | `0.2.2` | `expo-router@57.0.19` → `query-string@7.1.3` → `decode-uri-component` | ReDoS via exponential decoding of malformed percent-encoded input (GHSA-w573-4hg7-7wgq) |
| `uuid` | `7.0.3` | `expo-splash-screen@57.0.8` → `@expo/config-plugins@57.0.9` → `xcode@3.0.1` → `uuid` | Missing buffer bounds check in v3/v5/v6 when `buf` is provided (GHSA-w5hq-g745-h8pq) |

The other 12 (`expo`, `expo-router`, `expo-splash-screen`, `@expo/cli`, `@expo/config`,
`@expo/config-plugins`, `@expo/inline-modules`, `@expo/local-build-cache-provider`,
`@expo/metro-config`, `@expo/prebuild-config`, `query-string`, `xcode`) are flagged purely
because they're ancestors of the two packages above in the dependency tree — none has an
independent vulnerability of its own.

- **Direct vs. transitive:** `expo`, `expo-router`, and `expo-splash-screen` are our only
  direct dependencies among the 14 — and even those are flagged solely because a
  transitive sub-dependency several levels down is affected, not because of anything in
  their own code. Every other entry, including both actual root causes, is fully
  transitive.
- **From Expo-managed dependencies?** Yes — both vulnerable packages are pulled in by
  Expo's own currently-published SDK 57 packages (`expo-router@57.0.19`,
  `expo-splash-screen@57.0.8`, resolved via `npx expo install`, not hand-picked). This is
  Expo's own current official dependency graph, not something introduced by any choice
  made in this foundation.
- **Runtime exposure:** The `uuid`/`xcode`/`@expo/config-plugins` chain is **build-time-only
  tooling** — used solely during `expo prebuild`/native project generation on a
  developer's or CI's own machine; none of it ships inside the app bundle installed by an
  end user. The `decode-uri-component`/`query-string` chain **does** ship as part of
  `expo-router`'s runtime deep-link/query-string parsing — the practical exploit path is
  an adversarially crafted, extremely long query string causing a CPU-bound regex hang
  (ReDoS), a low-severity availability issue (not data exposure or code execution), which
  matches the advisory's own "moderate" (not high/critical) rating.
- **Is a compatible, non-breaking fix available?** No, confirmed two ways:
  1. `npm audit fix --dry-run` (no changes applied) proposes no in-range fix for either
     chain — it explicitly states the fix requires `npm audit fix --force` and would
     install `expo-splash-screen@55.0.25`.
  2. Checked both vulnerable packages' immediate parents' declared dependency ranges
     directly: `query-string@7.1.3` pins `"decode-uri-component": "^0.2.2"` (0.2.2 is the
     newest release in that caret range — no patched version exists within it; the
     ReDoS advisory is only resolved starting at 0.3.0+, which is out of range).
     `xcode@3.0.1` pins `"uuid": "^7.0.3"` (the advisory wants `>=11.1.1`, also out of
     range). The only path npm can find that resolves to a "safe" range is
     **downgrading** `expo` to `46.0.21`, `expo-router` to `5.1.11`, and/or
     `expo-splash-screen` to `55.0.25` — all major-version downgrades, 10+ SDK versions
     behind our current SDK 57 baseline. This would break the entire project and was
     **not** attempted.
- **Decision: document and defer, do not patch now.** Per instruction, a fix is only
  applied here if it is clearly safe, Expo-compatible, and caused by this setup — none of
  those hold: it isn't caused by this setup (it's Expo's own current SDK 57 tree), and the
  only available "fix" is an unacceptable major downgrade. A `package.json` `overrides`
  entry forcing just the two leaf versions was considered and **rejected** — it would
  bypass both parent packages' own tested compatibility range without any way to validate
  the result in this phase (no native build is being run), which is not "clearly safe."
  **Recommended handling:** re-check with `npm audit` at the start of each future phase
  (cheap, already good practice) and specifically before Phase 10 (Store Preparation) as a
  final pre-submission check — by then Expo will very likely have shipped a patched SDK
  point release that resolves this upstream, at which point a routine `expo install
  --check` / point-release bump (not attempted here) is the correct fix path, not a
  manual override.

## 12. Recommended Next Phase

**Phase 3 — Authentication is implemented, partially complete** (§1/§3/§4/§6 above;
full detail in [`AUTHENTICATION_ARCHITECTURE.md`](./AUTHENTICATION_ARCHITECTURE.md) §11).
**Do not start Phase 4 yet.** Recommended before either resuming Phase 3 work or starting
Phase 4:

1. **Close the Firebase console dependency** (§6 Blockers Log) — register this app's
   iOS/Android "app" against the `flacronai` Firebase project and populate
   `EXPO_PUBLIC_FIREBASE_*` in a local `.env.local`. This unblocks moving past
   `ConfigRequiredScreen` and is a prerequisite for any real device testing.
2. **Perform a real on-device Expo Go walkthrough** of the email/password flows (sign-up →
   verify → sign-in → forgot-password → logout) against a local `backend/` instance, once
   (1) is done — the one validation category this session could not perform itself
   (§8 "Phase 3 validation").
3. **Decide the two genuinely open items** before considering Google/Apple sign-in and MFA
   "finished," not just "implemented": Firebase/Google/Apple console configuration (§6,
   unblocks Google/Apple sign-in functionally) and whether server-side MFA enforcement is
   wanted enough to justify a separately-approved `backend/` change (§6, §10 item 3).
4. Only then, **Phase 4 — Backend/API Integration Layer**, which depends on Phase 3's
   token-attach plumbing (already built in `src/services/api/client.ts`, scoped so far to
   just the auth-related endpoints Phase 3 needed — Phase 4 extends it to the full
   `reports`/`users`/`payment`/`notifications` surface).
