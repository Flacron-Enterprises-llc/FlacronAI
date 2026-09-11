# src/config/

Environment/configuration resolution — not an API client, not a feature. Contains `env.ts`
(Phase 2 — Configuration & Environment Preparation; URL-target validation corrected in the
Phase 2 addendum) and `firebaseConfig.ts` (Phase 3 — Authentication, 2026-09-08):
resolves/validates the `EXPO_PUBLIC_FIREBASE_*` Firebase Web SDK config, same fail-fast
style as `env.ts` but with no safe fallback (unlike the API base URL, there is no "local
default" for a Firebase project config — either it's present or auth genuinely can't
work). See `mobile/src/services/firebase/client.ts` for where it's actually consumed.

## Convention

- Reads only `EXPO_PUBLIC_*`-prefixed variables (see `mobile/.env.example` and
  `mobile/MOBILE_DEVELOPMENT_PHASES.md` §9 for the full public/private policy).
- Fails loudly (throws a clear, actionable `Error`) on missing or invalid required
  configuration — never silently falls back to a guessed or production-looking value.
- Contains no API calls, no React, no navigation, and no `react-native`/`expo-*` imports —
  pure, dependency-free config resolution, safe to import from anywhere (including very
  early app startup) without side effects, and directly runnable/testable under plain
  Node (no Metro/RN runtime needed). This is deliberate: it means the module cannot
  auto-detect "am I on an Android Emulator?" via `Platform.OS`, so per-target defaults are
  documented in `mobile/README.md` instead of guessed here — see `env.ts`'s file header.
- `env.ts` does not hardcode a production API origin: it isn't confirmed yet (see phase
  tracker §10 item 1 and `WEB_TO_MOBILE_REUSE_STRATEGY.md` §2.2). Do not add one here
  without an explicit, verified value.
- `env.ts`'s development-mode `localhost` fallback is intentionally narrow: it is only
  correct for the iOS Simulator and Expo web. The Android Emulator and physical devices
  must set `EXPO_PUBLIC_API_BASE_URL` explicitly — never assume `localhost` "just works"
  for every target when writing code that reads this module's output.
- `getApiBaseUrl()` validates HTTPS-vs-HTTP and local/private-vs-public hostnames using
  small, exported, independently testable helpers (`isLocalOrPrivateHost`,
  `looksLikePlaceholder`) rather than a general-purpose URL/IP library — keep any future
  change here similarly minimal; this is deliberately not a full URL-validation framework.
