import type { ExpoConfig } from 'expo/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertQaBuildEnv } = require('./build-guards/qaProfileGuard');

// FlacronAI mobile app configuration.
//
// All identifiers below are client-confirmed (see mobile/MOBILE_DEVELOPMENT_PHASES.md §2)
// and must not change without client sign-off. This file intentionally configures
// identity/build metadata only — no authentication, API base URL usage, or feature
// wiring belongs here (see Phase boundaries in the phase tracker).

// Set per EAS build profile in eas.json (`EXPO_PUBLIC_APP_ENV`); absent for local dev.
const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV;

// QA handover build (eas.json profile `qa` sets FLACRON_BUILD_PROFILE=qa): fail the
// build unless every Firebase/API value is the staging one and no E2E/test hook is on
// (the shared `preview` EAS environment carries production values). The verified
// values are stamped into `extra.qaBuild`, which ships inside the APK's embedded app
// config so the final artifact can be checked too.
const QA_BUILD = process.env.FLACRON_BUILD_PROFILE === 'qa' ? assertQaBuildEnv(process.env) : undefined;
// QA builds: 1.1.x = production-account sign-in (QA federation). The workflow passes an
// ever-increasing QA_VERSION_CODE so each distributed APK has a distinct build number.
const QA_VERSION_CODE = QA_BUILD ? Number(process.env.QA_VERSION_CODE) || 2 : undefined;

const config: ExpoConfig = {
  name: 'FlacronAI',
  slug: 'flacronai',
  owner: 'flacron-enterprises-llc',
  version: QA_BUILD ? '1.1.0' : '1.0.0',
  scheme: 'flacronai',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',

  ios: {
    bundleIdentifier: 'com.flacronenterprises.flacronai',
    supportsTablet: true,
    // The default Expo template's newer "Icon Composer" (.icon bundle) format was
    // deliberately not used here — there is no real multi-layer icon source asset for
    // it yet. The classic universal `icon` field above is used for iOS as well as
    // Android/web. Revisit as an optional visual-polish item in the Store Preparation
    // phase, not before.

    // Sign in with Apple (Phase 3 — Authentication). Safe to enable now: this is a plain
    // capability flag, not a secret/credential — it requires no OAuth client ID, no
    // GoogleService-Info.plist-equivalent file, and no console access to add. It does
    // still require the matching "Sign In with Apple" capability to be enabled on the
    // App ID in the Apple Developer portal before a real (non-Expo-Go) build can use it —
    // see AUTHENTICATION_ARCHITECTURE.md §7 for that remaining manual step.
    usesAppleSignIn: true,
  },

  android: {
    package: 'com.flacronenterprises.flacronai',
    ...(QA_VERSION_CODE ? { versionCode: QA_VERSION_CODE } : {}),
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundColor: '#FFFFFF',
    },
    // Tablet support on Android is a responsive-layout and testing concern, not a
    // config flag — no restrictive screen-size or orientation lock is applied here.
    // Phase 10: the app never draws over other apps; the template's overlay permission
    // would otherwise appear in the store listing / Data safety review.
    blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW'],
    // QA build only: FCM config for push (the native SDK needs it to issue the device token
    // behind the Expo push token). CI writes the staging file from an environment secret and
    // the QA guard verifies it is staging; nothing is committed to the repo.
    ...(QA_BUILD && process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
  },

  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 220,
        backgroundColor: '#FFFFFF',
      },
    ],
    // Sign in with Apple (Phase 3) — safe to enable now, see the ios.usesAppleSignIn
    // comment above.
    'expo-apple-authentication',
    // Google Sign-In (Phase 3, 2026-09-09) — the "without Firebase" plugin variant
    // (options object present): only sets the iOS URL scheme Google's native SDK needs to
    // receive the OAuth redirect, derived from the iOS Firebase app's own
    // GoogleService-Info.plist REVERSED_CLIENT_ID (a public identifier, not a secret —
    // same status as the bundle ID). Deliberately NOT the plain `'@react-native-google-signin/google-signin'`
    // string form: that variant reads `ios.googleServicesFile`/`android.googleServicesFile`
    // instead and requires committing both native config files into the repo, which this
    // app's architecture avoids (see AUTHENTICATION_ARCHITECTURE.md §11.8a/§14 — plain
    // `firebase` JS SDK, no `@react-native-firebase`, no native Google config files needed).
    // Android needs no config-plugin entry at all for this variant: its native SDK verifies
    // the calling app against Google Cloud's registered SHA-1/package at sign-in time, not
    // from a bundled file.
    [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme: 'com.googleusercontent.apps.773892679617-12lrqave8s8l37gt87irhj8kaura2g64',
      },
    ],
    // MFA server-side enforcement (2026-09-08 fix, AUTHENTICATION_ARCHITECTURE.md §12) —
    // Keychain/Keystore-backed storage for the short-lived MFA session assertion. No
    // plugin options set: this app never uses SecureStore's optional Face ID-gated
    // `requireAuthentication` mode. Phase 10: the plugin otherwise adds a generic
    // NSFaceIDUsageDescription for a capability the app never uses — removed (`false`).
    ['expo-secure-store', { faceIDPermission: false }],
    // Phase 5 — Core Dashboard Feature Parity: the generate-report wizard's Photos step
    // needs both camera capture and photo-library selection. Custom, specific permission
    // strings (not the generic template defaults) so the OS prompt tells the person why
    // FlacronAI needs each permission.
    [
      'expo-image-picker',
      {
        photosPermission: 'FlacronAI needs access to your photos so you can attach inspection photos to a report.',
        cameraPermission: 'FlacronAI needs access to your camera so you can photograph damage directly into a report.',
        // The wizard only ever captures still photos (mediaTypes: ['images'] in
        // useImageCapture.ts) — never video/live photos — so the plugin's default
        // microphone permission (needed only for video capture) is explicitly declined
        // rather than requesting more than this app actually uses.
        microphonePermission: false,
      },
    ],
    // Phase 5 — lets a finalized report export (PDF/DOCX) be saved and shared via the
    // native share sheet after an authenticated download. No extra options needed.
    'expo-sharing',
    // Phase 6 — Push Notifications (Expo push service; see MOBILE_DEVELOPMENT_PHASES.md §5).
    // `defaultChannel` matches ANDROID_CHANNEL_ID in src/features/push/pushProvider.ts. iOS
    // `aps-environment` follows the EAS profile: internal-distribution `preview` and store
    // `production` builds talk to APNs production; dev-client builds use the sandbox.
    // Android small icon (Phase 10): 96×96 white-on-transparent FA silhouette derived from
    // brand-mark.png's alpha channel; Android tints it with `color`.
    [
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        color: '#FD4403',
        defaultChannel: 'report-activity',
        mode: APP_ENV === 'preview' || APP_ENV === 'production' ? 'production' : 'development',
      },
    ],
    // Phase 7 — StoreKit 2 / Google Play Billing (wires the Play Billing Gradle dependency; its
    // manifest contributes the BILLING permission at build time). Native: requires a
    // development/production build, never Expo Go.
    'expo-iap',
  ],

  experiments: {
    typedRoutes: true,
  },

  // Ties runtime compatibility for EAS Update to the actual native fingerprint of this
  // config + the installed dependencies, instead of a manually-bumped version number.
  // This is Expo's current recommended default — unvalidated against a real EAS Update
  // or native build in this foundation phase (see decisions log).
  runtimeVersion: {
    policy: 'fingerprint',
  },

  extra: {
    ...(QA_BUILD ? { qaBuild: QA_BUILD } : {}),
    eas: {
      projectId: 'c8227fa0-8a62-4e51-8ccc-c8feb58d0466',
    },
  },
};

export default config;
