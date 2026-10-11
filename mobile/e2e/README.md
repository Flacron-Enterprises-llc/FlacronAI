# Cloud device tests (Phase 10) — how to re-run

Maestro flows: `mobile/.maestro/`. They run against a **local, emulator-backed test backend** (Firebase
Auth/Firestore/Storage emulators, `demo-` project — never production) reached through temporary
Cloudflare quick tunnels. Free EAS limits: 60 CI minutes/month (reset on the 1st), 15 Android + 15 iOS
builds; the `maestro` job type needs a paid plan, so the templates below use plain custom jobs.

1. **Build once** (only when app code changes): `eas build -p android --profile e2e` and
   `eas build -p ios --profile e2e` (iOS = simulator build, no Apple credentials). The `e2e` profile sets
   `EXPO_PUBLIC_E2E_RUNTIME_CONFIG=1`, so the test app takes its endpoints from a launch link instead of
   baking tunnel URLs in (quick tunnels live 40–100 min — shorter than a build).
2. Start the local stack: emulators (`demo-flacronai-e2e`), backend in `FIREBASE_EMULATOR` mode, then one
   quick tunnel each for the API (port 3000) and the Auth emulator (port 9099).
3. Create disposable verified users in the Auth emulator and replace `${E2E_PASSWORD_A|B|D}` in the flows;
   replace `${E2E_CONFIG_LINK}` with
   `flacronai://e2e-config?api=<urlencoded API tunnel>&auth=<urlencoded Auth tunnel>`.
4. Copy `workflows/*.yml` to `mobile/.eas/workflows/`, set `build_id`, run
   `eas workflow:run .eas/workflows/<file>.yml`. Results/screenshots/logcat are uploaded as artifacts.
5. **Clean up afterwards:** stop tunnels/backend/emulators (no export ⇒ test data destroyed), delete
   `.eas/workflows/`, put the `${...}` placeholders back in the flows.
