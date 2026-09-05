# FlacronAI Mobile

Native companion app to the FlacronAI web platform (`../frontend`, `../backend`) —
insurance inspection report generation, reviewed and approved by a human before export.
This directory is a fully isolated Expo project: its own `package.json`, lockfile,
TypeScript config, lint config, and ignore rules. It shares **no** dependencies, build
tooling, or `node_modules` with `frontend/` or `backend/`, and there is no root npm
workspace tying them together.

> **Status: foundation phase complete.** This is a branded placeholder app — no
> authentication, no API integration, no real feature is implemented yet. EAS
> authentication and project ownership have been verified (see below). See
> [`MOBILE_DEVELOPMENT_PHASES.md`](./MOBILE_DEVELOPMENT_PHASES.md) for the full phase plan,
> current status, decisions, and open questions. Read that file before doing any further
> mobile work.

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
```

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
- **Never** place Firebase admin credentials, backend secrets/private API keys, Apple
  credentials, Google credentials, signing certificates, provisioning profiles, keystores,
  service-account JSON files, or a real `.env` file anywhere in `mobile/`.
- Real secret values live only in a local `.env.local` (git-ignored) or in EAS secret
  storage (`eas secret:create`) — never in the repository.
- The production backend API base URL is **not yet confirmed** (see phase tracker §2) —
  `.env.example` intentionally documents this as an open item rather than a guess.

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
