# FlacronAI Mobile

Native companion app to the FlacronAI web platform (`../frontend`, `../backend`) —
insurance inspection report generation, reviewed and approved by a human before export.
This directory is a fully isolated Expo project: its own `package.json`, lockfile,
TypeScript config, lint config, and ignore rules. It shares **no** dependencies, build
tooling, or `node_modules` with `frontend/` or `backend/`, and there is no root npm
workspace tying them together.

> **Status: Phase 1 (Foundation), Phase 2 (Configuration & Environment Preparation)
> complete; Phase 3 (Authentication) implemented, partially complete.** The app now has a
> real, working authentication module — sign-up, login, forgot-password, email
> verification, logout, MFA, and configuration-gated Google/Apple sign-in — behind Expo
> Router route guards. **It cannot actually run past a "Configuration required" screen
> yet**: no Firebase iOS/Android app has been registered against the `flacronai` project,
> so `EXPO_PUBLIC_FIREBASE_*` has no real values (see "Firebase setup" below). Google/Apple
> sign-in are code-complete but functionally blocked pending further console/portal
> configuration, and a real MFA server-side enforcement gap was found and reported (not
> fixed — needs a `backend/` change). Full detail:
> [`AUTHENTICATION_ARCHITECTURE.md`](./AUTHENTICATION_ARCHITECTURE.md) §11.
> See [`MOBILE_DEVELOPMENT_PHASES.md`](./MOBILE_DEVELOPMENT_PHASES.md) for the full phase
> plan, current status, decisions, and open questions. Read that file before doing any
> further mobile work. Also read
> [`WEB_TO_MOBILE_REUSE_STRATEGY.md`](./WEB_TO_MOBILE_REUSE_STRATEGY.md) for what should be
> reused from the existing web/backend system vs. built natively, before starting any
> feature phase.

## Ownership

All Apple, Google, Firebase, and Expo/EAS project ownership, store records, credentials,
and signing assets remain the property of **Flacron Enterprises LLC**. Nothing here is
personally owned.

**Verified 2026-09-05** via `npx eas-cli@latest whoami` + `npx eas-cli@latest
project:info` (login completed by the account holder directly in their own browser via
Expo's OAuth flow — no credential passed through any tool or file in this repo): the
`flacronai` project (ID `c8227fa0-8a62-4e51-8ccc-c8feb58d0466`) is owned by the
`flacron-enterprises-llc` organization, not the personal `laibanoreen` account. The
`laibanoreen` account has Admin access to that organization.

## Confirmed identifiers

| Field | Value |
|---|---|
| Display name | `FlacronAI` |
| Expo organization | `flacron-enterprises-llc` |
| Expo slug | `flacronai` |
| EAS Project ID | `c8227fa0-8a62-4e51-8ccc-c8feb58d0466` |
| Expo username in use | `laibanoreen` |
| iOS Bundle ID | `com.flacronenterprises.flacronai` |
| Android Package | `com.flacronenterprises.flacronai` |
| URL scheme | `flacronai` |

## Prerequisites

- **Node.js 22 LTS is the recommended, supported version for this project.** As of this
  writing the environment this was built in runs Node `v25.2.1` (a non-LTS "current"
  release) with **no Node version manager installed** (checked: no `nvm`, `fnm`, `volta`,
  or `n`) — Node is a single standalone system install. Every check in this phase (clean
  install, `expo-doctor`, TypeScript, lint) passed cleanly on Node 25 regardless, but
  switching to 22 LTS before ongoing feature work is still recommended. To switch:
  1. Install a version manager — recommended:
     [`nvm-windows`](https://github.com/coreybutler/nvm-windows/releases) (downloads as
     `nvm-setup.exe`; detects and offers to migrate the existing Node install), or
     `winget install Schniz.fnm` for a lighter-weight alternative.
  2. In a **new** terminal: `nvm install 22 && nvm use 22` (or `fnm install 22 && fnm use 22`).
  3. Confirm with `node -v` (should print `v22.x.x`), then re-run `npm ci` in `mobile/`.
- npm
- [Expo Go](https://expo.dev/go) app on a physical device, **or** Xcode (macOS, for iOS
  simulator) / Android Studio (for Android emulator)
- An Expo account with access to the `flacron-enterprises-llc` organization, to run any
  `eas` command that touches the real project (build/submit/update) — not needed for
  local development against Expo Go

## Setup

```bash
cd mobile
npm install
```

## Local development

```bash
npm run start      # Metro bundler — scan the QR code with Expo Go, or press a/i/w
npm run android     # opens directly in a connected device/emulator
npm run ios         # opens directly in the iOS simulator (macOS + Xcode only)
npm run web          # opens the Expo web output
```

### Testing on a physical device: LAN vs. tunnel

`npm run start` defaults to **LAN mode**, which requires your phone to be on the same
Wi-Fi and able to reach this computer directly. **On Windows, this can silently fail** if
Windows classifies your Wi-Fi network as **"Public"** — confirmed during this phase's own
device testing: the dev server ran fine, but the phone couldn't connect at all, because
the Public-profile firewall has no allow-rule for Node.js by default. Symptoms: the app
never loads on the phone, or Expo Go shows a generic connection/"Something went wrong"
error, even though Metro's own terminal shows no error.

To check: `Get-NetConnectionProfile` (PowerShell) — if `NetworkCategory` shows `Public`,
either change the network to `Private` in Windows Settings, or just use tunnel mode
instead:

```bash
npx expo start --tunnel
```

The first time you run tunnel mode, the CLI will ask to install `@expo/ngrok` — accept
that prompt (or it's already a devDependency here if you're on a checkout from after this
phase). Tunnel mode is slower to load than LAN but works regardless of firewall/network
classification, since it routes through Expo's own relay instead of a direct LAN
connection.

One more tunnel-specific quirk to expect, not a bug: using Expo Go's dev-menu **"Reload"**
while connected over a tunnel can drop you back to Expo Go's manual URL-entry screen
instead of reconnecting silently — this is the tunnel's WebSocket connection to Metro
being less stable than a LAN one, not an app problem. Just re-enter the same tunnel URL
and it reconnects normally.

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint          # expo lint
npm run doctor         # expo-doctor — validates config, dependency versions, native config
npm test               # jest (jest-expo preset) — see "Testing" below
```

## Testing (added Phase 3)

`npm test` runs the Jest suite (`jest-expo` preset + `@testing-library/react-native`).
`jest.config.js` and `jest.setup.js` each carry header comments explaining two
Firebase/Expo-specific fixes they apply (a `transformIgnorePatterns`/`.mjs`-transform gap
for `firebase`/`@firebase/*`'s raw ES modules, and the official
`@react-native-async-storage/async-storage` Jest mock) — read those before adding a test
that imports anything Firebase-related, so you don't have to rediscover the same two
issues.

**A real limitation, stated plainly**: `EXPO_PUBLIC_*` variables (Firebase config, the
Google client ID) are statically inlined into the compiled code by Expo's Babel pipeline
at transform time — the same pipeline Jest uses. This means a test **cannot** flip a
`process.env.EXPO_PUBLIC_*`-reading function's behavior by mutating `process.env` inside
the test body (the value was already baked in before the test ran). The test suites for
`src/config/firebaseConfig.ts` and `src/features/auth/services/googleSignIn.ts` document
this in their own file headers and only exercise the "not configured" path — which happens
to be this repo's actual current state anyway. `env.ts` (Phase 2) hit the identical
constraint and was validated in an isolated plain-Node process outside Jest instead — see
`MOBILE_DEVELOPMENT_PHASES.md` §8 "Phase 2 validation" for that precedent.

## Environment configuration

Copy `.env.example` to `.env.local` (git-ignored) and fill in real values for local
development only:

```bash
cp .env.example .env.local
```

Rules (see [`MOBILE_DEVELOPMENT_PHASES.md`](./MOBILE_DEVELOPMENT_PHASES.md) §9 for the
full policy):

- Only `EXPO_PUBLIC_*`-prefixed variables may be read by client code, and only for values
  safe to ship inside a public app binary.
- **Every `EXPO_PUBLIC_*` value is publicly visible** — Metro inlines these into the JS
  bundle at build time, so anyone can extract them from the shipped app binary. Never put
  anything here that wouldn't be safe to publish (an API base URL and an environment name
  are fine; a secret, credential, or private key is never fine).
- **Never** place Firebase admin credentials, backend secrets/private API keys, Apple
  credentials, Google credentials, signing certificates, provisioning profiles, keystores,
  service-account JSON files, or a real `.env` file anywhere in `mobile/`.
- Real secret values live only in a local `.env.local` (git-ignored) or in EAS secret
  storage (`eas secret:create`) — never in the repository.

### Environment strategy (Phase 2)

Three supported environment names, matching the three `eas.json` build profiles exactly:
`development`, `preview`, `production`. `mobile/src/config/env.ts` is the single place
that reads and validates environment configuration — no other file should read
`process.env.EXPO_PUBLIC_*` directly.

**How selection works:**

- **Local development:** Metro/Expo auto-loads `.env.local` (git-ignored) when you run
  `npm run start`. Set `EXPO_PUBLIC_APP_ENV=development` there (already the default in
  `.env.example`). `EXPO_PUBLIC_API_BASE_URL` can be omitted **only if you're running the
  iOS Simulator or Expo web** — see "Running on different targets" immediately below for
  every other case. Do not assume `localhost` works everywhere; it doesn't.
- **Preview / production:** these values come from **EAS environment variables**, not
  from any file committed to the repo. `mobile/eas.json` already sets
  `EXPO_PUBLIC_APP_ENV` per profile. `EXPO_PUBLIC_API_BASE_URL` for these two profiles is
  **intentionally not set anywhere yet** — see "Known unresolved configuration" below —
  and must be added later via `eas env:create` (documented, not run in this phase) once a
  real value is confirmed.

### Running on different targets (Phase 2 addendum)

`http://localhost:3000` only reaches a backend running on the **same machine** as the
client. That's true for the iOS Simulator and Expo web, but not for the Android Emulator
or a physical phone — each has a different notion of "the development machine." Set
`EXPO_PUBLIC_API_BASE_URL` in your own `.env.local` accordingly (never commit a real
value — `.env.local` is git-ignored):

| Target | `EXPO_PUBLIC_API_BASE_URL` | Why |
|---|---|---|
| iOS Simulator | `http://localhost:3000/api/v1` | Shares the host machine's network namespace — this is the `.env.example` default, no override needed |
| Expo web | `http://localhost:3000/api/v1` | Runs directly in the host machine's browser |
| Android Emulator | `http://10.0.2.2:3000/api/v1` | The emulator's virtual network maps `10.0.2.2` to the host machine — `localhost` inside the emulator means the emulator itself, not your computer |
| Physical phone, same Wi-Fi | `http://<YOUR_COMPUTER_LAN_IP>:3000/api/v1` | The phone is a separate device on the network — find your current LAN IP with `ipconfig` (Windows) or `ifconfig` / `ipconfig getifaddr en0` (macOS); **this value changes between networks and reboots, so it only ever belongs in your own `.env.local`, never committed** |
| Physical phone, different network / firewalled | Not solvable by `EXPO_PUBLIC_API_BASE_URL` alone — see the correction below | A raw LAN IP won't be reachable across networks or through router/firewall restrictions |

**Correction (2026-09-08 follow-up audit): `npx expo start --tunnel` does NOT expose the
backend.** It tunnels Metro (the JS bundler, port 8081) only, so Expo Go can download the
app bundle over a network without direct LAN access. It has no effect whatsoever on
`EXPO_PUBLIC_API_BASE_URL` traffic — that's a completely separate HTTP connection from the
phone straight to `http://<backend-host>:3000`, which the Metro tunnel never touches. A
physical phone on a different network or a firewalled one therefore has exactly two real
options for reaching a local dev backend: (1) same Wi-Fi as the backend machine, with that
machine's Windows Firewall allowing inbound TCP 3000 on the current network profile (see
`Get-NetConnectionProfile` above — a `Private` profile is required for this, not just for
Metro), using the LAN-IP row above; or (2) a **separate** authenticated tunnel for the
backend itself (e.g. `npx expo start --tunnel` run a second time is not applicable — this
needs its own tool, such as an ngrok tunnel pointed at port 3000, not port 8081), or a
shared HTTPS dev/staging backend if one exists. Do not assume Metro tunnel mode alone makes
sign-in/API calls work on a physical device off the LAN.

`env.ts` allows plain HTTP in development only for `localhost`, `127.0.0.1`, the Android
Emulator/Genymotion host aliases, and RFC1918 private LAN addresses (`10.x.x.x`,
`172.16-31.x.x`, `192.168.x.x`) — pointing development at any other host over HTTP throws,
since that would send API traffic in the clear to a public host.

**Commands:**

```bash
# Local development — uses .env.local automatically
npm run start

# Preview / production builds — documented only, do NOT run without explicit approval
# and without EXPO_PUBLIC_API_BASE_URL configured on EAS for that profile first:
eas build --profile preview --platform all
eas build --profile production --platform all
```

**Fail-fast behavior — by design, not a bug:** `env.ts` throws a clear, specific error
instead of silently falling back to an incorrect (or production) origin:

| Error you might see | What it means | Fix |
|---|---|---|
| `Missing EXPO_PUBLIC_APP_ENV...` | No `.env.local` was created, or it doesn't set this var | `cp .env.example .env.local` |
| `Invalid EXPO_PUBLIC_APP_ENV "..."` | The value isn't one of `development`/`preview`/`production` | Fix the typo in `.env.local` |
| `EXPO_PUBLIC_API_BASE_URL ("...") is not a valid URL` | Malformed URL string | Check the value in `.env.local` |
| `EXPO_PUBLIC_API_BASE_URL uses plain HTTP for a non-local host...` | You pointed development at a public HTTP host | Use HTTPS, or point at a recognized local/private target from the table above |
| `Missing EXPO_PUBLIC_API_BASE_URL for the "preview"/"production" environment...` | Expected — no real value has been confirmed yet for that environment (see below) | Supply the real origin via `eas env:create` once confirmed; there is deliberately no placeholder that would let this pass silently |
| `...looks like a placeholder value, not a real, confirmed backend origin` | A `.invalid`/`.example`/`REPLACE_WITH_...`-style value reached preview/production config | Supply the real confirmed origin instead |
| `EXPO_PUBLIC_API_BASE_URL must use HTTPS for the "preview"/"production" environment` | A plain-HTTP URL reached preview/production config | Use HTTPS |
| `...points at a localhost, emulator, or private LAN address, which cannot work for the "preview"/"production" environment` | A dev-only address (localhost, `10.0.2.2`, `192.168.x.x`, etc.) leaked into non-dev config | Set the real, publicly reachable origin instead |

None of these errors expose a secret — they only ever echo back the (public,
non-sensitive) `EXPO_PUBLIC_*` value that was already wrong, and nothing here is ever
written to a console log.

**Known unresolved configuration:** the real production/preview backend API origin is
**not yet confirmed**. As of 2026-09-08, `https://flacronai.com` was directly checked
(safe, unauthenticated GET requests to `/api/v1`, `/api/`, and `/health`) and confirmed to
be Vercel's static frontend (returns the SPA's HTML for every path) — **it is not a
reverse-proxied backend and must not be used as the mobile API origin.** No AWS ALB DNS
name or custom domain in front of the backend's ECS service is documented anywhere in
this repository. This is an **external infrastructure dependency** — it requires
confirmation from whoever owns the AWS ECS service's networking (an ALB DNS name, or a
custom domain pointed at one), not something resolvable from inside this repository. See
[`MOBILE_DEVELOPMENT_PHASES.md`](./MOBILE_DEVELOPMENT_PHASES.md) §10 item 1 for what's
needed to resolve this.

**Future preview/production configuration (once the real origin above is confirmed)** —
shown with an obviously fake placeholder host, never a real one:

```bash
# Run once per profile, by whoever manages the EAS project, after the real HTTPS origin
# is confirmed. Illustrative only — "your-real-confirmed-host.example" below is a stand-in,
# never a value to copy as-is:
eas env:create --scope project --environment preview \
  --name EXPO_PUBLIC_API_BASE_URL --value https://your-real-confirmed-host.example/api/v1 \
  --visibility plaintext

eas env:create --scope project --environment production \
  --name EXPO_PUBLIC_API_BASE_URL --value https://your-real-confirmed-host.example/api/v1 \
  --visibility plaintext
```

`env.ts` will reject a value shaped like the placeholder above (it matches the
placeholder patterns it screens for) — this is intentional, so a real value must
genuinely be substituted in, not left as a copy-pasted example.

## EAS commands (documented only — do not run without approval)

The commands below are documented for reference. **Do not run a build, submission, or
update without explicit approval** — this foundation phase does not include any of that.

```bash
# Verify identity before ANY of the commands below — must resolve to laibanoreen /
# flacron-enterprises-llc, not a personal account:
npx eas-cli@latest whoami

# Development build (internal distribution, dev client)
eas build --profile development --platform all

# Preview build for QA (internal distribution)
eas build --profile preview --platform all

# Production build (store-ready)
eas build --profile production --platform all

# Store submission — separate, explicit approval required, not part of a build command
eas submit --platform ios
eas submit --platform android
```

## Authentication (Phase 3)

`src/features/auth/` — Firebase Client SDK for identity (RN persistence), native
Google/Apple credential exchange into Firebase, the existing backend REST API reused for
profile/MFA/audit only. Full architecture, security verification, and exact current gaps:
[`AUTHENTICATION_ARCHITECTURE.md`](./AUTHENTICATION_ARCHITECTURE.md) §11.

### Firebase setup (required before the app can do anything beyond "Configuration required")

1. Register an iOS **and** Android "app" against the existing `flacronai` Firebase project
   (Firebase console access required — not something this repo can do for you).
2. Copy the resulting config values into your own git-ignored `.env.local`:
   `EXPO_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`,
   `_MESSAGING_SENDER_ID`, `_APP_ID` (see `.env.example` for the exact names — never real
   values there).
3. Until this is done, the app correctly shows a "Configuration required" screen instead
   of crashing or silently misbehaving (`src/config/firebaseConfig.ts` +
   `src/features/auth/screens/ConfigRequiredScreen.tsx`) — this is by design, not a bug.

### Google / Apple sign-in setup (optional — both are safely disabled until configured)

- **Google**: needs a Google OAuth client ID (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in
  `.env.local`) from Google Cloud/Firebase console, **and** an EAS development build — it
  does not work in Expo Go (`@react-native-google-signin/google-signin` is a native module
  Expo Go can't load; the button stays disabled with a "setup required" label until
  configured, and the app never attempts a call without it).
- **Apple** (iOS only): needs the "Sign In with Apple" capability enabled on the App ID in
  the Apple Developer portal, plus the Apple provider configured in the Firebase console.
  Unlike Google, the native picker itself **is** testable directly in Expo Go on iOS
  (`expo-apple-authentication` is a first-party Expo module that degrades gracefully) —
  but a real Firebase sign-in still needs the capability/provider configuration above.

Full itemized list (including the EAS dev-build/SHA-fingerprint details) in
`AUTHENTICATION_ARCHITECTURE.md` §11.8.

## Secret-handling rules (summary — full rules in the phase tracker §11)

1. Never commit passwords, API secrets, Firebase admin credentials, service-account JSON,
   Apple/Google credentials, signing certificates, provisioning profiles, keystores,
   tokens, or a real `.env` file.
2. A mobile app is a public client — it must never contain private backend secrets.
3. Only explicitly safe client configuration uses `EXPO_PUBLIC_*` variables.
4. Real environment values live only in approved local/EAS secret storage.
5. Reuse the existing backend only through verified APIs; never invent endpoints.
6. Commit, push, PR, merge, build, and submit only ever happen on explicit request.

## Architecture

See the "Folder Structure" section of
[`MOBILE_DEVELOPMENT_PHASES.md`](./MOBILE_DEVELOPMENT_PHASES.md) (§7) for the full
rationale behind the `app/` + `src/{components,features,services,hooks,store,theme,types,
utils}` layout and how it is expected to grow phase by phase.
