# FlacronAI Mobile — Phase Tracker

> **Read this file first, every session, before touching anything under `mobile/`.**
> This is the permanent source of truth for mobile development: phases, status, decisions,
> blockers, validation evidence. It is updated after every action and every phase — never
> mark a phase complete without recording the validation evidence for it.
>
> This file lives entirely inside the isolated `mobile/` directory. It does not replace or
> duplicate the repo-root `CLAUDE.md` / `PROGRESS.md` / `TASKS.md` system used by the web
> app — those govern `frontend/` and `backend/` and are unaffected by mobile work.

---

## 0. How to use this file

1. Check **§1 Current Status** for the active phase.
2. Read that phase's entry in **§3 Phase Plan** for objective/scope/validation.
3. Do the work for that phase only — do not start a later phase early.
4. Record what happened in **§4 Progress Log** (with validation evidence), update **§5
   Decisions Log** / **§6 Blockers Log** if applicable, then update **§1 Current Status**.
5. Stop and report. Do not silently roll into the next phase.

---

## 1. Current Status

- **Active phase:** Phase 1 — Mobile Foundation
- **Status:** **complete.** EAS authentication/ownership verified, and a practical
  runtime test on a physical Android phone (via Expo Go, tunnel mode) passed — see §8.
  Remaining open items are explicitly non-blocking: the Node LTS switch (§6, a
  recommendation), and iOS/tablet **runtime** testing, which is pending/deferred only
  because no iOS device/simulator or tablet was available this session — static iOS and
  tablet-support configuration are already validated (§8).
- **Last updated:** 2026-09-05
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

### Phase 2 — Configuration & Environment Preparation
- **Status:** not started (the minimal env/EAS scaffolding needed for Phase 1's structure
  is done as part of Phase 1; this phase is for anything beyond that — e.g. confirming the
  real API base URL, deciding dev/preview/prod environment separation in more depth).
- Objective: finalize the public/secret environment-variable boundary once the real API
  base URL and any per-environment values are confirmed.
- Scope: confirm production API base URL (see open question in §10); decide whether
  dev/preview/prod need distinct `EXPO_PUBLIC_API_BASE_URL` values or one value with
  client-side environment switching.
- Expected files: updates to `mobile/.env.example`, `mobile/app.config.ts`.
- Dependencies: your confirmation of the real API base URL / any AWS ALB DNS or custom
  domain in front of the ECS service.
- Validation: build succeeds with only `EXPO_PUBLIC_*` vars present.
- Security: re-confirm no non-public var is ever read client-side.
- Completion criteria: documented, reviewed env boundary with real (not placeholder)
  values where available.
- Out of scope: any real secret value committed anywhere.

### Phase 3 — Authentication
- **Status:** not started
- Objective: sign up, log in, forgot password, email verification, logout, social login
  (Google +, on iOS, mandatory Apple Sign-In if Google ships), integrated with the
  **existing** Firebase project and backend contract.
- Scope: decide client auth strategy (Firebase JS SDK w/ RN persistence vs. the backend's
  REST-backed `/api/v1/auth/login`+`/register`, confirmed to exist in
  `backend/routes/auth.js`); secure token storage via `expo-secure-store`; native social
  login flow (not `signInWithPopup`, which is web-only); MFA parity decision (backend
  already gates login behind `mfaRequired` for TOTP-enabled accounts, confirmed in
  `backend/routes/auth.js`).
- Expected files: `mobile/src/features/auth/*`, `mobile/src/services/api-client.ts` (token
  attach), `mobile/src/services/secure-storage.ts`.
- Dependencies: Firebase console access (register iOS/Android "apps" on the existing
  project — additive, does not touch the web app's registration); Apple Developer account
  access for Sign in with Apple; Google OAuth client IDs for iOS/Android.
- Validation: full auth matrix tested against a real dev backend account.
- Security: tokens in SecureStore only, never AsyncStorage; honor `tokenVersion`
  revocation (401 `TOKEN_REVOKED` forces re-login, not a retry loop); honor the 503
  `AUTH_VERIFY_UNAVAILABLE` vs 401 `INVALID_TOKEN` distinction the backend explicitly makes.
- Completion criteria: a real account authenticates end-to-end on both platforms.
- Out of scope: any dashboard data fetch beyond a logged-in confirmation call.

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

---

## 6. Blockers Log

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

See the final report for the full rationale. Summary:

```
mobile/
  app/                    Expo Router routes only (thin — no business logic)
  assets/images/          Brand-derived app icon, splash, adaptive-icon, favicon
  src/
    components/           Shared, reusable, presentational UI primitives
    features/             Feature-oriented modules (one subfolder per feature, added as
                           each feature phase begins) — README documents the convention now
    services/              API client, auth/token storage, push — added per phase
    hooks/                 Shared custom hooks — added when a real cross-feature hook exists
    store/                 App-wide state management — mechanism decided in Phase 3/4
    theme/                 Design tokens ported from frontend/tailwind.config.js
    types/                 Shared TypeScript types
    utils/                 Small stateless helpers shared across features
  app.config.ts, eas.json, package.json, tsconfig.json, eslint.config.js, .gitignore,
  .env.example, README.md, MOBILE_DEVELOPMENT_PHASES.md (this file)
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

---

## 10. Pending Questions / Approvals Needed

1. **Real production API base URL** — could not be verified from the repository (see
   infrastructure note in §2). Needed before Phase 2/4 can use a real value instead of a
   placeholder.
2. **Auth client strategy** — Firebase JS SDK (RN persistence) vs. the backend's existing
   REST `/api/v1/auth/register`+`/login` endpoints. Needed before Phase 3.
3. **MFA parity for v1** — ship TOTP/recovery-code support at launch or document it as a
   known v1 limitation. Needed before Phase 3.
4. **Dashboard scope for v1** — confirm whether CRM/teams/white-label/enterprise admin
   screens are in scope for mobile at all. Needed before Phase 5.
5. **IAP-vs-Stripe entitlement policy** — what a Stripe-subscribed web user sees/can do on
   mobile, and vice versa. Needed before Phase 7.
6. **Push provider** — confirm Expo's push service (one API for both platforms via EAS) is
   acceptable vs. wanting direct FCM/APNs integration. Needed before Phase 6.
7. **Email-verification deep-link behavior** — the backend's verification link currently
   builds a *web* dashboard continue-URL; mobile needs an explicit "return to app" decision.
   Needed before Phase 3.

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

- `feature/mobile-app-foundation` — current branch, created from an up-to-date `main`, for
  this foundation phase only.
- No separate long-lived `mobile/main` branch.
- After this foundation is reviewed and eventually merged, future major phases use
  separate short-lived feature branches created from the latest `main` at that time.
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

Do not start it yet — recommended only for after you review this foundation:
**Phase 3 — Authentication**, but only once open questions §10.2 (auth strategy) and
§10.3 (MFA parity) are answered, since they materially change what gets built.
